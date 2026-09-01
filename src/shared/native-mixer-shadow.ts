export type NativeMixerMonitoringMode = 'off' | 'monitorOnly' | 'monitorAndOutput'

export interface NativeMixerShadowSource {
  id: string
  volume: number
  pan: number
  muted: boolean
  solo: boolean
  global: boolean
  mono: boolean
  monitoringMode: NativeMixerMonitoringMode
}

export interface NativeMixerShadowTransition {
  active: boolean
  type: 'fade' | 'stinger'
  progress: number
  fromLayerIds: string[]
  toLayerIds: string[]
}

export interface NativeMixerRouteDecision {
  id: string
  eligible: boolean
  output: boolean
  sceneGain: number
  effectiveGain: number
}

export interface NativeMixerHostRequest {
  sequence: number
  sources: NativeMixerShadowSource[]
  activeLayerIds: string[]
  retainedLayerIds: string[]
  transition?: NativeMixerShadowTransition
}

export interface NativeMixerShadowSnapshot extends NativeMixerHostRequest {
  expected: NativeMixerRouteDecision[]
}

export interface NativeMixerShadowResult {
  sequence: number
  routes: NativeMixerRouteDecision[]
}

const MAX_SOURCES = 64
const MAX_LAYER_IDS = 128
const ID_PATTERN = /^[\x20-\x7e]{1,128}$/
const MONITORING_MODES = new Set<NativeMixerMonitoringMode>(['off', 'monitorOnly', 'monitorAndOutput'])

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function finiteInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
}

function parseId(value: unknown): string | null {
  return typeof value === 'string' && ID_PATTERN.test(value) ? value : null
}

function parseIdList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_LAYER_IDS) return null
  const result: string[] = []
  const seen = new Set<string>()
  for (const candidate of value) {
    const id = parseId(candidate)
    if (!id || seen.has(id)) return null
    seen.add(id)
    result.push(id)
  }
  return result
}

function parseSource(value: unknown): NativeMixerShadowSource | null {
  const input = record(value)
  if (!input) return null
  const id = parseId(input.id)
  if (
    !id || !finiteInRange(input.volume, 0, 2) || !finiteInRange(input.pan, -1, 1) ||
    typeof input.muted !== 'boolean' || typeof input.solo !== 'boolean' ||
    typeof input.global !== 'boolean' || typeof input.mono !== 'boolean' ||
    typeof input.monitoringMode !== 'string' ||
    !MONITORING_MODES.has(input.monitoringMode as NativeMixerMonitoringMode)
  ) return null
  const global = id === 'soundboard' || id === 'tts-audio'
  if (input.global !== global) return null
  return {
    id,
    volume: input.volume,
    pan: input.pan,
    muted: input.muted,
    solo: input.solo,
    global,
    mono: input.mono,
    monitoringMode: input.monitoringMode as NativeMixerMonitoringMode
  }
}

function parseRoute(value: unknown): NativeMixerRouteDecision | null {
  const input = record(value)
  if (!input) return null
  const id = parseId(input.id)
  if (
    !id || typeof input.eligible !== 'boolean' || typeof input.output !== 'boolean' ||
    !finiteInRange(input.sceneGain, 0, 1) || !finiteInRange(input.effectiveGain, 0, 2)
  ) return null
  return {
    id,
    eligible: input.eligible,
    output: input.output,
    sceneGain: input.sceneGain,
    effectiveGain: input.effectiveGain
  }
}

function parseTransition(value: unknown): NativeMixerShadowTransition | null {
  const input = record(value)
  if (!input || typeof input.active !== 'boolean' ||
      (input.type !== 'fade' && input.type !== 'stinger') ||
      !finiteInRange(input.progress, 0, 1)) return null
  const fromLayerIds = parseIdList(input.fromLayerIds)
  const toLayerIds = parseIdList(input.toLayerIds)
  if (!fromLayerIds || !toLayerIds) return null
  return { active: input.active, type: input.type, progress: input.progress, fromLayerIds, toLayerIds }
}

function parseHostRequest(value: unknown): NativeMixerHostRequest | null {
  const input = record(value)
  if (!input || !Number.isSafeInteger(input.sequence) || (input.sequence as number) <= 0 ||
      !Array.isArray(input.sources) || input.sources.length > MAX_SOURCES) return null
  const sources: NativeMixerShadowSource[] = []
  const sourceIds = new Set<string>()
  for (const candidate of input.sources) {
    const source = parseSource(candidate)
    if (!source || sourceIds.has(source.id)) return null
    sourceIds.add(source.id)
    sources.push(source)
  }
  const activeLayerIds = parseIdList(input.activeLayerIds)
  const retainedLayerIds = parseIdList(input.retainedLayerIds)
  if (!activeLayerIds || !retainedLayerIds) return null
  const transition = input.transition === undefined ? undefined : parseTransition(input.transition)
  if (input.transition !== undefined && !transition) return null
  return { sequence: input.sequence as number, sources, activeLayerIds, retainedLayerIds, ...(transition ? { transition } : {}) }
}

export function parseNativeMixerShadowSnapshot(value: unknown): NativeMixerShadowSnapshot | null {
  const input = record(value)
  const request = parseHostRequest(value)
  if (!input || !request || !Array.isArray(input.expected) || input.expected.length !== request.sources.length) {
    return null
  }
  const expected: NativeMixerRouteDecision[] = []
  for (let index = 0; index < input.expected.length; index++) {
    const route = parseRoute(input.expected[index])
    if (!route || route.id !== request.sources[index].id) return null
    expected.push(route)
  }
  return { ...request, expected }
}

export function toNativeMixerHostRequest(snapshot: NativeMixerShadowSnapshot): NativeMixerHostRequest {
  const { expected: _expected, ...request } = snapshot
  return request
}

export function parseNativeMixerShadowResult(value: unknown): NativeMixerShadowResult | null {
  const input = record(value)
  if (!input || !Number.isSafeInteger(input.sequence) || (input.sequence as number) <= 0 ||
      !Array.isArray(input.routes) || input.routes.length > MAX_SOURCES) return null
  const routes: NativeMixerRouteDecision[] = []
  const ids = new Set<string>()
  for (const candidate of input.routes) {
    const route = parseRoute(candidate)
    if (!route || ids.has(route.id)) return null
    ids.add(route.id)
    routes.push(route)
  }
  return { sequence: input.sequence as number, routes }
}

export function compareNativeMixerShadow(
  snapshot: NativeMixerShadowSnapshot,
  result: NativeMixerShadowResult,
  tolerance = 1e-5
): string | null {
  if (result.sequence !== snapshot.sequence) return 'sequence mismatch'
  if (result.routes.length !== snapshot.expected.length) return 'route count mismatch'
  for (let index = 0; index < snapshot.expected.length; index++) {
    const expected = snapshot.expected[index]
    const actual = result.routes[index]
    if (actual.id !== expected.id) return `route ${index} ID mismatch`
    if (actual.eligible !== expected.eligible) return `${expected.id} eligibility mismatch`
    if (actual.output !== expected.output) return `${expected.id} output mismatch`
    if (Math.abs(actual.sceneGain - expected.sceneGain) > tolerance) return `${expected.id} scene gain mismatch`
    if (Math.abs(actual.effectiveGain - expected.effectiveGain) > tolerance) return `${expected.id} effective gain mismatch`
  }
  return null
}
