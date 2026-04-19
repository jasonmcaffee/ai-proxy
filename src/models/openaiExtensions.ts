import type { ChatCompletionCreateParamsNonStreaming, ChatCompletionCreateParamsStreaming } from 'openai/resources/chat/completions';

/** Extra fields llama.cpp accepts beyond the OpenAI standard */
export type LlamaExtras = {
  chat_template_kwargs?: { enable_thinking?: boolean };
};

export type LlamaParamsNonStreaming = ChatCompletionCreateParamsNonStreaming & LlamaExtras;
export type LlamaParamsStreaming = ChatCompletionCreateParamsStreaming & LlamaExtras;
export type LlamaParams = LlamaParamsNonStreaming | LlamaParamsStreaming;
