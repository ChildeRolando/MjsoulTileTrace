$ErrorActionPreference = "Stop"

$coachRoot = Split-Path $PSScriptRoot -Parent
$repoRoot = Split-Path $coachRoot -Parent
$outputDirectory = Join-Path $repoRoot ".tools\mahjong-facts\windows-x64"
$output = Join-Path $outputDirectory "mahjong-facts.exe"

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

Push-Location (Join-Path $coachRoot "tools\mahjong-facts")
try {
  go build -trimpath -ldflags "-s -w" -o $output .
}
finally {
  Pop-Location
}
