import { useEffect, useMemo, useRef, useState } from 'react'
import { IconCrop, IconHistory } from '@tabler/icons-react'
import { IconCheck } from '../../../components/ui/icons'
import { Modal } from '../../../components/ui/Modal'
import { StudioLayer } from '../../../../shared/studio'
import { resolveImageSource } from './CanvasEditor.utils'

type Crop = { top: number; right: number; bottom: number; left: number }

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
type Handle = typeof HANDLES[number]

// Never let a crop collapse the source to nothing.
const MIN_VISIBLE = 24

interface Props {
  open: boolean
  onClose: () => void
  layer: StudioLayer | null
  sceneId: string
  aspectContext: '16:9' | '9:16'
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>
  onUpdate: (sceneId: string, layerId: string, updates: Partial<StudioLayer>) => void
}

const emptyCrop = (): Crop => ({ top: 0, right: 0, bottom: 0, left: 0 })

function normalizeCrop(raw: any): Crop {
  return {
    top: Math.max(0, Number(raw?.top) || 0),
    right: Math.max(0, Number(raw?.right) || 0),
    bottom: Math.max(0, Number(raw?.bottom) || 0),
    left: Math.max(0, Number(raw?.left) || 0)
  }
}

export function CropModal({ open, onClose, layer, sceneId, aspectContext, videoRefs, onUpdate }: Props) {
  const cropField: 'crop' | 'portraitCrop' = aspectContext === '9:16' ? 'portraitCrop' : 'crop'
  const previewRef = useRef<HTMLDivElement>(null)
  const modalVideoRef = useRef<HTMLVideoElement>(null)
  const dragRef = useRef<{ handle: Handle | 'move'; startX: number; startY: number; startCrop: Crop } | null>(null)

  const [nativeSize, setNativeSize] = useState<{ w: number; h: number } | null>(null)
  const [crop, setCrop] = useState<Crop>(emptyCrop)
  const [imgSrc, setImgSrc] = useState<string>('')

  const isVideo = layer?.type === 'camera' || layer?.type === 'display'
  const isImage = layer?.type === 'image'

  useEffect(() => {
    if (!open || !layer) return
    setCrop(normalizeCrop((layer as any)[cropField] ?? layer.crop))

    if (isImage) {
      const src = resolveImageSource(layer.config.assetPath)
      setImgSrc(src)
      const img = new Image()
      img.onload = () => setNativeSize({ w: img.naturalWidth, h: img.naturalHeight })
      img.src = src
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, layer?.id, cropField])

  useEffect(() => {
    if (!open || !layer || !isVideo) return
    let raf = 0
    const source = videoRefs.current[layer.id]
    const modalVideo = modalVideoRef.current
    if (source && modalVideo && source.srcObject) {
      try { modalVideo.srcObject = source.srcObject } catch {}
      void modalVideo.play?.().catch(() => {})
    }
    const poll = () => {
      const v = videoRefs.current[layer.id]
      if (v && v.videoWidth > 0) {
        setNativeSize(prev => (prev && prev.w === v.videoWidth && prev.h === v.videoHeight) ? prev : { w: v.videoWidth, h: v.videoHeight })
      }
      raf = requestAnimationFrame(poll)
    }
    raf = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, layer?.id, isVideo])

  const display = useMemo(() => {
    if (!nativeSize) return null
    const maxW = 820
    const maxH = 460
    const scale = Math.min(maxW / nativeSize.w, maxH / nativeSize.h)
    return { scale, w: nativeSize.w * scale, h: nativeSize.h * scale }
  }, [nativeSize])

  const clampCrop = (next: Crop): Crop => {
    if (!nativeSize) return next
    const left = Math.max(0, Math.min(next.left, nativeSize.w - MIN_VISIBLE))
    const right = Math.max(0, Math.min(next.right, nativeSize.w - MIN_VISIBLE - left))
    const top = Math.max(0, Math.min(next.top, nativeSize.h - MIN_VISIBLE))
    const bottom = Math.max(0, Math.min(next.bottom, nativeSize.h - MIN_VISIBLE - top))
    return { left: Math.round(left), right: Math.round(right), top: Math.round(top), bottom: Math.round(bottom) }
  }

  const beginDrag = (handle: Handle | 'move') => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { handle, startX: e.clientX, startY: e.clientY, startCrop: crop }
    window.addEventListener('pointermove', onDrag)
    window.addEventListener('pointerup', endDrag, { once: true })
  }

  const onDrag = (e: PointerEvent) => {
    const drag = dragRef.current
    if (!drag || !display) return
    const dxNative = (e.clientX - drag.startX) / display.scale
    const dyNative = (e.clientY - drag.startY) / display.scale
    const s = drag.startCrop
    const next = { ...s }
    const h = drag.handle

    if (h === 'move') {
      const dx = Math.max(-s.left, Math.min(s.right, dxNative))
      const dy = Math.max(-s.top, Math.min(s.bottom, dyNative))
      setCrop({
        left: Math.round(s.left + dx),
        right: Math.round(s.right - dx),
        top: Math.round(s.top + dy),
        bottom: Math.round(s.bottom - dy)
      })
      return
    }

    if (h.includes('w')) next.left = s.left + dxNative
    if (h.includes('e')) next.right = s.right - dxNative
    if (h.includes('n')) next.top = s.top + dyNative
    if (h.includes('s')) next.bottom = s.bottom - dyNative
    setCrop(clampCrop(next))
  }

  const endDrag = () => {
    dragRef.current = null
    window.removeEventListener('pointermove', onDrag)
  }

  useEffect(() => () => window.removeEventListener('pointermove', onDrag), [])

  const apply = () => {
    if (!layer) return
    const cleaned = clampCrop(crop)
    const isEmpty = cleaned.top === 0 && cleaned.right === 0 && cleaned.bottom === 0 && cleaned.left === 0
    onUpdate(sceneId, layer.id, { [cropField]: isEmpty ? undefined : cleaned } as Partial<StudioLayer>)
    onClose()
  }

  if (!layer) return null

  const box = display && nativeSize ? {
    left: crop.left * display.scale,
    top: crop.top * display.scale,
    width: (nativeSize.w - crop.left - crop.right) * display.scale,
    height: (nativeSize.h - crop.top - crop.bottom) * display.scale
  } : null

  const outW = nativeSize ? Math.round(nativeSize.w - crop.left - crop.right) : 0
  const outH = nativeSize ? Math.round(nativeSize.h - crop.top - crop.bottom) : 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="max-w-[920px] w-[94vw] !rounded-[10px]"
      headerActions={
        <div className="flex items-center gap-4">
          <div className="p-2.5 rounded-xl bg-accent/10 text-accent">
            <IconCrop size={20} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white tracking-tight leading-none">Crop Source</h2>
            <p className="text-[11px] text-white/40 font-semibold tracking-tight mt-1">
              {layer.name} · {aspectContext === '9:16' ? 'Vertical (9:16)' : 'Landscape (16:9)'}
            </p>
          </div>
        </div>
      }
    >
      <div className="flex flex-col">
        <div className="flex items-center justify-center bg-black/50 p-8" style={{ minHeight: 300 }}>
          {display && box ? (
            <div ref={previewRef} className="relative select-none" style={{ width: display.w, height: display.h, touchAction: 'none' }}>
              {isVideo && (
                <video ref={modalVideoRef} autoPlay muted playsInline className="absolute inset-0 h-full w-full object-fill rounded-md" />
              )}
              {isImage && imgSrc && (
                <img src={imgSrc} alt="" className="absolute inset-0 h-full w-full object-fill rounded-md" draggable={false} />
              )}
              <div
                className="absolute cursor-move"
                onPointerDown={beginDrag('move')}
                style={{ left: box.left, top: box.top, width: box.width, height: box.height, boxShadow: '0 0 0 9999px rgba(0,0,0,0.62)', outline: '2px solid var(--accent, #19c8ff)', outlineOffset: '-1px' }}
              >
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute top-1/3 left-0 right-0 border-t border-white/25" />
                  <div className="absolute top-2/3 left-0 right-0 border-t border-white/25" />
                  <div className="absolute left-1/3 top-0 bottom-0 border-l border-white/25" />
                  <div className="absolute left-2/3 top-0 bottom-0 border-l border-white/25" />
                </div>
                {HANDLES.map(h => (
                  <div key={h} onPointerDown={beginDrag(h)} className="absolute h-3.5 w-3.5 rounded-full border-2 border-black/60 bg-accent" style={handleStyle(h)} />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-white/40">
              <div className="h-8 w-8 rounded-full border-2 border-white/15 border-t-accent animate-spin" />
              <p className="text-[13px] font-semibold">{isVideo ? 'Waiting for source frame…' : 'Loading source…'}</p>
            </div>
          )}
        </div>

        <div className="border-t border-white/[0.06] px-8 py-6">
          <div className="mb-5 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-white/80">Crop edges <span className="text-white/40">(pixels)</span></p>
            <p className="text-[13px] font-semibold text-white/55">Output: <span className="font-mono text-white">{outW} × {outH}</span></p>
          </div>
          <div className="grid grid-cols-4 gap-4">
            {(['top', 'right', 'bottom', 'left'] as const).map(edge => (
              <label key={edge} className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold text-white/50">{edge}</span>
                <input
                  type="number"
                  min={0}
                  value={Math.round(crop[edge])}
                  onChange={e => setCrop(clampCrop({ ...crop, [edge]: Number(e.currentTarget.value) || 0 }))}
                  className="app-input !h-10 !px-3 !text-[13px]"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-white/[0.06] bg-black/40 p-6">
          <button onClick={() => setCrop(emptyCrop())} className="flex items-center justify-center gap-2 h-12 rounded-md bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-all text-sm font-semibold border border-white/5">
            <IconHistory size={17} />
            Reset Crop
          </button>
          <button onClick={apply} className="flex items-center justify-center gap-2 h-12 rounded-md bg-accent text-black hover:brightness-110 transition-all text-sm font-semibold tracking-tight">
            <IconCheck size={18} />
            Save Crop
          </button>
        </div>
      </div>
    </Modal>
  )
}

function handleStyle(h: Handle): React.CSSProperties {
  const edge = -7
  const mid = 'calc(50% - 7px)'
  const map: Record<Handle, React.CSSProperties> = {
    nw: { left: edge, top: edge, cursor: 'nwse-resize' },
    n: { left: mid, top: edge, cursor: 'ns-resize' },
    ne: { right: edge, top: edge, cursor: 'nesw-resize' },
    e: { right: edge, top: mid, cursor: 'ew-resize' },
    se: { right: edge, bottom: edge, cursor: 'nwse-resize' },
    s: { left: mid, bottom: edge, cursor: 'ns-resize' },
    sw: { left: edge, bottom: edge, cursor: 'nesw-resize' },
    w: { left: edge, top: mid, cursor: 'ew-resize' }
  }
  return map[h]
}
