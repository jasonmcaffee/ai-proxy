import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import OpenAI from 'openai';
import { ChatController } from '../../src/controllers/chat.controller';
import { ContextCompressorService } from '../../src/services/contextCompressor.service';
import { RetryExecutorService } from '../../src/services/retryExecutor.service';
import { StreamBufferService } from '../../src/services/streamBuffer.service';
import { PassThrough, Writable } from 'stream';

/** Builds a mock Express response backed by a Writable so stream.pipe(res) works without errors. */
function makeMockRes() {
  const writable = new Writable({ write(_chunk, _enc, cb) { cb(); } });
  const res: any = writable;
  res.statusCode = 200;
  res.headers = {} as Record<string, string>;
  res.body = null as any;
  res.status = jest.fn((code: number) => { res.statusCode = code; return res; });
  res.json = jest.fn((body: any) => { res.body = body; return res; });
  res.setHeader = jest.fn((k: string, v: string) => { res.headers[k] = v; return res; });
  return res;
}

/** Builds a minimal mock Express request with a no-op 'close' event. */
function makeMockReq() {
  return { on: jest.fn() } as any;
}

const okCompletion = {
  choices: [{ message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }],
  object: 'chat.completion',
};

const baseDto = { model: 'local-model', messages: [{ role: 'user' as const, content: 'hi' }] };

describe('ChatController — error status forwarding', () => {
  let controller: ChatController;
  let retryExecutor: jest.Mocked<RetryExecutorService>;
  let streamBuffer: jest.Mocked<StreamBufferService>;
  let compressor: jest.Mocked<ContextCompressorService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        { provide: RetryExecutorService, useValue: { invoke: jest.fn() } },
        { provide: StreamBufferService, useValue: { pipe: jest.fn() } },
        { provide: ContextCompressorService, useValue: { compress: jest.fn(async (msgs) => msgs) } },
      ],
    }).compile();

    controller = module.get(ChatController);
    retryExecutor = module.get(RetryExecutorService) as any;
    streamBuffer = module.get(StreamBufferService) as any;
    compressor = module.get(ContextCompressorService) as any;
  });

  describe('non-stream — success', () => {
    it('returns 200 with the completion body', async () => {
      retryExecutor.invoke.mockResolvedValue(okCompletion);
      const res = makeMockRes();
      await controller.createCompletion(baseDto as any, makeMockReq(), res);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(okCompletion);
    });
  });

  describe('non-stream — llama.cpp 500', () => {
    it('returns 500 with the upstream error body', async () => {
      const upstreamBody = { message: 'model overloaded', type: 'server_error' };
      const apiError = new OpenAI.APIError(500, upstreamBody, 'model overloaded', new Headers());
      retryExecutor.invoke.mockRejectedValue(apiError);
      const res = makeMockRes();

      await controller.createCompletion(baseDto as any, makeMockReq(), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: upstreamBody });
    });
  });

  describe('non-stream — llama.cpp 400', () => {
    it('returns 400 with the upstream error body', async () => {
      const upstreamBody = { message: 'invalid request', type: 'invalid_request_error' };
      const apiError = new OpenAI.APIError(400, upstreamBody, 'invalid request', new Headers());
      retryExecutor.invoke.mockRejectedValue(apiError);
      const res = makeMockRes();

      await controller.createCompletion(baseDto as any, makeMockReq(), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: upstreamBody });
    });
  });

  describe('non-stream — network error (no status)', () => {
    it('returns 500 with a proxy_error body when no status is present', async () => {
      retryExecutor.invoke.mockRejectedValue(new Error('ECONNREFUSED'));
      const res = makeMockRes();

      await controller.createCompletion(baseDto as any, makeMockReq(), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(res.json.mock.calls[0][0].error.message).toMatch(/ECONNREFUSED/);
    });
  });

  describe('stream — success', () => {
    it('sets SSE headers and does not call res.status on success', async () => {
      const passThrough = new PassThrough();
      passThrough.end(); // close immediately so pipe finishes
      streamBuffer.pipe.mockResolvedValue({ stream: passThrough, recoveryCount: 0 });
      const res = makeMockRes();

      await controller.createCompletion({ ...baseDto, stream: true } as any, makeMockReq(), res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('stream — llama.cpp 500', () => {
    it('returns 500 JSON (not SSE) when the upstream errors before streaming starts', async () => {
      const upstreamBody = { message: 'model crashed', type: 'server_error' };
      const apiError = new OpenAI.APIError(500, upstreamBody, 'model crashed', new Headers());
      streamBuffer.pipe.mockRejectedValue(apiError);
      const res = makeMockRes();

      await controller.createCompletion({ ...baseDto, stream: true } as any, makeMockReq(), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: upstreamBody });
      // Must NOT have set SSE content-type before knowing the stream would succeed
      expect(res.headers['Content-Type']).toBeUndefined();
    });
  });

  describe('stream — llama.cpp 503', () => {
    it('returns 503 JSON when upstream returns service unavailable', async () => {
      const upstreamBody = { message: 'service unavailable' };
      const apiError = new OpenAI.APIError(503, upstreamBody, 'service unavailable', new Headers());
      streamBuffer.pipe.mockRejectedValue(apiError);
      const res = makeMockRes();

      await controller.createCompletion({ ...baseDto, stream: true } as any, makeMockReq(), res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ error: upstreamBody });
    });
  });
});
