import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const connectMock = vi.fn()
const disconnectMock = vi.fn()
const callMock = vi.fn()
const onMock = vi.fn()
const eventHandlers = new Map<string, (payload: any) => void>()

vi.mock('obs-websocket-js', () => {
  return {
    OBSWebSocket: class {
      connect = connectMock
      disconnect = disconnectMock
      call = callMock
      on = onMock
    }
  }
})

import {
  getWidgetBrowserSourceRecommendation,
  isIlyStreamOverlayUrl,
  OBSService
} from './obs-service'

async function createConnectedService(): Promise<OBSService> {
  connectMock.mockResolvedValue({
    obsVersion: '31.0.0',
    obsWebSocketVersion: '5.0.0'
  })
  callMock.mockImplementation(async (requestType: string) => {
    if (requestType === 'GetSceneList') {
      return { currentProgramSceneName: 'Main', scenes: [{ sceneName: 'Main' }] }
    }
    if (requestType === 'GetStreamStatus' || requestType === 'GetRecordStatus') {
      return { outputActive: false }
    }
    if (requestType === 'GetVirtualCamStatus') return { outputActive: false }
    if (requestType === 'GetInputList') return { inputs: [] }
    return {}
  })

  const service = new OBSService()
  await service.applySettings({ enabled: true, host: '127.0.0.1', port: 4455, password: '' })
  callMock.mockReset()
  return service
}

