import { describe, expect, it } from 'vitest'
import { formatConnectorErrorMessage } from './base-connector'

describe('formatConnectorErrorMessage', () => {
  it('keeps normal Error messages readable', () => {
    expect(formatConnectorErrorMessage(new Error('connection failed'))).toBe('connection failed')
  })

  it('extracts common message fields from plain connector error objects', () => {
    expect(formatConnectorErrorMessage({ message: 'room unavailable', code: 404 })).toBe('room unavailable')
    expect(formatConnectorErrorMessage({ error: 'rate limited', status: 429 })).toBe('rate limited')
    expect(formatConnectorErrorMessage({ code: 403, detail: 'blocked' })).toBe('403')
  })

  it('serializes plain objects instead of logging [object Object]', () => {
    expect(formatConnectorErrorMessage({ detail: 'cloudflare', retryable: true })).toBe(
      '{"detail":"cloudflare","retryable":true}'
    )
  })
})
