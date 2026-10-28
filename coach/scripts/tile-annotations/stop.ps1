$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $PSScriptRoot 'server.pid'
$servicePid = [int](Get-Content -LiteralPath $pidFile)
$metadata = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'server.meta.json') -Raw | ConvertFrom-Json
$serviceProcess = Get-Process -Id $servicePid -ErrorAction SilentlyContinue
if (!$serviceProcess) { Write-Output 'Service is already stopped.'; exit 0 }
$expected = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'server.mjs'))
if ($metadata.pid -ne $servicePid -or [IO.Path]::GetFullPath($metadata.script) -ne $expected -or $serviceProcess.ProcessName -ne 'node' -or $serviceProcess.Path -ne $metadata.executable -or $serviceProcess.StartTime.ToFileTimeUtc().ToString() -ne $metadata.startFileTimeUtc) { throw 'PID no longer belongs to this annotation service; refusing to stop.' }
$lock = Get-Content -LiteralPath (Join-Path $metadata.data 'server.lock') -Raw | ConvertFrom-Json
if ($lock.pid -ne $servicePid) { throw 'Data directory is owned by another process; refusing to stop.' }
Stop-Process -Id $servicePid
Write-Output "Stopped annotation service PID=$servicePid"
