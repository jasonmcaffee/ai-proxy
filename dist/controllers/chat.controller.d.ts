import { Request, Response } from 'express';
import { ChatCompletionRequestDto } from '../models/chatCompletion.dto';
import { ContextCompressorService } from '../services/contextCompressor.service';
import { RetryExecutorService } from '../services/retryExecutor.service';
import { StreamBufferService } from '../services/streamBuffer.service';
export declare class ChatController {
    private readonly compressor;
    private readonly retryExecutor;
    private readonly streamBuffer;
    constructor(compressor: ContextCompressorService, retryExecutor: RetryExecutorService, streamBuffer: StreamBufferService);
    createCompletion(dto: ChatCompletionRequestDto, req: Request, res: Response): Promise<void>;
    private handleNonStream;
    private handleStream;
}
