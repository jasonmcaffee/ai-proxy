import { Injectable } from '@nestjs/common';
import { OpenAI } from 'openai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SPEACHES_BASE_URL = process.env.SPEACHES_BASE_URL || 'http://localhost:8000/v1';
const DEFAULT_MODEL = 'Systran/faster-whisper-small';

/**
 * Writes a buffer to a temp file, runs transcription, then cleans up.
 * @param openAi - OpenAI client pointed at speaches
 * @param file - uploaded file from multer
 * @param model - whisper model name
 * @param language - ISO language code
 */
async function runTranscription(openAi: OpenAI, file: Express.Multer.File, model: string, language: string): Promise<string> {
  const ext = path.extname(file.originalname) || '.audio';
  const tempFilePath = path.join(os.tmpdir(), `upload-${Date.now()}${ext}`);
  try {
    fs.writeFileSync(tempFilePath, file.buffer);
    const start = Date.now();
    const result = await (openAi.audio.transcriptions.create as any)({
      model,
      file: fs.createReadStream(tempFilePath),
      language,
    });
    console.log(`[SpeechToTextService] transcription finished in ${Date.now() - start}ms: "${result.text}"`);
    return result.text;
  } finally {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}

/**
 * Transcribes audio files by forwarding them to the speaches faster-whisper service.
 * Speaches exposes an OpenAI-compatible /v1/audio/transcriptions endpoint.
 */
@Injectable()
export class SpeechToTextService {
  private readonly openAi: OpenAI;

  constructor() {
    this.openAi = new OpenAI({ baseURL: SPEACHES_BASE_URL, apiKey: 'na' });
  }

  /**
   * Sends an uploaded audio file to speaches for transcription and returns the text.
   * @param file - multer file containing the audio data buffer
   * @param model - whisper model to use (defaults to Systran/faster-whisper-small)
   * @param language - ISO 639-1 language code (defaults to 'en')
   */
  async transcribe(file: Express.Multer.File, model: string = DEFAULT_MODEL, language: string = 'en'): Promise<string> {
    return runTranscription(this.openAi, file, model, language);
  }
}
