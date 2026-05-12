import { readFileSync } from 'fs';
import { join } from 'path';
import OpenAI from '../../client';
import { normalizeText } from './_helpers';

const BASE_URL =  'http://localhost:4141';
const openai = new OpenAI({ baseURL: BASE_URL });
const FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'speech-to-text-test-file.m4a');
const EXPECTED_TEXT = 'Hello, this is a test of the national broadcasting system. I am a cat that is sitting on a red shelf.';

describe('Integration — speech to text (requires proxy on :4141 and speaches on :8000)', () => {

  describe('STT1 — basic audio transcription', () => {
    it('transcribes the fixture m4a file and returns the expected spoken text', async () => {
      const audioBuffer = readFileSync(FIXTURE_PATH);
      const audioBlob = new Blob([audioBuffer], { type: 'audio/mp4' });

      const result = await openai.audio.transcriptions.create({ file: audioBlob });

      expect(result).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(10);

      console.log(`[STT1] transcribed: "${result.text}"`);

      const normalized = normalizeText(result.text);
      const expectedNormalized = normalizeText(EXPECTED_TEXT);
      expect(normalized).toBe(expectedNormalized);
    }, 60000);
  });

  describe('STT2 — transcription with explicit model and language', () => {
    it('accepts model and language params and returns transcription', async () => {
      const audioBuffer = readFileSync(FIXTURE_PATH);
      const audioBlob = new Blob([audioBuffer], { type: 'audio/mp4' });

      const result = await openai.audio.transcriptions.create({
        file: audioBlob,
        model: 'Systran/faster-whisper-small',
        language: 'en',
      });

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(10);
      console.log(`[STT2] transcribed: "${result.text}"`);
    }, 60000);
  });

  describe('STT3 — legacy=true routes to speaches backend', () => {
    it('returns plain {text} using the speaches faster-whisper backend when legacy=true', async () => {
      const audioBuffer = readFileSync(FIXTURE_PATH);
      const audioBlob = new Blob([audioBuffer], { type: 'audio/mp4' });

      const result = await openai.audio.transcriptions.create({
        file: audioBlob,
        legacy: true,
        language: 'en',
      });

      expect(result).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(10);
      console.log(`[STT3] legacy transcribed: "${result.text}"`);

      const normalized = normalizeText(result.text);
      const expectedNormalized = normalizeText(EXPECTED_TEXT);
      expect(normalized).toBe(expectedNormalized);
    }, 60000);
  });

});
