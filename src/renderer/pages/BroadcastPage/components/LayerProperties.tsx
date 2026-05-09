import { useState, useMemo } from 'react'
import {
  Trash2, Lock, Unlock, Eye, EyeOff, ChevronUp, ChevronDown,
  Video, Layers, Globe, Type, Image as ImageIcon, Mic, Monitor, RefreshCw, Maximize, RotateCw
} from 'lucide-react'
import type { StudioLayer } from '../../../../shared/studio'
import { resolveLayerLayout } from '../../../../shared/studio'
import { useStudioStore } from '../../../stores/studio-store'

interface Props {
  layer: StudioLayer
  sceneId: string
  widgets: Array<{ id: string; name: string; type: string }>
  devices: MediaDeviceInfo[]
}

const TYPE_ICONS: Record<string, typeof Video> = {
  camera: Video, display: Monitor, audio: Mic, widget: Layers, browser: Globe, text: Type, image: ImageIcon
}

const CAMERA_PRESETS: Record<string, { width: number; height: number; fps: number; label: string }> = {
  '1080p60': { width: 1920, height: 1080, fps: 60, label: '1080p 60 FPS' },
  '1080p30': { width: 1920, height: 1080, fps: 30, label: '1080p 30 FPS' },
  '720p60': { width: 1280, height: 720, fps: 60, label: '720p 60 FPS' },
  '720p30': { width: 1280, height: 720, fps: 30, label: '720p 30 FPS' }
}

function NumericField({ label, value, onChange, min, max, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number
}) {
  return (
    <div>
      <label className="text-[11px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">{label}</label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        min={min}
        max={max}
        step={step}
        onMouseDown={e => e.stopPropagation()}
        className="w-full bg-white/5 border border-white/5 rounded-lg px-4 py-2.5 text-sm text-white font-mono focus:border-accent/50 focus:outline-none transition-colors [text-rendering:optimizeLegibility] antialiased"
      />
    </div>
  )
}

