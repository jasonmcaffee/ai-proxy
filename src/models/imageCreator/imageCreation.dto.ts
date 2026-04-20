import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class ImageGenerationRequestDto {
  @ApiProperty({ description: 'Text prompt for image generation' })
  @IsString()
  prompt: string;

  @ApiPropertyOptional({ description: 'Proxy extension: negative prompt for things to avoid in the image' })
  @IsOptional()
  @IsString()
  negativePrompt?: string;

  @ApiPropertyOptional({ description: 'Model name (currently always maps to zib-zit-moody workflow)' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ description: 'Number of images to generate (currently only 1 is supported)', example: 1 })
  @IsOptional()
  @IsNumber()
  n?: number;

  @ApiPropertyOptional({ description: 'Image size as WxH string', example: '1024x1024' })
  @IsOptional()
  @IsString()
  size?: string;

  @ApiPropertyOptional({ description: 'Response format', example: 'b64_json', enum: ['url', 'b64_json'] })
  @IsOptional()
  @IsString()
  response_format?: string;

  @ApiPropertyOptional({ description: 'Image quality hint (ignored, passed through)', example: 'standard' })
  @IsOptional()
  @IsString()
  quality?: string;

  @ApiPropertyOptional({ description: 'Image style hint (ignored, passed through)', example: 'vivid' })
  @IsOptional()
  @IsString()
  style?: string;
}

export class ImageDataDto {
  @ApiPropertyOptional({ description: 'Base64-encoded image data' })
  b64_json?: string;

  @ApiPropertyOptional({ description: 'URL of the generated image' })
  url?: string;

  @ApiPropertyOptional({ description: 'The revised prompt used for generation' })
  revised_prompt?: string;
}

export class ImageGenerationResponseDto {
  @ApiProperty({ description: 'Unix timestamp of when the request was made' })
  created: number;

  @ApiProperty({ type: [ImageDataDto] })
  data: ImageDataDto[];
}
