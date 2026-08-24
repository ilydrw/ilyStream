Set-StrictMode -Version 2.0

$script:IlyObsThemeFileName = 'ilyStream_Cyber_Neon.ovt'
$script:IlyObsThemeId = 'com.ilystream.obs.cyber-neon'
$script:IlyObsStateDirectoryName = 'ilyStream\obs-integration'

function Get-IlyFullPath {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string] $Path
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw 'A non-empty path is required.'
    }

    if (Test-Path -LiteralPath $Path) {
        return (Resolve-Path -LiteralPath $Path -ErrorAction Stop).ProviderPath
    }

    return [System.IO.Path]::GetFullPath($Path)
}

function Test-IlyPathWithin {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string] $ChildPath,

        [Parameter(Mandatory = $true)]
        [string] $ParentPath,

        [switch] $AllowEqual
    )

    $child = (Get-IlyFullPath -Path $ChildPath).TrimEnd([char[]]@('\', '/'))
    $parent = (Get-IlyFullPath -Path $ParentPath).TrimEnd([char[]]@('\', '/'))

    if ($AllowEqual -and $child.Equals($parent, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $true
    }

    $prefix = $parent + [System.IO.Path]::DirectorySeparatorChar
    return $child.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)
}

function Assert-IlyPathWithin {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string] $ChildPath,

        [Parameter(Mandatory = $true)]
        [string] $ParentPath,

        [string] $Description = 'Path'
    )

    if (-not (Test-IlyPathWithin -ChildPath $ChildPath -ParentPath $ParentPath -AllowEqual)) {
        throw "$Description resolves outside its allowed root. Path: '$ChildPath'. Root: '$ParentPath'."
    }
}

function Get-IlyRelativePath {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string] $RootPath,

        [Parameter(Mandatory = $true)]
        [string] $ChildPath
    )

    $root = (Get-IlyFullPath -Path $RootPath).TrimEnd([char[]]@('\', '/'))
    $child = Get-IlyFullPath -Path $ChildPath
    Assert-IlyPathWithin -ChildPath $child -ParentPath $root -Description 'Child path'
    return $child.Substring($root.Length).TrimStart([char[]]@('\', '/'))
}

function Assert-IlySafeRelativePath {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string] $RelativePath
    )

    if ([string]::IsNullOrWhiteSpace($RelativePath) -or
        [System.IO.Path]::IsPathRooted($RelativePath) -or
        $RelativePath.Contains(':')) {
        throw "Unsafe relative path '$RelativePath'."
    }

    $segments = $RelativePath.Replace('/', '\').Split([char]'\')
    if ($segments -contains '..' -or $segments -contains '.') {
        throw "Relative path traversal is not allowed: '$RelativePath'."
    }
}

function Get-IlySha256 {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string] $Path
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Cannot hash missing file '$Path'."
    }

    # Get-FileHash can inherit a caller's global -WhatIf preference under
    # Windows PowerShell 5.1 and return no Hash value. Hash directly through
    # .NET so dry-run validation stays read-only and deterministic.
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead((Get-IlyFullPath -Path $Path))
    try {
        return ([System.BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $stream.Dispose()
        $algorithm.Dispose()
    }
}

function Get-IlyStringSha256 {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string] $Text
    )

    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
        return ([System.BitConverter]::ToString($algorithm.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $algorithm.Dispose()
    }
}

function Copy-IlyFileVerified {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string] $SourcePath,

        [Parameter(Mandatory = $true)]
        [string] $DestinationPath
    )

    $source = Get-IlyFullPath -Path $SourcePath
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Source file does not exist: '$source'."
    }

    $destination = Get-IlyFullPath -Path $DestinationPath
    $destinationDirectory = Split-Path -Parent $destination
    if (-not (Test-Path -LiteralPath $destinationDirectory -PathType Container)) {
        New-Item -ItemType Directory -Path $destinationDirectory -Force -ErrorAction Stop | Out-Null
    }

    $sourceHash = Get-IlySha256 -Path $source
    $temporaryPath = Join-Path $destinationDirectory ('.i-' + [System.Guid]::NewGuid().ToString('N') + '.tmp')
    $replacementBackup = Join-Path $destinationDirectory ('.i-' + [System.Guid]::NewGuid().ToString('N') + '.bak')

    try {
        Copy-Item -LiteralPath $source -Destination $temporaryPath -Force -ErrorAction Stop
        $temporaryHash = Get-IlySha256 -Path $temporaryPath
        if ($temporaryHash -ne $sourceHash) {
            throw "Hash verification failed while copying '$source'."
        }

        if (Test-Path -LiteralPath $destination -PathType Leaf) {
            [System.IO.File]::Replace($temporaryPath, $destination, $replacementBackup, $true)
            Remove-Item -LiteralPath $replacementBackup -Force -ErrorAction Stop
        }
        else {
            [System.IO.File]::Move($temporaryPath, $destination)
        }

        $installedHash = Get-IlySha256 -Path $destination
        if ($installedHash -ne $sourceHash) {
            throw "Hash verification failed after installing '$destination'."
        }

        return $installedHash
    }
    finally {
        if (Test-Path -LiteralPath $temporaryPath -PathType Leaf) {
            Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path -LiteralPath $replacementBackup -PathType Leaf) {
            Remove-Item -LiteralPath $replacementBackup -Force -ErrorAction SilentlyContinue
        }
    }
}

