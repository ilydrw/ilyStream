import type { OBSWebSocket } from 'obs-websocket-js'
import type {
  OBSAttachManagedBrowserSourceRequest,
  OBSAttachManagedBrowserSourceResult,
  OBSBrowserSourceRecommendation,
  OBSManagedBrowserSource,
  OBSManagedBrowserSourceInspection,
  OBSManagedBrowserSourceSceneReference,
  OBSRefreshManagedBrowserSourceResult,
  OBSRepairManagedBrowserSourceRequest,
  OBSRepairManagedBrowserSourceResult,
  OBSUpsertWidgetBrowserSourceRequest,
  OBSUpsertWidgetBrowserSourceResult,
  OBSWidgetBrowserSourceSpec
} from '../../shared/obs'

const DEFAULT_WIDGET_BROWSER_SOURCE_FPS = 60
const DEFAULT_WIDGET_BROWSER_SOURCE_SIZE = { width: 1920, height: 1080 } as const
const MAX_BROWSER_SOURCE_DIMENSION = 8_192
const MAX_BROWSER_SOURCE_NAME_LENGTH = 120

const WIDGET_BROWSER_SOURCE_SIZES: Partial<Record<OBSWidgetBrowserSourceSpec['widgetType'], {
  width: number
  height: number
}>> = {
  alerts: { width: 1920, height: 1080 },
  chat: { width: 1920, height: 1080 },
  'event-particles': { width: 1920, height: 1080 },
  'falling-roses': { width: 1080, height: 1920 },
  particles: { width: 1920, height: 1080 },
  'node-network': { width: 1920, height: 1080 },
  physics: { width: 1920, height: 1080 },
  'screen-border': { width: 1920, height: 1080 },
  'camera-frame': { width: 640, height: 360 },
  'brb-screen': { width: 1920, height: 1080 },
  goal: { width: 720, height: 160 },
  'follower-goal': { width: 720, height: 180 },
  text: { width: 800, height: 240 },
  socials: { width: 720, height: 140 },
  'discord-promo': { width: 520, height: 160 },
  'discord-call': { width: 480, height: 360 },
  'latest-gifter': { width: 520, height: 180 },
  'now-playing': { width: 560, height: 220 },
  'likes-tracker': { width: 400, height: 280 },
  'chat-unified': { width: 1080, height: 1920 },
  leaderboard: { width: 440, height: 640 }
}

interface OBSInputRecord {
  inputName: string
  inputUuid: string | null
  inputKind: string
  unversionedInputKind: string
}

interface OBSBrowserInputRecord extends OBSInputRecord {
  settings: Record<string, unknown>
  widgetId: string
  url: string
}

interface SceneItemRecord {
  sceneItemId?: unknown
  sourceName?: unknown
  sourceUuid?: unknown
  sourceType?: unknown
  isGroup?: unknown
}

interface SceneTreeItem {
  sceneName: string
  containerName: string
  nested: boolean
  item: SceneItemRecord
}

/**
 * Owns all mutating OBS browser-source operations. Calls are serialized so a
 * double click or duplicate dock request cannot create two inputs or scene
 * items. Ownership is established from the exact live ilyStream loopback URL,
 * never from an input name.
 */
export class OBSBrowserSourceManager {
  private operationQueue: Promise<void> = Promise.resolve()

  constructor(
    private readonly client: OBSWebSocket,
    private readonly isConnected: () => boolean,
    private readonly getOverlayPort: () => number
  ) {}

  async getManagedBrowserSources(): Promise<OBSManagedBrowserSourceInspection> {
    return this.runOperation(async () => {
      this.assertConnected()
      return this.inspectManagedBrowserSources()
    })
  }

  async attachManagedBrowserSourceToScene(
    request: OBSAttachManagedBrowserSourceRequest
  ): Promise<OBSAttachManagedBrowserSourceResult> {
    return this.runOperation(async () => {
      this.assertConnected()
      const input = await this.getManagedBrowserInput(request.inputName)
      const sceneName = await this.resolveSceneName(request.sceneName)
      return this.attachManagedInputToScene(input, sceneName, request.sceneItemEnabled)
    })
  }

