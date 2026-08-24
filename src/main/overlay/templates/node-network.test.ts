import { describe, expect, it } from 'vitest'
import { buildNodeNetworkHtml } from './node-network'

describe('buildNodeNetworkHtml smooth rendering', () => {
  it('uses time-based motion and a spatial grid for connection checks', () => {
    const html = buildNodeNetworkHtml(undefined, false)

    expect(html).toContain('function buildSpatialGrid(cellSize)')
    expect(html).toContain('const frameScale = lastFrameAt ?')
    expect(html).toContain('node.update(frameScale);')
    expect(html).not.toContain('filter: drop-shadow(0px 0px 4px')
  })
})
