import { Injectable, Logger } from '@nestjs/common';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { LlamaParamsNonStreaming } from '../models/openaiExtensions';
import { LlamaForwarderService } from './llamaForwarder.service';
import { CompressionOptionsDto, CompressionStrategy, ToolResultTruncationDto } from '../models/compressionOptions.dto';

const CHARS_PER_TOKEN = 4;
const DEFAULT_TARGET_RATIO = 0.75;

/** Progress phases emitted during compression, surfaced to the client. */
export type CompressionProgress = { phase: 'analyzing' | 'summarizing' | 'truncating' | 'evicting' | 'done'; message: string; pct?: number };
export type ProgressFn = (p: CompressionProgress) => void;

/** Context-usage + compression metadata returned to the caller for the client feedback channel. */
export interface CompressionMeta {
  rawInputTokens: number;
  inputTokens: number;
  contextLimit: number;
  usedPct: number;
  compressAtTokens: number | null;
  tokensUntilCompression: number;
  untilCompressionPct: number;
  compressed: boolean;
  strategy: CompressionStrategy | null;
  droppedMessages: number;
  summarizedMessages: number;
  truncatedToolResults: number;
}

export interface CompressionResult {
  messages: ChatCompletionMessageParam[];
  meta: CompressionMeta | null;
}

/** Internal mutable view used only within this service */
type MutableMessage = {
  role: string;
  content?: string | unknown[];
  tool_calls?: unknown[];
  tool_call_id?: string;
};

/**
 * Applies client-configured context compression and reports context-usage metadata.
 * Strategies: 'sliding-window' (recency eviction) and 'summarize' (running summary of older turns),
 * plus always-available image de-duplication and tool-result truncation.
 */
@Injectable()
export class ContextCompressorService {
  private readonly logger = new Logger(ContextCompressorService.name);

  constructor(private readonly forwarder: LlamaForwarderService) {}

  /**
   * Compresses messages per compressionOptions and returns the result plus context-usage meta.
   * No-op (meta = null) when disabled. When enabled but under the trigger, returns meta with compressed=false.
   * @param messages - full message history to potentially compress
   * @param opts - client-supplied compression options
   * @param onProgress - optional callback invoked with human-readable progress during compression
   */
  async compress(messages: ChatCompletionMessageParam[], opts: CompressionOptionsDto | undefined, onProgress?: ProgressFn): Promise<CompressionResult> {
    if (!opts?.enabled) return { messages, meta: null };

    const history = messages.map(m => ({ ...m })) as MutableMessage[];
    const rawInputTokens = await this.countOrEstimate(history);

    const clearedImages = opts.onlyKeepLatestImage !== false ? this.ensureOnlyOneImageInContext(history, opts.imageDedupeScope ?? 'all') : 0;
    let truncatedToolResults = 0;
    if (opts.truncateToolResults?.enabled) {
      onProgress?.({ phase: 'truncating', message: 'Trimming older tool results…' });
      truncatedToolResults = this.maskOldToolResults(history, opts.truncateToolResults);
    }

    const trigger = this.resolveTrigger(opts);
    const strategy: CompressionStrategy = opts.strategy ?? 'sliding-window';
    let droppedMessages = 0;
    let summarizedMessages = 0;
    let tokens = await this.countOrEstimate(history);

    if (trigger && tokens > trigger) {
      const target = this.resolveTarget(opts, trigger);
      onProgress?.({ phase: 'analyzing', message: `Compressing conversation (${tokens} tokens over ${trigger})…` });
      if (strategy === 'summarize') {
        const res = await this.summarizeOlderTurns(history, opts, onProgress);
        summarizedMessages = res.summarized;
      }
      if (await this.countOrEstimate(history) > target) {
        onProgress?.({ phase: 'evicting', message: 'Dropping oldest messages…' });
        droppedMessages = await this.evictOldestToTarget(history, target, opts);
      }
      tokens = await this.countOrEstimate(history);
      this.logger.debug(`compress: strategy=${strategy} dropped=${droppedMessages} summarized=${summarizedMessages} now ~${tokens} tokens`);
    }

    onProgress?.({ phase: 'done', message: 'Ready' });
    const compressed = clearedImages > 0 || truncatedToolResults > 0 || droppedMessages > 0 || summarizedMessages > 0;
    const meta = await this.buildMeta({ rawInputTokens, inputTokens: tokens, trigger, opts, strategy, compressed, droppedMessages, summarizedMessages, truncatedToolResults });
    return { messages: history as unknown as ChatCompletionMessageParam[], meta };
  }

