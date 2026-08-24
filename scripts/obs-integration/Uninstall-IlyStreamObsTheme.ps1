[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
    [string] $ObsRoot,
    [string] $ObsConfigRoot,
    [switch] $Force
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ObsIntegration.Common.ps1')

$installation = Select-IlyObsInstallation -ObsRoot $ObsRoot -ObsConfigRoot $ObsConfigRoot
$statePath = Get-IlyFullPath -Path (Join-Path $installation.StateDirectory 'theme-install.json')
$state = Read-IlyJsonFile -Path $statePath
if ($null -eq $state) {
    throw "No ilyStream theme installation state exists at '$statePath'. Nothing was removed."
}

try {
    if ([int]$state.schemaVersion -ne 1 -or [string]$state.status -ne 'installed') {
        throw 'state is not an active schema-v1 installation'
    }
    if ([string]$state.theme.id -ne $script:IlyObsThemeId) {
        throw 'state belongs to a different theme'
    }
}
catch {
    throw "Cannot safely uninstall from '$statePath': $($_.Exception.Message)"
}

$destinationPath = Get-IlyFullPath -Path ([string]$state.theme.destinationPath)
$expectedDestination = Get-IlyFullPath -Path (Join-Path $installation.ThemeDirectory $script:IlyObsThemeFileName)
if (-not $destinationPath.Equals($expectedDestination, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "State destination '$destinationPath' does not match the selected OBS user-theme path '$expectedDestination'."
}
Assert-IlyPathWithin -ChildPath $destinationPath -ParentPath $installation.ThemeDirectory -Description 'Theme destination'

$destinationExists = Test-Path -LiteralPath $destinationPath -PathType Leaf
$currentHash = if ($destinationExists) { Get-IlySha256 -Path $destinationPath } else { $null }
if ($destinationExists -and $currentHash -ne [string]$state.theme.installedSha256 -and -not $Force) {
    throw "The managed theme was changed after installation (expected $($state.theme.installedSha256), found $currentHash). Use -Force to retain a recovery copy and continue."
}

$previousExisted = [bool]$state.theme.previous.existed
$previousBackup = if ($previousExisted) { Get-IlyFullPath -Path ([string]$state.theme.previous.backupPath) } else { $null }
if ($previousExisted) {
    Assert-IlyPathWithin -ChildPath $previousBackup -ParentPath $installation.StateDirectory -Description 'Theme rollback backup'
    if (-not (Test-Path -LiteralPath $previousBackup -PathType Leaf)) {
        throw "The original theme backup is missing: '$previousBackup'. Nothing was changed."
    }
    $previousHash = Get-IlySha256 -Path $previousBackup
    if ($previousHash -ne [string]$state.theme.previous.sha256) {
        throw "The original theme backup failed hash verification. Nothing was changed."
    }
}

$operation = if ($previousExisted) { 'Restore the theme that preceded ilyStream' } else { 'Remove the ilyStream user theme' }
if (-not $PSCmdlet.ShouldProcess($destinationPath, $operation)) {
    [pscustomobject]@{
        Action = 'UninstallTheme'
        Planned = $true
        Destination = $destinationPath
        RestoresPreviousThemeFile = $previousExisted
        RestartedObs = $false
    }
    return
}

$timestamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$transactionBackup = Get-IlyFullPath -Path (Join-Path $installation.StateDirectory (Join-Path "b\$timestamp\tu" $script:IlyObsThemeFileName))
$transactionHash = $null

try {
    if ($destinationExists) {
        $transactionHash = Copy-IlyFileVerified -SourcePath $destinationPath -DestinationPath $transactionBackup
    }

    if ($previousExisted) {
        $restoredHash = Copy-IlyFileVerified -SourcePath $previousBackup -DestinationPath $destinationPath
        if ($restoredHash -ne [string]$state.theme.previous.sha256) {
            throw 'Restored theme hash does not match the original backup.'
        }
    }
    elseif (Test-Path -LiteralPath $destinationPath -PathType Leaf) {
        Remove-Item -LiteralPath $destinationPath -Force -ErrorAction Stop
    }

    $state.status = 'uninstalled'
    $state | Add-Member -NotePropertyName uninstalledAtUtc -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
    $state | Add-Member -NotePropertyName uninstallTransaction -NotePropertyValue ([pscustomobject]@{
        backupPath = if ($destinationExists) { $transactionBackup } else { $null }
        sha256 = $transactionHash
        restoredPreviousThemeFile = $previousExisted
        forced = [bool]$Force
    }) -Force
    Write-IlyJsonAtomic -Value $state -Path $statePath
}
catch {
    try {
        if ($destinationExists -and (Test-Path -LiteralPath $transactionBackup -PathType Leaf)) {
            $null = Copy-IlyFileVerified -SourcePath $transactionBackup -DestinationPath $destinationPath
        }
        elseif (-not $destinationExists -and (Test-Path -LiteralPath $destinationPath -PathType Leaf)) {
            Remove-Item -LiteralPath $destinationPath -Force -ErrorAction Stop
        }
    }
    catch {
        Write-Warning "Automatic transaction rollback also failed: $($_.Exception.Message)"
    }
    throw
}

[pscustomobject]@{
    Action = 'UninstallTheme'
    Planned = $false
    Destination = $destinationPath
    RestoredPreviousThemeFile = $previousExisted
    StatePath = $statePath
    BackupsRetained = $true
    RestartedObs = $false
}
