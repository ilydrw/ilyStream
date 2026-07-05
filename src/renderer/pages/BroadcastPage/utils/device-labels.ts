const USB_ID_SUFFIX_PATTERN = /\s*\(([0-9a-f]{4}:[0-9a-f]{4})\)\s*$/i

export function getDeviceDisplayName(device: MediaDeviceInfo | undefined, fallbackPrefix: string): string {
  if (!device) return fallbackPrefix
  return cleanDeviceLabel(device.label) || `${fallbackPrefix} ${device.deviceId.slice(0, 8)}`
}

export function cleanDeviceLabel(label: string | undefined): string {
  return String(label || '')
    .replace(USB_ID_SUFFIX_PATTERN, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
