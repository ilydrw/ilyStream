import { useState } from 'react'
import {
  IconTrash,
  IconLock,
  IconLockOpen,
  IconEye,
  IconEyeOff,
  IconChevronUp,
  IconChevronDown,
  IconVideo,
  IconStack2,
  IconWorld,
  IconTypography,
  IconPhoto as ImageIcon,
  IconMicrophone,
  IconDeviceDesktop,
  IconRefresh,
  IconMaximize,
  IconRotateClockwise2,
  IconSettings,
  IconVariable,
  IconSparkles,
  IconEdit
} from '@tabler/icons-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { StudioLayer } from '../../../../shared/studio'
import { resolveLayerLayout } from '../../../../shared/studio'
import { useStudioStore } from '../../../stores/studio-store'

interface Props {
  layer: StudioLayer
  sceneId: string
  widgets: Array<{ id: string; name: string; type: string }>
  devices: MediaDeviceInfo[]
  broadcastLayoutMode?: string
  activeOrientation?: '16:9' | '9:16'
}

const TYPE_ICONS: Record<string, typeof IconVideo> = {
  camera: IconVideo,
  display: IconDeviceDesktop,
  audio: IconMicrophone,
  widget: IconStack2,
  browser: IconWorld,
  text: IconTypography,
  image: ImageIcon
}

const CAMERA_PRESETS: Record<string, { width: number; height: number; fps: number; label: string }> = {
  '1080p60': { width: 1920, height: 1080, fps: 60, label: '1080p 60 FPS' },
  '1080p30': { width: 1920, height: 1080, fps: 30, label: '1080p 30 FPS' },
  '720p60': { width: 1280, height: 720, fps: 60, label: '720p 60 FPS' },
  '720p30': { width: 1280, height: 720, fps: 30, label: '720p 30 FPS' }
}

function Section({ title, icon: Icon, children, defaultOpen = true }: { title: string; icon: any; children: React.ReactNode; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-white/[0.04]">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className={`p-1.5 rounded-lg transition-colors ${isOpen ? 'text-accent' : 'text-white/20 group-hover:text-white/40'}`}>
            <Icon size={14} />
          </div>
          <span className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${isOpen ? 'text-white' : 'text-white/40'}`}>
            {title}
          </span>
        </div>
        <IconChevronDown size={14} className={`text-white/10 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-6 space-y-5">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function NumericField({ label, value, onChange, min, max, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20 block ml-1">{label}</label>
      <input
        type="number"
        value={Math.round(value)}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        min={min}
        max={max}
        step={step}
        className="w-full bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:border-accent/40 focus:bg-white/5 focus:outline-none transition-all"
      />
    </div>
  )
}

