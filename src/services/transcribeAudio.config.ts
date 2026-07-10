/** Base URL for the transcribe-audio STT service (whisper + pyannote diarization), role=stt. */
export const TRANSCRIBE_AUDIO_BASE_URL = process.env.TRANSCRIBE_AUDIO_BASE_URL || 'http://localhost:4140';

/**
 * Base URL for the Text To Speech (Chatterbox) service, role=tts.
 * Split onto its own port (4150) from the STT service; TTS endpoints (/v1/audio/speech,
 * /v1/audio/voices) are only served here — the STT backend on 4140 404s them.
 */
export const TEXT_TO_SPEECH_BASE_URL = process.env.TEXT_TO_SPEECH_BASE_URL || 'http://localhost:4150';

/** WebSocket URL for the transcribe-audio realtime gateway. Defaults to the same host as the HTTP base. */
export const TRANSCRIBE_AUDIO_WS_URL = process.env.TRANSCRIBE_AUDIO_WS_URL || TRANSCRIBE_AUDIO_BASE_URL;
