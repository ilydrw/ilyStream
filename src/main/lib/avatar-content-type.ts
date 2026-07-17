/**
 * Infer the MIME type of cached avatar bytes. Avatar cache filenames are
 * content hashes without extensions, so the original response header is not
 * available on a cache hit.
 */
export function detectAvatarContentType(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }

  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }

  if (buffer.length >= 6) {
    const signature = buffer.subarray(0, 6).toString('ascii')
    if (signature === 'GIF87a' || signature === 'GIF89a') return 'image/gif'
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }

  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return 'image/bmp'
  }

  if (buffer.length >= 4 && buffer[0] === 0 && buffer[1] === 0 && buffer[2] === 1 && buffer[3] === 0) {
    return 'image/x-icon'
  }

  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii')
    if (brand === 'avif' || brand === 'avis') return 'image/avif'
  }

  const textPrefix = buffer.subarray(0, 512).toString('utf8').replace(/^\uFEFF/, '').trimStart()
  if (/^(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(textPrefix)) {
    return 'image/svg+xml'
  }

  return null
}

export function resolveAvatarContentType(buffer: Buffer, declaredContentType?: string | null): string | null {
  const detected = detectAvatarContentType(buffer)
  if (detected) return detected

  const declared = declaredContentType?.split(';', 1)[0].trim().toLowerCase()
  return declared?.startsWith('image/') ? declared : null
}
