# TODO — OpenAI SDK + OpenAI-Shaped Client

## Phase 1 — SDK integration (server side)
- [x] Install `openai` package
- [x] Create `src/models/openaiExtensions.ts` with LlamaParams typed extensions
- [x] Refactor `LlamaForwarderService` to use OpenAI SDK + `sseStreamToReadable` helper
- [x] Update `RetryExecutorService` to use typed params (LlamaParamsNonStreaming)
- [x] Update `StreamBufferService` to use typed params (LlamaParamsStreaming)
- [x] Update `ContextCompressorService` to use ChatCompletionMessageParam[]
- [x] Update `ChatController` to build typed params instead of Record<string, unknown>

## Phase 2 — Client generation
- [x] Create `scripts/rewrite-spec-names.ts` spec post-processor (with exported rewriteSpecText fn)
- [x] Update `package.json` generate-client script to run rewriter first
- [x] Run `generate-client` to produce `client/generated/` (no Dto suffixes, create operationId, ChatCompletionsApi)
- [x] Create `client/proxyExtensions.ts`
- [x] Rewrite `client/index.ts` as hand-rolled OpenAI facade
- [x] Update `client/package.json` to add `openai` dependency

## Phase 3 — Tests
- [x] Update `tests/unit/retryExecutor.spec.ts` (add model field to payloads)
- [x] Update `tests/unit/streamBuffer.spec.ts` (add model field + stream:true to payloads)
- [x] Update `tests/unit/contextCompressor.spec.ts` (ChatMessage → ChatCompletionMessageParam)
- [x] Create `tests/unit/rewriteSpecNames.spec.ts` (5 cases)
- [x] Update `tests/integration/chat.integration.spec.ts` (use new OpenAI facade)
- [x] Run unit tests — all 20 pass
