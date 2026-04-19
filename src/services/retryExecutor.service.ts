import { Injectable, Logger } from '@nestjs/common';
import { LlamaForwarderService } from './llamaForwarder.service';

const RETRY_BASE_DELAY_MS = 2000;
const RETRY_MAX_DELAY_MS = 30000;
const MAX_RETRIES = 8;

/**
 * Executes non-streaming chat completions with exponential backoff retry.
 * Detects and recovers from the llama.cpp reasoning-only quirk where the model
 * emits reasoning_content but no content and no tool_calls.
 */
@Injectable()
export class RetryExecutorService {
  private readonly logger = new Logger(RetryExecutorService.name);

  constructor(private readonly forwarder: LlamaForwarderService) {}

  /**
   * Invokes a non-streaming chat completion with retry + reasoning-quirk recovery.
   * @param payload - OpenAI-compatible chat completion request body
   * @param signal - optional AbortSignal to cancel the request; aborted requests are not retried
   */
  async invoke(payload: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    const messages = [...(payload.messages as unknown[])];
    let lastErr: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const completion = await this.forwarder.chatCompletion({ ...payload, messages }, signal) as any;
        const msg = completion?.choices?.[0]?.message;

        if (!msg) {
          lastErr = new Error('Empty LLM message');
          continue;
        }

        const reasoningContent: string | undefined = msg.reasoning_content;
        const hasContent = typeof msg.content === 'string' && msg.content.trim().length > 0;
        const hasToolCalls = Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;

        if (!hasContent && !hasToolCalls && !reasoningContent) {
          lastErr = new Error('Empty message: no content, tool_calls, or reasoning_content');
          continue;
        }

        if (reasoningContent?.trim() && !hasContent && !hasToolCalls) {
          this.logger.warn(`Attempt ${attempt}: reasoning-only response detected, recovering...`);
          const recoveryText = `You reasoned but did not respond with content or a tool call. Here is your reasoning: ${reasoningContent}. Please continue.`;
          messages.push({ role: 'user', content: recoveryText });
          continue;
        }

        return completion;
      } catch (e) {
        if (signal?.aborted) throw e;
        lastErr = e;
      }

      const delay = Math.min(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1), RETRY_MAX_DELAY_MS);
      this.logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms`);
      await sleep(delay);
    }

    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
