const RENDERER_ASSET_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /unable to preload css/i,
  /loading chunk [^ ]+ failed/i
]

export function isRendererAssetLoadError(error: unknown): boolean {
  if (typeof error === 'string') {
    return RENDERER_ASSET_ERROR_PATTERNS.some((pattern) => pattern.test(error))
  }

  if (!(error instanceof Error)) return false

  const description = `${error.name}: ${error.message}`
  return RENDERER_ASSET_ERROR_PATTERNS.some((pattern) => pattern.test(description))
}
