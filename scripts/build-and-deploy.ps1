param(
    [string]$Dest = "C:\jason\dev\prod\ai-proxy"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $ProjectRoot

Write-Host "Building from $ProjectRoot..."
$buildInfo = Join-Path $ProjectRoot "tsconfig.build.tsbuildinfo"
if (Test-Path $buildInfo) { Remove-Item $buildInfo -Force }
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed"; exit 1 }

$DistPath = Join-Path $ProjectRoot "dist"
if (!(Test-Path $DistPath)) { Write-Error "dist folder not found at $DistPath after build"; exit 1 }

Write-Host "Cleaning $Dest..."
if (Test-Path $Dest) { Remove-Item -Path $Dest -Recurse -Force }
New-Item -ItemType Directory -Path $Dest | Out-Null

Write-Host "Deploying to $Dest..."
Copy-Item -Path $DistPath -Destination $Dest -Recurse -Force
Copy-Item -Path (Join-Path $ProjectRoot "package.json") -Destination $Dest -Force
$EnvFile = Join-Path $ProjectRoot ".env"
if (Test-Path $EnvFile) { Copy-Item -Path $EnvFile -Destination $Dest -Force }

Write-Host "Installing production dependencies in $Dest..."
Push-Location $Dest
npm install --omit=dev
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Error "npm install failed"; exit 1 }
Pop-Location

Write-Host "Deploy complete."
