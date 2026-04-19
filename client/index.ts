import { Configuration, ModelsApi } from './generated';
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletion,
  ChatCompletionChunk,
} from 'openai/resources/chat/completions';
import type { ProxyExtensions } from './proxyExtensions';

type CreateParamsNonStreaming = Omit<ChatCompletionCreateParamsNonStreaming, 'stream'> & ProxyExtensions & { stream?: false | null };
type CreateParamsStreaming = Omit<ChatCompletionCreateParamsStreaming, 'stream'> & ProxyExtensions & { stream: true };
type CreateParams = CreateParamsNonStreaming | CreateParamsStreaming;

/**
 * Sends a chat completion request directly via fetch.
 * Bypasses the generated client's camelCase mappers — OpenAI params are already
 * the correct snake_case wire format so JSON.stringify produces the right body.
 * @param baseURL - proxy base URL (e.g. http://localhost:4142)
 * @param params - OpenAI-compatible request params including proxy extensions
 */
async function postChatCompletion(baseURL: string, params: CreateParams): Promise<Response> {
  const res = await fetch(`${baseURL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ai-proxy ${res.status}: ${text}`);
  }
  return res;
}

/** Provides openai-SDK-compatible chat.completions.create() against the ai-proxy server. */
class Completions {
  constructor(private readonly baseURL: string) {}

  /**
   * Creates a chat completion. Non-streaming resolves to ChatCompletion;
   * streaming resolves to AsyncIterable<ChatCompletionChunk>.
   * @param params - OpenAI-compatible params plus optional proxy extensions
   */
  create(params: CreateParamsStreaming): Promise<AsyncIterable<ChatCompletionChunk>>;
  create(params: CreateParamsNonStreaming): Promise<ChatCompletion>;
  async create(params: CreateParams): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>> {
    const res = await postChatCompletion(this.baseURL, params);
    return res.json() as Promise<ChatCompletion>;
  }
}

/**
 * OpenAI-SDK-compatible client for the ai-proxy server.
 * Usage mirrors the official openai npm package for the endpoints we implement.
 */
export default class OpenAI {
  readonly chat: { completions: Completions };
  readonly models: ModelsApi;

  constructor(opts: { baseURL: string; apiKey?: string }) {
    const cfg = new Configuration({ basePath: opts.baseURL, apiKey: opts.apiKey });
    this.chat = { completions: new Completions(opts.baseURL) };
    this.models = new ModelsApi(cfg);
  }
}

// Re-export OpenAI's canonical types so consumers don't need a parallel vocabulary.
export type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
} from 'openai/resources/chat/completions';
export type { ProxyExtensions } from './proxyExtensions';

// Re-export generated API classes for lower-level access if needed.
export { Configuration, ModelsApi } from './generated';
export { ChatCompletionsApi } from './generated';
