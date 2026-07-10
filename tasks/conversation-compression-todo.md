# Conversation Compression — Implementation TODO

Implements `tasks/conversation-compression-tdd.md` across ai-proxy + ai-service (backend + ui).

## Phase 1 — ai-proxy: compression engine + protocol ✅ DONE (unit + 10 integration + 12 chat integration green)
- [x] 1.1 Extend `CompressionOptionsDto`
- [x] 1.2 Add `/props` n_ctx fetch + cache to `LlamaForwarderService`
- [x] 1.3 Refactor `ContextCompressorService` → `CompressionResult` + progress + strategies
- [x] 1.4 Proxy-event helpers (`proxyEvents.ts`) + `ChatController` stream/non-stream wiring
- [x] 1.5 Regenerate openapi-spec + client
- [x] 1.6 Integration tests P1–P9 (+P5) pass; existing chat integration still green

## Phase 2 — ai-service backend: offload + forward + relay ✅ DONE (relay tests pass; tsc clean)
- [x] 2.1 Removed `trimMessagesToContextBudget`/`keepOnlyLastImage`/`estimateMessageTokens` from utils.ts + call sites
- [x] 2.2 Added `compressionOptions` (CompressionOptions type) to `ModelParams`
- [x] 2.3 Parse client compressionOptions in chat controller (query) + gateway (WS) → modelParams
- [x] 2.4 Spread compressionOptions into OpenAI body (stream + non-stream)
- [x] 2.5 Added `sendCompressionProgress`/`sendContextUsage` to `InferenceSSESubject`
- [x] 2.6 Relay `ai_proxy.event` chunks in stream loop; read `x_ai_proxy` on non-stream
- [x] 2.7 Backend tests B1–B5 pass (compressionRelay.spec.ts)

## Phase 3 — ai-service UI: parse + components ✅ DONE (UI typechecks clean; only pre-existing ts-expect-error remains)
- [x] 3.1 Parse `compressionProgress`/`contextUsage` in `AIServiceStreamingChat` (WS + SSE) + 2 new callbacks
- [x] 3.2 Added `compressionProgress`/`contextUsage`/handlers/getCompressionOptions to `chatPage` store + wired callbacks
- [x] 3.3 New `ContextUsageMeter` + `CompressingIndicator` (llm-common, reuse UsageMeters tokens)
- [x] 3.4 Rendered in rich `/llm` ChatPage + ChatHeader meter
- [x] 3.5 Rendered in AgentChatModal (indicator + header meter, tool-only image scope)
- [x] 3.6 Parse + render in simple `/chat` ChatPageContent (+ backend /chat/proxy relay)
- [x] 3.7 Default compressionOptions supplied by each UI surface (client-driven per decision #1)
- NOTE: full browser E2E of the three surfaces needs the ai-service stack (postgres+backend+next) — see cross-project test below

## Phase 4 — aiDesigner/notebook agents ✅ DONE (code + proxy tool-only scope unit-tested; needs manual browser E2E)
- [x] 4.1 Added proxy `imageDedupeScope: 'tool-only'`; UIDesignerAgent → proxy baseURL; both agents send AGENT_COMPRESSION_OPTIONS via invokeWithRetry
- [x] 4.2 Deleted `aiDesigner/contextCompressor.ts` + spec; created `agentCompressionOptions.ts`
- NOTE: designer/notebook agents drive a browser/ComfyUI — full runtime E2E needs manual verification (can't drive here)

## Phase 5 — compression-quality suite ✅ DONE (4/4 scenarios pass live)
- [x] 5.1 Fixtures (early-facts long chat, tool-heavy)
- [x] 5.2 Ratio + structure assertions (sliding-window 7×, summarize 12×, tool-trunc 4.5×)
- [x] 5.3 QA-probe retention for summarize — score 1.0 after adding preserveFirstUserMessage
- [x] 5.4 Suite passes live against proxy + llama.cpp

## Improvement discovered during Phase 5
- [x] Summarization dropped early facts → added `preserveFirstUserMessage` (default true): keep system + first user turn verbatim, summarize the middle, keep recent. QA retention 0 → 1.0.

## Final verification ✅
- [x] Proxy: unit (11 compressor + controller + others) + integration (10 compression + 4 quality + 12 chat) live-green
- [x] Backend relay: unit test (mocked SDK) green; tsc clean (non-test)
- [x] Live SDK cross-project check: real OpenAI SDK relays ai_proxy.event chunks (progress+usage+content) against live proxy
- [x] UI: typechecks clean (only pre-existing ts-expect-error)
- [ ] Manual E2E remaining (needs live stack + browser + ComfyUI): drive 3 UI surfaces + designer/notebook agents
