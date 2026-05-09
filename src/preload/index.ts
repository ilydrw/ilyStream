import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettingKey } from '../shared/app-settings'
import type { WindowsSettingsTarget } from '../main/system/windows-settings'
import type { GetTopUsersOptions } from '../shared/stats'
import type { Platform } from '../main/platforms/types'
import type { VideoFramePayload, AudioFramePayload } from '../main/services/streaming-service'

export type IpcCallback = (...args: any[]) => void

const allowedEventChannels = new Set([
  'event:stream',
  'platform:status-change',
  'platform:error',
  'platform:reconnecting',
  'settings:changed',
  'obs:status-changed',
  'voice:changed',
  'tts:queue-update',
  'tts:speak',
  'tts:prefetch',
  'tts:stop-speaking',
  'tts:pause',
  'tts:resume',
  'sound:play',
  'streaming:status-changed',
  'action:play-sound',
  'action:show-alert',
  'overlay:status-changed',
  'spotify:status-changed',
  'spotify:queue-update',
  'clip:created',
  'browser-source:frame',
  'browser-source:error',
  'app:close-request',
  'system:ping',
  'system:update-status',
  'action:stop-all-sounds',
  'spotify:now-playing',
  'govee:status-changed',
  'streaming:native-audio-clock'
])

const api = {
  // --- Events (main -> renderer) ---
  on: (channel: string, callback: IpcCallback) => {
    if (!allowedEventChannels.has(channel)) {
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
    play: (id: string, volume?: number) => ipcRenderer.invoke('sound:play', id, volume)
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
    delete: (id: string) => ipcRenderer.invoke('widgets:delete', id)
  },
 
  // --- Platform ---
  platform: {
    connect: (config: any) => ipcRenderer.invoke('platform:connect', config),
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
      fixStats: () => ipcRenderer.invoke('tiktok:fix-stats')
    }
  },

  // --- Local event testing ---
  events: {
    simulate: (payload: { platform?: string; type: 'gift' | 'follow' | 'superfan'; suppressSound?: boolean }) =>
      ipcRenderer.invoke('event:simulate', payload),
    simulateChat: (payload: { platform: string; message: string; username: string }) =>
      ipcRenderer.invoke('event:simulate-chat', payload)
  },

  // --- AI ---
  ai: {
    generateResponse: (message: string, context: { username: string; platform: string }) =>
      ipcRenderer.invoke('ai:generate-response', message, context),
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
    notifySpeechComplete: () => ipcRenderer.send('tts:speech-complete')
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
    getAll: () => ipcRenderer.invoke('settings:get-all')
  },

  // --- Overlay ---
  overlay: {
    getStatus: () => ipcRenderer.invoke('overlay:get-status'),
    getGoalState: () => ipcRenderer.invoke('overlay:get-goal-state'),
    sendDeckAction: (action: { type: string; payload: any }) =>
      ipcRenderer.invoke('overlay:send-deck-action', action),
    sendFeatureMessage: (payload: any) =>
      ipcRenderer.invoke('overlay:send-feature-message', payload),
    sendRelayMessage: (payload: any) =>
      ipcRenderer.invoke('overlay:send-relay-message', payload),
    notifySpeechState: (isSpeaking: boolean, isAI: boolean) =>
      ipcRenderer.send('overlay:notify-speech-state', isSpeaking, isAI)
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
    close: () => ipcRenderer.invoke('window:close')
  },

  // --- System ---
  system: {
    openWindowsSettings: (target: WindowsSettingsTarget) =>
      ipcRenderer.invoke('system:open-windows-settings', target)
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
    openProjector: (monitorId: number, sceneId: string) => ipcRenderer.invoke('studio:open-projector', { monitorId, sceneId }),
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
    revoke: (token: string) => ipcRenderer.invoke('device:revoke', token)
  },

  // --- Stats (lifetime totals) ---
  stats: {
    getGlobal: () => ipcRenderer.invoke('stats:get-global'),
    getTopUsers: (opts: GetTopUsersOptions) => ipcRenderer.invoke('stats:get-top-users', opts),
    getUser: (platform: Platform, username: string) =>
      ipcRenderer.invoke('stats:get-user', { platform, username }),
    reset: () => ipcRenderer.invoke('stats:reset')
  },

  // --- Streaming ---
  streaming: {
    start: (config: any) => ipcRenderer.invoke('streaming:start', config),
    stop: () => ipcRenderer.invoke('streaming:stop'),
    getStatus: () => ipcRenderer.invoke('streaming:get-status'),
    getEncoderDiagnostics: (preference?: string) => ipcRenderer.invoke('streaming:get-encoder-diagnostics', preference),
    testEncoder: (preference?: string) => ipcRenderer.invoke('streaming:test-encoder', preference),
    startRecording: (config: any) => ipcRenderer.invoke('streaming:start-recording', config),
    stopRecording: () => ipcRenderer.invoke('streaming:stop-recording'),
    getRecordingStatus: () => ipcRenderer.invoke('streaming:get-recording-status'),
    takeScreenshot: (frameData: Uint8Array) => ipcRenderer.invoke('streaming:take-screenshot', frameData),
    feedFrame: (frameData: Uint8Array | VideoFramePayload) => ipcRenderer.send('streaming:feed-frame', frameData),
    feedAudio: (audioData: Uint8Array | AudioFramePayload) => ipcRenderer.send('streaming:feed-audio', audioData)
  },
  // --- Govee ---
  govee: {
    connect: (apiKey: string) => ipcRenderer.invoke('govee:connect', apiKey),
    disconnect: () => ipcRenderer.invoke('govee:disconnect'),
    getStatus: () => ipcRenderer.invoke('govee:get-status'),
    getDevices: () => ipcRenderer.invoke('govee:get-devices'),
    setSelectedDevices: (ids: string[]) => ipcRenderer.invoke('govee:set-selected-devices', ids)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
