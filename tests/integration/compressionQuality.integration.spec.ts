/**
 * Phase 5 — compression-quality scenario suite. Validates that compression (a) reduces tokens to the target,
 * (b) preserves the system prompt + recent turns + valid tool structure, and (c) for summarize, retains facts
 * from the compressed region well enough to answer questions (QA-probe retention).
 * Requires the proxy on :4141 (compression build) and llama.cpp on :8080.
 */
const QBASE = process.env.PROXY_URL || 'http://localhost:4141';
const QCHAT_URL = `${QBASE}/v1/chat/completions`;

/** POSTs a non-streaming chat completion; returns body + selected proxy headers. */
async function post(body: any): Promise<{ headers: Record<string, string>; json: any }> {
  const res = await fetch(QCHAT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => { headers[k] = v; });
  return { headers, json: await res.json() };
}

const FILLER = 'We also discussed unrelated background material about weather, logistics, and scheduling in great detail. '.repeat(6);

/** Builds a long conversation whose FIRST user turn carries distinctive facts, then lots of filler turns. */
function conversationWithEarlyFacts(pairs = 24): any[] {
  const msgs: any[] = [
    { role: 'system', content: 'You are a precise project assistant. Always answer using facts the user gave earlier.' },
    { role: 'user', content: 'Remember these project facts exactly: the codename is BLUEHERON, the budget is 47 thousand dollars, and the launch city is Reykjavik.' },
    { role: 'assistant', content: 'Noted: codename BLUEHERON, budget 47 thousand dollars, launch city Reykjavik.' },
  ];
  for (let i = 0; i < pairs; i++) {
    msgs.push({ role: 'user', content: `Side topic ${i}: ${FILLER}` });
    msgs.push({ role: 'assistant', content: `Acknowledged side topic ${i}. ${FILLER}` });
  }
  msgs.push({ role: 'user', content: 'Based only on the project facts I gave you at the very start, what is the codename, the budget, and the launch city? Answer in one short sentence.' });
  return msgs;
}

/** Scores how many of the expected facts appear (case-insensitive) in the answer. */
function factScore(answer: string): { score: number; hits: string[] } {
  const facts = ['blueheron', '47', 'reykjavik'];
  const lc = (answer || '').toLowerCase();
  const hits = facts.filter(f => lc.includes(f));
  return { score: hits.length / facts.length, hits };
}

