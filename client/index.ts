import { Configuration, ModelsApi } from './generated';
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletion,
  ChatCompletionChunk,
} from 'openai/resources/chat/completions';
import type { ProxyExtensions } from './proxyExtensions';

export type ImageGenerateParams = {
  prompt: string;
  /** Proxy extension: negative prompt for things to avoid in the image */
  negativePrompt?: string;
  model?: string | null;
  n?: number | null;
  size?: string | null;
  response_format?: 'url' | 'b64_json' | null;
  quality?: string | null;
  style?: string | null;
};
export type ImageData = { b64_json?: string; url?: string; revised_prompt?: string };
export type ImagesResponse = { created: number; data: ImageData[] };

type RequestOpts = { signal?: AbortSignal };
type CreateParamsNonStreaming = Omit<ChatCompletionCreateParamsNonStreaming, 'stream'> & ProxyExtensions & { stream?: false | null };
type CreateParamsStreaming = Omit<ChatCompletionCreateParamsStreaming, 'stream'> & ProxyExtensions & { stream: true };
type CreateParams = CreateParamsNonStreaming | CreateParamsStreaming;

/**
 * POSTs to the proxy's chat completions endpoint with the given params as the JSON body.
 * OpenAI params are already snake_case wire format, so JSON.stringify is correct directly.
 * @param baseURL - proxy base URL (e.g. http://localhost:4142)
 * @param params - request body
 * @param signal - optional AbortSignal
 */
async function postChatCompletion(baseURL: string, params: CreateParams, signal?: AbortSignal): Promise<Response> {
  const res = await fetch(`${baseURL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ai-proxy ${res.status}: ${text}`);
  }
  return res;
}

/**
 * Converts a streaming fetch Response with SSE body into an AsyncIterable of ChatCompletionChunks.
 * Stops on [DONE] or when the signal is aborted.
 * @param res - streaming fetch Response
 * @param signal - optional AbortSignal; cancels the reader when fired
 */
async function* sseToAsyncIterable(res: Response, signal?: AbortSignal): AsyncGenerator<ChatCompletionChunk> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) break;

      let done: boolean;
      let value: Uint8Array | undefined;
      try {
        ({ done, value } = await reader.read());
      } catch {
        break; // read cancelled (e.g. caller broke out of for-await)
      }
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice('data: '.length).trim();
        if (data === '[DONE]') return;
        try {
          yield JSON.parse(data) as ChatCompletionChunk;
        } catch { /* skip malformed */ }
      }
    }
  } finally {
    try { reader.cancel(); } catch { /* ignore cancel errors */ }
  }
}

/** Provides openai-SDK-compatible images.generate() against the ai-proxy server. */
class Images {
  constructor(private readonly baseURL: string) {}

  /**
   * Generates an image using the ai-proxy ComfyUI backend and returns the result in OpenAI format.
   * Always returns b64_json. negativePrompt is a proxy extension not in the official OpenAI SDK.
   * @param params - image generation params; negativePrompt is a proxy extension
   */
  async generate(params: ImageGenerateParams): Promise<ImagesResponse> {
    const res = await fetch(`${this.baseURL}/v1/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ai-proxy ${res.status}: ${text}`);
    }
    return res.json() as Promise<ImagesResponse>;
  }
}

/** Provides openai-SDK-compatible chat.completions.create() against the ai-proxy server. */
class Completions {
  constructor(private readonly baseURL: string) {}

  /**
   * Creates a chat completion. Streaming overload returns AsyncIterable of chunks;
   * non-streaming returns the full ChatCompletion response.
   * @param params - OpenAI-compatible params plus optional proxy extensions
   * @param opts - optional request options including AbortSignal
   */
  create(params: CreateParamsStreaming, opts?: RequestOpts): Promise<AsyncIterable<ChatCompletionChunk>>;
  create(params: CreateParamsNonStreaming, opts?: RequestOpts): Promise<ChatCompletion>;
  async create(params: CreateParams, opts?: RequestOpts): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>> {
    const res = await postChatCompletion(this.baseURL, params, opts?.signal);
    if (params.stream) {
      return sseToAsyncIterable(res, opts?.signal);
    }
    return res.json() as Promise<ChatCompletion>;
  }
}

/**
 * OpenAI-SDK-compatible client for the ai-proxy server.
 * Usage mirrors the official openai npm package for the endpoints we implement.
 */
export default class OpenAI {
  readonly chat: { completions: Completions };
  readonly images: Images;
  readonly models: ModelsApi;

  constructor(opts: { baseURL: string; apiKey?: string }) {
    const cfg = new Configuration({ basePath: opts.baseURL, apiKey: opts.apiKey });
    this.chat = { completions: new Completions(opts.baseURL) };
    this.images = new Images(opts.baseURL);
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
export { Configuration, ModelsApi, ChatCompletionsApi, ImagesApi } from './generated';
