import { Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StubForwarderService } from '../services/stubForwarder.service';

/**
 * Handles POST /v1/audio/speech — stub returning 501.
 */
@ApiTags('audio')
@Controller('v1/audio')
export class AudioSpeechController {
  constructor(private readonly stub: StubForwarderService) {}

  @Post('speech')
  @ApiOperation({ summary: 'Text to speech (not implemented — stub 501)' })
  @ApiResponse({ status: 501, description: 'Not implemented' })
  speak() {
    return this.stub.audioSpeech();
  }
}