export function LayerProperties({ layer, sceneId, widgets, devices }: Props) {
  const store = useStudioStore()
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(layer.name)

  const isPortrait = store.aspectRatio === '9:16'

  const l = useMemo(() => resolveLayerLayout(layer, store.aspectRatio), [layer, store.aspectRatio])

  const update = (updates: Partial<StudioLayer>) => store.updateLayer(sceneId, layer.id, updates)
  const fitToCanvas = () => {
    update({
      x: 0,
      y: 0,
      width: store.canvasWidth,
      height: store.canvasHeight,
      [isPortrait ? 'portraitCrop' : 'crop']: { top: 0, right: 0, bottom: 0, left: 0 }
    } as Partial<StudioLayer>)
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

  const Icon = TYPE_ICONS[layer.type] || Layers

  return (
    <div className="flex flex-col h-full">
      <div className="p-5 border-b border-white/5 flex items-center gap-4 bg-white/[0.01]">
        <div className="p-2.5 rounded-xl bg-accent/10 text-accent">
          <Icon size={20} />
        </div>
        <div className="flex-1 min-w-0">
          {editingName ? (
            <input
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onBlur={() => { update({ name: nameValue }); setEditingName(false) }}
              onKeyDown={e => { if (e.key === 'Enter') { update({ name: nameValue }); setEditingName(false) } }}
              className="w-full bg-transparent text-sm font-black text-white outline-none border-b border-accent/50"
              autoFocus
            />
          ) : (
            <button
              onClick={() => { setNameValue(layer.name); setEditingName(true) }}
              className="text-sm font-black text-white truncate block w-full text-left hover:text-accent transition-colors"
            >
              {layer.name}
            </button>
          )}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-black">{layer.type}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/5 text-white/40 font-black">{store.aspectRatio}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          <button onClick={() => update({ visible: !l.visible })} className={`p-2.5 rounded-xl transition-all ${l.visible ? 'text-white/80 hover:text-white bg-white/5' : 'text-white/20 hover:text-white/40'}`} title="Visibility">
            {l.visible ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
          <button onClick={() => update({ locked: !l.locked })} className={`p-2.5 rounded-xl transition-all ${l.locked ? 'text-amber-400 bg-amber-500/10' : 'text-white/20 hover:text-white/40'}`} title="Lock">
            {l.locked ? <Lock size={18} /> : <Unlock size={18} />}
          </button>
          <button onClick={() => store.reorderLayer(sceneId, layer.id, Math.min(layer.zIndex + 1, 99))} className="p-2.5 rounded-xl text-white/20 hover:text-white/80 transition-all" title="Move Up">
            <ChevronUp size={18} />
          </button>
          <button onClick={() => store.reorderLayer(sceneId, layer.id, Math.max(0, layer.zIndex - 1))} className="p-2.5 rounded-xl text-white/20 hover:text-white/80 transition-all" title="Move Down">
            <ChevronDown size={18} />
          </button>
          <div className="flex-1" />
          <button onClick={() => store.removeLayer(sceneId, layer.id)} className="p-2.5 rounded-xl text-white/20 hover:text-red-400 transition-all" title="Delete">
            <Trash2 size={18} />
          </button>
        </div>

        {/* Transform */}
        <div>
          <h4 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">Transform ({store.aspectRatio})</h4>
          <div className="grid grid-cols-2 gap-2">
            <NumericField label="X" value={l.x} onChange={v => update({ x: Math.round(v) })} />
            <NumericField label="Y" value={l.y} onChange={v => update({ y: Math.round(v) })} />
            <NumericField label="Width" value={l.width} onChange={v => update({ width: Math.max(10, Math.round(v)) })} min={10} />
            <NumericField label="Height" value={l.height} onChange={v => update({ height: Math.max(10, Math.round(v)) })} min={10} />
          </div>
          <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-2 items-end">
            <NumericField label="Rotation" value={Number(l.rotation || 0)} onChange={v => update({ rotation: Math.round(v) })} min={-360} max={360} />
            <button
              onClick={() => update({ rotation: 0 })}
              className="h-[42px] px-3 rounded-lg border border-white/5 bg-white/5 text-white/35 hover:text-white hover:bg-white/10 transition-all"
              title="Reset Rotation"
            >
              <RotateCw size={16} />
            </button>
            <button
              onClick={fitToCanvas}
              className="h-[42px] px-3 rounded-lg border border-accent/20 bg-accent/10 text-accent hover:bg-accent/20 transition-all"
              title="Fit to Canvas Bounds"
            >
              <Maximize size={16} />
            </button>
          </div>
        </div>

        {/* Opacity */}
        <div>
          <h4 className="text-[11px] font-black uppercase tracking-widest text-white/40 mb-4">Opacity</h4>
          <div className="flex items-center gap-4">
            <input
              type="range" min={0} max={1} step={0.01}
              value={layer.opacity}
              onChange={e => update({ opacity: parseFloat(e.target.value) })}
              className="flex-1 accent-accent"
            />
            <span className="text-xs font-mono text-white/40 w-10 text-right">{Math.round(layer.opacity * 100)}%</span>
          </div>
        </div>

        {/* Type-Specific Config */}
        {(layer.type === 'camera' || layer.type === 'audio') && (
          <div>
            <h4 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">
              {layer.type === 'camera' ? 'Camera' : 'Audio Device'}
            </h4>
            <select
              value={layer.config.deviceId || ''}
              onChange={e => updateConfig({ deviceId: e.target.value })}
              className="w-full bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-xs text-white focus:border-accent/50 focus:outline-none [&>option]:bg-[#1a1a1a]"
            >
              {layer.type === 'camera' ? (
                <>
                  {devices.filter(d => d.kind === 'videoinput').length === 0 && <option value="">No cameras</option>}
                  {devices.filter(d => d.kind === 'videoinput').map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 8)}`}</option>
                  ))}
                </>
              ) : (
                <>
                  {devices.filter(d => d.kind === 'audioinput').length === 0 && <option value="">No audio devices</option>}
                  {devices.filter(d => d.kind === 'audioinput').map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0, 8)}`}</option>
                  ))}
                </>
              )}
            </select>
          </div>
        )}

        {layer.type === 'camera' && (
          <div className="space-y-3">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">Capture Stability</h4>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-white/25 mb-2 block">Capture Card Audio</label>
              <select
                value={layer.config.audioDeviceId || 'match'}
                onChange={e => updateConfig({ audioDeviceId: e.target.value, audioMixerHidden: e.target.value === 'none' })}
                className="w-full bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-xs text-white focus:border-accent/50 focus:outline-none [&>option]:bg-[#1a1a1a]"
              >
                <option value="match">Auto-match by device name</option>
                <option value="default">Default system input</option>
                <option value="none">No audio from this source</option>
                {devices.filter(d => d.kind === 'audioinput').map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || `Audio ${d.deviceId.slice(0, 8)}`}</option>
                ))}
              </select>
            </div>
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
              className="w-full bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-xs text-white focus:border-accent/50 focus:outline-none [&>option]:bg-[#1a1a1a]"
            >
              {layer.config.capturePreset === 'custom' && <option value="custom">Custom</option>}
              {Object.entries(CAMERA_PRESETS).map(([value, preset]) => (
                <option key={value} value={value}>{preset.label}</option>
              ))}
            </select>
            <div className="grid grid-cols-3 gap-2">
              <NumericField label="Width" value={layer.config.captureWidth || 1920} onChange={v => updateConfig({ capturePreset: 'custom', captureWidth: Math.max(320, Math.round(v)) })} min={320} />
              <NumericField label="Height" value={layer.config.captureHeight || 1080} onChange={v => updateConfig({ capturePreset: 'custom', captureHeight: Math.max(180, Math.round(v)) })} min={180} />
              <NumericField label="FPS" value={layer.config.captureFps || 60} onChange={v => updateConfig({ capturePreset: 'custom', captureFps: Math.max(15, Math.min(60, Math.round(v))) })} min={15} max={60} />
            </div>
            <button
              onClick={() => updateConfig({ stabilize: layer.config.stabilize === false })}
              className={`w-full rounded-lg border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${layer.config.stabilize === false ? 'bg-white/5 border-white/5 text-white/35 hover:text-white/55' : 'bg-accent/10 border-accent/25 text-accent'}`}
              title="Redraw the capture card to a fixed-FPS internal canvas before ilyStream uses it"
            >
              {layer.config.stabilize === false ? 'Raw Device Timing' : 'Stable Frame Pacing'}
            </button>
          </div>
        )}

        {layer.type === 'widget' && (
          <div className="space-y-3">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">Widget</h4>
            <select
              value={layer.config.widgetId || ''}
              onChange={e => updateConfig({ widgetId: e.target.value })}
              className="w-full bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-xs text-white focus:border-accent/50 focus:outline-none [&>option]:bg-[#1a1a1a]"
            >
              {widgets.length === 0 && <option value="">No widgets</option>}
              {widgets.map(w => (
                <option key={w.id} value={w.id}>{w.name} ({w.type})</option>
              ))}
            </select>
            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <NumericField label="FPS" value={layer.config.fps || 8} onChange={v => updateConfig({ fps: Math.max(1, Math.min(10, Math.round(v))) })} min={1} max={10} />
              <button
                onClick={() => window.api?.studio?.reloadBrowserSource?.(layer.id)}
                className="h-[42px] px-3 rounded-lg border border-white/5 bg-white/5 text-white/25 hover:text-white hover:bg-white/10 transition-all"
                title="Reload Source"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>
        )}

        {layer.type === 'browser' && (
          <div className="space-y-3">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">Browser</h4>
            <input
              value={layer.config.url || ''}
              onChange={e => updateConfig({ url: e.target.value })}
              onMouseDown={e => e.stopPropagation()}
              placeholder="https://example.com"
              className="w-full bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/15 focus:border-accent/50 focus:outline-none [text-rendering:optimizeLegibility] antialiased"
            />
            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <NumericField label="FPS" value={layer.config.fps || 8} onChange={v => updateConfig({ fps: Math.max(1, Math.min(10, Math.round(v))) })} min={1} max={10} />
              <button
                onClick={() => window.api?.studio?.reloadBrowserSource?.(layer.id)}
                className="h-[42px] px-3 rounded-lg border border-white/5 bg-white/5 text-white/25 hover:text-white hover:bg-white/10 transition-all"
                title="Reload Source"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>
        )}

        {layer.type === 'text' && (
          <div className="space-y-3">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-white/30">Text</h4>
            <input
              value={layer.config.text || ''}
              onChange={e => updateConfig({ text: e.target.value })}
              className="w-full bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-xs text-white focus:border-accent/50 focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-1 block">Color</label>
                <input
                  type="color"
                  value={layer.config.color || '#ffffff'}
                  onChange={e => updateConfig({ color: e.target.value })}
                  className="w-full h-8 rounded-lg border border-white/10 cursor-pointer bg-transparent"
                />
              </div>
              <NumericField label="Size" value={layer.config.fontSize || 48} onChange={v => updateConfig({ fontSize: v })} min={8} max={400} />
            </div>
          </div>
        )}

        {layer.type === 'image' && (
          <div>
            <h4 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">Image</h4>
            <div className="text-[10px] text-white/30 font-mono truncate mb-2">{layer.config.assetPath || 'No image'}</div>
            <button
              onClick={async () => {
                if (!window.api?.assets?.images) return
                const filePath = await window.api.assets.images.pickFile()
                if (!filePath) return
                const uploaded = await window.api.assets.images.upload(filePath)
                if (uploaded?.id) updateConfig({ assetPath: `asset://${uploaded.id}` })
              }}
              className="w-full text-[10px] font-bold uppercase tracking-widest text-accent py-2 px-3 rounded-lg border border-accent/20 hover:bg-accent/10 transition-all"
            >
              Change Image
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
