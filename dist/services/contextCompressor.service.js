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
var ContextCompressorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextCompressorService = void 0;
const common_1 = require("@nestjs/common");
const llamaForwarder_service_1 = require("./llamaForwarder.service");
const ESTIMATED_TOKENS_PER_IMAGE_PART = 2000;
const CHARS_PER_TOKEN = 4;
let ContextCompressorService = ContextCompressorService_1 = class ContextCompressorService {
    constructor(forwarder) {
        this.forwarder = forwarder;
        this.logger = new common_1.Logger(ContextCompressorService_1.name);
    }
    async compress(messages, opts) {
        if (!opts?.enabled)
            return messages;
        const history = messages.map(m => ({ ...m }));
        this.ensureOnlyOneImageInContext(history);
        if (opts.maxContextSize) {
            await this.removeOlderMessagesUntilUnderLimit(history, opts.maxContextSize);
        }
        return history;
    }
    ensureOnlyOneImageInContext(history) {
        const imageIndices = [];
        for (let i = 0; i < history.length; i++) {
            if (this.messageHasImage(history[i])) {
                imageIndices.push(i);
            }
        }
        if (imageIndices.length < 2)
            return;
        const toClear = imageIndices.slice(0, -1);
        for (const idx of toClear) {
            const m = history[idx];
            history[idx] = { ...m, content: '', tool_call_id: m.tool_call_id };
            delete history[idx].llmToolContent;
        }
        this.logger.debug(`ensureOnlyOneImageInContext: cleared ${toClear.length} older image(s)`);
    }
    async removeOlderMessagesUntilUnderLimit(history, maxTokens) {
        let tokenCount;
        try {
            tokenCount = await this.forwarder.countTokens({ systemPrompt: '', messages: history, tools: [] });
        }
        catch {
            tokenCount = this.estimateHistoryTokens(history);
        }
        if (tokenCount <= maxTokens)
            return;
        let removed = 0;
        while (tokenCount > maxTokens) {
            const pairStart = this.findLastToolPairAssistantIndex(history);
            if (!this.canShiftFirst(history, pairStart))
                break;
            history.shift();
            removed++;
            try {
                tokenCount = await this.forwarder.countTokens({ systemPrompt: '', messages: history, tools: [] });
            }
            catch {
                tokenCount = this.estimateHistoryTokens(history);
            }
        }
        if (removed > 0) {
            this.logger.debug(`removeOlderMessages: removed ${removed} message(s), now ~${tokenCount} tokens`);
        }
    }
    canShiftFirst(history, pairStart) {
        if (history.length <= 1)
            return false;
        if (pairStart === null)
            return true;
        return pairStart > 0;
    }
    findLastToolPairAssistantIndex(history) {
        for (let i = history.length - 2; i >= 0; i--) {
            const curr = history[i];
            const next = history[i + 1];
            if (curr.role === 'assistant' && curr.tool_calls?.length && next.role === 'tool') {
                return i;
            }
        }
        return null;
    }
    messageHasImage(m) {
        if (!m.content || typeof m.content === 'string')
            return false;
        const parts = m.content;
        return parts.some(p => p.type === 'image_url' && p.image_url);
    }
    estimateHistoryTokens(history) {
        return history.reduce((sum, m) => {
            const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
            return sum + Math.ceil(content.length / CHARS_PER_TOKEN) + 4;
        }, 0);
    }
};
exports.ContextCompressorService = ContextCompressorService;
exports.ContextCompressorService = ContextCompressorService = ContextCompressorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [llamaForwarder_service_1.LlamaForwarderService])
], ContextCompressorService);
//# sourceMappingURL=contextCompressor.service.js.map