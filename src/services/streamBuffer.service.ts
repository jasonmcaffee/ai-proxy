import { Injectable, Logger } from '@nestjs/common';
import { Readable, PassThrough } from 'stream';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { LlamaParamsStreaming } from '../models/openaiExtensions';
import { LlamaForwarderService } from './llamaForwarder.service';
import { parseSseLine, encodeSseLine, parseSseJson } from '../utils/sse';

type StreamChunk = {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      reasoning_content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
};

/**
 * Handles streaming chat completions from llama.cpp with optional tool-call buffering.
 * When awaitToolCallCompletion is true, tool-call deltas are accumulated and emitted as a single chunk.
 * Detects reasoning-only stream endings and attempts end-of-stream recovery.
 */
@Injectable()
export class StreamBufferService {
  private readonly logger = new Logger(StreamBufferService.name);

  constructor(private readonly forwarder: LlamaForwarderService) {}

  /**
   * Creates a passthrough stream that pipes llama.cpp SSE output to the client.
   * @param params - typed streaming chat completion params
   * @param awaitToolCallCompletion - if true, buffer tool-call deltas into one chunk
   * @param signal - optional AbortSignal; aborts the upstream llama.cpp request when fired
   */
  async pipe(params: LlamaParamsStreaming, awaitToolCallCompletion: boolean, signal?: AbortSignal): Promise<{ stream: PassThrough; recoveryCount: number }> {
    const output = new PassThrough();
    let recoveryCount = 0;

    const upstreamStream = await this.forwarder.chatCompletionStream(params, signal);
    recoveryCount = await this.processStream(upstreamStream, output, params, awaitToolCallCompletion, signal);

    return { stream: output, recoveryCount };
  }

  /**
   * Processes an upstream SSE stream, optionally buffering tool calls, and pipes to output.
   * @param upstream - readable stream of SSE bytes from llama.cpp
   * @param output - passthrough stream to write processed SSE to
   * @param params - original streaming params for recovery retry
   * @param awaitToolCallCompletion - whether to buffer tool-call deltas
   * @param signal - optional AbortSignal; destroys both streams when fired
   */
  private async processStream(upstream: Readable, output: PassThrough, params: LlamaParamsStreaming, awaitToolCallCompletion: boolean, signal?: AbortSignal): Promise<number> {
    const toolCallBuffers: Map<number, { id?: string; type?: string; name?: string; arguments: string }> = new Map();
    let accumulatedReasoningContent = '';
    let accumulatedContent = '';
    let hasToolCalls = false;
    let lastChunkTemplate: StreamChunk | null = null;

    return new Promise((resolve, reject) => {
      let buffer = '';

      signal?.addEventListener('abort', () => {
        upstream.destroy();
        output.destroy();
        resolve(0);
      });

      upstream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          const data = parseSseLine(trimmed);
          if (data === null) continue;
          if (data === '[DONE]') continue;

          const parsed = parseSseJson<StreamChunk>(data);
          if (!parsed) {
            output.write(encodeSseLine(data));
            continue;
          }

          lastChunkTemplate = parsed;
          const choice = parsed.choices?.[0];
          if (!choice) {
            output.write(encodeSseLine(data));
            continue;
          }

          const delta = choice.delta ?? {};

          if (delta.reasoning_content) accumulatedReasoningContent += delta.reasoning_content;
          if (delta.content) accumulatedContent += delta.content;

          if (delta.tool_calls?.length) {
            hasToolCalls = true;
            for (const tc of delta.tool_calls) {
              const existing = toolCallBuffers.get(tc.index) ?? { arguments: '' };
              if (tc.id) existing.id = tc.id;
              if (tc.type) existing.type = tc.type;
              if (tc.function?.name) existing.name = tc.function.name;
              if (tc.function?.arguments) existing.arguments += tc.function.arguments;
              toolCallBuffers.set(tc.index, existing);
            }

            if (awaitToolCallCompletion) continue;
          }

          if (choice.finish_reason === 'tool_calls' && awaitToolCallCompletion) {
            const consolidatedChunk = buildConsolidatedToolCallChunk(parsed, toolCallBuffers);
            output.write(encodeSseLine(JSON.stringify(consolidatedChunk)));
            continue;
          }

          output.write(encodeSseLine(data));
        }
      });

      upstream.on('end', async () => {
        const noContent = !accumulatedContent.trim();
        const onlyReasoning = noContent && accumulatedReasoningContent.trim() && !hasToolCalls;

        if (onlyReasoning && lastChunkTemplate) {
          this.logger.warn('Stream ended with reasoning-only content, attempting recovery...');
          try {
            const recovery = await this.attemptStreamRecovery(params, accumulatedReasoningContent, output);
            output.write(encodeSseLine('[DONE]'));
            output.end();
            resolve(recovery ? 1 : 0);
          } catch (e) {
            this.logger.error('Stream recovery failed', e);
            output.write(`event: error\ndata: ${JSON.stringify({ message: 'stream recovery failed' })}\n\n`);
            output.write(encodeSseLine('[DONE]'));
            output.end();
            resolve(0);
          }
        } else {
          output.write(encodeSseLine('[DONE]'));
          output.end();
          resolve(0);
        }
      });

      upstream.on('error', (err) => {
        output.destroy(err);
        reject(err);
      });
    });
  }

  /**
   * Retries the request with a recovery user message appended and pipes new stream to output.
   * @param params - original streaming params
   * @param reasoningContent - accumulated reasoning content from failed stream
   * @param output - stream to write recovery output to
   */
  private async attemptStreamRecovery(params: LlamaParamsStreaming, reasoningContent: string, output: PassThrough): Promise<boolean> {
    const recoveryText = `You reasoned but did not respond with content or a tool call. Here is your reasoning: ${reasoningContent}. Please continue.`;
    const messages: ChatCompletionMessageParam[] = [...params.messages, { role: 'user' as const, content: recoveryText }];
    const recoveryParams: LlamaParamsStreaming = { ...params, messages, stream: true };

    const upstream = await this.forwarder.chatCompletionStream(recoveryParams);

    return new Promise((resolve) => {
      let buffer = '';
      upstream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const data = parseSseLine(line.trim());
          if (data && data !== '[DONE]') {
            output.write(encodeSseLine(data));
          }
        }
      });
      upstream.on('end', () => resolve(true));
      upstream.on('error', () => resolve(false));
    });
  }
}

/**
 * Builds a single consolidated SSE chunk with fully assembled tool_calls from the buffer.
 * @param template - the final stream chunk to use as the shape template
 * @param toolCallBuffers - accumulated tool call fragments keyed by index
 */
function buildConsolidatedToolCallChunk(template: StreamChunk, toolCallBuffers: Map<number, { id?: string; type?: string; name?: string; arguments: string }>): StreamChunk {
  const toolCalls = Array.from(toolCallBuffers.entries())
    .sort(([a], [b]) => a - b)
    .map(([index, tc]) => ({
      index,
      id: tc.id ?? `call_${index}`,
      type: tc.type ?? 'function',
      function: { name: tc.name ?? '', arguments: tc.arguments },
    }));

  return {
    ...template,
    choices: [{
      index: 0,
      delta: { tool_calls: toolCalls },
      finish_reason: 'tool_calls',
    }],
  };
}