  /**
   * Builds the context-usage metadata object from token counts and options.
   * @param p - assembled counts and options
   */
  private async buildMeta(p: { rawInputTokens: number; inputTokens: number; trigger: number | null; opts: CompressionOptionsDto; strategy: CompressionStrategy; compressed: boolean; droppedMessages: number; summarizedMessages: number; truncatedToolResults: number }): Promise<CompressionMeta> {
    const contextLimit = await this.resolveContextLimit(p.opts, p.trigger);
    const usedPct = contextLimit > 0 ? Math.round((p.inputTokens / contextLimit) * 1000) / 10 : 0;
    const tokensUntilCompression = p.trigger ? Math.max(0, p.trigger - p.inputTokens) : 0;
    const untilCompressionPct = p.trigger ? Math.min(100, Math.round((p.inputTokens / p.trigger) * 1000) / 10) : 0;
    return {
      rawInputTokens: p.rawInputTokens,
      inputTokens: p.inputTokens,
      contextLimit,
      usedPct,
      compressAtTokens: p.trigger,
      tokensUntilCompression,
      untilCompressionPct,
      compressed: p.compressed,
      strategy: p.strategy,
      droppedMessages: p.droppedMessages,
      summarizedMessages: p.summarizedMessages,
      truncatedToolResults: p.truncatedToolResults,
    };
  }

  /**
   * Resolves the compression trigger threshold: compressAtTokens, else legacy maxContextSize.
   * @param opts - compression options
   */
  private resolveTrigger(opts: CompressionOptionsDto): number | null {
    return opts.compressAtTokens ?? opts.maxContextSize ?? null;
  }

  /**
   * Resolves the target token count to compress down to. Defaults to 75% of the trigger (or maxContextSize for legacy).
   * @param opts - compression options
   * @param trigger - resolved trigger threshold
   */
  private resolveTarget(opts: CompressionOptionsDto, trigger: number): number {
    return opts.targetTokens ?? opts.maxContextSize ?? Math.floor(trigger * DEFAULT_TARGET_RATIO);
  }

  /**
   * Resolves the model context window for the "% of context" metric: client override, else llama.cpp n_ctx, else trigger.
   * @param opts - compression options
   * @param trigger - resolved trigger threshold
   */
  private async resolveContextLimit(opts: CompressionOptionsDto, trigger: number | null): Promise<number> {
    if (opts.contextLimit) return opts.contextLimit;
    const detected = await this.forwarder.getContextLength();
    return detected ?? trigger ?? 0;
  }

  /**
   * Clears image payloads from all but the most recent message carrying an image.
   * With scope 'tool-only', considers only tool-message screenshots and leaves user-attached asset images intact.
   * @param history - message array mutated in place
   * @param scope - 'all' images or 'tool-only' (preserve user asset images)
   * @returns count of messages whose images were cleared
   */
  private ensureOnlyOneImageInContext(history: MutableMessage[], scope: 'all' | 'tool-only'): number {
    const imageIndices: number[] = [];
    for (let i = 0; i < history.length; i++) {
      if (scope === 'tool-only' && history[i].role !== 'tool') continue;
      if (this.messageHasImage(history[i])) imageIndices.push(i);
    }
    if (imageIndices.length < 2) return 0;

    const toClear = imageIndices.slice(0, -1);
    for (const idx of toClear) {
      const m = history[idx];
      history[idx] = { ...m, content: '', tool_call_id: m.tool_call_id };
      delete (history[idx] as any).llmToolContent;
    }
    this.logger.debug(`ensureOnlyOneImageInContext: cleared ${toClear.length} older image(s)`);
    return toClear.length;
  }

