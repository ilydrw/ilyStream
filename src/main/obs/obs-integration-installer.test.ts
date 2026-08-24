import { describe, expect, it, vi } from 'vitest'
import {
  getManagedThemePath,
  isManagedPluginInstalled,
  validateStageTargetManifest
} from './obs-integration-installer'

const programDataDll = 'C:\\ProgramData\\obs-studio\\plugins\\ilystream-obs\\bin\\64bit\\ilystream-obs.dll'
const bundleSha256 = 'a'.repeat(64)

function stageManifest(target: Record<string, unknown>) {
  return {
    schemaVersion: 1,
    kind: 'ilyStream-obs-plugin-stage',
    pluginId: 'ilystream-obs',
    bundleSha256,
    target,
    files: [{
      relativePath: 'obs-plugins\\64bit\\ilystream-obs.dll',
      sha256: 'b'.repeat(64),
      size: 123
    }],
    safety: {
      stageOnly: true,
      obsFilesChanged: false,
      obsWasRestarted: false
    }
  }
}

function programDataState(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    status: 'installed',
    obs: { root: 'C:\\Program Files\\obs-studio' },
    plugin: {
      id: 'ilystream-obs',
      installLayout: {
        kind: 'ProgramData',
        installRoot: 'C:\\ProgramData\\obs-studio\\plugins\\ilystream-obs'
      },
      files: [{
        packageRelativePath: 'obs-plugins\\64bit\\ilystream-obs.dll',
        destinationPath: programDataDll,
        managedPresent: true
      }]
    },
    ...overrides
  }
}

describe('isManagedPluginInstalled', () => {
  it('requires both active state and the managed ProgramData DLL', () => {
    const present = vi.fn(() => true)
    expect(isManagedPluginInstalled(programDataState(), present)).toBe(true)
    expect(present).toHaveBeenCalledWith(programDataDll)
    expect(isManagedPluginInstalled(programDataState(), () => false)).toBe(false)
    expect(isManagedPluginInstalled(programDataState({ status: 'uninstalled' }), () => true)).toBe(false)
  })

  it('rejects a state destination outside its recorded layout', () => {
    const state = programDataState()
    state.plugin.files[0].destinationPath = 'C:\\Program Files\\obs-studio\\obs-plugins\\64bit\\ilystream-obs.dll'
    expect(isManagedPluginInstalled(state, () => true)).toBe(false)
  })

  it('continues to recognize a managed schema-v1 root-relative DLL', () => {
    const legacyState = {
      schemaVersion: 1,
      status: 'installed',
      obs: { root: 'D:\\OBS-Portable' },
      plugin: {
        id: 'ilystream-obs',
        files: [{
          relativePath: 'obs-plugins\\64bit\\ilystream-obs.dll',
          managedPresent: true
        }]
      }
    }
    expect(isManagedPluginInstalled(legacyState, () => true)).toBe(true)
  })
})

describe('validated OBS target status discovery', () => {
  const defaultConfigRoot = 'C:\\Users\\Drew\\AppData\\Roaming\\obs-studio'
  const stagePath = `C:\\Stages\\ilystream-obs-0.1.0-${bundleSha256.slice(0, 12)}`

  it('accepts the default config root only when the manifest identifies a real OBS layout', () => {
    const target = validateStageTargetManifest(stageManifest({
      obsRoot: 'C:\\Program Files\\obs-studio',
      obsExecutable: 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe',
      configRoot: defaultConfigRoot,
      portable: false
    }), stagePath, defaultConfigRoot, () => true)

    expect(target).toMatchObject({
      configRoot: defaultConfigRoot,
      obsRoot: 'C:\\Program Files\\obs-studio',
      portable: false
    })
  })

  it('accepts the exact portable config root and resolves its managed theme', () => {
    const portableRoot = 'D:\\OBS-Portable'
    const portableConfigRoot = `${portableRoot}\\config\\obs-studio`
    const target = validateStageTargetManifest(stageManifest({
      obsRoot: portableRoot,
      obsExecutable: `${portableRoot}\\bin\\64bit\\obs64.exe`,
      configRoot: portableConfigRoot,
      portable: true
    }), stagePath, defaultConfigRoot, () => true)
    expect(target?.configRoot).toBe(portableConfigRoot)

    const destinationPath = `${portableConfigRoot}\\themes\\ilyStream_Cyber_Neon.ovt`
    expect(getManagedThemePath({
      status: 'installed',
      theme: {
        id: 'com.ilystream.obs.cyber-neon',
        destinationPath
      }
    }, portableConfigRoot)).toBe(destinationPath)
  })

  it('rejects manifest-selected arbitrary config roots and mismatched theme destinations', () => {
    const manifest = stageManifest({
      obsRoot: 'D:\\OBS-Portable',
      obsExecutable: 'D:\\OBS-Portable\\bin\\64bit\\obs64.exe',
      configRoot: 'C:\\Arbitrary\\obs-state',
      portable: true
    })
    expect(validateStageTargetManifest(manifest, stagePath, defaultConfigRoot, () => true)).toBeNull()
    expect(getManagedThemePath({
      status: 'installed',
      theme: {
        id: 'com.ilystream.obs.cyber-neon',
        destinationPath: 'C:\\Arbitrary\\ilyStream_Cyber_Neon.ovt'
      }
    }, defaultConfigRoot)).toBeNull()
  })
})
