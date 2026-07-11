import type { ShapeState } from './EnhancementModal.types'

export function defaultShape(shape?: any): ShapeState {
  const source = typeof shape === 'object' && shape ? shape : {}
  return {
    ...source,
    type: source.type || shape || 'none',
    x: source.x ?? 50,
    y: source.y ?? 50,
    scale: source.scale ?? 100,
    cutDepth: source.cutDepth,
    scope: source.scope || 'both',
    captureX: source.captureX ?? 50,
    captureY: source.captureY ?? 50,
    border: source.border,
    shadow: source.shadow
  }
}

export function shapeType(shape?: any): string {
  return typeof shape === 'object' && shape ? shape.type : shape || 'none'
}
