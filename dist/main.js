"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const swagger_1 = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const fs_1 = require("fs");
const path_1 = require("path");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.enableCors({
        origin: '*',
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
        credentials: true,
    });
    app.useGlobalPipes(new common_1.ValidationPipe({ transform: true, whitelist: false }));
    const config = new swagger_1.DocumentBuilder()
        .setTitle('AI Proxy API')
        .setDescription('OpenAI-compatible proxy for llama.cpp with context compression, retry, and tool-call buffering')
        .setVersion('1.0')
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, config, {
        operationIdFactory: (_controllerKey, methodKey) => methodKey,
    });
    swagger_1.SwaggerModule.setup('api', app, document);
    const swaggerPath = (0, path_1.join)(__dirname, '..', 'src', 'openapi-spec.json');
    (0, fs_1.writeFileSync)(swaggerPath, JSON.stringify(document, null, 2));
    console.log(`OpenAPI spec written to ${swaggerPath}`);
    const port = process.env.PORT ?? 4141;
    await app.listen(port);
    console.log(`AI Proxy running on http://localhost:${port}`);
    console.log(`Swagger UI: http://localhost:${port}/api`);
}
bootstrap();
//# sourceMappingURL=main.js.map