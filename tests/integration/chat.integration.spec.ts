import OpenAI from '../../client';
import type { ChatCompletionChunk, ChatCompletionTool, ChatCompletionMessageParam } from '../../client';

const BASE_URL = process.env.PROXY_URL || 'http://localhost:4142';
const openai = new OpenAI({ baseURL: BASE_URL });

const CALCULATOR_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'add',
    description: 'Add two numbers',
    parameters: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'First number' },
        b: { type: 'number', description: 'Second number' },
      },
      required: ['a', 'b'],
    },
  },
};

/**
 * Collects all deltas and finish reasons from a streaming chat completion.
 * @param stream - async iterable of ChatCompletionChunks from the client
 */
async function collectStream(stream: AsyncIterable<ChatCompletionChunk>): Promise<{ deltas: any[]; finishReasons: string[] }> {
  const deltas: any[] = [];
  const finishReasons: string[] = [];
  for await (const chunk of stream) {
    const choice = chunk.choices?.[0];
    if (choice?.delta) deltas.push(choice.delta);
    if (choice?.finish_reason) finishReasons.push(choice.finish_reason);
  }
  return { deltas, finishReasons };
}

describe('Integration — chat completions (requires proxy on :4142 and llama.cpp on :8080)', () => {

  describe('I1 — non-stream simple chat', () => {
    it('returns content in OpenAI shape', async () => {
      const result = await openai.chat.completions.create({
        messages: [{ role: 'user', content: 'Say the single word: hello' }],
        model: 'local-model',
        temperature: 0.1,
      });

      expect(result.choices).toBeDefined();
      expect(result.choices.length).toBeGreaterThan(0);
      const content = result.choices[0].message?.content;
      expect(typeof content).toBe('string');
      expect((content as string).trim().length).toBeGreaterThan(0);
      expect(result.object).toBe('chat.completion');
    }, 60000);
  });

  describe('I2 — non-stream with tool call', () => {
    it('returns a tool_call for the calculator', async () => {
      const result = await openai.chat.completions.create({
        messages: [{ role: 'user', content: 'Use the add tool to calculate 3 + 4. You must call the add function.' }],
        model: 'local-model',
        tools: [CALCULATOR_TOOL],
        temperature: 0.1,
      });

      const msg = result.choices[0].message;
      const toolCalls = msg.tool_calls;
      expect(Array.isArray(toolCalls)).toBe(true);
      expect(toolCalls!.length).toBeGreaterThan(0);
      const tc = toolCalls![0] as any;
      expect(tc.function.name).toBe('add');
      const args = JSON.parse(tc.function.arguments);
      expect(typeof args.a).toBe('number');
      expect(typeof args.b).toBe('number');
    }, 90000);
  });

  describe('I3 — streaming simple chat', () => {
    it('receives multiple content deltas and finish_reason=stop', async () => {
      const stream = await openai.chat.completions.create({
        messages: [{ role: 'user', content: 'Count from 1 to 5, one number per word.' }],
        model: 'local-model',
        temperature: 0.1,
        stream: true,
      });

      const { deltas, finishReasons } = await collectStream(stream);
      const contentDeltas = deltas.filter(d => d.content);
      expect(contentDeltas.length).toBeGreaterThanOrEqual(2);
      expect(finishReasons).toContain('stop');
    }, 60000);
  });

  describe('I4 — streaming with tool, awaitToolCallCompletion=false', () => {
    it('receives tool_calls deltas', async () => {
      const stream = await openai.chat.completions.create({
        messages: [{ role: 'user', content: 'Use the add tool to calculate 10 + 20. You must call the add function.' }],
        model: 'local-model',
        tools: [CALCULATOR_TOOL],
        temperature: 0.1,
        stream: true,
        awaitToolCallCompletion: false,
      });

      const { deltas } = await collectStream(stream);
      const toolDeltas = deltas.filter(d => d.tool_calls?.length);
      expect(toolDeltas.length).toBeGreaterThanOrEqual(1);
    }, 60000);
  });

  describe('I5 — streaming with tool, awaitToolCallCompletion=true', () => {
    it('receives exactly one consolidated tool_calls chunk with full JSON args', async () => {
      const stream = await openai.chat.completions.create({
        messages: [{ role: 'user', content: 'Use the add tool to calculate 7 + 8. You must call the add function.' }],
        model: 'local-model',
        tools: [CALCULATOR_TOOL],
        temperature: 0.1,
        stream: true,
        awaitToolCallCompletion: true,
      });

      const { deltas } = await collectStream(stream);
      const toolDeltas = deltas.filter(d => d.tool_calls?.length);
      expect(toolDeltas.length).toBe(1);

      const tc = toolDeltas[0].tool_calls[0];
      expect(tc.function.name).toBe('add');
      const args = JSON.parse(tc.function.arguments);
      expect(typeof args.a).toBe('number');
      expect(typeof args.b).toBe('number');
    }, 90000);
  });

  describe('I6 — compressionOptions evicts old messages', () => {
    it('succeeds when oversized history is compressed before forwarding', async () => {
      const longHistory: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'What is the capital of France?' },
        { role: 'assistant', content: 'The capital of France is Paris.' },
        { role: 'user', content: 'What is the capital of Germany?' },
        { role: 'assistant', content: 'The capital of Germany is Berlin.' },
        { role: 'user', content: 'What is the capital of Spain?' },
        { role: 'assistant', content: 'The capital of Spain is Madrid.' },
        { role: 'user', content: 'What is the capital of Italy?' },
        { role: 'assistant', content: 'The capital of Italy is Rome.' },
        { role: 'user', content: 'Say: ok' },
      ];

      const result = await openai.chat.completions.create({
        messages: longHistory,
        model: 'local-model',
        temperature: 0.1,
        compressionOptions: { enabled: true, maxContextSize: 500 },
      });

      expect(result.choices[0].message?.content).toBeTruthy();
    }, 60000);
  });

  describe('I7 — compressionOptions deduplicates images', () => {
    it('accepts request with two image messages and returns a response', async () => {
      const imageContent = [
        { type: 'image_url' as const, image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' } },
        { type: 'text' as const, text: 'What color is this image?' },
      ];

      const result = await openai.chat.completions.create({
        model: 'local-model',
        temperature: 0.1,
        compressionOptions: { enabled: true, maxContextSize: 100000 },
        messages: [
          { role: 'user', content: imageContent },
          { role: 'assistant', content: 'I see a blank image.' },
          { role: 'user', content: imageContent },
        ],
      });

      expect(result.choices[0].message?.content).toBeTruthy();
    }, 60000);
  });

  describe('I8 — vision request passes through unchanged', () => {
    it('forwards a single image message and returns assistant content', async () => {
      const result = await openai.chat.completions.create({
        model: 'local-model',
        temperature: 0.1,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' } },
              { type: 'text', text: 'What color is this image? Answer in one word.' },
            ],
          },
        ],
      });

      expect(result.choices[0].message?.content).toBeTruthy();
    }, 60000);
  });

  describe('I9 — abort signal propagation', () => {
    it('aborts a non-streaming request before llama.cpp responds', async () => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 50);

      await expect(
        openai.chat.completions.create(
          {
            messages: [{ role: 'user', content: 'Write a very long detailed essay of at least 2000 words about the history of computing.' }],
            model: 'local-model',
            temperature: 0.1,
            disableThinking: true,
          },
          { signal: controller.signal },
        ),
      ).rejects.toThrow(/abort/i);
    }, 15000);

    it('aborts a streaming request mid-stream and proxy remains healthy', async () => {
      const controller = new AbortController();

      const stream = await openai.chat.completions.create(
        {
          messages: [{ role: 'user', content: 'Count from 1 to 100.' }],
          model: 'local-model',
          temperature: 0.1,
          stream: true,
          disableThinking: true,
        },
        { signal: controller.signal },
      );

      let chunkCount = 0;
      for await (const chunk of stream) {
        chunkCount++;
        if (chunkCount >= 1) break;
      }

      expect(chunkCount).toBeGreaterThanOrEqual(1);

      const health = await openai.models.listModels();
      expect(health.data.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('I10 — disableThinking suppresses reasoning_content', () => {
    it('returns blank reasoning_content when disableThinking=true', async () => {
      const result = await openai.chat.completions.create({
        messages: [{ role: 'user', content: 'Say the single word: hello' }],
        model: 'local-model',
        temperature: 0.1,
        disableThinking: true,
      });

      expect(result.choices).toBeDefined();
      expect(result.choices.length).toBeGreaterThan(0);
      const msg = result.choices[0].message as any;
      const reasoningContent = msg.reasoning_content ?? msg.reasoningContent;
      expect(!reasoningContent || reasoningContent.trim() === '').toBe(true);
    }, 60000);
  });

  describe('Models endpoint', () => {
    it('GET /v1/models returns model list', async () => {
      const result = await openai.models.listModels();
      expect(result.object).toBe('list');
      expect(result.data.length).toBeGreaterThan(0);
    }, 10000);
  });

});
