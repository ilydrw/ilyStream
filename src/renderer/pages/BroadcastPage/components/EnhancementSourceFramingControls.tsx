import {
  IconArrowsMaximize as IconMaximize,
  IconArrowsMove,
  IconBan,
  IconBlur,
  IconCircle,
  IconContrast,
  IconDiamond,
  IconHeart,
  IconHexagon,
  IconRotateClockwise2,
  IconSparkles,
  IconSquare,
  IconStar
} from '@tabler/icons-react'
import { IconX } from '../../../components/ui/icons'
import { BORDER_TYPES, SCOPE_OPTIONS } from './EnhancementModal.constants'
import type { ClampShape, EnhancementPanelProps, UpdateShape } from './EnhancementModal.types'
import { defaultShape, shapeType } from './EnhancementModal.utils'
import { EnhancementSlider } from './EnhancementSlider'

const SHAPE_OPTIONS = [
  { id: 'none', icon: IconBan, label: 'None' },
  { id: 'circle', icon: IconCircle, label: 'Circle' },
  { id: 'square', icon: IconSquare, label: 'Square' },
  { id: 'star', icon: IconStar, label: 'Star' },
  { id: 'heart', icon: IconHeart, label: 'Heart' },
  { id: 'diamond', icon: IconDiamond, label: 'Diamond' },
  { id: 'hexagon', icon: IconHexagon, label: 'Hexagon' }
]

interface SourceFramingControlsProps extends EnhancementPanelProps {
  aspectContext?: '16:9' | '9:16'
  clampShape: ClampShape
  updateShape: UpdateShape
}

