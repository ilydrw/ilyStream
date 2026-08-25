[CmdletBinding()]
param(
    [ValidateSet('Debug', 'Release', 'RelWithDebInfo')]
    [string]$Configuration = 'RelWithDebInfo',
    [string]$BuildDirectory,
    [string]$SdkPrefix,
    [string]$QtPrefix,
    [string]$ObsDepsPrefix,
    [switch]$SkipDependencyBootstrap,
    [switch]$SkipTests,
    [switch]$SkipPackage
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if ([string]::IsNullOrWhiteSpace($BuildDirectory)) {
    $BuildDirectory = Join-Path $projectRoot 'build'
}
$BuildDirectory = [System.IO.Path]::GetFullPath($BuildDirectory)

$depsRoot = Join-Path $projectRoot '.deps'
$downloadsRoot = Join-Path $depsRoot 'downloads'
$buildspec = Get-Content -LiteralPath (Join-Path $projectRoot 'buildspec.json') -Raw | ConvertFrom-Json

function Get-CMakeExecutable {
    $command = Get-Command cmake.exe -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $bundled = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe'
    if (Test-Path -LiteralPath $bundled -PathType Leaf) {
        return $bundled
    }

    throw 'CMake 3.28 or newer was not found. Install CMake or the Visual Studio CMake component.'
}

function Invoke-CMake {
    param([Parameter(Mandatory)][string[]]$Arguments)

    & $script:cmake @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "CMake failed with exit code $LASTEXITCODE."
    }
}

function Get-Sha256Hash {
    param(
        [Parameter(Mandatory)][string]$Path
    )

    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        try {
            $hashBytes = $sha256.ComputeHash($stream)
            return ([System.BitConverter]::ToString($hashBytes) -replace '-', '').ToLowerInvariant()
        }
        finally {
            $sha256.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }
}

function Get-VerifiedDownload {
    param(
        [Parameter(Mandatory)][string]$Uri,
        [Parameter(Mandatory)][string]$Destination,
        [Parameter(Mandatory)][string]$ExpectedHash
    )

    $expectedHashNormalized = $ExpectedHash.ToLowerInvariant()

    if (Test-Path -LiteralPath $Destination -PathType Leaf) {
        $actualHash = Get-Sha256Hash -Path $Destination
        if ($actualHash -eq $expectedHashNormalized) {
            Write-Host "Using verified download: $Destination"
            return
        }

        Write-Host "Cached download failed SHA-256 verification; downloading a fresh copy."
        Remove-Item -LiteralPath $Destination -Force
    }

    Write-Host "Downloading $Uri"
    Invoke-WebRequest -Uri $Uri -OutFile $Destination

    $actualHash = Get-Sha256Hash -Path $Destination
    if ($actualHash -ne $expectedHashNormalized) {
        Remove-Item -LiteralPath $Destination -Force
        throw "SHA-256 mismatch for $Uri. Expected $ExpectedHash, received $actualHash."
    }
}

