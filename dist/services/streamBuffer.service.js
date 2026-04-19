"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var StreamBufferService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamBufferService = void 0;
const common_1 = require("@nestjs/common");
const stream_1 = require("stream");
const llamaForwarder_service_1 = require("./llamaForwarder.service");
const sse_1 = require("../utils/sse");
let StreamBufferService = StreamBufferService_1 = class StreamBufferService {
    constructor(forwarder) {
        this.forwarder = forwarder;
        this.logger = new common_1.Logger(StreamBufferService_1.name);
    }
    async pipe(payload, awaitToolCallCompletion) {
        const output = new stream_1.PassThrough();
        let recoveryCount = 0;
        const upstreamStream = await this.forwarder.chatCompletionStream(payload);
        recoveryCount = await this.processStream(upstreamStream, output, payload, awaitToolCallCompletion);
        return { stream: output, recoveryCount };
    }
    async processStream(upstream, output, payload, awaitToolCallCompletion) {
        const toolCallBuffers = new Map();
        let accumulatedReasoningContent = '';
        let accumulatedContent = '';
        let hasToolCalls = false;
        let lastChunkTemplate = null;
        return new Promise((resolve, reject) => {
            let buffer = '';
            upstream.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed)
                        continue;
                    const data = (0, sse_1.parseSseLine)(trimmed);
                    if (data === null)
                        continue;
                    if (data === '[DONE]')
                        continue;
                    const parsed = (0, sse_1.parseSseJson)(data);
                    if (!parsed) {
                        output.write((0, sse_1.encodeSseLine)(data));
                        continue;
                    }
                    lastChunkTemplate = parsed;
                    const choice = parsed.choices?.[0];
                    if (!choice) {
                        output.write((0, sse_1.encodeSseLine)(data));
                        continue;
                    }
                    const delta = choice.delta ?? {};
                    if (delta.reasoning_content)
                        accumulatedReasoningContent += delta.reasoning_content;
                    if (delta.content)
                        accumulatedContent += delta.content;
                    if (delta.tool_calls?.length) {
                        hasToolCalls = true;
                        for (const tc of delta.tool_calls) {
                            const existing = toolCallBuffers.get(tc.index) ?? { arguments: '' };
                            if (tc.id)
                                existing.id = tc.id;
                            if (tc.type)
                                existing.type = tc.type;
                            if (tc.function?.name)
                                existing.name = tc.function.name;
                            if (tc.function?.arguments)
                                existing.arguments += tc.function.arguments;
                            toolCallBuffers.set(tc.index, existing);
                        }
                        if (awaitToolCallCompletion)
                            continue;
                    }
                    if (choice.finish_reason === 'tool_calls' && awaitToolCallCompletion) {
                        const consolidatedChunk = buildConsolidatedToolCallChunk(parsed, toolCallBuffers);
                        output.write((0, sse_1.encodeSseLine)(JSON.stringify(consolidatedChunk)));
                        continue;
                    }
                    output.write((0, sse_1.encodeSseLine)(data));
                }
            });
            upstream.on('end', async () => {
                const noContent = !accumulatedContent.trim();
                const onlyReasoning = noContent && accumulatedReasoningContent.trim() && !hasToolCalls;
                if (onlyReasoning && lastChunkTemplate) {
                    this.logger.warn('Stream ended with reasoning-only content, attempting recovery...');
                    try {
                        const recovery = await this.attemptStreamRecovery(payload, accumulatedReasoningContent, output);
                        output.write((0, sse_1.encodeSseLine)('[DONE]'));
                        output.end();
                        resolve(recovery ? 1 : 0);
                    }
                    catch (e) {
                        this.logger.error('Stream recovery failed', e);
                        output.write(`event: error\ndata: ${JSON.stringify({ message: 'stream recovery failed' })}\n\n`);
                        output.write((0, sse_1.encodeSseLine)('[DONE]'));
                        output.end();
                        resolve(0);
                    }
                }
                else {
                    output.write((0, sse_1.encodeSseLine)('[DONE]'));
                    output.end();
                    resolve(0);
                }
            });
            upstream.on('error', (err) => {
                output.destroy(err);
                reject(err);
            });
        });
    }
    async attemptStreamRecovery(payload, reasoningContent, output) {
        const recoveryText = `You reasoned but did not respond with content or a tool call. Here is your reasoning: ${reasoningContent}. Please continue.`;
        const messages = [...payload.messages, { role: 'user', content: recoveryText }];
        const recoveryPayload = { ...payload, messages };
        const upstream = await this.forwarder.chatCompletionStream(recoveryPayload);
        return new Promise((resolve) => {
            let buffer = '';
            upstream.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    const data = (0, sse_1.parseSseLine)(line.trim());
                    if (data && data !== '[DONE]') {
                        output.write((0, sse_1.encodeSseLine)(data));
                    }
                }
            });
            upstream.on('end', () => resolve(true));
            upstream.on('error', () => resolve(false));
        });
    }
};
exports.StreamBufferService = StreamBufferService;
exports.StreamBufferService = StreamBufferService = StreamBufferService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [llamaForwarder_service_1.LlamaForwarderService])
], StreamBufferService);
function buildConsolidatedToolCallChunk(template, toolCallBuffers) {
    const toolCalls = Array.from(toolCallBuffers.entries())
        .sort(([a], [b]) => a - b)
        .map(([index, tc]) => ({
        index,
        id: tc.id ?? `call_${index}`,
        type: tc.type ?? 'function',
        function: { name: tc.name ?? '', arguments: tc.arguments },
    }));
    return {
        ...template,
        choices: [{
                index: 0,
                delta: { tool_calls: toolCalls },
                finish_reason: 'tool_calls',
            }],
    };
}
//# sourceMappingURL=streamBuffer.service.js.map