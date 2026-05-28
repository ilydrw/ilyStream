param(
  [ValidateSet('Debug', 'Release')]
  [string] $Configuration = 'Release',
  [ValidateSet('x64')]
  [string] $Platform = 'x64',
  [string] $PlatformToolset = '',
  [string] $WindowsTargetPlatformVersion = ''
)

$ErrorActionPreference = 'Stop'

$script:frameServerWasRunning = $false

function Stop-FrameServerForBuild {
  $service = Get-Service -Name FrameServer -ErrorAction SilentlyContinue
  if ($null -eq $service) { return }

  if ($service.Status -ne [ServiceProcess.ServiceControllerStatus]::Running) { return }

  $script:frameServerWasRunning = $true
  try {
    Write-Host 'Stopping Windows Camera Frame Server so the media source DLL can be rebuilt...'
    Stop-Service -Name FrameServer -Force -ErrorAction Stop
    $service.WaitForStatus([ServiceProcess.ServiceControllerStatus]::Stopped, [TimeSpan]::FromSeconds(15))
  } catch {
    $script:frameServerWasRunning = $false
    Write-Warning "Could not stop Windows Camera Frame Server automatically: $($_.Exception.Message)"
  }
}

function Restart-FrameServerAfterBuild {
  if (-not $script:frameServerWasRunning) { return }

  try {
    Start-Service -Name FrameServer -ErrorAction Stop
    Write-Host 'Restarted Windows Camera Frame Server.'
  } catch {
    Write-Warning "Could not restart Windows Camera Frame Server automatically: $($_.Exception.Message)"
  }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$registrarProject = Join-Path $PSScriptRoot 'registrar\IlyStreamVirtualCameraRegistrar.vcxproj'
$bridgeProject = Join-Path $PSScriptRoot 'bridge\IlyStreamVirtualCameraBridge.vcxproj'
$mediaSourceProject = Join-Path $PSScriptRoot 'media-source\VirtualCameraMediaSource.vcxproj'
function Find-MSBuild {
  $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
  if (Test-Path $vswhere) {
    $found = & $vswhere -latest -products * -requires Microsoft.Component.MSBuild -find 'MSBuild\Current\Bin\MSBuild.exe' 2>$null |
      Where-Object { $_ -and (Test-Path $_) } |
      Select-Object -First 1
    if ($found) { return $found }
  }

  $candidates = @(
    'C:\Program Files\Microsoft Visual Studio\18\Enterprise\MSBuild\Current\Bin\MSBuild.exe',
    'C:\Program Files\Microsoft Visual Studio\18\Professional\MSBuild\Current\Bin\MSBuild.exe',
    'C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Current\Bin\MSBuild.exe',
    'C:\Program Files\Microsoft Visual Studio\18\BuildTools\MSBuild\Current\Bin\MSBuild.exe',
    'C:\Program Files\Microsoft Visual Studio\18\Insiders\MSBuild\Current\Bin\MSBuild.exe',
    'C:\Program Files\Microsoft Visual Studio\2022\Enterprise\MSBuild\Current\Bin\MSBuild.exe',
    'C:\Program Files\Microsoft Visual Studio\2022\Professional\MSBuild\Current\Bin\MSBuild.exe',
    'C:\Program Files\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe',
    'C:\Program Files\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\MSBuild.exe'
  )

  return $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

function Get-VisualStudioRoot {
  param([string] $MSBuildPath)

  $parts = $MSBuildPath -split '\\MSBuild\\', 2
  if ($parts.Length -gt 1) { return $parts[0] }
  return Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MSBuildPath))
}

function Get-AvailablePlatformToolsets {
  param([string] $VisualStudioRoot)

  $vcMsbuildRoot = Join-Path $VisualStudioRoot 'MSBuild\Microsoft\VC'
  if (-not (Test-Path $vcMsbuildRoot)) { return @() }

  return Get-ChildItem -Path $vcMsbuildRoot -Recurse -Filter 'Toolset.props' -ErrorAction SilentlyContinue |
    ForEach-Object {
      if ($_.FullName -match '\\PlatformToolsets\\([^\\]+)\\Toolset\.props$') {
        $matches[1]
      }
    } |
    Sort-Object -Unique
}

function Resolve-PlatformToolset {
  param(
    [string] $RequestedToolset,
    [string[]] $AvailableToolsets
  )

  if ($RequestedToolset) { return $RequestedToolset }

  foreach ($candidate in @('v145', 'v144', 'v143', 'v142')) {
    if ($AvailableToolsets -contains $candidate) { return $candidate }
  }

  return $AvailableToolsets | Sort-Object -Descending | Select-Object -First 1
}

