# AI Proxy Implementation TODO

## Setup
- [x] Initialize NestJS project (package.json, tsconfig.json, nest-cli.json, .gitignore)
- [x] Install dependencies

## Source Files
- [x] src/main.ts — NestJS bootstrap + Swagger + openapi-spec.json write
- [x] src/app.module.ts — dynamic controller/service loader (mirror ai-service)
- [x] src/models/compressionOptions.dto.ts
- [x] src/models/chatCompletion.dto.ts
- [x] src/models/common.dto.ts
- [x] src/utils/sse.ts — SSE parse/encode helpers
- [x] src/utils/tokens.ts — char-based token estimation fallback

## Services
- [x] src/services/llamaForwarder.service.ts
- [x] src/services/contextCompressor.service.ts
- [x] src/services/retryExecutor.service.ts
- [x] src/services/streamBuffer.service.ts
- [x] src/services/stubForwarder.service.ts

## Controllers
- [x] src/controllers/chat.controller.ts
- [x] src/controllers/models.controller.ts
- [x] src/controllers/images.controller.ts
- [x] src/controllers/audioTranscriptions.controller.ts
- [x] src/controllers/audioSpeech.controller.ts
- [x] src/controllers/videos.controller.ts

## Client Package
- [x] client/package.json
- [x] client/README.md
- [x] src/client/api-client/ — generated typescript-fetch client

## Tests
- [x] tests/integration/chat.integration.spec.ts (I1-I8 from TDD — uses generated client)
- [x] tests/unit/retryExecutor.spec.ts (M1-M3)
- [x] tests/unit/streamBuffer.spec.ts (M4-M5)
- [x] tests/unit/contextCompressor.spec.ts (M6 + image dedup)
- [x] tests/unit/stubForwarder.spec.ts (M7)

## Verify
- [x] Build compiles (npm run build)
- [x] Start server and verify openapi-spec.json written
- [x] Run unit tests (npm test) — 15 passed
- [x] Run integration tests (npm run test:integration) — 9 passed (live llama.cpp on :8080)
- [x] All tests (npm run test:all) — 24 passed
- [x] Generate client (npm run generate-ai-client-win) — success
