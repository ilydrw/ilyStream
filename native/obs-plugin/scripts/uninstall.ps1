[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [string]$PluginRoot = "$env:ProgramData\obs-studio\plugins",
    [switch]$Purge
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (Get-Process -Name obs64 -ErrorAction SilentlyContinue) {
    throw 'OBS Studio is running. Close OBS before uninstalling a native plugin DLL.'
}
if ([string]::IsNullOrWhiteSpace($PluginRoot)) {
    throw 'PluginRoot must be an explicit, non-empty directory.'
}

$pluginRootPath = [System.IO.Path]::GetFullPath($PluginRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
$targetRoot = [System.IO.Path]::GetFullPath((Join-Path $pluginRootPath 'ilystream-obs'))
$expectedPrefix = $pluginRootPath + [System.IO.Path]::DirectorySeparatorChar
if (-not $targetRoot.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to uninstall outside the requested plugin root: $targetRoot"
}
if (-not (Test-Path -LiteralPath $targetRoot -PathType Container)) {
    Write-Host "ilyStream Workspace is not installed at $targetRoot"
    return
}

if ($Purge) {
    if ($PSCmdlet.ShouldProcess($targetRoot, 'Permanently remove ilyStream Workspace plugin files')) {
        Remove-Item -LiteralPath $targetRoot -Recurse -Force
        Write-Host "Removed $targetRoot (not recoverable from this script)."
    }
    return
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = "$targetRoot.removed-$timestamp"
if ($PSCmdlet.ShouldProcess($targetRoot, "Move ilyStream Workspace plugin files to $backupRoot")) {
    Move-Item -LiteralPath $targetRoot -Destination $backupRoot
    Write-Host "Uninstalled ilyStream Workspace. Files can be recovered from $backupRoot"
}
