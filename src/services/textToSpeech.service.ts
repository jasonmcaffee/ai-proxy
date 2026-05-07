import { Injectable } from '@nestjs/common';
import { OpenAI } from 'openai';
import { SPEACHES_BASE_URL } from './speaches.config';
import { splitSentences } from '../utils/splitSentences';

export type TtsOpts = {
  model?: string;
  voice?: string;
  responseFormat?: string;
  speed?: number;
};

const DEFAULT_MODEL = 'hexgrad/Kokoro-82M';
const DEFAULT_VOICE = 'af_sky';
const DEFAULT_FORMAT = 'mp3';
const DEFAULT_SPEED = 1;

/**
 * Calls speaches /v1/audio/speech and returns the audio buffer.
 * @param openAi - OpenAI client pointed at speaches
 * @param input - text to synthesize
 * @param opts - model, voice, format, speed
 * @param signal - AbortSignal to cancel the in-flight request
 */
async function callSpeaches(openAi: OpenAI, input: string, opts: TtsOpts, signal?: AbortSignal): Promise<Buffer> {
  const start = Date.now();
  const result = await (openAi.audio.speech.create as any)(
    {
      model: opts.model ?? DEFAULT_MODEL,
      voice: opts.voice ?? DEFAULT_VOICE,
      input,
      response_format: opts.responseFormat ?? DEFAULT_FORMAT,
      speed: opts.speed ?? DEFAULT_SPEED,
    },
    { signal },
  );
  const audioBuffer = await result.arrayBuffer();
  console.log(`[TextToSpeechService] speech generated in ${Date.now() - start}ms (${input.slice(0, 40)}…)`);
  return Buffer.from(audioBuffer);
}

/**
 * Synthesizes speech via the speaches Kokoro-82M backend.
 * Provides both a one-shot sync call and a sentence-chunked async generator for streaming.
 */
@Injectable()
export class TextToSpeechService {
  private readonly openAi: OpenAI;

  constructor() {
    this.openAi = new OpenAI({ baseURL: SPEACHES_BASE_URL, apiKey: 'na' });
  }

  /**
   * Synthesizes the full input text in one request and returns the audio buffer.
   * @param input - text to convert to speech
   * @param opts - model, voice, response_format, speed
   * @param signal - AbortSignal to cancel the speaches call
   */
  async synthesize(input: string, opts: TtsOpts, signal?: AbortSignal): Promise<Buffer> {
    return callSpeaches(this.openAi, input, opts, signal);
  }

  /**
   * Splits the input into sentences and yields audio for each one, enabling low-latency streaming.
   * Stops early when the signal is aborted.
   * @param input - full text to synthesize
   * @param opts - model, voice, response_format, speed
   * @param signal - AbortSignal to stop mid-stream
   */
  async *synthesizeStream(input: string, opts: TtsOpts, signal?: AbortSignal): AsyncGenerator<{ audio: Buffer; sentence: string }> {
    const sentences = splitSentences(input);
    for (const sentence of sentences) {
      if (signal?.aborted) return;
      const audio = await callSpeaches(this.openAi, sentence, opts, signal);
      yield { audio, sentence };
    }
  }
}
