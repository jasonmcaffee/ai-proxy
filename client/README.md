# ai-proxy-client

Generated TypeScript fetch client for the ai-proxy service.

## Installation

From another local project, install by pointing to the full path on disk:

```bash
npm install C:\jason\dev\ai-proxy\client
```

Or with a relative path from a sibling directory:

```bash
npm install file:../ai-proxy/client
```

## Usage

```typescript
import { Configuration, ChatApi, ModelsApi } from 'ai-proxy-client';

const config = new Configuration({ basePath: 'http://localhost:4141' });
const chatApi = new ChatApi(config);

// Non-streaming completion
const result = await chatApi.createCompletion({
  messages: [{ role: 'user', content: 'Hello!' }],
  model: 'local-model',
});
console.log(result.choices[0].message.content);

// With context compression
const compressed = await chatApi.createCompletion({
  messages: [...longHistory],
  model: 'local-model',
  compressionOptions: { enabled: true, maxContextSize: 100000 },
});
```

## Regenerating the client

From the `ai-proxy` root:

```bash
node dist/main.js   # starts server, writes openapi-spec.json, then Ctrl-C
npm run generate-ai-client-win
```
