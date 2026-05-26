param(
  [ValidateSet('Debug', 'Release')]
  [string] $Configuration = 'Release',
  [ValidateSet('x64')]
  [string] $Platform = 'x64',
  [switch] $SkipBuild
)

$ErrorActionPreference = 'Stop'

$sourceClsid = '{6ED0F705-6D87-4A62-A28D-C4DE6F1FF16B}'
$cameraName = 'ilyStream'
$className = 'IlyStreamVirtualCameraMediaSource'
$frameDataDir = Join-Path $env:ProgramData 'ilyStream'
$frameDataFile = Join-Path $frameDataDir 'virtual-camera-frame.dat'

function Assert-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Open PowerShell as Administrator, then run npm run install:virtual-camera again.'
  }
}

$script:frameServerWasRunning = $false

function Stop-FrameServerForBuild {
  $service = Get-Service -Name FrameServer -ErrorAction SilentlyContinue
  if ($null -eq $service) {
    return
  }

  if ($service.Status -eq [ServiceProcess.ServiceControllerStatus]::Running) {
    $script:frameServerWasRunning = $true
    Write-Host 'Stopping Windows Camera Frame Server so the media source DLL can be rebuilt...'
    Stop-Service -Name FrameServer -Force -ErrorAction Stop
    $service.WaitForStatus([ServiceProcess.ServiceControllerStatus]::Stopped, [TimeSpan]::FromSeconds(15))
  }
}

function Restart-FrameServerAfterBuild {
  if (-not $script:frameServerWasRunning) {
    return
  }

  try {
    Start-Service -Name FrameServer -ErrorAction Stop
    Write-Host 'Restarted Windows Camera Frame Server.'
  } catch {
    Write-Warning "Could not restart Windows Camera Frame Server automatically: $($_.Exception.Message)"
  }
}

Assert-Admin
Stop-FrameServerForBuild

try {

if (-not $SkipBuild) {
  & (Join-Path $PSScriptRoot 'build.ps1') -Configuration $Configuration -Platform $Platform
  if ($LASTEXITCODE -ne 0) {
    throw "Build failed with exit code $LASTEXITCODE"
  }
}

$outputDir = Join-Path $PSScriptRoot "bin\$Platform\$Configuration"
$dll = Join-Path $outputDir 'VirtualCameraMediaSource.dll'
$registrar = Join-Path $outputDir 'IlyStreamVirtualCameraRegistrar.exe'
$bridge = Join-Path $outputDir 'IlyStreamVirtualCameraBridge.exe'

if (-not (Test-Path $dll)) {
  throw "Media source DLL was not found: $dll"
}
if (-not (Test-Path $registrar)) {
  throw "Registrar executable was not found: $registrar"
}
if (-not (Test-Path $bridge)) {
  throw "Frame bridge executable was not found: $bridge"
}

$dll = (Resolve-Path -LiteralPath $dll).Path
$registrar = (Resolve-Path -LiteralPath $registrar).Path

New-Item -Path $frameDataDir -ItemType Directory -Force | Out-Null
$everyoneModify = '*S-1-1-0:(OI)(CI)M'
& icacls.exe $frameDataDir /grant $everyoneModify | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Failed to grant frame bridge directory permissions with icacls.exe (exit code $LASTEXITCODE)"
}

if (-not (Test-Path -LiteralPath $frameDataFile)) {
  New-Item -Path $frameDataFile -ItemType File -Force | Out-Null
}
$everyoneFileModify = '*S-1-1-0:M'
& icacls.exe $frameDataFile /grant $everyoneFileModify | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Failed to grant frame bridge file permissions with icacls.exe (exit code $LASTEXITCODE)"
}

$clsidKey = "HKLM:\SOFTWARE\Classes\CLSID\$sourceClsid"
$inProcKey = Join-Path $clsidKey 'InProcServer32'

New-Item -Path $clsidKey -Force | Out-Null
Set-Item -Path $clsidKey -Value $className
New-Item -Path $inProcKey -Force | Out-Null
Set-Item -Path $inProcKey -Value $dll
New-ItemProperty -Path $inProcKey -Name 'ThreadingModel' -Value 'Both' -PropertyType String -Force | Out-Null

& $registrar install --name $cameraName --source-clsid $sourceClsid --system --current-user
if ($LASTEXITCODE -ne 0) {
  throw "Virtual camera registration failed with exit code $LASTEXITCODE"
}

Write-Host "Registered ilyStream virtual camera using $dll"
Write-Host "Prepared virtual camera frame bridge storage at $frameDataFile"
} finally {
  Restart-FrameServerAfterBuild
}
