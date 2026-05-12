/** Base URL for the transcribe-audio service (whisper-v3 + pyannote diarization). */
export const TRANSCRIBE_AUDIO_BASE_URL = process.env.TRANSCRIBE_AUDIO_BASE_URL || 'http://localhost:4140';

/** WebSocket URL for the transcribe-audio realtime gateway. Defaults to the same host as the HTTP base. */
export const TRANSCRIBE_AUDIO_WS_URL = process.env.TRANSCRIBE_AUDIO_WS_URL || TRANSCRIBE_AUDIO_BASE_URL;
