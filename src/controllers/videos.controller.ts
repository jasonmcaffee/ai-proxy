import { Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StubForwarderService } from '../services/stubForwarder.service';

/**
 * Handles POST /v1/videos/generations — stub returning 501.
 */
@ApiTags('videos')
@Controller('v1/videos')
export class VideosController {
  constructor(private readonly stub: StubForwarderService) {}

  @Post('generations')
  @ApiOperation({ summary: 'Video generation (not implemented — stub 501)' })
  @ApiResponse({ status: 501, description: 'Not implemented' })
  generateVideo() {
    return this.stub.videoGeneration();
  }
}
