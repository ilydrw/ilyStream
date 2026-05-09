import { describe, expect, it } from 'vitest'
import { TTSFilter } from './filters'

describe('TTSFilter – blocked patterns', () => {
  it('ignores invalid blocked regex patterns', () => {
    const filter = new TTSFilter()
    expect(() => filter.addBlockedPattern('[')).not.toThrow()
    expect(filter.apply('hello chat', 'viewer')).toBe('hello chat')
  })

  it('silently ignores patterns longer than 500 characters', () => {
    const filter = new TTSFilter()
    filter.addBlockedPattern('x'.repeat(501))
    expect(filter.apply('hello chat', 'viewer')).toBe('hello chat')
  })

  it('accepts and applies patterns at exactly 500 characters', () => {
    const filter = new TTSFilter()
    // A 500-char pattern won't match normal chat, so this just verifies it doesn't throw
    filter.addBlockedPattern('a'.repeat(500))
    expect(filter.apply('hello chat', 'viewer')).toBe('hello chat')
  })
})

describe('TTSFilter – emoji stripping', () => {
  it('removes emoji before other processing', () => {
    const filter = new TTSFilter()
    expect(filter.apply('hey 🔥 chat', 'user')).toBe('hey chat')
  })

  it('rejects a message that is all emoji (becomes too short after strip)', () => {
    const filter = new TTSFilter()
    expect(filter.apply('🔥🔥🔥', 'user')).toBeNull()
  })

  it('strips multiple different emoji from one message', () => {
    const filter = new TTSFilter()
    expect(filter.apply('hello 🎉 world 👋 chat', 'user')).toBe('hello world chat')
  })
})

describe('TTSFilter – minimum length', () => {
  it('rejects single-character messages', () => {
    const filter = new TTSFilter()
    expect(filter.apply('W', 'user')).toBeNull()
  })

  it('rejects two-character messages', () => {
    const filter = new TTSFilter()
    expect(filter.apply('ok', 'user')).toBeNull()
  })

  it('passes messages of exactly 3 characters', () => {
    const filter = new TTSFilter()
    expect(filter.apply('hey', 'user')).toBe('hey')
  })

  it('setMinLength changes the rejection threshold', () => {
    const filter = new TTSFilter()
    filter.setMinLength(1)
    expect(filter.apply('W', 'user')).toBe('W')
  })

  it('setMinLength(0) allows any non-empty message', () => {
    const filter = new TTSFilter()
    filter.setMinLength(0)
    expect(filter.apply('W', 'user')).toBe('W')
  })
})

describe('TTSFilter – repeat normalisation', () => {
  it('collapses runs of 4+ identical characters to 3', () => {
    const filter = new TTSFilter()
    expect(filter.apply('LOOOOOOL', 'user')).toBe('LOOOL')
  })

  it('collapses long runs in lower-case', () => {
    const filter = new TTSFilter()
    expect(filter.apply('noooooo', 'user')).toBe('nooo')
  })

  it('preserves runs of exactly 3 identical characters', () => {
    const filter = new TTSFilter()
    // "loool" has 3 o's — should be unchanged
    expect(filter.apply('loool chat', 'user')).toBe('loool chat')
  })
})
