import { app } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { OBSWorkspaceSetupResult, OBSWorkspaceSetupStatus } from '../../shared/obs-workspace'

const execFileAsync = promisify(execFile)
const THEME_FILE = 'ilyStream_Cyber_Neon.ovt'
const THEME_ID = 'com.ilystream.obs.cyber-neon'
const PLUGIN_ID = 'ilystream-obs'

export type ValidatedStageTarget = {
  stagePath: string
  obsRoot: string
  configRoot: string
  portable: boolean
}

type InstallStateSelection = {
  configRoot: string
  state: any
}

export class OBSIntegrationInstaller {
  async getStatus(): Promise<OBSWorkspaceSetupStatus> {
    const paths = this.paths()
    const obsRunning = await isOBSRunning()
    const stages = findValidatedStages(paths.pluginStageRoot, paths.defaultConfigRoot)
    const configRoots = getStatusConfigRoots(paths.defaultConfigRoot, stages)
    const themeSelection = findInstallState(configRoots, 'theme-install.json')
    const pluginSelection = findInstallState(configRoots, 'plugin-install.json')
    const themeState = themeSelection?.state
    const pluginState = pluginSelection?.state
    const pluginVersion = readJson(paths.pluginBuildspec)?.version
    const stagedPath = stages[0]?.stagePath || null
    const managedThemePath = themeSelection
      ? getManagedThemePath(themeState, themeSelection.configRoot)
      : null
    const themeStateActive = themeState?.status === 'installed'
    const themeInstalled = managedThemePath !== null && existsSync(managedThemePath)
    const pluginStateActive = pluginState?.status === 'installed'
    const pluginInstalled = isManagedPluginInstalled(pluginState)
    const pluginInstallPath = typeof pluginState?.plugin?.installLayout?.installRoot === 'string'
      ? pluginState.plugin.installLayout.installRoot
      : typeof pluginState?.obs?.root === 'string'
        ? pluginState.obs.root
        : null

    return {
      obsRunning,
      theme: {
        available: existsSync(paths.themeSource) && existsSync(paths.installThemeScript),
        installed: themeInstalled,
        sourcePath: existsSync(paths.themeSource) ? paths.themeSource : null,
        installPath: managedThemePath || paths.defaultThemeInstall,
        version: 'OBS 32.x',
        detail: themeInstalled
          ? 'Installed. Select ilyStream Cyber Neon later in OBS Settings → Appearance.'
          : themeStateActive
            ? 'Installation state exists, but the managed theme file is missing or outside the recorded OBS config root. Reinstall it to repair the managed copy.'
          : 'Optional user theme; installation does not change the active OBS theme.'
      },
      plugin: {
        available: existsSync(paths.pluginPackage) && existsSync(paths.stagePluginScript),
        installed: pluginInstalled,
        sourcePath: existsSync(paths.pluginPackage) ? paths.pluginPackage : null,
        installPath: pluginInstallPath,
        stagedPath,
        version: typeof pluginVersion === 'string' ? pluginVersion : null,
        detail: pluginInstalled
          ? 'Installed. OBS must be restarted off-air to load a changed native DLL.'
          : pluginStateActive
            ? 'Installation state exists, but the managed plugin DLL is missing or outside the recorded safe layout. Reinstall it while OBS is closed.'
          : stagedPath
            ? 'Verified build staged. Close OBS when off-air to enable installation.'
          : existsSync(paths.pluginPackage)
            ? 'Build is ready to stage; applying it is blocked while OBS is running.'
            : 'Native plugin source is included; no installable build is packaged yet.'
      }
    }
  }

  async installTheme(): Promise<OBSWorkspaceSetupResult> {
    const paths = this.paths()
    assertFile(paths.installThemeScript, 'OBS theme installer')
    assertFile(paths.themeSource, 'ilyStream OBS theme')
    await runPowerShell(paths.installThemeScript, ['-ThemeSource', paths.themeSource])
    return {
      ok: true,
      component: 'theme',
      message: 'ilyStream Cyber Neon was installed. OBS was not restarted and its active theme was not changed.',
      status: await this.getStatus()
    }
  }