  async upsertWidgetBrowserSource(
    request: OBSUpsertWidgetBrowserSourceRequest
  ): Promise<OBSUpsertWidgetBrowserSourceResult> {
    return this.runOperation(async () => {
      this.assertConnected()
      const widgetId = normalizeWidgetId(request.widgetId)
      const recommendation = getWidgetBrowserSourceRecommendation(
        { ...request, widgetId },
        this.getOverlayPort(),
        request
      )
      const sceneName = await this.resolveSceneName(request.sceneName)

      // This preflight both validates the scene and makes the later attach
      // decision deterministic. If OBS cannot enumerate a nested container we
      // stop rather than risk adding a duplicate item above it.
      const sceneItems = await this.getSceneTreeItems(sceneName)
      const inputs = await this.getInputRecords()
      const browserInputs = await this.getBrowserInputRecords(inputs, true)
      const matchingInputs = browserInputs.filter((input) => input.widgetId === widgetId)
      const requestedInputName = normalizePreferredInputName(request.inputName)
      const preferredInputName = requestedInputName || makeManagedInputName(request.widgetName)
      const selected = selectPreferredManagedInput(matchingInputs, preferredInputName)
      const duplicateInputNames = matchingInputs
        .filter((input) => input !== selected)
        .map((input) => input.inputName)

      if (selected) {
        const updated = !browserSettingsMatchRecommendation(selected.settings, recommendation)
        if (updated) {
          const inputSettings = makeBrowserInputSettings(recommendation)
          await this.client.call('SetInputSettings', {
            inputName: selected.inputName,
            inputSettings,
            overlay: true
          })
          selected.settings = { ...selected.settings, ...inputSettings }
          selected.url = recommendation.url
        }

        const existingReference = findInputReference(
          sceneItems,
          selected.inputName,
          selected.inputUuid
        )
        let attachment: OBSAttachManagedBrowserSourceResult | null
        const warnings: string[] = []
        if (existingReference) {
          attachment = makeExistingAttachment(selected.inputName, existingReference)
        } else {
          try {
            attachment = await this.createSceneItem(
              selected,
              sceneName,
              request.sceneItemEnabled
            )
          } catch (error) {
            attachment = null
            warnings.push(
              `The browser source was updated, but OBS could not attach it to "${sceneName}": ${errorMessage(error)}`
            )
          }
        }

        return {
          source: this.toManagedBrowserSource(
            selected,
            attachment ? [attachmentToReference(attachment)] : []
          ),
          recommendation,
          created: false,
          updated,
          attachment,
          duplicateInputNames,
          warnings
        }
      }

      return this.createWidgetBrowserSource(
        request,
        widgetId,
        sceneName,
        preferredInputName,
        inputs,
        recommendation
      )
    })
  }

  async repairManagedBrowserSource(
    request: OBSRepairManagedBrowserSourceRequest
  ): Promise<OBSRepairManagedBrowserSourceResult> {
    return this.runOperation(async () => {
      this.assertConnected()
      const input = await this.getManagedBrowserInput(request.inputName)
      const widgetId = normalizeWidgetId(request.widgetId)
      if (input.widgetId !== widgetId) {
        throw new Error(
          `OBS browser source "${input.inputName}" belongs to widget "${input.widgetId}", not "${widgetId}"`
        )
      }

      const recommendation = getWidgetBrowserSourceRecommendation(
        { ...request, widgetId },
        this.getOverlayPort(),
        request
      )
      const repaired = !browserSettingsMatchRecommendation(input.settings, recommendation)
      if (repaired) {
        const inputSettings = makeBrowserInputSettings(recommendation)
        await this.client.call('SetInputSettings', {
          inputName: input.inputName,
          inputSettings,
          overlay: true
        })
        input.settings = { ...input.settings, ...inputSettings }
        input.url = recommendation.url
      }

      return {
        source: this.toManagedBrowserSource(input),
        recommendation,
        repaired
      }
    })
  }

