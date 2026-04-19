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
exports.ModelsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const common_dto_1 = require("../models/common.dto");
let ModelsController = class ModelsController {
    listModels() {
        return {
            object: 'list',
            data: [
                {
                    id: 'local-model',
                    object: 'model',
                    created: Math.floor(Date.now() / 1000),
                    owned_by: 'llama.cpp',
                },
            ],
        };
    }
};
exports.ModelsController = ModelsController;
__decorate([
    (0, common_1.Get)('models'),
    (0, swagger_1.ApiOperation)({ summary: 'List available models' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: common_dto_1.ModelsListResponseDto }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", common_dto_1.ModelsListResponseDto)
], ModelsController.prototype, "listModels", null);
exports.ModelsController = ModelsController = __decorate([
    (0, swagger_1.ApiTags)('models'),
    (0, common_1.Controller)('v1')
], ModelsController);
//# sourceMappingURL=models.controller.js.map