describe('OBSService', () => {
  beforeEach(() => {
    connectMock.mockReset()
    disconnectMock.mockReset()
    callMock.mockReset()
    onMock.mockReset()
    eventHandlers.clear()
    disconnectMock.mockResolvedValue(undefined)
    onMock.mockImplementation((event: string, handler: (payload: any) => void) => {
      eventHandlers.set(event, handler)
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('connects when OBS is enabled in settings', async () => {
    connectMock.mockResolvedValue({
      obsVersion: '31.0.0',
      obsWebSocketVersion: '5.0.0'
    })
    callMock.mockResolvedValue({ currentProgramSceneName: 'Starting Soon' })

    const service = new OBSService()
    const status = await service.applySettings({
      enabled: true,
      host: '127.0.0.1',
      port: 4455,
      password: ''
    })

    expect(connectMock).toHaveBeenCalledWith('ws://127.0.0.1:4455', undefined)
    expect(callMock).toHaveBeenCalledWith('GetSceneList')
    expect(status).toEqual(
      expect.objectContaining({
        enabled: true,
        connected: true,
        currentSceneName: 'Starting Soon'
      })
    )
  })

  it('executes scene switch actions against OBS', async () => {
    connectMock.mockResolvedValue({
      obsVersion: '31.0.0',
      obsWebSocketVersion: '5.0.0'
    })
    callMock.mockResolvedValue({ currentProgramSceneName: 'Intro' })

    const service = new OBSService()
    await service.applySettings({
      enabled: true,
      host: '127.0.0.1',
      port: 4455,
      password: ''
    })

    callMock.mockReset()
    await service.executeAction({
      type: 'obs_set_scene',
      sceneName: 'Gameplay'
    })

    expect(callMock).toHaveBeenCalledWith('SetCurrentProgramScene', { sceneName: 'Gameplay' })
    expect(service.getStatus().currentSceneName).toBe('Gameplay')
  })

  it('retries when ilyStream starts before OBS and hydrates state once OBS appears', async () => {
    vi.useFakeTimers()
    connectMock
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:4455'))
      .mockResolvedValueOnce({ obsVersion: '31.0.0', obsWebSocketVersion: '5.0.0' })
    callMock.mockImplementation(async (requestType: string) => {
      if (requestType === 'GetSceneList') {
        return { currentProgramSceneName: 'Live', scenes: [{ sceneName: 'Live' }] }
      }
      if (requestType === 'GetStreamStatus') return { outputActive: true }
      if (requestType === 'GetRecordStatus') return { outputActive: false }
      if (requestType === 'GetVirtualCamStatus') return { outputActive: false }
      if (requestType === 'GetInputList') return { inputs: [] }
      return {}
    })

    const service = new OBSService()
    const initial = await service.applySettings({
      enabled: true,
      host: '127.0.0.1',
      port: 4455,
      password: ''
    })

    expect(initial.connected).toBe(false)
    expect(connectMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1_000)

    expect(connectMock).toHaveBeenCalledTimes(2)
    expect(service.getStatus()).toEqual(
      expect.objectContaining({
        connected: true,
        currentSceneName: 'Live',
        streamActive: true,
        lastError: null
      })
    )
  })

  it('retries an unexpected close and clears stale live state', async () => {
    vi.useFakeTimers()
    connectMock.mockResolvedValue({ obsVersion: '31.0.0', obsWebSocketVersion: '5.0.0' })
    callMock.mockImplementation(async (requestType: string) => {
      if (requestType === 'GetSceneList') {
        return { currentProgramSceneName: 'Live', scenes: [{ sceneName: 'Live' }] }
      }
      if (requestType === 'GetStreamStatus') return { outputActive: true }
      if (requestType === 'GetRecordStatus') return { outputActive: false }
      if (requestType === 'GetVirtualCamStatus') return { outputActive: false }
      if (requestType === 'GetInputList') return { inputs: [] }
      return {}
    })

    const service = new OBSService()
    await service.applySettings({ enabled: true, host: '127.0.0.1', port: 4455, password: '' })

    eventHandlers.get('ConnectionClosed')?.({ message: 'socket closed' })
    eventHandlers.get('ConnectionError')?.({ message: 'same socket failed' })

    expect(service.getStatus()).toEqual(
      expect.objectContaining({
        connected: false,
        streamActive: false,
        recordingActive: false,
        currentSceneName: null
      })
    )

    await vi.advanceTimersByTimeAsync(1_000)

    expect(connectMock).toHaveBeenCalledTimes(2)
    expect(service.getStatus().connected).toBe(true)
  })

  it('cancels a pending retry when OBS integration is disabled', async () => {
    vi.useFakeTimers()
    connectMock.mockRejectedValue(new Error('OBS is not running'))

    const service = new OBSService()
    await service.applySettings({ enabled: true, host: '127.0.0.1', port: 4455, password: '' })
    await service.applySettings({ enabled: false, host: '127.0.0.1', port: 4455, password: '' })
    await vi.advanceTimersByTimeAsync(60_000)

    expect(connectMock).toHaveBeenCalledTimes(1)
    expect(service.getStatus()).toEqual(expect.objectContaining({ enabled: false, connected: false }))
  })

  it('refreshes only local ilyStream browser inputs and isolates per-source failures', async () => {
    connectMock.mockResolvedValue({ obsVersion: '31.0.0', obsWebSocketVersion: '5.0.0' })
    callMock.mockImplementation(async (requestType: string, requestData?: { inputName?: string }) => {
      if (requestType === 'GetSceneList') return { currentProgramSceneName: 'Intro', scenes: [] }
      if (requestType === 'GetStreamStatus' || requestType === 'GetRecordStatus') return { outputActive: false }
      if (requestType === 'GetVirtualCamStatus') return { outputActive: false }
      if (requestType === 'GetInputList') {
        return {
          inputs: [
            { inputName: 'Chat', inputKind: 'browser_source' },
            { inputName: 'Alerts', unversionedInputKind: 'browser_source' },
            { inputName: 'Website', inputKind: 'browser_source' },
            { inputName: 'Camera', inputKind: 'dshow_input' }
          ]
        }
      }
      if (requestType === 'GetInputSettings') {
        const urls: Record<string, string> = {
          Chat: 'http://127.0.0.1:8899/overlay/chat.html',
          Alerts: 'http://localhost:8899/overlay/alerts.html',
          Website: 'https://example.com/overlay/chat.html',
          Camera: 'http://127.0.0.1:8899/overlay/camera.html'
        }
        return { inputSettings: { url: urls[requestData?.inputName || ''] } }
      }
      if (requestType === 'PressInputPropertiesButton' && requestData?.inputName === 'Chat') {
        throw new Error('source disappeared')
      }
      return {}
    })

    const service = new OBSService()
    await service.applySettings({ enabled: true, host: '127.0.0.1', port: 4455, password: '' })

    const refreshCalls = callMock.mock.calls.filter(([requestType]) => requestType === 'PressInputPropertiesButton')
    expect(refreshCalls).toEqual([
      ['PressInputPropertiesButton', { inputName: 'Chat', propertyName: 'refreshnocache' }],
      ['PressInputPropertiesButton', { inputName: 'Alerts', propertyName: 'refreshnocache' }]
    ])
  })

  it('retries browser-source discovery after a transient enumeration failure', async () => {
    vi.useFakeTimers()
    connectMock.mockResolvedValue({ obsVersion: '31.0.0', obsWebSocketVersion: '5.0.0' })
    let inputListAttempts = 0
    callMock.mockImplementation(async (requestType: string) => {
      if (requestType === 'GetSceneList') return { currentProgramSceneName: 'Intro', scenes: [] }
      if (requestType === 'GetStreamStatus' || requestType === 'GetRecordStatus') return { outputActive: false }
      if (requestType === 'GetVirtualCamStatus') return { outputActive: false }
      if (requestType === 'GetInputList') {
        inputListAttempts += 1
        if (inputListAttempts === 1) throw new Error('OBS collection is still loading')
        return { inputs: [{ inputName: 'Chat', inputKind: 'browser_source' }] }
      }
      if (requestType === 'GetInputSettings') {
        return { inputSettings: { url: 'http://127.0.0.1:8899/overlay/chat.html' } }
      }
      return {}
    })

    const service = new OBSService()
    await service.applySettings({ enabled: true, host: '127.0.0.1', port: 4455, password: '' })
    eventHandlers.get('ConnectionClosed')?.({ message: 'socket closed' })
    await vi.advanceTimersByTimeAsync(1_000)

    expect(inputListAttempts).toBe(2)
    expect(callMock).toHaveBeenCalledWith('PressInputPropertiesButton', {
      inputName: 'Chat',
      propertyName: 'refreshnocache'
    })
  })

  it('inspects only managed inputs and finds nested scene attachments', async () => {
    const service = await createConnectedService()
    callMock.mockImplementation(async (requestType: string, requestData?: { inputName?: string }) => {
      if (requestType === 'GetInputList') {
        return {
          inputs: [
            { inputName: 'ilyStream Chat', inputUuid: 'ily-uuid', inputKind: 'browser_source' },
            { inputName: 'StreamElements', inputUuid: 'se-uuid', inputKind: 'browser_source' },
            { inputName: 'Broken Browser', inputKind: 'browser_source' },
            { inputName: 'Camera', inputKind: 'dshow_input' }
          ]
        }
      }
      if (requestType === 'GetInputSettings') {
        if (requestData?.inputName === 'ilyStream Chat') {
          return {
            inputSettings: {
              url: 'http://127.0.0.1:8899/overlay/chat-widget',
              width: 1080,
              height: 1920,
              fps: 60,
              fps_custom: true
            }
          }
        }
        if (requestData?.inputName === 'StreamElements') {
          return { inputSettings: { url: 'https://streamelements.com/overlay/example' } }
        }
        throw new Error('source was removed')
      }
      if (requestType === 'GetSceneList') return { scenes: [{ sceneName: 'Main' }] }
      if (requestType === 'GetSceneItemList') {
        return {
          sceneItems: [{ sceneItemId: 1, sourceName: 'Overlay Group', isGroup: true }]
        }
      }
      if (requestType === 'GetGroupSceneItemList') {
        return {
          sceneItems: [{
            sceneItemId: 42,
            sourceName: 'ilyStream Chat',
            sourceUuid: 'ily-uuid',
            sourceType: 'OBS_SOURCE_TYPE_INPUT'
          }]
        }
      }
      return {}
    })

    const inspection = await service.getManagedBrowserSources()

    expect(inspection.sources).toEqual([expect.objectContaining({
      inputName: 'ilyStream Chat',
      widgetId: 'chat-widget',
      sceneReferences: [{
        sceneName: 'Main',
        containerName: 'Overlay Group',
        sceneItemId: 42,
        nested: true
      }]
    })])
    expect(inspection.warnings).toEqual([
      'Could not inspect OBS browser source "Broken Browser": source was removed'
    ])
    expect(callMock).not.toHaveBeenCalledWith('GetInputSettings', { inputName: 'Camera' })
  })

  it('creates a standard browser source without overwriting a colliding third-party input', async () => {
    const service = await createConnectedService()
    callMock.mockImplementation(async (requestType: string, requestData?: any) => {
      if (requestType === 'GetCurrentProgramScene') return { currentProgramSceneName: 'Main' }
      if (requestType === 'GetSceneItemList') return { sceneItems: [] }
      if (requestType === 'GetInputList') {
        return {
          inputs: [{
            inputName: 'ilyStream - Like Tracker',
            inputUuid: 'third-party',
            inputKind: 'browser_source'
          }]
        }
      }
      if (requestType === 'GetInputSettings') {
        return { inputSettings: { url: 'https://streamelements.com/overlay/likes' } }
      }
      if (requestType === 'CreateInput') return { inputUuid: 'created-uuid', sceneItemId: 77 }
      return {}
    })

    const result = await service.upsertWidgetBrowserSource({
      widgetId: 'likes-1',
      widgetName: 'Like Tracker',
      widgetType: 'likes-tracker'
    })

    expect(result).toEqual(expect.objectContaining({ created: true, updated: false }))
    expect(result.source).toEqual(expect.objectContaining({
      inputName: 'ilyStream - Like Tracker (2)',
      inputUuid: 'created-uuid',
      widgetId: 'likes-1',
      width: 400,
      height: 280,
      fps: 60
    }))
    expect(callMock).toHaveBeenCalledWith('CreateInput', {
      sceneName: 'Main',
      inputName: 'ilyStream - Like Tracker (2)',
      inputKind: 'browser_source',
      inputSettings: {
        url: 'http://127.0.0.1:8899/overlay/likes-1',
        width: 400,
        height: 280,
        fps: 60,
        fps_custom: true,
        is_local_file: false,
        shutdown: false,
        restart_when_active: false
      },
      sceneItemEnabled: true
    })
    expect(callMock).not.toHaveBeenCalledWith(
      'SetInputSettings',
      expect.objectContaining({ inputName: 'ilyStream - Like Tracker' })
    )
  })

  it('serializes duplicate upserts so concurrent calls create one input and one scene item', async () => {
    const service = await createConnectedService()
    let created = false
    const settings = {
      url: 'http://127.0.0.1:8899/overlay/chat-1',
      width: 1080,
      height: 1920,
      fps: 60,
      fps_custom: true,
      is_local_file: false,
      shutdown: false,
      restart_when_active: false
    }
    callMock.mockImplementation(async (requestType: string) => {
      if (requestType === 'GetCurrentProgramScene') return { currentProgramSceneName: 'Main' }
      if (requestType === 'GetSceneItemList') {
        return {
          sceneItems: created
            ? [{ sceneItemId: 8, sourceName: 'ilyStream - Chat', sourceUuid: 'chat-uuid' }]
            : []
        }
      }
      if (requestType === 'GetInputList') {
        return {
          inputs: created
            ? [{ inputName: 'ilyStream - Chat', inputUuid: 'chat-uuid', inputKind: 'browser_source' }]
            : []
        }
      }
      if (requestType === 'GetInputSettings') return { inputSettings: settings }
      if (requestType === 'CreateInput') {
        created = true
        return { inputUuid: 'chat-uuid', sceneItemId: 8 }
      }
      return {}
    })

    const request = {
      widgetId: 'chat-1',
      widgetName: 'Chat',
      widgetType: 'chat-unified' as const
    }
    const [first, second] = await Promise.all([
      service.upsertWidgetBrowserSource(request),
      service.upsertWidgetBrowserSource(request)
    ])

    expect(first.created).toBe(true)
    expect(second).toEqual(expect.objectContaining({ created: false, updated: false }))
    expect(second.attachment).toEqual(expect.objectContaining({
      alreadyAttached: true,
      sceneItemId: 8
    }))
    expect(callMock.mock.calls.filter(([requestType]) => requestType === 'CreateInput')).toHaveLength(1)
    expect(callMock.mock.calls.filter(([requestType]) => requestType === 'CreateSceneItem')).toHaveLength(0)
  })

  it('recovers a source when the CreateInput response is lost after OBS commits it', async () => {
    const service = await createConnectedService()
    let committed = false
    callMock.mockImplementation(async (requestType: string) => {
      if (requestType === 'GetCurrentProgramScene') return { currentProgramSceneName: 'Main' }
      if (requestType === 'GetSceneItemList') {
        return {
          sceneItems: committed
            ? [{ sceneItemId: 17, sourceName: 'ilyStream - Alerts', sourceUuid: 'alerts-uuid' }]
            : []
        }
      }
      if (requestType === 'GetInputList') {
        return {
          inputs: committed
            ? [{ inputName: 'ilyStream - Alerts', inputUuid: 'alerts-uuid', inputKind: 'browser_source' }]
            : []
        }
      }
      if (requestType === 'GetInputSettings') {
        return {
          inputSettings: {
            url: 'http://127.0.0.1:8899/overlay/alerts-1',
            width: 1920,
            height: 1080,
            fps: 60,
            fps_custom: true
          }
        }
      }
      if (requestType === 'CreateInput') {
        committed = true
        throw new Error('request timed out')
      }
      return {}
    })

    const result = await service.upsertWidgetBrowserSource({
      widgetId: 'alerts-1',
      widgetName: 'Alerts',
      widgetType: 'alerts'
    })

    expect(result.created).toBe(true)
    expect(result.source).toEqual(expect.objectContaining({
      inputName: 'ilyStream - Alerts',
      inputUuid: 'alerts-uuid'
    }))
    expect(result.attachment).toEqual(expect.objectContaining({
      alreadyAttached: true,
      sceneItemId: 17
    }))
    expect(result.warnings).toEqual([
      'OBS created the source but did not acknowledge the request: request timed out'
    ])
    expect(callMock.mock.calls.filter(([requestType]) => requestType === 'CreateSceneItem')).toHaveLength(0)
  })

  it('preserves an existing input identity, repairs settings, and does not duplicate a nested item', async () => {
    const service = await createConnectedService()
    callMock.mockImplementation(async (requestType: string, requestData?: any) => {
      if (requestType === 'GetCurrentProgramScene') return { currentProgramSceneName: 'Main' }
      if (requestType === 'GetSceneItemList') {
        return requestData?.sceneName === 'Main'
          ? { sceneItems: [{ sceneItemId: 2, sourceName: 'Nested Scene', sourceType: 'OBS_SOURCE_TYPE_SCENE' }] }
          : { sceneItems: [{ sceneItemId: 91, sourceName: 'My Existing Widget', sourceUuid: 'primary-uuid' }] }
      }
      if (requestType === 'GetInputList') {
        return {
          inputs: [
            { inputName: 'My Existing Widget', inputUuid: 'primary-uuid', inputKind: 'browser_source' },
            { inputName: 'Duplicate Widget', inputUuid: 'duplicate-uuid', inputKind: 'browser_source' },
            { inputName: 'StreamElements', inputKind: 'browser_source' }
          ]
        }
      }
      if (requestType === 'GetInputSettings') {
        if (requestData?.inputName === 'StreamElements') {
          return { inputSettings: { url: 'https://streamelements.com/overlay/example' } }
        }
        return {
          inputSettings: {
            url: 'http://localhost:8899/overlay/alerts-1',
            width: 640,
            height: 360,
            fps: 30,
            fps_custom: false,
            restart_when_active: true
          }
        }
      }
      return {}
    })

    const result = await service.upsertWidgetBrowserSource({
      widgetId: 'alerts-1',
      widgetName: 'Alerts',
      widgetType: 'alerts',
      inputName: 'My Existing Widget'
    })

    expect(result).toEqual(expect.objectContaining({
      created: false,
      updated: true,
      duplicateInputNames: ['Duplicate Widget'],
      warnings: []
    }))
    expect(result.source.inputName).toBe('My Existing Widget')
    expect(result.attachment).toEqual(expect.objectContaining({
      alreadyAttached: true,
      nested: true,
      containerName: 'Nested Scene',
      sceneItemId: 91
    }))
    expect(callMock).toHaveBeenCalledWith('SetInputSettings', expect.objectContaining({
      inputName: 'My Existing Widget',
      overlay: true
    }))
    expect(callMock.mock.calls.filter(([requestType]) => requestType === 'CreateSceneItem')).toHaveLength(0)
  })

  it('reports a partial attach failure after safely updating an existing source', async () => {
    const service = await createConnectedService()
    callMock.mockImplementation(async (requestType: string) => {
      if (requestType === 'GetCurrentProgramScene') return { currentProgramSceneName: 'Main' }
      if (requestType === 'GetSceneItemList') return { sceneItems: [] }
      if (requestType === 'GetInputList') {
        return { inputs: [{ inputName: 'Alerts', inputUuid: 'alerts-uuid', inputKind: 'browser_source' }] }
      }
      if (requestType === 'GetInputSettings') {
        return { inputSettings: { url: 'http://127.0.0.1:8899/overlay/alerts-1', width: 1, height: 1 } }
      }
      if (requestType === 'CreateSceneItem') throw new Error('scene collection changed')
      return {}
    })

    const result = await service.upsertWidgetBrowserSource({
      widgetId: 'alerts-1',
      widgetName: 'Alerts',
      widgetType: 'alerts'
    })

    expect(result.updated).toBe(true)
    expect(result.attachment).toBeNull()
    expect(result.warnings).toEqual([
      'The browser source was updated, but OBS could not attach it to "Main": scene collection changed'
    ])
  })

  it('attaches an existing managed input by UUID to the current scene', async () => {
    const service = await createConnectedService()
    callMock.mockImplementation(async (requestType: string) => {
      if (requestType === 'GetInputList') {
        return {
          inputs: [{ inputName: 'ilyStream Alerts', inputUuid: 'alerts-uuid', inputKind: 'browser_source' }]
        }
      }
      if (requestType === 'GetInputSettings') {
        return { inputSettings: { url: 'http://127.0.0.1:8899/overlay/alerts-1' } }
      }
      if (requestType === 'GetCurrentProgramScene') return { currentProgramSceneName: 'Main' }
      if (requestType === 'GetSceneItemList') return { sceneItems: [] }
      if (requestType === 'CreateSceneItem') return { sceneItemId: 63 }
      return {}
    })

    const result = await service.attachManagedBrowserSourceToScene({
      inputName: 'ilyStream Alerts'
    })

    expect(result).toEqual({
      inputName: 'ilyStream Alerts',
      sceneName: 'Main',
      containerName: 'Main',
      sceneItemId: 63,
      attached: true,
      alreadyAttached: false,
      nested: false
    })
    expect(callMock).toHaveBeenCalledWith('CreateSceneItem', {
      sceneName: 'Main',
      sourceUuid: 'alerts-uuid',
      sceneItemEnabled: true
    })
  })

  it('repairs only the selected managed source while preserving its OBS identity', async () => {
    const service = await createConnectedService()
    callMock.mockImplementation(async (requestType: string) => {
      if (requestType === 'GetInputList') {
        return {
          inputs: [
            { inputName: 'Custom Alerts Name', inputUuid: 'alerts-uuid', inputKind: 'browser_source' },
            { inputName: 'StreamElements', inputUuid: 'se-uuid', inputKind: 'browser_source' }
          ]
        }
      }
      if (requestType === 'GetInputSettings') {
        return {
          inputSettings: {
            url: 'http://localhost:8899/overlay/alerts-1.html?legacy=1',
            width: 640,
            height: 360,
            fps: 30,
            fps_custom: false
          }
        }
      }
      return {}
    })

    const result = await service.repairManagedBrowserSource({
      inputName: 'Custom Alerts Name',
      widgetId: 'alerts-1',
      widgetName: 'Alerts',
      widgetType: 'alerts'
    })

    expect(result).toEqual(expect.objectContaining({ repaired: true }))
    expect(result.source).toEqual(expect.objectContaining({
      inputName: 'Custom Alerts Name',
      inputUuid: 'alerts-uuid',
      url: 'http://127.0.0.1:8899/overlay/alerts-1',
      width: 1920,
      height: 1080,
      fps: 60
    }))
    expect(callMock).toHaveBeenCalledWith('SetInputSettings', expect.objectContaining({
      inputName: 'Custom Alerts Name',
      overlay: true
    }))
    expect(callMock.mock.calls.filter(([requestType]) => requestType === 'SetInputName')).toHaveLength(0)
  })

  it('refreshes exactly one explicitly selected managed source', async () => {
    const service = await createConnectedService()
    callMock.mockImplementation(async (requestType: string, requestData?: { inputName?: string }) => {
      if (requestType === 'GetInputList') {
        return {
          inputs: [
            { inputName: 'Chat', inputKind: 'browser_source' },
            { inputName: 'Alerts', inputKind: 'browser_source' }
          ]
        }
      }
      if (requestType === 'GetInputSettings') {
        return {
          inputSettings: {
            url: `http://127.0.0.1:8899/overlay/${requestData?.inputName?.toLowerCase()}`
          }
        }
      }
      return {}
    })

    await expect(service.refreshManagedBrowserSource('Alerts')).resolves.toEqual({
      inputName: 'Alerts',
      refreshed: true
    })
    expect(callMock.mock.calls.filter(([requestType]) => requestType === 'PressInputPropertiesButton'))
      .toEqual([['PressInputPropertiesButton', {
        inputName: 'Alerts',
        propertyName: 'refreshnocache'
      }]])
    expect(callMock).not.toHaveBeenCalledWith('GetInputSettings', { inputName: 'Chat' })
  })

  it('refuses repair and refresh operations for unrelated browser sources', async () => {
    const service = await createConnectedService()
    callMock.mockImplementation(async (requestType: string) => {
      if (requestType === 'GetInputList') {
        return { inputs: [{ inputName: 'StreamElements', inputKind: 'browser_source' }] }
      }
      if (requestType === 'GetInputSettings') {
        return { inputSettings: { url: 'https://streamelements.com/overlay/example' } }
      }
      return {}
    })

    await expect(service.repairManagedBrowserSource({
      inputName: 'StreamElements',
      widgetId: 'alerts-1',
      widgetName: 'Alerts',
      widgetType: 'alerts'
    })).rejects.toThrow('is not a managed ilyStream loopback overlay')
    await expect(service.refreshManagedBrowserSource('StreamElements'))
      .rejects.toThrow('is not a managed ilyStream loopback overlay')
    expect(callMock.mock.calls.filter(([requestType]) => requestType === 'SetInputSettings')).toHaveLength(0)
    expect(callMock.mock.calls.filter(([requestType]) => requestType === 'PressInputPropertiesButton')).toHaveLength(0)
  })

  it('rejects source management while OBS is disconnected without issuing requests', async () => {
    const service = new OBSService()

    await expect(service.getManagedBrowserSources()).rejects.toThrow('OBS is not connected')
    await expect(service.upsertWidgetBrowserSource({
      widgetId: 'alerts-1',
      widgetName: 'Alerts',
      widgetType: 'alerts'
    })).rejects.toThrow('OBS is not connected')
    expect(callMock).not.toHaveBeenCalled()
  })
})

describe('isIlyStreamOverlayUrl', () => {
  it('accepts loopback overlay routes only', () => {
    expect(isIlyStreamOverlayUrl('http://127.0.0.1:8899/overlay/chat.html')).toBe(true)
    expect(isIlyStreamOverlayUrl('http:/localhost:8899/overlay/likes.html')).toBe(true)
    expect(isIlyStreamOverlayUrl('http://127.0.0.1:3000/overlay/chat.html')).toBe(false)
    expect(isIlyStreamOverlayUrl('http://127.0.0.1:3000/overlay/chat.html', 3000)).toBe(true)
    expect(isIlyStreamOverlayUrl('https://example.com/overlay/chat.html')).toBe(false)
    expect(isIlyStreamOverlayUrl('https://127.0.0.1:8899/overlay/chat.html')).toBe(false)
    expect(isIlyStreamOverlayUrl('http://user@127.0.0.1:8899/overlay/chat.html')).toBe(false)
    expect(isIlyStreamOverlayUrl('http://127.0.0.1:8899/overlay/chat/extra')).toBe(false)
    expect(isIlyStreamOverlayUrl('http://127.0.0.1:8899/api/v1/status')).toBe(false)
    expect(isIlyStreamOverlayUrl('not a URL')).toBe(false)
  })
})

describe('getWidgetBrowserSourceRecommendation', () => {
  it('uses widget-specific dimensions, live config, and the canonical loopback URL', () => {
    expect(getWidgetBrowserSourceRecommendation({
      widgetId: 'ABC-123',
      widgetName: 'Voice',
      widgetType: 'discord-call',
      widgetConfig: { panelWidth: 680, panelMaxHeight: 510 }
    }, 4211)).toEqual({
      url: 'http://127.0.0.1:4211/overlay/abc-123',
      width: 680,
      height: 510,
      fps: 60
    })

    expect(getWidgetBrowserSourceRecommendation({
      widgetId: 'chat-1',
      widgetName: 'Chat',
      widgetType: 'chat',
      widgetConfig: { forceTikTokDimensions: true }
    })).toEqual(expect.objectContaining({ width: 1080, height: 1920 }))
  })

  it('clamps explicit capture overrides', () => {
    expect(getWidgetBrowserSourceRecommendation({
      widgetId: 'alerts-1',
      widgetName: 'Alerts',
      widgetType: 'alerts'
    }, 8899, { width: 20_000, height: -4, fps: 240 })).toEqual(expect.objectContaining({
      width: 8192,
      height: 1,
      fps: 60
    }))
  })
})
