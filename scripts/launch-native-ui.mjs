import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const fileName = process.platform === 'win32' ? 'ilystream_native_ui.exe' : 'ilystream_native_ui'
const candidates = [
  join(root, 'native', 'engine', 'build', 'Release', fileName),
  join(root, 'native', 'engine', 'build', fileName)
]
const executable = candidates.find(candidate => existsSync(candidate))

if (!executable) {
  console.error('Native UI pilot is not built. Run `npm run build:engine` first.')
  process.exitCode = 1
} else {
  const child = spawn(executable, [], { stdio: 'inherit', windowsHide: false })
  child.on('error', error => {
    console.error(`Could not launch native UI pilot: ${error.message}`)
    process.exitCode = 1
  })
  child.on('exit', (code, signal) => {
    if (signal) return
    process.exitCode = code ?? 1
  })
}
