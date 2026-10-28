$ErrorActionPreference='Stop'
$wanted=@{}
foreach($file in Get-ChildItem -LiteralPath $PSScriptRoot -Filter 'recycle-*-receipts.jsonl'){
  foreach($line in [IO.File]::ReadAllLines($file.FullName)){
    $r=$line|ConvertFrom-Json
    if($r.status -eq 'recycled'){$wanted[$r.originalPath.ToLowerInvariant()]=$r}
  }
}
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$found=@{}
foreach($drive in @('C','E')){
  $bin=$drive+':\$Recycle.Bin\'+$sid
  if(-not (Test-Path -LiteralPath $bin)){continue}
  foreach($meta in Get-ChildItem -LiteralPath $bin -Force -Filter '$I*' -File){
    try{
      $b=[IO.File]::ReadAllBytes($meta.FullName)
      $version=[BitConverter]::ToInt64($b,0)
      if($version -eq 2){$path=[Text.Encoding]::Unicode.GetString($b,28,$b.Length-28).TrimEnd([char]0)}
      elseif($version -eq 1){$path=[Text.Encoding]::Unicode.GetString($b,24,$b.Length-24).TrimEnd([char]0)}
      else{continue}
      $key=$path.ToLowerInvariant()
      if($wanted.ContainsKey($key)){
        $payload=Join-Path $bin ('$R'+$meta.Name.Substring(2))
        if(-not (Test-Path -LiteralPath $payload)){throw 'Recycle payload missing'}
        $found[$key]=[ordered]@{originalPath=$path;metadata=$meta.FullName;payload=$payload;logicalBytes=$wanted[$key].logicalBytes;recoverable=$true}
      }
    }catch{if($key -and $wanted.ContainsKey($key)){throw}}
  }
}
$out=[ordered]@{at=[DateTime]::UtcNow.ToString('o');expected=$wanted.Count;verified=$found.Count;entries=@($found.Values);diskSpaceReleasedClaimed=$false}
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'recycle-recovery-verification.json'),($out|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
if($found.Count -ne $wanted.Count){throw "Missing recoverable payload: expected $($wanted.Count), found $($found.Count)"}
Write-Output "Recycle Bin original-path metadata and payloads verified: $($found.Count)"
