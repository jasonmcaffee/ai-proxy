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
exports.ModelsListResponseDto = exports.ModelObjectDto = exports.ErrorResponseDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class ErrorResponseDto {
}
exports.ErrorResponseDto = ErrorResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Object)
], ErrorResponseDto.prototype, "error", void 0);
class ModelObjectDto {
}
exports.ModelObjectDto = ModelObjectDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'local-model' }),
    __metadata("design:type", String)
], ModelObjectDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'model' }),
    __metadata("design:type", String)
], ModelObjectDto.prototype, "object", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], ModelObjectDto.prototype, "created", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'llama.cpp' }),
    __metadata("design:type", String)
], ModelObjectDto.prototype, "owned_by", void 0);
class ModelsListResponseDto {
}
exports.ModelsListResponseDto = ModelsListResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'list' }),
    __metadata("design:type", String)
], ModelsListResponseDto.prototype, "object", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [ModelObjectDto] }),
    __metadata("design:type", Array)
], ModelsListResponseDto.prototype, "data", void 0);
//# sourceMappingURL=common.dto.js.map