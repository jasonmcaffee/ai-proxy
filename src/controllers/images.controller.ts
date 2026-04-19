import { Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StubForwarderService } from '../services/stubForwarder.service';

/**
 * Handles POST /v1/images/generations — stub returning 501.
 */
@ApiTags('images')
@Controller('v1/images')
export class ImagesController {
  constructor(private readonly stub: StubForwarderService) {}

  @Post('generations')
  @ApiOperation({ summary: 'Image generation (not implemented — stub 501)' })
  @ApiResponse({ status: 501, description: 'Not implemented' })
  generateImage() {
    return this.stub.imageGeneration();
  }
}
