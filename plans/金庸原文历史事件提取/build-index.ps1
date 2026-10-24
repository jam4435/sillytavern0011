
$ErrorActionPreference = 'Stop'
$out = Join-Path (Split-Path -Parent $PSScriptRoot) ''  # unused
$root = $PSScriptRoot
$novDir = Join-Path $root '原文UTF8'
$novels = @('天龙八部','射雕英雄传','神雕侠侣','倚天屠龙记','笑傲江湖','鹿鼎记')
$index = @()
foreach ($n in $novels) {
  $p = Join-Path $novDir ($n + '.txt')
  $lines = [System.IO.File]::ReadAllLines($p, [System.Text.Encoding]::UTF8)
  $heads = @()
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $l = $lines[$i]
    $t = $l.Trim([char]0x3000, ' ', [char]0x09)
    if ($t.Length -eq 0 -or $t.Length -gt 30) { continue }
    $m1 = [regex]::Match($t, '^(第[一二三四五六七八九十百零]{1,5}回)[ \u3000]+(\S.*)$')
    $m2 = [regex]::Match($t, '^([一二三四五六七八九十]{1,3})[ \u3000]+(\S.*)$')
    if ($m1.Success) { $heads += [pscustomobject]@{ line = $i; num = $m1.Groups[1].Value; title = $m1.Groups[2].Value.Trim() } }
    elseif ($m2.Success -and $t -notmatch '[，。！？；：“”‘’（）]') { $heads += [pscustomobject]@{ line = $i; num = $m2.Groups[1].Value; title = $m2.Groups[2].Value.Trim() } }
  }
  for ($k = 0; $k -lt $heads.Count; $k++) {
    $end = if ($k -lt $heads.Count - 1) { $heads[$k + 1].line - 1 } else { $lines.Count - 1 }
    $body = if ($end -ge $heads[$k].line) { ($lines[$heads[$k].line..$end] -join '') } else { '' }
    $index += [pscustomobject]@{
      book = $n; seq = $k + 1; chapter = $heads[$k].num; title = $heads[$k].title;
      startLine = $heads[$k].line + 1; endLine = $end + 1; chars = $body.Length
    }
  }
  Write-Output ("== {0} chapters={1} first={2} {3} last={4} {5}" -f $n, $heads.Count, $heads[0].num, $heads[0].title, $heads[-1].num, $heads[-1].title)
}
$index | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $root '章节索引.json') -Encoding UTF8
Write-Output ("总章节数={0}" -f $index.Count)
