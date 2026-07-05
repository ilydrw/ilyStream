import { decodeHtmlEntities } from './html-entities'

const BLOCK_TAG_RE = /<\/?(?:address|article|aside|blockquote|div|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/gi

export function htmlToPlainText(value: unknown): string {
  let text = decodeHtmlEntities(value)

  text = text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(BLOCK_TAG_RE, '\n')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/<![a-z][^>]*>/gi, ' ')

  return normalizePlainText(text)
}

export function htmlToSingleLinePlainText(value: unknown): string {
  return htmlToPlainText(value).replace(/\s+/g, ' ').trim()
}

export function normalizePlainText(value: unknown): string {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/ +([!?,.;:])/g, '$1')
    .trim()
}

export function plainTextToSafeHtml(value: unknown): string {
  return normalizePlainText(value)
    .split('\n')
    .map(escapeHtml)
    .join('<br />')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
