import {
  buildGoveeBlePackets,
  createGoveeBleDeviceId,
  GOVEE_BLE_NAME_PREFIXES,
  GOVEE_BLE_SERVICE_UUIDS,
  GOVEE_BLE_WRITE_CHARACTERISTIC_UUIDS,
  inferGoveeModelFromName,
  type GoveeBleCommandPayload,
  type GoveeBleDeviceRecord,
  type GoveeBleProtocol
} from '../../shared/govee-ble'

type BluetoothLikeDevice = EventTarget & {
  id: string
  name?: string
  gatt?: {
    connected?: boolean
    connect: () => Promise<BluetoothLikeServer>
  }
}

type BluetoothLikeServer = {
  connected?: boolean
  getPrimaryService: (uuid: string) => Promise<BluetoothLikeService>
}

type BluetoothLikeService = {
  getCharacteristic: (uuid: string) => Promise<BluetoothLikeCharacteristic>
}

type BluetoothLikeCharacteristic = {
  writeValue?: (value: BufferSource) => Promise<void>
  writeValueWithoutResponse?: (value: BufferSource) => Promise<void>
}

type WebBluetoothNavigator = Navigator & {
  bluetooth?: {
    requestDevice: (options: Record<string, unknown>) => Promise<BluetoothLikeDevice>
    getDevices?: () => Promise<BluetoothLikeDevice[]>
  }
}

type RuntimeDevice = {
  record: GoveeBleDeviceRecord
  device: BluetoothLikeDevice
  characteristic: BluetoothLikeCharacteristic
}

const runtimeDevices = new Map<string, RuntimeDevice>()
const runtimeListeners = new Set<() => void>()

export function isGoveeBleSupported(): boolean {
  return Boolean((navigator as WebBluetoothNavigator).bluetooth?.requestDevice)
}

export function getGoveeBleRuntimeSnapshot(): GoveeBleDeviceRecord[] {
  return Array.from(runtimeDevices.values()).map((entry) => entry.record)
}

export function subscribeGoveeBleRuntime(listener: () => void): () => void {
  runtimeListeners.add(listener)
  return () => runtimeListeners.delete(listener)
}

export async function pairGoveeBleDevice(options: {
  acceptAllDevices?: boolean
  protocol?: GoveeBleProtocol
} = {}): Promise<GoveeBleDeviceRecord> {
  const bluetooth = getWebBluetooth()
  const device = await bluetooth.requestDevice(createRequestDeviceOptions(options.acceptAllDevices === true))
  return connectAndRegisterDevice(device, options.protocol || 'auto')
}

export async function reconnectKnownGoveeBleDevices(): Promise<GoveeBleDeviceRecord[]> {
  const bluetooth = getWebBluetooth()
  const getDevices = bluetooth.getDevices
  if (!getDevices) return []

  const [knownRecords, grantedDevices] = await Promise.all([
    window.api.govee.getBleDevices(),
    getDevices.call(bluetooth)
  ])
  const connected: GoveeBleDeviceRecord[] = []

  for (const record of knownRecords as GoveeBleDeviceRecord[]) {
    const device = grantedDevices.find((candidate) => candidate.id === record.bluetoothId)
    if (!device) continue
    try {
      connected.push(await connectAndRegisterDevice(device, record.protocol, record))
    } catch (error) {
      await window.api.govee.updateBleDeviceStatus({
        device: record.device,
        connected: false,
        lastError: formatError(error)
      })
    }
  }

  return connected
}

export async function sendGoveeBleCommand(payload: GoveeBleCommandPayload): Promise<void> {
  let runtimeDevice = runtimeDevices.get(payload.deviceId)
  if (!runtimeDevice) {
    runtimeDevice = (await reconnectRuntimeDevice(payload)) ?? undefined
  }
  if (!runtimeDevice) {
    throw new Error('Bluetooth device is not paired with this app session.')
  }

  try {
    const packets = buildGoveeBlePackets({
      rgb: payload.rgb,
      brightness: payload.brightness,
      protocol: payload.protocol || runtimeDevice.record.protocol || 'auto'
    })

    for (const packet of packets) {
      await writePacket(runtimeDevice.characteristic, packet)
      await delay(35)
    }

    runtimeDevice.record.connected = true
    runtimeDevice.record.lastSeen = Date.now()
    runtimeDevice.record.lastError = undefined
    await window.api.govee.updateBleDeviceStatus({
      device: runtimeDevice.record.device,
      connected: true
    })
    notifyRuntimeListeners()
  } catch (error) {
    const lastError = formatError(error)
    runtimeDevice.record.connected = false
    runtimeDevice.record.lastError = lastError
    await window.api.govee.updateBleDeviceStatus({
      device: runtimeDevice.record.device,
      connected: false,
      lastError
    })
    notifyRuntimeListeners()
    throw error
  }
}

