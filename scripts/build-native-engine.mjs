import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawn } from 'node:child_process'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const engineRoot = join(root, 'native', 'engine')
const buildDir = join(engineRoot, 'build')
const forwarded = process.argv.slice(2)
const strict = forwarded.some((value) => value === '--strict' || value === '-RequireExactElectronHeaders')
const skipTests = forwarded.some((value) => value === '--skip-tests' || value === '-SkipTests')
const configurationIndex = forwarded.findIndex((value) => value === '--configuration' || value === '-Configuration')
const configuration = configurationIndex >= 0 && forwarded[configurationIndex + 1]
  ? forwarded[configurationIndex + 1]
  : 'Release'

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const output = []
    const child = spawn(command, args, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      ...options
    })
    const forward = (stream, chunk) => {
      const text = chunk.toString()
      output.push(text)
      stream.write(chunk)
    }
    child.stdout?.on('data', (chunk) => forward(process.stdout, chunk))
    child.stderr?.on('data', (chunk) => forward(process.stderr, chunk))
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) return resolvePromise()
      const tail = output.join('').slice(-16000).trim()
      reject(new Error(`${command} exited with ${code ?? `signal ${signal}`}${tail ? `\n${tail}` : ''}`))
    })
  })
}

function findVcpkgToolchain() {
  const candidates = [
    process.env.VCPKG_ROOT,
    process.env.VCPKG_INSTALLATION_ROOT,
    join(homedir(), 'vcpkg'),
    process.platform === 'win32' ? 'C:\\vcpkg' : '/opt/vcpkg'
  ].filter(Boolean)
  try {
    const executable = process.platform === 'win32' ? 'where.exe' : 'which'
    const located = execFileSync(executable, ['vcpkg'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0]
    if (located) candidates.unshift(join(dirname(located), 'scripts', 'buildsystems'))
  } catch {
    // Fall through to the conventional roots above.
  }
  for (const candidate of candidates) {
    const toolchain = candidate.endsWith('buildsystems')
      ? join(candidate, 'vcpkg.cmake')
      : join(candidate, 'scripts', 'buildsystems', 'vcpkg.cmake')
    if (existsSync(toolchain)) return toolchain
  }
  throw new Error('vcpkg.cmake was not found. Set VCPKG_ROOT or install vcpkg before building the native engine.')
}

async function buildWindows() {
  const powershell = process.env.ComSpec ? 'powershell.exe' : 'powershell'
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(engineRoot, 'build.ps1'), ...forwarded]
  await run(powershell, args)
}

async function buildUnix() {
  const toolchain = findVcpkgToolchain()
  const cmakeArgs = [
    '-B', buildDir,
    '-S', engineRoot,
    `-DCMAKE_BUILD_TYPE=${configuration}`,
    `-DCMAKE_TOOLCHAIN_FILE=${toolchain}`,
    '-DILY_USE_BGFX=ON',
    `-DILY_ALLOW_ELECTRON_HEADER_FALLBACK=${strict ? 'OFF' : 'ON'}`
  ]
  await run('cmake', cmakeArgs)
  await run('cmake', ['--build', buildDir, '--config', configuration])
  if (skipTests) return

  const names = [
    'engine_tests',
    'texture_pipeline_test',
    'renderer_stress_test',
    'core_host_protocol_test',
    'master_dsp_protocol_test',
    'audio_capture_core_test',
    'program_mixer_core_test',
    'master_dsp_test',
    'program_mixer_transport_test'
  ]
  for (const name of names) {
    const multiConfig = join(buildDir, configuration, name)
    const singleConfig = join(buildDir, name)
    const executable = existsSync(multiConfig) ? multiConfig : singleConfig
    if (!existsSync(executable)) throw new Error(`Native test executable was not produced: ${name}`)
    await run(executable, [])
  }
}

try {
  if (process.platform === 'win32') await buildWindows()
  else await buildUnix()
  console.log('Native Engine Build completed successfully!')
} catch (error) {
  const message = error instanceof Error ? (error.stack || error.message) : String(error)
  console.error(message)
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(`::error title=Native engine build failed::${message.replace(/[\r\n]+/g, ' ').slice(0, 8000)}`)
  }
  process.exitCode = 1
}
