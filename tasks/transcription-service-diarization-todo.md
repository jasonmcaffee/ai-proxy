# Transcription Diarization TODO

- [x] Install npm packages: @nestjs/websockets @nestjs/platform-socket.io socket.io socket.io-client
- [x] Create `src/services/transcribeAudio.config.ts`
- [x] Extend `src/models/audioTranscription.dto.ts` with diarization fields and verbose response DTOs
- [x] Create `src/services/transcribeAudio.service.ts` (batch forwarder)
- [x] Update `src/controllers/audioTranscriptions.controller.ts` to branch on diarization flag
- [x] Create `src/controllers/transcriptionsRealtime.gateway.ts` (socket.io pass-through)
- [x] Update `src/main.ts` to add IoAdapter for websockets
- [x] Register service + gateway in `src/app.module.ts`
- [x] Restart dev server to regenerate openapi-spec.json
- [x] Run `npm run generate-client`
- [x] Extend `client/index.ts` with diarization overload, realtime() method, RealtimeSession class, export types
- [x] Add two-speaker audio fixture
- [x] Write integration tests (DIA1-DIA5)
- [x] Run integration tests and verify they pass
