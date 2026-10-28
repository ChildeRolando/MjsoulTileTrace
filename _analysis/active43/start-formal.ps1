$ErrorActionPreference='Stop'
$directory='E:/AgentData/Coach/knowledge/review'
$recordDirectory='E:/AgentData/Coach/knowledge/processing/integration/coac250-formal-v43-20261029'
$corpus=Get-Content -LiteralPath "$directory/textbook-corpus.json" -Raw -Encoding utf8 | ConvertFrom-Json
if ($corpus.corpusId -ne 'bd7a83525edb8cb69f27d8aa050dcb010047f79ae318748bdbe448d5b797836d') {throw 'Formal corpus is not accepted v43'}
if (Get-NetTCPConnection -State Listen -LocalPort 8767 -ErrorAction SilentlyContinue) {throw 'Formal reader port occupied; do not replace its process'}
$worker=Start-Process -FilePath 'F:/Code/python/python.exe' -ArgumentList @('-u','-B','-m','http.server','8767','--bind','127.0.0.1','--directory',$directory) -WorkingDirectory $recordDirectory -WindowStyle Hidden -RedirectStandardOutput "$recordDirectory/reader.stdout.log" -RedirectStandardError "$recordDirectory/reader.stderr.log" -PassThru
@{pid=$worker.Id;url='http://127.0.0.1:8767/knowledge.html';directory=$directory;bind='127.0.0.1';port=8767;version=43;corpusId=$corpus.corpusId;startedAt=[DateTime]::UtcNow.ToString('o');stdout="$recordDirectory/reader.stdout.log";stderr="$recordDirectory/reader.stderr.log";survival='Best effort without supervisor';stop="Confirm PID command line then Stop-Process -Id $($worker.Id)"} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath "$recordDirectory/service.json" -Encoding utf8
Get-Content -LiteralPath "$recordDirectory/service.json" -Raw -Encoding utf8
