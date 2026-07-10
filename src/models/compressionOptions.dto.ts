import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export type CompressionStrategy = 'sliding-window' | 'summarize';

/**
 * Controls truncation ("observation masking") of older tool/function results.
 */
export class ToolResultTruncationDto {
  @ApiPropertyOptional({ description: 'Enable truncation of older tool/function results' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Max tokens kept per truncated tool result (middle-clipped)', example: 512 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxToolResultTokens?: number;

  @ApiPropertyOptional({ description: 'Number of most-recent tool results kept verbatim', example: 3 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  keepRecentToolResults?: number;
}

/**
 * Options specific to the running-summary ('summarize') strategy.
 */
export class SummarizeOptionsDto {
  @ApiPropertyOptional({ description: 'Model used to produce the running summary. Defaults to the request model.' })
  @IsOptional()
  @IsString()
  summaryModel?: string;

  @ApiPropertyOptional({ description: 'Max tokens the generated summary may occupy', example: 1024 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  summaryMaxTokens?: number;
}

/**
 * Client-supplied, fully-optional context-compression settings. When absent, no compression runs.
 */
export class CompressionOptionsDto {
  @ApiPropertyOptional({ description: 'Enable context compression before forwarding to llama.cpp' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'DEPRECATED alias: when set alone, acts as both trigger and target (legacy behavior).' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxContextSize?: number;

  @ApiPropertyOptional({ description: 'Compress only when counted input tokens exceed this threshold', example: 100000 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  compressAtTokens?: number;

  @ApiPropertyOptional({ description: 'Compress down to (approximately) this many tokens. Defaults to 75% of compressAtTokens.', example: 75000 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  targetTokens?: number;

  @ApiPropertyOptional({ enum: ['sliding-window', 'summarize'], description: 'Compression strategy. Default sliding-window.' })
  @IsOptional()
  @IsIn(['sliding-window', 'summarize'])
  strategy?: CompressionStrategy;

  @ApiPropertyOptional({ description: 'Always keep this many most-recent messages verbatim', example: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  keepRecentMessages?: number;

  @ApiPropertyOptional({ description: 'Alternative recency budget in tokens (takes precedence over keepRecentMessages if both set)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  keepRecentTokens?: number;

  @ApiPropertyOptional({ description: 'Preserve leading system message(s) unmodified. Default true.' })
  @IsOptional()
  @IsBoolean()
  preserveSystemPrompt?: boolean;

  @ApiPropertyOptional({ description: 'Preserve the first user message verbatim (it usually carries the task/goal/facts), never summarizing or evicting it. Default true.' })
  @IsOptional()
  @IsBoolean()
  preserveFirstUserMessage?: boolean;

  @ApiPropertyOptional({ description: 'Keep only the most-recent image in the conversation, clearing older image payloads. Default true when enabled.' })
  @IsOptional()
  @IsBoolean()
  onlyKeepLatestImage?: boolean;

  @ApiPropertyOptional({ enum: ['all', 'tool-only'], description: 'Scope of onlyKeepLatestImage. "tool-only" dedupes only tool-message screenshots and preserves user-attached asset images. Default "all".' })
  @IsOptional()
  @IsIn(['all', 'tool-only'])
  imageDedupeScope?: 'all' | 'tool-only';

  @ApiPropertyOptional({ description: 'Override the model context window used for the "% of context" metric. Auto-detected from llama.cpp /props when omitted.', example: 200000 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  contextLimit?: number;

  @ApiPropertyOptional({ type: ToolResultTruncationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ToolResultTruncationDto)
  truncateToolResults?: ToolResultTruncationDto;

  @ApiPropertyOptional({ type: SummarizeOptionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SummarizeOptionsDto)
  summarize?: SummarizeOptionsDto;
}
