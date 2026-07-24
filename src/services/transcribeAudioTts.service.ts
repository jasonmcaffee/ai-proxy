import { Injectable } from '@nestjs/common';
import { TEXT_TO_SPEECH_BASE_URL } from './transcribeAudio.config';
import { splitSentences } from '../utils/splitSentences';

export type ChatterboxOpts = {
  voice?: string;
  exaggeration?: number;
  /** task-674: which transcribe-audio engine to synthesize with (indextts default). */
  engine?: string;
};

export type VoiceInfo = {
  id: string;
  language: string;
  gender: string;
};

/** One selectable TTS engine reported by transcribe-audio. */
export type EngineInfo = {
  id: string;
  label: string;
  available: boolean;
};

const DEFAULT_VOICE = 'dave';
const DEFAULT_EXAGGERATION = 0.5;

/**
 * Reads a chunked HTTP response and yields each complete WAV file as a Buffer.
 * WAV boundaries are detected by parsing RIFF headers.
 * @param response - streaming fetch response from transcribe-audio
 * @param signal - aborts reading when fired
 */
async function* readWavChunks(response: Response, signal?: AbortSignal): AsyncGenerator<Buffer> {
  const reader = response.body!.getReader();
  let pending = Buffer.alloc(0);

  try {
    while (true) {
      if (signal?.aborted) break;
      let done: boolean, value: Uint8Array | undefined;
      try {
        ({ done, value } = await reader.read());
      } catch {
        break;
      }
      if (value) pending = Buffer.concat([pending, Buffer.from(value)]);

      while (pending.length >= 8) {
        if (pending.slice(0, 4).toString('ascii') !== 'RIFF') {
          const nextRiff = pending.indexOf(Buffer.from('RIFF'));
          if (nextRiff === -1) { pending = Buffer.alloc(0); break; }
          pending = pending.slice(nextRiff);
          continue;
        }
        const wavSize = pending.readUInt32LE(4) + 8;
        if (pending.length < wavSize) break;
        yield pending.slice(0, wavSize);
        pending = pending.slice(wavSize);
      }

      if (done) break;
    }
  } finally {
    try { await reader.cancel(); } catch { /* ignore */ }
  }
}

/**
 * Throws an error with statusCode attached for upstream HTTP error responses.
 * @param res - non-ok fetch response
 */
async function throwUpstreamError(res: Response): Promise<never> {
  const body = await res.text().catch(() => '');
  const err: any = new Error(`transcribe-audio TTS ${res.status}: ${body}`);
  err.statusCode = res.status;
  throw err;
}

/**
 * Proxies TTS requests to the transcribe-audio Chatterbox service.
 * Supports voice listing, synchronous synthesis, and sentence-level streaming.
 */
@Injectable()
export class TranscribeAudioTtsService {
  /**
   * Returns the list of voices available from the Chatterbox engine.
   */
  async listVoices(): Promise<VoiceInfo[]> {
    const res = await fetch(`${TEXT_TO_SPEECH_BASE_URL}/v1/audio/voices`);
    if (!res.ok) await throwUpstreamError(res);
    const data = await res.json() as { voices: VoiceInfo[] };
    return data.voices;
  }

  /**
   * Returns the TTS engines transcribe-audio can synthesize with, and its default engine, so the
   * studio can populate its engine dropdowns from what is actually installed (task-674).
   */
  async listEngines(): Promise<{ engines: EngineInfo[]; defaultEngine: string }> {
    const res = await fetch(`${TEXT_TO_SPEECH_BASE_URL}/v1/audio/engines`);
    if (!res.ok) await throwUpstreamError(res);
    return await res.json() as { engines: EngineInfo[]; defaultEngine: string };
  }

  /**
   * Synthesizes the full input text via Chatterbox and returns a WAV buffer.
   * @param input - text to convert to speech
   * @param opts - voice and exaggeration level
   * @param signal - AbortSignal to cancel the upstream request
   */
  async synthesize(input: string, opts: ChatterboxOpts, signal?: AbortSignal): Promise<Buffer> {
    const start = Date.now();
    const res = await fetch(`${TEXT_TO_SPEECH_BASE_URL}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'tts-1',
        input,
        voice: opts.voice ?? DEFAULT_VOICE,
        response_format: 'wav',
        exaggeration: opts.exaggeration ?? DEFAULT_EXAGGERATION,
        ...(opts.engine ? { engine: opts.engine } : {}),
      }),
      signal,
    });
    if (!res.ok) await throwUpstreamError(res);
    const buf = Buffer.from(await res.arrayBuffer());
    console.log(`[TranscribeAudioTtsService] speech generated in ${Date.now() - start}ms (${input.slice(0, 40)}…)`);
    return buf;
  }

  /**
   * Streams Chatterbox synthesis sentence-by-sentence, yielding one WAV buffer per sentence.
   * Uses ai-proxy's sentence splitter to correlate labels with upstream WAV chunks.
   * @param input - full text to synthesize
   * @param opts - voice and exaggeration level
   * @param signal - AbortSignal to stop mid-stream
   */
  async *synthesizeStream(input: string, opts: ChatterboxOpts, signal?: AbortSignal): AsyncGenerator<{ audio: Buffer; sentence: string }> {
    const sentences = splitSentences(input);
    const res = await fetch(`${TEXT_TO_SPEECH_BASE_URL}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'tts-1',
        input,
        voice: opts.voice ?? DEFAULT_VOICE,
        response_format: 'stream',
        exaggeration: opts.exaggeration ?? DEFAULT_EXAGGERATION,
        ...(opts.engine ? { engine: opts.engine } : {}),
      }),
      signal,
    });
    if (!res.ok) await throwUpstreamError(res);

    let idx = 0;
    for await (const wavBuf of readWavChunks(res, signal)) {
      if (signal?.aborted) break;
      yield { audio: wavBuf, sentence: sentences[idx] ?? '' };
      idx++;
    }
  }
}
