/**
 * Integration tests for client-configurable compression + the progress/context-usage protocol.
 * Requires the proxy on :4141 (built with compression support) and llama.cpp on :8080.
 * Uses raw fetch so we can inspect response headers and raw SSE frames (the OpenAI client hides both).
 */
const BASE = process.env.PROXY_URL || 'http://localhost:4141';
const CHAT_URL = `${BASE}/v1/chat/completions`;

/** Builds an oversized alternating user/assistant history to force compression. */
function bigHistory(pairs = 30): any[] {
  const filler = 'This is a detailed conversational message with plenty of tokens to consume context budget. '.repeat(4);
  const msgs: any[] = [{ role: 'system', content: 'You are a concise assistant.' }];
  for (let i = 0; i < pairs; i++) {
    msgs.push({ role: 'user', content: `Question ${i}: ${filler}` });
    msgs.push({ role: 'assistant', content: `Answer ${i}: ${filler}` });
  }
  msgs.push({ role: 'user', content: 'Reply with the single word: ok' });
  return msgs;
}

/** POSTs a chat completion and returns the parsed JSON body plus selected proxy headers. */
async function postJson(body: any): Promise<{ status: number; headers: Record<string, string>; json: any }> {
  const res = await fetch(CHAT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => { headers[k] = v; });
  const json = await res.json();
  return { status: res.status, headers, json };
}

/** POSTs a streaming chat completion and returns all parsed SSE data frames. */
async function postStreamFrames(body: any): Promise<any[]> {
  const res = await fetch(CHAT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, stream: true }) });
  const reader = (res.body as any).getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const frames: any[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';
    for (const part of parts) {
      const line = part.split('\n').find(l => l.startsWith('data: '));
      if (!line) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') continue;
      try { frames.push(JSON.parse(payload)); } catch { /* ignore */ }
    }
  }
  return frames;
}

