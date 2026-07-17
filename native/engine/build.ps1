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

# 3. Build project
Write-Host "Compiling Native Engine..." -ForegroundColor Cyan
& $cmakePath --build $buildDir --config $Configuration

# 4. Run tests
if ($RunTests) {
  Write-Host "Running C++ Engine Tests..." -ForegroundColor Cyan
  $testExe = Join-Path $buildDir "$Configuration\engine_tests.exe"
  if (Test-Path $testExe) {
    & $testExe
    if ($LASTEXITCODE -ne 0) {
      throw "Engine unit tests failed!"
    }
    Write-Host "All engine tests passed successfully." -ForegroundColor Green
  } else {
    Write-Warning "Could not find test executable: $testExe"
  }

  Write-Host "Running Texture Pipeline Tests..." -ForegroundColor Cyan
  $pipelineTestExe = Join-Path $buildDir "$Configuration\texture_pipeline_test.exe"
  if (Test-Path $pipelineTestExe) {
    & $pipelineTestExe
    if ($LASTEXITCODE -ne 0) {
      throw "Texture pipeline tests failed!"
    }
    Write-Host "All texture pipeline tests passed successfully." -ForegroundColor Green
  } else {
    Write-Warning "Could not find texture pipeline test executable: $pipelineTestExe"
  }

  Write-Host "Running Renderer Stress Tests..." -ForegroundColor Cyan
  $stressExe = Join-Path $buildDir "$Configuration\renderer_stress_test.exe"
  if (Test-Path $stressExe) {
    & $stressExe
    if ($LASTEXITCODE -ne 0) {
      throw "Renderer stress tests failed!"
    }
    Write-Host "All renderer stress tests passed successfully." -ForegroundColor Green
  } else {
    Write-Warning "Could not find stress test executable: $stressExe"
  }
}

Write-Host "Native Engine Build completed successfully!" -ForegroundColor Green
