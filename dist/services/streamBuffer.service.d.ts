import { PassThrough } from 'stream';
import { LlamaForwarderService } from './llamaForwarder.service';
export declare class StreamBufferService {
    private readonly forwarder;
    private readonly logger;
    constructor(forwarder: LlamaForwarderService);
    pipe(payload: Record<string, unknown>, awaitToolCallCompletion: boolean): Promise<{
        stream: PassThrough;
        recoveryCount: number;
    }>;
    private processStream;
    private attemptStreamRecovery;
}
