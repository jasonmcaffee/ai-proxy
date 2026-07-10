/** Base URL for the speaches service (faster-whisper STT + Kokoro TTS).
 * Default uses 127.0.0.1 (not "localhost") so Node's fetch goes over IPv4. Speaches binds
 * 0.0.0.0 and does not listen on ::1, so using "localhost" causes Node to try IPv6 first
 * and fail with "fetch failed". */
export const SPEACHES_BASE_URL = process.env.SPEACHES_BASE_URL || 'http://127.0.0.1:8000/v1';
