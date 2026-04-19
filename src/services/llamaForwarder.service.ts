import { Injectable, Logger } from '@nestjs/common';
import { Readable } from 'stream';
import OpenAI from 'openai';
import type { ChatCompletion, ChatCompletionChunk, ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { Stream } from 'openai/streaming';
import type { LlamaParamsNonStreaming, LlamaParamsStreaming } from '../models/openaiExtensions';

const LLAMA_BASE_URL = process.env.LLAMA_BASE_URL || 'http://localhost:8080';

export type CountTokensPayload = {
  systemPrompt: string;
  messages: ChatCompletionMessageParam[];
  tools?: unknown[];
};

/**
 * Thin wrapper around the llama.cpp OpenAI-compatible API using the OpenAI SDK.
 * Handles non-stream completions, SSE streaming, and token counting.
 */
@Injectable()
export class LlamaForwarderService {
  private readonly logger = new Logger(LlamaForwarderService.name);

  private readonly openai = new OpenAI({
    baseURL: `${LLAMA_BASE_URL}/v1`,
    apiKey: process.env.LLAMA_API_KEY || 'not-needed',
  });

  /**
   * Sends a non-streaming chat completion request to llama.cpp via the OpenAI SDK.
   * @param params - typed chat completion params including any llama.cpp extras
   * @param signal - optional AbortSignal to cancel the request
   */
  async chatCompletion(params: LlamaParamsNonStreaming, signal?: AbortSignal): Promise<ChatCompletion> {
    return this.openai.chat.completions.create({ ...params, stream: false }, { signal }) as Promise<ChatCompletion>;
  }

  /**
   * Sends a streaming chat completion request and returns a Node Readable of SSE bytes.
   * The SDK async iterable is re-serialized to SSE so downstream consumers stay unchanged.
   * @param params - typed streaming chat completion params
   * @param signal - optional AbortSignal to cancel the request
   */
  async chatCompletionStream(params: LlamaParamsStreaming, signal?: AbortSignal): Promise<Readable> {
    const stream = await this.openai.chat.completions.create({ ...params, stream: true }, { signal }) as Stream<ChatCompletionChunk>;
    return sseStreamToReadable(stream, signal);
  }

  /**
   * Counts tokens for the given context by calling llama.cpp /v1/messages/count_tokens.
   * Applies quirk workarounds: appends a placeholder user message when messages are empty or end with assistant.
   * @param payload - system prompt, messages, and optional tools
   */
  async countTokens({ systemPrompt, messages, tools }: CountTokensPayload): Promise<number> {
    let msgs = [...messages];
    const lastRole = msgs.length > 0 ? msgs[msgs.length - 1].role : null;
    if (msgs.length === 0 || lastRole === 'assistant') {
      msgs = [...msgs, { role: 'user' as const, content: ' ' }];
    }

    const body: Record<string, unknown> = {
      model: 'local-model',
      system: systemPrompt,
      messages: msgs,
    };
    if (tools?.length) body.tools = tools;

    const res = await fetch(`${LLAMA_BASE_URL}/v1/messages/count_tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`count_tokens failed: ${res.status} ${text}`);
    }
    const data = await res.json() as { input_tokens: number };
    this.logger.debug(`countTokens: ${data.input_tokens}`);
    return data.input_tokens;
  }
}

/**
 * Converts an OpenAI SDK async-iterable stream into a Node Readable of SSE bytes.
 * Re-serializes each chunk as "data: {...}\n\n" so StreamBufferService can parse it unchanged.
 * @param stream - SDK stream of ChatCompletionChunks
 * @param signal - optional AbortSignal; stops iteration when aborted
 */
function sseStreamToReadable(stream: Stream<ChatCompletionChunk>, signal?: AbortSignal): Readable {
  return Readable.from((async function* () {
    try {
      for await (const chunk of stream) {
        if (signal?.aborted) return;
        yield Buffer.from(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      yield Buffer.from('data: [DONE]\n\n');
    } catch (e) {
      if (!signal?.aborted) throw e;
    }
  })());
}
