
param([Parameter(Mandatory=$true)][string[]]$Keyword, [switch]$Full)
$ErrorActionPreference='Stop'
$root = 'F:\Develop\AI\sillytavern\plans\金庸原文历史事件提取'
$rows = Get-Content -LiteralPath (Join-Path $root '现有条目索引.json') -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($kw in $Keyword) {
  Write-Output ("=== 关键词: {0} ===" -f $kw)
  $hit = $rows | Where-Object {
    $_.key -like "*$kw*" -or $_.cast -like "*$kw*" -or $_.summary -like "*$kw*" -or $_.detailHead -like "*$kw*"
  }
  Write-Output ("命中 {0} 条" -f $hit.Count)
  foreach ($h in $hit) {
    Write-Output ("  [{0}] {1} | {2} | {3} | {4}" -f $h.src, $h.key, $h.loc, $h.time, $h.cast)
    Write-Output ("      概要: {0}" -f $h.summary)
    if ($Full) {
      $p = if ($h.src -eq '世界书yaml') { Join-Path 'F:\Develop\AI\sillytavern\世界书\金庸群侠传1\世界书' ($h.key + '.yaml') }
           else { Get-ChildItem -LiteralPath 'F:\Develop\AI\sillytavern\信息\武侠卡的预加入内容\预加入事件' -Recurse -Filter ($h.key + '.json') | Select-Object -First 1 -ExpandProperty FullName }
      if ($p -and (Test-Path -LiteralPath $p)) {
        $o = Get-Content -LiteralPath $p -Raw -Encoding UTF8 | ConvertFrom-Json
        $d = [string]$o.'事件详情'; if (-not $d) { $d = [string]$o.'事件概要' }
        Write-Output ("      正文: {0}" -f $d)
      }
    }
  }
}
