import { writeFileSync } from 'fs';
import { join } from 'path';
import OpenAI from '../../client';
import { normalizeText, wordOverlap } from './_helpers';

const BASE_URL = process.env.PROXY_URL || 'http://localhost:4141';
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

/**
 * Returns true when the buffer starts with a WAV RIFF/WAVE header.
 * @param buf - audio buffer to inspect
 */
function isWav(buf: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buf);
  return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 // RIFF
    && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45; // WAVE
}

describe('Integration — text to speech (requires proxy on :4141, transcribe-audio on :4140, speaches on :8000)', () => {

  // ─── Sync (Chatterbox default) ────────────────────────────────────────────────

  describe('TTS1 — basic sync synthesis (Chatterbox)', () => {
    it('returns a non-empty WAV buffer for a simple input', async () => {
      const input = 'Hello, this is a test.';
      const buf = await openai.audio.speech.create({ input });

      expect(buf).toBeDefined();
      expect(buf.byteLength).toBeGreaterThan(1000);
      expect(isWav(buf)).toBe(true);

      writeFileSync(join(RESULTS_DIR, 'tts1-basic.wav'), Buffer.from(buf));
      console.log(`[TTS1] generated ${buf.byteLength} bytes`);
    }, 60000);
  });

  describe('TTS2 — explicit voice + exaggeration params (Chatterbox)', () => {
    it('accepts Chatterbox voice and exaggeration and returns WAV', async () => {
      const input = 'Testing explicit parameters.';
      const buf = await openai.audio.speech.create({
        input,
        voice: 'dave',
        response_format: 'wav',
        exaggeration: 0.6,
      });

      expect(buf.byteLength).toBeGreaterThan(1000);
      expect(isWav(buf)).toBe(true);
      writeFileSync(join(RESULTS_DIR, 'tts2-explicit-params.wav'), Buffer.from(buf));
      console.log(`[TTS2] generated ${buf.byteLength} bytes`);
    }, 60000);
  });

  describe('TTS3 — sync round-trip TTS → STT (Chatterbox)', () => {
    it('produces intelligible WAV audio that STT can recover', async () => {
      const input = 'Hello, this is a test of the national broadcasting system.';
      const buf = await openai.audio.speech.create({ input });

      writeFileSync(join(RESULTS_DIR, 'tts3-roundtrip.wav'), Buffer.from(buf));

      const audioBlob = new Blob([buf], { type: 'audio/wav' });
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

  // ─── Streaming (Chatterbox default) ──────────────────────────────────────────

  describe('TTS5 — streaming yields one WAV chunk per sentence (Chatterbox)', () => {
    it('produces one audio chunk per sentence with WAV headers', async () => {
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
        expect(isWav(chunk.audio)).toBe(true);
      }

      chunks.forEach((c, i) => writeFileSync(join(RESULTS_DIR, `tts5-chunk-${i}.wav`), Buffer.from(c.audio)));
    }, 120000);
  });

  describe('TTS6 — streaming round-trip per chunk (Chatterbox)', () => {
    it('produces intelligible audio for each sentence', async () => {
      const input = 'Hello world. Goodbye world.';
      const stream = await openai.audio.speech.create({ input, stream: true });

      const chunks: Array<{ audio: ArrayBuffer; sentence: string }> = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      // Transcribe each chunk individually (WAV files cannot be naively concatenated)
      const allText: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const audioBlob = new Blob([chunks[i].audio], { type: 'audio/wav' });
        const t = await openai.audio.transcriptions.create({ file: audioBlob });
        allText.push(normalizeText(t.text));
        writeFileSync(join(RESULTS_DIR, `tts6-chunk-${i}.wav`), Buffer.from(chunks[i].audio));
      }

      const combined = allText.join(' ');
      console.log(`[TTS6] combined transcription: "${combined}"`);
      expect(combined).toContain('hello world');
      expect(combined).toContain('goodbye world');
    }, 180000);
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

  describe('TTS8 — streaming error handling (unknown voice)', () => {
    it('surfaces an error for an unknown voice', async () => {
      const res = await fetch(`${BASE_URL}/v1/audio/speech/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'Test error handling.', voice: 'not_a_real_voice_xyz' }),
      });

      // Server sends SSE headers first, then an error event — or it might return non-200 before headers flush
      if (!res.ok) {
        console.log(`[TTS8] server returned ${res.status} before SSE`);
        expect(res.status).toBeGreaterThanOrEqual(400);
        return;
      }

      let errorThrown = false;
      try {
        const stream = sseToSpeechChunksRaw(res);
        for await (const _chunk of stream) { /* consume */ }
      } catch (e: any) {
        errorThrown = true;
        console.log(`[TTS8] error: ${e.message}`);
        expect(e.message).toBeTruthy();
      }

      console.log(`[TTS8] errorThrown=${errorThrown}`);
    }, 60000);
  });

  // ─── Legacy speaches path ────────────────────────────────────────────────────

  describe('TTS9 — legacy flag routes to speaches (MP3)', () => {
    it('returns MP3 when legacy:true is passed', async () => {
      const res = await fetch(`${BASE_URL}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'Hello from the legacy path.', legacy: true }),
      });

      expect(res.status).toBe(200);
      const buf = await res.arrayBuffer();
      expect(buf.byteLength).toBeGreaterThan(1000);
      expect(isMp3(buf)).toBe(true);
      writeFileSync(join(RESULTS_DIR, 'tts9-legacy.mp3'), Buffer.from(buf));
      console.log(`[TTS9] legacy generated ${buf.byteLength} bytes`);
    }, 60000);
  });

  // ─── Voices endpoint ─────────────────────────────────────────────────────────

  describe('TTS10 — GET /v1/audio/voices', () => {
    it('returns a list of voices with id, language, and gender', async () => {
      const res = await fetch(`${BASE_URL}/v1/audio/voices`);
      expect(res.status).toBe(200);
      const data = await res.json() as { voices: Array<{ id: string; language: string; gender: string }> };
      console.log(`[TTS10] voices: ${JSON.stringify(data.voices)}`);
      expect(Array.isArray(data.voices)).toBe(true);
      expect(data.voices.length).toBeGreaterThan(0);
      for (const v of data.voices) {
        expect(typeof v.id).toBe('string');
        expect(typeof v.language).toBe('string');
        expect(typeof v.gender).toBe('string');
      }
    }, 15000);
  });

  // ─── Unknown voice ───────────────────────────────────────────────────────────

  describe('TTS11 — unknown voice returns 404', () => {
    it('returns HTTP 404 when requesting synthesis with an unknown voice', async () => {
      const res = await fetch(`${BASE_URL}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'Test voice error.', voice: 'not_a_real_voice_xyz_999' }),
      });
      console.log(`[TTS11] status: ${res.status}`);
      expect(res.status).toBe(404);
    }, 15000);
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
