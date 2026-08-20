$ErrorActionPreference = 'Stop'

Write-Host '== VERAH Codex token tooling setup ==' -ForegroundColor Cyan

function Require-Command($name, $hint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Missing required command '$name'. $hint"
  }
}

Require-Command git 'Install Git and reopen PowerShell.'
Require-Command codex 'Install/update the Codex CLI/Desktop integration first.'
Require-Command python 'Install Python 3.10+ and reopen PowerShell.'
Require-Command npm 'Install Node.js 22.13+ and reopen PowerShell.'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $repoRoot
try {
  Write-Host '[1/4] Installing CodeBurn (local-first usage observability)...' -ForegroundColor Yellow
  npm install -g codeburn
  codeburn --version

  Write-Host '[2/4] Installing Graphify and registering project-scoped Codex skill...' -ForegroundColor Yellow
  python -m pip install --upgrade graphifyy
  graphify install --project --platform codex

  # Enable multi-agent extraction if a Codex config already exists. We do not overwrite
  # arbitrary config: only append a documented feature stanza when absent.
  $codexDir = Join-Path $HOME '.codex'
  $codexConfig = Join-Path $codexDir 'config.toml'
  New-Item -ItemType Directory -Force -Path $codexDir | Out-Null
  if (-not (Test-Path $codexConfig)) {
    "[features]`nmulti_agent = true`n" | Set-Content -Path $codexConfig -Encoding utf8
  } else {
    $cfg = Get-Content $codexConfig -Raw
    if ($cfg -notmatch '(?m)^\s*multi_agent\s*=') {
      Add-Content -Path $codexConfig -Value "`n[features]`nmulti_agent = true`n"
    }
  }

  Write-Host '[3/4] Installing Ponytail Codex plugin...' -ForegroundColor Yellow
  codex plugin marketplace add DietrichGebert/ponytail
  codex plugin add ponytail@ponytail

  Write-Host '[4/4] Installing Headroom CLI (compression/proxy layer)...' -ForegroundColor Yellow
  python -m pip install --upgrade "headroom-ai[all]"
  headroom doctor

  Write-Host ''
  Write-Host 'Setup complete.' -ForegroundColor Green
  Write-Host 'Next: restart Codex, open /hooks and review/trust Ponytail hooks.'
  Write-Host 'Graphify: use $graphify . from Codex.'
  Write-Host 'CodeBurn: run codeburn overview --provider codex or codeburn optimize --provider codex.'
  Write-Host 'Headroom is installed but NOT forced on your current Codex session.'
  Write-Host 'Use scripts/run-codex-optimized.ps1 for a fresh compressed Codex session.'
} finally {
  Pop-Location
}
