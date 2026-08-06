import { Body, Controller, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { LlamaParamsNonStreaming, LlamaParamsStreaming } from '../models/openaiExtensions';
import { ChatCompletionRequestDto, ChatCompletionResponseDto } from '../models/chatCompletion.dto';
import { ContextCompressorService } from '../services/contextCompressor.service';
import { RetryExecutorService } from '../services/retryExecutor.service';
import { StreamBufferService } from '../services/streamBuffer.service';
import { compressionProgressFrame, contextUsageFrame, setContextUsageHeaders } from '../services/proxyEvents';

/**
 * Handles POST /v1/chat/completions — the main OpenAI-compatible inference endpoint.
 * Applies context compression (emitting progress + context-usage), then routes to streaming or non-streaming.
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
    // Abort the upstream llama.cpp request the instant the client disconnects. For a POST whose body is
    // already fully read, `req` 'close' does NOT reliably fire when the client goes away mid-RESPONSE — so
    // a stopped/closed Co-Pilot stream would leave llama generating to completion (observed: a single
    // degenerate 49k-token generation pinning the single-slot GPU). `res` 'close' is the dependable signal
    // that the streaming client went away, so listen on both. abort() is idempotent, so a normal completion
    // firing `res` 'close' after the stream already ended is a harmless no-op.
    const onClientDisconnect = () => abortController.abort();
    req.on('close', onClientDisconnect);
    res.on('close', onClientDisconnect);

    const llamaExtras = disableThinking ? { chat_template_kwargs: { enable_thinking: false } } : {};

    if (stream) {
      await this.runStream(messages as unknown as ChatCompletionMessageParam[], compressionOptions, rest, llamaExtras, awaitToolCallCompletion ?? false, abortController.signal, res);
    } else {
      await this.runNonStream(messages as unknown as ChatCompletionMessageParam[], compressionOptions, rest, llamaExtras, abortController.signal, res);
    }
  }

  /**
   * Streaming path. When compression is enabled, opens SSE early to stream progress + context-usage
   * before piping the model stream. When disabled, keeps the legacy flow so upstream errors surface as clean HTTP status.
   * @param messages - client message history
   * @param compressionOptions - client compression options
   * @param rest - remaining OpenAI params
   * @param llamaExtras - llama.cpp-specific extras
   * @param awaitToolCallCompletion - whether to buffer tool-call deltas
   * @param signal - abort signal
   * @param res - express response
   */
  private async runStream(messages: ChatCompletionMessageParam[], compressionOptions: any, rest: any, llamaExtras: any, awaitToolCallCompletion: boolean, signal: AbortSignal, res: Response): Promise<void> {
    if (compressionOptions?.enabled) {
      return this.runStreamWithCompression(messages, compressionOptions, rest, llamaExtras, awaitToolCallCompletion, signal, res);
    }

    try {
      const base = { ...rest, model: rest.model ?? 'local-model', messages, ...llamaExtras };
      const params = { ...base, stream: true } as LlamaParamsStreaming;
      const { stream } = await this.streamBuffer.pipe(params, awaitToolCallCompletion, signal);
      this.setSseHeaders(res);
      // Flush the headers before any token arrives so the client's reader opens immediately rather than
      // waiting on the first write (task-1489: the stream must feel live from the first token).
      (res as any).flushHeaders?.();
      stream.pipe(res);
    } catch (e: any) {
      const status = e?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
      const errorBody = e?.error ?? { message: e?.message ?? 'Stream error', type: 'proxy_error' };
      res.status(status).json({ error: errorBody });
    }
  }

  /**
   * Streaming path with compression: flushes SSE headers, emits progress + context-usage, then pipes the model stream.
   * On error after headers are sent, writes an SSE error frame instead of an HTTP status.
   * @param messages - client message history
   * @param compressionOptions - client compression options
   * @param rest - remaining OpenAI params
   * @param llamaExtras - llama.cpp-specific extras
   * @param awaitToolCallCompletion - whether to buffer tool-call deltas
   * @param signal - abort signal
   * @param res - express response
   */
  private async runStreamWithCompression(messages: ChatCompletionMessageParam[], compressionOptions: any, rest: any, llamaExtras: any, awaitToolCallCompletion: boolean, signal: AbortSignal, res: Response): Promise<void> {
    this.setSseHeaders(res);
    (res as any).flushHeaders?.();
    try {
      const { messages: compressed, meta } = await this.compressor.compress(messages, compressionOptions, p => res.write(compressionProgressFrame(p)));
      if (meta) res.write(contextUsageFrame(meta));

      const base = { ...rest, model: rest.model ?? 'local-model', messages: compressed, ...llamaExtras };
      const params = { ...base, stream: true } as LlamaParamsStreaming;
      const { stream } = await this.streamBuffer.pipe(params, awaitToolCallCompletion, signal);
      stream.pipe(res);
    } catch (e: any) {
      const errorBody = e?.error ?? { message: e?.message ?? 'Stream error', type: 'proxy_error' };
      res.write(`data: ${JSON.stringify({ error: errorBody })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }

  /**
   * Sets the standard SSE response headers.
   * @param res - express response
   */
  private setSseHeaders(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Transfer-Encoding', 'chunked');
  }

  /**
   * Non-streaming path: compresses, attaches context-usage headers + body field, and returns JSON.
   * @param messages - client message history
   * @param compressionOptions - client compression options
   * @param rest - remaining OpenAI params
   * @param llamaExtras - llama.cpp-specific extras
   * @param signal - abort signal
   * @param res - express response
   */
  private async runNonStream(messages: ChatCompletionMessageParam[], compressionOptions: any, rest: any, llamaExtras: any, signal: AbortSignal, res: Response): Promise<void> {
    try {
      const { messages: compressed, meta } = await this.compressor.compress(messages, compressionOptions);
      const base = { ...rest, model: rest.model ?? 'local-model', messages: compressed, ...llamaExtras };
      const params = { ...base, stream: false } as LlamaParamsNonStreaming;
      const result = await this.retryExecutor.invoke(params, signal);
      if (meta) {
        setContextUsageHeaders(res, meta);
        (result as any).x_ai_proxy = { contextUsage: meta };
      }
      res.status(HttpStatus.OK).json(result);
    } catch (e: any) {
      const status = e?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
      const errorBody = e?.error ?? { message: e?.message ?? 'Unknown error', type: 'proxy_error' };
      res.status(status).json({ error: errorBody });
    }
  }
}
