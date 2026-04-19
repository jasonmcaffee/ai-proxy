import { Test } from '@nestjs/testing';
import { ContextCompressorService } from '../../src/services/contextCompressor.service';
import { LlamaForwarderService } from '../../src/services/llamaForwarder.service';
import { ChatMessage } from '../../src/services/llamaForwarder.service';

const makeImageMessage = (role = 'user'): ChatMessage => ({
  role,
  content: [
    { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
    { type: 'text', text: 'What is in this image?' },
  ],
});

const makeTextMessage = (role: string, content: string): ChatMessage => ({ role, content });

describe('ContextCompressorService', () => {
  let service: ContextCompressorService;
  let mockForwarder: jest.Mocked<Partial<LlamaForwarderService>>;

  beforeEach(async () => {
    mockForwarder = {
      countTokens: jest.fn(),
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
    it('returns messages unchanged when enabled is false', async () => {
      const messages = [makeTextMessage('user', 'hello')];
      const result = await service.compress(messages, { enabled: false });
      expect(result).toEqual(messages);
    });

    it('returns messages unchanged when compressionOptions is undefined', async () => {
      const messages = [makeTextMessage('user', 'hello')];
      const result = await service.compress(messages, undefined);
      expect(result).toEqual(messages);
    });
  });

  describe('M6 — image deduplication', () => {
    it('clears older image messages, keeps newest', async () => {
      mockForwarder.countTokens.mockResolvedValue(50);

      const messages: ChatMessage[] = [
        makeTextMessage('user', 'first question'),
        makeImageMessage('user'),
        makeTextMessage('assistant', 'I see an image'),
        makeTextMessage('user', 'second question'),
        makeImageMessage('user'),
      ];

      const result = await service.compress(messages, { enabled: true, maxContextSize: 100 });

      // First image message content should be cleared
      expect(result[1].content).toBe('');
      // Last image message should be preserved
      const lastImg = result[4].content as any[];
      expect(lastImg.some((p: any) => p.type === 'image_url')).toBe(true);
    });
  });

  describe('older-message eviction', () => {
    it('evicts messages from the front when over token limit', async () => {
      let callCount = 0;
      mockForwarder.countTokens.mockImplementation(async () => {
        // First call: over limit; subsequent calls: under limit
        return callCount++ === 0 ? 1000 : 50;
      });

      const messages: ChatMessage[] = [
        makeTextMessage('user', 'old message 1'),
        makeTextMessage('assistant', 'old response 1'),
        makeTextMessage('user', 'recent message'),
        makeTextMessage('assistant', 'recent response'),
      ];

      const result = await service.compress(messages, { enabled: true, maxContextSize: 100 });
      expect(result.length).toBeLessThan(messages.length);
    });

    it('preserves the last assistant→tool pair', async () => {
      let callCount = 0;
      mockForwarder.countTokens.mockImplementation(async () => {
        return callCount++ === 0 ? 500 : 50;
      });

      const messages: ChatMessage[] = [
        makeTextMessage('user', 'old'),
        {
          role: 'assistant',
          content: 'calling tool',
          tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'calc', arguments: '{}' } }] as any,
        },
        { role: 'tool', content: 'result', tool_call_id: 'tc1' },
      ];

      const result = await service.compress(messages, { enabled: true, maxContextSize: 10 });
      // The assistant+tool pair should be preserved
      const hasToolPair = result.some(m => m.role === 'assistant' && (m as any).tool_calls?.length);
      expect(hasToolPair).toBe(true);
    });
  });
});
