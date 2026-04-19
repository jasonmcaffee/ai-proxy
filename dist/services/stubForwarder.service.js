"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StubForwarderService = void 0;
const common_1 = require("@nestjs/common");
let StubForwarderService = class StubForwarderService {
    imageGeneration() {
        throw new common_1.NotImplementedException('Image generation is not implemented in this proxy');
    }
    audioTranscription() {
        throw new common_1.NotImplementedException('Audio transcription (speech-to-text) is not implemented in this proxy');
    }
    audioSpeech() {
        throw new common_1.NotImplementedException('Text-to-speech is not implemented in this proxy');
    }
    videoGeneration() {
        throw new common_1.NotImplementedException('Video generation is not implemented in this proxy');
    }
};
exports.StubForwarderService = StubForwarderService;
exports.StubForwarderService = StubForwarderService = __decorate([
    (0, common_1.Injectable)()
], StubForwarderService);
//# sourceMappingURL=stubForwarder.service.js.map