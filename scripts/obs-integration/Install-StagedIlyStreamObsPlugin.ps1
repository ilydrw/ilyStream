[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory = $true)]
    [string] $StagePath,

    [string] $ObsRoot,
    [string] $ObsConfigRoot,

    [ValidateSet('Auto', 'ProgramData', 'ObsRoot')]
    [string] $PluginLayout = 'Auto',

    [string] $SharedPluginRoot,
    [switch] $Force
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ObsIntegration.Common.ps1')

$resolvedStagePath = Get-IlyFullPath -Path $StagePath
if (-not (Test-Path -LiteralPath $resolvedStagePath -PathType Container)) {
    throw "Stage directory does not exist: '$resolvedStagePath'."
}

$manifestPath = Join-Path $resolvedStagePath 'ilyStream-stage.json'
$manifest = Read-IlyJsonFile -Path $manifestPath
if ($null -eq $manifest) {
    throw "Stage manifest is missing: '$manifestPath'."
}

try {
    if ([int]$manifest.schemaVersion -ne 1 -or [string]$manifest.kind -ne 'ilyStream-obs-plugin-stage') {
        throw 'unsupported stage manifest schema or kind'
    }
    $pluginId = [string]$manifest.pluginId
    if ($pluginId -notmatch '^[A-Za-z0-9._-]+$' -or $pluginId -notmatch '(?i)^ilystream') {
        throw "unsafe plugin ID '$pluginId'"
    }
}
catch {
    throw "Invalid stage manifest '$manifestPath': $($_.Exception.Message)"
}

