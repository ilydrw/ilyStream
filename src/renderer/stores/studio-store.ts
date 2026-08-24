import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AudioSource, StudioState, StudioScene, StudioLayer } from '../../shared/studio'
import { DEFAULT_STUDIO_STATE, normalizeAudioMonitoringMode } from '../../shared/studio'
import { resolveTransitionTiming } from '../../shared/studio-transition'

interface StudioStore extends StudioState {
  selectedLayerId: string | null
  selectedAudioSourceId: string | null
  audioSources: AudioSource[]
  masterBus: AudioSource
  routing: Record<string, string> // sourceId -> targetSourceId (usually Master)
  clipboardLayer: StudioLayer | null
  studioMode: boolean
  previewSceneId: string | null
  past: string[]
  future: string[]

  setSelectedLayer: (id: string | null) => void
  setSelectedAudioSource: (id: string | null) => void
  setAspectRatio: (ratio: '16:9' | '9:16') => void
  addScene: (name: string, layoutMode?: string) => void
  removeScene: (id: string) => void
  renameScene: (id: string, name: string) => void
  duplicateScene: (id: string) => void
  setActiveScene: (id: string) => void
  setPreviewScene: (id: string | null) => void
  toggleStudioMode: () => void
  transition: (type?: 'cut' | 'fade' | 'stinger') => void
  transitionDuration: number
  transitionState: {
    fromSceneId: string | null
    toSceneId: string | null
    progress: number
    isActive: boolean
    type: 'fade' | 'stinger'
  }
  updateTransitionProgress: (progress: number) => void
  completeTransition: () => void

  setTransitionDuration: (duration: number) => void
  setStingerPath: (path: string) => void
  setStingerCutPoint: (ms: number) => void
  setStingerDuration: (ms: number) => void
  setRecordingSettings: (settings: Partial<StudioState['recordingSettings']>) => void
  setAudioReactivity: (settings: Partial<StudioState['audioReactivity']>) => void

  addLayer: (
    sceneId: string,
    layer: Omit<StudioLayer, 'id' | 'zIndex' | 'portraitX' | 'portraitY' | 'portraitWidth' | 'portraitHeight' | 'portraitVisible' | 'portraitLocked'> &
      Partial<Pick<StudioLayer, 'id' | 'portraitX' | 'portraitY' | 'portraitWidth' | 'portraitHeight' | 'portraitRotation' | 'portraitVisible' | 'portraitLocked' | 'portraitCrop'>>
  ) => void
  updateLayer: (sceneId: string, layerId: string, updates: Partial<StudioLayer>) => void
  removeLayer: (sceneId: string, layerId: string) => void
  reorderLayer: (sceneId: string, layerId: string, newIndex: number) => void
  duplicateLayer: (sceneId: string, layerId: string) => void

  undo: () => void
  redo: () => void
  copyLayer: (sceneId: string, layerId: string) => void
  pasteLayer: (sceneId: string) => void
  cutLayer: (sceneId: string, layerId: string) => void
  saveHistory: () => void
  toggleSnapToGrid: () => void
  setGridSize: (size: number) => void
  updateAudioSource: (id: string, updates: Partial<AudioSource>) => void
  removeAudioSource: (id: string) => void
  reorderAudioSource: (oldIndex: number, newIndex: number) => void
  mixerSidebarWidth: number
  setMixerSidebarWidth: (width: number) => void

  showEnhancementModal: boolean
  enhancingLayerId: string | null
  setShowEnhancementModal: (show: boolean, layerId?: string | null) => void
}

export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20)
}

export function linearToDb(linear: number): number {
  return 20 * Math.log10(Math.max(linear, 0.0001))
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function normalizeChannelMode(value: unknown, fallback: AudioSource['channelMode']): AudioSource['channelMode'] {
  return value === 'mono' || value === 'stereo' ? value : fallback
}

function normalizeTrackColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : undefined
}