export function SourceFramingControls({
  enhancements,
  setEnhancements,
  aspectContext,
  clampShape,
  updateShape
}: SourceFramingControlsProps) {
  const currentShape = defaultShape(enhancements.shape)
  const currentShapeType = shapeType(enhancements.shape)
  const isHeart = currentShapeType === 'heart'
  const hasCutDepth = currentShapeType === 'heart' || currentShapeType === 'star'

  return (
    <div className="space-y-6">
      <h3 className="text-[14px] font-semibold tracking-tight text-white/85 flex items-center gap-2.5">
        <IconSquare size={17} className="text-accent" />
        Source Framing
      </h3>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <label className="text-[13px] font-semibold text-white/80 tracking-tight">Application Scope</label>
          <div className="flex bg-white/5 p-1 rounded-lg">
            {SCOPE_OPTIONS.map(scope => (
              <button
                key={scope.id}
                onClick={() => {
                  const curr = defaultShape(enhancements.shape)
                  setEnhancements({ ...enhancements, shape: { ...curr, scope: scope.id } })
                }}
                className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all ${currentShape.scope === scope.id ? 'bg-white/20 text-white' : 'text-white/55 hover:text-white'}`}
              >
                {scope.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {SHAPE_OPTIONS.map(shape => {
            const Icon = shape.icon
            return (
              <button
                key={shape.id}
                onClick={() => {
                  const curr = defaultShape(enhancements.shape)
                  const wasUnset = !curr.type || curr.type === 'none' || curr.type === 'rect'
                  const pickingRealShape = shape.id !== 'none'
                  const nextScope = wasUnset && pickingRealShape && aspectContext ? aspectContext : curr.scope
                  const nextShape = shape.id === 'none'
                    ? { ...curr, type: 'none', x: 50, y: 50, scale: 100, captureX: 50, captureY: 50, scope: nextScope }
                    : { ...curr, type: shape.id, scope: nextScope }
                  setEnhancements({ ...enhancements, shape: clampShape(nextShape) })
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${currentShapeType === shape.id ? 'bg-accent/20 border-accent text-accent' : 'bg-white/5 border-white/10 text-white/55 hover:bg-white/10 hover:text-white'}`}
              >
                <Icon size={22} />
                <span className="text-[11px] font-semibold mt-1.5 tracking-tight">{shape.label}</span>
              </button>
            )
          })}
        </div>

        <div className="space-y-6 p-4 bg-white/5 rounded-md border border-white/5">
          <div className="space-y-4">
            <EnhancementSlider
              label="Mask Scale"
              icon={IconMaximize}
              value={currentShape.scale}
              min={10}
              max={isHeart ? 250 : 100}
              def={100}
              onChange={value => updateShape({ scale: value })}
            />
            {hasCutDepth && (
              <EnhancementSlider
                label="Cut Depth"
                icon={IconSparkles}
                value={currentShape.cutDepth ?? (currentShapeType === 'heart' ? 12 : 35)}
                min={0}
                max={100}
                def={currentShapeType === 'heart' ? 12 : 35}
                onChange={value => updateShape({ cutDepth: value })}
              />
            )}
          </div>

          <div className="space-y-4 pt-2 border-t border-white/5">
            <label className="text-[13px] font-semibold text-white/80 tracking-tight block">Capture Point (Pan/Zoom)</label>
            <div className="grid grid-cols-2 gap-4">
              <EnhancementSlider
                label="Capture X"
                icon={IconArrowsMove}
                value={currentShape.captureX ?? 50}
                min={0}
                max={100}
                def={50}
                onChange={value => {
                  const curr = defaultShape(enhancements.shape)
                  setEnhancements({ ...enhancements, shape: { ...curr, captureX: value } })
                }}
              />
              <EnhancementSlider
                label="Capture Y"
                icon={IconArrowsMove}
                value={currentShape.captureY ?? 50}
                min={0}
                max={100}
                def={50}
                onChange={value => {
                  const curr = defaultShape(enhancements.shape)
                  setEnhancements({ ...enhancements, shape: { ...curr, captureY: value } })
                }}
              />
            </div>
          </div>

          <div className="space-y-4 pt-2 border-t border-white/5">
            <label className="text-[13px] font-semibold text-white/80 tracking-tight block">Mask Position</label>
            <div className="grid grid-cols-2 gap-4">
              <EnhancementSlider
                label="Mask X"
                icon={IconX}
                value={currentShape.x}
                min={0}
                max={100}
                def={50}
                onChange={value => updateShape({ x: value })}
              />
              <EnhancementSlider
                label="Mask Y"
                icon={IconX}
                value={currentShape.y}
                min={0}
                max={100}
                def={50}
                onChange={value => updateShape({ y: value })}
              />
            </div>
          </div>

          <MaskBorderControls enhancements={enhancements} setEnhancements={setEnhancements} />
          <DropShadowControls enhancements={enhancements} setEnhancements={setEnhancements} />

          <EnhancementSlider
            label="Corner Rounding"
            icon={IconRotateClockwise2}
            value={enhancements.cornerRadius || 0}
            min={0}
            max={100}
            def={0}
            onChange={value => setEnhancements({ ...enhancements, cornerRadius: value })}
          />
        </div>
      </div>
    </div>
  )
}

