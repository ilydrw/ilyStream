/** Status of the X (Twitter) posting integration, surfaced to the renderer. */
export interface XStatus {
  connected: boolean
  /** @handle of the authorized account, when connected. */
  handle: string | null
  /** Last error message, if the most recent operation failed. */
  error: string | null
}

export interface XPostResult {
  id: string
  url: string
}

/** Default go-live tweet, editable by the user and remembered between streams. */
export const DEFAULT_X_GO_LIVE_TEMPLATE =
  '🔴 LIVE NOW! Come hang out 👉 [your stream link]'

/**
 * Substitutes {title} with the stream title from the Broadcast page's stream
 * info. With no title set, the placeholder is removed and leftover doubled
 * spaces are collapsed so the post still reads cleanly.
 */
export function renderGoLiveTemplate(template: string, values: { title?: string }): string {
  const title = (values.title || '').trim()
  const rendered = template.replace(/\{title\}/gi, title)
  return (title ? rendered : rendered.replace(/[ \t]{2,}/g, ' ')).trim()
}
