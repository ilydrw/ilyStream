import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { build } from 'electron-builder'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
// Packaging is intentionally native to the runner. Cross-compiling Electron
// plus native capture backends from another OS is not supported by this flow.
const platform = process.platform
const publish = process.argv.includes('--publish')

if (!['win32', 'darwin', 'linux'].includes(platform)) {
  throw new Error(`Unsupported packaging platform: ${platform}`)
}

function runNpm(script, args = []) {
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const command = [executable, 'run', script, ...args]
  const quoteWindowsArg = (value, index) => {
    const text = String(value)
    if (index === 0 || /^[A-Za-z0-9_./:-]+$/.test(text)) return text
    return `"${text.replaceAll('"', '""')}"`
  }
  const windowsCommand = command.map(quoteWindowsArg).join(' ')
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : executable,
      process.platform === 'win32' ? ['/d', '/s', '/c', windowsCommand] : command.slice(1),
      {
      cwd: root,
      stdio: 'inherit',
      shell: false
      }
    )
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) return resolvePromise()
      reject(new Error(`${script} exited with ${code ?? `signal ${signal}`}`))
    })
  })
}

function runNode(script, args = []) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [join(root, script), ...args], {
      cwd: root,
      stdio: 'inherit',
      shell: false
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) return resolvePromise()
      reject(new Error(`${script} exited with ${code ?? `signal ${signal}`}`))
    })
  })
}

function findFile(directory, predicate) {
  if (!existsSync(directory)) return null
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      const nested = findFile(path, predicate)
      if (nested) return nested
    } else if (predicate(path, entry.name)) {
      return path
    }
  }
  return null
}

function nativeArtifact(name) {
  const path = findFile(join(root, 'native', 'engine', 'build'), (_path, entry) => entry === name)
  if (!path) throw new Error(`Native artifact was not produced: ${name}`)
  return path
}

function portableConfig() {
  const config = structuredClone(packageJson.build)
  const platformDirectory = platform === 'darwin' ? 'darwin' : 'linux'
  const engineLibrary = findFile(
    join(root, 'native', 'engine', 'build'),
    (_path, entry) => entry === `libilystream_engine.${platform === 'darwin' ? 'dylib' : 'so'}` ||
      entry === `ilystream_engine.${platform === 'darwin' ? 'dylib' : 'so'}`
  )
  if (!engineLibrary) throw new Error(`Portable native engine library was not produced for ${platform}`)

  config.files = config.files.filter((entry) =>
    !String(entry).includes(`onnxruntime-node/bin/napi-v3/${platformDirectory}/`))
  config.asarUnpack = [
    '**/*.node',
    'node_modules/ffmpeg-static/**/*',
    `node_modules/onnxruntime-node/bin/napi-v3/${platformDirectory}/x64/**/*`
  ]
  config.extraResources = [
    { from: nativeArtifact('ilystream_napi.node'), to: 'native-engine/ilystream_napi.node' },
    { from: nativeArtifact('ilystream_preview.node'), to: 'native-engine/ilystream_preview.node' },
    { from: engineLibrary, to: `native-engine/${engineLibrary.split(/[\\/]/).pop()}` },
    { from: nativeArtifact('ilystream_audio.node'), to: 'native-audio/ilystream_audio.node' },
    { from: 'resources/ilyStream-Logo.svg', to: 'ilystream-logo.svg' },
    { from: 'resources/companion-emojis', to: 'companion-emojis' }
  ]
  delete config.win
  delete config.nsis
  delete config.portable
  if (platform === 'darwin') {
    config.mac = { target: ['dmg', 'zip'] }
  } else {
    config.linux = { target: ['AppImage', 'deb'], category: 'AudioVideo' }
  }
  return config
}

try {
  await runNpm('verify:native-abi')
  if (platform === 'win32') await runNpm('build:virtual-camera')
  await runNpm('build:engine', ['--', '-RequireExactElectronHeaders'])
  if (platform === 'win32') await runNpm('build:obs-plugin')
  await runNpm('build')

  const config = platform === 'win32' ? packageJson.build : portableConfig()
  await build({
    config,
    publish: publish ? 'always' : 'never'
  })
  await runNode('scripts/verify-package-contents.mjs')
  console.log(`ilyStream ${platform} packaging completed successfully.`)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
