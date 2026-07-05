export type GoveeBleProtocol = 'auto' | 'basic-rgb' | 'segments-15' | 'h617-segments'

export interface GoveeBleDeviceRecord {
  device: string
  bluetoothId: string
  deviceName: string
  model: string
  protocol: GoveeBleProtocol
  connected: boolean
  lastSeen: number
  lastError?: string
}

export interface GoveeBleDevicePickerItem {
  deviceId: string
  deviceName: string
}

export interface GoveeBleCommandPayload {
  deviceId: string
  bluetoothId: string
  rgb: { r: number; g: number; b: number }
  protocol: GoveeBleProtocol
  brightness?: number
}

export const GOVEE_BLE_LIGHT_SERVICE_UUID = '00010203-0405-0607-0809-0a0b0c0d1910'
export const GOVEE_BLE_LIGHT_WRITE_CHARACTERISTIC_UUID = '00010203-0405-0607-0809-0a0b0c0d2b11'
export const GOVEE_BLE_ALT_SERVICE_UUID = '494e5445-4c4c-495f-524f-434b535f2010'
export const GOVEE_BLE_ALT_WRITE_CHARACTERISTIC_UUID = '494e5445-4c4c-495f-524f-434b535f2012'

export const GOVEE_BLE_SERVICE_UUIDS = [
  GOVEE_BLE_LIGHT_SERVICE_UUID,
  GOVEE_BLE_ALT_SERVICE_UUID
] as const

export const GOVEE_BLE_WRITE_CHARACTERISTIC_UUIDS = [
  GOVEE_BLE_LIGHT_WRITE_CHARACTERISTIC_UUID,
  GOVEE_BLE_ALT_WRITE_CHARACTERISTIC_UUID
] as const

export const GOVEE_BLE_NAME_PREFIXES = [
  'Govee',
  'govee',
  'GOVEE',
  'ihoment',
  'Ihoment',
  'H60',
  'H61',
  'H62',
  'H70',
  'H71'
] as const

export function normalizeGoveeBleDeviceId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function createGoveeBleDeviceId(bluetoothId: string): string {
  return `ble:${normalizeGoveeBleDeviceId(bluetoothId)}`
}

export function inferGoveeModelFromName(name: string): string {
  return name.match(/H\d{4}[A-Z]?/i)?.[0]?.toUpperCase() || 'BLE'
}

export function buildGoveeBlePackets(input: {
  rgb: { r: number; g: number; b: number }
  protocol?: GoveeBleProtocol
  brightness?: number
}): Uint8Array[] {
  const protocol = input.protocol || 'auto'
  const rgb = {
    r: clampByte(input.rgb.r),
    g: clampByte(input.rgb.g),
    b: clampByte(input.rgb.b)
  }
  const packets: Uint8Array[] = []

  packets.push(createPacket([0xaa, 0x01]))
  packets.push(createPacket([0x33, 0x01, 0x01]))

  if (typeof input.brightness === 'number') {
    packets.push(createPacket([0x33, 0x04, brightnessToGoveeByte(input.brightness)]))
  }

  const addBasicRgb = () => {
    packets.push(createPacket([0x33, 0x05, 0x02, rgb.r, rgb.g, rgb.b]))
  }
  const addSegments15 = () => {
    packets.push(createPacket([0x33, 0x05, 0x0b, rgb.r, rgb.g, rgb.b, 0xff, 0x7f]))
  }
  const addH617Segments = () => {
    packets.push(createPacket([
      0x33, 0x05, 0x15, 0x01,
      rgb.r, rgb.g, rgb.b,
      0x00, 0x00, 0x00, 0x00, 0x00,
      0xff, 0x7f
    ]))
  }

  if (protocol === 'basic-rgb') addBasicRgb()
  else if (protocol === 'segments-15') addSegments15()
  else if (protocol === 'h617-segments') addH617Segments()
  else {
    addBasicRgb()
    addSegments15()
    addH617Segments()
  }

  return packets
}

function createPacket(prefix: number[]): Uint8Array {
  const bytes = new Uint8Array(20)
  prefix.slice(0, 19).forEach((byte, index) => {
    bytes[index] = clampByte(byte)
  })

  let checksum = 0
  for (let index = 0; index < 19; index += 1) {
    checksum ^= bytes[index]
  }
  bytes[19] = checksum
  return bytes
}

function clampByte(value: number): number {
  const numeric = Math.round(Number(value))
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(255, numeric))
}

function brightnessToGoveeByte(value: number): number {
  const percent = Math.max(0, Math.min(100, Math.round(value)))
  if (percent <= 0) return 0
  return Math.round(0x14 + ((percent - 1) / 99) * (0xfe - 0x14))
}