function Assert-DependencyChildPath {
    param([Parameter(Mandatory)][string]$Path)

    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $fullRoot = [System.IO.Path]::GetFullPath($depsRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    if (-not $fullPath.StartsWith($fullRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to modify a dependency path outside $depsRoot`: $fullPath"
    }
}

function Expand-DependencyArchive {
    param(
        [Parameter(Mandatory)][string]$Archive,
        [Parameter(Mandatory)][string]$Destination,
        [Parameter(Mandatory)][string]$ExpectedHash,
        [switch]$ArchiveContainsDestination
    )

    Assert-DependencyChildPath -Path $Destination
    $marker = Join-Path $Destination '.ilystream-dependency.sha256'
    if ((Test-Path -LiteralPath $marker -PathType Leaf) -and
        ((Get-Content -LiteralPath $marker -Raw).Trim() -eq $ExpectedHash.ToLowerInvariant())) {
        return
    }

    if (Test-Path -LiteralPath $Destination) {
        Remove-Item -LiteralPath $Destination -Recurse -Force
    }

    if ($ArchiveContainsDestination) {
        Expand-Archive -LiteralPath $Archive -DestinationPath (Split-Path -Parent $Destination) -Force
    } else {
        New-Item -ItemType Directory -Path $Destination -Force | Out-Null
        Expand-Archive -LiteralPath $Archive -DestinationPath $Destination -Force
    }

    if (-not (Test-Path -LiteralPath $Destination -PathType Container)) {
        throw "Archive did not create expected directory: $Destination"
    }
    Set-Content -LiteralPath $marker -Value $ExpectedHash.ToLowerInvariant() -Encoding ascii
}

function Resolve-DependencyLayout {
    $obs = $buildspec.dependencies.'obs-studio'
    $prebuilt = $buildspec.dependencies.prebuilt
    $qt = $buildspec.dependencies.qt6

    $obsVersion = [string]$obs.version
    $prebuiltVersion = [string]$prebuilt.version
    $qtVersion = [string]$qt.version
    $obsArchiveName = "$obsVersion.zip"
    $prebuiltArchiveName = "windows-deps-$prebuiltVersion-x64.zip"
    $qtArchiveName = "windows-deps-qt6-$qtVersion-x64.zip"

    $layout = [PSCustomObject]@{
        ObsSource = Join-Path $depsRoot "obs-studio-$obsVersion"
        ObsBuild = Join-Path $depsRoot "obs-studio-$obsVersion-build-x64"
        Sdk = Join-Path $depsRoot "obs-sdk-$obsVersion-x64"
        Prebuilt = Join-Path $depsRoot "obs-deps-$prebuiltVersion-x64"
        Qt = Join-Path $depsRoot "obs-deps-qt6-$qtVersion-x64"
    }

    if (-not $SkipDependencyBootstrap) {
        New-Item -ItemType Directory -Path $downloadsRoot -Force | Out-Null

        $obsArchive = Join-Path $downloadsRoot $obsArchiveName
        $prebuiltArchive = Join-Path $downloadsRoot $prebuiltArchiveName
        $qtArchive = Join-Path $downloadsRoot $qtArchiveName

        Get-VerifiedDownload -Uri "$($obs.baseUrl)/$obsArchiveName" -Destination $obsArchive -ExpectedHash $obs.hashes.'windows-x64'
        Get-VerifiedDownload -Uri "$($prebuilt.baseUrl)/$prebuiltVersion/$prebuiltArchiveName" -Destination $prebuiltArchive -ExpectedHash $prebuilt.hashes.'windows-x64'
        Get-VerifiedDownload -Uri "$($qt.baseUrl)/$qtVersion/$qtArchiveName" -Destination $qtArchive -ExpectedHash $qt.hashes.'windows-x64'

        Expand-DependencyArchive -Archive $obsArchive -Destination $layout.ObsSource -ExpectedHash $obs.hashes.'windows-x64' -ArchiveContainsDestination
        Expand-DependencyArchive -Archive $prebuiltArchive -Destination $layout.Prebuilt -ExpectedHash $prebuilt.hashes.'windows-x64'
        Expand-DependencyArchive -Archive $qtArchive -Destination $layout.Qt -ExpectedHash $qt.hashes.'windows-x64'
    }

    return $layout
}

$cmake = Get-CMakeExecutable
$cmakeVersion = (& $cmake --version | Select-Object -First 1)
Write-Host "Using $cmakeVersion"

$layout = Resolve-DependencyLayout
if (-not [string]::IsNullOrWhiteSpace($SdkPrefix)) {
    $layout.Sdk = [System.IO.Path]::GetFullPath($SdkPrefix)
}
if (-not [string]::IsNullOrWhiteSpace($QtPrefix)) {
    $layout.Qt = [System.IO.Path]::GetFullPath($QtPrefix)
}
if (-not [string]::IsNullOrWhiteSpace($ObsDepsPrefix)) {
    $layout.Prebuilt = [System.IO.Path]::GetFullPath($ObsDepsPrefix)
}

$libobsConfigs = @(
    (Join-Path $layout.Sdk 'cmake\libobsConfig.cmake'),
    (Join-Path $layout.Sdk 'lib\cmake\libobs\libobsConfig.cmake')
)
$frontendConfigs = @(
    (Join-Path $layout.Sdk 'cmake\obs-frontend-apiConfig.cmake'),
    (Join-Path $layout.Sdk 'lib\cmake\obs-frontend-api\obs-frontend-apiConfig.cmake')
)
$hasLibobs = [bool]($libobsConfigs | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1)
$hasFrontendApi = [bool]($frontendConfigs | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1)
if (-not ($hasLibobs -and $hasFrontendApi)) {
    if ($SkipDependencyBootstrap) {
        throw "The supplied SDK prefix does not contain libobs and obs-frontend-api CMake packages: $($layout.Sdk)"
    }

    Write-Host 'Configuring the pinned OBS development SDK (the installed OBS application is not modified)...'
    $dependencyPrefix = "$($layout.Prebuilt);$($layout.Qt)"
    Invoke-CMake -Arguments @(
        '-S', $layout.ObsSource,
        '-B', $layout.ObsBuild,
        '-G', 'Visual Studio 17 2022',
        '-A', 'x64,version=10.0.26100.0',
        '-DOBS_CMAKE_VERSION:STRING=3.0.0',
        '-DOBS_VERSION_OVERRIDE:STRING=32.2.2',
        '-DENABLE_PLUGINS:BOOL=OFF',
        '-DENABLE_FRONTEND:BOOL=OFF',
        "-DCMAKE_PREFIX_PATH:PATH=$dependencyPrefix"
    )
    Invoke-CMake -Arguments @('--build', $layout.ObsBuild, '--target', 'obs-frontend-api', '--config', 'Release', '--parallel')
    Invoke-CMake -Arguments @('--install', $layout.ObsBuild, '--component', 'Development', '--config', 'Release', '--prefix', $layout.Sdk)
}

$pluginPrefix = "$($layout.Sdk);$($layout.Prebuilt);$($layout.Qt)"
Write-Host 'Configuring ilyStream Workspace...'
Invoke-CMake -Arguments @(
    '-S', $projectRoot,
    '-B', $BuildDirectory,
    '-G', 'Visual Studio 17 2022',
    '-A', 'x64,version=10.0.26100.0',
    '-DBUILD_TESTING:BOOL=ON',
    "-DCMAKE_PREFIX_PATH:PATH=$pluginPrefix"
)

Invoke-CMake -Arguments @('--build', $BuildDirectory, '--config', $Configuration, '--parallel')

if (-not $SkipTests) {
    $ctest = Join-Path (Split-Path -Parent $cmake) 'ctest.exe'
    if (-not (Test-Path -LiteralPath $ctest -PathType Leaf)) {
        throw "CTest was not found beside CMake: $ctest"
    }
    & $cmake -E env "PATH=$($layout.Qt)\bin;$($env:PATH)" $ctest --test-dir $BuildDirectory -C $Configuration --output-on-failure
    if ($LASTEXITCODE -ne 0) {
        throw "Plugin tests failed with exit code $LASTEXITCODE."
    }
}

if (-not $SkipPackage) {
    $packageContainer = Join-Path $projectRoot 'package'
    New-Item -ItemType Directory -Path $packageContainer -Force | Out-Null

    $packageRoot = Join-Path $packageContainer 'obs-plugin'
    $fullPackageContainer = [System.IO.Path]::GetFullPath($packageContainer).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
    $fullPackageRoot = [System.IO.Path]::GetFullPath($packageRoot)
    if (-not $fullPackageRoot.StartsWith($fullPackageContainer + [System.IO.Path]::DirectorySeparatorChar,
                                         [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to reset an unexpected package directory: $fullPackageRoot"
    }
    if (Test-Path -LiteralPath $fullPackageRoot) {
        Remove-Item -LiteralPath $fullPackageRoot -Recurse -Force
    }
    Invoke-CMake -Arguments @('--install', $BuildDirectory, '--config', $Configuration, '--prefix', $packageRoot)
    $archivePath = Join-Path $packageContainer "ilystream-obs-$($buildspec.version)-windows-x64.zip"
    if (Test-Path -LiteralPath $archivePath -PathType Leaf) {
        Remove-Item -LiteralPath $archivePath -Force
    }
    Compress-Archive -Path (Join-Path $packageRoot '*') -DestinationPath $archivePath -CompressionLevel Optimal
    Write-Host "Package directory ready: $packageRoot"
    Write-Host "Stage-compatible ZIP ready: $archivePath"
}

$pluginBinary = Join-Path $BuildDirectory "$Configuration\ilystream-obs.dll"
if (-not (Test-Path -LiteralPath $pluginBinary -PathType Leaf)) {
    throw "Build completed without the expected plugin binary: $pluginBinary"
}
Write-Host "Plugin ready: $pluginBinary"