function Write-IlyJsonAtomic {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [object] $Value,

        [Parameter(Mandatory = $true)]
        [string] $Path
    )

    $destination = Get-IlyFullPath -Path $Path
    $destinationDirectory = Split-Path -Parent $destination
    if (-not (Test-Path -LiteralPath $destinationDirectory -PathType Container)) {
        New-Item -ItemType Directory -Path $destinationDirectory -Force -ErrorAction Stop | Out-Null
    }

    $temporaryPath = Join-Path $destinationDirectory ('.i-' + [System.Guid]::NewGuid().ToString('N') + '.tmp')
    $replacementBackup = Join-Path $destinationDirectory ('.i-' + [System.Guid]::NewGuid().ToString('N') + '.bak')
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)

    try {
        $json = $Value | ConvertTo-Json -Depth 12
        [System.IO.File]::WriteAllText($temporaryPath, $json + [Environment]::NewLine, $utf8WithoutBom)
        $null = Get-Content -LiteralPath $temporaryPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop

        if (Test-Path -LiteralPath $destination -PathType Leaf) {
            [System.IO.File]::Replace($temporaryPath, $destination, $replacementBackup, $true)
            Remove-Item -LiteralPath $replacementBackup -Force -ErrorAction Stop
        }
        else {
            [System.IO.File]::Move($temporaryPath, $destination)
        }
    }
    finally {
        if (Test-Path -LiteralPath $temporaryPath -PathType Leaf) {
            Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path -LiteralPath $replacementBackup -PathType Leaf) {
            Remove-Item -LiteralPath $replacementBackup -Force -ErrorAction SilentlyContinue
        }
    }
}

function Read-IlyJsonFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string] $Path
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $null
    }

    return Get-Content -LiteralPath $Path -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
}

function Get-IlyObsProcessInfo {
    [CmdletBinding()]
    param()

    $commandLines = @{}
    try {
        $cimProcesses = @(Get-CimInstance Win32_Process -Filter "Name = 'obs64.exe' OR Name = 'obs32.exe'" -ErrorAction Stop)
        foreach ($cimProcess in $cimProcesses) {
            $commandLines[[int]$cimProcess.ProcessId] = [string]$cimProcess.CommandLine
        }
    }
    catch {
        # Process paths from Get-Process are still enough in the normal case.
    }

    foreach ($process in @(Get-Process -Name obs64, obs32 -ErrorAction SilentlyContinue)) {
        $processPath = $null
        try {
            $processPath = $process.Path
        }
        catch {
            $processPath = $null
        }

        [pscustomobject]@{
            Id = $process.Id
            Name = $process.ProcessName
            Path = $processPath
            CommandLine = if ($commandLines.ContainsKey([int]$process.Id)) { $commandLines[[int]$process.Id] } else { $null }
        }
    }
}

