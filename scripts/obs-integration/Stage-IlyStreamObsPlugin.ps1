[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Low')]
param(
    [Parameter(Mandatory = $true)]
    [string] $PackagePath,

    [string] $Version,
    [string] $PluginId,
    [string] $ObsRoot,
    [string] $ObsConfigRoot,
    [string] $StageRoot,

    [ValidateSet('Auto', 'ProgramData', 'ObsRoot')]
    [string] $PluginLayout = 'Auto',

    [string] $SharedPluginRoot,
    [switch] $Force
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ObsIntegration.Common.ps1')

$installation = Select-IlyObsInstallation -ObsRoot $ObsRoot -ObsConfigRoot $ObsConfigRoot
$resolvedPackagePath = Get-IlyFullPath -Path $PackagePath
if (-not (Test-Path -LiteralPath $resolvedPackagePath)) {
    throw "Plugin package does not exist: '$resolvedPackagePath'."
}

if ([string]::IsNullOrWhiteSpace($StageRoot)) {
    if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        throw 'LOCALAPPDATA is unavailable. Pass -StageRoot explicitly.'
    }
    $StageRoot = Join-Path $env:LOCALAPPDATA 'ilyStream\obs-integration\staged-plugins'
}
$resolvedStageRoot = Get-IlyFullPath -Path $StageRoot

$protectedPluginRoots = @(
    (Join-Path $installation.Root 'obs-plugins'),
    (Join-Path $installation.Root 'data\obs-plugins')
)
foreach ($protectedRoot in $protectedPluginRoots) {
    if ((Test-IlyPathWithin -ChildPath $resolvedStageRoot -ParentPath $protectedRoot -AllowEqual) -or
        (Test-IlyPathWithin -ChildPath $protectedRoot -ParentPath $resolvedStageRoot -AllowEqual)) {
        throw "The staging root '$resolvedStageRoot' overlaps OBS's live plugin directories. Choose a separate -StageRoot."
    }
}

$temporaryExtractionRoot = $null
$packageSearchRoot = $resolvedPackagePath
if (Test-Path -LiteralPath $resolvedPackagePath -PathType Leaf) {
    if ([System.IO.Path]::GetExtension($resolvedPackagePath) -ne '.zip') {
        throw 'Plugin packages must be a directory or a .zip archive.'
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($resolvedPackagePath)
    try {
        foreach ($entry in $archive.Entries) {
            $entryPath = ([string]$entry.FullName).Replace('/', '\')
            if ([string]::IsNullOrWhiteSpace($entryPath)) {
                continue
            }
            Assert-IlySafeRelativePath -RelativePath $entryPath.TrimEnd([char]'\')
        }
    }
    finally {
        $archive.Dispose()
    }

    $temporaryExtractionRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('ilystream-obs-stage-' + [System.Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $temporaryExtractionRoot -Force -ErrorAction Stop | Out-Null
    [System.IO.Compression.ZipFile]::ExtractToDirectory($resolvedPackagePath, $temporaryExtractionRoot)
    $packageSearchRoot = $temporaryExtractionRoot
}
elseif (-not (Test-Path -LiteralPath $resolvedPackagePath -PathType Container)) {
    throw "Unsupported plugin package path '$resolvedPackagePath'."
}

$partialStagePath = $null
try {
    $dllCandidates = @(
        Get-ChildItem -LiteralPath $packageSearchRoot -Filter '*.dll' -File -Recurse -ErrorAction Stop | Where-Object {
            $_.FullName.Replace('/', '\') -match '(?i)\\obs-plugins\\64bit\\[^\\]+\.dll$'
        }
    )
    if (-not [string]::IsNullOrWhiteSpace($PluginId)) {
        $dllCandidates = @($dllCandidates | Where-Object { $_.BaseName.Equals($PluginId, [System.StringComparison]::OrdinalIgnoreCase) })
    }
    else {
        $dllCandidates = @($dllCandidates | Where-Object { $_.BaseName -match '(?i)^ilystream(?:[-_.].+)?$' })
    }

    if ($dllCandidates.Count -ne 1) {
        throw "Expected exactly one ilyStream DLL under obs-plugins\\64bit; found $($dllCandidates.Count)."
    }

    $pluginDll = $dllCandidates[0]
    $resolvedPluginId = if ([string]::IsNullOrWhiteSpace($PluginId)) { $pluginDll.BaseName } else { $PluginId }
    if ($resolvedPluginId -notmatch '^[A-Za-z0-9._-]+$' -or $resolvedPluginId -notmatch '(?i)^ilystream') {
        throw "Plugin ID '$resolvedPluginId' is not a valid ilyStream plugin identifier."
    }

    $binaryDirectory = $pluginDll.Directory.FullName
    $obsPluginsDirectory = Split-Path -Parent $binaryDirectory
    if ((Split-Path -Leaf $binaryDirectory) -ne '64bit' -or (Split-Path -Leaf $obsPluginsDirectory) -ne 'obs-plugins') {
        throw "Plugin DLL '$($pluginDll.FullName)' is not in obs-plugins\\64bit."
    }
    $packageRoot = Get-IlyFullPath -Path (Split-Path -Parent $obsPluginsDirectory)

    foreach ($packageItem in Get-ChildItem -LiteralPath $packageRoot -Recurse -Force -ErrorAction Stop) {
        if (($packageItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Reparse points are not allowed in plugin packages: '$($packageItem.FullName)'."
        }
    }

    $packageManifestPath = Join-Path $packageRoot 'obs-plugin-package.json'
    $packageManifest = Read-IlyJsonFile -Path $packageManifestPath
    if ($null -ne $packageManifest) {
        if ($null -ne $packageManifest.PSObject.Properties['pluginId'] -and
            -not ([string]$packageManifest.pluginId).Equals($resolvedPluginId, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Package manifest pluginId '$($packageManifest.pluginId)' does not match DLL '$resolvedPluginId'."
        }
        if ([string]::IsNullOrWhiteSpace($Version) -and $null -ne $packageManifest.PSObject.Properties['version']) {
            $Version = [string]$packageManifest.version
        }
    }

    if ([string]::IsNullOrWhiteSpace($Version)) {
        $Version = [string]$pluginDll.VersionInfo.FileVersion
    }
    if ([string]::IsNullOrWhiteSpace($Version)) {
        $Version = 'dev'
    }
    if ($Version -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$') {
        throw "Version '$Version' is not safe for a staging directory name."
    }

    $preferredLayout = Resolve-IlyPluginInstallLayout -Installation $installation -PluginId $resolvedPluginId -PluginLayout $PluginLayout -SharedPluginRoot $SharedPluginRoot
    foreach ($protectedRoot in @($preferredLayout.BinaryRoot, $preferredLayout.DataRoot, $preferredLayout.InstallRoot)) {
        if ((Test-IlyPathWithin -ChildPath $resolvedStageRoot -ParentPath $protectedRoot -AllowEqual) -or
            (Test-IlyPathWithin -ChildPath $protectedRoot -ParentPath $resolvedStageRoot -AllowEqual)) {
            throw "The staging root '$resolvedStageRoot' overlaps the selected $($preferredLayout.Kind) plugin install layout."
        }
    }

    $sourceFiles = New-Object System.Collections.Generic.List[object]
    foreach ($binaryExtension in @('.dll', '.pdb')) {
        $binaryPath = Join-Path $binaryDirectory ($resolvedPluginId + $binaryExtension)
        if (Test-Path -LiteralPath $binaryPath -PathType Leaf) {
            $item = Get-Item -LiteralPath $binaryPath -Force -ErrorAction Stop
            if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "Reparse points are not allowed in plugin packages: '$binaryPath'."
            }
            $relativePath = Get-IlyRelativePath -RootPath $packageRoot -ChildPath $binaryPath
            Assert-IlyPluginRelativePath -RelativePath $relativePath -PluginId $resolvedPluginId
            $sourceFiles.Add([pscustomobject]@{
                RelativePath = $relativePath.Replace('/', '\')
                SourcePath = Get-IlyFullPath -Path $binaryPath
                Sha256 = Get-IlySha256 -Path $binaryPath
                Size = [long]$item.Length
            })
        }
    }

    $dataDirectory = Join-Path $packageRoot (Join-Path 'data\obs-plugins' $resolvedPluginId)
    if (Test-Path -LiteralPath $dataDirectory -PathType Container) {
        foreach ($item in Get-ChildItem -LiteralPath $dataDirectory -File -Recurse -Force -ErrorAction Stop) {
            if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "Reparse points are not allowed in plugin packages: '$($item.FullName)'."
            }
            $relativePath = Get-IlyRelativePath -RootPath $packageRoot -ChildPath $item.FullName
            Assert-IlyPluginRelativePath -RelativePath $relativePath -PluginId $resolvedPluginId
            $sourceFiles.Add([pscustomobject]@{
                RelativePath = $relativePath.Replace('/', '\')
                SourcePath = Get-IlyFullPath -Path $item.FullName
                Sha256 = Get-IlySha256 -Path $item.FullName
                Size = [long]$item.Length
            })
        }
    }

    if (@($sourceFiles | Where-Object { $_.RelativePath -match '(?i)\.dll$' }).Count -ne 1) {
        throw 'The package must contain exactly one staged plugin DLL.'
    }

    $bundleHash = Get-IlyBundleHash -Files $sourceFiles.ToArray()
    $stageDirectoryName = '{0}-{1}-{2}' -f $resolvedPluginId, $Version, $bundleHash.Substring(0, 12)
    $finalStagePath = Get-IlyFullPath -Path (Join-Path $resolvedStageRoot $stageDirectoryName)
    Assert-IlyPathWithin -ChildPath $finalStagePath -ParentPath $resolvedStageRoot -Description 'Plugin stage destination'
    $stageManifestPath = Join-Path $finalStagePath 'ilyStream-stage.json'

    if (Test-Path -LiteralPath $finalStagePath -PathType Container) {
        $existingManifest = Read-IlyJsonFile -Path $stageManifestPath
        $existingStageValid = $null -ne $existingManifest -and [string]$existingManifest.bundleSha256 -eq $bundleHash
        if ($existingStageValid) {
            foreach ($sourceFile in $sourceFiles) {
                $existingFile = Get-IlyFullPath -Path (Join-Path $finalStagePath $sourceFile.RelativePath)
                if (-not (Test-Path -LiteralPath $existingFile -PathType Leaf) -or
                    (Get-IlySha256 -Path $existingFile) -ne $sourceFile.Sha256 -or
                    [long](Get-Item -LiteralPath $existingFile -ErrorAction Stop).Length -ne $sourceFile.Size) {
                    $existingStageValid = $false
                    break
                }
            }
        }
        if ($existingStageValid) {
            [pscustomobject]@{
                Action = 'StagePlugin'
                Planned = $false
                ReusedExistingStage = $true
                PluginId = $resolvedPluginId
                Version = $Version
                BundleSha256 = $bundleHash
                StagePath = $finalStagePath
                PreferredInstallLayout = $preferredLayout.Kind
                PreferredInstallRoot = $preferredLayout.InstallRoot
                ObsFilesChanged = $false
                RestartedObs = $false
            }
            return
        }
        if (-not $Force) {
            throw "Stage destination '$finalStagePath' already exists but does not match this package. Use -Force to quarantine it and restage."
        }
    }

    if (-not $PSCmdlet.ShouldProcess($finalStagePath, "Stage verified ilyStream OBS plugin bundle $bundleHash")) {
        [pscustomobject]@{
            Action = 'StagePlugin'
            Planned = $true
            PluginId = $resolvedPluginId
            Version = $Version
            BundleSha256 = $bundleHash
            StagePath = $finalStagePath
            PreferredInstallLayout = $preferredLayout.Kind
            PreferredInstallRoot = $preferredLayout.InstallRoot
            ObsFilesChanged = $false
            RestartedObs = $false
        }
        return
    }

    if (-not (Test-Path -LiteralPath $resolvedStageRoot -PathType Container)) {
        New-Item -ItemType Directory -Path $resolvedStageRoot -Force -ErrorAction Stop | Out-Null
    }

    if (Test-Path -LiteralPath $finalStagePath -PathType Container) {
        $quarantineRoot = Join-Path $resolvedStageRoot '_superseded'
        if (-not (Test-Path -LiteralPath $quarantineRoot -PathType Container)) {
            New-Item -ItemType Directory -Path $quarantineRoot -Force -ErrorAction Stop | Out-Null
        }
        $quarantinePath = Join-Path $quarantineRoot ($stageDirectoryName + '-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ'))
        Assert-IlyPathWithin -ChildPath $finalStagePath -ParentPath $resolvedStageRoot -Description 'Superseded stage source'
        Assert-IlyPathWithin -ChildPath $quarantinePath -ParentPath $resolvedStageRoot -Description 'Superseded stage destination'
        Move-Item -LiteralPath $finalStagePath -Destination $quarantinePath -ErrorAction Stop
    }

    $partialStagePath = Join-Path $resolvedStageRoot ('.partial-' + [System.Guid]::NewGuid().ToString('N'))
    Assert-IlyPathWithin -ChildPath $partialStagePath -ParentPath $resolvedStageRoot -Description 'Partial stage directory'
    New-Item -ItemType Directory -Path $partialStagePath -Force -ErrorAction Stop | Out-Null

    $manifestFiles = New-Object System.Collections.Generic.List[object]
    foreach ($sourceFile in $sourceFiles) {
        $destination = Get-IlyFullPath -Path (Join-Path $partialStagePath $sourceFile.RelativePath)
        Assert-IlyPathWithin -ChildPath $destination -ParentPath $partialStagePath -Description 'Staged plugin file'
        $copiedHash = Copy-IlyFileVerified -SourcePath $sourceFile.SourcePath -DestinationPath $destination
        if ($copiedHash -ne $sourceFile.Sha256) {
            throw "Staged hash mismatch for '$($sourceFile.RelativePath)'."
        }
        $manifestFiles.Add([ordered]@{
            relativePath = $sourceFile.RelativePath
            sha256 = $sourceFile.Sha256
            size = $sourceFile.Size
        })
    }

    $stageManifest = [ordered]@{
        schemaVersion = 1
        kind = 'ilyStream-obs-plugin-stage'
        pluginId = $resolvedPluginId
        version = $Version
        createdAtUtc = [DateTime]::UtcNow.ToString('o')
        sourcePackage = $resolvedPackagePath
        bundleSha256 = $bundleHash
        target = [ordered]@{
            obsRoot = $installation.Root
            obsExecutable = $installation.Executable
            obsVersion = $installation.Version
            obsOrigin = $installation.Origin
            portable = $installation.IsPortable
            configRoot = $installation.ConfigRoot
            preferredPluginLayout = [ordered]@{
                kind = $preferredLayout.Kind
                installRoot = $preferredLayout.InstallRoot
                sharedPluginRoot = $preferredLayout.SharedPluginRoot
                binaryRoot = $preferredLayout.BinaryRoot
                dataRoot = $preferredLayout.DataRoot
            }
        }
        files = $manifestFiles.ToArray()
        safety = [ordered]@{
            stageOnly = $true
            obsFilesChanged = $false
            obsWasRestarted = $false
        }
    }
    Write-IlyJsonAtomic -Value $stageManifest -Path (Join-Path $partialStagePath 'ilyStream-stage.json')
    Move-Item -LiteralPath $partialStagePath -Destination $finalStagePath -ErrorAction Stop
    $partialStagePath = $null

    $writtenManifest = Read-IlyJsonFile -Path $stageManifestPath
    if ($null -eq $writtenManifest -or [string]$writtenManifest.bundleSha256 -ne $bundleHash) {
        throw 'Staged manifest failed final verification.'
    }

    [pscustomobject]@{
        Action = 'StagePlugin'
        Planned = $false
        ReusedExistingStage = $false
        PluginId = $resolvedPluginId
        Version = $Version
        BundleSha256 = $bundleHash
        StagePath = $finalStagePath
        PreferredInstallLayout = $preferredLayout.Kind
        PreferredInstallRoot = $preferredLayout.InstallRoot
        ObsFilesChanged = $false
        RestartedObs = $false
    }
}
finally {
    if ($null -ne $partialStagePath -and (Test-Path -LiteralPath $partialStagePath -PathType Container)) {
        if (-not (Test-IlyPathWithin -ChildPath $partialStagePath -ParentPath $resolvedStageRoot) -or
            (Split-Path -Leaf $partialStagePath) -notlike '.partial-*') {
            throw "Refusing to remove unverified partial stage path '$partialStagePath'."
        }
        Remove-Item -LiteralPath $partialStagePath -Recurse -Force -ErrorAction SilentlyContinue
    }
    if ($null -ne $temporaryExtractionRoot -and (Test-Path -LiteralPath $temporaryExtractionRoot -PathType Container)) {
        $systemTempRoot = Get-IlyFullPath -Path ([System.IO.Path]::GetTempPath())
        if (-not (Test-IlyPathWithin -ChildPath $temporaryExtractionRoot -ParentPath $systemTempRoot) -or
            (Split-Path -Leaf $temporaryExtractionRoot) -notlike 'ilystream-obs-stage-*') {
            throw "Refusing to remove unverified extraction path '$temporaryExtractionRoot'."
        }
        Remove-Item -LiteralPath $temporaryExtractionRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
