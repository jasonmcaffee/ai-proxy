import { Test } from '@nestjs/testing';
import { RetryExecutorService } from '../../src/services/retryExecutor.service';
import { LlamaForwarderService } from '../../src/services/llamaForwarder.service';

const makeMockForwarder = (responses: (() => Promise<unknown>)[]) => {
  let callCount = 0;
  return {
    chatCompletion: jest.fn(async () => {
      const fn = responses[Math.min(callCount++, responses.length - 1)];
      return fn();
    }),
  };
};

const okCompletion = (content: string) => ({
  choices: [{ message: { content, role: 'assistant' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
});

const reasoningOnlyCompletion = (reasoningContent: string) => ({
  choices: [{ message: { content: '', role: 'assistant', reasoning_content: reasoningContent }, finish_reason: 'stop' }],
});

describe('RetryExecutorService', () => {
  let service: RetryExecutorService;

  const buildModule = async (mockForwarder: Partial<LlamaForwarderService>) => {
    const module = await Test.createTestingModule({
      providers: [
        RetryExecutorService,
        { provide: LlamaForwarderService, useValue: mockForwarder },
      ],
    }).compile();
    return module.get(RetryExecutorService);
  };

  describe('M1 — upstream 500 then 200', () => {
    it('retries once and returns success', async () => {
      const mockForwarder = makeMockForwarder([
        () => Promise.reject(new Error('500 Internal Server Error')),
        () => Promise.resolve(okCompletion('Hello!')),
      ]);
      service = await buildModule(mockForwarder as any);

      const result = await service.invoke({ messages: [{ role: 'user', content: 'hi' }] }) as any;
      expect(result.choices[0].message.content).toBe('Hello!');
      expect(mockForwarder.chatCompletion).toHaveBeenCalledTimes(2);
    });
  });

  describe('M2 — upstream 500 x 9 (exceeds max retries)', () => {
    it('throws after exhausting retries and calls forwarder 8 times', async () => {
      // Patch sleep to resolve immediately to avoid waiting 2–30 s per retry
      jest.spyOn(global, 'setTimeout').mockImplementation((fn: any) => { fn(); return 0 as any; });

      const mockForwarder = makeMockForwarder([
        () => Promise.reject(new Error('500 Internal Server Error')),
      ]);
      service = await buildModule(mockForwarder as any);

      await expect(service.invoke({ messages: [{ role: 'user', content: 'hi' }] }))
        .rejects.toThrow('500 Internal Server Error');
      expect(mockForwarder.chatCompletion).toHaveBeenCalledTimes(8);

      jest.restoreAllMocks();
    });
  });

  describe('M3 — reasoning-only response then valid response', () => {
    it('appends recovery message and returns valid content on retry', async () => {
      const mockForwarder = makeMockForwarder([
        () => Promise.resolve(reasoningOnlyCompletion('I am thinking about the problem...')),
        () => Promise.resolve(okCompletion('The answer is 42.')),
      ]);
      service = await buildModule(mockForwarder as any);

      const result = await service.invoke({ messages: [{ role: 'user', content: 'What is the answer?' }] }) as any;
      expect(result.choices[0].message.content).toBe('The answer is 42.');

      const secondCall = (mockForwarder.chatCompletion.mock.calls as any)[1][0] as any;
      const lastMsg = secondCall.messages[secondCall.messages.length - 1];
      expect(lastMsg.role).toBe('user');
      expect(lastMsg.content).toContain('I am thinking about the problem...');
      expect(lastMsg.content).toContain('Please continue');
    });
  });
});