function Resolve-IlyObsCandidate {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string] $CandidatePath,

        [Parameter(Mandatory = $true)]
        [string] $Origin,

        [switch] $PortableHint
    )

    if ([string]::IsNullOrWhiteSpace($CandidatePath)) {
        return $null
    }

    $candidate = Get-IlyFullPath -Path $CandidatePath
    $rootCandidates = New-Object System.Collections.Generic.List[string]

    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
        $file = Get-Item -LiteralPath $candidate -ErrorAction Stop
        if ($file.Name -notin @('obs64.exe', 'obs32.exe')) {
            return $null
        }

        $rootCandidates.Add($file.Directory.FullName)
        if ($null -ne $file.Directory.Parent) {
            $rootCandidates.Add($file.Directory.Parent.FullName)
            if ($null -ne $file.Directory.Parent.Parent) {
                $rootCandidates.Add($file.Directory.Parent.Parent.FullName)
            }
        }
    }
    else {
        $rootCandidates.Add($candidate)
    }

    foreach ($rootCandidate in @($rootCandidates | Select-Object -Unique)) {
        $executables = @(
            (Join-Path $rootCandidate 'bin\64bit\obs64.exe'),
            (Join-Path $rootCandidate 'bin\32bit\obs32.exe'),
            (Join-Path $rootCandidate 'obs64.exe'),
            (Join-Path $rootCandidate 'obs32.exe')
        )

        foreach ($executable in $executables) {
            if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
                continue
            }

            $resolvedExecutable = Get-IlyFullPath -Path $executable
            $resolvedRoot = Get-IlyFullPath -Path $rootCandidate
            $baseTheme = Join-Path $resolvedRoot 'data\obs-studio\themes\Yami.obt'
            if (-not (Test-Path -LiteralPath $baseTheme -PathType Leaf)) {
                continue
            }

            $portableMarkers = @(
                (Join-Path $resolvedRoot 'portable_mode'),
                (Join-Path $resolvedRoot 'portable_mode.txt'),
                (Join-Path (Split-Path -Parent $resolvedExecutable) 'portable_mode'),
                (Join-Path (Split-Path -Parent $resolvedExecutable) 'portable_mode.txt')
            )
            $isPortable = $PortableHint.IsPresent -or (@($portableMarkers | Where-Object { Test-Path -LiteralPath $_ }).Count -gt 0)
            $version = $null
            try {
                $version = (Get-Item -LiteralPath $resolvedExecutable -ErrorAction Stop).VersionInfo.ProductVersion
            }
            catch {
                $version = $null
            }

            return [pscustomobject]@{
                Origin = $Origin
                Root = $resolvedRoot
                Executable = $resolvedExecutable
                BaseTheme = Get-IlyFullPath -Path $baseTheme
                Version = $version
                IsPortable = [bool]$isPortable
            }
        }
    }

    return $null
}

