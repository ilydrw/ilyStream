import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { spawn, type ChildProcess } from 'child_process'

let nativeUiProcess: ChildProcess | null = null

export interface NativeUiLaunchOptions {
  connectedServices?: number
  readyServices?: number
  needsReview?: number
  realTraffic?: number
}

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
export async function launchNativeUiPilot(
  options: NativeUiLaunchOptions = {}
): Promise<{ launched: boolean; error?: string }> {
  if (nativeUiProcess && nativeUiProcess.exitCode === null && !nativeUiProcess.killed) {
    nativeUiProcess.unref()
    return { launched: true }
  }

  const executable = resolveNativeUiExecutable()
  if (!executable) {
    return { launched: false, error: 'Native UI pilot is not installed. Build the native engine first.' }
  }

  try {
    const args = [
      ['connected', options.connectedServices],
      ['ready', options.readyServices],
      ['review', options.needsReview],
      ['traffic', options.realTraffic]
    ]
      .filter((entry): entry is [string, number] => Number.isFinite(entry[1]))
      .map(([key, value]) => `--${key}=${Math.max(0, Math.min(1000, Math.floor(value)))}`)
    nativeUiProcess = spawn(executable, args, {
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
    return await new Promise((resolve) => {
      let settled = false
      const finish = (result: { launched: boolean; error?: string }) => {
        if (settled) return
        settled = true
        resolve(result)
      }
      nativeUiProcess?.once('error', (error) => {
        nativeUiProcess = null
        finish({ launched: false, error: error.message })
      })
      nativeUiProcess?.once('exit', (code, signal) => {
        nativeUiProcess = null
        finish({ launched: false, error: `Native UI exited during startup (${code ?? signal ?? 'unknown'})` })
      })
      setTimeout(() => {
        if (nativeUiProcess && nativeUiProcess.exitCode === null) finish({ launched: true })
      }, 250)
    })
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
