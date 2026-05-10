@echo off
set PORT=4141
cd /d C:\jason\dev\prod\ai-proxy
echo Starting ai-proxy (prod) on port %PORT%...
node dist/main
