import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

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

  @ApiPropertyOptional({ description: 'Chatterbox cfg_weight (0.0–1.0); only used on the default (non-legacy) path', example: 0.5 })
  @IsOptional()
  @IsNumber()
  @Min(0.0)
  @Max(1.0)
  exaggeration?: number;

  @ApiPropertyOptional({ description: 'Route to the legacy speaches backend instead of Chatterbox', example: false })
  @IsOptional()
  @IsBoolean()
  legacy?: boolean;
}

export class AudioSpeechStreamChunkDto {
  @ApiProperty({ description: 'Base64-encoded audio buffer for one sentence' })
  audio: string;

  @ApiProperty({ description: 'The sentence whose audio is in this chunk' })
  sentence: string;
}
