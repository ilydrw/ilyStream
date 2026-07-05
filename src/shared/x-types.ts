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
