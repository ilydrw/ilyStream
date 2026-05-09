import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GoveeService,
  mergeGoveeDeviceLists,
  parseGoveeLanScanResponse,
  type GoveeDevice
} from './govee-service'

describe('Govee LAN discovery helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('parses a LAN scan response into a controllable LAN device', () => {
    const device = parseGoveeLanScanResponse(
      JSON.stringify({
        msg: {
          cmd: 'scan',
          data: {
            ip: '192.168.1.23',
            device: '1F:80:C5:32:32:36:72:4E',
            sku: 'H610A',
            wifiVersionSoft: '1.02.03'
          }
        }
      }),
      '192.168.1.99'
    )

    expect(device).toEqual(
      expect.objectContaining({
        device: '1F:80:C5:32:32:36:72:4E',
        model: 'H610A',
        deviceName: 'Govee H610A',
        source: 'lan',
        ip: '192.168.1.23',
        controllable: true
      })
    )
    expect(device?.supportCmds).toContain('colorwc')
  })

  it('uses the UDP remote address when a LAN scan response omits ip', () => {
    const device = parseGoveeLanScanResponse(
      JSON.stringify({
        msg: {
          cmd: 'scan',
          data: {
            device: 'AA:BB',
            sku: 'Hxxxx'
          }
        }
      }),
      '192.168.1.55'
    )

    expect(device?.ip).toBe('192.168.1.55')
    expect(device?.controllable).toBe(true)
  })

  it('merges matching cloud and LAN devices while keeping LAN-only devices', () => {
    const cloud: GoveeDevice[] = [
      {
        device: '1F80C5323236724E',
        model: 'H610A',
        deviceName: 'Desk Strip',
        controllable: true,
        retrievable: true,
        supportCmds: ['color', 'brightness'],
        source: 'cloud'
      }
    ]
    const lan: GoveeDevice[] = [
      {
        device: '1F:80:C5:32:32:36:72:4E',
        model: 'H610A',
        deviceName: 'Govee H610A',
        controllable: true,
        retrievable: true,
        supportCmds: ['turn', 'brightness', 'colorwc'],
        source: 'lan',
        ip: '192.168.1.23'
      },
      {
        device: 'AA:BB:CC',
        model: 'H6159',
        deviceName: 'Govee H6159',
        controllable: true,
        retrievable: true,
        supportCmds: ['turn', 'brightness', 'colorwc'],
        source: 'lan',
        ip: '192.168.1.24'
      }
    ]

    const merged = mergeGoveeDeviceLists(cloud, lan)

    expect(merged).toHaveLength(2)
    expect(merged[0]).toEqual(
      expect.objectContaining({
        deviceName: 'Desk Strip',
        source: 'cloud+lan',
        ip: '192.168.1.23'
      })
    )
    expect(merged[0].supportCmds).toEqual(expect.arrayContaining(['color', 'colorwc']))
    expect(merged[1]).toEqual(expect.objectContaining({ source: 'lan', ip: '192.168.1.24' }))
  })

  it('only triggers selected devices during alerts', async () => {
    const service = new GoveeService(createFakeDb() as any)
    const roommateDevice: GoveeDevice = {
      device: 'ROOMMATE',
      model: 'H6198',
      deviceName: 'Roommate Strip',
      controllable: true,
      retrievable: true,
      supportCmds: ['color'],
      source: 'cloud'
    }
    const selectedDevice: GoveeDevice = {
      device: 'H612F-LAN',
      model: 'H612F',
      deviceName: 'Govee H612F',
      controllable: true,
      retrievable: true,
      supportCmds: ['colorwc'],
      source: 'lan',
      ip: '192.168.1.74'
    }

    ;(service as any).cloudDevices = [roommateDevice]
    ;(service as any).lanDevices = new Map([['h612flan', selectedDevice]])
    service.setSelectedDevices(['H612F-LAN'])

    const controlLanDevice = vi.fn().mockResolvedValue(undefined)
    const controlCloudDevice = vi.fn().mockResolvedValue(undefined)
    ;(service as any).controlLanDevice = controlLanDevice
    ;(service as any).controlCloudDevice = controlCloudDevice

    await service.triggerAlert({ r: 25, g: 200, b: 255 })

    expect(controlLanDevice).toHaveBeenCalledWith(
      expect.objectContaining({ device: 'H612F-LAN' }),
      { r: 25, g: 200, b: 255 }
    )
    expect(controlCloudDevice).not.toHaveBeenCalled()
  })

  it('does not trigger any devices when none are selected', async () => {
    const service = new GoveeService(createFakeDb() as any)
    ;(service as any).cloudDevices = [
      {
        device: 'ROOMMATE',
        model: 'H6198',
        deviceName: 'Roommate Strip',
        controllable: true,
        retrievable: true,
        supportCmds: ['color'],
        source: 'cloud'
      }
    ]
    ;(service as any).rebuildDeviceList()

    const controlCloudDevice = vi.fn().mockResolvedValue(undefined)
    ;(service as any).controlCloudDevice = controlCloudDevice

    await service.triggerAlert({ r: 25, g: 200, b: 255 })

    expect(controlCloudDevice).not.toHaveBeenCalled()
  })
})

function createFakeDb() {
  const settings = new Map<string, unknown>()
  return {
    getSetting: vi.fn((key: string) => settings.get(key)),
    setSetting: vi.fn((key: string, value: unknown) => settings.set(key, value))
  }
}
