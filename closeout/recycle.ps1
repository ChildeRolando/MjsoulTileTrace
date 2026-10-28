param([switch]$Execute,[ValidateSet('cache','preview')][string]$Plan='cache')
$ErrorActionPreference='Stop'
$here=$PSScriptRoot
$base='C:\Users\Roland\multica_workspaces_desktop-api.multica.ai\coach-rolan-2123e9a3b805'
$integration='E:\AgentData\Coach\knowledge\processing\integration'
$release=Join-Path $integration 'coac250-formal-v43-20261029'
$formal=Get-Content -Raw (Join-Path $release 'final.json') | ConvertFrom-Json
if(-not $formal.activated -or $formal.after.version -ne 43){throw 'Formal v43 acceptance missing'}
if((Get-FileHash -LiteralPath 'E:\AgentData\Coach\knowledge\review\textbook-corpus.json' -Algorithm SHA256).Hash.ToLowerInvariant() -ne $formal.after.corpusSha256){throw 'Formal corpus changed'}
foreach($proof in @('formal-mcp.json','arena-validation.json','browser.json','rebuild.json')){
  if(-not (Test-Path -LiteralPath (Join-Path $release $proof))){throw "Missing consumer proof: $proof"}
}
foreach($binding in @($formal.formalMcp,$formal.formalArena,$formal.formalBrowser,$formal.rebuild,$formal.releaseInputs)){
  if((Get-FileHash -LiteralPath $binding.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $binding.sha256){throw 'Formal acceptance proof changed'}
}
$runText=& multica issue runs 01a17471-25e6-7731-a529-3df99acf3d42 --active --output json
if($LASTEXITCODE -ne 0){throw 'Cannot establish release run terminal state'}
$active=@($runText | ConvertFrom-Json)
if($active.Count){throw 'COAC-250 still active; no cleanup permitted'}
if(Test-Path -LiteralPath (Join-Path $integration 'accepted-consumer.lock')){throw 'Release lock remains; no cleanup permitted'}
$plans=@(Get-Content -Raw (Join-Path $here "$Plan-plan.json") | ConvertFrom-Json)
$processes=Get-CimInstance Win32_Process
$receipt=Join-Path $here "recycle-$Plan-receipts.jsonl"
if($Execute -and (Test-Path -LiteralPath $receipt)){throw 'Receipt already exists; do not automatically repeat'}
$count=0
foreach($entry in @($plans | ForEach-Object {$_.entries})){
  $target=[IO.Path]::GetFullPath($entry.path)
  $allowed=($target -match ('^'+[regex]::Escape($base)+'\\coac-(244|246|247|248|249|250|269|270)-[a-f0-9]{12}\\codex-home\\cache$')) -or
    ($target -match ('^'+[regex]::Escape($integration)+'\\accepted-content-preview-[0-9TZ-]+\\assets$'))
  if(-not $allowed){throw "Out of exact cleanup scope: $target"}
  if($target -match 'coac-244-3e7a6961844a|coac-250-667fda1dfd34|accepted-content-preview-2026-10-28T16-50-25-203Z'){throw 'Active directory protected'}
  foreach($p in $plans.keptPreviewRoots){if($p -and $target.StartsWith(([IO.Path]::GetFullPath($p)+'\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Rollback preview protected'}}
  if(-not (Test-Path -LiteralPath $target -PathType Container)){continue}
  $resolved=(Resolve-Path -LiteralPath $target).Path
  if($resolved -ne $target){throw 'Unexpected resolved target'}
  for($p=Get-Item -LiteralPath $target;$p;$p=$p.Parent){if($p.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse-point cleanup refused'}}
  if(@($processes | Where-Object {$_.CommandLine -and $_.CommandLine.IndexOf($target,[StringComparison]::OrdinalIgnoreCase) -ge 0}).Count){throw "Process still refers to $target"}
  $row=[ordered]@{originalPath=$target;ownerIssue=$entry.ownerIssue;logicalBytes=$entry.bytes;files=$entry.files;reason=$entry.reason;at=[DateTime]::UtcNow.ToString('o');method='Microsoft.VisualBasic.FileIO.FileSystem.DeleteDirectory/SendToRecycleBin';permanentDeleteFallback=$false}
  if($Execute){
    try{
      [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($target,[Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,[Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin,[Microsoft.VisualBasic.FileIO.UICancelOption]::ThrowException)
      if(Test-Path -LiteralPath $target){throw 'Original path still exists'}
      $row.status='recycled'
    }catch{$row.status='deferred-error';$row.error=$_.Exception.Message}
    [IO.File]::AppendAllText($receipt,($row|ConvertTo-Json -Compress)+[Environment]::NewLine,[Text.UTF8Encoding]::new($false))
  }
  $count++
  if($count % 20 -eq 0){Write-Output "Checked $count exact directories"}
}
Write-Output "Exact paths validated: $count; execute=$Execute"
