$ErrorActionPreference='Stop'
$integration='E:/AgentData/Coach/knowledge/processing/integration'
$receipt=Get-Content -LiteralPath "$integration/accepted-preview-current.json" -Raw -Encoding utf8 | ConvertFrom-Json
if ($receipt.selectionVersion -ne 43 -or $receipt.corpusId -ne 'bd7a83525edb8cb69f27d8aa050dcb010047f79ae318748bdbe448d5b797836d') {throw 'Unexpected current preview; refusing to guess a version.'}
$serviceDirectory="$integration/coac250-v43-local-inspection-20261029"
New-Item -ItemType Directory -Path $serviceDirectory -Force | Out-Null
if (Get-NetTCPConnection -State Listen -LocalPort 8766 -ErrorAction SilentlyContinue) {throw 'Port8766 is occupied; inspect the existing listener before starting anything.'}
$worker=Start-Process -FilePath 'F:/Code/python/python.exe' -ArgumentList @('-u','-B','-m','http.server','8766','--bind','127.0.0.1','--directory',$receipt.output) -WorkingDirectory $serviceDirectory -WindowStyle Hidden -RedirectStandardOutput "$serviceDirectory/stdout.log" -RedirectStandardError "$serviceDirectory/stderr.log" -PassThru
$state=@{pid=$worker.Id;url='http://127.0.0.1:8766/knowledge.html';bind='127.0.0.1';port=8766;directory=$receipt.output;selectionVersion=43;corpusId=$receipt.corpusId;startedAt=[DateTime]::UtcNow.ToString('o');readOnlyServer='Python standard-library http.server: GET/HEAD, no author-content writes';stdout="$serviceDirectory/stdout.log";stderr="$serviceDirectory/stderr.log";survival='Best effort without supervisor';stop="Stop-Process -Id $($worker.Id) after checking its command line against this service record"}
$state | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath "$serviceDirectory/service.json" -Encoding utf8
$state | ConvertTo-Json -Depth 4