export function disconnectGoveeBleDevice(deviceId: string): void {
  runtimeDevices.delete(deviceId)
  notifyRuntimeListeners()
}

async function reconnectRuntimeDevice(payload: GoveeBleCommandPayload): Promise<RuntimeDevice | null> {
  const bluetooth = getWebBluetooth()
  if (!bluetooth.getDevices) return null
  const grantedDevices = await bluetooth.getDevices()
  const device = grantedDevices.find((candidate) => candidate.id === payload.bluetoothId)
  if (!device) return null

  const record: GoveeBleDeviceRecord = {
    device: payload.deviceId,
    bluetoothId: payload.bluetoothId,
    deviceName: device.name || 'Govee Bluetooth',
    model: inferGoveeModelFromName(device.name || ''),
    protocol: payload.protocol || 'auto',
    connected: false,
    lastSeen: Date.now()
  }

  await connectAndRegisterDevice(device, payload.protocol || 'auto', record)
  return runtimeDevices.get(payload.deviceId) || null
}

async function connectAndRegisterDevice(
  device: BluetoothLikeDevice,
  protocol: GoveeBleProtocol,
  existing?: GoveeBleDeviceRecord
): Promise<GoveeBleDeviceRecord> {
  if (!device.gatt) {
    throw new Error('This Bluetooth device does not expose a GATT server.')
  }

  const server = await device.gatt.connect()
  const characteristic = await resolveWriteCharacteristic(server)
  const record: GoveeBleDeviceRecord = {
    device: existing?.device || createGoveeBleDeviceId(device.id),
    bluetoothId: device.id,
    deviceName: existing?.deviceName || device.name || 'Govee Bluetooth',
    model: existing?.model || inferGoveeModelFromName(device.name || ''),
    protocol,
    connected: true,
    lastSeen: Date.now()
  }

  device.addEventListener('gattserverdisconnected', () => {
    runtimeDevices.delete(record.device)
    void window.api.govee.updateBleDeviceStatus({
      device: record.device,
      connected: false,
      lastError: 'Bluetooth disconnected'
    })
    notifyRuntimeListeners()
  })

  runtimeDevices.set(record.device, { record, device, characteristic })
  const saved = await window.api.govee.registerBleDevice(record)
  notifyRuntimeListeners()
  return saved as GoveeBleDeviceRecord
}

async function resolveWriteCharacteristic(server: BluetoothLikeServer): Promise<BluetoothLikeCharacteristic> {
  const failures: string[] = []

  for (const serviceUuid of GOVEE_BLE_SERVICE_UUIDS) {
    try {
      const service = await server.getPrimaryService(serviceUuid)
      for (const characteristicUuid of GOVEE_BLE_WRITE_CHARACTERISTIC_UUIDS) {
        try {
          return await service.getCharacteristic(characteristicUuid)
        } catch (error) {
          failures.push(`${characteristicUuid}: ${formatError(error)}`)
        }
      }
    } catch (error) {
      failures.push(`${serviceUuid}: ${formatError(error)}`)
    }
  }

  throw new Error(`No supported Govee BLE write characteristic found. ${failures[0] || ''}`.trim())
}

async function writePacket(characteristic: BluetoothLikeCharacteristic, packet: Uint8Array): Promise<void> {
  const view = packet as Uint8Array<ArrayBuffer>
  if (typeof characteristic.writeValueWithoutResponse === 'function') {
    await characteristic.writeValueWithoutResponse(view)
    return
  }
  if (typeof characteristic.writeValue === 'function') {
    await characteristic.writeValue(view)
    return
  }
  throw new Error('Bluetooth characteristic does not support writes.')
}

function createRequestDeviceOptions(acceptAllDevices: boolean): Record<string, unknown> {
  const optionalServices = [...GOVEE_BLE_SERVICE_UUIDS]
  if (acceptAllDevices) {
    return { acceptAllDevices: true, optionalServices }
  }

  return {
    filters: GOVEE_BLE_NAME_PREFIXES.map((namePrefix) => ({ namePrefix })),
    optionalServices
  }
}

function getWebBluetooth() {
  const bluetooth = (navigator as WebBluetoothNavigator).bluetooth
  if (!bluetooth?.requestDevice) {
    throw new Error('Web Bluetooth is not available in this Electron session.')
  }
  return bluetooth
}

function notifyRuntimeListeners(): void {
  for (const listener of runtimeListeners) listener()
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
