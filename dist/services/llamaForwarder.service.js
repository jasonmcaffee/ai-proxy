"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var LlamaForwarderService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlamaForwarderService = void 0;
const common_1 = require("@nestjs/common");
const stream_1 = require("stream");
const LLAMA_BASE_URL = process.env.LLAMA_BASE_URL || 'http://localhost:8080';
let LlamaForwarderService = LlamaForwarderService_1 = class LlamaForwarderService {
    constructor() {
        this.logger = new common_1.Logger(LlamaForwarderService_1.name);
    }
    async chatCompletion(payload) {
        const res = await fetch(`${LLAMA_BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, stream: false }),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`llama.cpp error: ${res.status} ${text}`);
        }
        return res.json();
    }
    async chatCompletionStream(payload) {
        const res = await fetch(`${LLAMA_BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, stream: true }),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`llama.cpp stream error: ${res.status} ${text}`);
        }
        return stream_1.Readable.fromWeb(res.body);
    }
    async countTokens({ systemPrompt, messages, tools }) {
        let msgs = [...messages];
        const lastRole = msgs.length > 0 ? msgs[msgs.length - 1].role : null;
        if (msgs.length === 0 || lastRole === 'assistant') {
            msgs = [...msgs, { role: 'user', content: ' ' }];
        }
        const body = {
            model: 'local-model',
            system: systemPrompt,
            messages: msgs,
        };
        if (tools?.length)
            body.tools = tools;
        const res = await fetch(`${LLAMA_BASE_URL}/v1/messages/count_tokens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`count_tokens failed: ${res.status} ${text}`);
        }
        const data = await res.json();
        this.logger.debug(`countTokens: ${data.input_tokens}`);
        return data.input_tokens;
    }
};
exports.LlamaForwarderService = LlamaForwarderService;
exports.LlamaForwarderService = LlamaForwarderService = LlamaForwarderService_1 = __decorate([
    (0, common_1.Injectable)()
], LlamaForwarderService);
//# sourceMappingURL=llamaForwarder.service.js.map