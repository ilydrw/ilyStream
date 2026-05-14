import { beforeEach, describe, expect, it, vi } from 'vitest'

const connectMock = vi.fn()
const disconnectMock = vi.fn()
const callMock = vi.fn()
const onMock = vi.fn()

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

import { OBSService } from './obs-service'

describe('OBSService', () => {
  beforeEach(() => {
    connectMock.mockReset()
    disconnectMock.mockReset()
    callMock.mockReset()
    onMock.mockReset()
    disconnectMock.mockResolvedValue(undefined)
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
})
