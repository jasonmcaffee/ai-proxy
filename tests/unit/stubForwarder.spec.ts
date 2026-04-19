import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import * as request from 'supertest';

describe('Stub endpoints (M7)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /v1/images/generations returns 501', async () => {
    const res = await request(app.getHttpServer()).post('/v1/images/generations').send({});
    expect(res.status).toBe(501);
  });

  it('POST /v1/audio/transcriptions returns 501', async () => {
    const res = await request(app.getHttpServer()).post('/v1/audio/transcriptions').send({});
    expect(res.status).toBe(501);
  });

  it('POST /v1/audio/speech returns 501', async () => {
    const res = await request(app.getHttpServer()).post('/v1/audio/speech').send({});
    expect(res.status).toBe(501);
  });

  it('POST /v1/videos/generations returns 501', async () => {
    const res = await request(app.getHttpServer()).post('/v1/videos/generations').send({});
    expect(res.status).toBe(501);
  });
});
