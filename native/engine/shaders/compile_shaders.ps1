<#
.SYNOPSIS
    Compiles the engine's .sc shaders to per-backend bgfx bytecode headers.

.DESCRIPTION
    Runs bgfx's shaderc across every graphics backend we ship (Direct3D11,
    Vulkan/SPIR-V, desktop OpenGL, OpenGL ES, and Metal) and emits C headers
    containing the compiled bytecode as `--bin2c` arrays.

    The generated headers under shaders/generated/<ext>/ are committed to the
    repo. Because the bytecode for every backend is precompiled here, the
    engine builds on Windows, macOS, and Linux WITHOUT needing shaderc — each
    platform just #includes the arrays it references (see shader_loader.cpp).

    Re-run this only when a .sc source changes. shaderc comes from the bgfx
    vcpkg port built with its "tools" feature (see vcpkg.json).

.NOTES
    Metal is cross-compiled from any host via glslang -> SPIR-V -> SPIRV-Cross,
    so this can produce all backends from a Windows machine.
#>
param(
    [string] $ShadercPath = "",
    [string] $BgfxIncludeDir = "",
    [switch] $AllowMissingBackends
)

$ErrorActionPreference = 'Stop'
$shaderDir = $PSScriptRoot
$engineRoot = Resolve-Path (Join-Path $shaderDir '..')
$genDir = Join-Path $shaderDir 'generated'

Write-Host "ilyStream shader compiler" -ForegroundColor Cyan

# --- Locate shaderc.exe -----------------------------------------------------
if (-not $ShadercPath -or -not (Test-Path $ShadercPath)) {
    $candidates = @(
        (Join-Path $engineRoot 'build/vcpkg_installed/x64-windows/tools/bgfx/shaderc.exe'),
        (Join-Path $engineRoot 'build/vcpkg_installed/x64-windows/tools/shaderc.exe')
    )
    $ShadercPath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $ShadercPath) {
        $found = Get-ChildItem -Path (Join-Path $engineRoot 'build/vcpkg_installed') -Filter 'shaderc.exe' -Recurse -ErrorAction SilentlyContinue |
                 Select-Object -First 1 -ExpandProperty FullName
        if ($found) { $ShadercPath = $found }
    }
}
if (-not $ShadercPath -or -not (Test-Path $ShadercPath)) {
    throw "shaderc.exe not found. Build the bgfx vcpkg port with its 'tools' feature first (see vcpkg.json)."
}
Write-Host "shaderc: $ShadercPath" -ForegroundColor Green

# --- Locate bgfx shader include dir (holds bgfx_shader.sh) -------------------
if (-not $BgfxIncludeDir -or -not (Test-Path (Join-Path $BgfxIncludeDir 'bgfx_shader.sh'))) {
    $incCandidates = @(
        (Join-Path $engineRoot 'build/vcpkg_installed/x64-windows/include/bgfx')
    )
    $BgfxIncludeDir = $incCandidates | Where-Object { Test-Path (Join-Path $_ 'bgfx_shader.sh') } | Select-Object -First 1
    if (-not $BgfxIncludeDir) {
        $sh = Get-ChildItem -Path (Join-Path $engineRoot 'build/vcpkg_installed') -Filter 'bgfx_shader.sh' -Recurse -ErrorAction SilentlyContinue |
              Select-Object -First 1 -ExpandProperty DirectoryName
        if ($sh) { $BgfxIncludeDir = $sh }
    }
}
if (-not $BgfxIncludeDir -or -not (Test-Path (Join-Path $BgfxIncludeDir 'bgfx_shader.sh'))) {
    throw "Could not find bgfx_shader.sh include directory."
}
Write-Host "includes: $BgfxIncludeDir" -ForegroundColor Green

$varyingDef = Join-Path $shaderDir 'varying.def.sc'

# backend descriptor: ext | shaderc platform | shaderc profile
$backends = @(
    @{ ext = 'dx11';  platform = 'windows'; profile = 's_5_0'  },
    @{ ext = 'spv';   platform = 'linux';   profile = 'spirv'  },
    @{ ext = 'glsl';  platform = 'windows'; profile = '120'    },
    @{ ext = 'essl';  platform = 'android'; profile = '300_es' },
    @{ ext = 'mtl';   platform = 'osx';     profile = 'metal'  }
)

# shader descriptor: source file | shaderc type | embedded array basename
$shaders = @(
    @{ file = 'vs_sprite.sc'; type = 'vertex';   name = 'vs_sprite' },
    @{ file = 'fs_sprite.sc'; type = 'fragment'; name = 'fs_sprite' },
    @{ file = 'fs_output_sdr.sc'; type = 'fragment'; name = 'fs_output_sdr' }
)

$failures = @()
foreach ($shader in $shaders) {
    $src = Join-Path $shaderDir $shader.file
    foreach ($be in $backends) {
        $outSubdir = Join-Path $genDir $be.ext
        if (-not (Test-Path $outSubdir)) { New-Item -ItemType Directory -Path $outSubdir -Force | Out-Null }
        $outFile = Join-Path $outSubdir ($shader.file + '.bin.h')
        $arrayName = "$($shader.name)_$($be.ext)"

        $args = @(
            '-f', $src,
            '-o', $outFile,
            '--bin2c', $arrayName,
            '--type', $shader.type,
            '--platform', $be.platform,
            '-p', $be.profile,
            '--varyingdef', $varyingDef,
            '-i', $BgfxIncludeDir,
            '-O', '3'
        )

        Write-Host ("  {0,-10} {1,-9} -> {2}" -f $be.profile, $shader.type, (Resolve-Path -Relative $outFile -ErrorAction SilentlyContinue)) -ForegroundColor DarkGray
        $stderr = & $ShadercPath @args 2>&1
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $outFile)) {
            Write-Warning "  FAILED $arrayName ($($be.profile)): $stderr"
            $failures += $arrayName
        } else {
            $generated = [System.IO.File]::ReadAllText($outFile)
            $normalized = [regex]::Replace(
                $generated,
                '[ \t]+(?=\r?$)',
                '',
                [System.Text.RegularExpressions.RegexOptions]::Multiline
            )
            [System.IO.File]::WriteAllText(
                $outFile,
                $normalized,
                [System.Text.UTF8Encoding]::new($false)
            )
        }
    }
}

if ($failures.Count -gt 0) {
    Write-Host ""
    Write-Warning ("Backends that failed: {0}" -f ($failures -join ', '))
    if (-not $AllowMissingBackends) {
        throw "Shader compilation failed for one or more required backends."
    }
} else {
    Write-Host "All shader backends compiled successfully." -ForegroundColor Green
}
