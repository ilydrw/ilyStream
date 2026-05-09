export async function loadOptionalModule<T = unknown>(specifier: string): Promise<T | null> {
  try {
    // Avoid static resolution so truly optional packages do not break production builds.
    return await import(/* @vite-ignore */ specifier)
  } catch {
    return null
  }
}
