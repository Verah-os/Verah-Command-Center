$ErrorActionPreference = 'Stop'

Write-Host '== VERAH Codex token tooling setup ==' -ForegroundColor Cyan

function Require-Command($name, $hint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Missing required command '$name'. $hint"
  }
}

function Enable-CodexMultiAgent($codexConfig) {
  $utf8 = [System.Text.UTF8Encoding]::new($false)
  $newline = [Environment]::NewLine
  $configExists = Test-Path -LiteralPath $codexConfig
  $cfg = if ($configExists) {
    [System.IO.File]::ReadAllText($codexConfig)
  } else {
    ''
  }

  if ($cfg.Contains("`n")) {
    $newline = if ($cfg.Contains("`r`n")) { "`r`n" } else { "`n" }
  }

  $features = [regex]::Match($cfg, '(?m)^[ \t]*\[features\][ \t]*(?:#.*)?\r?$')
  if ($features.Success) {
    $bodyStart = $features.Index + $features.Length
    $remaining = $cfg.Substring($bodyStart)
    $nextTable = [regex]::Match($remaining, '(?m)^[ \t]*\[[^\]]+\]')
    $bodyLength = if ($nextTable.Success) { $nextTable.Index } else { $remaining.Length }
    $featuresBody = $remaining.Substring(0, $bodyLength)

    if ($featuresBody -match '(?m)^[ \t]*multi_agent[ \t]*=') {
      return
    }

    $lineEnd = $cfg.IndexOf("`n", $features.Index)
    if ($lineEnd -ge 0) {
      $updated = $cfg.Insert($lineEnd + 1, "multi_agent = true$newline")
    } else {
      $updated = "$cfg$newline" + "multi_agent = true$newline"
    }
  } else {
    if ([string]::IsNullOrEmpty($cfg)) {
      $updated = "[features]$newline" + "multi_agent = true$newline"
    } else {
      $separator = if ($cfg.EndsWith($newline)) { '' } else { $newline }
      $updated = "$cfg$separator$newline" + "[features]$newline" + "multi_agent = true$newline"
    }
  }

  $tempConfig = "$codexConfig.tmp-$PID"
  try {
    [System.IO.File]::WriteAllText($tempConfig, $updated, $utf8)
    python -c "import sys, tomllib; tomllib.load(open(sys.argv[1], 'rb'))" $tempConfig
    if ($LASTEXITCODE -ne 0) {
      throw 'Updated Codex configuration is not valid TOML.'
    }

    if ($configExists) {
      $backup = "$codexConfig.backup-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmssfff'))"
      Copy-Item -LiteralPath $codexConfig -Destination $backup
      Write-Host "Codex config backup: $backup"
    }

    Move-Item -Force -LiteralPath $tempConfig -Destination $codexConfig
  } finally {
    Remove-Item -Force -LiteralPath $tempConfig -ErrorAction SilentlyContinue
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

  # Enable multi-agent extraction without duplicating an existing TOML table.
  $codexDir = Join-Path $HOME '.codex'
  $codexConfig = Join-Path $codexDir 'config.toml'
  New-Item -ItemType Directory -Force -Path $codexDir | Out-Null
  Enable-CodexMultiAgent $codexConfig

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