  async stagePlugin(): Promise<OBSWorkspaceSetupResult> {
    const paths = this.paths()
    assertPath(paths.stagePluginScript, 'OBS plugin stager')
    assertPath(paths.pluginPackage, 'ilyStream OBS plugin package')
    const version = String(readJson(paths.pluginBuildspec)?.version || 'dev')
    await runPowerShell(paths.stagePluginScript, [
      '-PackagePath', paths.pluginPackage,
      '-Version', version
    ])
    return {
      ok: true,
      component: 'plugin',
      message: 'The native OBS plugin was verified and staged without changing the running OBS installation.',
      status: await this.getStatus()
    }
  }

  async installStagedPlugin(): Promise<OBSWorkspaceSetupResult> {
    const paths = this.paths()
    const status = await this.getStatus()
    if (status.obsRunning) {
      throw new Error('Close OBS after ending the stream before installing the native plugin. ilyStream will not stop OBS for you.')
    }
    const stages = findValidatedStages(paths.pluginStageRoot, paths.defaultConfigRoot)
    const statusStagePath = status.plugin.stagedPath
    const stage = stages.find((candidate) =>
      typeof statusStagePath === 'string' && pathsEqual(candidate.stagePath, statusStagePath)
    ) || stages[0]
    if (!stage) throw new Error('Stage the verified native plugin build first.')
    assertPath(paths.installStagedPluginScript, 'staged OBS plugin installer')
    await runPowerShell(paths.installStagedPluginScript, [
      '-StagePath', stage.stagePath,
      '-ObsRoot', stage.obsRoot,
      '-ObsConfigRoot', stage.configRoot
    ])
    return {
      ok: true,
      component: 'plugin',
      message: 'The native ilyStream OBS plugin was installed. Start OBS when you are ready to load it.',
      status: await this.getStatus()
    }
  }

  private paths() {
    const repositoryRoot = app.getAppPath()
    const integrationRoot = app.isPackaged
      ? join(process.resourcesPath, 'obs-integration')
      : join(repositoryRoot, 'resources', 'obs-integration')
    const scriptsRoot = app.isPackaged
      ? join(integrationRoot, 'scripts')
      : join(repositoryRoot, 'scripts', 'obs-integration')
    const defaultConfigRoot = join(app.getPath('appData'), 'obs-studio')
    const localAppData = process.env.LOCALAPPDATA || app.getPath('userData')
    const packagedPlugin = join(integrationRoot, 'native-plugin')
    const developmentPlugin = join(repositoryRoot, 'native', 'obs-plugin', 'package', 'obs-plugin')
    return {
      integrationRoot,
      defaultConfigRoot,
      installThemeScript: join(scriptsRoot, 'Install-IlyStreamObsTheme.ps1'),
      stagePluginScript: join(scriptsRoot, 'Stage-IlyStreamObsPlugin.ps1'),
      installStagedPluginScript: join(scriptsRoot, 'Install-StagedIlyStreamObsPlugin.ps1'),
      themeSource: join(integrationRoot, 'themes', THEME_FILE),
      defaultThemeInstall: join(defaultConfigRoot, 'themes', THEME_FILE),
      defaultStateRoot: join(defaultConfigRoot, 'ilyStream', 'obs-integration'),
      pluginPackage: app.isPackaged ? packagedPlugin : developmentPlugin,
      pluginBuildspec: app.isPackaged
        ? join(packagedPlugin, 'obs-plugin-package.json')
        : join(repositoryRoot, 'native', 'obs-plugin', 'buildspec.json'),
      pluginStageRoot: join(localAppData, 'ilyStream', 'obs-integration', 'staged-plugins')
    }
  }
}

export function getManagedThemePath(themeState: any, configRoot: string): string | null {
  if (themeState?.status !== 'installed' || themeState?.theme?.id !== THEME_ID) return null
  const expectedPath = join(configRoot, 'themes', THEME_FILE)
  const recordedDestination = typeof themeState?.theme?.destinationPath === 'string'
    ? themeState.theme.destinationPath
    : null
  return recordedDestination !== null && pathsEqual(recordedDestination, expectedPath)
    ? expectedPath
    : null
}

