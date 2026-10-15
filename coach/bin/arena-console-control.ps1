param(
  [ValidateSet('start', 'stop', 'restart', 'status')][string]$Action = 'status',
  [string]$NodePath = 'node',
  [ValidateRange(1024, 65535)][int]$Port = 4318
)
$ErrorActionPreference = 'Stop'
$arenaRoot = Split-Path -Parent $PSScriptRoot
$arenaUrl = "http://127.0.0.1:$Port"
$arenaLogs = Join-Path $arenaRoot 'reports/blind-discard-arena'

function Get-ArenaState {
  try { Invoke-RestMethod "$arenaUrl/api/state" -TimeoutSec 2 } catch { $null }
}
function Stop-ArenaConsole {
  if ($null -eq (Get-ArenaState)) { return }
  # The service refuses shutdown during an active experiment. No PID killing.
  Invoke-RestMethod "$arenaUrl/api/shutdown" -Method Post -Headers @{ Origin = $arenaUrl } -ContentType 'application/json' -Body '{}' | Out-Null
  for ($attempt = 0; $attempt -lt 50; $attempt++) {
    if ($null -eq (Get-ArenaState)) { return }
    Start-Sleep -Milliseconds 100
  }
  throw 'Arena console has not finished shutting down.'
}
function Start-ArenaConsole {
  if ($null -ne (Get-ArenaState)) { return }
  New-Item -ItemType Directory -Force -Path $arenaLogs | Out-Null
  $arenaScript = Join-Path $PSScriptRoot 'blind-discard-arena-console.mjs'
  $previousPort = $env:ARENA_CONSOLE_PORT
  try {
    $env:ARENA_CONSOLE_PORT = [string]$Port
    $arenaProcess = Start-Process -FilePath $NodePath -ArgumentList ('"' + $arenaScript + '"') -WorkingDirectory $arenaRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $arenaLogs 'console.stdout.log') -RedirectStandardError (Join-Path $arenaLogs 'console.stderr.log') -PassThru
    @{ pid = $arenaProcess.Id; url = $arenaUrl; script = $arenaScript } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $arenaLogs 'console-service.json') -Encoding utf8
  } finally { $env:ARENA_CONSOLE_PORT = $previousPort }
  for ($attempt = 0; $attempt -lt 50; $attempt++) {
    if ($null -ne (Get-ArenaState)) { return }
    if ($arenaProcess.HasExited) { throw 'Arena console exited; see console.stderr.log.' }
    Start-Sleep -Milliseconds 100
  }
  throw 'Arena console did not become ready; see console.stderr.log.'
}
switch ($Action) {
  'start' { Start-ArenaConsole }
  'stop' { Stop-ArenaConsole }
  'restart' { Stop-ArenaConsole; Start-ArenaConsole }
}
$arenaState = Get-ArenaState
@{ url = $arenaUrl; running = $null -ne $arenaState; experiment = $arenaState.job.status } | ConvertTo-Json
