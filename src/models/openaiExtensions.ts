import type { ChatCompletionCreateParamsNonStreaming, ChatCompletionCreateParamsStreaming } from 'openai/resources/chat/completions';

/**
 * Extra fields llama.cpp accepts beyond the OpenAI standard. These are handed straight to the Jinja
 * chat template, so what is valid here depends entirely on the template the server was launched with.
 * `reasoning_effort` is Qwen 3.8's reasoning-effort control (task-1562) — note the template RAISES on
 * an unexpected value, which fails the whole request, so callers must send one of the three or nothing.
 */
export type LlamaExtras = {
  chat_template_kwargs?: { enable_thinking?: boolean; reasoning_effort?: 'low' | 'medium' | 'xhigh' };
};

export type LlamaParamsNonStreaming = ChatCompletionCreateParamsNonStreaming & LlamaExtras;
export type LlamaParamsStreaming = ChatCompletionCreateParamsStreaming & LlamaExtras;
export type LlamaParams = LlamaParamsNonStreaming | LlamaParamsStreaming;
