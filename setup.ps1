# One-command setup for Windows (PowerShell).
# Checks for a compatible Node.js version and installs dependencies.
#
# Usage (from the repo root, in PowerShell):
#   .\setup.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "== Proof of Dev setup ==" -ForegroundColor Cyan

# ─── 1. Check Node.js ─────────────────────────────────────────────────────────
$nodeOk = $false
try {
    $nodeVersion = node -v
    $major = [int]($nodeVersion.TrimStart("v").Split(".")[0])
    if ($major -ge 20 -and $major -lt 23) { $nodeOk = $true }
} catch {
    $nodeOk = $false
}

if ($nodeOk) {
    Write-Host "Node $nodeVersion found — OK" -ForegroundColor Green
} else {
    Write-Host "Node.js >=20 <23 not found." -ForegroundColor Yellow
    Write-Host "This repo needs Node 20.x-22.x. Install it from:"
    Write-Host "  https://nodejs.org/en/download"
    Write-Host "or, if you use nvm-windows (https://github.com/coreybutler/nvm-windows):"
    Write-Host "  nvm install 20"
    Write-Host "  nvm use 20"
    Write-Host "Then re-run this script."
    exit 1
}

Write-Host "npm: $(npm -v)"

# ─── 2. Create .env.local if missing ─────────────────────────────────────────
if (-not (Test-Path ".env.local") -and (Test-Path ".env.example")) {
    Copy-Item ".env.example" ".env.local"
    Write-Host "Created .env.local from .env.example (demo mode by default)."
}

# ─── 3. Install dependencies ──────────────────────────────────────────────────
Write-Host "Installing dependencies (npm ci)..."
npm ci

Write-Host ""
Write-Host "Setup complete. Start the app with:" -ForegroundColor Cyan
Write-Host "  npm run dev"
Write-Host ""
Write-Host "This runs the analysis API (:8000), the ZeroMQ worker, and Next.js (:3000)."
Write-Host "MongoDB is optional in demo mode — install/run it locally, or use"
Write-Host "'docker compose up' instead, to persist results."
