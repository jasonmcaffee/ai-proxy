@echo off
set PORT=4142
cd /d C:\jason\dev\ai-proxy
echo Starting ai-proxy (dev) on port %PORT%...
npx ts-node -r tsconfig-paths/register src/main.ts
