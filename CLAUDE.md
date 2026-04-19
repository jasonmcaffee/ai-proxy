# CLAUDE.md

## OpenAPI Spec Generation

**Never manually edit `src/openapi-spec.json`.**

The spec is auto-generated from NestJS decorators when the app starts. The correct workflow is:

1. Update the DTO/controller source code
2. Start the app (`npm run start:dev` or `npx ts-node -r tsconfig-paths/register src/main.ts`) — it writes `src/openapi-spec.json` on startup
3. Run `npm run generate-client` to regenerate the TypeScript client from the spec

Manually editing the spec bypasses code generation and breaks the guarantee that the client matches the server.

## Managing the Proxy Service

- **Dev/test** runs on port **4142**. **Prod** runs on port **4141** (at `C:\jason\dev\prod`).

Use these npm scripts to manage it:

- **Start (dev):** `PORT=4142 npx ts-node -r tsconfig-paths/register src/main.ts &` (background) or `npm run start:dev` (watch mode, port 4142)
- **Stop (dev):** `npm run stop-service` — kills whatever process is listening on port 4142
- **Stop (prod):** `npm run stop-service-prod` — kills whatever process is listening on port 4141
- **Deploy:** `npm run build-and-deploy` — builds and copies files to `C:\jason\dev\prod\ai-proxy` (does not stop/start the service)

Do not use `taskkill` directly from bash — it fails because Git Bash misinterprets the path. Use the npm scripts or call PowerShell explicitly:
```
powershell -Command "Stop-Process -Id (Get-NetTCPConnection -LocalPort 4142 -State Listen).OwningProcess -Force"
```

If the app is already running when you start a new instance (e.g., to regenerate the spec), it will still write `src/openapi-spec.json` before hitting the `EADDRINUSE` error — so the spec gets updated even on a failed start.

## Integration Tests

Integration tests run against the **dev server on port 4142** (not prod). Before running `npm run test:integration`, start the dev server:

```
PORT=4142 npx ts-node -r tsconfig-paths/register src/main.ts &
```

The default `PROXY_URL` in the integration tests is `http://localhost:4142`. Tests also require llama.cpp running on port 8080 (`LLAMA_BASE_URL`, default `http://localhost:8080`).
