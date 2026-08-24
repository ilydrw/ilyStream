[CmdletBinding()]
param(
    [ValidateSet('Debug', 'Release', 'RelWithDebInfo')]
    [string]$Configuration = 'RelWithDebInfo',
    [string]$BuildDirectory,
    [string]$PluginRoot = "$env:ProgramData\obs-studio\plugins"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if ([string]::IsNullOrWhiteSpace($BuildDirectory)) {
    $BuildDirectory = Join-Path $projectRoot 'build'
}

if (Get-Process -Name obs64 -ErrorAction SilentlyContinue) {
    throw 'OBS Studio is running. Close OBS before installing or replacing a native plugin DLL.'
}
if ([string]::IsNullOrWhiteSpace($PluginRoot)) {
    throw 'PluginRoot must be an explicit, non-empty directory.'
}

$sourceDll = Join-Path ([System.IO.Path]::GetFullPath($BuildDirectory)) "$Configuration\ilystream-obs.dll"
if (-not (Test-Path -LiteralPath $sourceDll -PathType Leaf)) {
    throw "Plugin binary not found: $sourceDll. Run scripts\build.ps1 first."
}

$pluginRootPath = [System.IO.Path]::GetFullPath($PluginRoot)
$targetRoot = Join-Path $pluginRootPath 'ilystream-obs'
$targetBin = Join-Path $targetRoot 'bin\64bit'
$targetData = Join-Path $targetRoot 'data'
$targetLocale = Join-Path $targetData 'locale'
$targetDll = Join-Path $targetBin 'ilystream-obs.dll'

New-Item -ItemType Directory -Path $targetBin -Force | Out-Null
New-Item -ItemType Directory -Path $targetLocale -Force | Out-Null

if (Test-Path -LiteralPath $targetDll -PathType Leaf) {
    Copy-Item -LiteralPath $targetDll -Destination "$targetDll.bak" -Force
}

Copy-Item -LiteralPath $sourceDll -Destination $targetDll -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'data\locale\en-US.ini') -Destination $targetLocale -Force

$sourcePdb = Join-Path ([System.IO.Path]::GetFullPath($BuildDirectory)) "$Configuration\ilystream-obs.pdb"
if (Test-Path -LiteralPath $sourcePdb -PathType Leaf) {
    Copy-Item -LiteralPath $sourcePdb -Destination (Join-Path $targetBin 'ilystream-obs.pdb') -Force
}

Write-Host "Installed ilyStream Workspace to $targetRoot"
Write-Host 'Start OBS, then open Tools > ilyStream: Show Workspace (or Docks > ilyStream Workspace).'