  async refreshManagedBrowserSource(inputName: string): Promise<OBSRefreshManagedBrowserSourceResult> {
    return this.runOperation(async () => {
      this.assertConnected()
      const input = await this.getManagedBrowserInput(inputName)
      await this.client.call('PressInputPropertiesButton', {
        inputName: input.inputName,
        propertyName: 'refreshnocache'
      })
      return { inputName: input.inputName, refreshed: true }
    })
  }

  private async createWidgetBrowserSource(
    request: OBSUpsertWidgetBrowserSourceRequest,
    widgetId: string,
    sceneName: string,
    preferredInputName: string,
    inputs: OBSInputRecord[],
    recommendation: OBSBrowserSourceRecommendation
  ): Promise<OBSUpsertWidgetBrowserSourceResult> {
    const inputName = allocateInputName(preferredInputName, inputs.map((input) => input.inputName))
    const inputSettings = makeBrowserInputSettings(recommendation)
    const warnings: string[] = []

    try {
      const response = await this.client.call('CreateInput', {
        sceneName,
        inputName,
        inputKind: 'browser_source',
        inputSettings,
        sceneItemEnabled: request.sceneItemEnabled ?? true
      }) as { inputUuid?: unknown; sceneItemId?: unknown }
      const sceneItemId = requireSceneItemId(response.sceneItemId, 'CreateInput')
      const createdInput: OBSBrowserInputRecord = {
        inputName,
        inputUuid: typeof response.inputUuid === 'string' ? response.inputUuid : null,
        inputKind: 'browser_source',
        unversionedInputKind: 'browser_source',
        settings: inputSettings,
        widgetId,
        url: recommendation.url
      }
      const attachment: OBSAttachManagedBrowserSourceResult = {
        inputName,
        sceneName,
        containerName: sceneName,
        sceneItemId,
        attached: true,
        alreadyAttached: false,
        nested: false
      }
      return {
        source: this.toManagedBrowserSource(createdInput, [attachmentToReference(attachment)]),
        recommendation,
        created: true,
        updated: false,
        attachment,
        duplicateInputNames: [],
        warnings
      }
    } catch (error) {
      // A WebSocket response can be lost after OBS commits CreateInput. Look
      // once for that exact managed route before reporting failure; never
      // adopt a same-name third-party input.
      const recoveredInputs = await this.getBrowserInputRecords(await this.getInputRecords(), true)
      const recovered = recoveredInputs.find((input) => input.widgetId === widgetId)
      if (!recovered) throw error

      warnings.push(`OBS created the source but did not acknowledge the request: ${errorMessage(error)}`)
      const refreshedSceneItems = await this.getSceneTreeItems(sceneName)
      const existingReference = findInputReference(
        refreshedSceneItems,
        recovered.inputName,
        recovered.inputUuid
      )
      let attachment = existingReference
        ? makeExistingAttachment(recovered.inputName, existingReference)
        : null
      if (!attachment) {
        try {
          attachment = await this.createSceneItem(recovered, sceneName, request.sceneItemEnabled)
        } catch (attachError) {
          warnings.push(`OBS could not attach the recovered source to "${sceneName}": ${errorMessage(attachError)}`)
        }
      }
      return {
        source: this.toManagedBrowserSource(
          recovered,
          attachment ? [attachmentToReference(attachment)] : []
        ),
        recommendation,
        created: true,
        updated: false,
        attachment,
        duplicateInputNames: recoveredInputs
          .filter((input) => input.widgetId === widgetId && input !== recovered)
          .map((input) => input.inputName),
        warnings
      }
    }
  }

