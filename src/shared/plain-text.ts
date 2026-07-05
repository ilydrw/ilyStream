export function htmlToPlainText(html: string): string {
  if (!html) return ''
  return html.replace(/<[^>]*>?/gm, '')
}

export function plainTextToSafeHtml(text: string): string {
  if (!text) return ''
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function htmlToSingleLinePlainText(html: string): string {
  return htmlToPlainText(html).replace(/\n/g, ' ').trim()
}
