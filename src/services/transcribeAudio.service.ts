import { Injectable } from '@nestjs/common';
import { TRANSCRIBE_AUDIO_BASE_URL } from './transcribeAudio.config';
import { AudioTranscriptionVerboseResponseDto } from '../models/audioTranscription.dto';

export type DiarizationOpts = {
  language?: string;
  min_speakers?: number;
  max_speakers?: number;
};

/**
 * Builds a multipart FormData payload for the transcribe-audio batch endpoint.
 * @param file - uploaded multer file buffer
 * @param opts - optional language and speaker count hints
 */
function buildFormData(file: Express.Multer.File, opts: DiarizationOpts): FormData {
  const form = new FormData();
  const blob = new Blob([file.buffer as unknown as ArrayBuffer], { type: file.mimetype || 'audio/wav' });
  form.append('file', blob, file.originalname);
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  if (opts.language) form.append('language', opts.language);
  if (opts.min_speakers !== undefined) form.append('min_speakers', String(opts.min_speakers));
  if (opts.max_speakers !== undefined) form.append('max_speakers', String(opts.max_speakers));
  return form;
}

/**
 * Forwards a transcription request to the transcribe-audio service with diarization enabled.
 * @param url - transcribe-audio base URL
 * @param file - multer file
 * @param opts - language and speaker hints
 * @param signal - aborts the upstream call when the HTTP client disconnects
 */
async function postToDiarizationService(url: string, file: Express.Multer.File, opts: DiarizationOpts, signal?: AbortSignal): Promise<AudioTranscriptionVerboseResponseDto> {
  const form = buildFormData(file, opts);
  const start = Date.now();
  const res = await fetch(`${url}/v1/audio/transcriptions`, { method: 'POST', body: form, signal });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`transcribe-audio ${res.status}: ${body}`);
  }
  const data = await res.json() as AudioTranscriptionVerboseResponseDto;
  console.log(`[TranscribeAudioService] diarization finished in ${Date.now() - start}ms, ${data.segments?.length ?? 0} segments, speakers: ${data.speakers?.join(', ')}`);
  return data;
}

/**
 * Forwards audio uploads to the transcribe-audio service for speaker-diarized transcription.
 * Transcribe-audio runs Whisper large-v3 + pyannote and returns verbose_json with per-segment speaker IDs.
 */
@Injectable()
export class TranscribeAudioService {
  /**
   * Sends an uploaded audio file to transcribe-audio for diarized transcription.
   * Always requests verbose_json so speaker labels are included in the response.
   * @param file - multer file containing audio data
   * @param opts - language and speaker count hints
   * @param signal - AbortSignal to cancel the upstream request on client disconnect
   */
  async transcribeWithDiarization(file: Express.Multer.File, opts: DiarizationOpts, signal?: AbortSignal): Promise<AudioTranscriptionVerboseResponseDto> {
    return postToDiarizationService(TRANSCRIBE_AUDIO_BASE_URL, file, opts, signal);
  }
}
