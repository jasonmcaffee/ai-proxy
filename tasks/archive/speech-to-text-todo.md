# Speech-to-Text Implementation TODO

## Tasks

- [x] Install @types/multer for TypeScript types
- [x] Create `src/models/audioTranscription.dto.ts` with request/response DTOs
- [x] Create `src/services/speechToText.service.ts` to call speaches
- [x] Update `src/controllers/audioTranscriptions.controller.ts` with real implementation
- [x] Register SpeechToTextService in `src/app.module.ts`
- [x] Start the app to regenerate `src/openapi-spec.json`
- [x] Run `npm run generate-client` to regenerate TypeScript client
- [x] Add `audio.transcriptions.create()` to `client/index.ts`
- [x] Write integration test `tests/integration/speechToText.integration.spec.ts`
- [x] Run integration test and verify it passes
