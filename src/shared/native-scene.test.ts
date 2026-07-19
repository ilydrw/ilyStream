import { describe, expect, it } from 'vitest'
import { computeNativeCompositorTransform, type NativeSceneLayout } from './native-scene'

const baseLayout: NativeSceneLayout = {
  x: 0,
  y: 0,
  width: 500,
  height: 500,
  rotation: 0,
  flipH: false,
  flipV: false,
  fitMode: 'contain'
}

describe('computeNativeCompositorTransform', () => {
  it('letterboxes contain sources without distorting them', () => {
    const transform = computeNativeCompositorTransform(
      baseLayout,
      { width: 1920, height: 1080 },
      1920,
      1080,
      1920,
      1080
    )

    expect(transform.position.x).toBeCloseTo(250)
    expect(transform.position.y).toBeCloseTo(250)
    expect(transform.scale.x).toBeCloseTo(500 / 1920)
    expect(transform.scale.y).toBeCloseTo(500 / 1920)
  })

  it('center-crops cover sources to the target aspect ratio', () => {
    const transform = computeNativeCompositorTransform(
      { ...baseLayout, fitMode: 'cover' },
      { width: 1920, height: 1080 },
      1920,
      1080,
      1920,
      1080
    )

    expect(transform.crop.left).toBeCloseTo(420 / 1920)
    expect(transform.crop.right).toBeCloseTo(1500 / 1920)
    expect(transform.scale.x).toBeCloseTo(500 / 1080)
    expect(transform.scale.y).toBeCloseTo(500 / 1080)
  })

  it('applies source crop, output scaling, rotation, and flips', () => {
    const transform = computeNativeCompositorTransform(
      {
        ...baseLayout,
        x: 100,
        y: 50,
        width: 400,
        height: 200,
        rotation: 15,
        flipH: true,
        fitMode: 'stretch',
        crop: { left: 100, right: 300, top: 50, bottom: 150 }
      },
      { width: 2000, height: 1000 },
      1920,
      1080,
      1280,
      720
    )

    expect(transform.position.x).toBeCloseTo(200)
    expect(transform.position.y).toBeCloseTo(100)
    expect(transform.rotation.z).toBe(15)
    expect(transform.scale.x).toBeCloseTo(-1 / 6)
    expect(transform.scale.y).toBeCloseTo(1 / 6)
    expect(transform.crop.left).toBeCloseTo(0.05)
    expect(transform.crop.right).toBeCloseTo(0.85)
  })
})
