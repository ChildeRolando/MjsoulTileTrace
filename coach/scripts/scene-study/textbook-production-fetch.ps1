param([Parameter(Mandatory=$true)][string]$Url,[Parameter(Mandatory=$true)][string]$OutPath)
$ErrorActionPreference='Stop'
$taskFetch=Invoke-WebRequest -Uri $Url -OutFile $OutPath -PassThru -TimeoutSec 40 -SkipHttpErrorCheck
[PSCustomObject]@{httpStatus=[int]$taskFetch.StatusCode;finalUrl=$taskFetch.BaseResponse.RequestMessage.RequestUri.AbsoluteUri;contentType=($taskFetch.Headers['Content-Type'] -join ';')} | ConvertTo-Json -Compress
