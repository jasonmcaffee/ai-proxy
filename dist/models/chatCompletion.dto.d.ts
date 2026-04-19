import { CompressionOptionsDto } from './compressionOptions.dto';
export declare class FunctionCallDto {
    name: string;
    arguments?: string;
}
export declare class ToolCallDto {
    id: string;
    type: string;
    function: FunctionCallDto;
}
export declare class ToolFunctionDto {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
}
export declare class ToolDefinitionDto {
    type: string;
    function: ToolFunctionDto;
}
export declare class ChatMessageDto {
    role: string;
    content?: string;
    tool_calls?: ToolCallDto[];
    tool_call_id?: string;
    reasoning_content?: string;
}
export declare class ChatCompletionRequestDto {
    messages: ChatMessageDto[];
    model?: string;
    temperature?: number;
    stream?: boolean;
    tools?: ToolDefinitionDto[];
    tool_choice?: string | Record<string, unknown>;
    max_tokens?: number;
    compressionOptions?: CompressionOptionsDto;
    awaitToolCallCompletion?: boolean;
}
export declare class UsageDto {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}
export declare class ChatChoiceDto {
    index: number;
    message: ChatMessageDto;
    finish_reason: string;
}
export declare class ChatCompletionResponseDto {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: ChatChoiceDto[];
    usage?: UsageDto;
}
