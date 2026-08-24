[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [string] $ObsRoot,
    [string] $ObsConfigRoot,
    [switch] $Force
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ObsIntegration.Common.ps1')

$installation = Select-IlyObsInstallation -ObsRoot $ObsRoot -ObsConfigRoot $ObsConfigRoot
$statePath = Get-IlyFullPath -Path (Join-Path $installation.StateDirectory 'plugin-install.json')
$state = Read-IlyJsonFile -Path $statePath
if ($null -eq $state) {
    throw "No ilyStream plugin installation state exists at '$statePath'. Nothing was removed."
}

try {
    $stateSchemaVersion = [int]$state.schemaVersion
    if ($stateSchemaVersion -notin @(1, 2) -or [string]$state.status -ne 'installed') {
        throw 'state is not an active supported installation'
    }
    if (-not ([string]$state.obs.root).Equals($installation.Root, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'state targets a different OBS installation'
    }
    $pluginId = [string]$state.plugin.id
    if ($pluginId -notmatch '^[A-Za-z0-9._-]+$' -or $pluginId -notmatch '(?i)^ilystream') {
        throw "unsafe plugin ID '$pluginId'"
    }
}
catch {
    throw "Cannot safely uninstall from '$statePath': $($_.Exception.Message)"
}

if ($stateSchemaVersion -eq 2) {
    $recordedLayoutKind = [string]$state.plugin.installLayout.kind
    if ($recordedLayoutKind -notin @('ProgramData', 'ObsRoot')) {
        throw "State contains unsupported plugin layout '$recordedLayoutKind'."
    }
    $recordedSharedRoot = if ($recordedLayoutKind -eq 'ProgramData') { [string]$state.plugin.installLayout.sharedPluginRoot } else { $null }
    $installLayout = Resolve-IlyPluginInstallLayout -Installation $installation -PluginId $pluginId -PluginLayout $recordedLayoutKind -SharedPluginRoot $recordedSharedRoot
    foreach ($propertyName in @('installRoot', 'binaryRoot', 'dataRoot')) {
        $recordedValue = [string]$state.plugin.installLayout.$propertyName
        $expectedValue = [string]$installLayout.$propertyName
        if (-not $recordedValue.Equals($expectedValue, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "State plugin layout property '$propertyName' does not resolve to the expected safe path."
        }
    }
}
else {
    # Schema v1 only wrote root-relative legacy paths. Retain its exact rollback route.
    $installLayout = Resolve-IlyPluginInstallLayout -Installation $installation -PluginId $pluginId -PluginLayout 'ObsRoot'
}

$managedEntries = New-Object System.Collections.Generic.List[object]
foreach ($entry in @($state.plugin.files)) {
    $relativePath = if ($stateSchemaVersion -eq 2) { ([string]$entry.packageRelativePath).Replace('/', '\') } else { ([string]$entry.relativePath).Replace('/', '\') }
    Assert-IlyPluginRelativePath -RelativePath $relativePath -PluginId $pluginId
    if (-not [bool]$entry.managedPresent) {
        continue
    }

    $destination = (Resolve-IlyPluginDestination -PackageRelativePath $relativePath -PluginId $pluginId -Layout $installLayout).DestinationPath
    if ($stateSchemaVersion -eq 2 -and
        -not ([string]$entry.destinationPath).Equals($destination, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "State destination for '$relativePath' does not match the recorded install layout."
    }
    $destinationExists = Test-Path -LiteralPath $destination -PathType Leaf
    $currentHash = if ($destinationExists) { Get-IlySha256 -Path $destination } else { $null }
    if ((-not $destinationExists -or $currentHash -ne [string]$entry.installedSha256) -and -not $Force) {
        throw "Managed plugin file '$relativePath' no longer matches installation state. Use -Force to retain recovery data and continue."
    }

    if ([bool]$entry.previous.existed) {
        $backupPath = Get-IlyFullPath -Path ([string]$entry.previous.backupPath)
        Assert-IlyPathWithin -ChildPath $backupPath -ParentPath $installation.StateDirectory -Description 'Original plugin backup'
        if (-not (Test-Path -LiteralPath $backupPath -PathType Leaf)) {
            throw "Original backup for '$relativePath' is missing. Nothing was changed."
        }
        if ((Get-IlySha256 -Path $backupPath) -ne [string]$entry.previous.sha256) {
            throw "Original backup for '$relativePath' failed hash verification. Nothing was changed."
        }
    }

    $managedEntries.Add([pscustomobject]@{
        RelativePath = $relativePath
        DestinationPath = $destination
        DestinationExisted = $destinationExists
        Entry = $entry
    })
}

if (-not $PSCmdlet.ShouldProcess($installLayout.InstallRoot, "Uninstall managed plugin '$pluginId' from $($installLayout.Kind) layout and restore every pre-install file; OBS must be closed")) {
    [pscustomobject]@{
        Action = 'UninstallPlugin'
        Planned = $true
        PluginId = $pluginId
        ObsRoot = $installation.Root
        InstallLayout = $installLayout.Kind
        InstallRoot = $installLayout.InstallRoot
        ManagedFileCount = $managedEntries.Count
        RestartedObs = $false
    }
    return
}

# This check is intentionally after ShouldProcess so -WhatIf can inspect a live setup.
Assert-IlyObsNotRunning -ObsRoot $installation.Root

$timestamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$transactionRoot = Get-IlyFullPath -Path (Join-Path $installation.StateDirectory (Join-Path "b\$timestamp" 'pu'))
$transactionRecords = New-Object System.Collections.Generic.List[object]

try {
    foreach ($managed in $managedEntries) {
        if ($managed.DestinationExisted) {
            $transactionPath = Get-IlyFullPath -Path (Join-Path $transactionRoot $managed.RelativePath)
            $transactionHash = Copy-IlyFileVerified -SourcePath $managed.DestinationPath -DestinationPath $transactionPath
            $transactionRecords.Add([pscustomobject]@{
                relativePath = $managed.RelativePath
                existed = $true
                backupPath = $transactionPath
                sha256 = $transactionHash
            })
        }
        else {
            $transactionRecords.Add([pscustomobject]@{
                relativePath = $managed.RelativePath
                existed = $false
                backupPath = $null
                sha256 = $null
            })
        }
    }

    foreach ($managed in $managedEntries) {
        $entry = $managed.Entry
        if ([bool]$entry.previous.existed) {
            $restoredHash = Copy-IlyFileVerified -SourcePath ([string]$entry.previous.backupPath) -DestinationPath $managed.DestinationPath
            if ($restoredHash -ne [string]$entry.previous.sha256) {
                throw "Restored plugin file hash mismatch for '$($managed.RelativePath)'."
            }
        }
        elseif (Test-Path -LiteralPath $managed.DestinationPath -PathType Leaf) {
            Remove-Item -LiteralPath $managed.DestinationPath -Force -ErrorAction Stop
        }
    }

    $state.status = 'uninstalled'
    $state | Add-Member -NotePropertyName uninstalledAtUtc -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
    $state | Add-Member -NotePropertyName uninstallTransactions -NotePropertyValue $transactionRecords.ToArray() -Force
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
    Action = 'UninstallPlugin'
    Planned = $false
    PluginId = $pluginId
    ObsRoot = $installation.Root
    InstallLayout = $installLayout.Kind
    InstallRoot = $installLayout.InstallRoot
    RestoredManagedFileCount = $managedEntries.Count
    StatePath = $statePath
    BackupsRetained = $true
    RestartedObs = $false
}