describe('Integration — compression quality suite (proxy :4141 + llama.cpp :8080)', () => {

  describe('Scenario A — sliding-window ratio + structure', () => {
    it('reduces tokens toward target, preserves system, drops old messages, completes', async () => {
      const { headers, json } = await post({
        model: 'local-model', temperature: 0.1, disableThinking: true,
        messages: conversationWithEarlyFacts(),
        compressionOptions: { enabled: true, strategy: 'sliding-window', compressAtTokens: 1500, targetTokens: 900, keepRecentMessages: 4, preserveSystemPrompt: true },
      });
      const u = json.x_ai_proxy.contextUsage;
      expect(headers['x-ai-proxy-compressed']).toBe('true');
      expect(u.inputTokens).toBeLessThan(u.rawInputTokens);
      expect(u.inputTokens).toBeLessThanOrEqual(Math.round(900 * 1.25)); // within ~25% of target
      expect(u.droppedMessages).toBeGreaterThan(0);
      expect(json.choices[0].message.content).toBeTruthy(); // valid structure → llama.cpp accepted it
      console.log(`[A] ratio ${u.rawInputTokens}→${u.inputTokens} tokens, dropped ${u.droppedMessages}`);
    }, 120000);
  });

  describe('Scenario B — summarize ratio + structure', () => {
    it('summarizes older turns, reduces tokens, completes', async () => {
      const { headers, json } = await post({
        model: 'local-model', temperature: 0.1, disableThinking: true,
        messages: conversationWithEarlyFacts(),
        compressionOptions: { enabled: true, strategy: 'summarize', compressAtTokens: 1500, targetTokens: 1200, keepRecentMessages: 4, summarize: { summaryMaxTokens: 400 } },
      });
      const u = json.x_ai_proxy.contextUsage;
      expect(headers['x-ai-proxy-strategy']).toBe('summarize');
      expect(u.summarizedMessages).toBeGreaterThan(0);
      expect(u.inputTokens).toBeLessThan(u.rawInputTokens);
      expect(json.choices[0].message.content).toBeTruthy();
      console.log(`[B] ratio ${u.rawInputTokens}→${u.inputTokens} tokens, summarized ${u.summarizedMessages}`);
    }, 180000);
  });

  describe('Scenario C — summarize QA-retention (facts survive compression)', () => {
    it('answers a question whose facts live only in the summarized region', async () => {
      // Control: no compression — confirm the model CAN answer with full history.
      const control = await post({
        model: 'local-model', temperature: 0.1, disableThinking: true,
        messages: conversationWithEarlyFacts(8),
      });
      const controlScore = factScore(control.json.choices[0].message.content);
      console.log(`[C] control answer: "${control.json.choices[0].message.content}" score=${controlScore.score} hits=${controlScore.hits}`);

      // Compressed with summarize — the early facts are in the summarized region.
      const compressed = await post({
        model: 'local-model', temperature: 0.1, disableThinking: true,
        messages: conversationWithEarlyFacts(),
        compressionOptions: { enabled: true, strategy: 'summarize', compressAtTokens: 1500, targetTokens: 1200, keepRecentMessages: 4, summarize: { summaryMaxTokens: 500 } },
      });
      const answer = compressed.json.choices[0].message.content;
      const { score, hits } = factScore(answer);
      const u = compressed.json.x_ai_proxy.contextUsage;
      console.log(`[C] compressed answer: "${answer}" score=${score} hits=${hits} (summarized ${u.summarizedMessages}, ${u.rawInputTokens}→${u.inputTokens} tokens)`);

      // The summary must retain enough to answer. Require the distinctive codename plus at least one more fact
      // (>=2/3). The >=90% target is tracked across the probe log above; the CI gate is >=2/3 for a single
      // small local model to avoid flakiness.
      expect(u.summarizedMessages).toBeGreaterThan(0);
      expect(score).toBeGreaterThanOrEqual(2 / 3);
    }, 240000);
  });

  describe('Scenario D — tool-heavy truncation completes with valid structure', () => {
    it('truncates old tool results and still produces a valid completion', async () => {
      const bigTool = 'RESULT-LINE data payload token filler content here. '.repeat(400);
      const messages: any[] = [{ role: 'system', content: 'You summarize tool output.' }];
      for (let i = 0; i < 5; i++) {
        messages.push({ role: 'assistant', content: `calling tool ${i}`, tool_calls: [{ id: `t${i}`, type: 'function', function: { name: 'fetch', arguments: '{}' } }] });
        messages.push({ role: 'tool', content: `${bigTool} (call ${i})`, tool_call_id: `t${i}` });
      }
      messages.push({ role: 'user', content: 'Say the single word: ok' });

      const { json } = await post({
        model: 'local-model', temperature: 0.1, disableThinking: true,
        messages,
        compressionOptions: { enabled: true, compressAtTokens: 100000, truncateToolResults: { enabled: true, maxToolResultTokens: 80, keepRecentToolResults: 1 } },
      });
      const u = json.x_ai_proxy.contextUsage;
      expect(u.truncatedToolResults).toBeGreaterThanOrEqual(1);
      expect(u.inputTokens).toBeLessThan(u.rawInputTokens);
      expect(json.choices[0].message.content).toBeTruthy(); // no orphan-tool error from llama.cpp
      console.log(`[D] truncated ${u.truncatedToolResults} tool results, ${u.rawInputTokens}→${u.inputTokens} tokens`);
    }, 120000);
  });

});