$installation = Select-IlyObsInstallation -ObsRoot $ObsRoot -ObsConfigRoot $ObsConfigRoot
if (-not ([string]$manifest.target.obsRoot).Equals($installation.Root, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "This bundle was staged for '$($manifest.target.obsRoot)', not '$($installation.Root)'. Restage it for the selected OBS installation."
}
$installLayout = Resolve-IlyPluginInstallLayout -Installation $installation -PluginId $pluginId -PluginLayout $PluginLayout -SharedPluginRoot $SharedPluginRoot

foreach ($protectedRoot in @($installLayout.BinaryRoot, $installLayout.DataRoot, $installLayout.InstallRoot)) {
    if ((Test-IlyPathWithin -ChildPath $resolvedStagePath -ParentPath $protectedRoot -AllowEqual) -or
        (Test-IlyPathWithin -ChildPath $protectedRoot -ParentPath $resolvedStagePath -AllowEqual)) {
        throw "Stage path '$resolvedStagePath' overlaps OBS's live plugin directories."
    }
}

$stagedFiles = New-Object System.Collections.Generic.List[object]
foreach ($file in @($manifest.files)) {
    $relativePath = ([string]$file.relativePath).Replace('/', '\')
    Assert-IlyPluginRelativePath -RelativePath $relativePath -PluginId $pluginId
    $sourcePath = Get-IlyFullPath -Path (Join-Path $resolvedStagePath $relativePath)
    Assert-IlyPathWithin -ChildPath $sourcePath -ParentPath $resolvedStagePath -Description 'Staged plugin source'
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
        throw "Staged file is missing: '$relativePath'."
    }
    $actualHash = Get-IlySha256 -Path $sourcePath
    $actualSize = (Get-Item -LiteralPath $sourcePath -ErrorAction Stop).Length
    if ($actualHash -ne [string]$file.sha256 -or [long]$actualSize -ne [long]$file.size) {
        throw "Staged file verification failed: '$relativePath'."
    }
    $destination = Resolve-IlyPluginDestination -PackageRelativePath $relativePath -PluginId $pluginId -Layout $installLayout
    $stagedFiles.Add([pscustomobject]@{
        RelativePath = $relativePath
        InstallRelativePath = $destination.InstallRelativePath
        SourcePath = $sourcePath
        DestinationPath = $destination.DestinationPath
        DestinationKind = $destination.DestinationKind
        Sha256 = $actualHash
        Size = [long]$actualSize
    })
}

if (@($stagedFiles | Where-Object { $_.RelativePath -match '(?i)\.dll$' }).Count -ne 1) {
    throw 'The staged bundle must contain exactly one plugin DLL.'
}
$bundleHash = Get-IlyBundleHash -Files $stagedFiles.ToArray()
if ($bundleHash -ne [string]$manifest.bundleSha256) {
    throw "Bundle hash verification failed (expected $($manifest.bundleSha256), found $bundleHash)."
}

$statePath = Get-IlyFullPath -Path (Join-Path $installation.StateDirectory 'plugin-install.json')
$existingState = Read-IlyJsonFile -Path $statePath
$oldEntries = @{}
$recoveryBackups = New-Object System.Collections.Generic.List[object]
if ($null -ne $existingState) {
    try {
        if ([int]$existingState.schemaVersion -ne 2 -or [string]$existingState.status -ne 'installed') {
            throw 'state is not an active schema-v2 installation'
        }
        if (-not ([string]$existingState.obs.root).Equals($installation.Root, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw 'state targets a different OBS installation'
        }
        if (-not ([string]$existingState.plugin.id).Equals($pluginId, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw 'state belongs to a different plugin ID'
        }
        if (-not ([string]$existingState.plugin.installLayout.kind).Equals([string]$installLayout.Kind, [System.StringComparison]::OrdinalIgnoreCase) -or
            -not ([string]$existingState.plugin.installLayout.installRoot).Equals([string]$installLayout.InstallRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw 'state uses a different plugin install root or layout; uninstall that managed copy before changing layouts'
        }
        foreach ($entry in @($existingState.plugin.files)) {
            $oldEntries[([string]$entry.packageRelativePath).ToLowerInvariant()] = $entry
        }
        foreach ($backup in @($existingState.plugin.recoveryBackups)) {
            if ($null -ne $backup) {
                $recoveryBackups.Add($backup)
            }
        }
    }
    catch {
        throw "Cannot safely update from '$statePath': $($_.Exception.Message)"
    }
}

$newFilesByKey = @{}
foreach ($file in $stagedFiles) {
    $key = $file.RelativePath.ToLowerInvariant()
    if ($newFilesByKey.ContainsKey($key)) {
        throw "Duplicate staged path '$($file.RelativePath)'."
    }
    $newFilesByKey[$key] = $file

    if ($oldEntries.ContainsKey($key)) {
        $oldEntry = $oldEntries[$key]
        if (-not ([string]$oldEntry.destinationPath).Equals($file.DestinationPath, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "State destination for '$($file.RelativePath)' does not match the recorded install layout."
        }
        $destinationExists = Test-Path -LiteralPath $file.DestinationPath -PathType Leaf
        $currentHash = if ($destinationExists) { Get-IlySha256 -Path $file.DestinationPath } else { $null }
        $matchesExpectedState = $false
        if ([bool]$oldEntry.managedPresent) {
            $matchesExpectedState = $destinationExists -and $currentHash -eq [string]$oldEntry.installedSha256
        }
        elseif ([bool]$oldEntry.previous.existed) {
            $matchesExpectedState = $destinationExists -and $currentHash -eq [string]$oldEntry.previous.sha256
        }
        else {
            $matchesExpectedState = -not $destinationExists
        }
        if (-not $matchesExpectedState -and -not $Force) {
            throw "Managed plugin file '$($file.RelativePath)' no longer matches installation state. Use -Force to retain a recovery copy and repair it."
        }
    }
}

foreach ($oldEntry in $oldEntries.Values) {
    if (-not [bool]$oldEntry.managedPresent) {
        continue
    }
    $key = ([string]$oldEntry.packageRelativePath).ToLowerInvariant()
    if ($newFilesByKey.ContainsKey($key)) {
        continue
    }
    $resolvedOldDestination = Resolve-IlyPluginDestination -PackageRelativePath ([string]$oldEntry.packageRelativePath) -PluginId $pluginId -Layout $installLayout
    $oldDestination = $resolvedOldDestination.DestinationPath
    if (-not ([string]$oldEntry.destinationPath).Equals($oldDestination, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "State destination for '$($oldEntry.packageRelativePath)' does not match the recorded install layout."
    }
    if (Test-Path -LiteralPath $oldDestination -PathType Leaf) {
        $currentHash = Get-IlySha256 -Path $oldDestination
        if ($currentHash -ne [string]$oldEntry.installedSha256 -and -not $Force) {
            throw "Obsolete managed file '$($oldEntry.packageRelativePath)' was changed after installation. Use -Force to preserve a recovery copy and continue."
        }
    }
}

if (-not $PSCmdlet.ShouldProcess($installLayout.InstallRoot, "Install verified staged plugin '$pluginId' ($bundleHash) using $($installLayout.Kind) layout; OBS must be closed")) {
    [pscustomobject]@{
        Action = 'InstallStagedPlugin'
        Planned = $true
        PluginId = $pluginId
        Version = [string]$manifest.version
        BundleSha256 = $bundleHash
        ObsRoot = $installation.Root
        InstallLayout = $installLayout.Kind
        InstallRoot = $installLayout.InstallRoot
        StagePath = $resolvedStagePath
        RestartedObs = $false
    }
    return
}

# This check is intentionally after ShouldProcess so -WhatIf remains usable while live.
Assert-IlyObsNotRunning -ObsRoot $installation.Root

$timestamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$backupRoot = Get-IlyFullPath -Path (Join-Path $installation.StateDirectory (Join-Path 'b' $timestamp))
$transactionRoot = Join-Path $backupRoot 'pt'
$originalRoot = Join-Path $backupRoot 'po'
$transactionRecords = New-Object System.Collections.Generic.List[object]
$nextEntries = New-Object System.Collections.Generic.List[object]
$allRelativePaths = New-Object System.Collections.Generic.List[string]
foreach ($file in $stagedFiles) { $allRelativePaths.Add($file.RelativePath) }
foreach ($oldEntry in $oldEntries.Values) {
    if (-not $newFilesByKey.ContainsKey(([string]$oldEntry.packageRelativePath).ToLowerInvariant())) {
        $allRelativePaths.Add([string]$oldEntry.packageRelativePath)
    }
}

try {
    foreach ($relativePath in @($allRelativePaths | Select-Object -Unique)) {
        Assert-IlyPluginRelativePath -RelativePath $relativePath -PluginId $pluginId
        $destination = (Resolve-IlyPluginDestination -PackageRelativePath $relativePath -PluginId $pluginId -Layout $installLayout).DestinationPath
        if (Test-Path -LiteralPath $destination -PathType Leaf) {
            $transactionPath = Get-IlyFullPath -Path (Join-Path $transactionRoot $relativePath)
            $transactionHash = Copy-IlyFileVerified -SourcePath $destination -DestinationPath $transactionPath
            $transactionRecords.Add([pscustomobject]@{
                relativePath = $relativePath
                existed = $true
                backupPath = $transactionPath
                sha256 = $transactionHash
            })
            $recoveryBackups.Add([pscustomobject]@{
                createdAtUtc = [DateTime]::UtcNow.ToString('o')
                relativePath = $relativePath
                path = $transactionPath
                sha256 = $transactionHash
                reason = 'pre-install transaction copy'
            })
        }
        else {
            $transactionRecords.Add([pscustomobject]@{
                relativePath = $relativePath
                existed = $false
                backupPath = $null
                sha256 = $null
            })
        }
    }

    foreach ($file in $stagedFiles) {
        $key = $file.RelativePath.ToLowerInvariant()
        $previous = $null
        if ($oldEntries.ContainsKey($key)) {
            $previous = $oldEntries[$key].previous
        }
        elseif (Test-Path -LiteralPath $file.DestinationPath -PathType Leaf) {
            $originalPath = Get-IlyFullPath -Path (Join-Path $originalRoot $file.RelativePath)
            $originalHash = Copy-IlyFileVerified -SourcePath $file.DestinationPath -DestinationPath $originalPath
            $previous = [pscustomobject]@{
                existed = $true
                backupPath = $originalPath
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

        $installedHash = Copy-IlyFileVerified -SourcePath $file.SourcePath -DestinationPath $file.DestinationPath
        if ($installedHash -ne $file.Sha256) {
            throw "Installed plugin hash mismatch for '$($file.RelativePath)'."
        }
        $nextEntries.Add([ordered]@{
            relativePath = $file.RelativePath
            packageRelativePath = $file.RelativePath
            installRelativePath = $file.InstallRelativePath
            destinationPath = $file.DestinationPath
            destinationKind = $file.DestinationKind
            managedPresent = $true
            installedSha256 = $installedHash
            size = $file.Size
            previous = $previous
        })
    }

    foreach ($oldEntry in $oldEntries.Values) {
        $key = ([string]$oldEntry.packageRelativePath).ToLowerInvariant()
        if ($newFilesByKey.ContainsKey($key)) {
            continue
        }
        $oldDestination = (Resolve-IlyPluginDestination -PackageRelativePath ([string]$oldEntry.packageRelativePath) -PluginId $pluginId -Layout $installLayout).DestinationPath
        if ([bool]$oldEntry.previous.existed) {
            $originalBackup = Get-IlyFullPath -Path ([string]$oldEntry.previous.backupPath)
            Assert-IlyPathWithin -ChildPath $originalBackup -ParentPath $installation.StateDirectory -Description 'Original plugin rollback file'
            if (-not (Test-Path -LiteralPath $originalBackup -PathType Leaf) -or
                (Get-IlySha256 -Path $originalBackup) -ne [string]$oldEntry.previous.sha256) {
                throw "Original rollback file for '$($oldEntry.packageRelativePath)' failed verification."
            }
            $null = Copy-IlyFileVerified -SourcePath $originalBackup -DestinationPath $oldDestination
        }
        elseif (Test-Path -LiteralPath $oldDestination -PathType Leaf) {
            Remove-Item -LiteralPath $oldDestination -Force -ErrorAction Stop
        }
        $nextEntries.Add([ordered]@{
            relativePath = [string]$oldEntry.packageRelativePath
            packageRelativePath = [string]$oldEntry.packageRelativePath
            installRelativePath = [string]$oldEntry.installRelativePath
            destinationPath = [string]$oldEntry.destinationPath
            destinationKind = [string]$oldEntry.destinationKind
            managedPresent = $false
            installedSha256 = $null
            size = 0
            previous = $oldEntry.previous
        })
    }

    $state = [ordered]@{
        schemaVersion = 2
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
        plugin = [ordered]@{
            id = $pluginId
            version = [string]$manifest.version
            bundleSha256 = $bundleHash
            stagePath = $resolvedStagePath
            installLayout = [ordered]@{
                kind = $installLayout.Kind
                installRoot = $installLayout.InstallRoot
                sharedPluginRoot = $installLayout.SharedPluginRoot
                binaryRoot = $installLayout.BinaryRoot
                dataRoot = $installLayout.DataRoot
            }
            files = $nextEntries.ToArray()
            recoveryBackups = $recoveryBackups.ToArray()
        }
        safety = [ordered]@{
            obsWasRunning = $false
            obsWasRestarted = $false
            stagedBeforeInstall = $true
        }
    }
    Write-IlyJsonAtomic -Value $state -Path $statePath
}
catch {
    foreach ($transaction in @($transactionRecords | Sort-Object relativePath -Descending)) {
        try {
            $destination = (Resolve-IlyPluginDestination -PackageRelativePath ([string]$transaction.relativePath) -PluginId $pluginId -Layout $installLayout).DestinationPath
            if ([bool]$transaction.existed) {
                $null = Copy-IlyFileVerified -SourcePath ([string]$transaction.backupPath) -DestinationPath $destination
            }
            elseif (Test-Path -LiteralPath $destination -PathType Leaf) {
                Remove-Item -LiteralPath $destination -Force -ErrorAction Stop
            }
        }
        catch {
            Write-Warning "Could not roll back '$($transaction.relativePath)': $($_.Exception.Message)"
        }
    }
    throw
}

[pscustomobject]@{
    Action = 'InstallStagedPlugin'
    Planned = $false
    PluginId = $pluginId
    Version = [string]$manifest.version
    BundleSha256 = $bundleHash
    ObsRoot = $installation.Root
    InstallLayout = $installLayout.Kind
    InstallRoot = $installLayout.InstallRoot
    StatePath = $statePath
    BackupsRetained = $true
    RestartedObs = $false
}
