
$ErrorActionPreference='Stop'
$root = 'F:\Develop\AI\sillytavern'
$rows = New-Object System.Collections.ArrayList
function Add-Row($file, $src) {
  try { $o = Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return }
  $key = [System.IO.Path]::GetFileNameWithoutExtension($file)
  $loc = $o.'事件地点'
  $t = $o.'触发条件'
  $time = if ($t -is [psobject] -and $t.'年') { "$($t.'年')/$($t.'月')/$($t.'日') $($t.'时'):$($t.'分')" } else { '' }
  $detail = [string]$o.'事件详情'
  if (-not $detail) { $detail = [string]$o.'事件概要' }
  $node = [pscustomobject]@{
    key = $key; src = $src; type = [string]$o.'事件类型'; loc = [string]$loc; time = $time;
    cast = (@($o.'参与人物') -join '、'); summary = [string]$o.'事件概要';
    detailHead = if ($detail.Length -gt 160) { $detail.Substring(0,160) } else { $detail };
    detailLen = $detail.Length; next = (@($o.'后续事件'.PSObject.Properties.Name) -join '、')
  }
  [void]$rows.Add($node)
}
$wb = Join-Path $root '世界书\金庸群侠传1\世界书'
Get-ChildItem -LiteralPath $wb -Filter *.yaml | ForEach-Object { Add-Row $_.FullName '世界书yaml' }
$pre = Join-Path $root '信息\武侠卡的预加入内容\预加入事件'
Get-ChildItem -LiteralPath $pre -Recurse -Filter *.json | ForEach-Object { Add-Row $_.FullName '预加入事件json' }
$out = Join-Path $root 'plans\金庸原文历史事件提取\现有条目索引.json'
$rows | ConvertTo-Json -Depth 4 -Compress | Set-Content -LiteralPath $out -Encoding UTF8
"rows=$($rows.Count)"
$rows | Group-Object { ($_.key -replace '^([^\d一二三四五六七八九十]*第?[一二三四五六七八九十百]+回).*','$1') } | Where-Object { $_.Count -gt 5 } | ForEach-Object { "$($_.Name)|$($_.Count)" }
