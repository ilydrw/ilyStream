export const CHAT_BOTTOM_THRESHOLD = 40

export interface ChatScrollMetrics {
  scrollHeight: number
  scrollTop: number
  clientHeight: number
}

export interface ChatScrollState {
  atTop: boolean
  isPinnedToBottom: boolean
  scrollPercent: number
}

interface ChatMessageIdentity {
  id: string
}

export function getChatScrollState({
  scrollHeight,
  scrollTop,
  clientHeight
}: ChatScrollMetrics): ChatScrollState {
  const maxScroll = Math.max(0, scrollHeight - clientHeight)
  const distanceFromBottom = Math.max(0, maxScroll - scrollTop)

  return {
    atTop: scrollTop < 12,
    isPinnedToBottom: distanceFromBottom <= CHAT_BOTTOM_THRESHOLD,
    scrollPercent:
      maxScroll === 0
        ? 100
        : Math.max(0, Math.min(100, Math.round((scrollTop / maxScroll) * 100)))
  }
}

export function countAppendedChatMessages(
  previousTailId: string | null,
  previousLength: number,
  messages: readonly ChatMessageIdentity[]
): number {
  const nextTailId = messages.at(-1)?.id ?? null
  if (!nextTailId || nextTailId === previousTailId) return 0
  if (!previousTailId) return messages.length

  const previousTailIndex = messages.findIndex((message) => message.id === previousTailId)
  if (previousTailIndex >= 0) {
    return messages.length - previousTailIndex - 1
  }

  // The prior tail can disappear when a full retention buffer rolls over.
  return Math.max(1, messages.length - previousLength)
}
