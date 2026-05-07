import { AudioApi, Configuration, ModelsApi } from './generated';
import type { AudioTranscriptionResponse } from './generated';
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

// ─── Text-to-speech types ────────────────────────────────────────────────────

export type SpeechCreateParamsBase = {
  input: string;
  model?: string;
  voice?: string;
  response_format?: string;
  speed?: number;
};
export type SpeechCreateParamsNonStreaming = SpeechCreateParamsBase & { stream?: false };
export type SpeechCreateParamsStreaming = SpeechCreateParamsBase & { stream: true };

/** One sentence's worth of base64-decoded audio from the streaming TTS endpoint. */
export type SpeechChunk = { audio: ArrayBuffer; sentence: string };

/**
 * Parses an SSE response from the /v1/audio/speech/stream endpoint into SpeechChunk values.
 * Stops on [DONE] or signal abort. Throws if the server sends an error event.
 * @param res - fetch Response with SSE body
 * @param signal - optional AbortSignal to stop reading
 */
async function* sseToSpeechChunks(res: Response, signal?: AbortSignal): AsyncGenerator<SpeechChunk> {
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
        break;
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
          const parsed = JSON.parse(data);
          if (parsed.error) throw new Error(parsed.error.message ?? 'tts_error');
          const audioBytes = Uint8Array.from(atob(parsed.audio), c => c.charCodeAt(0));
          yield { audio: audioBytes.buffer, sentence: parsed.sentence };
        } catch (e) {
          if ((e as Error).message?.includes('tts_error') || (e as Error).message?.includes('error')) throw e;
          /* skip malformed lines */
        }
      }
    }
  } finally {
    try { await reader.cancel(); } catch { /* ignore */ }
  }
}

/**
 * Calls /v1/audio/speech (sync) and returns the raw ArrayBuffer.
 * @param baseURL - proxy base URL
 * @param body - TTS request params (input, model, voice, response_format, speed)
 * @param signal - optional AbortSignal
 */
async function fetchSpeechSync(baseURL: string, body: SpeechCreateParamsBase, signal?: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch(`${baseURL}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`ai-proxy ${res.status}: ${await res.text()}`);
  return res.arrayBuffer();
}

/**
 * Calls /v1/audio/speech/stream (SSE) and returns an AsyncIterable of SpeechChunks.
 * @param baseURL - proxy base URL
 * @param body - TTS request params
 * @param signal - optional AbortSignal
 */
async function fetchSpeechStream(baseURL: string, body: SpeechCreateParamsBase, signal?: AbortSignal): Promise<AsyncIterable<SpeechChunk>> {
  const res = await fetch(`${baseURL}/v1/audio/speech/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`ai-proxy ${res.status}: ${await res.text()}`);
  return sseToSpeechChunks(res, signal);
}

/**
 * OpenAI-SDK-compatible text-to-speech client.
 * create() without stream returns an ArrayBuffer; with stream:true returns AsyncIterable<SpeechChunk>.
 */
class Speech {
  constructor(private readonly baseURL: string) {}

  create(params: SpeechCreateParamsStreaming, opts?: RequestOpts): Promise<AsyncIterable<SpeechChunk>>;
  create(params: SpeechCreateParamsNonStreaming, opts?: RequestOpts): Promise<ArrayBuffer>;
  async create(params: SpeechCreateParamsBase & { stream?: boolean }, opts?: RequestOpts): Promise<ArrayBuffer | AsyncIterable<SpeechChunk>> {
    const { stream, ...body } = params;
    if (stream) return fetchSpeechStream(this.baseURL, body, opts?.signal);
    return fetchSpeechSync(this.baseURL, body, opts?.signal);
  }
}

// ─── Transcription types ──────────────────────────────────────────────────────

export type TranscriptionCreateParams = { file: Blob; model?: string; language?: string };

/** Wraps the generated AudioApi to expose an OpenAI-SDK-compatible transcriptions.create() method. */
class Transcriptions {
  constructor(private readonly audioApi: AudioApi) {}

  /**
   * Sends an audio file to the proxy for transcription and returns the result.
   * @param params - file (Blob), optional model and language
   */
  async create(params: TranscriptionCreateParams): Promise<AudioTranscriptionResponse> {
    return this.audioApi.transcribe(params.file, params.model, params.language);
  }
}

/** Provides openai-SDK-compatible audio.transcriptions.create() and audio.speech.create() against the ai-proxy server. */
class Audio {
  readonly transcriptions: Transcriptions;
  readonly speech: Speech;

  constructor(audioApi: AudioApi, baseURL: string) {
    this.transcriptions = new Transcriptions(audioApi);
    this.speech = new Speech(baseURL);
  }
}

/** Provides openai-SDK-compatible images.generate() against the ai-proxy server. */
class Images {
  constructor(private readonly baseURL: string) {}

  /**
   * Generates an image using the ai-proxy ComfyUI backend and returns the result in OpenAI format.
   * Always returns b64_json. negativePrompt is a proxy extension not in the official OpenAI SDK.
   * Aborting the signal closes the HTTP connection, which triggers the proxy to cancel the ComfyUI job.
   * @param params - image generation params; negativePrompt is a proxy extension
   * @param opts - optional request options including AbortSignal
   */
  async generate(params: ImageGenerateParams, opts?: RequestOpts): Promise<ImagesResponse> {
    const res = await fetch(`${this.baseURL}/v1/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: opts?.signal,
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
  readonly audio: Audio;

  constructor(opts: { baseURL: string; apiKey?: string }) {
    const cfg = new Configuration({ basePath: opts.baseURL, apiKey: opts.apiKey });
    this.chat = { completions: new Completions(opts.baseURL) };
    this.images = new Images(opts.baseURL);
    this.models = new ModelsApi(cfg);
    this.audio = new Audio(new AudioApi(cfg), opts.baseURL);
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
export { Configuration, ModelsApi, ChatCompletionsApi, ImagesApi, AudioApi } from './generated';
export type { AudioTranscriptionResponse } from './generated';
