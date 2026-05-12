import { Body, Controller, HttpStatus, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiExtraModels, ApiOperation, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AudioTranscriptionRequestDto, AudioTranscriptionResponseDto, AudioTranscriptionVerboseResponseDto, TranscriptionSegmentDto } from '../models/audioTranscription.dto';
import { SpeechToTextService } from '../services/speechToText.service';
import { TranscribeAudioService } from '../services/transcribeAudio.service';

/**
 * Handles POST /v1/audio/transcriptions — OpenAI-compatible speech-to-text.
 * Routes to speaches (default) or transcribe-audio (when diarization=true).
 */
@ApiTags('audio')
@Controller('v1/audio')
@ApiExtraModels(AudioTranscriptionResponseDto, AudioTranscriptionVerboseResponseDto, TranscriptionSegmentDto)
export class AudioTranscriptionsController {
  constructor(private readonly speechToText: SpeechToTextService, private readonly diarization: TranscribeAudioService) {}

  @Post('transcriptions')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Audio file to transcribe' },
        model: { type: 'string', description: 'Whisper model name', example: 'Systran/faster-whisper-small' },
        language: { type: 'string', description: 'ISO 639-1 language code', example: 'en' },
        diarization: { type: 'boolean', description: 'Enable speaker diarization (routes to transcribe-audio service)', default: false },
        min_speakers: { type: 'integer', description: 'Minimum speaker count hint (diarization=true only)', example: 2 },
        max_speakers: { type: 'integer', description: 'Maximum speaker count hint (diarization=true only)', example: 3 },
      },
    },
  })
  @ApiOperation({ summary: 'Transcribe audio to text. With diarization=true, returns verbose_json with per-segment speaker labels.' })
  @ApiResponse({
    status: 200,
    description: 'Transcription result — plain {text} when diarization=false, verbose with speakers when diarization=true',
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
        const verbose = await this.diarization.transcribeWithDiarization(file, {
          language: body.language,
          min_speakers: body.min_speakers,
          max_speakers: body.max_speakers,
        }, ac.signal);
        res.status(HttpStatus.OK).json(verbose);
        return;
      }
      const text = await this.speechToText.transcribe(file, body.model, body.language);
      res.status(HttpStatus.OK).json({ text });
    } catch (e: any) {
      if (ac.signal.aborted) return;
      console.error('[AudioTranscriptionsController] transcribe error:', e?.message ?? e);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: { message: e?.message ?? 'Transcription failed', type: 'transcription_error' } });
    }
  }
}