  private async inspectManagedBrowserSources(): Promise<OBSManagedBrowserSourceInspection> {
    const warnings: string[] = []
    const inputs = await this.getInputRecords()
    const browserInputs = await this.getBrowserInputRecords(inputs, false, warnings)
    const sceneTrees: SceneTreeItem[] = []

    try {
      const response = await this.client.call('GetSceneList') as {
        scenes?: Array<Record<string, unknown>>
      }
      const sceneNames = Array.isArray(response.scenes)
        ? response.scenes
          .map((scene) => typeof scene.sceneName === 'string' ? scene.sceneName : '')
          .filter(Boolean)
        : []
      for (const sceneName of sceneNames) {
        try {
          sceneTrees.push(...await this.getSceneTreeItems(sceneName))
        } catch (error) {
          warnings.push(`Could not inspect OBS scene "${sceneName}": ${errorMessage(error)}`)
        }
      }
    } catch (error) {
      warnings.push(`Could not inspect OBS scene attachments: ${errorMessage(error)}`)
    }

    return {
      sources: browserInputs.map((input) => this.toManagedBrowserSource(
        input,
        sceneTrees
          .filter((entry) =>
            Number.isInteger(entry.item.sceneItemId)
            && Number(entry.item.sceneItemId) >= 0
            && sceneItemMatchesInput(entry.item, input.inputName, input.inputUuid)
          )
          .map(sceneTreeItemToReference)
      )),
      warnings
    }
  }

  private async getInputRecords(): Promise<OBSInputRecord[]> {
    const response = await this.client.call('GetInputList') as {
      inputs?: Array<Record<string, unknown>>
    }
    if (!Array.isArray(response.inputs)) return []

    return response.inputs.flatMap((input): OBSInputRecord[] => {
      const inputName = typeof input.inputName === 'string' ? input.inputName : ''
      if (!inputName) return []
      return [{
        inputName,
        inputUuid: typeof input.inputUuid === 'string' ? input.inputUuid : null,
        inputKind: typeof input.inputKind === 'string' ? input.inputKind : '',
        unversionedInputKind: typeof input.unversionedInputKind === 'string'
          ? input.unversionedInputKind
          : ''
      }]
    })
  }

  private async getBrowserInputRecords(
    inputs: OBSInputRecord[],
    strict: boolean,
    warnings: string[] = []
  ): Promise<OBSBrowserInputRecord[]> {
    const managedInputs: OBSBrowserInputRecord[] = []

    for (const input of inputs) {
      if (!isBrowserInput(input)) continue
      try {
        const response = await this.client.call('GetInputSettings', {
          inputName: input.inputName
        }) as { inputSettings?: unknown }
        const settings = isRecord(response.inputSettings) ? response.inputSettings : {}
        const url = typeof settings.url === 'string' ? settings.url : ''
        const widgetId = getIlyStreamOverlayWidgetId(url, this.getOverlayPort())
        if (!widgetId) continue
        managedInputs.push({ ...input, settings, widgetId, url })
      } catch (error) {
        const message = `Could not inspect OBS browser source "${input.inputName}": ${errorMessage(error)}`
        if (strict) throw new Error(message)
        warnings.push(message)
      }
    }

    return managedInputs
  }

  private async getManagedBrowserInput(inputNameValue: string): Promise<OBSBrowserInputRecord> {
    const inputName = normalizeRequiredName(inputNameValue, 'inputName')
    const input = (await this.getInputRecords()).find((candidate) => candidate.inputName === inputName)
    if (!input) throw new Error(`OBS input "${inputName}" was not found`)
    if (!isBrowserInput(input)) {
      throw new Error(`OBS input "${inputName}" is not a browser source`)
    }

    const response = await this.client.call('GetInputSettings', { inputName }) as {
      inputSettings?: unknown
    }
    const settings = isRecord(response.inputSettings) ? response.inputSettings : {}
    const url = typeof settings.url === 'string' ? settings.url : ''
    const widgetId = getIlyStreamOverlayWidgetId(url, this.getOverlayPort())
    if (!widgetId) {
      throw new Error(
        `OBS browser source "${inputName}" is not a managed ilyStream loopback overlay`
      )
    }
    return { ...input, settings, widgetId, url }
  }

