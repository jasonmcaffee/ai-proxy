import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ModelsListResponseDto } from '../models/common.dto';

/**
 * Handles GET /v1/models — returns a static list of available models via the local llama.cpp instance.
 */
@ApiTags('models')
@Controller('v1')
export class ModelsController {
  @Get('models')
  @ApiOperation({ summary: 'List available models' })
  @ApiResponse({ status: 200, type: ModelsListResponseDto })
  listModels(): ModelsListResponseDto {
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
}
