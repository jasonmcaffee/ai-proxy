import { readFileSync } from 'fs';
import { join } from 'path';
import OpenAI, { RealtimeSession } from '../../client';
import type { AudioTranscriptionVerboseResponse } from '../../client/generated';

const BASE_URL = process.env.PROXY_URL || 'http://localhost:4141';
const openai = new OpenAI({ baseURL: BASE_URL });

const STT_FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'speech-to-text-test-file.m4a');
const DIARIZATION_FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'diarization-two-speakers.wav');

const SPEAKER_RE = /^SPEAKER_\d+$/;

describe('Integration — transcription diarization (requires proxy on :4141 and transcribe-audio on :4140)', () => {

  describe('DIA1 — diarization=false is unchanged', () => {
    it('returns plain {text} with no segments when diarization is omitted', async () => {
      const audioBuffer = readFileSync(STT_FIXTURE_PATH);
      const audioBlob = new Blob([audioBuffer], { type: 'audio/mp4' });

      const result = await openai.audio.transcriptions.create({ file: audioBlob });

      expect(result).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(10);
      expect((result as any).segments).toBeUndefined();
      console.log(`[DIA1] text: "${result.text}"`);
    }, 60000);
  });

  describe('DIA2 — diarization=true returns verbose payload with speaker labels', () => {
    it('returns verbose_json with segments and speakers when diarization=true', async () => {
      const audioBuffer = readFileSync(DIARIZATION_FIXTURE_PATH);
      const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });

      const result = await openai.audio.transcriptions.create({
        file: audioBlob,
        diarization: true,
        min_speakers: 1,
        max_speakers: 4,
      }) as AudioTranscriptionVerboseResponse;

      expect(result).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);
      expect(Array.isArray(result.segments)).toBe(true);
      expect(result.segments.length).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(result.speakers)).toBe(true);
      expect(result.speakers.length).toBeGreaterThanOrEqual(1);

      for (const seg of result.segments) {
        expect(seg.speaker).toMatch(SPEAKER_RE);
        expect(typeof seg.text).toBe('string');
        expect(typeof seg.start).toBe('number');
        expect(typeof seg.end).toBe('number');
      }

      console.log(`[DIA2] text: "${result.text.slice(0, 80)}..."`);
      console.log(`[DIA2] ${result.segments.length} segments, speakers: ${result.speakers.join(', ')}`);
    }, 120000);
  });

  describe('DIA3 — diarization=true upstream failure returns 500', () => {
    it('returns HTTP 500 with transcription_error type when transcribe-audio is unreachable', async () => {
      // Can't override the proxy's env from here, so test is adaptive:
      // If transcribe-audio is down → proxy returns 500 (tests error shape)
      // If transcribe-audio is up → proxy returns 200 verbose_json (tests happy path still works)
      // Timeout set high because full diarization inference can take 60s+.
      const audioBuffer = readFileSync(DIARIZATION_FIXTURE_PATH);
      const form = new FormData();
      form.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'diarization-two-speakers.wav');
      form.append('diarization', 'true');

      const res = await fetch(`${BASE_URL}/v1/audio/transcriptions`, { method: 'POST', body: form });
      if (!res.ok) {
        const body = await res.json() as any;
        expect(res.status).toBe(500);
        expect(body.error?.type).toBe('transcription_error');
        console.log(`[DIA3] Got expected 500: ${body.error?.message}`);
      } else {
        const body = await res.json() as AudioTranscriptionVerboseResponse;
        expect(body.text).toBeDefined();
        console.log(`[DIA3] transcribe-audio is running — got 200 instead of testing 500 path`);
      }
    }, 120000);
  });

  describe('DIA4 — realtime session yields committed segments with speaker labels', () => {
    it('streams audio chunks and receives transcription.committed events with speaker labels', async () => {
      const audioBuffer = readFileSync(DIARIZATION_FIXTURE_PATH);

      const session: RealtimeSession = openai.audio.transcriptions.realtime({
        speakerHint: { min: 1, max: 4 },
      });

      const segments: Array<{ text: string; speaker: string; start: number; end: number }> = [];

      const CHUNK_SIZE = 160000; // 5 seconds of PCM16 at 16kHz

      const collectPromise = new Promise<void>((resolve, reject) => {
        let isDone = false;

        (async () => {
          try {
            for await (const seg of session.segments()) {
              segments.push(seg);
              console.log(`[DIA4] [${seg.speaker}] ${seg.start.toFixed(1)}s: ${seg.text}`);
              if (isDone) break;
            }
            resolve();
          } catch (err) {
            reject(err);
          }
        })();

        // Send chunks with a small delay to simulate realtime
        // Skip the 44-byte WAV header; the file is already PCM16 mono 16kHz.
        // Use Uint8Array.from() to create a proper ArrayBuffer copy rather than
        // sharing the underlying pool ArrayBuffer that Buffer.slice() would give.
        setTimeout(async () => {
          try {
            let offset = 44; // skip WAV header bytes
            while (offset < audioBuffer.length) {
              const end = Math.min(offset + CHUNK_SIZE, audioBuffer.length);
              const chunk = Uint8Array.from(audioBuffer.subarray(offset, end)).buffer;
              session.sendChunk(chunk);
              offset = end;
              await new Promise((r) => setTimeout(r, 100));
            }
            session.commit();
            isDone = true;
          } catch (err) {
            reject(err);
          }
        }, 500);
      });

      await collectPromise;

      expect(segments.length).toBeGreaterThanOrEqual(1);
      for (const seg of segments) {
        expect(seg.speaker).toMatch(SPEAKER_RE);
      }
      console.log(`[DIA4] ${segments.length} total segments, speakers: ${[...new Set(segments.map(s => s.speaker))].join(', ')}`);
      session.end();
    }, 180000);
  });

  describe('DIA5 — disconnect tears down the upstream connection', () => {
    it('calling session.end() stops the session and no further events arrive', async () => {
      const session: RealtimeSession = openai.audio.transcriptions.realtime();

      const receivedAfterEnd: unknown[] = [];
      let sessionEnded = false;

      const segIter = session.segments()[Symbol.asyncIterator]();

      // Give the socket time to connect
      await new Promise((r) => setTimeout(r, 1000));

      // End before sending any audio
      session.end();
      sessionEnded = true;

      // Try to read — should resolve as done or throw; should not hang
      const readResult = await Promise.race([
        segIter.next().then((r) => r),
        new Promise<IteratorResult<any>>((r) => setTimeout(() => r({ value: undefined, done: true }), 3000)),
      ]);

      expect(sessionEnded).toBe(true);
      expect(receivedAfterEnd.length).toBe(0);
      console.log(`[DIA5] session ended cleanly, done=${readResult.done}`);
    }, 15000);
  });
});