  private async resolveSceneName(sceneNameValue?: string): Promise<string> {
    if (sceneNameValue !== undefined) return normalizeRequiredName(sceneNameValue, 'sceneName')

    const response = await this.client.call('GetCurrentProgramScene') as {
      currentProgramSceneName?: unknown
    }
    return normalizeRequiredName(response.currentProgramSceneName, 'current OBS program scene')
  }

  private async getSceneTreeItems(sceneName: string): Promise<SceneTreeItem[]> {
    const rootSceneName = normalizeRequiredName(sceneName, 'sceneName')
    const entries: SceneTreeItem[] = []
    const visited = new Set<string>()

    const visit = async (
      containerName: string,
      containerType: 'scene' | 'group',
      nested: boolean
    ): Promise<void> => {
      const visitKey = `${containerType}:${containerName}`
      if (visited.has(visitKey)) return
      visited.add(visitKey)

      const requestType = containerType === 'group'
        ? 'GetGroupSceneItemList'
        : 'GetSceneItemList'
      const response = await this.client.call(requestType, {
        sceneName: containerName
      }) as { sceneItems?: unknown }
      const sceneItems = Array.isArray(response.sceneItems)
        ? response.sceneItems.filter(isRecord) as SceneItemRecord[]
        : []

      for (const item of sceneItems) {
        entries.push({
          sceneName: rootSceneName,
          containerName,
          nested,
          item
        })
        const sourceName = typeof item.sourceName === 'string' ? item.sourceName : ''
        if (!sourceName) continue
        if (item.isGroup === true) {
          await visit(sourceName, 'group', true)
        } else if (item.sourceType === 'OBS_SOURCE_TYPE_SCENE') {
          await visit(sourceName, 'scene', true)
        }
      }
    }

    await visit(rootSceneName, 'scene', false)
    return entries
  }

  private async attachManagedInputToScene(
    input: OBSBrowserInputRecord,
    sceneName: string,
    sceneItemEnabled?: boolean
  ): Promise<OBSAttachManagedBrowserSourceResult> {
    const sceneItems = await this.getSceneTreeItems(sceneName)
    const existingReference = findInputReference(sceneItems, input.inputName, input.inputUuid)
    if (existingReference) return makeExistingAttachment(input.inputName, existingReference)
    return this.createSceneItem(input, sceneName, sceneItemEnabled)
  }

  private async createSceneItem(
    input: OBSBrowserInputRecord,
    sceneName: string,
    sceneItemEnabled?: boolean
  ): Promise<OBSAttachManagedBrowserSourceResult> {
    const response = await this.client.call('CreateSceneItem', {
      sceneName,
      ...(input.inputUuid ? { sourceUuid: input.inputUuid } : { sourceName: input.inputName }),
      sceneItemEnabled: sceneItemEnabled ?? true
    }) as { sceneItemId?: unknown }
    return {
      inputName: input.inputName,
      sceneName,
      containerName: sceneName,
      sceneItemId: requireSceneItemId(response.sceneItemId, 'CreateSceneItem'),
      attached: true,
      alreadyAttached: false,
      nested: false
    }
  }

  private toManagedBrowserSource(
    input: OBSBrowserInputRecord,
    sceneReferences: OBSManagedBrowserSourceSceneReference[] = []
  ): OBSManagedBrowserSource {
    return {
      inputName: input.inputName,
      inputUuid: input.inputUuid,
      widgetId: input.widgetId,
      url: input.url,
      width: readPositiveInteger(input.settings.width),
      height: readPositiveInteger(input.settings.height),
      fps: readPositiveInteger(input.settings.fps),
      fpsCustom: input.settings.fps_custom === true,
      sceneReferences
    }
  }

  private assertConnected(): void {
    if (!this.isConnected()) throw new Error('OBS is not connected')
  }

  private runOperation<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.operationQueue.then(operation)
    this.operationQueue = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }
}

