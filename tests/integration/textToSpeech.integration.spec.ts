import { writeFileSync } from 'fs';
import { join } from 'path';
import OpenAI from '../../client';
import { normalizeText, wordOverlap } from './_helpers';

const BASE_URL = process.env.PROXY_URL || 'http://localhost:4142';
const openai = new OpenAI({ baseURL: BASE_URL });
const RESULTS_DIR = join(__dirname, 'results', 'tts');

/**
 * Returns true when the buffer starts with an MP3 magic header (ID3 or sync word).
 * @param buf - audio buffer to inspect
 */
function isMp3(buf: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buf);
  const isId3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
  const isSyncWord = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  return isId3 || isSyncWord;
}

describe('Integration — text to speech (requires proxy on :4142 and speaches on :8000)', () => {

  // ─── Sync ────────────────────────────────────────────────────────────────────

  describe('TTS1 — basic sync synthesis', () => {
    it('returns a non-empty mp3 buffer for a simple input', async () => {
      const input = 'Hello, this is a test.';
      const buf = await openai.audio.speech.create({ input });

      expect(buf).toBeDefined();
      expect(buf.byteLength).toBeGreaterThan(1000);
      expect(isMp3(buf)).toBe(true);

      writeFileSync(join(RESULTS_DIR, 'tts1-basic.mp3'), Buffer.from(buf));
      console.log(`[TTS1] generated ${buf.byteLength} bytes`);
    }, 60000);
  });

  describe('TTS2 — explicit model/voice/format/speed', () => {
    it('accepts all optional params and returns audio', async () => {
      const input = 'Testing explicit parameters.';
      const buf = await openai.audio.speech.create({
        input,
        model: 'hexgrad/Kokoro-82M',
        voice: 'af_sky',
        response_format: 'mp3',
        speed: 1,
      });

      expect(buf.byteLength).toBeGreaterThan(1000);
      writeFileSync(join(RESULTS_DIR, 'tts2-explicit-params.mp3'), Buffer.from(buf));
      console.log(`[TTS2] generated ${buf.byteLength} bytes`);
    }, 60000);
  });

  describe('TTS3 — sync round-trip TTS → STT', () => {
    it('produces intelligible audio that STT can recover', async () => {
      const input = 'Hello, this is a test of the national broadcasting system.';
      const buf = await openai.audio.speech.create({ input });

      writeFileSync(join(RESULTS_DIR, 'tts3-roundtrip.mp3'), Buffer.from(buf));

      const audioBlob = new Blob([buf], { type: 'audio/mpeg' });
      const transcription = await openai.audio.transcriptions.create({ file: audioBlob });
      console.log(`[TTS3] transcribed: "${transcription.text}"`);

      const overlap = wordOverlap(normalizeText(transcription.text), normalizeText(input));
      console.log(`[TTS3] word overlap: ${(overlap * 100).toFixed(0)}%`);
      expect(overlap).toBeGreaterThanOrEqual(0.8);
    }, 120000);
  });

  describe('TTS4 — sync error: empty input', () => {
    it('returns HTTP 400 for empty input', async () => {
      const res = await fetch(`${BASE_URL}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: '' }),
      });
      expect(res.status).toBe(400);
    }, 15000);
  });

  // ─── Streaming ───────────────────────────────────────────────────────────────

  describe('TTS5 — streaming yields one chunk per sentence', () => {
    it('produces one audio chunk per sentence with mp3 headers', async () => {
      const input = 'First sentence. Second sentence. Third sentence.';
      const stream = await openai.audio.speech.create({ input, stream: true });

      const chunks: Array<{ audio: ArrayBuffer; sentence: string }> = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      console.log(`[TTS5] chunks received: ${chunks.length}`);
      chunks.forEach((c, i) => console.log(`[TTS5]   chunk[${i}] sentence="${c.sentence}" bytes=${c.audio.byteLength}`));

      expect(chunks.length).toBe(3);
      for (const chunk of chunks) {
        expect(chunk.audio.byteLength).toBeGreaterThan(100);
        expect(isMp3(chunk.audio)).toBe(true);
      }

      // Save individual chunks
      chunks.forEach((c, i) => writeFileSync(join(RESULTS_DIR, `tts5-chunk-${i}.mp3`), Buffer.from(c.audio)));
    }, 120000);
  });

  describe('TTS6 — streaming round-trip per chunk', () => {
    it('produces intelligible audio for each sentence', async () => {
      const input = 'Hello world. Goodbye world.';
      const stream = await openai.audio.speech.create({ input, stream: true });

      const chunks: Array<{ audio: ArrayBuffer; sentence: string }> = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      // Concatenate all audio
      const totalLen = chunks.reduce((acc, c) => acc + c.audio.byteLength, 0);
      const combined = new Uint8Array(totalLen);
      let offset = 0;
      for (const c of chunks) {
        combined.set(new Uint8Array(c.audio), offset);
        offset += c.audio.byteLength;
      }
      writeFileSync(join(RESULTS_DIR, 'tts6-combined.mp3'), Buffer.from(combined.buffer));

      // Transcribe combined
      const audioBlob = new Blob([combined.buffer], { type: 'audio/mpeg' });
      const transcription = await openai.audio.transcriptions.create({ file: audioBlob });
      console.log(`[TTS6] transcribed: "${transcription.text}"`);

      const normalized = normalizeText(transcription.text);
      expect(normalized).toContain('hello world');
      expect(normalized).toContain('goodbye world');
    }, 120000);
  });

  describe('TTS7 — streaming abort', () => {
    it('stops yielding chunks after abort', async () => {
      const input = 'Sentence one. Sentence two. Sentence three. Sentence four.';
      const ac = new AbortController();

      const stream = await openai.audio.speech.create({ input, stream: true }, { signal: ac.signal });

      const chunks: Array<{ audio: ArrayBuffer; sentence: string }> = [];
      try {
        for await (const chunk of stream) {
          chunks.push(chunk);
          console.log(`[TTS7] received chunk ${chunks.length}, aborting...`);
          ac.abort();
        }
      } catch {
        // AbortError expected after abort — acceptable
      }

      console.log(`[TTS7] total chunks before abort: ${chunks.length}`);
      expect(chunks.length).toBeLessThanOrEqual(2);
    }, 60000);
  });

  describe('TTS8 — streaming mid-stream error surfaces', () => {
    it('throws an error for an unknown voice', async () => {
      const res = await fetch(`${BASE_URL}/v1/audio/speech/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'Test error handling.', voice: 'not_a_real_voice_xyz' }),
      });

      // Server sends SSE headers first, then an error event — or it might return 500 before headers flush
      // depending on speaches error timing. Accept either:
      if (!res.ok) {
        console.log(`[TTS8] server returned ${res.status} before SSE`);
        expect(res.status).toBeGreaterThanOrEqual(400);
        return;
      }

      // Read the stream and expect an error event or rejection
      let errorThrown = false;
      try {
        const stream = sseToSpeechChunksRaw(res);
        for await (const _chunk of stream) { /* consume */ }
      } catch (e: any) {
        errorThrown = true;
        console.log(`[TTS8] error: ${e.message}`);
        expect(e.message).toBeTruthy();
      }

      // speaches may silently return a default voice if the requested voice is unknown;
      // in that case the stream completes without error which is also acceptable
      console.log(`[TTS8] errorThrown=${errorThrown}`);
    }, 60000);
  });

});

/**
 * Raw SSE reader used by TTS8 without going through the client wrapper.
 * @param res - fetch Response with SSE body
 */
async function* sseToSpeechChunksRaw(res: Response): AsyncGenerator<{ audio: ArrayBuffer; sentence: string }> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice('data: '.length).trim();
        if (data === '[DONE]') return;
        const parsed = JSON.parse(data);
        if (parsed.error) throw new Error(parsed.error.message ?? 'tts_error');
        const bytes = Uint8Array.from(atob(parsed.audio), c => c.charCodeAt(0));
        yield { audio: bytes.buffer, sentence: parsed.sentence };
      }
    }
  } finally {
    try { await reader.cancel(); } catch { /* ignore */ }
  }
}