export function LayerProperties({ layer, sceneId, widgets, devices, broadcastLayoutMode, activeOrientation = '16:9' }: Props) {
  const store = useStudioStore()
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(layer.name)

  const isPortrait = activeOrientation === '9:16'
  const layout = resolveLayerLayout(layer, activeOrientation)
  const sourceFitMode = layer.config.fitMode === 'cover' || layer.config.fitMode === 'stretch' ? layer.config.fitMode : 'contain'
  const scaleModeOptions = [
    { value: 'contain', label: 'Contain' },
    { value: 'cover', label: 'Cover' },
    { value: 'stretch', label: 'Stretch' }
  ] as const

  const update = (updates: Partial<StudioLayer>) => store.updateLayer(sceneId, layer.id, updates)

  const handleTransformUpdate = (u: any) => {
    const final: any = {}
    if (isPortrait) {
      if (u.x !== undefined) final.portraitX = u.x
      if (u.y !== undefined) final.portraitY = u.y
      if (u.width !== undefined) final.portraitWidth = u.width
      if (u.height !== undefined) final.portraitHeight = u.height
      if (u.rotation !== undefined) final.portraitRotation = u.rotation
    } else {
      if (u.x !== undefined) final.x = u.x
      if (u.y !== undefined) final.y = u.y
      if (u.width !== undefined) final.width = u.width
      if (u.height !== undefined) final.height = u.height
      if (u.rotation !== undefined) final.rotation = u.rotation
    }
    update(final)
  }

  const fitToCanvas = () => {
    if (isPortrait) {
      update({ portraitX: 0, portraitY: 0, portraitWidth: 1080, portraitHeight: 1920, portraitCrop: { top: 0, right: 0, bottom: 0, left: 0 } })
    } else {
      update({ x: 0, y: 0, width: 1920, height: 1080, crop: { top: 0, right: 0, bottom: 0, left: 0 } })
    }
  }

  const updateConfig = (configUpdates: Record<string, any>) => {
    const newConfig = { ...layer.config, ...configUpdates }
    update({ config: newConfig })

    if (layer.type === 'camera' || layer.type === 'display' || layer.type === 'audio') {
      if (configUpdates.deviceId && layer.type !== 'camera') {
        store.updateAudioSource(layer.id, { deviceId: configUpdates.deviceId })
      }

      if (layer.type === 'camera' && 'audioDeviceId' in configUpdates) {
        if (configUpdates.audioDeviceId === 'none' || configUpdates.audioMixerHidden) {
          store.removeAudioSource(layer.id)
        } else {
          store.updateAudioSource(layer.id, {
            id: layer.id,
            name: layer.name,
            volume: 0.8,
            muted: false,
            monitoring: false,
            type: 'layer',
            channelMode: 'stereo',
            deviceId: configUpdates.audioDeviceId
          })
        }
      }
    }
  }

  const Icon = TYPE_ICONS[layer.type] || IconStack2

  return (
    <div className="flex flex-col h-full bg-[#080808]">
      {/* Header Info */}
      <div className="px-6 py-6 border-b border-white/[0.04] bg-white/[0.01]">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 rounded-2xl bg-brand-gradient text-white shadow-glow shadow-accent/20">
            <Icon size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setEditingName(true)}>
              {editingName ? (
                <input
                  value={nameValue}
                  onChange={e => setNameValue(e.target.value)}
                  onBlur={() => { update({ name: nameValue }); setEditingName(false) }}
                  onKeyDown={e => { if (e.key === 'Enter') { update({ name: nameValue }); setEditingName(false) } }}
                  className="bg-transparent text-sm font-black text-white outline-none border-b border-accent/50 w-full"
                  autoFocus
                />
              ) : (
                <>
                  <span className="text-sm font-black text-white truncate">{layer.name}</span>
                  <IconEdit size={12} className="text-white/20 group-hover:text-accent transition-colors" />
                </>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-accent/80">{layer.type}</span>
              <div className="w-1 h-1 rounded-full bg-white/10" />
              <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">{activeOrientation} Context</span>
            </div>
          </div>
        </div>

        {/* Global Layer Actions */}
        <div className="grid grid-cols-5 gap-2">
          <button onClick={() => update(isPortrait ? { portraitVisible: !(layer.portraitVisible ?? layer.visible) } : { visible: !layer.visible })} className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition-all ${ (isPortrait ? (layer.portraitVisible ?? layer.visible) : layer.visible) ? 'bg-white/5 border-white/10 text-white' : 'bg-transparent border-white/5 text-white/20'}`} title="Visibility">
            {(isPortrait ? (layer.portraitVisible ?? layer.visible) : layer.visible) ? <IconEye size={16} /> : <IconEyeOff size={16} />}
          </button>
          <button onClick={() => update(isPortrait ? { portraitLocked: !(layer.portraitLocked ?? layer.locked) } : { locked: !layer.locked })} className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition-all ${ (isPortrait ? (layer.portraitLocked ?? layer.locked) : layer.locked) ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-transparent border-white/5 text-white/20'}`} title="Lock">
            {(isPortrait ? (layer.portraitLocked ?? layer.locked) : layer.locked) ? <IconLock size={16} /> : <IconLockOpen size={16} />}
          </button>
          <button onClick={() => store.reorderLayer(sceneId, layer.id, Math.min(layer.zIndex + 1, 99))} className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-white/5 text-white/20 hover:text-white hover:bg-white/5 transition-all" title="Move Up">
            <IconChevronUp size={16} />
          </button>
          <button onClick={() => store.reorderLayer(sceneId, layer.id, Math.max(0, layer.zIndex - 1))} className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-white/5 text-white/20 hover:text-white hover:bg-white/5 transition-all" title="Move Down">
            <IconChevronDown size={16} />
          </button>
          <button onClick={() => store.removeLayer(sceneId, layer.id)} className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-white/5 text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all" title="Delete">
            <IconTrash size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Transform Section */}
        <Section title="Geometry & Placement" icon={IconVariable}>
          <div className="grid grid-cols-2 gap-3">
            <NumericField label="X Pos" value={layout.x} onChange={v => handleTransformUpdate({ x: v })} />
            <NumericField label="Y Pos" value={layout.y} onChange={v => handleTransformUpdate({ y: v })} />
            <NumericField label="Width" value={layout.width} onChange={v => handleTransformUpdate({ width: v })} min={10} />
            <NumericField label="Height" value={layout.height} onChange={v => handleTransformUpdate({ height: v })} min={10} />
          </div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
            <NumericField label="Rotation" value={layout.rotation || 0} onChange={v => handleTransformUpdate({ rotation: v })} min={-360} max={360} />
            <button
              onClick={() => handleTransformUpdate({ rotation: 0 })}
              className="h-[46px] px-4 rounded-xl border border-white/5 bg-white/[0.03] text-white/30 hover:text-white hover:bg-white/10 transition-all"
              title="Reset Rotation"
            >
              <IconRotateClockwise2 size={16} />
            </button>
            <button
              onClick={fitToCanvas}
              className="h-[46px] px-6 rounded-xl bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest"
            >
              Fit Canvas
            </button>
          </div>

          <div className="pt-4 border-t border-white/[0.04]">
            <div className="flex items-center justify-between mb-4">
              <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20">Master Opacity</label>
              <span className="text-[10px] font-mono font-bold text-accent">{Math.round(layer.opacity * 100)}%</span>
            </div>
            <input
              type="range" min={0} max={1} step={0.01}
              value={layer.opacity}
              onChange={e => update({ opacity: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer accent-accent"
            />
          </div>
        </Section>

        {/* Source Config Section */}
        <Section title="Source Parameters" icon={IconSettings}>
          {(layer.type === 'camera' || layer.type === 'display' || layer.type === 'browser' || layer.type === 'image') && (
            <div className="space-y-3">
              <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20 block ml-1">Scale Mode</label>
              <div className="grid grid-cols-3 gap-2">
                {scaleModeOptions.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateConfig({ fitMode: option.value })}
                    className={`h-9 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${
                      sourceFitMode === option.value
                        ? 'bg-accent text-black border-accent shadow-glow shadow-accent/20'
                        : 'bg-white/[0.03] text-white/30 border-white/5 hover:text-white hover:bg-white/[0.06]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(layer.type === 'camera' || layer.type === 'audio') && (
            <div className="space-y-4">
              <div>
                <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20 block mb-2 ml-1">
                  {layer.type === 'camera' ? 'Video Input Device' : 'Audio Input Device'}
                </label>
                <select
                  value={layer.config.deviceId || ''}
                  onChange={e => updateConfig({ deviceId: e.target.value })}
                  className="w-full bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-xs text-white focus:border-accent/40 focus:outline-none [&>option]:bg-[#121214]"
                >
                  {layer.type === 'camera' ? (
                    <>
                      {devices.filter(d => d.kind === 'videoinput').length === 0 && <option value="">No cameras found</option>}
                      {devices.filter(d => d.kind === 'videoinput').map(d => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 8)}`}</option>
                      ))}
                    </>
                  ) : (
                    <>
                      {devices.filter(d => d.kind === 'audioinput').length === 0 && <option value="">No microphones found</option>}
                      {devices.filter(d => d.kind === 'audioinput').map(d => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0, 8)}`}</option>
                      ))}
                    </>
                  )}
                </select>
              </div>

              {layer.type === 'camera' && (
                <div className="space-y-4 pt-4 border-t border-white/[0.04]">
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20 block mb-2 ml-1">Associated Audio</label>
                    <select
                      value={layer.config.audioDeviceId || 'match'}
                      onChange={e => updateConfig({ audioDeviceId: e.target.value, audioMixerHidden: e.target.value === 'none' })}
                      className="w-full bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-xs text-white focus:border-accent/40 focus:outline-none [&>option]:bg-[#121214]"
                    >
                      <option value="match">Auto-match by name</option>
                      <option value="default">Default System Input</option>
                      <option value="none">Disabled / Muted</option>
                      {devices.filter(d => d.kind === 'audioinput').map(d => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20 block mb-2 ml-1">Quality Preset</label>
                    <select
                      value={layer.config.capturePreset || '1080p60'}
                      onChange={e => {
                        const preset = CAMERA_PRESETS[e.target.value] || CAMERA_PRESETS['1080p60']
                        updateConfig({
                          capturePreset: e.target.value,
                          captureWidth: preset.width,
                          captureHeight: preset.height,
                          captureFps: preset.fps
                        })
                      }}
                      className="w-full bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-xs text-white focus:border-accent/40 focus:outline-none [&>option]:bg-[#121214]"
                    >
                      {layer.config.capturePreset === 'custom' && <option value="custom">Custom Configuration</option>}
                      {Object.entries(CAMERA_PRESETS).map(([value, preset]) => (
                        <option key={value} value={value}>{preset.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <NumericField label="W" value={layer.config.captureWidth || 1920} onChange={v => updateConfig({ capturePreset: 'custom', captureWidth: Math.max(320, Math.round(v)) })} />
                    <NumericField label="H" value={layer.config.captureHeight || 1080} onChange={v => updateConfig({ capturePreset: 'custom', captureHeight: Math.max(180, Math.round(v)) })} />
                    <NumericField label="FPS" value={layer.config.captureFps || 60} onChange={v => updateConfig({ capturePreset: 'custom', captureFps: Math.max(15, Math.min(60, Math.round(v))) })} />
                  </div>
                  <button
                    onClick={() => updateConfig({ stabilize: layer.config.stabilize === false })}
                    className={`w-full h-11 rounded-xl border transition-all text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 ${layer.config.stabilize === false ? 'bg-white/5 border-white/5 text-white/30' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${layer.config.stabilize === false ? 'bg-white/10' : 'bg-emerald-400 animate-pulse shadow-glow shadow-emerald-500/50'}`} />
                    {layer.config.stabilize === false ? 'Raw Buffer (Lower Latency)' : 'Stable Frame Pacing'}
                  </button>
                </div>
              )}
            </div>
          )}

          {layer.type === 'widget' && (
            <div className="space-y-4">
              <div>
                <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20 block mb-2 ml-1">Active Widget</label>
                <select
                  value={layer.config.widgetId || ''}
                  onChange={e => updateConfig({ widgetId: e.target.value })}
                  className="w-full bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-xs text-white focus:border-accent/40 focus:outline-none [&>option]:bg-[#121214]"
                >
                  {widgets.length === 0 && <option value="">No widgets available</option>}
                  {widgets.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                <NumericField label="Refresh Rate (FPS)" value={layer.config.fps || 8} onChange={v => updateConfig({ fps: Math.max(1, Math.min(60, Math.round(v))) })} min={1} max={60} />
                <button
                  onClick={() => window.api?.studio?.reloadBrowserSource?.(layer.id)}
                  className="h-[46px] px-4 rounded-xl border border-white/5 bg-white/[0.03] text-white/30 hover:text-white hover:bg-white/10 transition-all"
                >
                  <IconRefresh size={18} />
                </button>
              </div>
            </div>
          )}

          {layer.type === 'browser' && (
            <div className="space-y-4">
              <div>
                <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20 block mb-2 ml-1">URL Endpoint</label>
                <input
                  value={layer.config.url || ''}
                  onChange={e => updateConfig({ url: e.target.value })}
                  placeholder="https://..."
                  className="w-full bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-xs text-white focus:border-accent/40 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                <NumericField label="FPS" value={layer.config.fps || 8} onChange={v => updateConfig({ fps: Math.max(1, Math.min(60, Math.round(v))) })} />
                <button
                  onClick={() => window.api?.studio?.reloadBrowserSource?.(layer.id)}
                  className="h-[46px] px-4 rounded-xl border border-white/5 bg-white/[0.03] text-white/30 hover:text-white hover:bg-white/10 transition-all"
                >
                  <IconRefresh size={18} />
                </button>
              </div>
            </div>
          )}

          {layer.type === 'text' && (
            <div className="space-y-4">
              <div>
                <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20 block mb-2 ml-1">Content</label>
                <textarea
                  value={layer.config.text || ''}
                  onChange={e => updateConfig({ text: e.target.value })}
                  rows={3}
                  className="w-full bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-xs text-white focus:border-accent/40 focus:outline-none resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20 block mb-2 ml-1">Text Color</label>
                  <div className="relative group">
                    <input
                      type="color"
                      value={layer.config.color || '#ffffff'}
                      onChange={e => updateConfig({ color: e.target.value })}
                      className="w-full h-11 rounded-xl border border-white/10 cursor-pointer bg-transparent"
                    />
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <IconEdit size={14} className="text-white" />
                    </div>
                  </div>
                </div>
                <NumericField label="Font Size" value={layer.config.fontSize || 48} onChange={v => updateConfig({ fontSize: v })} min={8} max={400} />
              </div>
            </div>
          )}

          {layer.type === 'image' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 text-center">
                <div className="w-12 h-12 rounded-xl bg-white/5 mx-auto flex items-center justify-center mb-3 text-white/20">
                  <ImageIcon size={24} />
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40 truncate px-2">{layer.config.assetPath?.split('/').pop() || 'No File Selected'}</p>
              </div>
              <button
                onClick={async () => {
                  if (!window.api?.assets?.images) return
                  const filePath = await window.api.assets.images.pickFile()
                  if (!filePath) return
                  const uploaded = await window.api.assets.images.upload(filePath)
                  if (uploaded?.id) updateConfig({ assetPath: `asset://${uploaded.id}` })
                }}
                className="w-full h-11 text-[10px] font-black uppercase tracking-widest text-accent bg-accent/10 rounded-xl border border-accent/20 hover:bg-accent/20 transition-all flex items-center justify-center gap-2"
              >
                <ImageIcon size={14} /> Change Asset
              </button>
            </div>
          )}
        </Section>

        {/* Visual FX Section */}
        <Section title="Visual Enhancement" icon={IconSparkles} defaultOpen={false}>
          <div className="p-6 rounded-2xl bg-gradient-to-br from-accent/10 to-transparent border border-accent/20 text-center">
             <IconSparkles size={24} className="text-accent mx-auto mb-3" />
             <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/80 mb-2">Enhancement Engine</p>
             <p className="text-[9px] font-bold text-white/40 uppercase tracking-tight mb-4">Cyber-borders, audio reactivity, and shape masking.</p>
             <button
              onClick={() => store.setShowEnhancementModal(true, layer.id)}
              className="px-6 py-2.5 rounded-xl bg-brand-gradient text-white text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all shadow-lg shadow-accent/20"
             >
               Open Modifiers
             </button>
          </div>
        </Section>
      </div>
    </div>
  )
}
