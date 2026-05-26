param(
  [ValidateSet('Debug', 'Release')]
  [string] $Configuration = 'Release',
  [ValidateSet('x64')]
  [string] $Platform = 'x64'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$registrarProject = Join-Path $PSScriptRoot 'registrar\IlyStreamVirtualCameraRegistrar.vcxproj'
$bridgeProject = Join-Path $PSScriptRoot 'bridge\IlyStreamVirtualCameraBridge.vcxproj'
$mediaSourceProject = Join-Path $PSScriptRoot 'media-source\VirtualCameraMediaSource.vcxproj'
$msbuildCandidates = @(
  'C:\Program Files\Microsoft Visual Studio\18\Insiders\MSBuild\Current\Bin\MSBuild.exe',
  'C:\Program Files\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe',
  'C:\Program Files\Microsoft Visual Studio\2022\Professional\MSBuild\Current\Bin\MSBuild.exe',
  'C:\Program Files\Microsoft Visual Studio\2022\Enterprise\MSBuild\Current\Bin\MSBuild.exe'
)

$msbuild = $msbuildCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $msbuild) {
  throw 'MSBuild was not found. Install Visual Studio with Desktop development with C++ and the Windows 11 SDK.'
}

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

& $msbuild $mediaSourceProject `
  /p:Configuration=$Configuration `
  /p:Platform=$Platform `
  /p:WindowsTargetPlatformVersion=10.0.26100.0 `
  /p:PlatformToolset=v145 `
  /p:SolutionDir=$solutionDir `
  /p:OutDir=$mediaOutDir `
  /p:IntDir=$mediaIntDir `
  /m

if ($LASTEXITCODE -ne 0) {
  throw "Media source MSBuild failed with exit code $LASTEXITCODE"
}

& $msbuild $registrarProject `
  /p:Configuration=$Configuration `
  /p:Platform=$Platform `
  /p:WindowsTargetPlatformVersion=10.0.26100.0 `
  /m

if ($LASTEXITCODE -ne 0) {
  throw "Registrar MSBuild failed with exit code $LASTEXITCODE"
}

& $msbuild $bridgeProject `
  /p:Configuration=$Configuration `
  /p:Platform=$Platform `
  /p:WindowsTargetPlatformVersion=10.0.26100.0 `
  /m

if ($LASTEXITCODE -ne 0) {
  throw "Bridge MSBuild failed with exit code $LASTEXITCODE"
}

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
