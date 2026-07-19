import { describe, expect, it } from 'vitest'
import { composeAlertBackground, DEFAULT_ALERT_RULES } from './alert-rules'

describe('composeAlertBackground', () => {
  it('applies a 0-100 opacity onto a hex color', () => {
    expect(composeAlertBackground('#12161e', 82)).toEqual({
      css: 'rgba(18, 22, 30, 0.82)',
      alpha: 0.82
    })
  })

  it('goes all the way to fully transparent at opacity 0', () => {
    expect(composeAlertBackground('#000000', 0)).toEqual({
      css: 'rgba(0, 0, 0, 0)',
      alpha: 0
    })
  })

  it('keeps the color string alpha when opacity is the -1 sentinel (legacy rules)', () => {
    expect(composeAlertBackground('rgba(18, 22, 30, 0.82)', -1)).toEqual({
      css: 'rgba(18, 22, 30, 0.82)',
      alpha: 0.82
    })
  })

  it('keeps the color string alpha when opacity is absent', () => {
    expect(composeAlertBackground('rgba(0, 0, 0, 0.05)', undefined)).toEqual({
      css: 'rgba(0, 0, 0, 0.05)',
      alpha: 0.05
    })
  })

  it('overrides an rgba() alpha when the slider is explicit', () => {
    expect(composeAlertBackground('rgba(18, 22, 30, 0.82)', 25)).toEqual({
      css: 'rgba(18, 22, 30, 0.25)',
      alpha: 0.25
    })
  })

  it('parses short hex and 8-digit hex', () => {
    expect(composeAlertBackground('#fff', -1)).toEqual({
      css: 'rgba(255, 255, 255, 1)',
      alpha: 1
    })
    expect(composeAlertBackground('#00000080', -1).alpha).toBeCloseTo(0.502, 2)
  })

  it('clamps out-of-range opacity', () => {
    expect(composeAlertBackground('#ffffff', 250)?.alpha).toBe(1)
  })

  it('returns nulls for unparseable colors so callers can fall back safely', () => {
    expect(composeAlertBackground('gradient', 50)).toEqual({ css: null, alpha: null })
    expect(composeAlertBackground('var(--glass-bg)', 50)).toEqual({ css: null, alpha: null })
    expect(composeAlertBackground(undefined, 50)).toEqual({ css: null, alpha: null })
  })
})

describe('DEFAULT_ALERT_RULES style fields', () => {
  it('every default rule carries explicit slider-ready style values', () => {
    for (const rule of DEFAULT_ALERT_RULES) {
      expect(rule.backgroundOpacity).toBeGreaterThanOrEqual(0)
      expect(rule.backgroundColor.startsWith('#')).toBe(true)
      expect(rule.borderWidth).toBe(1)
      expect(rule.borderRadius).toBe(-1)
      expect(rule.imageSize).toBe(0)
      expect(rule.imagePlacement).toBe('auto')
      expect(rule.textAlign).toBe('auto')
      expect(rule.alertTop).toBe(-1)
      expect(rule.alertLeft).toBe(-1)
    }
  })

  it('default rules keep their original rendered background alpha', () => {
    // Gifts/follows were rgba(18,22,30,0.82); subs/raids were rgba(0,0,0,0.05).
    expect(composeAlertBackground(DEFAULT_ALERT_RULES[0].backgroundColor, DEFAULT_ALERT_RULES[0].backgroundOpacity).css).toBe('rgba(18, 22, 30, 0.82)')
    expect(composeAlertBackground(DEFAULT_ALERT_RULES[2].backgroundColor, DEFAULT_ALERT_RULES[2].backgroundOpacity).css).toBe('rgba(0, 0, 0, 0.05)')
  })
})