function Get-IlySteamRoots {
    [CmdletBinding()]
    param()

    $steamRoots = New-Object System.Collections.Generic.List[string]
    if (-not [string]::IsNullOrWhiteSpace(${env:ProgramFiles(x86)})) {
        $steamRoots.Add((Join-Path ${env:ProgramFiles(x86)} 'Steam'))
    }

    try {
        $steamRegistry = Get-ItemProperty -LiteralPath 'HKCU:\Software\Valve\Steam' -ErrorAction Stop
        foreach ($propertyName in @('SteamPath', 'SteamExe')) {
            $property = $steamRegistry.PSObject.Properties[$propertyName]
            if ($null -eq $property) {
                continue
            }
            $value = [string]$property.Value
            if (-not [string]::IsNullOrWhiteSpace($value)) {
                if ($propertyName -eq 'SteamExe') {
                    $value = Split-Path -Parent $value
                }
                $steamRoots.Add($value.Replace('/', '\'))
            }
        }
    }
    catch {
        # Steam is optional.
    }

    $libraryRoots = New-Object System.Collections.Generic.List[string]
    foreach ($steamRoot in @($steamRoots | Select-Object -Unique)) {
        if (-not (Test-Path -LiteralPath $steamRoot -PathType Container)) {
            continue
        }

        $libraryRoots.Add((Get-IlyFullPath -Path $steamRoot))
        $libraryFile = Join-Path $steamRoot 'steamapps\libraryfolders.vdf'
        if (Test-Path -LiteralPath $libraryFile -PathType Leaf) {
            foreach ($line in Get-Content -LiteralPath $libraryFile -ErrorAction SilentlyContinue) {
                if ($line -match '"path"\s+"([^"]+)"') {
                    $libraryRoots.Add($matches[1].Replace('\\', '\'))
                }
            }
        }
    }

    foreach ($libraryRoot in @($libraryRoots | Select-Object -Unique)) {
        Join-Path $libraryRoot 'steamapps\common\OBS Studio'
        Join-Path $libraryRoot 'steamapps\common\obs-studio'
    }
}

function Get-IlyObsInstallations {
    [CmdletBinding()]
    param(
        [string] $ObsRoot
    )

    if (-not [string]::IsNullOrWhiteSpace($ObsRoot)) {
        $custom = Resolve-IlyObsCandidate -CandidatePath $ObsRoot -Origin 'Custom'
        if ($null -eq $custom) {
            throw "Custom OBS root '$ObsRoot' does not contain an OBS executable and data\\obs-studio\\themes\\Yami.obt."
        }
        return @($custom)
    }

    $found = New-Object System.Collections.Generic.List[object]
    $processes = @(Get-IlyObsProcessInfo)
    foreach ($process in $processes) {
        if ([string]::IsNullOrWhiteSpace([string]$process.Path)) {
            continue
        }

        $portableHint = -not [string]::IsNullOrWhiteSpace([string]$process.CommandLine) -and
            ([string]$process.CommandLine -match '(?i)(?:^|\s)--portable(?:\s|$)')
        $runningCandidate = Resolve-IlyObsCandidate -CandidatePath $process.Path -Origin 'Running' -PortableHint:$portableHint
        if ($null -ne $runningCandidate) {
            $found.Add($runningCandidate)
        }
    }

    foreach ($standardRoot in @(
        $(if (-not [string]::IsNullOrWhiteSpace($env:ProgramFiles)) { Join-Path $env:ProgramFiles 'obs-studio' }),
        $(if (-not [string]::IsNullOrWhiteSpace(${env:ProgramFiles(x86)})) { Join-Path ${env:ProgramFiles(x86)} 'obs-studio' })
    )) {
        if ([string]::IsNullOrWhiteSpace([string]$standardRoot)) {
            continue
        }
        $standardCandidate = Resolve-IlyObsCandidate -CandidatePath $standardRoot -Origin 'Standard'
        if ($null -ne $standardCandidate) {
            $found.Add($standardCandidate)
        }
    }

    foreach ($steamRoot in @(Get-IlySteamRoots)) {
        $steamCandidate = Resolve-IlyObsCandidate -CandidatePath $steamRoot -Origin 'Steam'
        if ($null -ne $steamCandidate) {
            $found.Add($steamCandidate)
        }
    }

    $uninstallRegistryRoots = @(
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    foreach ($registryRoot in $uninstallRegistryRoots) {
        foreach ($entry in @(Get-ItemProperty -Path $registryRoot -ErrorAction SilentlyContinue | Where-Object {
            $null -ne $_.PSObject.Properties['DisplayName'] -and [string]$_.DisplayName -like 'OBS Studio*'
        })) {
            if ($null -eq $entry.PSObject.Properties['InstallLocation'] -or
                [string]::IsNullOrWhiteSpace([string]$entry.InstallLocation)) {
                continue
            }
            $registryCandidate = Resolve-IlyObsCandidate -CandidatePath ([string]$entry.InstallLocation) -Origin 'Registry'
            if ($null -ne $registryCandidate) {
                $found.Add($registryCandidate)
            }
        }
    }

    $priority = @{ Running = 0; Standard = 1; Steam = 2; Registry = 3 }
    $deduplicated = @{}
    foreach ($candidate in $found) {
        $key = $candidate.Executable.ToLowerInvariant()
        if (-not $deduplicated.ContainsKey($key) -or $priority[$candidate.Origin] -lt $priority[$deduplicated[$key].Origin]) {
            $deduplicated[$key] = $candidate
        }
    }

    return @($deduplicated.Values | Sort-Object @{ Expression = { $priority[$_.Origin] } }, Root)
}

function Select-IlyObsInstallation {
    [CmdletBinding()]
    param(
        [string] $ObsRoot,
        [string] $ObsConfigRoot
    )

    $installations = @(Get-IlyObsInstallations -ObsRoot $ObsRoot)
    if ($installations.Count -eq 0) {
        throw 'No supported OBS installation was found. Pass -ObsRoot for a custom or portable installation.'
    }

    $selected = $installations[0]
    $configRoot = $null
    if (-not [string]::IsNullOrWhiteSpace($ObsConfigRoot)) {
        $configRoot = Get-IlyFullPath -Path $ObsConfigRoot
    }
    elseif ($selected.IsPortable) {
        $configRoot = Join-Path $selected.Root 'config\obs-studio'
    }
    elseif (-not [string]::IsNullOrWhiteSpace($env:APPDATA)) {
        $configRoot = Join-Path $env:APPDATA 'obs-studio'
    }
    else {
        throw 'APPDATA is unavailable. Pass -ObsConfigRoot explicitly.'
    }

    [pscustomobject]@{
        Origin = $selected.Origin
        Root = $selected.Root
        Executable = $selected.Executable
        BaseTheme = $selected.BaseTheme
        Version = $selected.Version
        IsPortable = $selected.IsPortable
        ConfigRoot = Get-IlyFullPath -Path $configRoot
        ThemeDirectory = Get-IlyFullPath -Path (Join-Path $configRoot 'themes')
        StateDirectory = Get-IlyFullPath -Path (Join-Path $configRoot $script:IlyObsStateDirectoryName)
    }
}

function Assert-IlyObsNotRunning {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string] $ObsRoot
    )

    $matching = New-Object System.Collections.Generic.List[object]
    foreach ($process in @(Get-IlyObsProcessInfo)) {
        if ([string]::IsNullOrWhiteSpace([string]$process.Path)) {
            $matching.Add($process)
            continue
        }

        if (Test-IlyPathWithin -ChildPath $process.Path -ParentPath $ObsRoot) {
            $matching.Add($process)
        }
    }

    if ($matching.Count -gt 0) {
        $processSummary = ($matching | ForEach-Object { "PID $($_.Id) ($($_.Name))" }) -join ', '
        throw "OBS is running from, or cannot be distinguished from, the target installation ($processSummary). Close OBS yourself and run the command again. ilyStream will never stop or restart OBS."
    }
}

function Assert-IlyThemeSource {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string] $Path
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Theme source is missing: '$Path'."
    }

    $content = Get-Content -LiteralPath $Path -Raw -ErrorAction Stop
    if ($content -notmatch [regex]::Escape("id: '$script:IlyObsThemeId';") -or
        $content -notmatch [regex]::Escape("extends: 'com.obsproject.Yami';")) {
        throw "Theme source '$Path' does not have the expected ilyStream ID and Yami base."
    }

    $selectorContent = [regex]::Replace($content, '/\*[\s\S]*?\*/', '')
    if ($selectorContent -match '(?i)QWebEngineView|CefWidget|StreamElements') {
        throw "Theme source '$Path' contains a prohibited browser-dock selector."
    }
}

function Assert-IlyPluginRelativePath {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string] $RelativePath,

        [Parameter(Mandatory = $true)]
        [string] $PluginId
    )

    Assert-IlySafeRelativePath -RelativePath $RelativePath
    $normalized = $RelativePath.Replace('/', '\')
    $escapedPluginId = [regex]::Escape($PluginId)
    $binaryPattern = '^obs-plugins\\64bit\\' + $escapedPluginId + '\.(?:dll|pdb)$'
    $dataPattern = '^data\\obs-plugins\\' + $escapedPluginId + '\\.+$'
    if ($normalized -notmatch $binaryPattern -and $normalized -notmatch $dataPattern) {
        throw "Plugin package path '$RelativePath' is outside the allowed binary/data layout for '$PluginId'."
    }
}

