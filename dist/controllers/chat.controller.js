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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const chatCompletion_dto_1 = require("../models/chatCompletion.dto");
const contextCompressor_service_1 = require("../services/contextCompressor.service");
const retryExecutor_service_1 = require("../services/retryExecutor.service");
const streamBuffer_service_1 = require("../services/streamBuffer.service");
let ChatController = class ChatController {
    constructor(compressor, retryExecutor, streamBuffer) {
        this.compressor = compressor;
        this.retryExecutor = retryExecutor;
        this.streamBuffer = streamBuffer;
    }
    async createCompletion(dto, req, res) {
        const { compressionOptions, awaitToolCallCompletion, ...forwardPayload } = dto;
        const compressedMessages = await this.compressor.compress(dto.messages, compressionOptions);
        const payload = { ...forwardPayload, messages: compressedMessages };
        if (dto.stream) {
            await this.handleStream(payload, awaitToolCallCompletion ?? false, res);
        }
        else {
            await this.handleNonStream(payload, res);
        }
    }
    async handleNonStream(payload, res) {
        try {
            const result = await this.retryExecutor.invoke(payload);
            res.json(result);
        }
        catch (e) {
            const status = e?.status ?? common_1.HttpStatus.INTERNAL_SERVER_ERROR;
            res.status(status).json({ error: { message: e?.message ?? 'Unknown error', type: 'proxy_error' } });
        }
    }
    async handleStream(payload, awaitToolCallCompletion, res) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Transfer-Encoding', 'chunked');
        try {
            const { stream, recoveryCount } = await this.streamBuffer.pipe(payload, awaitToolCallCompletion);
            if (recoveryCount > 0) {
                res.setHeader('x-ai-proxy-stream-recovery', String(recoveryCount));
            }
            stream.pipe(res);
        }
        catch (e) {
            res.write(`data: ${JSON.stringify({ error: { message: e?.message ?? 'Stream error', type: 'proxy_error' } })}\n\n`);
            res.end();
        }
    }
};
exports.ChatController = ChatController;
__decorate([
    (0, common_1.Post)('completions'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a chat completion' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: chatCompletion_dto_1.ChatCompletionResponseDto }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [chatCompletion_dto_1.ChatCompletionRequestDto, Object, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "createCompletion", null);
exports.ChatController = ChatController = __decorate([
    (0, swagger_1.ApiTags)('chat'),
    (0, common_1.Controller)('v1/chat'),
    __metadata("design:paramtypes", [contextCompressor_service_1.ContextCompressorService,
        retryExecutor_service_1.RetryExecutorService,
        streamBuffer_service_1.StreamBufferService])
], ChatController);
//# sourceMappingURL=chat.controller.js.map