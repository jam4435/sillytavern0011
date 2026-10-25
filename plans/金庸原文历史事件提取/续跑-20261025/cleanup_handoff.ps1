# Apply the reviewed task-local cleanup manifest, rejecting changed files.
$ErrorActionPreference = 'Stop'
$taskDirectory = 'F:\Develop\AI\sillytavern\plans\金庸原文历史事件提取'
$codexDirectory = 'C:\Users\DELL\.codex'
$allowedDirectories = @($taskDirectory, $codexDirectory) | ForEach-Object { [IO.Path]::GetFullPath($_).TrimEnd('\') }
$manifestPath = Join-Path $PSScriptRoot 'handoff\cleanup-plan.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$running = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -match '^(python(w)?|node)\.exe$' -and
    $_.CommandLine -like '*金庸原文历史事件提取*续跑-20261025*'
}
if ($running) { throw 'A task process is running; do not clean an active execution.' }

function Assert-CleanupPath([string]$target) {
    $absolute = [IO.Path]::GetFullPath($target)
    $contained = $false
    foreach ($directory in $allowedDirectories) {
        if ($absolute.StartsWith($directory + '\', [StringComparison]::OrdinalIgnoreCase)) { $contained = $true }
    }
    if (-not $contained) { throw "Cleanup target outside the named directories: $absolute" }
    return $absolute
}

# Verify every path and hash before removing any file.
foreach ($file in $manifest.files) {
    $absolute = Assert-CleanupPath $file.path
    if (Test-Path -LiteralPath $absolute -PathType Leaf) {
        $hash = (Get-FileHash -LiteralPath $absolute -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($hash -ne $file.sha256) { throw "Cleanup target changed: $absolute" }
    } elseif (Test-Path -LiteralPath $absolute) { throw "Expected a file: $absolute" }
}
$removed = @()
foreach ($file in $manifest.files) {
    $absolute = Assert-CleanupPath $file.path
    if (Test-Path -LiteralPath $absolute -PathType Leaf) {
        Remove-Item -LiteralPath $absolute -Force -Confirm:$false
        $removed += $file
    }
}
foreach ($directory in $manifest.empty_directories) {
    $absolute = Assert-CleanupPath $directory
    if ((Test-Path -LiteralPath $absolute -PathType Container) -and
        -not (Get-ChildItem -LiteralPath $absolute -Force | Select-Object -First 1)) {
        Remove-Item -LiteralPath $absolute -Force -Confirm:$false
    }
}
$report = [ordered]@{
    completed_at = [DateTimeOffset]::Now.ToString('o')
    removed_files = $removed.Count
    removed_bytes = ($removed | Measure-Object -Property bytes -Sum).Sum
    files = $removed
}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'handoff\cleanup-report.json') -Encoding UTF8
[pscustomobject]@{ removed_files = $report.removed_files; removed_bytes = $report.removed_bytes }
