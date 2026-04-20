import OpenAI from '../../client';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const BASE_URL = process.env.PROXY_URL || 'http://localhost:4142';
const openai = new OpenAI({ baseURL: BASE_URL });
const RESULTS_DIR = join(__dirname, 'results', 'images');

/**
 * Saves a base64-encoded image to the results/images folder with the given filename.
 * @param b64 - base64-encoded image data
 * @param filename - output filename (e.g. "im1-landscape.png")
 */
function saveImage(b64: string, filename: string): void {
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(join(RESULTS_DIR, filename), Buffer.from(b64, 'base64'));
  console.log(`[saved] tests/integration/results/images/${filename}`);
}

/**
 * Decodes a base64 string and returns a Buffer, throwing if the string is not valid base64.
 * @param b64 - base64-encoded string to decode
 */
function decodeBase64Image(b64: string): Buffer {
  const buf = Buffer.from(b64, 'base64');
  if (buf.length === 0) throw new Error('Decoded buffer is empty');
  return buf;
}

/**
 * Returns true if the buffer starts with a known image magic number (PNG or JPEG).
 * @param buf - buffer containing image bytes
 */
function isKnownImageFormat(buf: Buffer): boolean {
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const isWebp = buf.subarray(8, 12).toString('ascii') === 'WEBP';
  return isPng || isJpeg || isWebp;
}

describe('Integration — image generation (requires proxy on :4142 and ComfyUI on :8083)', () => {

  describe('IM1 — basic image generation', () => {
    it('returns a valid base64-encoded image for a simple prompt', async () => {
      const result = await openai.images.generate({
        prompt: 'a beautiful landscape with mountains and a lake',
        size: '1024x1024',
      });

      expect(result.created).toBeGreaterThan(0);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThanOrEqual(1);

      const imageData = result.data[0];
      expect(imageData.b64_json).toBeDefined();
      expect(typeof imageData.b64_json).toBe('string');
      expect(imageData.b64_json!.length).toBeGreaterThan(100);

      const buf = decodeBase64Image(imageData.b64_json!);
      expect(buf.length).toBeGreaterThan(1000);
      expect(isKnownImageFormat(buf)).toBe(true);
      saveImage(imageData.b64_json!, 'im1-landscape.png');
    }, 300000);
  });

  describe('IM2 — image generation with negativePrompt extension', () => {
    it('returns a valid image when negativePrompt is provided', async () => {
      const result = await openai.images.generate({
        prompt: 'a serene forest scene with sunlight filtering through trees',
        negativePrompt: 'dark, gloomy, foggy, low quality',
        size: '1024x1024',
      });

      expect(result.data[0].b64_json).toBeDefined();
      const buf = decodeBase64Image(result.data[0].b64_json!);
      expect(buf.length).toBeGreaterThan(1000);
      saveImage(result.data[0].b64_json!, 'im2-forest-negative-prompt.png');
    }, 300000);
  });

  describe('IM3 — revised_prompt is echoed back', () => {
    it('returns revised_prompt matching the input prompt', async () => {
      const prompt = 'a cozy cabin in the snow';
      const result = await openai.images.generate({ prompt });

      expect(result.data[0].revised_prompt).toBe(prompt);
      if (result.data[0].b64_json) saveImage(result.data[0].b64_json, 'im3-cabin-snow.png');
    }, 600000);
  });

  describe('IM4 — model param is accepted without error', () => {
    it('returns a valid image when model is provided', async () => {
      const result = await openai.images.generate({
        prompt: 'a vibrant sunset over the ocean',
        model: 'zib-zit-moody',
      });

      expect(result.data[0].b64_json).toBeDefined();
      const buf = decodeBase64Image(result.data[0].b64_json!);
      expect(buf.length).toBeGreaterThan(1000);
      saveImage(result.data[0].b64_json!, 'im4-sunset-ocean.png');
    }, 300000);
  });

});