function getManagedPluginDllPath(pluginState: any): string | null {
  if (pluginState?.status !== 'installed' || String(pluginState?.plugin?.id || '').toLowerCase() !== PLUGIN_ID) {
    return null
  }

  const files = Array.isArray(pluginState?.plugin?.files) ? pluginState.plugin.files : []
  const managedDll = files.find((file: any) => {
    const packagePath = String(file?.packageRelativePath || file?.relativePath || '').replaceAll('/', '\\').toLowerCase()
    return file?.managedPresent === true && packagePath === `obs-plugins\\64bit\\${PLUGIN_ID}.dll`
  })
  if (!managedDll) return null

  const layoutKind = String(pluginState?.plugin?.installLayout?.kind || '')
  const obsRoot = typeof pluginState?.obs?.root === 'string' ? pluginState.obs.root : null
  const installRoot = typeof pluginState?.plugin?.installLayout?.installRoot === 'string'
    ? pluginState.plugin.installLayout.installRoot
    : null
  let expectedPath: string | null = null

  if (layoutKind === 'ProgramData' && installRoot) {
    expectedPath = join(installRoot, 'bin', '64bit', `${PLUGIN_ID}.dll`)
  } else if ((layoutKind === 'ObsRoot' || Number(pluginState?.schemaVersion) === 1) && obsRoot) {
    expectedPath = join(obsRoot, 'obs-plugins', '64bit', `${PLUGIN_ID}.dll`)
  }
  if (!expectedPath) return null

  const recordedDestination = typeof managedDll.destinationPath === 'string'
    ? managedDll.destinationPath
    : expectedPath
  return resolve(recordedDestination).toLowerCase() === resolve(expectedPath).toLowerCase()
    ? expectedPath
    : null
}

export function isManagedPluginInstalled(
  pluginState: any,
  fileExists: (path: string) => boolean = existsSync
): boolean {
  const managedPluginDll = getManagedPluginDllPath(pluginState)
  return managedPluginDll !== null && fileExists(managedPluginDll)
}

async function runPowerShell(scriptPath: string, args: string[]): Promise<string> {
  if (process.platform !== 'win32') throw new Error('OBS integration installation is currently supported on Windows only.')
  const result = await execFileAsync('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
    ...args
  ], {
    timeout: 120_000,
    windowsHide: true,
    maxBuffer: 1024 * 1024
  })
  return String(result.stdout || '')
}

async function isOBSRunning(): Promise<boolean> {
  if (process.platform !== 'win32') return false
  try {
    const result = await execFileAsync('tasklist.exe', ['/FI', 'IMAGENAME eq obs64.exe', '/NH', '/FO', 'CSV'], {
      timeout: 5_000,
      windowsHide: true,
      maxBuffer: 128 * 1024
    })
    return /"obs64\.exe"/i.test(String(result.stdout || ''))
  } catch {
    return false
  }
}

function assertFile(path: string, label: string): void {
  if (!existsSync(path)) throw new Error(`${label} was not found in this ilyStream build.`)
}

function assertPath(path: string, label: string): void {
  if (!existsSync(path)) throw new Error(`${label} was not found in this ilyStream build.`)
}

