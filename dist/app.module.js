"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const chat_controller_1 = require("./controllers/chat.controller");
const models_controller_1 = require("./controllers/models.controller");
const images_controller_1 = require("./controllers/images.controller");
const audioTranscriptions_controller_1 = require("./controllers/audioTranscriptions.controller");
const audioSpeech_controller_1 = require("./controllers/audioSpeech.controller");
const videos_controller_1 = require("./controllers/videos.controller");
const llamaForwarder_service_1 = require("./services/llamaForwarder.service");
const contextCompressor_service_1 = require("./services/contextCompressor.service");
const retryExecutor_service_1 = require("./services/retryExecutor.service");
const streamBuffer_service_1 = require("./services/streamBuffer.service");
const stubForwarder_service_1 = require("./services/stubForwarder.service");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [],
        controllers: [
            chat_controller_1.ChatController,
            models_controller_1.ModelsController,
            images_controller_1.ImagesController,
            audioTranscriptions_controller_1.AudioTranscriptionsController,
            audioSpeech_controller_1.AudioSpeechController,
            videos_controller_1.VideosController,
        ],
        providers: [
            llamaForwarder_service_1.LlamaForwarderService,
            contextCompressor_service_1.ContextCompressorService,
            retryExecutor_service_1.RetryExecutorService,
            streamBuffer_service_1.StreamBufferService,
            stubForwarder_service_1.StubForwarderService,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map