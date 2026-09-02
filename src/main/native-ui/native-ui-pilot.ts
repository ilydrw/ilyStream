import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { spawn, type ChildProcess } from 'child_process'

let nativeUiProcess: ChildProcess | null = null

function nativeUiFileName(): string {
  return process.platform === 'win32' ? 'ilystream_native_ui.exe' : 'ilystream_native_ui'
}

export function resolveNativeUiExecutable(): string | null {
  const fileName = nativeUiFileName()
  const candidates = app.isPackaged
    ? [
        join(process.resourcesPath, 'native-engine', fileName),
        join(process.resourcesPath, 'native-ui', fileName)
      ]
    : [
        join(process.cwd(), 'native', 'engine', 'build', 'Release', fileName),
        join(process.cwd(), 'native', 'engine', 'build', fileName)
      ]
  return candidates.find(candidate => existsSync(candidate)) ?? null
}

/** Launch the standalone OS-native UI pilot, reusing an existing instance. */
export function launchNativeUiPilot(): { launched: boolean; error?: string } {
  if (nativeUiProcess && nativeUiProcess.exitCode === null && !nativeUiProcess.killed) {
    nativeUiProcess.unref()
    return { launched: true }
  }

  const executable = resolveNativeUiExecutable()
  if (!executable) {
    return { launched: false, error: 'Native UI pilot is not installed. Build the native engine first.' }
  }

  try {
    nativeUiProcess = spawn(executable, [], {
      detached: false,
      stdio: 'ignore',
      windowsHide: true
    })
    nativeUiProcess.once('exit', () => {
      nativeUiProcess = null
    })
    nativeUiProcess.once('error', () => {
      nativeUiProcess = null
    })
    return { launched: true }
  } catch (error) {
    nativeUiProcess = null
    return { launched: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function stopNativeUiPilot(): void {
  if (!nativeUiProcess || nativeUiProcess.exitCode !== null) {
    nativeUiProcess = null
    return
  }
  nativeUiProcess.kill()
  nativeUiProcess = null
}
