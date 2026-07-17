import { contextBridge, ipcRenderer, webFrame } from 'electron'
import type { AppSettingKey } from '../shared/app-settings'
import type { WindowsSettingsTarget } from '../main/system/windows-settings'
import type { GetTopUsersOptions, ViewerAccountInput, ViewerProfileInput } from '../shared/stats'
import type { Platform } from '../main/platforms/types'
import type { VideoFramePayload, AudioFramePayload } from '../main/services/streaming-service'
import type { EventLabSimulationPayload } from '../shared/event-lab'
import type { LightingState } from '../shared/lighting'
import type { RazerStatus, RazerThemeSettings } from '../shared/razer'
import { isRendererEventChannel, type RendererEventChannel } from '../shared/ipc-events'
import type {
  TikTokNativeAuthStatus,
  TikTokNativeLiveDestination
} from '../shared/tiktok-native'
import type { BroadcastStreamInfo, StreamInfoPreset, TwitchCategory } from '../shared/stream-info'

export type IpcCallback = (...args: any[]) => void

// Bridge MessagePorts handed off by the main process for projector mirroring
// into the renderer window's `message` event. MessagePort cannot pass through
// contextBridge directly, but window.postMessage from preload to renderer
// supports transferable objects.
ipcRenderer.on('studio:projector:mirror-source', (event, payload) => {
  const port = event.ports[0]
  if (!port) return
  ;(globalThis as any).postMessage({ __ilyProjectorChannel: 'mirror-source', payload }, '*', [port])
})
ipcRenderer.on('studio:projector:mirror-sink', (event) => {
  const port = event.ports[0]
  if (!port) return
  ;(globalThis as any).postMessage({ __ilyProjectorChannel: 'mirror-sink' }, '*', [port])
})