export function getWidgetBrowserSourceRecommendation(
  widget: OBSWidgetBrowserSourceSpec,
  overlayPort = 8899,
  overrides: { width?: number; height?: number; fps?: number } = {}
): OBSBrowserSourceRecommendation {
  if (!Number.isInteger(overlayPort) || overlayPort < 1 || overlayPort > 65_535) {
    throw new Error('overlayPort must be an integer between 1 and 65535')
  }
  const widgetId = normalizeWidgetId(widget.widgetId)
  const config = isRecord(widget.widgetConfig) ? widget.widgetConfig : {}
  const configuredPortrait = config.forceTikTokDimensions === true || config.aspectRatio === 'tiktok'
  const configuredLandscape = config.aspectRatio === 'landscape'
  let naturalSize = WIDGET_BROWSER_SOURCE_SIZES[widget.widgetType]
    ?? DEFAULT_WIDGET_BROWSER_SOURCE_SIZE

  if (configuredPortrait) {
    naturalSize = { width: 1080, height: 1920 }
  } else if (configuredLandscape) {
    naturalSize = DEFAULT_WIDGET_BROWSER_SOURCE_SIZE
  } else if (widget.widgetType === 'text') {
    naturalSize = {
      width: clampInteger(config.canvasWidth, 240, 1920, naturalSize.width),
      height: clampInteger(config.canvasHeight, 80, 1080, naturalSize.height)
    }
  } else if (widget.widgetType === 'discord-call') {
    naturalSize = {
      width: clampInteger(config.panelWidth, 240, 1200, naturalSize.width),
      height: clampInteger(config.panelMaxHeight, 140, 900, naturalSize.height)
    }
  }

  return {
    url: `http://127.0.0.1:${overlayPort}/overlay/${widgetId}`,
    width: clampInteger(overrides.width, 1, MAX_BROWSER_SOURCE_DIMENSION, naturalSize.width),
    height: clampInteger(overrides.height, 1, MAX_BROWSER_SOURCE_DIMENSION, naturalSize.height),
    fps: clampInteger(overrides.fps, 1, 60, DEFAULT_WIDGET_BROWSER_SOURCE_FPS)
  }
}

export function isIlyStreamOverlayUrl(value: unknown, overlayPort = 8899): boolean {
  return getIlyStreamOverlayWidgetId(value, overlayPort) !== null
}

function getIlyStreamOverlayWidgetId(value: unknown, overlayPort: number): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  if (!Number.isInteger(overlayPort) || overlayPort < 1 || overlayPort > 65_535) return null

  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    const isLoopback = hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]'
    const match = /^\/overlay\/([^/]+)\/?$/i.exec(url.pathname)
    if (
      url.protocol !== 'http:'
      || !isLoopback
      || url.username
      || url.password
      || Number(url.port || 80) !== overlayPort
      || !match
    ) {
      return null
    }

    const decoded = decodeURIComponent(match[1])
      .replace(/\.html?$/i, '')
      .trim()
      .toLowerCase()
    if (!decoded || /[\\/?#]/.test(decoded)) return null
    return decoded
  } catch {
    return null
  }
}

function makeBrowserInputSettings(recommendation: OBSBrowserSourceRecommendation) {
  return {
    url: recommendation.url,
    width: recommendation.width,
    height: recommendation.height,
    fps: recommendation.fps,
    fps_custom: true,
    is_local_file: false,
    shutdown: false,
    restart_when_active: false
  }
}

function browserSettingsMatchRecommendation(
  settings: Record<string, unknown>,
  recommendation: OBSBrowserSourceRecommendation
): boolean {
  return settings.url === recommendation.url
    && readPositiveInteger(settings.width) === recommendation.width
    && readPositiveInteger(settings.height) === recommendation.height
    && readPositiveInteger(settings.fps) === recommendation.fps
    && settings.fps_custom === true
    && settings.is_local_file !== true
    && settings.shutdown !== true
    && settings.restart_when_active !== true
}

function selectPreferredManagedInput(
  inputs: OBSBrowserInputRecord[],
  preferredInputName: string
): OBSBrowserInputRecord | undefined {
  return inputs.find((input) => input.inputName === preferredInputName)
    ?? inputs.find((input) => input.inputName.toLowerCase() === preferredInputName.toLowerCase())
    ?? inputs[0]
}

