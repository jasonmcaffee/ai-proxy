# Text-to-Speech Implementation TODO

## Tasks

- [x] Create `src/services/speaches.config.ts` and update `speechToText.service.ts` to import from it
- [x] Create `src/utils/splitSentences.ts` (port of `splitTextIntoSentencesV2`)
- [x] Create `src/models/audioSpeech.dto.ts` (`AudioSpeechRequestDto`, `AudioSpeechStreamChunkDto`)
- [x] Create `src/services/textToSpeech.service.ts` (`synthesize`, `synthesizeStream`)
- [x] Replace stub in `audioSpeech.controller.ts` with sync + streaming routes
- [x] Remove `audioSpeech()` from `StubForwarderService`
- [x] Register `TextToSpeechService` in `app.module.ts`
- [x] Start dev server → verify `openapi-spec.json` updated for both routes
- [x] Run `npm run generate-client`
- [x] Add `Speech` class + `sseToSpeechChunks` in `client/index.ts`; expose `audio.speech.create()` overloads
- [x] Create `tests/integration/results/tts/` directory
- [x] Extract `normalizeText` to `tests/integration/_helpers.ts`; update STT spec import
- [x] Write `tests/integration/textToSpeech.integration.spec.ts` (TTS1–TTS8)
- [x] Run integration tests and verify all pass
