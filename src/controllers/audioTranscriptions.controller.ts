import { Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StubForwarderService } from '../services/stubForwarder.service';

/**
 * Handles POST /v1/audio/transcriptions — stub returning 501.
 */
@ApiTags('audio')
@Controller('v1/audio')
export class AudioTranscriptionsController {
  constructor(private readonly stub: StubForwarderService) {}

  @Post('transcriptions')
  @ApiOperation({ summary: 'Speech to text transcription (not implemented — stub 501)' })
  @ApiResponse({ status: 501, description: 'Not implemented' })
  transcribe() {
    return this.stub.audioTranscription();
  }
}
