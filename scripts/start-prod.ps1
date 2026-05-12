param(
    [string]$ProdDir = "C:\jason\dev\prod\ai-proxy"
)

$env:PORT = "4142"

Write-Host "Starting ai-proxy (prod) on port $env:PORT from $ProdDir..."
Set-Location $ProdDir
node dist/main