function Test-IlyObsRootUsesSharedPlugins {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [object] $Installation
    )

    if ([bool]$Installation.IsPortable) {
        return $false
    }

    $knownRoots = New-Object System.Collections.Generic.List[string]
    if (-not [string]::IsNullOrWhiteSpace($env:ProgramFiles)) {
        $knownRoots.Add((Join-Path $env:ProgramFiles 'obs-studio'))
    }
    if (-not [string]::IsNullOrWhiteSpace(${env:ProgramFiles(x86)})) {
        $knownRoots.Add((Join-Path ${env:ProgramFiles(x86)} 'obs-studio'))
    }
    foreach ($steamRoot in @(Get-IlySteamRoots)) {
        $knownRoots.Add($steamRoot)
    }

    foreach ($knownRoot in @($knownRoots | Select-Object -Unique)) {
        if ((Get-IlyFullPath -Path $knownRoot).Equals([string]$Installation.Root, [System.StringComparison]::OrdinalIgnoreCase)) {
            return $true
        }
    }

    return [string]$Installation.Origin -in @('Standard', 'Steam', 'Registry')
}

function Resolve-IlyPluginInstallLayout {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [object] $Installation,

        [Parameter(Mandatory = $true)]
        [string] $PluginId,

        [ValidateSet('Auto', 'ProgramData', 'ObsRoot')]
        [string] $PluginLayout = 'Auto',

        [string] $SharedPluginRoot
    )

    if ($PluginId -notmatch '^[A-Za-z0-9._-]+$' -or $PluginId -notmatch '(?i)^ilystream') {
        throw "Plugin ID '$PluginId' is not a valid ilyStream plugin identifier."
    }

    $resolvedLayout = $PluginLayout
    if ($resolvedLayout -eq 'Auto') {
        $resolvedLayout = if (Test-IlyObsRootUsesSharedPlugins -Installation $Installation) { 'ProgramData' } else { 'ObsRoot' }
    }

    if ($resolvedLayout -eq 'ProgramData') {
        if ([string]::IsNullOrWhiteSpace($SharedPluginRoot)) {
            if ([string]::IsNullOrWhiteSpace($env:ProgramData)) {
                throw 'ProgramData is unavailable. Pass -SharedPluginRoot explicitly.'
            }
            $SharedPluginRoot = Join-Path $env:ProgramData 'obs-studio\plugins'
        }

        $sharedRoot = Get-IlyFullPath -Path $SharedPluginRoot
        $pluginRoot = Get-IlyFullPath -Path (Join-Path $sharedRoot $PluginId)
        Assert-IlyPathWithin -ChildPath $pluginRoot -ParentPath $sharedRoot -Description 'ProgramData plugin root'
        return [pscustomobject]@{
            Kind = 'ProgramData'
            InstallRoot = $pluginRoot
            SharedPluginRoot = $sharedRoot
            BinaryRoot = Get-IlyFullPath -Path (Join-Path $pluginRoot 'bin\64bit')
            DataRoot = Get-IlyFullPath -Path (Join-Path $pluginRoot 'data')
            ObsRoot = [string]$Installation.Root
        }
    }

    $obsInstallRoot = Get-IlyFullPath -Path ([string]$Installation.Root)
    return [pscustomobject]@{
        Kind = 'ObsRoot'
        InstallRoot = $obsInstallRoot
        SharedPluginRoot = $null
        BinaryRoot = Get-IlyFullPath -Path (Join-Path $obsInstallRoot 'obs-plugins\64bit')
        DataRoot = Get-IlyFullPath -Path (Join-Path $obsInstallRoot (Join-Path 'data\obs-plugins' $PluginId))
        ObsRoot = $obsInstallRoot
    }
}