function MaskBorderControls({ enhancements, setEnhancements }: EnhancementPanelProps) {
  const currentShape = defaultShape(enhancements.shape)
  const border = currentShape.border

  return (
    <div className="space-y-4 pt-4 border-t border-white/5">
      <div className="flex items-center justify-between">
        <label className="text-[13px] font-semibold text-white/80 tracking-tight block">Mask Border</label>
        <button
          onClick={() => {
            const curr = defaultShape(enhancements.shape)
            setEnhancements({
              ...enhancements,
              shape: {
                ...curr,
                border: {
                  enabled: !curr.border?.enabled,
                  type: curr.border?.type || 'cyber',
                  thickness: curr.border?.thickness || 6,
                  opacity: curr.border?.opacity ?? 100,
                  color: curr.border?.color || '#ffffff',
                  color1: curr.border?.color1 || '#19c8ff',
                  color2: curr.border?.color2 || '#d035f1',
                  speed: curr.border?.speed ?? 6
                }
              }
            })
          }}
          className={`text-[12px] font-semibold px-3.5 py-1.5 rounded-md transition-all ${border?.enabled ? 'bg-accent/20 text-accent' : 'bg-white/[0.07] text-white/75 border border-white/15'}`}
        >
          {border?.enabled ? 'Active' : 'Enable'}
        </button>
      </div>

      {border?.enabled && (
        <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-2 gap-1 bg-white/5 p-1 rounded-xl">
            {BORDER_TYPES.map(type => (
              <button
                key={type.id}
                onClick={() => {
                  const curr = defaultShape(enhancements.shape)
                  setEnhancements({ ...enhancements, shape: { ...curr, border: { ...curr.border, type: type.id } } })
                }}
                className={`py-2.5 rounded-lg text-[12px] font-semibold transition-all ${border?.type === type.id ? 'bg-white/20 text-white' : 'text-white/55 hover:text-white'}`}
              >
                {type.label}
              </button>
            ))}
          </div>

          <EnhancementSlider
            label="Thickness"
            icon={IconMaximize}
            value={border?.thickness || 6}
            min={1}
            max={28}
            def={6}
            onChange={value => {
              const curr = defaultShape(enhancements.shape)
              setEnhancements({ ...enhancements, shape: { ...curr, border: { ...curr.border, thickness: value } } })
            }}
          />

          <EnhancementSlider
            label="Opacity"
            icon={IconContrast}
            value={border?.opacity ?? 100}
            min={0}
            max={100}
            def={100}
            onChange={value => {
              const curr = defaultShape(enhancements.shape)
              setEnhancements({ ...enhancements, shape: { ...curr, border: { ...curr.border, opacity: value } } })
            }}
          />

          {border?.type !== 'solid' && (
            <EnhancementSlider
              label="Flow Speed"
              icon={IconSparkles}
              value={border?.speed ?? 6}
              min={1}
              max={20}
              def={6}
              onChange={value => {
                const curr = defaultShape(enhancements.shape)
                setEnhancements({ ...enhancements, shape: { ...curr, border: { ...curr.border, speed: value } } })
              }}
            />
          )}

          {border?.type === 'solid' && (
            <div className="flex items-center gap-3 bg-white/5 p-2 rounded-xl border border-white/5">
              <input
                type="color"
                value={border?.color || '#ffffff'}
                onChange={event => {
                  const curr = defaultShape(enhancements.shape)
                  setEnhancements({ ...enhancements, shape: { ...curr, border: { ...curr.border, color: event.target.value } } })
                }}
                className="w-6 h-6 rounded-md border-0 bg-transparent cursor-pointer"
              />
              <input
                type="text"
                value={border?.color || '#ffffff'}
                onChange={event => {
                  const curr = defaultShape(enhancements.shape)
                  setEnhancements({ ...enhancements, shape: { ...curr, border: { ...curr.border, color: event.target.value } } })
                }}
                className="flex-1 bg-transparent border-0 text-[13px] font-mono text-white/80 focus:text-white outline-none"
              />
            </div>
          )}

          {border?.type === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'color1', label: 'Color A', fallback: '#19c8ff' },
                { key: 'color2', label: 'Color B', fallback: '#d035f1' }
              ].map(item => (
                <div key={item.key} className="flex items-center gap-2 bg-white/5 p-2 rounded-xl border border-white/5">
                  <input
                    type="color"
                    value={(border as any)?.[item.key] || item.fallback}
                    onChange={event => {
                      const curr = defaultShape(enhancements.shape)
                      setEnhancements({ ...enhancements, shape: { ...curr, border: { ...curr.border, [item.key]: event.target.value } } })
                    }}
                    className="w-6 h-6 rounded-md border-0 bg-transparent cursor-pointer"
                    aria-label={item.label}
                  />
                  <span className="text-[9px] font-semibold text-white/40">{item.label}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <label className="text-[10px] font-semibold text-white/80">Audio Reactive</label>
            <button
              onClick={() => {
                const curr = defaultShape(enhancements.shape)
                setEnhancements({ ...enhancements, shape: { ...curr, border: { ...curr.border, audioReactive: !curr.border?.audioReactive, reactivity: curr.border?.reactivity ?? 100 } } })
              }}
              className={`text-[12px] font-semibold px-3.5 py-1.5 rounded-md transition-all ${border?.audioReactive ? 'bg-accent/20 text-accent' : 'bg-white/[0.07] text-white/75 border border-white/15'}`}
            >
              {border?.audioReactive ? 'Active' : 'Off'}
            </button>
          </div>

          {border?.audioReactive && (
            <div className="pt-2 animate-in slide-in-from-top-1 duration-200">
              <EnhancementSlider
                label="Reactivity"
                icon={IconSparkles}
                value={border?.reactivity ?? 100}
                min={0}
                max={200}
                def={100}
                onChange={value => {
                  const curr = defaultShape(enhancements.shape)
                  setEnhancements({ ...enhancements, shape: { ...curr, border: { ...curr.border, reactivity: value } } })
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DropShadowControls({ enhancements, setEnhancements }: EnhancementPanelProps) {
  const currentShape = defaultShape(enhancements.shape)
  const shadow = currentShape.shadow

  return (
    <div className="space-y-4 pt-4 border-t border-white/5">
      <div className="flex items-center justify-between">
        <label className="text-[13px] font-semibold text-white/80 tracking-tight block">Drop Shadow</label>
        <button
          onClick={() => {
            const curr = defaultShape(enhancements.shape)
            setEnhancements({
              ...enhancements,
              shape: {
                ...curr,
                shadow: {
                  enabled: !curr.shadow?.enabled,
                  color: curr.shadow?.color || '#000000',
                  blur: curr.shadow?.blur ?? 15,
                  offsetX: curr.shadow?.offsetX ?? 0,
                  offsetY: curr.shadow?.offsetY ?? 10
                }
              }
            })
          }}
          className={`text-[12px] font-semibold px-3.5 py-1.5 rounded-md transition-all ${shadow?.enabled ? 'bg-accent/20 text-accent' : 'bg-white/[0.07] text-white/75 border border-white/15'}`}
        >
          {shadow?.enabled ? 'Active' : 'Enable'}
        </button>
      </div>

      {shadow?.enabled && (
        <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3 bg-white/5 p-2 rounded-xl border border-white/5">
            <input
              type="color"
              value={shadow?.color || '#000000'}
              onChange={event => {
                const curr = defaultShape(enhancements.shape)
                setEnhancements({ ...enhancements, shape: { ...curr, shadow: { ...curr.shadow, color: event.target.value } } })
              }}
              className="w-6 h-6 rounded-md border-0 bg-transparent cursor-pointer"
            />
            <input
              type="text"
              value={shadow?.color || '#000000'}
              onChange={event => {
                const curr = defaultShape(enhancements.shape)
                setEnhancements({ ...enhancements, shape: { ...curr, shadow: { ...curr.shadow, color: event.target.value } } })
              }}
              className="flex-1 bg-transparent border-0 text-[13px] font-mono text-white/80 focus:text-white outline-none"
            />
          </div>

          <EnhancementSlider
            label="Blur Amount"
            icon={IconBlur}
            value={shadow?.blur ?? 15}
            min={0}
            max={100}
            def={15}
            onChange={value => {
              const curr = defaultShape(enhancements.shape)
              setEnhancements({ ...enhancements, shape: { ...curr, shadow: { ...curr.shadow, blur: value } } })
            }}
          />

          <div className="grid grid-cols-2 gap-4">
            <EnhancementSlider
              label="Offset X"
              icon={IconArrowsMove}
              value={shadow?.offsetX ?? 0}
              min={-100}
              max={100}
              def={0}
              onChange={value => {
                const curr = defaultShape(enhancements.shape)
                setEnhancements({ ...enhancements, shape: { ...curr, shadow: { ...curr.shadow, offsetX: value } } })
              }}
            />
            <EnhancementSlider
              label="Offset Y"
              icon={IconArrowsMove}
              value={shadow?.offsetY ?? 10}
              min={-100}
              max={100}
              def={10}
              onChange={value => {
                const curr = defaultShape(enhancements.shape)
                setEnhancements({ ...enhancements, shape: { ...curr, shadow: { ...curr.shadow, offsetY: value } } })
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
