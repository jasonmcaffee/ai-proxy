import { Injectable, Logger } from '@nestjs/common';
import { Readable } from 'stream';

const LLAMA_BASE_URL = process.env.LLAMA_BASE_URL || 'http://localhost:8080';

export type ChatMessage = {
  role: string;
  content?: string | unknown[];
  tool_calls?: unknown[];
  tool_call_id?: string;
};

export type CountTokensPayload = {
  systemPrompt: string;
  messages: ChatMessage[];
  tools?: unknown[];
};

/**
 * Thin HTTP wrapper around the llama.cpp OpenAI-compatible API.
 * Handles non-stream completions, SSE streaming, and token counting.
 */
@Injectable()
export class LlamaForwarderService {
  private readonly logger = new Logger(LlamaForwarderService.name);

  /**
   * Sends a non-streaming chat completion request to llama.cpp.
   * @param payload - OpenAI-compatible chat completion body
   */
  async chatCompletion(payload: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${LLAMA_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, stream: false }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`llama.cpp error: ${res.status} ${text}`);
    }
    return res.json();
  }

  /**
   * Sends a streaming chat completion request to llama.cpp and returns a Node Readable stream of SSE bytes.
   * @param payload - OpenAI-compatible chat completion body
   */
  async chatCompletionStream(payload: Record<string, unknown>): Promise<Readable> {
    const res = await fetch(`${LLAMA_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, stream: true }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`llama.cpp stream error: ${res.status} ${text}`);
    }
    return Readable.fromWeb(res.body as any);
  }

  /**
   * Counts tokens for the given context by calling llama.cpp /v1/messages/count_tokens.
   * Applies quirk workarounds: appends a placeholder user message when messages are empty or end with assistant.
   * @param param0 - system prompt, messages, and optional tools
   */
  async countTokens({ systemPrompt, messages, tools }: CountTokensPayload): Promise<number> {
    let msgs = [...messages];
    const lastRole = msgs.length > 0 ? msgs[msgs.length - 1].role : null;
    if (msgs.length === 0 || lastRole === 'assistant') {
      msgs = [...msgs, { role: 'user', content: ' ' }];
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
