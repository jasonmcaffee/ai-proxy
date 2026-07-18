import { Test } from '@nestjs/testing';
import { ContextCompressorService } from '../../src/services/contextCompressor.service';
import { LlamaForwarderService } from '../../src/services/llamaForwarder.service';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const makeImageMessage = (role = 'user'): ChatCompletionMessageParam => ({
  role: role as any,
  content: [
    { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
    { type: 'text', text: 'What is in this image?' },
  ] as any,
});

const makeTextMessage = (role: string, content: string): ChatCompletionMessageParam => ({ role: role as any, content });

describe('ContextCompressorService', () => {
  let service: ContextCompressorService;
  let mockForwarder: jest.Mocked<Partial<LlamaForwarderService>>;

  beforeEach(async () => {
    mockForwarder = {
      countTokens: jest.fn(),
      getContextLength: jest.fn().mockResolvedValue(200000),
      chatCompletion: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        ContextCompressorService,
        { provide: LlamaForwarderService, useValue: mockForwarder },
      ],
    }).compile();

    service = module.get(ContextCompressorService);
  });

  describe('no-op when disabled', () => {
    it('returns messages unchanged with null meta when enabled is false', async () => {
      const messages = [makeTextMessage('user', 'hello')];
      const result = await service.compress(messages, { enabled: false });
      expect(result.messages).toEqual(messages);
      expect(result.meta).toBeNull();
    });

    it('returns messages unchanged when compressionOptions is undefined', async () => {
      const messages = [makeTextMessage('user', 'hello')];
      const result = await service.compress(messages, undefined);
      expect(result.messages).toEqual(messages);
      expect(result.meta).toBeNull();
    });
  });

  describe('no-op below trigger (cache-safe) but returns meta', () => {
    it('returns unchanged messages and compressed=false when under compressAtTokens', async () => {
      mockForwarder.countTokens!.mockResolvedValue(500);
      const messages = [makeTextMessage('user', 'hi'), makeTextMessage('assistant', 'hello')];
      const result = await service.compress(messages, { enabled: true, compressAtTokens: 100000, onlyKeepLatestImage: false });
      expect(result.messages.length).toBe(2);
      expect(result.meta).not.toBeNull();
      expect(result.meta!.compressed).toBe(false);
      expect(result.meta!.contextLimit).toBe(200000);
      expect(result.meta!.compressAtTokens).toBe(100000);
      expect(result.meta!.tokensUntilCompression).toBe(99500);
    });
  });

  describe('image deduplication', () => {
    it('clears older image messages, keeps newest', async () => {
      mockForwarder.countTokens!.mockResolvedValue(50);
      const messages: ChatCompletionMessageParam[] = [
        makeTextMessage('user', 'first question'),
        makeImageMessage('user'),
        makeTextMessage('assistant', 'I see an image'),
        makeTextMessage('user', 'second question'),
        makeImageMessage('user'),
      ];
      const result = await service.compress(messages, { enabled: true, maxContextSize: 100000 });
      expect(result.messages[1].content).toBe('');
      const lastImg = result.messages[4].content as any[];
      expect(lastImg.some((p: any) => p.type === 'image_url')).toBe(true);
      expect(result.meta!.compressed).toBe(true);
    });
  });

  describe('sliding-window eviction', () => {
    it('evicts oldest non-system messages when over target, preserving recency + system', async () => {
      // eviction tracks tokens with the char-based estimate (task-478: no per-message /count_tokens
      // round-trip), so message content must be long enough that the estimate exceeds the target.
      mockForwarder.countTokens!.mockImplementation(async ({ messages }: any) => messages.length * 200);
      const pad = (s: string) => `${s} ${'x'.repeat(400)}`;
      const messages: ChatCompletionMessageParam[] = [
        makeTextMessage('system', pad('system prompt')),
        makeTextMessage('user', pad('old 1')),
        makeTextMessage('assistant', pad('old resp 1')),
        makeTextMessage('user', pad('old 2')),
        makeTextMessage('assistant', pad('old resp 2')),
        makeTextMessage('user', pad('recent')),
      ];
      const result = await service.compress(messages, { enabled: true, compressAtTokens: 100, targetTokens: 100, keepRecentMessages: 1, onlyKeepLatestImage: false });
      expect(result.messages.length).toBeLessThan(messages.length);
      // system preserved at front
      expect(result.messages[0].role).toBe('system');
      // most recent preserved at end
      expect((result.messages[result.messages.length - 1].content as string)).toContain('recent');
      expect(result.meta!.droppedMessages).toBeGreaterThan(0);
    });

    it('keeps an assistant→tool pair together', async () => {
      mockForwarder.countTokens!.mockImplementation(async ({ messages }: any) => messages.length * 200);
      const pad = (s: string) => `${s} ${'x'.repeat(400)}`;
      const messages: ChatCompletionMessageParam[] = [
        makeTextMessage('user', pad('old')),
        { role: 'assistant', content: pad('calling tool'), tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'calc', arguments: '{}' } }] as any },
        { role: 'tool', content: pad('result'), tool_call_id: 'tc1' } as any,
      ];
      const result = await service.compress(messages, { enabled: true, compressAtTokens: 10, targetTokens: 10, keepRecentMessages: 2, onlyKeepLatestImage: false });
      const hasPair = result.messages.some(m => m.role === 'assistant' && (m as any).tool_calls?.length);
      expect(hasPair).toBe(true);
    });
  });

  describe('summarize strategy', () => {
    it('replaces older turns with one summary message', async () => {
      mockForwarder.countTokens!.mockImplementation(async ({ messages }: any) => messages.length * 200);
      mockForwarder.chatCompletion!.mockResolvedValue({ choices: [{ message: { role: 'assistant', content: 'SUMMARY: capitals discussed' } }] } as any);
      const messages: ChatCompletionMessageParam[] = [
        makeTextMessage('system', 'sys'),
        makeTextMessage('user', 'q1'), makeTextMessage('assistant', 'a1'),
        makeTextMessage('user', 'q2'), makeTextMessage('assistant', 'a2'),
        makeTextMessage('user', 'q3'), makeTextMessage('assistant', 'a3'),
        makeTextMessage('user', 'recent q'),
      ];
      const result = await service.compress(messages, { enabled: true, strategy: 'summarize', compressAtTokens: 1000, targetTokens: 1000, keepRecentMessages: 2, onlyKeepLatestImage: false });
      const summaryMsg = result.messages.find(m => typeof m.content === 'string' && (m.content as string).includes('Conversation summary'));
      expect(summaryMsg).toBeDefined();
      expect(mockForwarder.chatCompletion).toHaveBeenCalled();
      expect(result.meta!.summarizedMessages).toBeGreaterThan(0);
    });

    it('falls back to eviction when summary call fails', async () => {
      mockForwarder.countTokens!.mockImplementation(async ({ messages }: any) => messages.length * 200);
      mockForwarder.chatCompletion!.mockRejectedValue(new Error('llm down'));
      const pad = (s: string) => `${s} ${'x'.repeat(400)}`;
      const messages: ChatCompletionMessageParam[] = [
        makeTextMessage('system', pad('sys')),
        makeTextMessage('user', pad('q1')), makeTextMessage('assistant', pad('a1')),
        makeTextMessage('user', pad('q2')), makeTextMessage('assistant', pad('a2')),
        makeTextMessage('user', pad('recent')),
      ];
      const result = await service.compress(messages, { enabled: true, strategy: 'summarize', compressAtTokens: 1000, targetTokens: 300, keepRecentMessages: 1, onlyKeepLatestImage: false });
      expect(result.meta!.summarizedMessages).toBe(0);
      // eviction still happened
      expect(result.meta!.droppedMessages).toBeGreaterThan(0);
    });
  });

  describe('tool-result truncation', () => {
    it('middle-clips older tool results, keeps recent verbatim', async () => {
      mockForwarder.countTokens!.mockResolvedValue(50);
      const big = 'X'.repeat(10000);
      const small = 'recent tool output';
      const messages: ChatCompletionMessageParam[] = [
        makeTextMessage('user', 'q'),
        { role: 'tool', content: big, tool_call_id: 't1' } as any,
        { role: 'tool', content: small, tool_call_id: 't2' } as any,
      ];
      const result = await service.compress(messages, {
        enabled: true, compressAtTokens: 100000, onlyKeepLatestImage: false,
        truncateToolResults: { enabled: true, maxToolResultTokens: 100, keepRecentToolResults: 1 },
      });
      expect((result.messages[1].content as string).length).toBeLessThan(big.length);
      expect((result.messages[1].content as string)).toContain('truncated');
      expect(result.messages[2].content).toBe(small);
      expect(result.meta!.truncatedToolResults).toBe(1);
    });
  });

  describe('image dedup scope tool-only (aiDesigner)', () => {
    it('dedupes tool screenshots but preserves user asset images', async () => {
      mockForwarder.countTokens!.mockResolvedValue(50);
      const toolImg = (id: string): ChatCompletionMessageParam => ({ role: 'tool', tool_call_id: id, content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,screenshot' } }] as any } as any);
      const userImg = (): ChatCompletionMessageParam => ({ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,asset' } }, { type: 'text', text: 'asset' }] as any });
      const messages: ChatCompletionMessageParam[] = [
        userImg(),        // 0: user asset (must be preserved)
        toolImg('t1'),    // 1: old screenshot (cleared)
        userImg(),        // 2: user asset (must be preserved)
        toolImg('t2'),    // 3: latest screenshot (kept)
      ];
      const result = await service.compress(messages, { enabled: true, compressAtTokens: 100000, onlyKeepLatestImage: true, imageDedupeScope: 'tool-only' });
      // user asset images intact
      expect(Array.isArray(result.messages[0].content)).toBe(true);
      expect(Array.isArray(result.messages[2].content)).toBe(true);
      // old tool screenshot cleared, latest tool screenshot kept
      expect(result.messages[1].content).toBe('');
      expect(Array.isArray(result.messages[3].content)).toBe(true);
    });
  });

  describe('trigger clamped to detected context window (task-569 single-owner safety cap)', () => {
    it('caps an over-large compressAtTokens down to ~95% of n_ctx', async () => {
      // n_ctx = 100000 → ceiling = floor(100000 * 0.95) = 95000. A stale client value of 1,000,000 is clamped.
      mockForwarder.getContextLength!.mockResolvedValue(100000);
      mockForwarder.countTokens!.mockResolvedValue(500);
      const result = await service.compress([makeTextMessage('user', 'hi')], { enabled: true, compressAtTokens: 1000000, onlyKeepLatestImage: false });
      expect(result.meta!.compressAtTokens).toBe(95000);
    });

    it('leaves a compressAtTokens already under the window untouched', async () => {
      mockForwarder.getContextLength!.mockResolvedValue(100000);
      mockForwarder.countTokens!.mockResolvedValue(500);
      const result = await service.compress([makeTextMessage('user', 'hi')], { enabled: true, compressAtTokens: 40000, onlyKeepLatestImage: false });
      expect(result.meta!.compressAtTokens).toBe(40000);
    });
  });

  describe('context-usage meta math', () => {
    it('computes usedPct against the context limit', async () => {
      mockForwarder.countTokens!.mockResolvedValue(20000);
      const result = await service.compress([makeTextMessage('user', 'hi')], { enabled: true, compressAtTokens: 100000, contextLimit: 200000, onlyKeepLatestImage: false });
      expect(result.meta!.inputTokens).toBe(20000);
      expect(result.meta!.usedPct).toBeCloseTo(10, 1);
    });
  });
});