describe('Integration — compression protocol (requires proxy :4141 + llama.cpp :8080)', () => {

  describe('P2 — no-op below trigger', () => {
    it('does not compress a small history but still returns context-usage meta', async () => {
      const { status, headers, json } = await postJson({
        model: 'local-model', temperature: 0.1,
        messages: [{ role: 'user', content: 'Say: ok' }],
        compressionOptions: { enabled: true, compressAtTokens: 100000 },
      });
      expect(status).toBe(200);
      expect(headers['x-ai-proxy-compressed']).toBe('false');
      expect(Number(headers['x-ai-proxy-context-limit'])).toBeGreaterThan(0);
      expect(json.x_ai_proxy.contextUsage.compressed).toBe(false);
    }, 60000);
  });

  describe('P8 — non-stream metadata (headers + body)', () => {
    it('returns context-usage headers and body field', async () => {
      const { headers, json } = await postJson({
        model: 'local-model', temperature: 0.1,
        messages: [{ role: 'user', content: 'Say: ok' }],
        compressionOptions: { enabled: true, compressAtTokens: 100000 },
      });
      expect(Number(headers['x-ai-proxy-context-tokens'])).toBeGreaterThan(0);
      const usage = json.x_ai_proxy.contextUsage;
      expect(usage.inputTokens).toBeGreaterThan(0);
      expect(usage.usedPct).toBeGreaterThanOrEqual(0);
      expect(usage.tokensUntilCompression).toBeGreaterThan(0);
    }, 60000);
  });

  describe('P9 — context limit auto-detected + overridable', () => {
    it('auto-detects the context window from llama.cpp /props', async () => {
      const { headers } = await postJson({
        model: 'local-model', temperature: 0.1,
        messages: [{ role: 'user', content: 'Say: ok' }],
        compressionOptions: { enabled: true, compressAtTokens: 100000 },
      });
      expect(Number(headers['x-ai-proxy-context-limit'])).toBeGreaterThan(1000);
    }, 60000);

    it('honors a client contextLimit override', async () => {
      const { json } = await postJson({
        model: 'local-model', temperature: 0.1,
        messages: [{ role: 'user', content: 'Say: ok' }],
        compressionOptions: { enabled: true, compressAtTokens: 100000, contextLimit: 50000 },
      });
      expect(json.x_ai_proxy.contextUsage.contextLimit).toBe(50000);
    }, 60000);
  });

  describe('P1 — backward-compat legacy maxContextSize', () => {
    it('compresses an oversized history and returns a valid completion', async () => {
      const { status, headers, json } = await postJson({
        model: 'local-model', temperature: 0.1, disableThinking: true,
        messages: bigHistory(),
        compressionOptions: { enabled: true, maxContextSize: 1500 },
      });
      expect(status).toBe(200);
      expect(headers['x-ai-proxy-compressed']).toBe('true');
      expect(json.choices[0].message.content).toBeTruthy();
    }, 120000);
  });

  describe('P3 — trigger + target (sliding-window)', () => {
    it('drops old messages down toward the target', async () => {
      const { headers, json } = await postJson({
        model: 'local-model', temperature: 0.1, disableThinking: true,
        messages: bigHistory(),
        compressionOptions: { enabled: true, compressAtTokens: 1500, targetTokens: 800, keepRecentMessages: 4 },
      });
      expect(headers['x-ai-proxy-compressed']).toBe('true');
      expect(headers['x-ai-proxy-strategy']).toBe('sliding-window');
      expect(json.x_ai_proxy.contextUsage.droppedMessages).toBeGreaterThan(0);
      expect(json.x_ai_proxy.contextUsage.inputTokens).toBeLessThan(json.x_ai_proxy.contextUsage.rawInputTokens);
    }, 120000);
  });

  describe('P4 — summarize strategy', () => {
    it('summarizes older turns and completes', async () => {
      const { headers, json } = await postJson({
        model: 'local-model', temperature: 0.1, disableThinking: true,
        messages: bigHistory(),
        compressionOptions: { enabled: true, strategy: 'summarize', compressAtTokens: 1500, targetTokens: 1200, keepRecentMessages: 4, summarize: { summaryMaxTokens: 300 } },
      });
      expect(headers['x-ai-proxy-strategy']).toBe('summarize');
      expect(json.choices[0].message.content).toBeTruthy();
      expect(json.x_ai_proxy.contextUsage.compressed).toBe(true);
    }, 180000);
  });

  describe('P6 — tool-result truncation + onlyKeepLatestImage', () => {
    it('truncates old tool results and keeps only the latest image', async () => {
      const bigTool = 'LOGLINE '.repeat(2000);
      const img = { type: 'image_url' as const, image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' } };
      const { json } = await postJson({
        model: 'local-model', temperature: 0.1, disableThinking: true,
        messages: [
          { role: 'user', content: [img, { type: 'text', text: 'first image' }] },
          { role: 'assistant', content: 'ok', tool_calls: [{ id: 't1', type: 'function', function: { name: 'f', arguments: '{}' } }] },
          { role: 'tool', content: bigTool, tool_call_id: 't1' },
          { role: 'assistant', content: 'done', tool_calls: [{ id: 't2', type: 'function', function: { name: 'f', arguments: '{}' } }] },
          { role: 'tool', content: 'small recent tool result', tool_call_id: 't2' },
          { role: 'user', content: [img, { type: 'text', text: 'second image; say ok' }] },
        ],
        compressionOptions: { enabled: true, compressAtTokens: 100000, onlyKeepLatestImage: true, truncateToolResults: { enabled: true, maxToolResultTokens: 100, keepRecentToolResults: 1 } },
      });
      expect(json.x_ai_proxy.contextUsage.truncatedToolResults).toBeGreaterThanOrEqual(1);
      expect(json.choices[0].message.content).toBeTruthy();
    }, 120000);
  });

  describe('P7 — streaming emits progress + context_usage frames', () => {
    it('sends compression_progress then context_usage before model tokens', async () => {
      const frames = await postStreamFrames({
        model: 'local-model', temperature: 0.1, disableThinking: true,
        messages: bigHistory(),
        compressionOptions: { enabled: true, compressAtTokens: 1500, targetTokens: 800, keepRecentMessages: 4 },
      });
      const progress = frames.filter(f => f.object === 'ai_proxy.event' && f.type === 'compression_progress');
      const usage = frames.filter(f => f.object === 'ai_proxy.event' && f.type === 'context_usage');
      const content = frames.filter(f => f.choices?.[0]?.delta?.content);
      expect(progress.length).toBeGreaterThanOrEqual(1);
      expect(usage.length).toBe(1);
      expect(content.length).toBeGreaterThanOrEqual(1);
      // usage frame arrives before the first content frame
      const usageIdx = frames.findIndex(f => f.type === 'context_usage');
      const firstContentIdx = frames.findIndex(f => f.choices?.[0]?.delta?.content);
      expect(usageIdx).toBeLessThan(firstContentIdx);
    }, 120000);
  });

  describe('P5 — no-op streaming without compression is unaffected', () => {
    it('streams normally with no proxy-event frames when compression is disabled', async () => {
      const frames = await postStreamFrames({
        model: 'local-model', temperature: 0.1, disableThinking: true,
        messages: [{ role: 'user', content: 'Count 1 to 3.' }],
      });
      const proxyEvents = frames.filter(f => f.object === 'ai_proxy.event');
      const content = frames.filter(f => f.choices?.[0]?.delta?.content);
      expect(proxyEvents.length).toBe(0);
      expect(content.length).toBeGreaterThanOrEqual(1);
    }, 60000);
  });

});
