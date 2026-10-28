$ErrorActionPreference='Stop'
$claims=Get-Content -Raw (Join-Path $PSScriptRoot 'historical-claims.json') | ConvertFrom-Json
$active=& multica issue runs 01a1746d-cf4a-7ecc-9fae-3d4c2b55c39f --siblings --output json
if($LASTEXITCODE -ne 0){throw 'Cannot establish idle owner state'}
if(@(($active|ConvertFrom-Json)|Where-Object {$_.issue_identifier -ne 'COAC-244'}).Count){throw 'Another textbook owner still active'}
$base='E:\AgentData\Coach\knowledge\processing\parallel\claims'
$receipt=Join-Path $PSScriptRoot 'recycle-claims-receipts.jsonl'
if(Test-Path -LiteralPath $receipt){throw 'Do not repeat completed cleanup'}
foreach($c in $claims){
  $p=[IO.Path]::GetFullPath($c.path)
  if([IO.Path]::GetDirectoryName($p) -ne $base){throw 'Claim outside exact scope'}
  if((Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant() -ne $c.sha256){throw 'Claim changed'}
  if($c.record.schema -ne 'coach-textbook-chapter-claim/1' -or $null -ne $c.record.slot -or $c.record.owner -notin @('COAC-248 Mika','COAC-269 Ticket executor')){throw 'Unknown claim ownership'}
  if((Get-Item -LiteralPath $p).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse point refused'}
  $bytes=(Get-Item -LiteralPath $p).Length
  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p,[Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,[Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin,[Microsoft.VisualBasic.FileIO.UICancelOption]::ThrowException)
  $r=[ordered]@{originalPath=$p;ownerIssue=$c.record.owner;logicalBytes=$bytes;files=1;reason='Obsolete textbook claim: explicit project closeout, no owner run or slot, exact original record preserved in historical-claims.json';at=[DateTime]::UtcNow.ToString('o');method='DeleteFile/SendToRecycleBin';status='recycled';permanentDeleteFallback=$false}
  [IO.File]::AppendAllText($receipt,($r|ConvertTo-Json -Compress)+[Environment]::NewLine,[Text.UTF8Encoding]::new($false))
}
Write-Output "Recycled obsolete exact owner claims: $($claims.Count)"
