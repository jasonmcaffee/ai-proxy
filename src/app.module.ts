import { Module } from '@nestjs/common';
import { ChatController } from './controllers/chat.controller';
import { ModelsController } from './controllers/models.controller';
import { ImagesController } from './controllers/images.controller';
import { AudioTranscriptionsController } from './controllers/audioTranscriptions.controller';
import { AudioSpeechController } from './controllers/audioSpeech.controller';
import { VideosController } from './controllers/videos.controller';
import { LlamaForwarderService } from './services/llamaForwarder.service';
import { ContextCompressorService } from './services/contextCompressor.service';
import { RetryExecutorService } from './services/retryExecutor.service';
import { StreamBufferService } from './services/streamBuffer.service';
import { StubForwarderService } from './services/stubForwarder.service';
import { ImageCreatorService } from './services/imageCreator/imageCreator.service';
import { ComfyUIClientService } from './services/imageCreator/comfyUIClient.service';

@Module({
  imports: [],
  controllers: [
    ChatController,
    ModelsController,
    ImagesController,
    AudioTranscriptionsController,
    AudioSpeechController,
    VideosController,
  ],
  providers: [
    LlamaForwarderService,
    ContextCompressorService,
    RetryExecutorService,
    StreamBufferService,
    StubForwarderService,
    ImageCreatorService,
    ComfyUIClientService,
  ],
})
export class AppModule {}
