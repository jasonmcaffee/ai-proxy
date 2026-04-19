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
exports.AudioTranscriptionsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const stubForwarder_service_1 = require("../services/stubForwarder.service");
let AudioTranscriptionsController = class AudioTranscriptionsController {
    constructor(stub) {
        this.stub = stub;
    }
    transcribe() {
        return this.stub.audioTranscription();
    }
};
exports.AudioTranscriptionsController = AudioTranscriptionsController;
__decorate([
    (0, common_1.Post)('transcriptions'),
    (0, swagger_1.ApiOperation)({ summary: 'Speech to text transcription (not implemented — stub 501)' }),
    (0, swagger_1.ApiResponse)({ status: 501, description: 'Not implemented' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AudioTranscriptionsController.prototype, "transcribe", null);
exports.AudioTranscriptionsController = AudioTranscriptionsController = __decorate([
    (0, swagger_1.ApiTags)('audio'),
    (0, common_1.Controller)('v1/audio'),
    __metadata("design:paramtypes", [stubForwarder_service_1.StubForwarderService])
], AudioTranscriptionsController);
//# sourceMappingURL=audioTranscriptions.controller.js.map