export function normalizeAudioSource(source: AudioSource): AudioSource {
  const fallbackMode: AudioSource['channelMode'] = source.type === 'mic' ? 'mono' : 'stereo'
  const monitoringMode = normalizeAudioMonitoringMode(source.monitoringMode, source.monitoring)
  return {
    ...source,
    color: normalizeTrackColor((source as any).color),
    volume: clamp(Number(source.volume ?? 0.8), 0, 2),
    muted: Boolean(source.muted),
    monitoringMode,
    // Keep the legacy field synchronized for older pages and persisted state.
    monitoring: monitoringMode !== 'off',
    solo: Boolean(source.solo),
    locked: source.id === 'mic-audio' ? false : source.locked,
    channelMode: normalizeChannelMode((source as any).channelMode, fallbackMode),
    pan: clamp(Number(source.pan ?? 0), -1, 1),
    filters: Array.isArray(source.filters) ? source.filters : ((source as any).fxChain || [])
  }
}

function requiredDefaultAudioSources(): AudioSource[] {
  return DEFAULT_STUDIO_STATE.audioSources.filter(source => source.locked)
}

const syncChannel = new BroadcastChannel('ilystream-studio-sync')

// Coalesce the storm of setState writes during a drag/resize/rotate (updateLayer
// fires on every mouse-move frame) into a single trailing write. Previously this
// object — despite its name — did NO debouncing: every frame ran a synchronous
// localStorage.setItem AND a synchronous SQLite write over IPC, stuttering the
// canvas while dragging a source live on air.
const PERSIST_DEBOUNCE_MS = 400
const pendingWrites = new Map<string, string>()
let persistTimer: ReturnType<typeof setTimeout> | null = null

function flushPendingWrites(): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  for (const [name, value] of pendingWrites) {
    localStorage.setItem(name, value)
    try {
      const parsed = JSON.parse(value)
      if (parsed.state && window.api?.studio?.saveState) {
        window.api.studio.saveState(parsed.state)
      }
    } catch (err) {
      console.error('[StudioStore] Failed to parse state for DB persistence', err)
    }
  }
  pendingWrites.clear()
}

const debouncedStorage = {
  // Serve a not-yet-flushed value so any read stays consistent with the latest set.
  getItem: (name: string) => pendingWrites.get(name) ?? localStorage.getItem(name),
  setItem: (name: string, value: string) => {
    pendingWrites.set(name, value)
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(flushPendingWrites, PERSIST_DEBOUNCE_MS)
  },
  removeItem: (name: string) => {
    pendingWrites.delete(name)
    localStorage.removeItem(name)
  },
}

// Never lose the final edit: flush synchronously when the window goes away.
if (typeof window !== 'undefined') {
  const flushOnExit = () => { if (persistTimer) flushPendingWrites() }
  window.addEventListener('beforeunload', flushOnExit)
  window.addEventListener('pagehide', flushOnExit)
}

