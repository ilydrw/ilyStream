import { useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { IconLayoutGrid, IconX, IconChevronRight } from '@tabler/icons-react'
import { useStudioStore } from '../../../stores/studio-store'
import { StudioScene } from '../../../../shared/studio'

interface Props {
  open: boolean
  onClose: () => void
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>
}

function ScenePreview({ scene, videoRefs, onClick, active, preview }: {
  scene: StudioScene;
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>;
  onClick: () => void;
  active?: boolean;
  preview?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let frameId: number
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    const render = () => {
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Draw simplified scene (just sources, no filters for perf)
      const sorted = [...scene.layers].sort((a, b) => a.zIndex - b.zIndex)
      for (const l of sorted) {
        if (!l.visible) continue
        const video = videoRefs.current[l.id]
        if (video && video.readyState >= 2) {
          // Aspect Ratio Fit
          const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight)
          const w = video.videoWidth * scale
          const h = video.videoHeight * scale
          const x = (canvas.width - w) / 2
          const y = (canvas.height - h) / 2
          ctx.drawImage(video, x, y, w, h)
        }
      }

      frameId = requestAnimationFrame(render)
    }

    render()
    return () => cancelAnimationFrame(frameId)
  }, [scene, videoRefs])

  return (
    <motion.div
      layout
      onClick={onClick}
      className={`
        relative aspect-video rounded-xl overflow-hidden cursor-pointer group border-2 transition-all
        ${active ? 'border-red-500 shadow-lg shadow-red-500/20' : preview ? 'border-accent shadow-lg shadow-accent/20' : 'border-white/5 hover:border-white/20'}
      `}
    >
      <canvas ref={canvasRef} width={320} height={180} className="w-full h-full" />

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-100 transition-opacity" />

      <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-white truncate mr-2">{scene.name}</span>
        <div className="flex gap-1">
          {active && <span className="px-1.5 py-0.5 rounded bg-red-500 text-[8px] font-black uppercase text-white animate-pulse">Live</span>}
          {preview && <span className="px-1.5 py-0.5 rounded bg-accent text-[8px] font-black uppercase text-black">Preview</span>}
        </div>
      </div>

      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all scale-95 group-hover:scale-100 pointer-events-none">
        <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white">
          <IconChevronRight size={20} />
        </div>
      </div>
    </motion.div>
  )
}

export function MultiViewModal({ open, onClose, videoRefs }: Props) {
  const store = useStudioStore()

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-12">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/90 backdrop-blur-2xl"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-7xl h-full flex flex-col min-h-0"
      >
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-accent/20 text-accent flex items-center justify-center">
              <IconLayoutGrid size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-white uppercase tracking-[0.2em]">Multi-View</h2>
              <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest mt-1">Live Scene Monitoring</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-12 h-12 rounded-2xl bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center border border-white/5"
          >
            <IconX size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar pr-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 pb-12">
            {store.scenes.map(scene => (
              <ScenePreview
                key={scene.id}
                scene={scene}
                videoRefs={videoRefs}
                active={scene.id === store.activeSceneId}
                preview={scene.id === store.previewSceneId}
                onClick={() => {
                  if (store.studioMode) {
                    store.setPreviewScene(scene.id)
                  } else {
                    store.setActiveScene(scene.id)
                  }
                  onClose()
                }}
              />
            ))}
          </div>
        </div>

        <div className="mt-8 p-6 bg-white/5 border border-white/5 rounded-[32px] flex items-center justify-between gap-12">
          <div className="flex items-center gap-12">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Active Program</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-accent" />
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Studio Preview</span>
            </div>
            <div className="flex items-center gap-3">
              <kbd className="px-2 py-1 rounded bg-white/10 text-[9px] font-mono text-white/60">ESC</kbd>
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">to Close</span>
            </div>
          </div>

          {store.studioMode && (
            <button
              onClick={() => {
                store.transition('fade')
                onClose()
              }}
              className="h-14 px-10 rounded-2xl bg-accent text-white hover:brightness-110 active:scale-95 transition-all flex items-center gap-3 shadow-xl shadow-accent/20 group"
            >
              <span className="text-sm font-black uppercase tracking-[0.2em]">Transition</span>
              <IconChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>
          )}
        </div>

      </motion.div>
    </div>
  )
}
