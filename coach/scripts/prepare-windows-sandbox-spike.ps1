param(
  [string]$OutputRoot = (Join-Path $env:LOCALAPPDATA ('RiichiCoach\sandbox-spike\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))),
  [string]$AssetRoot = (Join-Path $env:LOCALAPPDATA 'RiichiCoach\local-mortal-spike')
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$head = (& git -C $repo rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot read repository HEAD' }
$sourceHasTrackedChanges = [bool](& git -C $repo status --porcelain --untracked-files=no)
if ($sourceHasTrackedChanges) { Write-Warning 'Source contains uncommitted work; only committed HEAD enters the sandbox snapshot' }
if (Test-Path -LiteralPath $OutputRoot) { throw 'Use a new output directory; historical runs are never overwritten' }
$nodeRoot = Split-Path (Get-Command node.exe).Source
$gitRoot = Split-Path (Split-Path (Get-Command git.exe).Source)
$cfg = Get-Content -LiteralPath (Join-Path $AssetRoot 'python\pyvenv.cfg')
$pythonBase = (($cfg | Where-Object { $_ -match '^home\s*=' }) -split '=', 2)[1].Trim()
foreach ($path in @($AssetRoot, $nodeRoot, $gitRoot, $pythonBase)) {
  if (!(Test-Path -LiteralPath $path)) { throw "Missing local prerequisite: $path" }
}
New-Item -ItemType Directory -Path $OutputRoot | Out-Null
$snapshot = Join-Path $OutputRoot 'repo'
& git -c core.autocrlf=true clone --no-hardlinks --no-checkout -- $repo $snapshot
if ($LASTEXITCODE -ne 0) { throw 'Local snapshot clone failed' }
& git -C $snapshot checkout --detach $head
if ($LASTEXITCODE -ne 0) { throw 'Snapshot checkout failed' }
function CopyTree([string]$source, [string]$destination) {
  & robocopy $source $destination /E /XJ /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "Offline file copy failed: $source" }
}
CopyTree (Join-Path $repo 'coach\node_modules') (Join-Path $snapshot 'coach\node_modules')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'run-windows-sandbox-spike.ps1') -Destination (Join-Path $OutputRoot 'run.ps1')
$evidence = Join-Path $OutputRoot 'evidence'
New-Item -ItemType Directory -Path $evidence | Out-Null
function EscapeXml([string]$value) { [System.Security.SecurityElement]::Escape($value) }
$mappings = @(
  @($snapshot, 'C:\spike\repo-source', 'true'),
  @($AssetRoot, 'C:\spike\asset-source', 'true'),
  @($pythonBase, 'C:\spike\python-base', 'true'),
  @($nodeRoot, 'C:\spike\node', 'true'),
  @($gitRoot, 'C:\spike\git', 'true'),
  @($OutputRoot, 'C:\spike\setup', 'true'),
  @($evidence, 'C:\spike\evidence', 'false')
)
$mappedXml = ($mappings | ForEach-Object {
  '<MappedFolder><HostFolder>' + (EscapeXml $_[0]) + '</HostFolder><SandboxFolder>' + $_[1] + '</SandboxFolder><ReadOnly>' + $_[2] + '</ReadOnly></MappedFolder>'
}) -join "`n"
$wsb = @"
<Configuration>
  <Networking>Disable</Networking>
  <ClipboardRedirection>Disable</ClipboardRedirection>
  <AudioInput>Disable</AudioInput>
  <VideoInput>Disable</VideoInput>
  <PrinterRedirection>Disable</PrinterRedirection>
  <vGPU>Disable</vGPU>
  <MemoryInMB>16384</MemoryInMB>
  <MappedFolders>$mappedXml</MappedFolders>
  <LogonCommand><Command>powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\spike\setup\run.ps1</Command></LogonCommand>
</Configuration>
"@
$configPath = Join-Path $OutputRoot 'local-mortal-offline.wsb'
$wsb | Set-Content -LiteralPath $configPath -Encoding UTF8
@{
  commit = $head; preparedAt = (Get-Date).ToUniversalTime().ToString('o')
  sourceHasTrackedChanges = $sourceHasTrackedChanges; uncommittedWorkIncluded = $false
  networkPolicy = 'Windows Sandbox Networking=Disable'
  configurationSha256 = (Get-FileHash -LiteralPath $configPath -Algorithm SHA256).Hash.ToLower()
  configuration = $configPath; evidence = $evidence
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'host-preparation.json')
Write-Output "Prepared: $configPath"
Write-Output 'After enabling Windows Sandbox and completing any required restart, open this .wsb file.'
exit 0
