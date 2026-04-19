import { Injectable, Logger } from '@nestjs/common';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { LlamaForwarderService } from './llamaForwarder.service';
import { CompressionOptionsDto } from '../models/compressionOptions.dto';

const ESTIMATED_TOKENS_PER_IMAGE_PART = 2000;
const CHARS_PER_TOKEN = 4;

/** Internal mutable view used only within this service */
type MutableMessage = {
  role: string;
  content?: string | unknown[];
  tool_calls?: unknown[];
  tool_call_id?: string;
};

/**
 * Applies all built-in context compression strategies when enabled.
 * Strategies applied in order:
 * 1. ensureOnlyOneImageInContext — clears older tool image payloads
 * 2. removeOlderMessages — evicts from front until under maxContextSize
 */
@Injectable()
export class ContextCompressorService {
  private readonly logger = new Logger(ContextCompressorService.name);

  constructor(private readonly forwarder: LlamaForwarderService) {}

  /**
   * Compresses messages according to compressionOptions. No-op when enabled is falsy.
   * @param messages - the full message history to potentially compress
   * @param opts - compression options from the request
   */
  async compress(messages: ChatCompletionMessageParam[], opts: CompressionOptionsDto | undefined): Promise<ChatCompletionMessageParam[]> {
    if (!opts?.enabled) return messages;

    const history = messages.map(m => ({ ...m })) as MutableMessage[];

    this.ensureOnlyOneImageInContext(history);

    if (opts.maxContextSize) {
      await this.removeOlderMessagesUntilUnderLimit(history, opts.maxContextSize);
    }

    return history as unknown as ChatCompletionMessageParam[];
  }

  /**
   * Clears image payloads from all but the most recent tool message that carries an image.
   * @param history - message array mutated in place
   */
  private ensureOnlyOneImageInContext(history: MutableMessage[]): void {
    const imageIndices: number[] = [];

    for (let i = 0; i < history.length; i++) {
      if (this.messageHasImage(history[i])) {
        imageIndices.push(i);
      }
    }

    if (imageIndices.length < 2) return;

    const toClear = imageIndices.slice(0, -1);
    for (const idx of toClear) {
      const m = history[idx];
      history[idx] = { ...m, content: '', tool_call_id: m.tool_call_id };
      delete (history[idx] as any).llmToolContent;
    }
    this.logger.debug(`ensureOnlyOneImageInContext: cleared ${toClear.length} older image(s)`);
  }

  /**
   * Evicts oldest messages from the front until token count is under maxTokens.
   * Always preserves the last assistant→tool pair.
   * @param history - message array mutated in place
   * @param maxTokens - token budget
   */
  private async removeOlderMessagesUntilUnderLimit(history: MutableMessage[], maxTokens: number): Promise<void> {
    let tokenCount: number;
    try {
      tokenCount = await this.forwarder.countTokens({ systemPrompt: '', messages: history as unknown as ChatCompletionMessageParam[], tools: [] });
    } catch {
      tokenCount = this.estimateHistoryTokens(history);
    }

    if (tokenCount <= maxTokens) return;

    let removed = 0;
    while (tokenCount > maxTokens) {
      const pairStart = this.findLastToolPairAssistantIndex(history);
      if (!this.canShiftFirst(history, pairStart)) break;

      history.shift();
      removed++;

      try {
        tokenCount = await this.forwarder.countTokens({ systemPrompt: '', messages: history as unknown as ChatCompletionMessageParam[], tools: [] });
      } catch {
        tokenCount = this.estimateHistoryTokens(history);
      }
    }

    if (removed > 0) {
      this.logger.debug(`removeOlderMessages: removed ${removed} message(s), now ~${tokenCount} tokens`);
    }
  }

  /**
   * Returns true if the first message can be safely removed without breaking a tool pair.
   * @param history - current message array
   * @param pairStart - index of last assistant→tool pair start, or null
   */
  private canShiftFirst(history: MutableMessage[], pairStart: number | null): boolean {
    if (history.length <= 1) return false;
    if (pairStart === null) return true;
    return pairStart > 0;
  }

  /**
   * Finds the index of the last assistant message that is followed by a tool result.
   * @param history - message array to scan
   */
  private findLastToolPairAssistantIndex(history: MutableMessage[]): number | null {
    for (let i = history.length - 2; i >= 0; i--) {
      const curr = history[i];
      const next = history[i + 1];
      if (curr.role === 'assistant' && curr.tool_calls?.length && next.role === 'tool') {
        return i;
      }
    }
    return null;
  }

  /**
   * Returns true if a message carries an image payload in its content parts.
   * @param m - message to inspect
   */
  private messageHasImage(m: MutableMessage): boolean {
    if (!m.content || typeof m.content === 'string') return false;
    const parts = m.content as Array<{ type: string; image_url?: unknown }>;
    return parts.some(p => p.type === 'image_url' && p.image_url);
  }

  /**
   * Estimates total tokens for a message history using character heuristics.
   * @param history - messages to estimate
   */
  private estimateHistoryTokens(history: MutableMessage[]): number {
    return history.reduce((sum, m) => {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
      return sum + Math.ceil(content.length / CHARS_PER_TOKEN) + 4;
    }, 0);
  }
}