const api = {
  // --- Events (main -> renderer) ---
  on: (channel: RendererEventChannel, callback: IpcCallback) => {
    if (!isRendererEventChannel(channel)) {
      throw new Error(`Renderer attempted to subscribe to unknown channel: ${channel}`)
    }

    const listener = (_event: any, ...args: any[]) => callback(...args)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

  // --- Soundboard ---
  sound: {
    getAll: (category?: string) => ipcRenderer.invoke('sound:get-all', category),
    pickFile: () => ipcRenderer.invoke('sound:pick-file'),
    upload: (path: string, emoji?: string, category?: string) => ipcRenderer.invoke('sound:upload', path, emoji, category),
    delete: (id: string) => ipcRenderer.invoke('sound:delete', id),
    rename: (id: string, newName: string) => ipcRenderer.invoke('sound:rename', id, newName),
    setEmoji: (id: string, emoji: string | null) => ipcRenderer.invoke('sound:set-emoji', id, emoji),
    play: (id: string, volume?: number) => ipcRenderer.invoke('sound:play', id, volume),
    stopAll: () => ipcRenderer.invoke('sound:stop-all')
  },

  // --- Assets (Images) ---
  assets: {
    images: {
      getAll: () => ipcRenderer.invoke('assets:images:get-all'),
      pickFile: () => ipcRenderer.invoke('assets:images:pick-file'),
      upload: (path: string) => ipcRenderer.invoke('assets:images:upload', path),
      delete: (id: string) => ipcRenderer.invoke('assets:images:delete', id),
      rename: (id: string, newName: string) => ipcRenderer.invoke('assets:images:rename', id, newName)
    }
  },

  // --- Widgets ---
  widgets: {
    getAll: () => ipcRenderer.invoke('widgets:get-all'),
    save: (widget: any) => ipcRenderer.invoke('widgets:save', widget),
    delete: (id: string) => ipcRenderer.invoke('widgets:delete', id),
    createPreviewSession: (widgetId: string): Promise<string> =>
      ipcRenderer.invoke('widgets:create-preview-session', widgetId),
    releasePreviewSession: (previewToken: string): Promise<void> =>
      ipcRenderer.invoke('widgets:release-preview-session', previewToken),
    renderPreview: (widget: any, previewToken: string): Promise<string | null> =>
      ipcRenderer.invoke('widgets:render-preview', widget, previewToken)
  },

  // --- Platform ---
  platform: {
    connect: (config: any) => ipcRenderer.invoke('platform:connect', config),
    saveConfig: (config: any) => ipcRenderer.invoke('platform:save-config', config),
    disconnect: (platform: string) => ipcRenderer.invoke('platform:disconnect', platform),
    getStatuses: () => ipcRenderer.invoke('platform:get-statuses'),
    getErrors: () => ipcRenderer.invoke('platform:get-errors'),
    getConfigs: () => ipcRenderer.invoke('platform:get-configs'),
    getChatCapabilities: () => ipcRenderer.invoke('platform:get-chat-capabilities'),
    sendChatMessage: (payload: { platforms: string[]; text: string }) =>
      ipcRenderer.invoke('platform:send-chat-message', payload),
    restoreConnections: () => ipcRenderer.invoke('platform:restore-connections'),
    tiktok: {
      getGifts: () => ipcRenderer.invoke('tiktok:get-gifts'),
      saveGift: (gift: any) => ipcRenderer.invoke('tiktok:save-gift', gift),
      fixStats: () => ipcRenderer.invoke('tiktok:fix-stats'),
      openSender: () => ipcRenderer.invoke('tiktok:open-sender'),
      closeSender: () => ipcRenderer.invoke('tiktok:close-sender'),
      getSenderStatus: () => ipcRenderer.invoke('tiktok:get-sender-status'),
      captureCredentials: () => ipcRenderer.invoke('tiktok:capture-credentials'),
      getNativeAuthStatus: () =>
        ipcRenderer.invoke('tiktok:get-native-auth-status') as Promise<TikTokNativeAuthStatus>,
      beginNativeAuth: (payload?: { clientKey?: string }) =>
        ipcRenderer.invoke('tiktok:begin-native-auth', payload) as Promise<TikTokNativeAuthStatus>,
      cancelNativeAuth: () =>
        ipcRenderer.invoke('tiktok:cancel-native-auth') as Promise<TikTokNativeAuthStatus>,
      disconnectNativeAuth: () =>
        ipcRenderer.invoke('tiktok:disconnect-native-auth') as Promise<TikTokNativeAuthStatus>,
      prepareLive: (payload?: { title?: string; orientation?: 'portrait' | 'landscape' }) =>
        ipcRenderer.invoke('tiktok:prepare-live', payload) as Promise<TikTokNativeLiveDestination>,
      completeLive: () => ipcRenderer.invoke('tiktok:complete-live') as Promise<void>,
      openDeveloperPortal: () => ipcRenderer.invoke('tiktok:open-developer-portal'),
      openPartnerSupport: () => ipcRenderer.invoke('tiktok:open-partner-support'),
      getAutomations: () => ipcRenderer.invoke('tiktok:get-automations'),
      setAutomation: (key: string, value: boolean) =>
        ipcRenderer.invoke('tiktok:set-automation', { key, value })
    },
    youtube: {
      beginAuth: (payload: { clientId?: string; clientSecret?: string }) =>
        ipcRenderer.invoke('youtube:begin-auth', payload),
      prepareLive: (payload?: { title?: string; categoryId?: string }) =>
        ipcRenderer.invoke('youtube:prepare-live', payload) as Promise<{
          rtmpUrl: string
          streamKey: string
          broadcastId: string
          watchUrl: string
          title: string
          autoStart: boolean
          createdBroadcast: boolean
        }>,
      updateStreamInfo: (payload: { title?: string; categoryId?: string }) =>
        ipcRenderer.invoke('youtube:update-stream-info', payload) as Promise<{ broadcastId: string }>
    },
    twitch: {
      searchCategories: (query: string) =>
        ipcRenderer.invoke('twitch:search-categories', { query }) as Promise<TwitchCategory[]>,
      updateStreamInfo: (payload: { title?: string; categoryId?: string }) =>
        ipcRenderer.invoke('twitch:update-stream-info', payload) as Promise<{ channel: string }>
    },
    kick: {
      subscribeEvents: (payload: { clientId: string; clientSecret: string; broadcasterUserId?: string | number; channelName?: string }) =>
        ipcRenderer.invoke('kick:subscribe-events', payload),
      beginUserAuth: () =>
        ipcRenderer.invoke('kick:begin-user-auth') as Promise<{ connected: boolean }>,
      disconnectUserAuth: () =>
        ipcRenderer.invoke('kick:disconnect-user-auth') as Promise<{ connected: boolean }>,
      getUserAuthStatus: () =>
        ipcRenderer.invoke('kick:get-user-auth-status') as Promise<{ connected: boolean; redirectUri: string }>,
      searchCategories: (query: string) =>
        ipcRenderer.invoke('kick:search-categories', { query }) as Promise<TwitchCategory[]>,
      updateStreamInfo: (payload: { title?: string; categoryId?: string }) =>
        ipcRenderer.invoke('kick:update-stream-info', payload) as Promise<{ ok: boolean }>
    }
  },

  // --- Stream info (title/category applied at go-live) ---
  streamInfo: {
    get: () => ipcRenderer.invoke('stream-info:get') as Promise<BroadcastStreamInfo>,
    set: (info: BroadcastStreamInfo) => ipcRenderer.invoke('stream-info:set', info) as Promise<void>,
    getPresets: () => ipcRenderer.invoke('stream-info:get-presets') as Promise<StreamInfoPreset[]>,
    setPresets: (presets: StreamInfoPreset[]) =>
      ipcRenderer.invoke('stream-info:set-presets', presets) as Promise<void>
  },

  // --- Local event testing ---
  events: {
    simulate: (payload: EventLabSimulationPayload) =>
      ipcRenderer.invoke('event:simulate', payload),
    simulateChat: (payload: { platform: string; message: string; username: string }) =>
      ipcRenderer.invoke('event:simulate-chat', payload)
  },

  // --- AI ---
  ai: {
    generateResponse: (message: string, context: { username: string; platform: string }) =>
      ipcRenderer.invoke('ai:generate-response', message, context),
    getStreamInsights: () => ipcRenderer.invoke('ai:get-stream-insights'),
    testConnection: () => ipcRenderer.invoke('ai:test-connection')
  },

  // --- TTS ---
  tts: {
    skip: () => ipcRenderer.invoke('tts:skip'),
    clearQueue: () => ipcRenderer.invoke('tts:clear-queue'),
    pause: () => ipcRenderer.invoke('tts:pause'),
    resume: () => ipcRenderer.invoke('tts:resume'),
    setEnabled: (enabled: boolean) => ipcRenderer.invoke('tts:set-enabled', enabled),
    getQueue: () => ipcRenderer.invoke('tts:get-queue'),
    testSpeak: (payload: { text: string; voiceProfileId?: string }) =>
      ipcRenderer.invoke('tts:test-speak', payload),
    notifySpeechComplete: () => ipcRenderer.send('tts:speech-complete'),
    notifyReady: () => ipcRenderer.send('tts:renderer-ready')
  },

  // --- Voice profiles ---
  voice: {
    getAll: () => ipcRenderer.invoke('voice:get-all'),
    save: (profile: any) => ipcRenderer.invoke('voice:save', profile),
    delete: (id: string) => ipcRenderer.invoke('voice:delete', id)
  },

  // --- Triggers ---
  triggers: {
    getAll: () => ipcRenderer.invoke('triggers:get-all'),
    save: (rule: any) => ipcRenderer.invoke('triggers:save', rule),
    delete: (id: string) => ipcRenderer.invoke('triggers:delete', id)
  },

  // --- Settings ---
  settings: {
    get: (key: AppSettingKey) => ipcRenderer.invoke('settings:get', key),
    set: (key: AppSettingKey, value: any) => ipcRenderer.invoke('settings:set', key, value),
    setMany: (settings: Record<string, any>) => ipcRenderer.invoke('settings:set-many', settings),
    getAll: () => ipcRenderer.invoke('settings:get-all'),
    getSync: (key: AppSettingKey) => ipcRenderer.sendSync('settings:get-sync', key)
  },

  // --- Overlay ---
  overlay: {
    getStatus: () => ipcRenderer.invoke('overlay:get-status'),
    getGoalState: () => ipcRenderer.invoke('overlay:get-goal-state'),
    sendDeckAction: (action: { type: string; payload?: any }) =>
      ipcRenderer.invoke('overlay:send-deck-action', action),
    sendFeatureMessage: (payload: any) =>
      ipcRenderer.invoke('overlay:send-feature-message', payload),
    sendRelayMessage: (payload: any) =>
      ipcRenderer.invoke('overlay:send-relay-message', payload),
    notifySpeechState: (isSpeaking: boolean, isAI: boolean) =>
      ipcRenderer.send('overlay:notify-speech-state', isSpeaking, isAI),
    pushDualVerticalFrame: (frame: Uint8Array) =>
      ipcRenderer.send('overlay:dual-vertical-frame', frame)
  },

  // --- OBS ---
  obs: {
    getStatus: () => ipcRenderer.invoke('obs:get-status'),
    reconnect: () => ipcRenderer.invoke('obs:reconnect'),
    startVirtualCamera: () => ipcRenderer.invoke('obs:start-virtual-camera'),
    stopVirtualCamera: () => ipcRenderer.invoke('obs:stop-virtual-camera'),
    toggleVirtualCamera: () => ipcRenderer.invoke('obs:toggle-virtual-camera')
  },

  // --- Window ---
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    setZoomFactor: (factor: number) => {
      const normalizedFactor = Number.isFinite(factor) ? Math.min(1.3, Math.max(0.8, factor)) : 1
      webFrame.setZoomFactor(normalizedFactor)
    }
  },

  // --- System ---
  system: {
    openWindowsSettings: (target: WindowsSettingsTarget) =>
      ipcRenderer.invoke('system:open-windows-settings', target),
    copyToClipboard: (text: string) =>
      ipcRenderer.invoke('system:copy-to-clipboard', text),
    installUpdate: () => ipcRenderer.invoke('system:install-update'),
    checkForUpdates: () => ipcRenderer.invoke('system:check-for-updates'),
    getAppInfo: () => ipcRenderer.invoke('system:get-app-info'),
    getResourceUsage: () =>
      ipcRenderer.invoke('system:get-resource-usage') as Promise<{
        cpuPercent: number
        memoryMB: number
        processCount: number
      }>,
    setLoginItem: (enabled: boolean) => ipcRenderer.invoke('system:set-login-item', enabled),
    openAppFolder: (target: 'logs' | 'userData' | 'recordings') =>
      ipcRenderer.invoke('system:open-app-folder', target),
    chooseFolder: (title?: string) => ipcRenderer.invoke('system:choose-folder', title)
  },

  // --- Spotify ---
  spotify: {
    connect: (clientId: string) => ipcRenderer.invoke('spotify:connect', clientId),
    disconnect: () => ipcRenderer.invoke('spotify:disconnect'),
    getStatus: () => ipcRenderer.invoke('spotify:get-status'),
    getQueue: () => ipcRenderer.invoke('spotify:get-queue'),
    removeFromQueue: (requestId: string) => ipcRenderer.invoke('spotify:remove-from-queue', requestId),
    clearQueue: () => ipcRenderer.invoke('spotify:clear-queue'),
    skip: () => ipcRenderer.invoke('spotify:skip')
  },
  // --- X (Twitter) ---
  x: {
    connect: (clientId: string) => ipcRenderer.invoke('x:connect', clientId),
    disconnect: () => ipcRenderer.invoke('x:disconnect'),
    getStatus: () => ipcRenderer.invoke('x:get-status'),
    getTemplate: () => ipcRenderer.invoke('x:get-template'),
    setTemplate: (text: string) => ipcRenderer.invoke('x:set-template', text),
    post: (text: string) => ipcRenderer.invoke('x:post', text)
  },
  // --- Hue ---
  hue: {
    discoverBridges: () => ipcRenderer.invoke('hue:discover-bridges'),
    connect: (ip: string, username: string) => ipcRenderer.invoke('hue:connect', ip, username),
    saveUsername: (username: string) => ipcRenderer.invoke('hue:save-username', username),
    getLights: () => ipcRenderer.invoke('hue:get-lights'),
    getGroups: () => ipcRenderer.invoke('hue:get-groups'),
    triggerFlash: (color?: { r: number; g: number; b: number }) => ipcRenderer.invoke('hue:trigger-flash', color),
    triggerStrobe: (durationMs: number) => ipcRenderer.invoke('hue:trigger-strobe', durationMs),
    setSafetyLock: (locked: boolean) => ipcRenderer.invoke('hue:set-safety-lock', locked),
    setSelectedLights: (ids: string[]) => ipcRenderer.invoke('hue:set-selected-lights', ids),
    getStatus: () => ipcRenderer.invoke('hue:get-status')
  },
  // --- Studio ---
  studio: {
    getMonitors: () => ipcRenderer.invoke('studio:get-monitors'),
    getDesktopSources: () => ipcRenderer.invoke('studio:get-desktop-sources'),
    findSpotifySource: () => ipcRenderer.invoke('studio:find-spotify-source'),
    prepareDisplayCapture: (request: { sourceId: string; withAudio?: boolean; audioOnly?: boolean }) =>
      ipcRenderer.invoke('studio:prepare-display-capture', request),
    openProjector: (payload: { monitorId: number, sceneId: string, aspectRatio?: string, layerId?: string }) => ipcRenderer.invoke('studio:open-projector', payload),
    requestProjectorMirror: (aspectRatio?: '16:9' | '9:16') => ipcRenderer.send('studio:projector:request-mirror', { aspectRatio }),
    startBrowserSource: (config: any) => ipcRenderer.invoke('studio:browser-source:start', config),
    updateBrowserSource: (config: any) => ipcRenderer.invoke('studio:browser-source:update', config),
    reloadBrowserSource: (id: string) => ipcRenderer.invoke('studio:browser-source:reload', id),
    stopBrowserSource: (id: string) => ipcRenderer.invoke('studio:browser-source:stop', id),
    getDeckActions: () => ipcRenderer.invoke('studio:get-deck-actions'),
    saveDeckAction: (action: any) => ipcRenderer.invoke('studio:save-deck-action', action),
    deleteDeckAction: (id: string) => ipcRenderer.invoke('studio:delete-deck-action', id),
    saveState: (state: any) => ipcRenderer.invoke('studio:save-state', state),
    loadState: () => ipcRenderer.invoke('studio:load-state')
  },
  // --- Device API (DeskThing pair flow) ---
  device: {
    startPair: () => ipcRenderer.invoke('device:start-pair'),
    listPaired: () => ipcRenderer.invoke('device:list-paired'),
    revoke: (id: string) => ipcRenderer.invoke('device:revoke', id)
  },

  // --- Stats (lifetime totals) ---
  stats: {
    getGlobal: () => ipcRenderer.invoke('stats:get-global'),
    getTopUsers: (opts: GetTopUsersOptions) => ipcRenderer.invoke('stats:get-top-users', opts),
    getTopIdentities: (opts: GetTopUsersOptions) => ipcRenderer.invoke('stats:get-top-identities', opts),
    getIdentity: (id: string) => ipcRenderer.invoke('stats:get-identity', id),
    getLinkSuggestions: (profileId: string) => ipcRenderer.invoke('stats:get-link-suggestions', profileId),
    getUser: (platform: Platform, username: string) =>
      ipcRenderer.invoke('stats:get-user', { platform, username }),
    reset: () => ipcRenderer.invoke('stats:reset'),
    setFollowerCount: (platform: Platform, count: number) =>
      ipcRenderer.invoke('stats:set-manual-follower-count', { platform, count }),
    linkAccounts: (payload: { p1: Platform; u1: string; p2: Platform; u2: string }) =>
      ipcRenderer.invoke('stats:link-accounts', payload),
    unlinkAccount: (payload: { platform: Platform; username: string }) =>
      ipcRenderer.invoke('stats:unlink-account', payload),
    getViewerProfiles: (opts?: { query?: string; limit?: number }) =>
      ipcRenderer.invoke('stats:get-viewer-profiles', opts),
    createViewerProfile: (input: ViewerProfileInput) =>
      ipcRenderer.invoke('stats:create-viewer-profile', input),
    updateViewerProfile: (id: string, patch: Partial<ViewerProfileInput>) =>
      ipcRenderer.invoke('stats:update-viewer-profile', { id, patch }),
    addViewerAccount: (profileId: string, account: ViewerAccountInput) =>
      ipcRenderer.invoke('stats:add-viewer-account', { profileId, account })
  },

  // --- Streaming ---
  streaming: {
    start: (config: any) => ipcRenderer.invoke('streaming:start', config),
    stop: () => ipcRenderer.invoke('streaming:stop'),
    getStatus: () => ipcRenderer.invoke('streaming:get-status'),
    getOutputs: () => ipcRenderer.invoke('streaming:get-outputs'),
    stopOutput: (outputId: string) => ipcRenderer.invoke('streaming:stop-output', outputId),
    startRecording: (config: any) => ipcRenderer.invoke('streaming:start-recording', config),
    stopRecording: () => ipcRenderer.invoke('streaming:stop-recording'),
    getRecordingStatus: () => ipcRenderer.invoke('streaming:get-recording-status'),
    takeScreenshot: (frameData: Uint8Array) => ipcRenderer.invoke('streaming:take-screenshot', frameData),
    feedFrame: (frameData: Uint8Array | VideoFramePayload) => ipcRenderer.send('streaming:feed-frame', frameData),
    feedAudio: (audioData: Uint8Array | AudioFramePayload) => ipcRenderer.send('streaming:feed-audio', audioData)
  },
  // --- Recordings Library ---
  recordings: {
    list: () => ipcRenderer.invoke('recordings:list'),
    openFolder: () => ipcRenderer.invoke('recordings:open-folder'),
    play: (path: string) => ipcRenderer.invoke('recordings:play', path),
    thumbnail: (path: string): Promise<string | null> => ipcRenderer.invoke('recordings:thumbnail', path),
    delete: (path: string) => ipcRenderer.invoke('recordings:delete', path)
  },
  // --- Govee ---
  govee: {
    connect: (apiKey: string) => ipcRenderer.invoke('govee:connect', apiKey),
    disconnect: () => ipcRenderer.invoke('govee:disconnect'),
    getStatus: () => ipcRenderer.invoke('govee:get-status'),
    getDevices: (forceRefresh?: boolean) => ipcRenderer.invoke('govee:get-devices', forceRefresh),
    setSelectedDevices: (ids: string[]) => ipcRenderer.invoke('govee:set-selected-devices', ids),
    testStrobe: () => ipcRenderer.invoke('govee:test-strobe'),
    selectBleDevice: (deviceId: string) => ipcRenderer.invoke('govee:ble-select-device', deviceId),
    cancelBleSelection: () => ipcRenderer.invoke('govee:ble-cancel-selection'),
    getBleDevices: () => ipcRenderer.invoke('govee:ble-get-devices'),
    registerBleDevice: (device: any) => ipcRenderer.invoke('govee:ble-register-device', device),
    updateBleDeviceStatus: (payload: { device: string; connected: boolean; lastError?: string }) =>
      ipcRenderer.invoke('govee:ble-update-status', payload),
    setBleDeviceProtocol: (deviceId: string, protocol: string) =>
      ipcRenderer.invoke('govee:ble-set-protocol', { deviceId, protocol }),
    removeBleDevice: (deviceId: string) => ipcRenderer.invoke('govee:ble-remove-device', deviceId)
  },
  // --- Lighting ---
  lighting: {
    getState: (): Promise<LightingState> => ipcRenderer.invoke('lighting:get-state'),
    scan: (): Promise<LightingState> => ipcRenderer.invoke('lighting:scan'),
    executeAction: (deviceId: string, action: string, params?: any) =>
      ipcRenderer.invoke('lighting:execute-action', deviceId, action, params)
  },
  // --- Razer Chroma ---
  razer: {
    getStatus: (): Promise<RazerStatus> => ipcRenderer.invoke('razer:get-status'),
    connect: (): Promise<RazerStatus> => ipcRenderer.invoke('razer:connect'),
    disconnect: (): Promise<RazerStatus> => ipcRenderer.invoke('razer:disconnect'),
    scan: (): Promise<RazerStatus> => ipcRenderer.invoke('razer:scan'),
    testEffect: (): Promise<RazerStatus> => ipcRenderer.invoke('razer:test-effect'),
    setTheme: (theme: Partial<RazerThemeSettings>): Promise<RazerStatus> =>
      ipcRenderer.invoke('razer:set-theme', theme)
  },
  // --- Virtual Camera ---
  virtualCamera: {
    start: (opts?: any) => ipcRenderer.invoke('virtualcamera:start', opts),
    stop: () => ipcRenderer.invoke('virtualcamera:stop'),
    getStatus: () => ipcRenderer.invoke('virtualcamera:get-status'),
    installDriver: () => ipcRenderer.invoke('virtualcamera:install-driver')
  },
  // --- Native Camera ---
  nativeCamera: {
    start: (deviceName: string, width: number, height: number, fps: number) => ipcRenderer.send('native-camera:start', deviceName, width, height, fps),
    stop: (deviceName: string) => ipcRenderer.send('native-camera:stop', deviceName)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
