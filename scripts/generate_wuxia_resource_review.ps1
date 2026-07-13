[CmdletBinding()]
param(
  [string]$GameIconsRoot = 'E:\jinyong\Graphics\Icons',
  [string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

if (-not $OutputPath) {
  $OutputPath = Join-Path $projectRoot 'src\武侠\docs\12-游戏资源图标审核台.html'
}

$templatePath = Join-Path $projectRoot 'scripts\templates\wuxia_resource_review.template.html'
$martialDatabasePath = Join-Path $projectRoot 'src\武侠\data\_合并后功法.json'
$inventoryCatalogPath = Join-Path $projectRoot 'src\武侠\utils\inventoryIconCatalog.ts'

foreach ($requiredPath in @($templatePath, $martialDatabasePath, $inventoryCatalogPath, $GameIconsRoot)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "Required path does not exist: $requiredPath"
  }
}

if (-not ('WuxiaChineseMap' -as [type])) {
  Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class WuxiaChineseMap {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
  private static extern int LCMapStringEx(
    string localeName,
    uint flags,
    string source,
    int sourceLength,
    StringBuilder destination,
    int destinationLength,
    IntPtr version,
    IntPtr reserved,
    IntPtr sortHandle
  );

  public static string Simplify(string value) {
    if (String.IsNullOrEmpty(value)) return value;
    var output = new StringBuilder(value.Length * 2 + 8);
    var length = LCMapStringEx(
      "zh-CN",
      0x02000000,
      value,
      value.Length,
      output,
      output.Capacity,
      IntPtr.Zero,
      IntPtr.Zero,
      IntPtr.Zero
    );
    return length > 0 ? output.ToString(0, length) : value;
  }
}
'@
}

function ConvertTo-NormalizedMartialName {
  param([string]$Value)

  $normalized = [WuxiaChineseMap]::Simplify($Value)
  $normalized = $normalized -replace '(?i)\s*[-_]?\s*(copy|复制|副本|複製)(\s*\(\d+\)|\s*\d+)?$', ''
  $normalized = $normalized -replace '^[\$]+', ''
  $normalized = $normalized -replace '[\s_·・《》<>（）()\[\]【】\$\-]', ''
  return $normalized.ToLowerInvariant()
}

function Get-ImageMimeType {
  param([string]$Path)

  switch ([IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    '.png' { return 'image/png' }
    '.gif' { return 'image/gif' }
    '.webp' { return 'image/webp' }
    '.bmp' { return 'image/bmp' }
    default { return 'image/jpeg' }
  }
}

$embeddedAssets = [ordered]@{}
$assetIdByPath = @{}

function Add-EmbeddedAsset {
  param(
    [string]$Path,
    [string]$DisplaySource
  )

  $resolvedPath = [IO.Path]::GetFullPath($Path)
  if ($assetIdByPath.ContainsKey($resolvedPath)) {
    return $assetIdByPath[$resolvedPath]
  }

  $assetId = 'asset-{0:D4}' -f $embeddedAssets.Count
  $bytes = [IO.File]::ReadAllBytes($resolvedPath)
  $mime = Get-ImageMimeType -Path $resolvedPath
  $embeddedAssets[$assetId] = [ordered]@{
    fileName = [IO.Path]::GetFileName($resolvedPath)
    source = $DisplaySource
    dataUrl = "data:$mime;base64,$([Convert]::ToBase64String($bytes))"
  }
  $assetIdByPath[$resolvedPath] = $assetId
  return $assetId
}

$martialDatabase = Get-Content -Raw -LiteralPath $martialDatabasePath | ConvertFrom-Json
$imageExtensions = @('.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp')
$namedGameFiles = @(
  Get-ChildItem -LiteralPath $GameIconsRoot -File |
    Where-Object {
      $imageExtensions -contains $_.Extension.ToLowerInvariant() -and $_.BaseName -match '[\u4e00-\u9fff]'
    } |
    ForEach-Object {
      [pscustomobject]@{
        file = $_
        normalized = ConvertTo-NormalizedMartialName -Value $_.BaseName
      }
    }
)

$exactFileIndex = @{}
foreach ($gameFile in $namedGameFiles) {
  if (-not $exactFileIndex.ContainsKey($gameFile.normalized)) {
    $exactFileIndex[$gameFile.normalized] = [Collections.Generic.List[object]]::new()
  }
  $exactFileIndex[$gameFile.normalized].Add($gameFile)
}

$martialGroups = [Collections.Generic.List[object]]::new()
$directCandidateCount = 0

foreach ($art in $martialDatabase.功法) {
  $artName = [string]$art.功法名称
  $artNormalized = ConvertTo-NormalizedMartialName -Value $artName
  $candidateByPath = @{}

  if ($exactFileIndex.ContainsKey($artNormalized)) {
    foreach ($match in $exactFileIndex[$artNormalized]) {
      $candidateByPath[$match.file.FullName] = [ordered]@{ matchType = '精确同名'; matchScore = 2; file = $match.file }
    }
  }

  foreach ($gameFile in $namedGameFiles) {
    if ($gameFile.normalized -eq $artNormalized) { continue }
    $shorterLength = [Math]::Min($gameFile.normalized.Length, $artNormalized.Length)
    $lengthDifference = [Math]::Abs($gameFile.normalized.Length - $artNormalized.Length)
    $isContained = $gameFile.normalized.Contains($artNormalized) -or $artNormalized.Contains($gameFile.normalized)
    if ($shorterLength -ge 4 -and $lengthDifference -le 4 -and $isContained) {
      $candidateByPath[$gameFile.file.FullName] = [ordered]@{ matchType = '名称相关'; matchScore = 1; file = $gameFile.file }
    }
  }

  if ($candidateByPath.Count -eq 0) { continue }

  $candidates = [Collections.Generic.List[object]]::new()
  foreach ($candidate in ($candidateByPath.Values | Sort-Object @{ Expression = 'matchScore'; Descending = $true }, @{ Expression = { $_.file.Name } })) {
    $sourceLabel = $candidate.file.FullName
    $assetId = Add-EmbeddedAsset -Path $candidate.file.FullName -DisplaySource $sourceLabel
    $reviewKey = "martial::$artName::$($candidate.file.Name)"
    $candidates.Add([ordered]@{
      key = $reviewKey
      assetId = $assetId
      fileName = $candidate.file.Name
      sourcePath = $sourceLabel
      matchType = $candidate.matchType
    })
    $directCandidateCount++
  }

  $martialGroups.Add([ordered]@{
    name = $artName
    type = [string]$art.类型
    rank = [string]$art.功法品阶
    candidates = $candidates
  })
}

$categoryGroups = [ordered]@{
  '药品' = @('丹药', '药丸', '药散', '药酒', '膏药', '香囊', '灵果', '毒物', '药材')
  '装备' = @('剑', '刀', '枪戟', '棍棒', '弓', '斧', '锤', '扇', '鞭', '护手', '暗器', '衣甲', '鞋履', '饰品')
  '秘籍' = @('内功经诀', '剑谱', '刀谱', '拳掌谱', '轻功身法', '医毒典籍', '阵法杂典')
  '杂物' = @('令牌印玺', '地图', '书信文书', '矿石金属', '兽材', '珠玉', '容器杂具', '机关奇物', '任务信物')
}

$categoryToTopType = @{}
foreach ($topType in $categoryGroups.Keys) {
  foreach ($category in $categoryGroups[$topType]) {
    $categoryToTopType[$category] = $topType
  }
}

$inventorySource = Get-Content -Raw -LiteralPath $inventoryCatalogPath
$inventoryDirectory = Split-Path -Parent $inventoryCatalogPath
$importPathByVariable = @{}
$importPattern = [regex]"import\s+(\w+)\s+from\s+'([^']+)\?url';"
foreach ($match in $importPattern.Matches($inventorySource)) {
  $absoluteImportPath = [IO.Path]::GetFullPath((Join-Path $inventoryDirectory $match.Groups[2].Value))
  $importPathByVariable[$match.Groups[1].Value] = $absoluteImportPath
}

$assetsBlockMatch = [regex]::Match(
  $inventorySource,
  'const assets: Record<InventoryVisualCategory, RankAssets> = \{(?<body>[\s\S]*?)\r?\n\};'
)
if (-not $assetsBlockMatch.Success) {
  throw 'Unable to parse inventory assets block.'
}

$rankDefinitions = @(
  [ordered]@{ label = '凡品'; tier = 0 },
  [ordered]@{ label = '精品'; tier = 0 },
  [ordered]@{ label = '珍品'; tier = 1 },
  [ordered]@{ label = '极品'; tier = 2 },
  [ordered]@{ label = '绝品'; tier = 3 },
  [ordered]@{ label = '神品'; tier = 3 }
)

$inventoryCategoryByName = @{}
$categoryLinePattern = [regex]'(?m)^\s*([^:\r\n]+):\s*\[([^\]]+)\],'
foreach ($match in $categoryLinePattern.Matches($assetsBlockMatch.Groups['body'].Value)) {
  $category = $match.Groups[1].Value.Trim().Trim("'", '"')
  $assetVariables = @($match.Groups[2].Value.Split(',') | ForEach-Object { $_.Trim() })
  if ($assetVariables.Count -ne 4 -or -not $categoryToTopType.ContainsKey($category)) { continue }

  $rankEntries = [Collections.Generic.List[object]]::new()
  foreach ($rankDefinition in $rankDefinitions) {
    $assetVariable = $assetVariables[$rankDefinition.tier]
    if (-not $importPathByVariable.ContainsKey($assetVariable)) {
      throw "Unable to resolve inventory asset variable: $assetVariable"
    }
    $assetPath = $importPathByVariable[$assetVariable]
    $displaySource = $assetPath.Substring($projectRoot.Length + 1)
    $assetId = Add-EmbeddedAsset -Path $assetPath -DisplaySource $displaySource
    $rankEntries.Add([ordered]@{
      key = "inventory::$($categoryToTopType[$category])::$category::$($rankDefinition.label)"
      rank = $rankDefinition.label
      tier = $rankDefinition.tier
      assetId = $assetId
      fileName = [IO.Path]::GetFileName($assetPath)
      reusedWithinCategory = ($assetVariables | Where-Object { $_ -eq $assetVariable }).Count -gt 1
    })
  }

  $inventoryCategoryByName[$category] = [ordered]@{
    category = $category
    ranks = $rankEntries
  }
}

$inventoryGroups = [Collections.Generic.List[object]]::new()
foreach ($topType in $categoryGroups.Keys) {
  $categories = [Collections.Generic.List[object]]::new()
  foreach ($category in $categoryGroups[$topType]) {
    if ($inventoryCategoryByName.ContainsKey($category)) {
      $categories.Add($inventoryCategoryByName[$category])
    }
  }
  $inventoryGroups.Add([ordered]@{ topType = $topType; categories = $categories })
}

$generatedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz')
$payload = [ordered]@{
  version = 1
  generatedAt = $generatedAt
  sourceStats = [ordered]@{
    martialDatabaseCount = $martialDatabase.功法.Count
    gameImageCount = (Get-ChildItem -LiteralPath $GameIconsRoot -File | Where-Object { $imageExtensions -contains $_.Extension.ToLowerInvariant() }).Count
    matchedMartialArtCount = $martialGroups.Count
    martialCandidateCount = $directCandidateCount
    inventoryCategoryCount = $inventoryCategoryByName.Count
    inventoryReviewCellCount = $inventoryCategoryByName.Count * $rankDefinitions.Count
  }
  martialArts = $martialGroups
  inventoryGroups = $inventoryGroups
  assets = $embeddedAssets
}

$dataJson = $payload | ConvertTo-Json -Depth 16 -Compress
$dataJson = $dataJson.Replace('<', '\u003c')
$template = Get-Content -Raw -LiteralPath $templatePath
$output = $template.Replace('__AUDIT_DATA__', $dataJson).Replace('__GENERATED_AT__', $generatedAt)

$outputDirectory = Split-Path -Parent $OutputPath
[IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
[IO.File]::WriteAllText($OutputPath, $output, [Text.UTF8Encoding]::new($false))

Write-Host "Generated: $OutputPath"
Write-Host "Martial candidates: $directCandidateCount across $($martialGroups.Count) martial arts"
Write-Host "Inventory review cells: $($inventoryCategoryByName.Count * $rankDefinitions.Count)"
Write-Host "Embedded assets: $($embeddedAssets.Count)"
