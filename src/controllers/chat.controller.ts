import { Body, Controller, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { LlamaParamsNonStreaming, LlamaParamsStreaming } from '../models/openaiExtensions';
import { ChatCompletionRequestDto, ChatCompletionResponseDto } from '../models/chatCompletion.dto';
import { ContextCompressorService } from '../services/contextCompressor.service';
import { RetryExecutorService } from '../services/retryExecutor.service';
import { StreamBufferService } from '../services/streamBuffer.service';

/**
 * Handles POST /v1/chat/completions — the main OpenAI-compatible inference endpoint.
 * Applies context compression, then routes to streaming or non-streaming path.
 */
@ApiTags('chat')
@Controller('v1/chat')
export class ChatController {
  constructor(
    private readonly compressor: ContextCompressorService,
    private readonly retryExecutor: RetryExecutorService,
    private readonly streamBuffer: StreamBufferService,
  ) {}

  @Post('completions')
  @ApiOperation({ summary: 'Create a chat completion' })
  @ApiResponse({ status: 200, type: ChatCompletionResponseDto })
  async createCompletion(@Body() dto: ChatCompletionRequestDto, @Req() req: Request, @Res() res: Response): Promise<void> {
    const { compressionOptions, awaitToolCallCompletion, disableThinking, stream, messages, ...rest } = dto;

    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    const compressedMessages = await this.compressor.compress(messages as unknown as ChatCompletionMessageParam[], compressionOptions);

    const llamaExtras = disableThinking ? { chat_template_kwargs: { enable_thinking: false } } : {};
    const base = { ...rest, model: rest.model ?? 'local-model', messages: compressedMessages, ...llamaExtras };

    if (stream) {
      const params = { ...base, stream: true } as LlamaParamsStreaming;
      await this.handleStream(params, awaitToolCallCompletion ?? false, abortController.signal, res);
    } else {
      const params = { ...base, stream: false } as LlamaParamsNonStreaming;
      await this.handleNonStream(params, abortController.signal, res);
    }
  }

  /**
   * Handles non-streaming completions via RetryExecutorService.
   * @param params - typed non-streaming params
   * @param signal - abort signal forwarded from the client connection
   * @param res - express response
   */
  private async handleNonStream(params: LlamaParamsNonStreaming, signal: AbortSignal, res: Response): Promise<void> {
    try {
      const result = await this.retryExecutor.invoke(params, signal);
      res.status(HttpStatus.OK).json(result);
    } catch (e: any) {
      const status = e?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
      const errorBody = e?.error ?? { message: e?.message ?? 'Unknown error', type: 'proxy_error' };
      res.status(status).json({ error: errorBody });
    }
  }

  /**
   * Handles streaming completions via StreamBufferService, piping SSE to the client.
   * @param params - typed streaming params
   * @param awaitToolCallCompletion - whether to buffer tool-call deltas
   * @param signal - abort signal forwarded from the client connection
   * @param res - express response
   */
  private async handleStream(params: LlamaParamsStreaming, awaitToolCallCompletion: boolean, signal: AbortSignal, res: Response): Promise<void> {
    try {
      const { stream, recoveryCount } = await this.streamBuffer.pipe(params, awaitToolCallCompletion, signal);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Transfer-Encoding', 'chunked');
      if (recoveryCount > 0) {
        res.setHeader('x-ai-proxy-stream-recovery', String(recoveryCount));
      }
      stream.pipe(res);
    } catch (e: any) {
      const status = e?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
      const errorBody = e?.error ?? { message: e?.message ?? 'Stream error', type: 'proxy_error' };
      res.status(status).json({ error: errorBody });
    }
  }
}
