import { LlamaForwarderService, ChatMessage } from './llamaForwarder.service';
import { CompressionOptionsDto } from '../models/compressionOptions.dto';
export declare class ContextCompressorService {
    private readonly forwarder;
    private readonly logger;
    constructor(forwarder: LlamaForwarderService);
    compress(messages: ChatMessage[], opts: CompressionOptionsDto | undefined): Promise<ChatMessage[]>;
    private ensureOnlyOneImageInContext;
    private removeOlderMessagesUntilUnderLimit;
    private canShiftFirst;
    private findLastToolPairAssistantIndex;
    private messageHasImage;
    private estimateHistoryTokens;
}
