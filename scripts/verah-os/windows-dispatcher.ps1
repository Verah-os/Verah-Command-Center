param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Install", "Uninstall", "Status")]
  [string]$Action
)

$ErrorActionPreference = "Stop"
$loginTask = "VERAH OS Dispatcher Login"
$watchdogTask = "VERAH OS Dispatcher Watchdog"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Source
$taskCommand = "`"$pnpm`" --dir `"$repoRoot`" verah:dispatcher:start"

if ($Action -eq "Install") {
  schtasks.exe /Create /TN $loginTask /SC ONLOGON /TR $taskCommand /RL LIMITED /F | Out-Null
  schtasks.exe /Create /TN $watchdogTask /SC MINUTE /MO 5 /TR $taskCommand /RL LIMITED /F | Out-Null
  Write-Output "Installed user-level login and watchdog tasks. No credentials were stored."
  exit 0
}

if ($Action -eq "Uninstall") {
  schtasks.exe /Delete /TN $loginTask /F 2>$null | Out-Null
  schtasks.exe /Delete /TN $watchdogTask /F 2>$null | Out-Null
  Write-Output "Removed VERAH OS dispatcher tasks. Repository and runtime state were preserved."
  exit 0
}

schtasks.exe /Query /TN $loginTask /FO LIST 2>$null
schtasks.exe /Query /TN $watchdogTask /FO LIST 2>$null

