# TTS Transcribe-Audio Implementation

## Todos

- [x] Update `src/models/audioSpeech.dto.ts` — add `legacy` and `exaggeration` fields
- [x] Create `src/services/transcribeAudioTts.service.ts` — new Chatterbox TTS service
- [x] Update `src/controllers/audioSpeech.controller.ts` — add routing + voices endpoint
- [x] Update `src/app.module.ts` — register TranscribeAudioTtsService
- [x] Update `tests/integration/textToSpeech.integration.spec.ts` — WAV assertions, legacy test, voices test, unknown voice test
- [x] Start dev server and run integration tests to verify
