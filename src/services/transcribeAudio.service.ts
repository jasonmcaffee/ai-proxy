import { Injectable } from '@nestjs/common';
import { TRANSCRIBE_AUDIO_BASE_URL } from './transcribeAudio.config';
import { AudioTranscriptionVerboseResponseDto } from '../models/audioTranscription.dto';

export type DiarizationOpts = {
  language?: string;
  min_speakers?: number;
  max_speakers?: number;
};

type SimpleOpts = { language?: string };

/**
 * Builds a multipart FormData payload for the transcribe-audio batch endpoint.
 * @param file - uploaded multer file buffer
 * @param responseFormat - 'json' for plain text, 'verbose_json' for speaker-labeled segments
 * @param opts - optional language and speaker count hints
 */
function buildFormData(file: Express.Multer.File, responseFormat: 'json' | 'verbose_json', opts: DiarizationOpts): FormData {
  const form = new FormData();
  const blob = new Blob([file.buffer as unknown as ArrayBuffer], { type: file.mimetype || 'audio/wav' });
  form.append('file', blob, file.originalname);
  form.append('model', 'whisper-1');
  form.append('response_format', responseFormat);
  if (opts.language) form.append('language', opts.language);
  if (opts.min_speakers !== undefined) form.append('min_speakers', String(opts.min_speakers));
  if (opts.max_speakers !== undefined) form.append('max_speakers', String(opts.max_speakers));
  return form;
}

/**
 * Posts to the transcribe-audio batch endpoint and returns the parsed response.
 * @param url - transcribe-audio base URL
 * @param file - multer file
 * @param responseFormat - determines the response shape
 * @param opts - language and speaker hints
 * @param signal - aborts the upstream call when the HTTP client disconnects
 */
async function postToTranscribeAudio<T>(url: string, file: Express.Multer.File, responseFormat: 'json' | 'verbose_json', opts: DiarizationOpts, signal?: AbortSignal): Promise<T> {
  const form = buildFormData(file, responseFormat, opts);
  const start = Date.now();
  const res = await fetch(`${url}/v1/audio/transcriptions`, { method: 'POST', body: form, signal });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`transcribe-audio ${res.status}: ${body}`);
  }
  const data = await res.json() as T;
  console.log(`[TranscribeAudioService] transcription finished in ${Date.now() - start}ms (format=${responseFormat})`);
  return data;
}

/**
 * Forwards audio uploads to the transcribe-audio service (Whisper large-v3 + pyannote).
 * Supports plain text transcription and speaker-diarized verbose transcription.
 */
@Injectable()
export class TranscribeAudioService {
  /**
   * Transcribes audio via transcribe-audio and returns plain {text} (no speaker labels).
   * Uses response_format=json for a lightweight response without segment data.
   * @param file - multer file containing audio data
   * @param opts - optional language hint
   * @param signal - AbortSignal to cancel the upstream request on client disconnect
   */
  async transcribeSimple(file: Express.Multer.File, opts: SimpleOpts, signal?: AbortSignal): Promise<{ text: string }> {
    return postToTranscribeAudio<{ text: string }>(TRANSCRIBE_AUDIO_BASE_URL, file, 'json', opts, signal);
  }

  /**
   * Transcribes audio via transcribe-audio with speaker diarization.
   * Returns verbose_json with per-segment speaker IDs and a speakers array.
   * @param file - multer file containing audio data
   * @param opts - language and speaker count hints
   * @param signal - AbortSignal to cancel the upstream request on client disconnect
   */
  async transcribeWithDiarization(file: Express.Multer.File, opts: DiarizationOpts, signal?: AbortSignal): Promise<AudioTranscriptionVerboseResponseDto> {
    const data = await postToTranscribeAudio<AudioTranscriptionVerboseResponseDto>(TRANSCRIBE_AUDIO_BASE_URL, file, 'verbose_json', opts, signal);
    console.log(`[TranscribeAudioService] ${data.segments?.length ?? 0} segments, speakers: ${data.speakers?.join(', ')}`);
    return data;
  }
}
