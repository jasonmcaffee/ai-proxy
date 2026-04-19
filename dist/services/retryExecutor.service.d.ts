import { LlamaForwarderService } from './llamaForwarder.service';
export declare class RetryExecutorService {
    private readonly forwarder;
    private readonly logger;
    constructor(forwarder: LlamaForwarderService);
    invoke(payload: Record<string, unknown>): Promise<unknown>;
}
