/**
 * Quick smoke-test for ai-proxy image generation.
 * Usage: node scripts/test-image-gen.mjs
 */
const BASE_URL = process.env.AI_PROXY_BASE_URL ?? 'http://localhost:4142';
const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

console.log(`[test] POST ${BASE_URL}/v1/images/generations`);
console.log(`[test] timeout: ${TIMEOUT_MS / 1000}s`);

const controller = new AbortController();
const timer = setTimeout(() => {
  controller.abort();
  console.error('[test] TIMED OUT after', TIMEOUT_MS / 1000, 'seconds');
  process.exit(1);
}, TIMEOUT_MS);

const start = Date.now();

try {
  const res = await fetch(`${BASE_URL}/v1/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-local',
    },
    body: JSON.stringify({
      prompt: 'a simple red circle on a white background',
      size: '1024x1024',
      response_format: 'b64_json',
    }),
    signal: controller.signal,
  });

  clearTimeout(timer);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[test] HTTP ${res.status} ${res.statusText} (${elapsed}s)`);

  const body = await res.json();

  if (!res.ok) {
    console.error('[test] FAIL — error response:', JSON.stringify(body, null, 2));
    process.exit(1);
  }

  const b64 = body?.data?.[0]?.b64_json;
  if (!b64) {
    console.error('[test] FAIL — no b64_json in response:', JSON.stringify(body, null, 2));
    process.exit(1);
  }

  const buf = Buffer.from(b64, 'base64');
  const isPng  = buf[0] === 0x89 && buf[1] === 0x50;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const isWebp = buf.subarray(8, 12).toString('ascii') === 'WEBP';

  console.log(`[test] PASS — image received: ${buf.length} bytes, valid format: ${isPng || isJpeg || isWebp}`);
  if (body?.data?.[0]?.revised_prompt) console.log(`[test] revised_prompt: ${body.data[0].revised_prompt}`);
} catch (e) {
  clearTimeout(timer);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.error(`[test] FAIL — exception after ${elapsed}s:`, e.message);
  process.exit(1);
}
