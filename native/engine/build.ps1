param(
  [ValidateSet('Debug', 'Release')]
  [string] $Configuration = 'Release',
  [switch] $RunTests = $true
)

$ErrorActionPreference = 'Stop'

# Resolve paths
$engineRoot = $PSScriptRoot
$projectRoot = Resolve-Path (Join-Path $engineRoot '..\..')
$buildDir = Join-Path $engineRoot 'build'

Write-Host "ilyStream Native Engine Build Runner" -ForegroundColor Cyan
Write-Host "Engine root: $engineRoot"
Write-Host "Project root: $projectRoot"
Write-Host "Configuration: $Configuration"

# 1. Locate CMake
$cmakePath = $null
if (Get-Command cmake -ErrorAction SilentlyContinue) {
  $cmakePath = (Get-Command cmake).Source
  Write-Host "Using system CMake: $cmakePath" -ForegroundColor Green
} else {
  Write-Host "CMake not in PATH. Searching Visual Studio install..." -ForegroundColor Yellow
  $vsCMake = Get-ChildItem -Path "C:\Program Files\Microsoft Visual Studio" -Filter "cmake.exe" -Recurse -ErrorAction SilentlyContinue | 
             Select-Object -First 1 -ExpandProperty FullName
  if ($vsCMake -and (Test-Path $vsCMake)) {
    $cmakePath = $vsCMake
    Write-Host "Found VS-bundled CMake: $cmakePath" -ForegroundColor Green
  }
}

if (-not $cmakePath) {
  throw "CMake executable was not found. Please install CMake or Visual Studio with C++ desktop development workload."
}

# 2. Configure CMake
Write-Host "Configuring CMake project..." -ForegroundColor Cyan
if (-not (Test-Path $buildDir)) {
  New-Item -ItemType Directory -Path $buildDir | Out-Null
} else {
  Remove-Item -Path (Join-Path $buildDir "CMakeCache.txt") -Force -ErrorAction SilentlyContinue
}

& $cmakePath -B $buildDir -S $engineRoot "-DCMAKE_BUILD_TYPE=$Configuration" "-DCMAKE_TOOLCHAIN_FILE=C:/Users/Drew/vcpkg/scripts/buildsystems/vcpkg.cmake" "-DILY_USE_BGFX=ON"
if ($LASTEXITCODE -ne 0) {
  throw "CMake configure failed (exit code $LASTEXITCODE)."
}

# 3. Build project
Write-Host "Compiling Native Engine..." -ForegroundColor Cyan
& $cmakePath --build $buildDir --config $Configuration
if ($LASTEXITCODE -ne 0) {
  throw "CMake build failed (exit code $LASTEXITCODE)."
}

# Run a test executable with a hard timeout. A hung test would otherwise wedge
# the whole build indefinitely and keep ilystream_engine.dll locked, breaking
# every subsequent build's link step, so we kill it and fail fast instead.
function Invoke-EngineTest {
  param(
    [string] $Name,
    [string] $ExePath,
    [int]    $TimeoutSeconds = 180
  )
  if (-not (Test-Path $ExePath)) {
    Write-Warning "Could not find test executable: $ExePath"
    return
  }
  Write-Host "Running $Name..." -ForegroundColor Cyan
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $ExePath
  $startInfo.WorkingDirectory = Split-Path -Parent $ExePath
  $startInfo.UseShellExecute = $false
  $proc = [System.Diagnostics.Process]::Start($startInfo)
  if (-not $proc.WaitForExit($TimeoutSeconds * 1000)) {
    try { $proc.Kill($true) } catch { try { $proc.Kill() } catch {} }
    throw "$Name timed out after $TimeoutSeconds s and was killed (hung test)."
  }
  if ($proc.ExitCode -ne 0) {
    throw "$Name failed (exit code $($proc.ExitCode))."
  }
  Write-Host "$Name passed." -ForegroundColor Green
}

# 4. Run tests
if ($RunTests) {
  Invoke-EngineTest -Name "Engine unit tests"     -ExePath (Join-Path $buildDir "$Configuration\engine_tests.exe")
  Invoke-EngineTest -Name "Texture pipeline tests" -ExePath (Join-Path $buildDir "$Configuration\texture_pipeline_test.exe")
  Invoke-EngineTest -Name "Renderer stress tests"  -ExePath (Join-Path $buildDir "$Configuration\renderer_stress_test.exe") -TimeoutSeconds 240
}

Write-Host "Native Engine Build completed successfully!" -ForegroundColor Green
