import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

export class CompressionOptionsDto {
  @ApiPropertyOptional({ description: 'Enable context compression before forwarding to llama.cpp' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Maximum context size in tokens. Older messages are evicted when exceeded.' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxContextSize?: number;
}
