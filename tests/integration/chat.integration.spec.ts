import OpenAI from '../../client';
import type { ChatCompletionTool } from '../../client';

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
 * Reads an SSE stream from a fetch Response body and returns all parsed delta objects.
 * @param response - raw fetch Response with SSE body
 */
async function readSseStream(response: Response): Promise<{ deltas: any[]; finishReasons: string[] }> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const deltas: any[] = [];
  const finishReasons: string[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice('data: '.length).trim();
      if (data === '[DONE]') continue;
      try {
        const chunk = JSON.parse(data);
        const choice = chunk.choices?.[0];
        if (choice?.delta) deltas.push(choice.delta);
        if (choice?.finish_reason) finishReasons.push(choice.finish_reason);
      } catch { /* skip malformed */ }
    }
  }
  return { deltas, finishReasons };
}

/**
 * Calls the proxy streaming endpoint and returns raw fetch Response.
 * @param body - chat completion request body
 */
async function streamRaw(body: object): Promise<Response> {
  return fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, stream: true }),
  });
}

describe('Integration — chat completions (requires proxy on :4141 and llama.cpp on :8080)', () => {

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
      const response = await streamRaw({
        messages: [{ role: 'user', content: 'Count from 1 to 5, one number per word.' }],
        model: 'local-model',
        temperature: 0.1,
      });

      expect(response.ok).toBe(true);
      const { deltas, finishReasons } = await readSseStream(response);
      const contentDeltas = deltas.filter(d => d.content);
      expect(contentDeltas.length).toBeGreaterThanOrEqual(2);
      expect(finishReasons).toContain('stop');
    }, 60000);
  });

  describe('I4 — streaming with tool, awaitToolCallCompletion=false', () => {
    it('receives tool_calls deltas', async () => {
      const response = await streamRaw({
        messages: [{ role: 'user', content: 'Use the add tool to calculate 10 + 20. You must call the add function.' }],
        model: 'local-model',
        tools: [{ type: 'function', function: { name: 'add', description: 'Add two numbers', parameters: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] } } }],
        temperature: 0.1,
        awaitToolCallCompletion: false,
      });

      expect(response.ok).toBe(true);
      const { deltas, finishReasons } = await readSseStream(response);
      const toolDeltas = deltas.filter(d => d.tool_calls?.length);
      expect(toolDeltas.length).toBeGreaterThanOrEqual(1);
    }, 60000);
  });

  describe('I5 — streaming with tool, awaitToolCallCompletion=true', () => {
    it('receives exactly one consolidated tool_calls chunk with full JSON args', async () => {
      const response = await streamRaw({
        messages: [{ role: 'user', content: 'Use the add tool to calculate 7 + 8. You must call the add function.' }],
        model: 'local-model',
        tools: [{ type: 'function', function: { name: 'add', description: 'Add two numbers', parameters: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] } } }],
        temperature: 0.1,
        awaitToolCallCompletion: true,
      });

      expect(response.ok).toBe(true);
      const { deltas, finishReasons } = await readSseStream(response);
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
      const longHistory = [
        { role: 'user', content: 'What is the capital of France?' },
        { role: 'assistant', content: 'The capital of France is Paris.' },
        { role: 'user', content: 'What is the capital of Germany?' },
        { role: 'assistant', content: 'The capital of Germany is Berlin.' },
        { role: 'user', content: 'What is the capital of Spain?' },
        { role: 'assistant', content: 'The capital of Spain is Madrid.' },
        { role: 'user', content: 'What is the capital of Italy?' },
        { role: 'assistant', content: 'The capital of Italy is Rome.' },
      ];

      const result = await openai.chat.completions.create({
        messages: [...longHistory, { role: 'user', content: 'Say: ok' }] as any,
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
        { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' } },
        { type: 'text', text: 'What color is this image?' },
      ];

      const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'local-model',
          temperature: 0.1,
          compressionOptions: { enabled: true, maxContextSize: 100000 },
          messages: [
            { role: 'user', content: imageContent },
            { role: 'assistant', content: 'I see a blank image.' },
            { role: 'user', content: imageContent },
          ],
        }),
      });

      expect(res.ok).toBe(true);
      const result = await res.json() as any;
      expect(result.choices[0].message?.content).toBeTruthy();
    }, 60000);
  });

  describe('I8 — vision request passes through unchanged', () => {
    it('forwards a single image message and returns assistant content', async () => {
      const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        }),
      });

      expect(res.ok).toBe(true);
      const result = await res.json() as any;
      expect(result.choices[0].message?.content).toBeTruthy();
    }, 60000);
  });

  describe('I9 — abort signal propagation', () => {
    it('aborts a non-streaming request before llama.cpp responds', async () => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 50);

      await expect(
        fetch(`${BASE_URL}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'Write a very long detailed essay of at least 2000 words about the history of computing.' }],
            model: 'local-model',
            temperature: 0.1,
            disableThinking: true,
          }),
          signal: controller.signal,
        }),
      ).rejects.toThrow(/abort/i);
    }, 15000);

    it('aborts a streaming request mid-stream and proxy remains healthy', async () => {
      const controller = new AbortController();

      const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Count from 1 to 100.' }],
          model: 'local-model',
          temperature: 0.1,
          stream: true,
          disableThinking: true,
        }),
        signal: controller.signal,
      });

      expect(response.ok).toBe(true);
      const reader = response.body!.getReader();

      const { done } = await reader.read();
      expect(done).toBe(false);

      await reader.cancel();
      controller.abort();

      const healthResponse = await fetch(`${BASE_URL}/v1/models`);
      expect(healthResponse.ok).toBe(true);
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