function readJson(path: string): any {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function pathsEqual(left: string, right: string): boolean {
  return resolve(left).toLowerCase() === resolve(right).toLowerCase()
}

function isPathWithin(childPath: string, parentPath: string): boolean {
  const resolvedParent = resolve(parentPath)
  const resolvedChild = resolve(childPath)
  const relation = relative(resolvedParent, resolvedChild)
  return relation.length > 0 && !relation.startsWith('..') && !isAbsolute(relation)
}

export function validateStageTargetManifest(
  manifest: any,
  stagePath: string,
  defaultConfigRoot: string,
  fileExists: (path: string) => boolean = existsSync
): ValidatedStageTarget | null {
  if (
    Number(manifest?.schemaVersion) !== 1 ||
    manifest?.kind !== 'ilyStream-obs-plugin-stage' ||
    String(manifest?.pluginId || '').toLowerCase() !== PLUGIN_ID ||
    manifest?.safety?.stageOnly !== true ||
    manifest?.safety?.obsFilesChanged !== false ||
    manifest?.safety?.obsWasRestarted !== false
  ) return null

  const bundleSha256 = String(manifest?.bundleSha256 || '').toLowerCase()
  const stageName = basename(stagePath).toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(bundleSha256) ||
      !stageName.startsWith(`${PLUGIN_ID}-`) ||
      !stageName.endsWith(`-${bundleSha256.slice(0, 12)}`)) {
    return null
  }

  const obsRoot = manifest?.target?.obsRoot
  const obsExecutable = manifest?.target?.obsExecutable
  const configRoot = manifest?.target?.configRoot
  if (
    typeof obsRoot !== 'string' || !isAbsolute(obsRoot) ||
    typeof obsExecutable !== 'string' || !isAbsolute(obsExecutable) ||
    typeof configRoot !== 'string' || !isAbsolute(configRoot)
  ) return null

  const supportedExecutables = [
    join(obsRoot, 'bin', '64bit', 'obs64.exe'),
    join(obsRoot, 'bin', '32bit', 'obs32.exe'),
    join(obsRoot, 'obs64.exe'),
    join(obsRoot, 'obs32.exe')
  ]
  if (!supportedExecutables.some((candidate) => pathsEqual(candidate, obsExecutable)) ||
      !fileExists(obsExecutable) ||
      !fileExists(join(obsRoot, 'data', 'obs-studio', 'themes', 'Yami.obt'))) {
    return null
  }

  const portable = manifest?.target?.portable === true
  const usesDefaultConfig = pathsEqual(configRoot, defaultConfigRoot)
  const usesPortableConfig = portable && pathsEqual(configRoot, join(obsRoot, 'config', 'obs-studio'))
  if (!usesDefaultConfig && !usesPortableConfig) return null

  const files = Array.isArray(manifest?.files) ? manifest.files : []
  const managedDlls = files.filter((file: any) => {
    const relativePath = String(file?.relativePath || '').replaceAll('/', '\\').toLowerCase()
    return relativePath === `obs-plugins\\64bit\\${PLUGIN_ID}.dll` &&
      /^[a-f0-9]{64}$/i.test(String(file?.sha256 || '')) && Number(file?.size) > 0
  })
  if (managedDlls.length !== 1) return null

  return { stagePath: resolve(stagePath), obsRoot: resolve(obsRoot), configRoot: resolve(configRoot), portable }
}

function getStatusConfigRoots(defaultConfigRoot: string, stages: ValidatedStageTarget[]): string[] {
  const roots: string[] = []
  for (const configRoot of [...stages.map((stage) => stage.configRoot), defaultConfigRoot]) {
    if (!roots.some((existing) => pathsEqual(existing, configRoot))) roots.push(resolve(configRoot))
  }
  return roots
}

function findInstallState(configRoots: string[], stateFileName: string): InstallStateSelection | null {
  let fallback: InstallStateSelection | null = null
  for (const configRoot of configRoots) {
    const state = readJson(join(configRoot, 'ilyStream', 'obs-integration', stateFileName))
    if (!state) continue
    const recordedConfigRoot = state?.obs?.configRoot
    if (typeof recordedConfigRoot === 'string') {
      if (!pathsEqual(recordedConfigRoot, configRoot)) continue
    } else if (!pathsEqual(configRoot, configRoots[configRoots.length - 1])) {
      // Older state without configRoot is accepted only from the default OBS profile.
      continue
    }
    const selection = { configRoot, state }
    if (state.status === 'installed') return selection
    fallback ||= selection
  }
  return fallback
}

function findValidatedStages(root: string, defaultConfigRoot: string): ValidatedStageTarget[] {
  if (!existsSync(root)) return []
  try {
    const resolvedRoot = resolve(root)
    return readdirSync(resolvedRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && entry.name.toLowerCase().startsWith(`${PLUGIN_ID}-`))
      .map((entry) => join(resolvedRoot, entry.name))
      .filter((stagePath) => isPathWithin(stagePath, resolvedRoot))
      .map((stagePath) => ({
        stagePath,
        manifest: readJson(join(stagePath, 'ilyStream-stage.json')),
        mtimeMs: statSync(stagePath).mtimeMs
      }))
      .map(({ stagePath, manifest, mtimeMs }) => ({
        target: validateStageTargetManifest(manifest, stagePath, defaultConfigRoot),
        mtimeMs
      }))
      .filter((candidate): candidate is { target: ValidatedStageTarget, mtimeMs: number } => candidate.target !== null)
      .sort((left, right) => right.mtimeMs - left.mtimeMs)
      .map((candidate) => candidate.target)
  } catch {
    return []
  }
}
