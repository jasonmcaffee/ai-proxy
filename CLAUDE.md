# CLAUDE.md

## OpenAPI Spec Generation

**Never manually edit `src/openapi-spec.json`.**

The spec is auto-generated from NestJS decorators when the app starts. The correct workflow is:

1. Update the DTO/controller source code
2. Start the app (`npm run start:dev` or `npx ts-node -r tsconfig-paths/register src/main.ts`) — it writes `src/openapi-spec.json` on startup
3. Run `npm run generate-client` to regenerate the TypeScript client from the spec

Manually editing the spec bypasses code generation and breaks the guarantee that the client matches the server.
