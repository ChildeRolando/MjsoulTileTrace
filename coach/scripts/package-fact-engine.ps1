$ErrorActionPreference = "Stop"

$coachRoot = Split-Path $PSScriptRoot -Parent
$repoRoot = Split-Path $coachRoot -Parent
$builtBinary = Join-Path $repoRoot ".tools\mahjong-facts\windows-x64\mahjong-facts.exe"
$resourceDirectory = Join-Path $coachRoot "resources\mahjong-facts\windows-x64"
$resourceBinary = Join-Path $resourceDirectory "mahjong-facts.exe"
$manifestPath = Join-Path $resourceDirectory "manifest.json"
$trustedManifestPath = Join-Path $coachRoot "packages\reasoning\src\fact-engine\packaged-manifest.ts"
$contractPath = Join-Path $coachRoot "packages\contracts\src\fact-engine.ts"
$goModPath = Join-Path $coachRoot "tools\mahjong-facts\go.mod"

function Get-Sha256([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
      return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace("-", "").ToLowerInvariant()
    }
    finally {
      $sha256.Dispose()
    }
  }
  finally {
    $stream.Dispose()
  }
}

& (Join-Path $PSScriptRoot "build-fact-engine.ps1")

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$digest = Get-Sha256 $builtBinary
$size = (Get-Item -LiteralPath $builtBinary).Length
if ($digest -ne $manifest.sha256 -or $size -ne $manifest.size) {
  throw "Built fact engine does not match the trusted release manifest"
}

$identityRequest = '{"kind":"identity","requestId":"package-check","protocolVersion":"mahjong-facts/v1"}'
$identityResponse = $identityRequest | & $builtBinary | ConvertFrom-Json
if ($identityResponse.identity.protocolVersion -ne $manifest.protocolVersion -or
    $identityResponse.identity.adapterVersion -ne $manifest.adapterVersion -or
    $identityResponse.identity.upstreamCommit -ne $manifest.upstreamCommit) {
  throw "Built fact engine identity does not match the release manifest"
}

$buildMetadata = (& go version -m $builtBinary) -join "`n"
if (-not $buildMetadata.Contains($manifest.upstreamModuleVersion)) {
  throw "Built fact engine module metadata does not contain the pinned helper version"
}
$actualGoVersion = (& go version).Split(' ')[2]
if ($actualGoVersion -ne $manifest.goVersion) {
  throw "Go toolchain does not match the release manifest"
}

$trustedManifest = Get-Content -LiteralPath $trustedManifestPath -Raw
$contract = Get-Content -LiteralPath $contractPath -Raw
$goMod = Get-Content -LiteralPath $goModPath -Raw
foreach ($expected in @(
  $manifest.sha256,
  $manifest.protocolVersion,
  $manifest.adapterVersion,
  $manifest.upstreamCommit,
  $manifest.upstreamModuleVersion
)) {
  if (-not $trustedManifest.Contains([string]$expected)) {
    throw "Trusted runtime manifest is inconsistent with manifest.json"
  }
}
foreach ($expected in @(
  $manifest.protocolVersion,
  $manifest.adapterVersion,
  $manifest.upstreamCommit
)) {
  if (-not $contract.Contains([string]$expected)) {
    throw "Contract identity is inconsistent with the packaged fact engine"
  }
}
if (-not $goMod.Contains([string]$manifest.upstreamModuleVersion)) {
  throw "go.mod is inconsistent with the packaged fact engine"
}

New-Item -ItemType Directory -Force -Path $resourceDirectory | Out-Null
Copy-Item -LiteralPath $builtBinary -Destination $resourceBinary -Force
$packagedDigest = Get-Sha256 $resourceBinary
if ($packagedDigest -ne $manifest.sha256) {
  throw "Packaged fact engine failed its post-copy integrity check"
}
