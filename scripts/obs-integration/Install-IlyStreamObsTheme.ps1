[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
    [string] $ObsRoot,
    [string] $ObsConfigRoot,
    [string] $ThemeSource,
    [switch] $Force
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ObsIntegration.Common.ps1')

if ([string]::IsNullOrWhiteSpace($ThemeSource)) {
    $ThemeSource = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'resources\obs-integration\themes\ilyStream_Cyber_Neon.ovt'
}

$themeSourcePath = Get-IlyFullPath -Path $ThemeSource
Assert-IlyThemeSource -Path $themeSourcePath
$sourceHash = Get-IlySha256 -Path $themeSourcePath

$installation = Select-IlyObsInstallation -ObsRoot $ObsRoot -ObsConfigRoot $ObsConfigRoot
if (-not [string]::IsNullOrWhiteSpace([string]$installation.Version) -and
    [string]$installation.Version -match '^(\d+)' -and
    [int]$matches[1] -lt 32) {
    throw "OBS $($installation.Version) is not supported by this OBS 32 theme package."
}

$destinationPath = Get-IlyFullPath -Path (Join-Path $installation.ThemeDirectory $script:IlyObsThemeFileName)
Assert-IlyPathWithin -ChildPath $destinationPath -ParentPath $installation.ThemeDirectory -Description 'Theme destination'
$statePath = Get-IlyFullPath -Path (Join-Path $installation.StateDirectory 'theme-install.json')
$existingState = Read-IlyJsonFile -Path $statePath
$previous = $null
$recoveryBackups = New-Object System.Collections.Generic.List[object]

if ($null -ne $existingState) {
    try {
        if ([int]$existingState.schemaVersion -ne 1 -or [string]$existingState.status -ne 'installed') {
            throw 'state is not an active schema-v1 installation'
        }
        if (-not ([string]$existingState.theme.destinationPath).Equals($destinationPath, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw 'state targets a different theme path'
        }

        $previous = $existingState.theme.previous
        foreach ($backup in @($existingState.theme.recoveryBackups)) {
            if ($null -ne $backup) {
                $recoveryBackups.Add($backup)
            }
        }

        if (Test-Path -LiteralPath $destinationPath -PathType Leaf) {
            $currentHash = Get-IlySha256 -Path $destinationPath
            if ($currentHash -ne [string]$existingState.theme.installedSha256 -and -not $Force) {
                throw "The installed theme was changed after installation (expected $($existingState.theme.installedSha256), found $currentHash). Use -Force to preserve that copy and replace it."
            }
        }
        elseif (-not $Force) {
            throw 'The managed theme file is missing. Use -Force to repair it while retaining the original rollback state.'
        }
    }
    catch {
        if ($_.Exception.Message -like 'The installed theme was changed*' -or
            $_.Exception.Message -like 'The managed theme file is missing*') {
            throw
        }
        throw "Cannot safely update from '$statePath': $($_.Exception.Message)"
    }
}

$timestamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$backupRoot = Get-IlyFullPath -Path (Join-Path $installation.StateDirectory (Join-Path 'b' $timestamp))
$transactionBackup = Get-IlyFullPath -Path (Join-Path $backupRoot (Join-Path 'tt' $script:IlyObsThemeFileName))
$originalBackup = Get-IlyFullPath -Path (Join-Path $backupRoot (Join-Path 'to' $script:IlyObsThemeFileName))
$targetDescription = "Install ilyStream OBS theme ($sourceHash)"

if (-not $PSCmdlet.ShouldProcess($destinationPath, $targetDescription)) {
    [pscustomobject]@{
        Action = 'InstallTheme'
        Planned = $true
        ObsRoot = $installation.Root
        ObsOrigin = $installation.Origin
        Portable = $installation.IsPortable
        Destination = $destinationPath
        SourceSha256 = $sourceHash
        RestartedObs = $false
    }
    return
}

$destinationExisted = Test-Path -LiteralPath $destinationPath -PathType Leaf
$transactionHash = $null

try {
    if ($destinationExisted) {
        $transactionHash = Copy-IlyFileVerified -SourcePath $destinationPath -DestinationPath $transactionBackup
        $recoveryBackups.Add([pscustomobject]@{
            createdAtUtc = [DateTime]::UtcNow.ToString('o')
            path = $transactionBackup
            sha256 = $transactionHash
            reason = if ($null -eq $existingState) { 'pre-install transaction copy' } else { 'pre-update transaction copy' }
        })
    }

    if ($null -eq $previous) {
        if ($destinationExisted) {
            $originalHash = Copy-IlyFileVerified -SourcePath $destinationPath -DestinationPath $originalBackup
            $previous = [pscustomobject]@{
                existed = $true
                backupPath = $originalBackup
                sha256 = $originalHash
            }
        }
        else {
            $previous = [pscustomobject]@{
                existed = $false
                backupPath = $null
                sha256 = $null
            }
        }
    }

    $installedHash = Copy-IlyFileVerified -SourcePath $themeSourcePath -DestinationPath $destinationPath
    if ($installedHash -ne $sourceHash) {
        throw 'Installed theme hash does not match the source hash.'
    }

    $state = [ordered]@{
        schemaVersion = 1
        status = 'installed'
        installedAtUtc = [DateTime]::UtcNow.ToString('o')
        obs = [ordered]@{
            root = $installation.Root
            executable = $installation.Executable
            version = $installation.Version
            origin = $installation.Origin
            portable = $installation.IsPortable
            configRoot = $installation.ConfigRoot
        }
        theme = [ordered]@{
            id = $script:IlyObsThemeId
            sourcePath = $themeSourcePath
            sourceSha256 = $sourceHash
            destinationPath = $destinationPath
            installedSha256 = $installedHash
            previous = $previous
            recoveryBackups = $recoveryBackups.ToArray()
        }
        safety = [ordered]@{
            obsWasRestarted = $false
            browserDockContentModified = $false
        }
    }
    Write-IlyJsonAtomic -Value $state -Path $statePath
}
catch {
    try {
        if ($destinationExisted -and (Test-Path -LiteralPath $transactionBackup -PathType Leaf)) {
            $null = Copy-IlyFileVerified -SourcePath $transactionBackup -DestinationPath $destinationPath
        }
        elseif (-not $destinationExisted -and (Test-Path -LiteralPath $destinationPath -PathType Leaf)) {
            Remove-Item -LiteralPath $destinationPath -Force -ErrorAction Stop
        }
    }
    catch {
        Write-Warning "Automatic transaction rollback also failed: $($_.Exception.Message)"
    }
    throw
}

$runningFromTarget = @(
    Get-IlyObsProcessInfo | Where-Object {
        -not [string]::IsNullOrWhiteSpace([string]$_.Path) -and
        (Test-IlyPathWithin -ChildPath $_.Path -ParentPath $installation.Root)
    }
)
if ($runningFromTarget.Count -gt 0) {
    Write-Warning 'OBS is currently open. The theme file is installed, but it will not be hot-applied. Select it later in Settings > Appearance; this script will not restart OBS.'
}

[pscustomobject]@{
    Action = 'InstallTheme'
    Planned = $false
    ObsRoot = $installation.Root
    ObsOrigin = $installation.Origin
    Portable = $installation.IsPortable
    Destination = $destinationPath
    InstalledSha256 = $sourceHash
    StatePath = $statePath
    RestartedObs = $false
}
