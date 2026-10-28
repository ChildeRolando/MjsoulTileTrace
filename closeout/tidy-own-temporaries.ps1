$ErrorActionPreference='Stop'
$cwd=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$receipt=Join-Path $PSScriptRoot 'recycle-temporary-receipts.jsonl'
if(Test-Path -LiteralPath $receipt){throw 'Do not automatically repeat temporary cleanup'}
$wake=Get-Content -Raw (Join-Path $PSScriptRoot 'wakeups-before.json')|ConvertFrom-Json
@{rules=$wake.Count;enabled=@($wake|Where-Object enabled).Count;historicalRecordsRetainedOnPlatform=$true} | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $PSScriptRoot 'wakeup-summary.json')
$files=@()
foreach($n in @('250-active.json','250-scan.json','closeout-children.json')){ $p=Join-Path $cwd $n;if(Test-Path -LiteralPath $p){$files+=Get-Item -LiteralPath $p} }
foreach($pattern in @('threads-*.json','latest-*.json','formal-thread*.json','250-roots-latest.json','250-run-messages.json','wakeups-before.json')){$files+=Get-ChildItem -LiteralPath $PSScriptRoot -File -Filter $pattern}
foreach($f in $files){
  $p=[IO.Path]::GetFullPath($f.FullName)
  if(-not $p.StartsWith($cwd+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Temporary file outside this worktree'}
  if($f.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse point refused'}
  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p,[Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,[Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin,[Microsoft.VisualBasic.FileIO.UICancelOption]::ThrowException)
  $r=@{originalPath=$p;ownerIssue='COAC-244 current cleanup run';logicalBytes=$f.Length;files=1;status='recycled';reason='Read-only CLI scratch export created in this cleanup run; original platform history retained';method='DeleteFile/SendToRecycleBin';at=[DateTime]::UtcNow.ToString('o');permanentDeleteFallback=$false}
  [IO.File]::AppendAllText($receipt,($r|ConvertTo-Json -Compress)+[Environment]::NewLine,[Text.UTF8Encoding]::new($false))
}
Write-Output "Recycled this run's scratch exports: $($files.Count)"
