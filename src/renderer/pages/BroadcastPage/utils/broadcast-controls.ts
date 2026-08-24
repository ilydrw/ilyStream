export type BroadcastHotkeyAction =
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'fade' }
  | { type: 'cut' }
  | { type: 'stinger' }
  | { type: 'toggle-studio-mode' }
  | { type: 'toggle-multiview' }
  | { type: 'select-scene'; index: number }
  | { type: 'close-overlays' }

type BroadcastHotkeyEvent = Pick<
  KeyboardEvent,
  'key' | 'repeat' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'target'
>

function isExcludedHotkeyTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false

  const element = target as {
    tagName?: unknown
    isContentEditable?: boolean
    closest?: (selector: string) => unknown
  }
  const tagName = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : ''

  if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(tagName)) return true
  if (element.isContentEditable) return true
  if (typeof element.closest !== 'function') return false

  return Boolean(element.closest(
    '.no-hotkeys, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="button"], [role="slider"]'
  ))
}

/**
 * Resolves only shortcuts owned by an active Broadcast Studio route.
 * Destructive start/stop broadcast and recording actions intentionally have
 * no bare-key bindings.
 */
export function resolveBroadcastHotkey(
  event: BroadcastHotkeyEvent,
  isRouteActive: boolean
): BroadcastHotkeyAction | null {
  if (!isRouteActive || event.repeat || isExcludedHotkeyTarget(event.target)) return null

  const key = event.key.toLowerCase()
  const hasPrimaryModifier = event.ctrlKey || event.metaKey

  if (hasPrimaryModifier) {
    // Treat Ctrl+Meta and Ctrl/Meta+Alt combinations as application or OS
    // shortcuts instead of claiming them for Studio.
    if ((event.ctrlKey && event.metaKey) || event.altKey) return null
    if (key === 'z') return { type: event.shiftKey ? 'redo' : 'undo' }
    if (key === 'y' && !event.shiftKey) return { type: 'redo' }
    return null
  }

  // Production keys are deliberately unmodified. This prevents collisions
  // with browser, Electron, accessibility, and operating-system shortcuts.
  if (event.altKey || event.shiftKey) return null

  if (event.key === ' ' || event.key === 'Enter') return { type: 'fade' }
  if (event.key === 'Escape') return { type: 'close-overlays' }
  if (/^[1-9]$/.test(event.key)) return { type: 'select-scene', index: Number(event.key) - 1 }

  switch (key) {
    case 'f': return { type: 'fade' }
    case 'c': return { type: 'cut' }
    case 't': return { type: 'stinger' }
    case 's': return { type: 'toggle-studio-mode' }
    case 'm': return { type: 'toggle-multiview' }
    default: return null
  }
}

export type BroadcastOperationIntent = 'start' | 'stop'

export function resolveBroadcastSessionStatus(
  streaming: boolean,
  recording: boolean,
  outputs: Array<{ state?: string }> = []
): 'Offline' | 'Recording' | 'Starting' | 'Reconnecting' | 'Live' {
  if (!streaming) return recording ? 'Recording' : 'Offline'
  if (outputs.some(output => output.state === 'reconnecting')) return 'Reconnecting'
  if (outputs.length === 0 || outputs.some(output => output.state === 'starting')) return 'Starting'
  return outputs.every(output => output.state === 'live') ? 'Live' : 'Starting'
}

export interface BroadcastOperationLock {
  run: (
    resource: 'broadcast' | 'recording',
    intent: BroadcastOperationIntent,
    operation: () => void | Promise<void>
  ) => Promise<void>
  isBusy: (resource: 'broadcast' | 'recording') => boolean
}

/**
 * Allows one output lifecycle operation at a time. Repeated requests share
 * the active promise. An opposing intent is queued behind the current one so
 * a Stop pressed during startup cannot be swallowed; rapidly alternating
 * intents serialize in click order and end at the user's latest requested
 * terminal state.
 */
export function createBroadcastOperationLock(): BroadcastOperationLock {
  const active = new Map<
    'broadcast' | 'recording',
    { intent: BroadcastOperationIntent; promise: Promise<void> }
  >()

  return {
    run(resource, intent, operation) {
      const current = active.get(resource)
      if (current?.intent === intent) return current.promise

      let promise: Promise<void>
      const ready = current
        ? current.promise.catch(() => {})
        : Promise.resolve()
      promise = ready
        .then(operation)
        .finally(() => {
          if (active.get(resource)?.promise === promise) active.delete(resource)
        })

      active.set(resource, { intent, promise })
      return promise
    },
    isBusy(resource) {
      return active.has(resource)
    }
  }
}
