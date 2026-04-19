import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CompressionOptionsDto } from './compressionOptions.dto';

export class FunctionCallDto {
  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  arguments?: string;
}

export class ToolCallDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'function' })
  type: string;

  @ApiProperty()
  function: FunctionCallDto;
}

export class ToolFunctionDto {
  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional()
  parameters?: Record<string, unknown>;
}

export class ToolDefinitionDto {
  @ApiProperty({ example: 'function' })
  type: string;

  @ApiProperty()
  function: ToolFunctionDto;
}

export class ChatMessageDto {
  @ApiProperty({ example: 'user', description: 'Role of the message sender: system, user, assistant, or tool' })
  role: string;

  @ApiPropertyOptional({ type: 'string', description: 'Message content (string for text, array for multimodal/vision)' })
  content?: string;

  @ApiPropertyOptional({ type: [ToolCallDto] })
  tool_calls?: ToolCallDto[];

  @ApiPropertyOptional()
  tool_call_id?: string;

  @ApiPropertyOptional({ description: 'Reasoning content from llama.cpp thinking models (non-standard OpenAI field)' })
  reasoning_content?: string;
}

export class ChatCompletionRequestDto {
  @ApiProperty({ type: [ChatMessageDto] })
  @IsArray()
  messages: ChatMessageDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  stream?: boolean;

  @ApiPropertyOptional({ type: [ToolDefinitionDto] })
  @IsOptional()
  @IsArray()
  tools?: ToolDefinitionDto[];

  @ApiPropertyOptional()
  @IsOptional()
  tool_choice?: string | Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  max_tokens?: number;

  @ApiPropertyOptional({ description: 'Proxy extension: context compression options' })
  @IsOptional()
  @ValidateNested()
  @Type(() => CompressionOptionsDto)
  compressionOptions?: CompressionOptionsDto;

  @ApiPropertyOptional({ description: 'Proxy extension: buffer all tool-call deltas before sending to client (only meaningful when stream=true)' })
  @IsOptional()
  @IsBoolean()
  awaitToolCallCompletion?: boolean;
}

export class UsageDto {
  @ApiProperty()
  prompt_tokens: number;

  @ApiProperty()
  completion_tokens: number;

  @ApiProperty()
  total_tokens: number;
}

export class ChatChoiceDto {
  @ApiProperty()
  index: number;

  @ApiProperty()
  message: ChatMessageDto;

  @ApiPropertyOptional()
  finish_reason: string;
}

export class ChatCompletionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'chat.completion' })
  object: string;

  @ApiProperty()
  created: number;

  @ApiProperty()
  model: string;

  @ApiProperty({ type: [ChatChoiceDto] })
  choices: ChatChoiceDto[];

  @ApiPropertyOptional()
  usage?: UsageDto;
}
