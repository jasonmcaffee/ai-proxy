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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatCompletionResponseDto = exports.ChatChoiceDto = exports.UsageDto = exports.ChatCompletionRequestDto = exports.ChatMessageDto = exports.ToolDefinitionDto = exports.ToolFunctionDto = exports.ToolCallDto = exports.FunctionCallDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const compressionOptions_dto_1 = require("./compressionOptions.dto");
class FunctionCallDto {
}
exports.FunctionCallDto = FunctionCallDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], FunctionCallDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", String)
], FunctionCallDto.prototype, "arguments", void 0);
class ToolCallDto {
}
exports.ToolCallDto = ToolCallDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ToolCallDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'function' }),
    __metadata("design:type", String)
], ToolCallDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", FunctionCallDto)
], ToolCallDto.prototype, "function", void 0);
class ToolFunctionDto {
}
exports.ToolFunctionDto = ToolFunctionDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ToolFunctionDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", String)
], ToolFunctionDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", Object)
], ToolFunctionDto.prototype, "parameters", void 0);
class ToolDefinitionDto {
}
exports.ToolDefinitionDto = ToolDefinitionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'function' }),
    __metadata("design:type", String)
], ToolDefinitionDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", ToolFunctionDto)
], ToolDefinitionDto.prototype, "function", void 0);
class ChatMessageDto {
}
exports.ChatMessageDto = ChatMessageDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'user', description: 'Role of the message sender: system, user, assistant, or tool' }),
    __metadata("design:type", String)
], ChatMessageDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: 'string', description: 'Message content (string for text, array for multimodal/vision)' }),
    __metadata("design:type", String)
], ChatMessageDto.prototype, "content", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: [ToolCallDto] }),
    __metadata("design:type", Array)
], ChatMessageDto.prototype, "tool_calls", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", String)
], ChatMessageDto.prototype, "tool_call_id", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Reasoning content from llama.cpp thinking models (non-standard OpenAI field)' }),
    __metadata("design:type", String)
], ChatMessageDto.prototype, "reasoning_content", void 0);
class ChatCompletionRequestDto {
}
exports.ChatCompletionRequestDto = ChatCompletionRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [ChatMessageDto] }),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], ChatCompletionRequestDto.prototype, "messages", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ChatCompletionRequestDto.prototype, "model", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ChatCompletionRequestDto.prototype, "temperature", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ChatCompletionRequestDto.prototype, "stream", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: [ToolDefinitionDto] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], ChatCompletionRequestDto.prototype, "tools", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], ChatCompletionRequestDto.prototype, "tool_choice", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ChatCompletionRequestDto.prototype, "max_tokens", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Proxy extension: context compression options' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => compressionOptions_dto_1.CompressionOptionsDto),
    __metadata("design:type", compressionOptions_dto_1.CompressionOptionsDto)
], ChatCompletionRequestDto.prototype, "compressionOptions", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Proxy extension: buffer all tool-call deltas before sending to client (only meaningful when stream=true)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ChatCompletionRequestDto.prototype, "awaitToolCallCompletion", void 0);
class UsageDto {
}
exports.UsageDto = UsageDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], UsageDto.prototype, "prompt_tokens", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], UsageDto.prototype, "completion_tokens", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], UsageDto.prototype, "total_tokens", void 0);
class ChatChoiceDto {
}
exports.ChatChoiceDto = ChatChoiceDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], ChatChoiceDto.prototype, "index", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", ChatMessageDto)
], ChatChoiceDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", String)
], ChatChoiceDto.prototype, "finish_reason", void 0);
class ChatCompletionResponseDto {
}
exports.ChatCompletionResponseDto = ChatCompletionResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ChatCompletionResponseDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'chat.completion' }),
    __metadata("design:type", String)
], ChatCompletionResponseDto.prototype, "object", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], ChatCompletionResponseDto.prototype, "created", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ChatCompletionResponseDto.prototype, "model", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [ChatChoiceDto] }),
    __metadata("design:type", Array)
], ChatCompletionResponseDto.prototype, "choices", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", UsageDto)
], ChatCompletionResponseDto.prototype, "usage", void 0);
//# sourceMappingURL=chatCompletion.dto.js.map