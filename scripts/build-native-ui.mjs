import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const buildDir = join(root, 'native', 'engine', 'build')
const cmakeCandidates = process.platform === 'win32'
  ? [
      'cmake.exe',
      'C:\\Program Files\\Microsoft Visual Studio\\18\\Insiders\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\CMake\\bin\\cmake.exe',
      'C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\CMake\\bin\\cmake.exe'
    ]
  : ['cmake']
const cmake = cmakeCandidates.find(candidate => candidate === 'cmake' || existsSync(candidate))

if (!existsSync(buildDir)) {
  console.error('Native build directory is missing. Run `npm run build:engine` once to configure it.')
  process.exitCode = 1
} else if (!cmake) {
  console.error('CMake was not found. Run `npm run build:engine` or install CMake.')
  process.exitCode = 1
} else {
  const result = spawnSync(cmake, [
    '--build', buildDir,
    '--config', 'Release',
    '--target', 'ilystream_native_ui'
  ], { cwd: root, stdio: 'inherit', shell: false })
  process.exitCode = result.status ?? 1
}
