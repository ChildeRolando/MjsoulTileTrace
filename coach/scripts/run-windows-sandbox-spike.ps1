$ErrorActionPreference = 'Stop'
$evidence = 'C:\spike\evidence'
$exitCode = 1
Start-Transcript -LiteralPath (Join-Path $evidence 'sandbox-transcript.log')
function CopyTree([string]$source, [string]$destination) {
  & robocopy $source $destination /E /XJ /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "Offline file copy failed: $source" }
}
function AssertNoNetwork([string]$phase) {
  $adapters = @(Get-NetAdapter -ErrorAction Stop)
  $routes = @(Get-NetRoute -ErrorAction Stop | Where-Object { $_.DestinationPrefix -in @('0.0.0.0/0','::/0') })
  @{ adapters = @($adapters | Select-Object Name,Status,InterfaceDescription); defaultRoutes = @($routes | Select-Object DestinationPrefix,NextHop) } |
    ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $evidence "network-$phase.json")
  if (@($adapters | Where-Object Status -eq 'Up').Count -gt 0 -or $routes.Count -gt 0) {
    throw 'Sandbox network isolation not established; refusing to run spike'
  }
}
try {
  AssertNoNetwork 'before'
  CopyTree 'C:\spike\repo-source' 'C:\spike\repo'
  $env:PATH = 'C:\spike\node;C:\spike\git\cmd;' + $env:PATH
  foreach ($package in @('contracts','mahjong-soul-source','tenhou-source','mortal-source','mortal-runtime','reasoning','desktop')) {
    New-Item -ItemType Junction -Path "C:\spike\repo\coach\node_modules\@riichi-coach\$package" -Target "C:\spike\repo\coach\packages\$package" | Out-Null
  }
  $runtime = 'C:\spike\runtime'
  New-Item -ItemType Directory -Path "$runtime\Mortal\target\release" -Force | Out-Null
  CopyTree 'C:\spike\asset-source\python' "$runtime\python"
  CopyTree 'C:\spike\asset-source\Mortal\mortal' "$runtime\Mortal\mortal"
  Copy-Item -LiteralPath 'C:\spike\asset-source\Mortal\target\release\libriichi.pyd' -Destination "$runtime\Mortal\target\release\libriichi.pyd"
  Copy-Item -LiteralPath 'C:\spike\asset-source\mortal_582500.pth' -Destination "$runtime\mortal_582500.pth"
  Copy-Item -LiteralPath 'C:\spike\asset-source\preparation-receipt.json' -Destination "$runtime\preparation-receipt.json"
  (Get-Content -LiteralPath "$runtime\python\pyvenv.cfg") -replace '^home\s*=.*$', 'home = C:\spike\python-base' |
    Set-Content -LiteralPath "$runtime\python\pyvenv.cfg"
  $env:RIICHI_LOCAL_MORTAL_ROOT = $runtime
  $env:PYTHONPATH = ''
  & "$runtime\python\Scripts\python.exe" -c "import torch; assert torch.__version__ == '2.7.1+cpu'"
  if ($LASTEXITCODE -ne 0) { throw 'Relocated offline Python/torch smoke failed' }
  Set-Location 'C:\spike\repo\coach'
  $head = (& git rev-parse HEAD).Trim()
  $expected = (Get-Content -LiteralPath (Join-Path $evidence 'host-preparation.json') -Raw | ConvertFrom-Json).commit
  if ($head -ne $expected) { throw 'Snapshot HEAD mismatch' }
  $env:GITHUB_SHA = $head
  & npm.cmd run test:local-mortal-production-spike *> (Join-Path $evidence 'spike.log')
  $exitCode = $LASTEXITCODE
  AssertNoNetwork 'after'
  if ($exitCode -ne 0) { throw "Production spike exited $exitCode" }
  $receipt = Get-Content -LiteralPath "$runtime\production-spike-receipt.json" -Raw | ConvertFrom-Json
  if ($receipt.commit -ne $head -or $receipt.exitCode -ne 0) { throw 'Production receipt identity mismatch' }
  Copy-Item -LiteralPath "$runtime\production-spike-receipt.json" -Destination (Join-Path $evidence 'production-spike-receipt.json')
  @{ commit = $head; exitCode = 0; environment = 'Windows Sandbox'; networking = 'Disable'; networkAssertions = 'before and after'; finishedAt = (Get-Date).ToUniversalTime().ToString('o') } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'result.json')
} catch {
  $exitCode = 1
  @{ exitCode = 1; environment = 'Windows Sandbox'; error = $_.Exception.Message; finishedAt = (Get-Date).ToUniversalTime().ToString('o') } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'result.json')
} finally {
  Stop-Transcript
}
exit $exitCode
