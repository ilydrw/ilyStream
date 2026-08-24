import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PARTICLES_CONFIG,
  resolveParticlesWidgetConfig,
  type ParticlesWidgetConfig,
  type Widget
} from '../../../../../shared/widgets'
import { buildParticlesPreviewWidget } from './ParticlesConfigEditor'

describe('particle editor previews', () => {
  it('creates a distinct render request every time the same layer is tested', () => {
    const draft = makeWidget(resolveParticlesWidgetConfig(DEFAULT_PARTICLES_CONFIG))

    const first = buildParticlesPreviewWidget(draft, draft.config as ParticlesWidgetConfig, 'bubbles', 1)
    const second = buildParticlesPreviewWidget(draft, draft.config as ParticlesWidgetConfig, 'bubbles', 2)

    expect(JSON.stringify(first.config)).not.toBe(JSON.stringify(second.config))
    expect(first.config).toMatchObject({
      __previewRequest: 1,
      bubbles: { enabled: true },
      heartMe: { enabled: false },
      fireworks: { enabled: false }
    })
  })
})

function makeWidget(config: ParticlesWidgetConfig): Widget {
  return {
    id: 'particles-preview-test',
    name: 'Particles preview',
    type: 'particles',
    config: config as unknown as Record<string, unknown>
  }
}
