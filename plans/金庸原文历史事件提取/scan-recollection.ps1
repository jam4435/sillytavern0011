
$ErrorActionPreference='Stop'
$root = 'F:\Develop\AI\sillytavern\plans\金庸原文历史事件提取'
$novDir = Join-Path $root '原文UTF8'
$index = Get-Content -LiteralPath (Join-Path $root '章节索引.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$novels = @('天龙八部','射雕英雄传','神雕侠侣','倚天屠龙记','笑傲江湖','鹿鼎记')
$markers = @(
  '三十年前','二十年前','十年前','数年前','多年前','当年','那一年','那时候','那时我','那时他','那时你',
  '小时候','幼时','自幼','少年时','年轻时','早年','从前','旧事','往事','来历','身世','亲生','抱养','收养',
  '记得那','我还记得','曾听','听说','据说','相传','传说','原来','竟是','真相','秘密','隐秘','不可告人',
  '师父说','师父曾','先师','祖师','本门','当年我','老夫当年','在下当年'
)
$rows = New-Object System.Collections.ArrayList
foreach ($n in $novels) {
  $p = Join-Path $novDir ($n + '.txt')
  $lines = [System.IO.File]::ReadAllLines($p, [System.Text.Encoding]::UTF8)
  $chaps = $index | Where-Object { $_.book -eq $n }
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $l = $lines[$i]
    if ($l.Length -lt 12) { continue }
    $hits = @()
    foreach ($m in $markers) { if ($l.Contains($m)) { $hits += $m } }
    if ($hits.Count -eq 0) { continue }
    $ch = $chaps | Where-Object { $i + 1 -ge $_.startLine -and $i + 1 -le $_.endLine } | Select-Object -First 1
    $txt = $l.Trim()
    if ($txt.Length -gt 300) { $txt = $txt.Substring(0,300) }
    [void]$rows.Add([pscustomobject]@{
      book = $n; line = $i + 1; chapter = if ($ch) { $ch.chapter } else { '' };
      seq = if ($ch) { $ch.seq } else { 0 }; title = if ($ch) { $ch.title } else { '' };
      markers = ($hits -join ','); text = $txt
    })
  }
  Write-Output ("{0}: 命中 {1} 行" -f $n, ($rows | Where-Object { $_.book -eq $n }).Count)
}
$rows | ConvertTo-Json -Depth 4 -Compress | Set-Content -LiteralPath (Join-Path $root '旧事线索扫描.json') -Encoding UTF8
Write-Output ("总计 {0}" -f $rows.Count)
