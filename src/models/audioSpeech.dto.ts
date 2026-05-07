import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class AudioSpeechRequestDto {
  @ApiProperty({ description: 'Text to synthesize' })
  @IsNotEmpty()
  @IsString()
  input: string;

  @ApiPropertyOptional({ description: 'TTS model to use', example: 'hexgrad/Kokoro-82M' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ description: 'Voice to use', example: 'af_sky' })
  @IsOptional()
  @IsString()
  voice?: string;

  @ApiPropertyOptional({ description: 'Audio format: mp3, wav, flac, opus, aac, pcm', example: 'mp3' })
  @IsOptional()
  @IsString()
  response_format?: string;

  @ApiPropertyOptional({ description: 'Speech speed (0.25–4.0)', example: 1 })
  @IsOptional()
  @IsNumber()
  speed?: number;
}

export class AudioSpeechStreamChunkDto {
  @ApiProperty({ description: 'Base64-encoded audio buffer for one sentence' })
  audio: string;

  @ApiProperty({ description: 'The sentence whose audio is in this chunk' })
  sentence: string;
}
