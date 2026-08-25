[CmdletBinding()]
param(
  [string]$ChromePath = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  [string]$ProfilePath = 'F:\Develop\AI\sillytavern\.wuxia-chrome-profile',
  [string]$PageUrl = 'http://127.0.0.1:8000/',
  [int]$Port = 9333,
  [int]$TimeoutSeconds = 30
)

$ErrorActionPreference = 'Stop'

function Write-Result {
  param([hashtable]$Value)
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
  $Value | ConvertTo-Json -Compress
}

function Get-CdpVersion {
  param([int]$CdpPort)
  try {
    return Invoke-RestMethod -Uri "http://127.0.0.1:$CdpPort/json/version" -TimeoutSec 2
  } catch {
    return $null
  }
}

if ($Port -lt 1 -or $Port -gt 65535) {
  throw "Port must be between 1 and 65535. Received: $Port"
}
if ($TimeoutSeconds -lt 1 -or $TimeoutSeconds -gt 120) {
  throw "TimeoutSeconds must be between 1 and 120. Received: $TimeoutSeconds"
}

$existing = Get-CdpVersion -CdpPort $Port
if ($null -ne $existing) {
  Write-Result @{
    success = $true
    reused = $true
    endpoint = "http://127.0.0.1:$Port"
    browser = [string]$existing.Browser
    webSocketDebuggerUrl = [string]$existing.webSocketDebuggerUrl
  }
  exit 0
}

$resolvedChrome = [System.IO.Path]::GetFullPath($ChromePath)
$resolvedProfile = [System.IO.Path]::GetFullPath($ProfilePath)
if (-not (Test-Path -LiteralPath $resolvedChrome -PathType Leaf)) {
  throw "Chrome executable not found: $resolvedChrome"
}
if (-not (Test-Path -LiteralPath $resolvedProfile -PathType Container)) {
  New-Item -ItemType Directory -Path $resolvedProfile -Force | Out-Null
}

function Quote-CommandLineArgument {
  param([string]$Value)
  return '"' + $Value.Replace('"', '\"') + '"'
}

$arguments = @(
  "--remote-debugging-address=127.0.0.1",
  "--remote-debugging-port=$Port",
  "--user-data-dir=$resolvedProfile",
  '--no-first-run',
  '--new-window',
  $PageUrl
)
$commandLine = (Quote-CommandLineArgument $resolvedChrome) + ' ' + (($arguments | ForEach-Object {
      Quote-CommandLineArgument ([string]$_)
    }) -join ' ')

# Win32_Process.Create uses the WMI Provider Host as the process parent. Chrome
# therefore survives cleanup of the managed shell process tree.
# The Windows PowerShell WMI type reliably returns ProcessId and ReturnValue.
$processClass = [wmiclass]'Win32_Process'
$created = $processClass.Create($commandLine)
if ($null -eq $created -or $null -eq $created.ReturnValue) {
  throw 'Win32_Process.Create returned no verifiable result'
}
if ([int]$created.ReturnValue -ne 0) {
  throw "Win32_Process.Create failed. ReturnValue=$($created.ReturnValue)"
}
if ([int]$created.ProcessId -le 0) {
  throw 'Win32_Process.Create reported success without a valid ProcessId'
}

$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
do {
  Start-Sleep -Milliseconds 250
  $version = Get-CdpVersion -CdpPort $Port
  if ($null -ne $version) {
    Write-Result @{
      success = $true
      reused = $false
      processId = [int]$created.ProcessId
      endpoint = "http://127.0.0.1:$Port"
      browser = [string]$version.Browser
      webSocketDebuggerUrl = [string]$version.webSocketDebuggerUrl
      profilePath = $resolvedProfile
      pageUrl = $PageUrl
    }
    exit 0
  }
} while ([DateTime]::UtcNow -lt $deadline)

throw "Chrome process PID=$($created.ProcessId) did not open CDP port $Port within $TimeoutSeconds seconds"
