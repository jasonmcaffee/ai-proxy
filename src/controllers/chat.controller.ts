import { Body, Controller, HttpException, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ChatCompletionRequestDto, ChatCompletionResponseDto } from '../models/chatCompletion.dto';
import { ContextCompressorService } from '../services/contextCompressor.service';
import { RetryExecutorService } from '../services/retryExecutor.service';
import { StreamBufferService } from '../services/streamBuffer.service';
import { ChatMessage } from '../services/llamaForwarder.service';

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
    const { compressionOptions, awaitToolCallCompletion, disableThinking, ...forwardPayload } = dto;

    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    const compressedMessages = await this.compressor.compress(dto.messages as unknown as ChatMessage[], compressionOptions);

    const payload = {
      ...forwardPayload,
      messages: compressedMessages,
      ...(disableThinking ? { chat_template_kwargs: { enable_thinking: false } } : {}),
    } as Record<string, unknown>;

    if (dto.stream) {
      await this.handleStream(payload, awaitToolCallCompletion ?? false, abortController.signal, res);
    } else {
      await this.handleNonStream(payload, abortController.signal, res);
    }
  }

  /**
   * Handles non-streaming completions via RetryExecutorService.
   * @param payload - the forwarded request body
   * @param signal - abort signal forwarded from the client connection
   * @param res - express response
   */
  private async handleNonStream(payload: Record<string, unknown>, signal: AbortSignal, res: Response): Promise<void> {
    try {
      const result = await this.retryExecutor.invoke(payload, signal);
      res.json(result);
    } catch (e: any) {
      const status = e?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
      res.status(status).json({ error: { message: e?.message ?? 'Unknown error', type: 'proxy_error' } });
    }
  }

  /**
   * Handles streaming completions via StreamBufferService, piping SSE to the client.
   * @param payload - the forwarded request body
   * @param awaitToolCallCompletion - whether to buffer tool-call deltas
   * @param signal - abort signal forwarded from the client connection
   * @param res - express response
   */
  private async handleStream(payload: Record<string, unknown>, awaitToolCallCompletion: boolean, signal: AbortSignal, res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Transfer-Encoding', 'chunked');

    try {
      const { stream, recoveryCount } = await this.streamBuffer.pipe(payload, awaitToolCallCompletion, signal);
      if (recoveryCount > 0) {
        res.setHeader('x-ai-proxy-stream-recovery', String(recoveryCount));
      }
      stream.pipe(res);
    } catch (e: any) {
      res.write(`data: ${JSON.stringify({ error: { message: e?.message ?? 'Stream error', type: 'proxy_error' } })}\n\n`);
      res.end();
    }
  }
}
