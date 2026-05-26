const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"'
}

export function decodeHtmlEntities(value: unknown): string {
  let decoded = String(value ?? '')

  for (let pass = 0; pass < 3; pass++) {
    const next = decoded.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z][a-z0-9]+));?/gi, (match, decimal, hex, named) => {
      if (decimal) return decodeCodePoint(Number(decimal), match)
      if (hex) return decodeCodePoint(Number.parseInt(hex, 16), match)

      const replacement = NAMED_HTML_ENTITIES[String(named).toLowerCase()]
      return replacement ?? match
    })

    if (next === decoded) break
    decoded = next
  }

  return decoded
}

function decodeCodePoint(codePoint: number, fallback: string): string {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return fallback
  }

  try {
    return String.fromCodePoint(codePoint)
  } catch {
    return fallback
  }
}