function Resolve-IlyPluginDestination {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string] $PackageRelativePath,

        [Parameter(Mandatory = $true)]
        [string] $PluginId,

        [Parameter(Mandatory = $true)]
        [object] $Layout
    )

    Assert-IlyPluginRelativePath -RelativePath $PackageRelativePath -PluginId $PluginId
    $normalized = $PackageRelativePath.Replace('/', '\')
    $binaryPrefix = 'obs-plugins\64bit\'
    $dataPrefix = 'data\obs-plugins\' + $PluginId + '\'
    $destinationKind = $null
    $installRelativePath = $null
    $destinationPath = $null
    $allowedRoot = $null

    if ($normalized.StartsWith($binaryPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        $fileName = $normalized.Substring($binaryPrefix.Length)
        $installRelativePath = if ([string]$Layout.Kind -eq 'ProgramData') { Join-Path 'bin\64bit' $fileName } else { $normalized }
        $destinationPath = Get-IlyFullPath -Path (Join-Path ([string]$Layout.BinaryRoot) $fileName)
        $allowedRoot = [string]$Layout.BinaryRoot
        $destinationKind = 'binary'
    }
    elseif ($normalized.StartsWith($dataPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        $dataRelativePath = $normalized.Substring($dataPrefix.Length)
        Assert-IlySafeRelativePath -RelativePath $dataRelativePath
        $installRelativePath = if ([string]$Layout.Kind -eq 'ProgramData') { Join-Path 'data' $dataRelativePath } else { $normalized }
        $destinationPath = Get-IlyFullPath -Path (Join-Path ([string]$Layout.DataRoot) $dataRelativePath)
        $allowedRoot = [string]$Layout.DataRoot
        $destinationKind = 'data'
    }
    else {
        throw "Unsupported package-relative plugin path '$PackageRelativePath'."
    }

    Assert-IlyPathWithin -ChildPath $destinationPath -ParentPath $allowedRoot -Description 'OBS plugin destination'
    [pscustomobject]@{
        PackageRelativePath = $normalized
        InstallRelativePath = $installRelativePath.Replace('/', '\')
        DestinationPath = $destinationPath
        DestinationKind = $destinationKind
    }
}

function Get-IlyBundleHash {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [object[]] $Files
    )

    $lines = foreach ($file in @($Files | Sort-Object RelativePath)) {
        '{0}|{1}|{2}' -f ([string]$file.RelativePath).Replace('/', '\').ToLowerInvariant(), ([string]$file.Sha256).ToLowerInvariant(), [long]$file.Size
    }
    return Get-IlyStringSha256 -Text (($lines -join "`n") + "`n")
}
