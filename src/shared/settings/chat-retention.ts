export const CHAT_MESSAGE_RETENTION_LIMIT = 150

export function normalizeChatMessageRetention(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return CHAT_MESSAGE_RETENTION_LIMIT
  return Math.max(1, Math.min(CHAT_MESSAGE_RETENTION_LIMIT, Math.round(numeric)))
}
