import { Body, Controller, Get, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiExtraModels, ApiOperation, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AudioSpeechRequestDto, AudioSpeechStreamChunkDto } from '../models/audioSpeech.dto';
import { TextToSpeechService, TtsOpts } from '../services/textToSpeech.service';
import { ChatterboxOpts, TranscribeAudioTtsService } from '../services/transcribeAudioTts.service';

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
 * Projects the request DTO to TtsOpts for the speaches (legacy) path.
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
 * Projects the request DTO to ChatterboxOpts for the default Chatterbox path.
 * @param body - validated request DTO
 */
function chatterboxOptsFrom(body: AudioSpeechRequestDto): ChatterboxOpts {
  return {
    voice: body.voice,
    exaggeration: body.exaggeration,
  };
}

/**
 * Resolves HTTP status code from a thrown error, falling back to the provided default.
 * @param e - error object, possibly with a statusCode property
 * @param fallback - default status code if none is present
 */
function statusCodeFrom(e: any, fallback: number): number {
  return typeof e?.statusCode === 'number' ? e.statusCode : fallback;
}

/**
 * Handles TTS endpoints: sync speech, SSE streaming, and voice listing.
 * Default path routes to transcribe-audio (Chatterbox). Pass legacy:true for speaches (Kokoro-82M).
 */
@ApiTags('audio')
@ApiExtraModels(AudioSpeechStreamChunkDto)
@Controller('v1/audio')
export class AudioSpeechController {
  constructor(private readonly tts: TextToSpeechService, private readonly chatterboxTts: TranscribeAudioTtsService) {}

  @Get('voices')
  @ApiOperation({ summary: 'List voices available from the Chatterbox TTS engine' })
  @ApiResponse({ status: 200, description: 'Array of available voices with id, language, and gender' })
  async listVoices(@Res() res: Response): Promise<void> {
    try {
      const voices = await this.chatterboxTts.listVoices();
      res.status(HttpStatus.OK).json({ voices });
    } catch (e: any) {
      console.error('[AudioSpeechController] listVoices error:', e?.message ?? e);
      res.status(statusCodeFrom(e, HttpStatus.BAD_GATEWAY)).json({ error: { message: e?.message ?? 'Failed to list voices', type: 'tts_error' } });
    }
  }

  @Post('speech')
  @ApiOperation({ summary: 'Generate speech audio from text (default: Chatterbox WAV; legacy:true → speaches MP3)' })
  @ApiBody({ type: AudioSpeechRequestDto })
  @ApiResponse({ status: 200, description: 'Binary audio body', content: { 'audio/wav': { schema: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 400, description: 'Missing or invalid input' })
  @ApiResponse({ status: 404, description: 'Unknown voice' })
  @ApiResponse({ status: 500, description: 'Speech synthesis failed' })
  async speak(@Body() body: AudioSpeechRequestDto, @Req() req: Request, @Res() res: Response): Promise<void> {
    const ac = new AbortController();
    req.on('close', () => ac.abort());
    try {
      if (body.legacy) {
        const buf = await this.tts.synthesize(body.input, ttsOptsFrom(body), ac.signal);
        res.setHeader('Content-Type', contentTypeFor(body.response_format ?? 'mp3'));
        res.status(HttpStatus.OK).send(buf);
      } else {
        const buf = await this.chatterboxTts.synthesize(body.input, chatterboxOptsFrom(body), ac.signal);
        res.setHeader('Content-Type', 'audio/wav');
        res.status(HttpStatus.OK).send(buf);
      }
    } catch (e: any) {
      if (ac.signal.aborted) return;
      console.error('[AudioSpeechController] speak error:', e?.message ?? e);
      res.status(statusCodeFrom(e, HttpStatus.INTERNAL_SERVER_ERROR)).json({ error: { message: e?.message ?? 'Speech synthesis failed', type: 'tts_error' } });
    }
  }

  @Post('speech/stream')
  @ApiOperation({ summary: 'Generate speech audio sentence-by-sentence over SSE (default: Chatterbox; legacy:true → speaches)' })
  @ApiBody({ type: AudioSpeechRequestDto })
  @ApiResponse({ status: 200, description: 'SSE stream of audio chunks', content: { 'text/event-stream': { schema: { $ref: getSchemaPath(AudioSpeechStreamChunkDto) } } } })
  async speakStream(@Body() body: AudioSpeechRequestDto, @Req() req: Request, @Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const ac = new AbortController();
    req.on('close', () => ac.abort());

    const stream = body.legacy
      ? this.tts.synthesizeStream(body.input, ttsOptsFrom(body), ac.signal)
      : this.chatterboxTts.synthesizeStream(body.input, chatterboxOptsFrom(body), ac.signal);

    try {
      for await (const { audio, sentence } of stream) {
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