export const useStudioStore = create<StudioStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STUDIO_STATE,
      selectedLayerId: null,
      selectedAudioSourceId: 'master',
      // audioSources initialized via DEFAULT_STUDIO_STATE spread above
      masterBus: {
        id: 'master',
        name: 'Master',
        type: 'system',
        volume: 0.8,
        muted: false,
        monitoringMode: 'off',
        monitoring: false,
        solo: false,
        channelMode: 'stereo',
        pan: 0,
        filters: []
      },
      routing: {},
      clipboardLayer: null,
      studioMode: false,
      previewSceneId: null,
      past: [],
      future: [],
      mixerSidebarWidth: 320,
      transitionDuration: 300,
      transitionState: {
        fromSceneId: null,
        toSceneId: null,
        progress: 0,
        isActive: false,
        type: 'fade'
      },
      showEnhancementModal: false,
      enhancingLayerId: null,


      setMixerSidebarWidth: (width: number) => set({ mixerSidebarWidth: width }),

      setShowEnhancementModal: (show, layerId = null) => set(s => ({
        showEnhancementModal: show,
        enhancingLayerId: layerId !== undefined ? layerId : s.enhancingLayerId
      })),

      saveHistory: () => {
        const state = get()
        set((s) => ({
          past: [...s.past.slice(-19), JSON.stringify({ scenes: state.scenes, audioSources: state.audioSources, masterBus: state.masterBus })],
          future: []
        }))
      },

      undo: () => {
        const { past, scenes, audioSources, masterBus, future } = get()
        if (past.length === 0) return
        const previousState = JSON.parse(past[past.length - 1])
        set({
          scenes: previousState.scenes,
          audioSources: previousState.audioSources,
          masterBus: previousState.masterBus,
          past: past.slice(0, -1),
          future: [JSON.stringify({ scenes, audioSources, masterBus }), ...future.slice(0, 19)]
        })
      },

      redo: () => {
        const { past, scenes, audioSources, masterBus, future } = get()
        if (future.length === 0) return
        const nextState = JSON.parse(future[0])
        set({
          scenes: nextState.scenes,
          audioSources: nextState.audioSources,
          masterBus: nextState.masterBus,
          past: [...past.slice(-19), JSON.stringify({ scenes, audioSources, masterBus })],
          future: future.slice(1)
        })
      },

      copyLayer: (sceneId, layerId) => {
        const { scenes } = get()
        const scene = scenes.find(s => s.id === sceneId)
        if (!scene) return
        const layer = scene.layers.find(l => l.id === layerId)
        if (!layer) return
        set({ clipboardLayer: JSON.parse(JSON.stringify(layer)) })
      },

      pasteLayer: (sceneId) => {
        const { clipboardLayer, scenes, saveHistory, aspectRatio } = get()
        if (!clipboardLayer) return
        saveHistory()
        const scene = scenes.find(s => s.id === sceneId)
        if (!scene) return

        const isPortrait = aspectRatio === '9:16'
        const newLayer: StudioLayer = {
          ...clipboardLayer,
          id: crypto.randomUUID(),
          name: `${clipboardLayer.name} (Paste)`,
          zIndex: scene.layers.length
        }

        if (isPortrait) {
          newLayer.portraitX = (Number(clipboardLayer.portraitX) || 0) + 20
          newLayer.portraitY = (Number(clipboardLayer.portraitY) || 0) + 20
        } else {
          newLayer.x = (Number(clipboardLayer.x) || 0) + 20
          newLayer.y = (Number(clipboardLayer.y) || 0) + 20
        }

        set({
          scenes: scenes.map(sc => sc.id === sceneId ? { ...sc, layers: [...sc.layers, newLayer] } : sc),
          selectedLayerId: newLayer.id
        })
      },

      cutLayer: (sceneId, layerId) => {
        const { copyLayer, removeLayer } = get()
        copyLayer(sceneId, layerId); removeLayer(sceneId, layerId)
      },

      setSelectedLayer: (id) => set({ selectedLayerId: id }),
      setSelectedAudioSource: (id) => set({ selectedAudioSourceId: id }),

      setAspectRatio: (ratio) => {
        const width = ratio === '16:9' ? 1920 : 1080
        const height = ratio === '16:9' ? 1080 : 1920
        set({ aspectRatio: ratio, canvasWidth: width, canvasHeight: height })
      },

      addScene: (name, layoutMode) => {
        const { saveHistory, scenes, activeSceneId } = get()
        saveHistory()
        const newScene: StudioScene = { id: crypto.randomUUID(), name, layers: [], layoutMode }
        set({ scenes: [...scenes, newScene], activeSceneId: activeSceneId || newScene.id })
      },

      removeScene: (id) => {
        const { saveHistory, scenes, activeSceneId } = get()
        saveHistory()
        const nextScenes = scenes.filter(s => s.id !== id)
        if (nextScenes.length === 0) return
        let nextActive = activeSceneId
        if (nextActive === id) nextActive = nextScenes[0]?.id || null
        set({ scenes: nextScenes, activeSceneId: nextActive, selectedLayerId: null })
      },

      renameScene: (id, name) => {
        const { scenes } = get()
        set({ scenes: scenes.map(s => s.id === id ? { ...s, name } : s) })
      },

      duplicateScene: (id) => {
        const { saveHistory, scenes } = get()
        saveHistory()
        const scene = scenes.find(s => s.id === id)
        if (!scene) return
        const newScene: StudioScene = {
          id: crypto.randomUUID(),
          name: `${scene.name} (Copy)`,
          layers: scene.layers.map(l => ({ ...l, id: crypto.randomUUID() }))
        }
        set({ scenes: [...scenes, newScene] })
      },

      setActiveScene: (id) => {
        const { studioMode, transitionState } = get()
        if (transitionState.isActive) return
        if (studioMode) {
          set({ previewSceneId: id })
        } else {
          set({ activeSceneId: id, selectedLayerId: null })
        }
      },

      setPreviewScene: (id) => {
        if (get().transitionState.isActive) return
        set({ previewSceneId: id })
      },

      toggleStudioMode: () => set(state => {
        if (state.transitionState.isActive) return state
        const studioMode = !state.studioMode
        return {
          studioMode,
          previewSceneId: studioMode ? (state.previewSceneId || state.activeSceneId) : state.previewSceneId
        }
      }),

      transition: (type = 'cut') => {
        const state = get()
        if (state.transitionState.isActive) return
        if (!state.previewSceneId || state.previewSceneId === state.activeSceneId) return

        const effectiveType = type === 'stinger' && !state.stingerSettings.path ? 'cut' : type
        const fromSceneId = state.activeSceneId
        const toSceneId = state.previewSceneId

        if (effectiveType === 'cut') {
          set({ activeSceneId: toSceneId, previewSceneId: fromSceneId, selectedLayerId: null })
          get().saveHistory()
          return
        }

        const timing = resolveTransitionTiming(
          effectiveType,
          state.transitionDuration,
          state.stingerSettings.duration,
          state.stingerSettings.cutPoint
        )

        set({
          transitionState: {
            fromSceneId,
            toSceneId,
            progress: 0,
            isActive: true,
            type: effectiveType as 'fade' | 'stinger'
          }
        })

        const start = performance.now()
        let cutDone = false

        const animate = (now: number) => {
          const elapsed = now - start
          const progress = Math.min(1, elapsed / timing.durationMs)

          // For stinger, check cut point
          if (effectiveType === 'stinger' && !cutDone && elapsed >= timing.cutAtMs) {
            cutDone = true
            set({
              activeSceneId: toSceneId,
              previewSceneId: fromSceneId,
              selectedLayerId: null
            })
          }

          if (progress < 1) {
            set(s => ({ transitionState: { ...s.transitionState, progress } }))
            requestAnimationFrame(animate)
          } else {
            // For fade, the swap happens at the end
            if (effectiveType === 'fade' || !cutDone) {
              set({
                activeSceneId: toSceneId,
                previewSceneId: fromSceneId,
                selectedLayerId: null
              })
            }

            set({
              transitionState: { fromSceneId: null, toSceneId: null, progress: 0, isActive: false, type: 'fade' }
            })
            get().saveHistory()
          }
        }
        requestAnimationFrame(animate)
      },
      updateTransitionProgress: (progress) => set(s => ({ transitionState: { ...s.transitionState, progress } })),
      completeTransition: () => set(s => ({
        activeSceneId: s.transitionState.toSceneId || s.activeSceneId,
        transitionState: { fromSceneId: null, toSceneId: null, progress: 0, isActive: false, type: 'fade' }
      })),

      setTransitionDuration: (duration) => set({ transitionDuration: Math.max(1, Math.round(Number(duration) || 300)) }),
      setStingerPath: (path) => set(s => ({ stingerSettings: { ...s.stingerSettings, path } })),
      setStingerCutPoint: (cutPoint) => set(s => ({
        stingerSettings: {
          ...s.stingerSettings,
          cutPoint: Math.min(s.stingerSettings.duration, Math.max(0, Math.round(Number(cutPoint) || 0)))
        }
      })),
      setStingerDuration: (duration) => set(state => {
        const nextDuration = Math.max(1, Math.round(Number(duration) || 1000))
        return {
          stingerSettings: {
            ...state.stingerSettings,
            duration: nextDuration,
            cutPoint: Math.min(nextDuration, state.stingerSettings.cutPoint)
          }
        }
      }),

      setRecordingSettings: (settings: Partial<StudioState['recordingSettings']>) => set(state => ({
        recordingSettings: { ...state.recordingSettings, ...settings }
      })),

      setAudioReactivity: (settings: Partial<StudioState['audioReactivity']>) => set(state => ({
        audioReactivity: { ...state.audioReactivity, ...settings }
      })),

      addLayer: (sceneId, layerData) => {
        const { saveHistory, scenes } = get()
        saveHistory()
        const scene = scenes.find(s => s.id === sceneId)
        if (!scene) return

        const portraitX = (layerData as any).portraitX
        const portraitY = (layerData as any).portraitY
        const portraitWidth = (layerData as any).portraitWidth
        const portraitHeight = (layerData as any).portraitHeight
        const portraitVisible = (layerData as any).portraitVisible
        const portraitLocked = (layerData as any).portraitLocked

        // Initialize portrait values from explicit presets when provided; otherwise
        // derive a conservative vertical layout from the landscape transform.
        const newLayer: StudioLayer = {
          ...layerData,
          id: (layerData as any).id || crypto.randomUUID(),
          zIndex: scene.layers.length,
          portraitX: Number.isFinite(portraitX) ? portraitX : Math.round(layerData.x * 0.5),
          portraitY: Number.isFinite(portraitY) ? portraitY : layerData.y,
          portraitWidth: Number.isFinite(portraitWidth) ? portraitWidth : Math.round(layerData.width * 0.6),
          portraitHeight: Number.isFinite(portraitHeight) ? portraitHeight : Math.round(layerData.height * 0.6),
          portraitRotation: (layerData as any).portraitRotation ?? (layerData as any).rotation ?? 0,
          portraitVisible: typeof portraitVisible === 'boolean' ? portraitVisible : layerData.visible,
          portraitLocked: typeof portraitLocked === 'boolean' ? portraitLocked : layerData.locked
        }

        set({
          scenes: scenes.map(s => s.id === sceneId ? { ...s, layers: [...s.layers, newLayer] } : s),
          selectedLayerId: newLayer.id
        })
      },

      updateLayer: (sceneId, layerId, updates) => {
        const { scenes, aspectRatio } = get()
        const isPortrait = aspectRatio === '9:16'

        set({
          scenes: scenes.map(s =>
            s.id === sceneId
              ? { ...s, layers: s.layers.map(l => {
                  if (l.id !== layerId) return l

                  // Map incoming generic updates to layout-specific fields
                  const mappedUpdates: any = { ...updates }
                  const updateAllLayouts = mappedUpdates.__allLayouts === true
                  delete mappedUpdates.__allLayouts

                  if (updateAllLayouts) {
                    return { ...l, ...mappedUpdates }
                  }

                  if (isPortrait) {
                    if ('x' in updates && !('portraitX' in updates)) { mappedUpdates.portraitX = updates.x; delete mappedUpdates.x }
                    if ('y' in updates && !('portraitY' in updates)) { mappedUpdates.portraitY = updates.y; delete mappedUpdates.y }
                    if ('width' in updates && !('portraitWidth' in updates)) { mappedUpdates.portraitWidth = updates.width; delete mappedUpdates.width }
                    if ('height' in updates && !('portraitHeight' in updates)) { mappedUpdates.portraitHeight = updates.height; delete mappedUpdates.height }
                    if ('rotation' in updates && !('portraitRotation' in updates)) { mappedUpdates.portraitRotation = updates.rotation; delete mappedUpdates.rotation }
                    if ('visible' in updates && !('portraitVisible' in updates)) { mappedUpdates.portraitVisible = updates.visible; delete mappedUpdates.visible }
                    if ('locked' in updates && !('portraitLocked' in updates)) { mappedUpdates.portraitLocked = updates.locked; delete mappedUpdates.locked }
                  } else {
                    // Do nothing for generic keys as they map to horizontal by default
                  }

                  return { ...l, ...mappedUpdates }
                }) }
              : s
          )
        })
      },

      removeLayer: (sceneId, layerId) => {
        const { saveHistory, scenes, selectedLayerId } = get()
        saveHistory()
        set({
          scenes: scenes.map(s => s.id === sceneId ? { ...s, layers: s.layers.filter(l => l.id !== layerId) } : s),
          selectedLayerId: selectedLayerId === layerId ? null : selectedLayerId,
          audioSources: get().audioSources.filter(s => s.id !== layerId)
        })
      },

      reorderLayer: (sceneId, layerId, newIndex) => {
        const { saveHistory, scenes } = get()
        saveHistory()
        const scene = scenes.find(s => s.id === sceneId)
        if (!scene) return
        const layers = [...scene.layers]
        const oldIndex = layers.findIndex(l => l.id === layerId)
        if (oldIndex === -1) return
        const [movedLayer] = layers.splice(oldIndex, 1)
        layers.splice(newIndex, 0, movedLayer)
        set({
          scenes: scenes.map(s => s.id === sceneId ? { ...s, layers: layers.map((l, i) => ({ ...l, zIndex: i })) } : s)
        })
      },

      duplicateLayer: (sceneId, layerId) => {
        const { saveHistory, scenes } = get()
        saveHistory()
        const scene = scenes.find(s => s.id === sceneId)
        if (!scene) return
        const layer = scene.layers.find(l => l.id === layerId)
        if (!layer) return
        const newLayer: StudioLayer = {
          ...layer,
          id: crypto.randomUUID(),
          name: `${layer.name} (Copy)`,
          x: (Number(layer.x) || 0) + 40,
          y: (Number(layer.y) || 0) + 40,
          portraitX: (Number(layer.portraitX ?? layer.x) || 0) + 20,
          portraitY: (Number(layer.portraitY ?? layer.y) || 0) + 20,
          portraitWidth: layer.portraitWidth ?? Math.round(layer.width * 0.5),
          portraitHeight: layer.portraitHeight ?? Math.round(layer.height * 0.5),
          portraitRotation: layer.portraitRotation ?? layer.rotation ?? 0,
          portraitVisible: layer.portraitVisible ?? layer.visible,
          portraitLocked: layer.portraitLocked ?? layer.locked,
          zIndex: scene.layers.length
        }
        set({
          scenes: scenes.map(s => s.id === sceneId ? { ...s, layers: [...s.layers, newLayer] } : s),
          selectedLayerId: newLayer.id
        })
      },

      toggleSnapToGrid: () => set((state) => ({ snapToGrid: !state.snapToGrid })),
      setGridSize: (size: number) => set({ gridSize: size }),

      updateAudioSource: (id, updates) => {
        const { audioSources } = get()
        const exists = audioSources.find(s => s.id === id)
        const normalizedUpdates = { ...updates }
        // Calls from older UI surfaces still write the boolean. Translate it
        // before merging so an existing explicit mode cannot mask the update.
        if (normalizedUpdates.monitoringMode === undefined && typeof normalizedUpdates.monitoring === 'boolean') {
          normalizedUpdates.monitoringMode = normalizedUpdates.monitoring ? 'monitorAndOutput' : 'off'
        }

        if (exists) {
          set({
            audioSources: audioSources.map(s => s.id === id ? normalizeAudioSource({ ...s, ...normalizedUpdates }) : s)
          })
        } else {
          // Upsert/Add new source if it doesn't exist
          const newSource = normalizeAudioSource({
            id,
            name: normalizedUpdates.name || 'New Channel',
            volume: normalizedUpdates.volume ?? 0.8,
            muted: normalizedUpdates.muted ?? false,
            monitoringMode: normalizedUpdates.monitoringMode ?? 'off',
            monitoring: normalizedUpdates.monitoring ?? false,
            solo: normalizedUpdates.solo ?? false,
            channelMode: normalizedUpdates.channelMode ?? (normalizedUpdates.type === 'mic' ? 'mono' : 'stereo'),
            pan: normalizedUpdates.pan ?? 0,
            filters: normalizedUpdates.filters ?? (normalizedUpdates as any).fxChain ?? [],
            type: normalizedUpdates.type || 'system'
          })
          set({ audioSources: [...audioSources, newSource] })
        }
      },

      removeAudioSource: (id) => {
        const { saveHistory, audioSources } = get()
        saveHistory()
        set({
          audioSources: audioSources.filter(s => s.id !== id)
        })
      },

      reorderAudioSource: (oldIndex, newIndex) => {
        const { saveHistory, audioSources } = get()
        saveHistory()
        const newSources = [...audioSources]
        const [moved] = newSources.splice(oldIndex, 1)
        newSources.splice(newIndex, 0, moved)
        set({ audioSources: newSources })
      }
    }),
    {
      name: 'ilystream-studio-storage',
      storage: createJSONStorage(() => debouncedStorage),
      onRehydrateStorage: () => (state) => {
        if (!state) return

        // Load initial state from DB if available
        if (window.api?.studio?.loadState) {
          window.api.studio.loadState().then((dbState: any) => {
            if (dbState) {
              console.log('[StudioStore] Rehydrated from Database')
              // Ensure default locked sources (Soundboard, TTS) survive rehydration
              if (dbState.audioSources) {
                dbState.audioSources = dbState.audioSources.map(normalizeAudioSource)
                const defaultSources = requiredDefaultAudioSources()
                for (const def of defaultSources) {
                  if (!dbState.audioSources.find((s: any) => s.id === def.id)) {
                    dbState.audioSources.push(normalizeAudioSource(def))
                  }
                }
              }
              dbState.masterBus = normalizeAudioSource({
                ...(dbState.masterBus || {}),
                id: 'master',
                name: 'Master',
                volume: dbState.masterBus?.volume ?? 0.8,
                muted: dbState.masterBus?.muted ?? false,
                type: 'system',
                channelMode: 'stereo',
                pan: dbState.masterBus?.pan ?? 0,
                filters: dbState.masterBus?.filters ?? []
              })
              useStudioStore.setState(dbState)
            }
          })
        }

        state.audioSources = (state.audioSources || []).map(normalizeAudioSource)

        // Ensure default locked sources (Soundboard, TTS) are always present
        const defaultSources = requiredDefaultAudioSources()
        for (const def of defaultSources) {
          if (!state.audioSources.find(s => s.id === def.id)) {
            state.audioSources.push(normalizeAudioSource(def))
          }
        }

        state.masterBus = normalizeAudioSource({
          ...state.masterBus,
          id: 'master',
          name: 'Master',
          type: 'system',
          channelMode: 'stereo'
        })

        // Listen for sync events from other windows
        syncChannel.onmessage = (event) => {
          if (event.data === 'sync') {
            // Force re-read from localStorage
            const stored = localStorage.getItem('ilystream-studio-storage')
            if (stored) {
              try {
                const parsed = JSON.parse(stored)
                if (parsed.state) {
                  // Use a simplified set to avoid infinite loops
                  // Only update the parts we partialize
                  isSyncing = true
                  const syncedSources = (parsed.state.audioSources || []).map(normalizeAudioSource)
                  const defaultSources = requiredDefaultAudioSources()
                  for (const def of defaultSources) {
                    if (!syncedSources.find((s: any) => s.id === def.id)) {
                      syncedSources.push(normalizeAudioSource(def))
                    }
                  }
                  useStudioStore.setState({
                    scenes: parsed.state.scenes,
                    activeSceneId: parsed.state.activeSceneId,
                    canvasWidth: parsed.state.canvasWidth,
                    canvasHeight: parsed.state.canvasHeight,
                    aspectRatio: parsed.state.aspectRatio,
                    audioSources: syncedSources,
                    masterBus: normalizeAudioSource({
                      ...parsed.state.masterBus,
                      id: 'master',
                      name: 'Master',
                      type: 'system',
                      channelMode: 'stereo'
                    })
                  })
                  isSyncing = false
                }
              } catch (err) {
                console.error('[StudioStore] Failed to sync from other window', err)
                isSyncing = false
              }
            }
          }
        }

        // Listen for remote scene changes from the main process (Deck / Automation)
        window.api?.on?.('studio:active-scene-changed', (sceneId: string) => {
          console.log('[StudioStore] Remote active scene change:', sceneId)
          const current = useStudioStore.getState()
          if (current.transitionState.isActive || !current.scenes.some(scene => scene.id === sceneId)) return
          useStudioStore.setState({ activeSceneId: sceneId, selectedLayerId: null })
        })
      },
      partialize: (state) => ({
        scenes: state.scenes,
        activeSceneId: state.activeSceneId,
        canvasWidth: state.canvasWidth,
        canvasHeight: state.canvasHeight,
        aspectRatio: state.aspectRatio,
        snapToGrid: state.snapToGrid,
        gridSize: state.gridSize,
        audioSources: state.audioSources,
        masterBus: state.masterBus,
        routing: state.routing,
        mixerSidebarWidth: state.mixerSidebarWidth,
        studioMode: state.studioMode,
        previewSceneId: state.previewSceneId,
        transitionDuration: state.transitionDuration,
        stingerSettings: state.stingerSettings,
        recordingSettings: state.recordingSettings,
        audioReactivity: state.audioReactivity
      })
    }
  )
)

let isSyncing = false
useStudioStore.subscribe((state, prevState) => {
  if (isSyncing) return
  if (
    state.scenes !== prevState.scenes ||
    state.activeSceneId !== prevState.activeSceneId ||
    state.aspectRatio !== prevState.aspectRatio ||
    state.audioSources !== prevState.audioSources ||
    state.masterBus !== prevState.masterBus
  ) {
    syncChannel.postMessage('sync')
  }
})