  /**
   * Middle-clips older tool/function result contents to a token budget, keeping the most recent ones verbatim.
   * @param history - message array mutated in place
   * @param cfg - tool-result truncation config
   * @returns count of tool results truncated
   */
  private maskOldToolResults(history: MutableMessage[], cfg: ToolResultTruncationDto): number {
    const keepRecent = cfg.keepRecentToolResults ?? 3;
    const maxTokens = cfg.maxToolResultTokens ?? 512;
    const toolIndices = history.map((m, i) => (m.role === 'tool' ? i : -1)).filter(i => i >= 0);
    const olderToolIndices = toolIndices.slice(0, Math.max(0, toolIndices.length - keepRecent));
    let truncated = 0;
    for (const idx of olderToolIndices) {
      const m = history[idx];
      if (typeof m.content !== 'string') continue;
      const clipped = this.middleClip(m.content, maxTokens);
      if (clipped !== m.content) {
        history[idx] = { ...m, content: clipped };
        truncated++;
      }
    }
    if (truncated > 0) this.logger.debug(`maskOldToolResults: truncated ${truncated} tool result(s)`);
    return truncated;
  }

  /**
   * Middle-clips a string to roughly maxTokens, preserving head and tail with a truncation marker.
   * @param text - the text to clip
   * @param maxTokens - approximate token budget
   */
  private middleClip(text: string, maxTokens: number): string {
    const maxChars = maxTokens * CHARS_PER_TOKEN;
    if (text.length <= maxChars) return text;
    const half = Math.floor(maxChars / 2);
    const removed = text.length - maxChars;
    return `${text.slice(0, half)}\n…[truncated ${removed} chars]…\n${text.slice(text.length - half)}`;
  }

  /**
   * Replaces older turns (between the system prefix and the recency buffer) with a single running summary message.
   * Falls back gracefully (summarized=0) when there is nothing to summarize or the summary call fails.
   * @param history - message array mutated in place
   * @param opts - compression options
   * @param onProgress - optional progress callback
   */
  private async summarizeOlderTurns(history: MutableMessage[], opts: CompressionOptionsDto, onProgress?: ProgressFn): Promise<{ summarized: number }> {
    const headKeep = this.computeHeadKeepCount(history, opts);
    const keepRecent = this.computeKeepRecentCount(history, opts, 10);
    const recencyStart = Math.max(headKeep, history.length - keepRecent);
    const older = history.slice(headKeep, recencyStart);
    if (older.length < 1) return { summarized: 0 };

    onProgress?.({ phase: 'summarizing', message: `Summarizing ${older.length} earlier messages…` });
    let summaryText: string;
    try {
      summaryText = await this.generateSummary(older, opts);
    } catch (e: any) {
      this.logger.warn(`summarizeOlderTurns: summary failed (${e?.message}); falling back to eviction`);
      onProgress?.({ phase: 'evicting', message: 'Summary failed; trimming instead…' });
      return { summarized: 0 };
    }
    const summaryMsg: MutableMessage = { role: 'system', content: `[Conversation summary of earlier turns]\n${summaryText}` };
    history.splice(headKeep, older.length, summaryMsg);
    return { summarized: older.length };
  }

