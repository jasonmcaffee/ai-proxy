@echo off
set PORT=4142
cd /d C:\jason\dev\prod\ai-proxy
echo Starting ai-proxy (prod) on port %PORT%...
node dist/main
