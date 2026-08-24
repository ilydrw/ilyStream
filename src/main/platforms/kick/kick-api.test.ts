import { describe, expect, it, vi } from 'vitest'
import { ensureKickEventSubscriptions } from './kick-api'

describe('Kick event subscriptions', () => {
  it('uses a supplied refreshable user token without requesting an app token', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      expect(url).not.toContain('id.kick.com/oauth/token')
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer user-token')
      if (init?.method === 'GET') return jsonResponse({ data: [] })
      return jsonResponse({
        data: [{ name: 'chat.message.sent', version: 1, subscription_id: 'sub-1' }]
      })
    }) as unknown as typeof fetch

    const result = await ensureKickEventSubscriptions({
      clientId: '',
      clientSecret: '',
      accessToken: 'user-token',
      broadcasterUserId: 123,
      events: ['chat.message.sent']
    }, fetchImpl)

    expect(result.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
