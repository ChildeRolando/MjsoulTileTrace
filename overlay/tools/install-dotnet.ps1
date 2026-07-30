$ErrorActionPreference = 'Stop'
$installDir = Join-Path $PSScriptRoot '..\..\.tools\dotnet'
$installDir = [System.IO.Path]::GetFullPath($installDir)
$scriptPath = Join-Path ([System.IO.Path]::GetTempPath()) 'dotnet-install-overlay.ps1'
Invoke-WebRequest 'https://dot.net/v1/dotnet-install.ps1' -OutFile $scriptPath
& $scriptPath -Version '8.0.100' -InstallDir $installDir
& (Join-Path $installDir 'dotnet.exe') --info
