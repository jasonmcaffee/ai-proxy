import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(require('express').json({ limit: '10mb' }));

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: false }));

  const config = new DocumentBuilder()
    .setTitle('AI Proxy API')
    .setDescription('OpenAI-compatible proxy for llama.cpp with context compression, retry, and tool-call buffering')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (_controllerKey: string, methodKey: string) => methodKey,
  });

  SwaggerModule.setup('api', app, document);

  const swaggerPath = join(__dirname, '..', 'src', 'openapi-spec.json');
  if (existsSync(join(__dirname, '..', 'src'))) {
    writeFileSync(swaggerPath, JSON.stringify(document, null, 2));
    console.log(`OpenAPI spec written to ${swaggerPath}`);
  }

  const port = process.env.PORT ?? 4141;
  await app.listen(port);
  console.log(`AI Proxy running on http://localhost:${port}`);
  console.log(`Swagger UI: http://localhost:${port}/api`);
}

bootstrap();