  /**
   * Calls the LLM (same loaded model by default) to produce a compact factual summary of older messages.
   * @param older - the messages to summarize
   * @param opts - compression options (summarize sub-options)
   */
  private async generateSummary(older: MutableMessage[], opts: CompressionOptionsDto): Promise<string> {
    const transcript = older.map(m => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')}`).join('\n');
    const params = {
      model: opts.summarize?.summaryModel ?? 'local-model',
      stream: false,
      temperature: 0.3,
      max_tokens: opts.summarize?.summaryMaxTokens ?? 1024,
      messages: [
        { role: 'system', content: 'You compress conversation history into notes for an assistant that must continue the conversation. Produce a compact summary that PRESERVES VERBATIM every specific fact the user stated — names, codenames, numbers, amounts, dates, places, IDs, file paths, requirements, decisions, and constraints. Never omit or generalize a concrete value (e.g. keep "codename BLUEHERON, budget 47 thousand dollars, launch city Reykjavik" exactly). Prefer a bulleted "Known facts:" list of these values, followed by a brief summary of what was discussed and any open questions. Do not answer any question; only summarize.' },
        { role: 'user', content: `Summarize this earlier conversation, preserving all concrete facts and values verbatim:\n\n${transcript}` },
      ],
    } as unknown as LlamaParamsNonStreaming;
    const res = await this.forwarder.chatCompletion(params);
    return res.choices?.[0]?.message?.content ?? '';
  }

  /**
   * Evicts oldest messages (between the system prefix and the recency buffer) until under the target token count.
   * Never removes system messages (when preserved) or messages in the recency buffer, and keeps assistant→tool pairs intact.
   * @param history - message array mutated in place
   * @param target - token budget to reach
   * @param opts - compression options
   * @returns count of messages removed
   */
  private async evictOldestToTarget(history: MutableMessage[], target: number, opts: CompressionOptionsDto): Promise<number> {
    let dropped = 0;
    let tokens = await this.countOrEstimate(history);

    while (tokens > target) {
      const headKeep = this.computeHeadKeepCount(history, opts);
      const keepRecent = this.computeKeepRecentCount(history, opts, 2);
      const recencyStart = Math.max(headKeep, history.length - keepRecent);
      if (recencyStart <= headKeep) break;

      let removeIdx = -1;
      for (let i = headKeep; i < recencyStart; i++) {
        if (history[i].role !== 'tool') { removeIdx = i; break; }
      }
      if (removeIdx < 0) break;

      let removeCount = 1;
      const m = history[removeIdx];
      if (m.role === 'assistant' && (m.tool_calls?.length ?? 0) > 0) {
        while (removeIdx + removeCount < recencyStart && history[removeIdx + removeCount].role === 'tool') removeCount++;
      }
      history.splice(removeIdx, removeCount);
      dropped += removeCount;
      tokens = await this.countOrEstimate(history);
    }
    return dropped;
  }

  /**
   * Counts the number of leading system messages in the history.
   * @param history - message array
   */
  private leadingSystemCount(history: MutableMessage[]): number {
    let n = 0;
    while (n < history.length && history[n].role === 'system') n++;
    return n;
  }

  /**
   * Computes how many leading messages to protect from summarization/eviction: the leading system message(s)
   * (when preserved) plus the first user message (when preserved) — that message usually holds the task/goal/facts.
   * @param history - message array
   * @param opts - compression options
   */
  private computeHeadKeepCount(history: MutableMessage[], opts: CompressionOptionsDto): number {
    const sysCount = opts.preserveSystemPrompt !== false ? this.leadingSystemCount(history) : 0;
    if (opts.preserveFirstUserMessage !== false && history[sysCount]?.role === 'user') return sysCount + 1;
    return sysCount;
  }

  /**
   * Computes how many trailing messages to keep verbatim, from keepRecentMessages or keepRecentTokens.
   * @param history - message array
   * @param opts - compression options
   * @param fallback - default message count when neither option is set
   */
  private computeKeepRecentCount(history: MutableMessage[], opts: CompressionOptionsDto, fallback: number): number {
    if (opts.keepRecentTokens) {
      let sum = 0;
      let count = 0;
      for (let i = history.length - 1; i >= 0; i--) {
        sum += this.estimateMessageTokens(history[i]);
        if (sum > opts.keepRecentTokens) break;
        count++;
      }
      return Math.max(1, count);
    }
    return opts.keepRecentMessages ?? fallback;
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
   * Counts tokens for a message history via llama.cpp, falling back to a char-based estimate on error.
   * @param history - messages to count
   */
  private async countOrEstimate(history: MutableMessage[]): Promise<number> {
    try {
      return await this.forwarder.countTokens({ systemPrompt: '', messages: history as unknown as ChatCompletionMessageParam[], tools: [] });
    } catch {
      return this.estimateHistoryTokens(history);
    }
  }

  /**
   * Estimates total tokens for a message history using character heuristics.
   * @param history - messages to estimate
   */
  private estimateHistoryTokens(history: MutableMessage[]): number {
    return history.reduce((sum, m) => sum + this.estimateMessageTokens(m), 0);
  }

  /**
   * Estimates tokens for a single message using character heuristics plus a fixed overhead.
   * @param m - message to estimate
   */
  private estimateMessageTokens(m: MutableMessage): number {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
    return Math.ceil(content.length / CHARS_PER_TOKEN) + 4;
  }
}
