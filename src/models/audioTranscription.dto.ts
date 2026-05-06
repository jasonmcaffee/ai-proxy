import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AudioTranscriptionRequestDto {
  @ApiProperty({ description: 'Audio file to transcribe', type: 'string', format: 'binary' })
  file: any;

  @ApiPropertyOptional({ description: 'Model to use for transcription', example: 'Systran/faster-whisper-small' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ description: 'Language code of the audio', example: 'en' })
  @IsOptional()
  @IsString()
  language?: string;
}

export class AudioTranscriptionResponseDto {
  @ApiProperty({ description: 'The transcribed text' })
  text: string;
}
