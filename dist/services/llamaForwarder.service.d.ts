import { Readable } from 'stream';
export type ChatMessage = {
    role: string;
    content?: string | unknown[];
    tool_calls?: unknown[];
    tool_call_id?: string;
};
export type CountTokensPayload = {
    systemPrompt: string;
    messages: ChatMessage[];
    tools?: unknown[];
};
export declare class LlamaForwarderService {
    private readonly logger;
    chatCompletion(payload: Record<string, unknown>): Promise<unknown>;
    chatCompletionStream(payload: Record<string, unknown>): Promise<Readable>;
    countTokens({ systemPrompt, messages, tools }: CountTokensPayload): Promise<number>;
}
