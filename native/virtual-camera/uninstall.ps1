param(
  [ValidateSet('Debug', 'Release')]
  [string] $Configuration = 'Release',
  [ValidateSet('x64')]
  [string] $Platform = 'x64'
)

$ErrorActionPreference = 'Stop'

$sourceClsid = '{6ED0F705-6D87-4A62-A28D-C4DE6F1FF16B}'
$cameraName = 'ilyStream'
$frameDataDir = Join-Path $env:ProgramData 'ilyStream'
$frameDataFile = Join-Path $frameDataDir 'virtual-camera-frame.dat'

function Assert-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Open PowerShell as Administrator, then run npm run uninstall:virtual-camera again.'
  }
}

function Invoke-Registrar {
  param(
    [string] $Command,
    [switch] $AllowFailure
  )

  if (-not (Test-Path $script:registrar)) {
    if ($AllowFailure) { return }
    throw "Registrar executable was not found: $script:registrar"
  }

  & $script:registrar $Command --name $script:cameraName --source-clsid $script:sourceClsid --system --current-user
  if ($LASTEXITCODE -ne 0 -and -not $AllowFailure) {
    throw "Virtual camera $Command failed with exit code $LASTEXITCODE"
  }
}

Assert-Admin

$outputDir = Join-Path $PSScriptRoot "bin\$Platform\$Configuration"
$script:registrar = Join-Path $outputDir 'IlyStreamVirtualCameraRegistrar.exe'
$script:sourceClsid = $sourceClsid
$script:cameraName = $cameraName

Invoke-Registrar -Command 'stop' -AllowFailure
Invoke-Registrar -Command 'remove' -AllowFailure

$clsidKey = "HKLM:\SOFTWARE\Classes\CLSID\$sourceClsid"
if (Test-Path $clsidKey) {
  Remove-Item -LiteralPath $clsidKey -Recurse -Force
}

if (Test-Path -LiteralPath $frameDataFile) {
  Remove-Item -LiteralPath $frameDataFile -Force
}
if ((Test-Path -LiteralPath $frameDataDir) -and -not (Get-ChildItem -LiteralPath $frameDataDir -Force)) {
  Remove-Item -LiteralPath $frameDataDir -Force
}

Write-Host 'Removed ilyStream virtual camera registration.'
