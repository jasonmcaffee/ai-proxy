import { Body, Controller, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiExtraModels, ApiOperation, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AudioSpeechRequestDto, AudioSpeechStreamChunkDto } from '../models/audioSpeech.dto';
import { TextToSpeechService, TtsOpts } from '../services/textToSpeech.service';

/**
 * Maps a response_format string to the correct MIME type for the Content-Type header.
 * @param format - one of mp3, wav, flac, opus, aac, pcm
 */
function contentTypeFor(format: string): string {
  const map: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    flac: 'audio/flac',
    opus: 'audio/opus',
    aac: 'audio/aac',
    pcm: 'audio/pcm',
  };
  return map[format] ?? 'application/octet-stream';
}

/**
 * Projects the request DTO to TtsOpts, stripping undefined fields (defaults applied in service).
 * @param body - validated request DTO
 */
function ttsOptsFrom(body: AudioSpeechRequestDto): TtsOpts {
  return {
    model: body.model,
    voice: body.voice,
    responseFormat: body.response_format,
    speed: body.speed,
  };
}

/**
 * Handles POST /v1/audio/speech (sync) and POST /v1/audio/speech/stream (SSE) using speaches Kokoro-82M.
 */
@ApiTags('audio')
@ApiExtraModels(AudioSpeechStreamChunkDto)
@Controller('v1/audio')
export class AudioSpeechController {
  constructor(private readonly tts: TextToSpeechService) {}

  @Post('speech')
  @ApiOperation({ summary: 'Generate speech audio from text via speaches (sync)' })
  @ApiBody({ type: AudioSpeechRequestDto })
  @ApiResponse({ status: 200, description: 'Binary audio body', content: { 'audio/mpeg': { schema: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 400, description: 'Missing or invalid input' })
  @ApiResponse({ status: 500, description: 'Speech synthesis failed' })
  async speak(@Body() body: AudioSpeechRequestDto, @Req() req: Request, @Res() res: Response): Promise<void> {
    const ac = new AbortController();
    req.on('close', () => ac.abort());
    try {
      const buf = await this.tts.synthesize(body.input, ttsOptsFrom(body), ac.signal);
      res.setHeader('Content-Type', contentTypeFor(body.response_format ?? 'mp3'));
      res.status(HttpStatus.OK).send(buf);
    } catch (e: any) {
      if (ac.signal.aborted) return;
      console.error('[AudioSpeechController] speak error:', e?.message ?? e);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: { message: e?.message ?? 'Speech synthesis failed', type: 'tts_error' } });
    }
  }

  @Post('speech/stream')
  @ApiOperation({ summary: 'Generate speech audio sentence-by-sentence over SSE' })
  @ApiBody({ type: AudioSpeechRequestDto })
  @ApiResponse({ status: 200, description: 'SSE stream of audio chunks', content: { 'text/event-stream': { schema: { $ref: getSchemaPath(AudioSpeechStreamChunkDto) } } } })
  async speakStream(@Body() body: AudioSpeechRequestDto, @Req() req: Request, @Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const ac = new AbortController();
    req.on('close', () => ac.abort());

    try {
      for await (const { audio, sentence } of this.tts.synthesizeStream(body.input, ttsOptsFrom(body), ac.signal)) {
        if (ac.signal.aborted) break;
        const payload = JSON.stringify({ audio: audio.toString('base64'), sentence });
        res.write(`data: ${payload}\n\n`);
      }
      if (!ac.signal.aborted) res.write('data: [DONE]\n\n');
    } catch (e: any) {
      if (!ac.signal.aborted) {
        const errPayload = JSON.stringify({ error: { message: e?.message ?? 'tts error', type: 'tts_error' } });
        res.write(`data: ${errPayload}\n\n`);
      }
    } finally {
      res.end();
    }
  }
}
