$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

if (-not (Get-Command headroom -ErrorAction SilentlyContinue)) {
  throw 'Headroom is not installed. Run scripts/setup-codex-token-tooling.ps1 first.'
}

Write-Host 'Starting Codex through Headroom compression...' -ForegroundColor Cyan
Write-Host 'Stop this wrapper with Ctrl+C. To restore any wrapped configuration, run: headroom unwrap codex'
headroom wrap codex
