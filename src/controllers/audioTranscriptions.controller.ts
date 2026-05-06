import { Body, Controller, HttpStatus, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AudioTranscriptionResponseDto } from '../models/audioTranscription.dto';
import { SpeechToTextService } from '../services/speechToText.service';

/**
 * Handles POST /v1/audio/transcriptions — OpenAI-compatible speech-to-text via speaches.
 */
@ApiTags('audio')
@Controller('v1/audio')
export class AudioTranscriptionsController {
  constructor(private readonly speechToText: SpeechToTextService) {}

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
      },
    },
  })
  @ApiOperation({ summary: 'Transcribe audio to text using speaches (faster-whisper)' })
  @ApiResponse({ status: 200, type: AudioTranscriptionResponseDto })
  @ApiResponse({ status: 500, description: 'Transcription failed' })
  async transcribe(@UploadedFile() file: Express.Multer.File, @Body('model') model: string, @Body('language') language: string, @Res() res: Response): Promise<void> {
    try {
      const text = await this.speechToText.transcribe(file, model, language);
      res.status(HttpStatus.OK).json({ text });
    } catch (e: any) {
      console.error('[AudioTranscriptionsController] transcribe error:', e?.message ?? e);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: { message: e?.message ?? 'Transcription failed', type: 'transcription_error' } });
    }
  }
}
