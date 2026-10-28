param(
  [string]$Root = 'E:/AgentData/Coach/knowledge/processing',
  [string]$Data = 'E:/AgentData/Coach/knowledge/human-annotations',
  [string]$Node = 'E:/IDE/NodeJS/node.exe',
  [int]$Port = 8765
)
$ErrorActionPreference = 'Stop'
$serverScript = Join-Path $PSScriptRoot 'server.mjs'
$url = "http://127.0.0.1:$Port/"
try {
  $state = Invoke-RestMethod -Uri ($url + 'api/state') -TimeoutSec 3
  if ($state.queue.schema -eq 'coach-tile-annotation-queue/1' -and [IO.Path]::GetFullPath($state.dataDir) -eq [IO.Path]::GetFullPath($Data)) {
    Write-Output "Already running: $url"
    exit 0
  }
  throw "Port $Port belongs to another service."
} catch {
  if ($_.Exception.Message -eq "Port $Port belongs to another service.") { throw }
}
if (!(Test-Path -LiteralPath $Node)) { $Node = (Get-Command node -ErrorAction Stop).Source }
$proc = Start-Process -FilePath $Node -ArgumentList @('"' + $serverScript + '"', '--root', '"' + $Root + '"', '--queue', '"' + (Join-Path $Data 'queue.json') + '"', '--data', '"' + $Data + '"', '--port', $Port) -WorkingDirectory $PSScriptRoot -RedirectStandardOutput (Join-Path $PSScriptRoot 'server.log') -RedirectStandardError (Join-Path $PSScriptRoot 'server.err.log') -WindowStyle Hidden -PassThru
$proc.Id | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'server.pid')
@{ pid = $proc.Id; executable = $proc.Path; script = $serverScript; data = $Data; startFileTimeUtc = $proc.StartTime.ToFileTimeUtc().ToString() } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'server.meta.json') -Encoding UTF8
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  Start-Sleep -Milliseconds 150
  $proc.Refresh()
  if ($proc.HasExited) { throw ('Service failed. Read ' + (Join-Path $PSScriptRoot 'server.err.log')) }
  try {
    $state = Invoke-RestMethod -Uri ($url + 'api/state') -TimeoutSec 2
    if ($state.queue.schema -eq 'coach-tile-annotation-queue/1') { Write-Output "Ready: $url PID=$($proc.Id)"; exit 0 }
  } catch { }
}
throw 'Service did not become ready. Read server.log and server.err.log.'
