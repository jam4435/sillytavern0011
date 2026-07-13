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
$generatedInventorySupplementDirectory = Join-Path $projectRoot 'src\武侠\assets\icons\generated\inventory-v1'
$generatedMedicineVersions = @(
  [ordered]@{
    id = 'guofeng-v3'
    label = 'AI 国风 V3'
    directory = Join-Path $projectRoot 'src\武侠\assets\icons\generated\medicine-v3'
  }
)

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
$allGameImageFiles = @(
  Get-ChildItem -LiteralPath $GameIconsRoot -File |
    Where-Object { $imageExtensions -contains $_.Extension.ToLowerInvariant() }
)
$namedGameFiles = @(
  $allGameImageFiles |
    Where-Object {
      $_.BaseName -match '[\u4e00-\u9fff]'
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
  [ordered]@{ label = '凡品'; tier = 0; generatedSlug = 'common' },
  [ordered]@{ label = '精品'; tier = 0; generatedSlug = 'fine' },
  [ordered]@{ label = '珍品'; tier = 1; generatedSlug = 'rare' },
  [ordered]@{ label = '极品'; tier = 2; generatedSlug = 'exceptional' },
  [ordered]@{ label = '绝品'; tier = 3; generatedSlug = 'supreme' },
  [ordered]@{ label = '神品'; tier = 3; generatedSlug = 'divine' }
)

$generatedMedicineSlugByCategory = @{
  '丹药' = 'elixir'
  '药丸' = 'pellet'
  '药散' = 'powder'
  '药酒' = 'wine'
  '膏药' = 'salve'
  '香囊' = 'sachet'
  '灵果' = 'fruit'
  '毒物' = 'poison'
  '药材' = 'herb'
}

$generatedInventorySupplementSlugByCategory = @{
  '枪戟' = 'spear'
  '棍棒' = 'staff'
  '弓' = 'bow'
  '斧' = 'axe'
  '锤' = 'hammer'
  '鞭' = 'whip'
  '扇' = 'fan'
  '护手' = 'glove'
  '暗器' = 'hidden'
  '衣甲' = 'armor'
  '鞋履' = 'shoes'
  '饰品' = 'accessory'
  '令牌印玺' = 'token'
  '地图' = 'map'
  '书信文书' = 'document'
  '矿石金属' = 'ore'
  '兽材' = 'beast'
  '珠玉' = 'gem'
  '容器杂具' = 'container'
  '机关奇物' = 'mechanism'
  '任务信物' = 'quest'
}

$filenameGameCandidatePatterns = [ordered]@{
  '丹药' = '^(?:dan(?:\d+)?|nedan|goldyao\d*)$|丹'
  '药丸' = '丸|pill|^dan(?:2|5|22|23|24|25|28|40)$'
  '药散' = '散|powder|^dan(?:7|20)$'
  '药酒' = 'wine|酒|醉'
  '膏药' = '膏|salve|medicine|^dan(?:3|20)$'
  '香囊' = 'amulet|香囊|藥囊|药囊|bag'
  '灵果' = 'fruit|靈果|灵果|仙果|朱果|^dan(?:21|27)$|herbal1_10'
  '毒物' = 'poison|toxic|venom|snake|frog|corpse|毒|蠍|蝎|蜈蚣'
  '药材' = 'herb|ginseng|藥材|药材|草|芝|參|参'
  '剑' = 'sword|劍|剑'
  '刀' = 'saber|blade|knife|刀'
  '枪戟' = 'spear|lance|halberd|槍|枪|戟|矛|槊'
  '棍棒' = 'staff|club|stick|棍|棒|杖'
  '弓' = 'bow|弓|弩'
  '斧' = 'axe|斧|鉞|钺'
  '锤' = 'hammer|錘|锤|槌'
  '扇' = 'fan|扇'
  '鞭' = 'whip|鞭'
  '护手' = 'glove|gauntlet|掌套|拳套|護手|护手'
  '暗器' = 'dart|needle|hidden|暗器|針|针|鏢|镖'
  '衣甲' = 'armor|armour|robe|shirt|cloth|衣|甲|袍|衫|鎧|铠'
  '鞋履' = 'shoe|boot|鞋|靴|履'
  '饰品' = 'accessory|amulet|ring|necklace|bracelet|飾|饰|佩|簪|釵|钗|墜|坠'
  '内功经诀' = 'book|scroll|manual|經|经|訣|诀|心法|神功|內功|内功'
  '剑谱' = 'sword|劍|剑|劍譜|剑谱'
  '刀谱' = 'saber|blade|刀|刀譜|刀谱'
  '拳掌谱' = 'fist|palm|拳|掌|指|爪'
  '轻功身法' = 'qinggong|step|步|輕功|轻功|身法'
  '医毒典籍' = 'medicine|medical|poison|醫|医|藥|药|毒'
  '阵法杂典' = 'formation|array|陣|阵|譜|谱|圖|图'
  '令牌印玺' = 'token|seal|badge|令|牌|印|璽|玺'
  '地图' = 'map|地圖|地图|輿圖|舆图'
  '书信文书' = 'letter|document|paper|scroll|信|書|书|文書|文书|手稿|卷宗'
  '矿石金属' = 'ore|metal|iron|gold|silver|礦|矿|鐵|铁|銅|铜|銀|银'
  '兽材' = 'beast|bone|horn|skin|fur|骨|角|皮|鱗|鳞|羽|爪'
  '珠玉' = 'gem|jade|pearl|crystal|珠|玉|寶石|宝石|水晶|翡翠|瑪瑙|玛瑙'
  '容器杂具' = 'container|box|bag|bottle|jar|pot|箱|匣|盒|瓶|罐|壺|壶|袋|囊'
  '机关奇物' = 'mechanism|gear|key|lock|機關|机关|鑰匙|钥匙|鎖|锁|羅盤|罗盘'
  '任务信物' = 'quest|token|item|信物|憑證|凭证|遺物|遗物|殘片|残片'
}

$filenameGameCandidateLimitPerCategory = 18
$filenameGameFilesByCategory = @{}
foreach ($entry in $filenameGameCandidatePatterns.GetEnumerator()) {
  $filenameGameFilesByCategory[$entry.Key] = @(
    $allGameImageFiles |
      Where-Object { $_.BaseName -match $entry.Value } |
      Sort-Object Name, FullName |
      Select-Object -First $filenameGameCandidateLimitPerCategory
  )
}

$inventoryCategoryByName = @{}
$generatedInventoryCandidateCount = 0
$generatedMedicineCandidateCount = 0
$generatedSupplementCandidateCount = 0
$filenameGameCandidateCount = 0
$categoryLinePattern = [regex]'(?m)^\s*([^:\r\n]+):\s*\[([^\]]+)\],'
foreach ($match in $categoryLinePattern.Matches($assetsBlockMatch.Groups['body'].Value)) {
  $category = $match.Groups[1].Value.Trim().Trim("'", '"')
  $assetVariables = @($match.Groups[2].Value.Split(',') | ForEach-Object { $_.Trim() })
  if ($assetVariables.Count -ne 4 -or -not $categoryToTopType.ContainsKey($category)) { continue }

  $rankEntries = [Collections.Generic.List[object]]::new()
  $rankIndex = 0
  foreach ($rankDefinition in $rankDefinitions) {
    $assetVariable = $assetVariables[$rankDefinition.tier]
    if (-not $importPathByVariable.ContainsKey($assetVariable)) {
      throw "Unable to resolve inventory asset variable: $assetVariable"
    }
    $assetPath = $importPathByVariable[$assetVariable]
    $displaySource = $assetPath.Substring($projectRoot.Length + 1)
    $assetId = Add-EmbeddedAsset -Path $assetPath -DisplaySource $displaySource
    $gameCandidates = [Collections.Generic.List[object]]::new()
    if ($filenameGameFilesByCategory.ContainsKey($category)) {
      $categoryGameFiles = @($filenameGameFilesByCategory[$category])
      for ($candidateIndex = $rankIndex; $candidateIndex -lt $categoryGameFiles.Count; $candidateIndex += $rankDefinitions.Count) {
        $gameFile = $categoryGameFiles[$candidateIndex]
        $gameAssetId = Add-EmbeddedAsset -Path $gameFile.FullName -DisplaySource $gameFile.FullName
        $gameCandidates.Add([ordered]@{
          key = "inventory::$($categoryToTopType[$category])::$category::$($rankDefinition.label)::game-name::$($gameFile.Name)"
          assetId = $gameAssetId
          fileName = $gameFile.Name
          sourcePath = $gameFile.FullName
          sourceType = '游戏文件名候选'
        })
        $filenameGameCandidateCount++
      }
    }
    $generatedCandidates = [Collections.Generic.List[object]]::new()
    if ($generatedMedicineSlugByCategory.ContainsKey($category)) {
      $generatedFileName = 'medicine_{0}_{1}.jpg' -f $generatedMedicineSlugByCategory[$category], $rankDefinition.generatedSlug
      foreach ($generatedVersion in $generatedMedicineVersions) {
        $generatedPath = Join-Path $generatedVersion.directory $generatedFileName
        if (Test-Path -LiteralPath $generatedPath) {
          $generatedDisplaySource = $generatedPath.Substring($projectRoot.Length + 1)
          $generatedAssetId = Add-EmbeddedAsset -Path $generatedPath -DisplaySource $generatedDisplaySource
          $generatedCandidates.Add([ordered]@{
            key = "inventory::$($categoryToTopType[$category])::$category::$($rankDefinition.label)::$($generatedVersion.id)"
            assetId = $generatedAssetId
            fileName = $generatedFileName
            sourcePath = $generatedDisplaySource
            sourceType = $generatedVersion.label
          })
          $generatedInventoryCandidateCount++
          $generatedMedicineCandidateCount++
        }
      }
    }
    if ($generatedInventorySupplementSlugByCategory.ContainsKey($category)) {
      $supplementFileName = 'inventory_{0}_{1}.jpg' -f $generatedInventorySupplementSlugByCategory[$category], $rankDefinition.generatedSlug
      $supplementPath = Join-Path $generatedInventorySupplementDirectory $supplementFileName
      if (Test-Path -LiteralPath $supplementPath) {
        $supplementDisplaySource = $supplementPath.Substring($projectRoot.Length + 1)
        $supplementAssetId = Add-EmbeddedAsset -Path $supplementPath -DisplaySource $supplementDisplaySource
        $generatedCandidates.Add([ordered]@{
          key = "inventory::$($categoryToTopType[$category])::$category::$($rankDefinition.label)::supplement-v1"
          assetId = $supplementAssetId
          fileName = $supplementFileName
          sourcePath = $supplementDisplaySource
          sourceType = 'AI 补图 V1'
        })
        $generatedInventoryCandidateCount++
        $generatedSupplementCandidateCount++
      }
    }
    $rankEntries.Add([ordered]@{
      key = "inventory::$($categoryToTopType[$category])::$category::$($rankDefinition.label)"
      rank = $rankDefinition.label
      tier = $rankDefinition.tier
      assetId = $assetId
      fileName = [IO.Path]::GetFileName($assetPath)
      reusedWithinCategory = ($assetVariables | Where-Object { $_ -eq $assetVariable }).Count -gt 1
      gameCandidates = $gameCandidates
      generatedCandidates = $generatedCandidates
    })
    $rankIndex++
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
    gameImageCount = $allGameImageFiles.Count
    matchedMartialArtCount = $martialGroups.Count
    martialCandidateCount = $directCandidateCount
    inventoryCategoryCount = $inventoryCategoryByName.Count
    inventoryReviewCellCount = $inventoryCategoryByName.Count * $rankDefinitions.Count
    filenameGameCandidateCount = $filenameGameCandidateCount
    generatedInventoryCandidateCount = $generatedInventoryCandidateCount
    generatedMedicineCandidateCount = $generatedMedicineCandidateCount
    generatedSupplementCandidateCount = $generatedSupplementCandidateCount
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
