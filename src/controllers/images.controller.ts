import { Body, Controller, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ImageGenerationRequestDto, ImageGenerationResponseDto } from '../models/imageCreator/imageCreation.dto';
import { ImageCreatorService } from '../services/imageCreator/imageCreator.service';

/**
 * Handles POST /v1/images/generations — OpenAI-compatible image generation via ComfyUI.
 */
@ApiTags('images')
@Controller('v1/images')
export class ImagesController {
  constructor(private readonly imageCreator: ImageCreatorService) {}

  @Post('generations')
  @ApiOperation({ summary: 'Generate an image using the zib-zit-moody ComfyUI workflow' })
  @ApiResponse({ status: 200, type: ImageGenerationResponseDto })
  @ApiResponse({ status: 500, description: 'ComfyUI unavailable or generation failed' })
  async generateImage(@Body() dto: ImageGenerationRequestDto, @Res() res: Response): Promise<void> {
    try {
      const result = await this.imageCreator.generateImages(dto);
      res.status(HttpStatus.OK).json(result);
    } catch (e: any) {
      console.error('[ImagesController] generateImage error:', e?.message ?? e);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: { message: e?.message ?? 'Image generation failed', type: 'image_error' } });
    }
  }
}