function allocateInputName(preferredName: string, existingNames: string[]): string {
  const used = new Set(existingNames.map((name) => name.toLowerCase()))
  if (!used.has(preferredName.toLowerCase())) return preferredName

  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const suffixText = ` (${suffix})`
    const base = preferredName.slice(0, MAX_BROWSER_SOURCE_NAME_LENGTH - suffixText.length).trimEnd()
    const candidate = `${base}${suffixText}`
    if (!used.has(candidate.toLowerCase())) return candidate
  }
  throw new Error(`Could not allocate an OBS input name for "${preferredName}"`)
}

function makeManagedInputName(widgetNameValue: unknown): string {
  const widgetName = typeof widgetNameValue === 'string'
    ? widgetNameValue
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    : ''
  const label = widgetName || 'Widget'
  const name = /^ilystream(?:\b|\s*[-|:])/i.test(label) ? label : `ilyStream - ${label}`
  return name.slice(0, MAX_BROWSER_SOURCE_NAME_LENGTH).trim()
}

function normalizeWidgetId(value: unknown): string {
  if (typeof value !== 'string') throw new Error('widgetId is required')
  const widgetId = value.trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(widgetId)) {
    throw new Error('widgetId must contain only letters, numbers, underscores, or hyphens')
  }
  return widgetId
}

function normalizePreferredInputName(value: unknown): string | null {
  if (value === undefined) return null
  const name = normalizeRequiredName(value, 'inputName')
  return name.slice(0, MAX_BROWSER_SOURCE_NAME_LENGTH).trim()
}

function normalizeRequiredName(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  const name = value.trim()
  if (/[\u0000-\u001f\u007f]/.test(name)) throw new Error(`${label} contains unsupported characters`)
  return name
}

function isBrowserInput(input: OBSInputRecord): boolean {
  return input.inputKind === 'browser_source' || input.unversionedInputKind === 'browser_source'
}

function sceneItemMatchesInput(
  item: SceneItemRecord,
  inputName: string,
  inputUuid: string | null
): boolean {
  if (inputUuid && typeof item.sourceUuid === 'string' && item.sourceUuid === inputUuid) return true
  return item.sourceName === inputName
}

function findInputReference(
  sceneItems: SceneTreeItem[],
  inputName: string,
  inputUuid: string | null
): SceneTreeItem | undefined {
  return sceneItems.find((entry) =>
    Number.isInteger(entry.item.sceneItemId)
    && Number(entry.item.sceneItemId) >= 0
    && sceneItemMatchesInput(entry.item, inputName, inputUuid)
  )
}

function sceneTreeItemToReference(entry: SceneTreeItem): OBSManagedBrowserSourceSceneReference {
  return {
    sceneName: entry.sceneName,
    containerName: entry.containerName,
    sceneItemId: Number(entry.item.sceneItemId),
    nested: entry.nested
  }
}

function makeExistingAttachment(
  inputName: string,
  entry: SceneTreeItem
): OBSAttachManagedBrowserSourceResult {
  return {
    inputName,
    sceneName: entry.sceneName,
    containerName: entry.containerName,
    sceneItemId: requireSceneItemId(entry.item.sceneItemId, 'GetSceneItemList'),
    attached: false,
    alreadyAttached: true,
    nested: entry.nested
  }
}

function attachmentToReference(
  attachment: OBSAttachManagedBrowserSourceResult
): OBSManagedBrowserSourceSceneReference {
  return {
    sceneName: attachment.sceneName,
    containerName: attachment.containerName,
    sceneItemId: attachment.sceneItemId,
    nested: attachment.nested
  }
}

function requireSceneItemId(value: unknown, requestName: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`${requestName} did not return a valid scene item ID`)
  }
  return Number(value)
}

function readPositiveInteger(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null
}

function clampInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(minimum, Math.min(maximum, Math.round(number)))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
