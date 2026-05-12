import { Body, Controller, HttpStatus, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiExtraModels, ApiOperation, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AudioTranscriptionRequestDto, AudioTranscriptionResponseDto, AudioTranscriptionVerboseResponseDto, TranscriptionSegmentDto } from '../models/audioTranscription.dto';
import { SpeechToTextService } from '../services/speechToText.service';
import { TranscribeAudioService } from '../services/transcribeAudio.service';

/**
 * Handles POST /v1/audio/transcriptions — OpenAI-compatible speech-to-text.
 * Default routes to transcribe-audio (Whisper large-v3).
 * legacy=true routes to speaches (faster-whisper, lightweight).
 * diarization=true routes to transcribe-audio with pyannote speaker labels.
 */
@ApiTags('audio')
@Controller('v1/audio')
@ApiExtraModels(AudioTranscriptionResponseDto, AudioTranscriptionVerboseResponseDto, TranscriptionSegmentDto)
export class AudioTranscriptionsController {
  constructor(private readonly speechToText: SpeechToTextService, private readonly transcribeAudio: TranscribeAudioService) {}

  @Post('transcriptions')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Audio file to transcribe' },
        model: { type: 'string', description: 'Whisper model name (legacy=true only)', example: 'Systran/faster-whisper-small' },
        language: { type: 'string', description: 'ISO 639-1 language code', example: 'en' },
        diarization: { type: 'boolean', description: 'Enable speaker diarization — returns verbose_json with per-segment speaker labels. Mutually exclusive with legacy.', default: false },
        legacy: { type: 'boolean', description: 'Use legacy speaches (faster-whisper) backend. Returns plain {text}. Mutually exclusive with diarization.', default: false },
        min_speakers: { type: 'integer', description: 'Minimum speaker count hint (diarization=true only)', example: 2 },
        max_speakers: { type: 'integer', description: 'Maximum speaker count hint (diarization=true only)', example: 3 },
      },
    },
  })
  @ApiOperation({ summary: 'Transcribe audio. Default: transcribe-audio (Whisper large-v3). legacy=true: speaches. diarization=true: transcribe-audio with speaker labels.' })
  @ApiResponse({
    status: 200,
    description: 'Plain {text} by default or with legacy=true; verbose response with speaker segments when diarization=true',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(AudioTranscriptionResponseDto) },
        { $ref: getSchemaPath(AudioTranscriptionVerboseResponseDto) },
      ],
    },
  })
  @ApiResponse({ status: 500, description: 'Transcription failed' })
  async transcribe(@UploadedFile() file: Express.Multer.File, @Body() body: AudioTranscriptionRequestDto, @Req() req: Request, @Res() res: Response): Promise<void> {
    const ac = new AbortController();
    req.on('close', () => ac.abort());
    try {
      if (body.diarization) {
        const verbose = await this.transcribeAudio.transcribeWithDiarization(file, {
          language: body.language,
          min_speakers: body.min_speakers,
          max_speakers: body.max_speakers,
        }, ac.signal);
        res.status(HttpStatus.OK).json(verbose);
        return;
      }
      if (body.legacy) {
        const text = await this.speechToText.transcribe(file, body.model, body.language);
        res.status(HttpStatus.OK).json({ text });
        return;
      }
      const result = await this.transcribeAudio.transcribeSimple(file, { language: body.language }, ac.signal);
      res.status(HttpStatus.OK).json(result);
    } catch (e: any) {
      if (ac.signal.aborted) return;
      console.error('[AudioTranscriptionsController] transcribe error:', e?.message ?? e);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: { message: e?.message ?? 'Transcription failed', type: 'transcription_error' } });
    }
  }
}
