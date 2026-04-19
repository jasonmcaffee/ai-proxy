import { Test } from '@nestjs/testing';
import { StreamBufferService } from '../../src/services/streamBuffer.service';
import { LlamaForwarderService } from '../../src/services/llamaForwarder.service';
import { Readable } from 'stream';
import { encodeSseLine } from '../../src/utils/sse';

function makeStream(lines: string[]): Readable {
  const content = lines.join('\n') + '\n';
  return Readable.from([Buffer.from(content)]);
}

function makeDeltaLine(delta: object, finishReason: string | null = null): string {
  const chunk = {
    id: 'chatcmpl-test',
    object: 'chat.completion.chunk',
    created: 1234567890,
    model: 'local-model',
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
  return `data: ${JSON.stringify(chunk)}`;
}

async function collectStream(stream: Readable): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk.toString());
  }
  return chunks;
}

function parseDataLines(raw: string[]): any[] {
  return raw
    .join('')
    .split('\n')
    .filter(l => l.startsWith('data: ') && !l.includes('[DONE]'))
    .map(l => {
      try { return JSON.parse(l.slice('data: '.length)); } catch { return null; }
    })
    .filter(Boolean);
}

describe('StreamBufferService', () => {
  let service: StreamBufferService;
  let mockForwarder: jest.Mocked<Partial<LlamaForwarderService>>;

  beforeEach(async () => {
    mockForwarder = {
      chatCompletionStream: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        StreamBufferService,
        { provide: LlamaForwarderService, useValue: mockForwarder },
      ],
    }).compile();

    service = module.get(StreamBufferService);
  });

  describe('M5 — malformed SSE chunk does not abort stream', () => {
    it('forwards malformed chunk raw and continues parsing valid chunks', async () => {
      const lines = [
        'data: this is not json {{{',
        '',
        makeDeltaLine({ content: 'Hello' }),
        '',
        makeDeltaLine({}, 'stop'),
        '',
        'data: [DONE]',
        '',
      ];
      mockForwarder.chatCompletionStream.mockResolvedValue(makeStream(lines));

      const { stream } = await service.pipe({ model: 'local-model', messages: [], stream: true }, false);
      const chunks = await collectStream(stream);
      const joined = chunks.join('');

      expect(joined).toContain('this is not json');
      expect(joined).toContain('Hello');
    });
  });

  describe('awaitToolCallCompletion=false', () => {
    it('passes tool call deltas through individually', async () => {
      const lines = [
        makeDeltaLine({ content: 'I will' }),
        '',
        makeDeltaLine({ tool_calls: [{ index: 0, id: 'tc1', type: 'function', function: { name: 'add', arguments: '{"a"' } }] }),
        '',
        makeDeltaLine({ tool_calls: [{ index: 0, function: { arguments: ':1,"b":2}' } }] }),
        '',
        makeDeltaLine({}, 'tool_calls'),
        '',
        'data: [DONE]',
        '',
      ];
      mockForwarder.chatCompletionStream.mockResolvedValue(makeStream(lines));

      const { stream } = await service.pipe({ model: 'local-model', messages: [], stream: true }, false);
      const chunks = await collectStream(stream);
      const parsed = parseDataLines(chunks);

      const toolCallChunks = parsed.filter(p => p.choices?.[0]?.delta?.tool_calls?.length);
      expect(toolCallChunks.length).toBeGreaterThan(1);
    });
  });

  describe('awaitToolCallCompletion=true', () => {
    it('emits exactly one consolidated tool_calls chunk', async () => {
      const lines = [
        makeDeltaLine({ content: '' }),
        '',
        makeDeltaLine({ tool_calls: [{ index: 0, id: 'tc1', type: 'function', function: { name: 'add', arguments: '{"a"' } }] }),
        '',
        makeDeltaLine({ tool_calls: [{ index: 0, function: { arguments: ':1,"b":2}' } }] }),
        '',
        makeDeltaLine({}, 'tool_calls'),
        '',
        'data: [DONE]',
        '',
      ];
      mockForwarder.chatCompletionStream.mockResolvedValue(makeStream(lines));

      const { stream } = await service.pipe({ model: 'local-model', messages: [], stream: true }, true);
      const chunks = await collectStream(stream);
      const parsed = parseDataLines(chunks);

      const toolCallChunks = parsed.filter(p => p.choices?.[0]?.delta?.tool_calls?.length);
      expect(toolCallChunks.length).toBe(1);

      const tc = toolCallChunks[0].choices[0].delta.tool_calls[0];
      expect(tc.function.name).toBe('add');
      expect(tc.function.arguments).toBe('{"a":1,"b":2}');
    });
  });
});
