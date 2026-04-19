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
var RetryExecutorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RetryExecutorService = void 0;
const common_1 = require("@nestjs/common");
const llamaForwarder_service_1 = require("./llamaForwarder.service");
const RETRY_BASE_DELAY_MS = 2000;
const RETRY_MAX_DELAY_MS = 30000;
const MAX_RETRIES = 8;
let RetryExecutorService = RetryExecutorService_1 = class RetryExecutorService {
    constructor(forwarder) {
        this.forwarder = forwarder;
        this.logger = new common_1.Logger(RetryExecutorService_1.name);
    }
    async invoke(payload) {
        const messages = [...payload.messages];
        let lastErr;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const completion = await this.forwarder.chatCompletion({ ...payload, messages });
                const msg = completion?.choices?.[0]?.message;
                if (!msg) {
                    lastErr = new Error('Empty LLM message');
                    continue;
                }
                const reasoningContent = msg.reasoning_content;
                const hasContent = typeof msg.content === 'string' && msg.content.trim().length > 0;
                const hasToolCalls = Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
                if (!hasContent && !hasToolCalls && !reasoningContent) {
                    lastErr = new Error('Empty message: no content, tool_calls, or reasoning_content');
                    continue;
                }
                if (reasoningContent?.trim() && !hasContent && !hasToolCalls) {
                    this.logger.warn(`Attempt ${attempt}: reasoning-only response detected, recovering...`);
                    const recoveryText = `You reasoned but did not respond with content or a tool call. Here is your reasoning: ${reasoningContent}. Please continue.`;
                    messages.push({ role: 'user', content: recoveryText });
                    continue;
                }
                return completion;
            }
            catch (e) {
                lastErr = e;
            }
            const delay = Math.min(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1), RETRY_MAX_DELAY_MS);
            this.logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms`);
            await sleep(delay);
        }
        throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
    }
};
exports.RetryExecutorService = RetryExecutorService;
exports.RetryExecutorService = RetryExecutorService = RetryExecutorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [llamaForwarder_service_1.LlamaForwarderService])
], RetryExecutorService);
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//# sourceMappingURL=retryExecutor.service.js.map