function Resolve-WindowsSdkVersion {
  param([string] $RequestedVersion)

  if ($RequestedVersion) { return $RequestedVersion }

  $referencesRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\References'
  if (Test-Path (Join-Path $referencesRoot '10.0.26100.0')) {
    return '10.0.26100.0'
  }

  $latest = Get-ChildItem -Path $referencesRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' } |
    Sort-Object { [version] $_.Name } -Descending |
    Select-Object -First 1

  if ($latest) { return $latest.Name }
  throw 'Windows 10/11 SDK references were not found. Install the Windows 11 SDK.'
}

$msbuild = Find-MSBuild
if (-not $msbuild) {
  throw 'MSBuild was not found. Install Visual Studio with Desktop development with C++ and the Windows 11 SDK.'
}

$vsRoot = Get-VisualStudioRoot -MSBuildPath $msbuild
$availableToolsets = @(Get-AvailablePlatformToolsets -VisualStudioRoot $vsRoot)
$resolvedToolset = Resolve-PlatformToolset -RequestedToolset $PlatformToolset -AvailableToolsets $availableToolsets
if (-not $resolvedToolset) {
  throw "No Visual C++ platform toolset was found under $vsRoot. Install Desktop development with C++."
}
$resolvedSdkVersion = Resolve-WindowsSdkVersion -RequestedVersion $WindowsTargetPlatformVersion

function Ensure-NativePackage {
  param(
    [string] $Id,
    [string] $Version
  )

  $packageRoot = Join-Path $PSScriptRoot 'packages'
  $target = Join-Path $packageRoot "$Id.$Version"
  if (Test-Path $target) { return }

  New-Item -ItemType Directory -Force -Path $packageRoot | Out-Null
  $nupkg = Join-Path $env:TEMP "$Id.$Version.nupkg"
  Invoke-WebRequest -Uri "https://www.nuget.org/api/v2/package/$Id/$Version" -OutFile $nupkg
  Expand-Archive -LiteralPath $nupkg -DestinationPath $target -Force
}

Ensure-NativePackage -Id 'Microsoft.Windows.CppWinRT' -Version '2.0.220608.4'
Ensure-NativePackage -Id 'Microsoft.Windows.ImplementationLibrary' -Version '1.0.220201.1'

$solutionDir = "$PSScriptRoot\"
$mediaOutDir = Join-Path $PSScriptRoot "bin\$Platform\$Configuration\"
$mediaIntDir = Join-Path $PSScriptRoot "obj\$Platform\$Configuration\media-source\"

function Invoke-NativeBuild {
  param(
    [string] $Project,
    [string] $Name,
    [string[]] $ExtraProperties = @()
  )

  & $msbuild $Project `
    /p:Configuration=$Configuration `
    /p:Platform=$Platform `
    /p:WindowsTargetPlatformVersion=$resolvedSdkVersion `
    /p:PlatformToolset=$resolvedToolset `
    @ExtraProperties `
    /m

  if ($LASTEXITCODE -ne 0) {
    throw "$Name MSBuild failed with exit code $LASTEXITCODE"
  }
}

Write-Host "Using MSBuild: $msbuild"
Write-Host "Using Windows SDK: $resolvedSdkVersion"
Write-Host "Using C++ toolset: $resolvedToolset"

Stop-FrameServerForBuild
try {

Invoke-NativeBuild `
  -Project $mediaSourceProject `
  -Name 'Media source' `
  -ExtraProperties @(
    "/p:SolutionDir=$solutionDir",
    "/p:OutDir=$mediaOutDir",
    "/p:IntDir=$mediaIntDir"
  )

Invoke-NativeBuild -Project $registrarProject -Name 'Registrar'
Invoke-NativeBuild -Project $bridgeProject -Name 'Bridge'

$exe = Join-Path $PSScriptRoot "bin\$Platform\$Configuration\IlyStreamVirtualCameraRegistrar.exe"
if (-not (Test-Path $exe)) {
  throw "Build completed but output was not found: $exe"
}

$bridge = Join-Path $PSScriptRoot "bin\$Platform\$Configuration\IlyStreamVirtualCameraBridge.exe"
if (-not (Test-Path $bridge)) {
  throw "Build completed but output was not found: $bridge"
}

$dll = Join-Path $PSScriptRoot "bin\$Platform\$Configuration\VirtualCameraMediaSource.dll"
if (-not (Test-Path $dll)) {
  throw "Build completed but output was not found: $dll"
}

Write-Host "Built $dll"
Write-Host "Built $exe"
Write-Host "Built $bridge"
} finally {
  Restart-FrameServerAfterBuild
}
