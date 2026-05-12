# Legacy Speaches TODO

- [x] Add `legacy?: boolean` field to `AudioTranscriptionRequestDto`
- [x] Add `transcribeSimple()` method to `TranscribeAudioService` (uses response_format=json, returns {text})
- [x] Update controller: default → transcribe-audio simple, legacy=true → speaches, diarization=true → transcribe-audio verbose
- [x] Update controller Swagger comments/body schema to document `legacy` field
- [x] Update `client/index.ts` TranscriptionCreateParams to include `legacy?: boolean`
- [x] Restart dev server to regenerate openapi-spec.json
- [x] Run `npm run generate-client`
- [x] Fix `audioApi.transcribe()` call: legacy is now 5th arg (was incorrectly 7th)
- [x] Add STT3 integration test for legacy=true routing to speaches
- [x] Run integration tests and verify they pass (STT1, STT2, STT3, DIA1–DIA5 all pass)
