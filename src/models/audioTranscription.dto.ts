import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Transform } from 'class-transformer';

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

  @ApiPropertyOptional({ description: 'Enable speaker diarization via transcribe-audio service', default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  diarization?: boolean;

  @ApiPropertyOptional({ description: 'Use legacy speaches (faster-whisper) backend instead of transcribe-audio. Returns plain {text}.', default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  legacy?: boolean;

  @ApiPropertyOptional({ description: 'Minimum number of speakers hint (used when diarization=true)', example: 2 })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : value))
  @IsInt()
  @Min(1)
  min_speakers?: number;

  @ApiPropertyOptional({ description: 'Maximum number of speakers hint (used when diarization=true)', example: 3 })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : value))
  @IsInt()
  @Min(1)
  max_speakers?: number;
}

export class AudioTranscriptionResponseDto {
  @ApiProperty({ description: 'The transcribed text' })
  text: string;
}

export class TranscriptionSegmentDto {
  @ApiProperty({ description: 'Segment index' })
  id: number;

  @ApiProperty({ description: 'Segment start time in seconds' })
  start: number;

  @ApiProperty({ description: 'Segment end time in seconds' })
  end: number;

  @ApiProperty({ description: 'Transcribed text for this segment' })
  text: string;

  @ApiProperty({ description: 'Speaker identifier', example: 'SPEAKER_00' })
  speaker: string;
}

export class AudioTranscriptionVerboseResponseDto {
  @ApiProperty({ description: 'Task type', example: 'transcribe' })
  task: string;

  @ApiProperty({ description: 'Detected or specified language' })
  language: string;

  @ApiProperty({ description: 'Total audio duration in seconds' })
  duration: number;

  @ApiProperty({ description: 'Full concatenated transcript text' })
  text: string;

  @ApiProperty({ type: [TranscriptionSegmentDto], description: 'Per-segment transcription with speaker labels' })
  segments: TranscriptionSegmentDto[];

  @ApiProperty({ example: ['SPEAKER_00', 'SPEAKER_01'], description: 'All speaker IDs detected in the audio' })
  speakers: string[];
}
