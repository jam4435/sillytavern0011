[CmdletBinding()]
param(
  [string]$ChromePath = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  [string]$ProfilePath = 'F:\Develop\AI\sillytavern\.wuxia-chrome-profile',
  [string]$PageUrl = 'http://127.0.0.1:8000/',
  [int]$Port = 9333,
  [string]$StaticRoot = '',
  [int]$StaticPort = 5500,
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

function Quote-CommandLineArgument {
  param([string]$Value)
  return '"' + $Value.Replace('"', '\"') + '"'
}

function Test-StaticServer {
  param([int]$ServerPort)
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$ServerPort/dist/%E6%AD%A6%E4%BE%A0/index.html" -TimeoutSec 2
    return [int]$response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if ($Port -lt 1 -or $Port -gt 65535) {
  throw "Port must be between 1 and 65535. Received: $Port"
}
if ($TimeoutSeconds -lt 1 -or $TimeoutSeconds -gt 120) {
  throw "TimeoutSeconds must be between 1 and 120. Received: $TimeoutSeconds"
}
if ($StaticPort -lt 1 -or $StaticPort -gt 65535) {
  throw "StaticPort must be between 1 and 65535. Received: $StaticPort"
}

$resolvedStaticRoot = if ($StaticRoot) {
  [System.IO.Path]::GetFullPath($StaticRoot)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..'))
}
if (-not (Test-Path -LiteralPath $resolvedStaticRoot -PathType Container)) {
  throw "Static root not found: $resolvedStaticRoot"
}

$processClass = [wmiclass]'Win32_Process'
$staticServerReused = Test-StaticServer -ServerPort $StaticPort
$staticProcessId = 0
if (-not $staticServerReused) {
  $python = (Get-Command python.exe -ErrorAction Stop).Source
  $pythonw = Join-Path ([System.IO.Path]::GetDirectoryName($python)) 'pythonw.exe'
  if (-not (Test-Path -LiteralPath $pythonw -PathType Leaf)) {
    throw "pythonw.exe not found next to: $python"
  }
  $staticScript = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'serve-wuxia-static.py'))
  if (-not (Test-Path -LiteralPath $staticScript -PathType Leaf)) {
    throw "Static server script not found: $staticScript"
  }
  $staticArguments = @($staticScript, '--port', [string]$StaticPort, '--root', $resolvedStaticRoot)
  $staticCommandLine = (Quote-CommandLineArgument $pythonw) + ' ' + (($staticArguments | ForEach-Object {
        Quote-CommandLineArgument ([string]$_)
      }) -join ' ')
  $staticCreated = $processClass.Create($staticCommandLine)
  if ($null -eq $staticCreated -or [int]$staticCreated.ReturnValue -ne 0 -or [int]$staticCreated.ProcessId -le 0) {
    throw "Failed to start static server. ReturnValue=$($staticCreated.ReturnValue)"
  }
  $staticProcessId = [int]$staticCreated.ProcessId
  $staticDeadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while (-not (Test-StaticServer -ServerPort $StaticPort)) {
    if ([DateTime]::UtcNow -ge $staticDeadline) {
      throw "Static server PID=$staticProcessId did not serve port $StaticPort within $TimeoutSeconds seconds"
    }
    Start-Sleep -Milliseconds 250
  }
}

$existing = Get-CdpVersion -CdpPort $Port
if ($null -ne $existing) {
  Write-Result @{
    success = $true
    reused = $true
    endpoint = "http://127.0.0.1:$Port"
    browser = [string]$existing.Browser
    webSocketDebuggerUrl = [string]$existing.webSocketDebuggerUrl
    staticServer = "http://127.0.0.1:$StaticPort"
    staticServerReused = $staticServerReused
    staticProcessId = $staticProcessId
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
      staticServer = "http://127.0.0.1:$StaticPort"
      staticServerReused = $staticServerReused
      staticProcessId = $staticProcessId
    }
    exit 0
  }
} while ([DateTime]::UtcNow -lt $deadline)

throw "Chrome process PID=$($created.ProcessId) did not open CDP port $Port within $TimeoutSeconds seconds"
