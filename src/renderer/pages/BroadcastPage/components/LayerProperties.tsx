import { useState } from 'react'
import {IconTrash, IconLock, IconLockOpen, IconEye, IconEyeOff, IconChevronUp, IconChevronDown, IconVideo, IconStack2, IconWorld, IconTypography, IconPhoto as ImageIcon, IconMicrophone, IconDeviceDesktop, IconRefresh, IconMaximize, IconRotateClockwise2} from '@tabler/icons-react'
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
  camera: IconVideo, display: IconDeviceDesktop, audio: IconMicrophone, widget: IconStack2, browser: IconWorld, text: IconTypography, image: ImageIcon
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
      <label className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-1.5 block">{label}</label>
      <input
        type="number"
        value={Math.round(value)}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        min={min}
        max={max}
        step={step}
        onMouseDown={e => e.stopPropagation()}
        className="w-full bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-accent/50 focus:outline-none transition-colors"
      />
    </div>
  )
}

function TransformSection({ 
  label, 
  layout, 
  onUpdate, 
  onFit 
}: { 
  label: string; 
  layout: any; 
  onUpdate: (u: any) => void; 
  onFit: () => void 
}) {
  return (
    <div className="space-y-4">
      <h4 className="text-[10px] font-black uppercase tracking-widest text-white/30">{label}</h4>
      <div className="grid grid-cols-2 gap-2">
        <NumericField label="X" value={layout.x} onChange={v => onUpdate({ x: v })} />
        <NumericField label="Y" value={layout.y} onChange={v => onUpdate({ y: v })} />
        <NumericField label="Width" value={layout.width} onChange={v => onUpdate({ width: v })} min={10} />
        <NumericField label="Height" value={layout.height} onChange={v => onUpdate({ height: v })} min={10} />
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
        <NumericField label="Rotation" value={layout.rotation || 0} onChange={v => onUpdate({ rotation: v })} min={-360} max={360} />
        <button
          onClick={() => onUpdate({ rotation: 0 })}
          className="h-[38px] px-3 rounded-lg border border-white/5 bg-white/5 text-white/35 hover:text-white hover:bg-white/10 transition-all"
          title="Reset Rotation"
        >
          <IconRotateClockwise2 size={14} />
        </button>
        <button
          onClick={onFit}
          className="h-[38px] px-3 rounded-lg border border-accent/20 bg-accent/10 text-accent hover:bg-accent/20 transition-all"
          title="Fit to Canvas Bounds"
        >
          <IconMaximize size={14} />
        </button>
      </div>
    </div>
  )
}

export function LayerProperties({ layer, sceneId, widgets, devices, broadcastLayoutMode, activeOrientation = '16:9' }: Props) {
  const store = useStudioStore()
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(layer.name)

  const isPortrait = activeOrientation === '9:16'
  const isDual = broadcastLayoutMode?.includes('dual')

  const lH = resolveLayerLayout(layer, '16:9')
  const lV = resolveLayerLayout(layer, '9:16')

  const update = (updates: Partial<StudioLayer>) => store.updateLayer(sceneId, layer.id, updates)

  const updateLandscape = (u: any) => {
    const final: any = {}
    if (u.x !== undefined) final.x = u.x
    if (u.y !== undefined) final.y = u.y
    if (u.width !== undefined) final.width = u.width
    if (u.height !== undefined) final.height = u.height
    if (u.rotation !== undefined) final.rotation = u.rotation
    update(final)
  }

  const updatePortrait = (u: any) => {
    const final: any = {}
    if (u.x !== undefined) final.portraitX = u.x
    if (u.y !== undefined) final.portraitY = u.y
    if (u.width !== undefined) final.portraitWidth = u.width
    if (u.height !== undefined) final.portraitHeight = u.height
    if (u.rotation !== undefined) final.portraitRotation = u.rotation
    update(final)
  }

  const fitToCanvasH = () => update({ x: 0, y: 0, width: 1920, height: 1080, crop: { top: 0, right: 0, bottom: 0, left: 0 } })
  const fitToCanvasV = () => update({ portraitX: 0, portraitY: 0, portraitWidth: 1080, portraitHeight: 1920, portraitCrop: { top: 0, right: 0, bottom: 0, left: 0 } })

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
            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/5 text-white/40 font-black">{activeOrientation}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-8">
        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          <button onClick={() => update(isPortrait ? { portraitVisible: !(layer.portraitVisible ?? layer.visible) } : { visible: !layer.visible })} className={`p-2.5 rounded-xl transition-all ${ (isPortrait ? (layer.portraitVisible ?? layer.visible) : layer.visible) ? 'text-white/80 hover:text-white bg-white/5' : 'text-white/20 hover:text-white/40'}`} title="Visibility">
            {(isPortrait ? (layer.portraitVisible ?? layer.visible) : layer.visible) ? <IconEye size={18} /> : <IconEyeOff size={18} />}
          </button>
          <button onClick={() => update(isPortrait ? { portraitLocked: !(layer.portraitLocked ?? layer.locked) } : { locked: !layer.locked })} className={`p-2.5 rounded-xl transition-all ${ (isPortrait ? (layer.portraitLocked ?? layer.locked) : layer.locked) ? 'text-amber-400 bg-amber-500/10' : 'text-white/20 hover:text-white/40'}`} title="Lock">
            {(isPortrait ? (layer.portraitLocked ?? layer.locked) : layer.locked) ? <IconLock size={18} /> : <IconLockOpen size={18} />}
          </button>
          <button onClick={() => store.reorderLayer(sceneId, layer.id, Math.min(layer.zIndex + 1, 99))} className="p-2.5 rounded-xl text-white/20 hover:text-white/80 transition-all" title="Move Up">
            <IconChevronUp size={18} />
          </button>
          <button onClick={() => store.reorderLayer(sceneId, layer.id, Math.max(0, layer.zIndex - 1))} className="p-2.5 rounded-xl text-white/20 hover:text-white/80 transition-all" title="Move Down">
            <IconChevronDown size={18} />
          </button>
          <div className="flex-1" />
          <button onClick={() => store.removeLayer(sceneId, layer.id)} className="p-2.5 rounded-xl text-white/20 hover:text-red-400 transition-all" title="Delete">
            <IconTrash size={18} />
          </button>
        </div>

        {/* Transforms */}
        <div className="space-y-8">
          {isPortrait ? (
            <TransformSection label="Transform (Vertical / TikTok)" layout={lV} onUpdate={updatePortrait} onFit={fitToCanvasV} />
          ) : (
            <TransformSection label="Transform (Horizontal / Twitch)" layout={lH} onUpdate={updateLandscape} onFit={fitToCanvasH} />
          )}
        </div>

        {/* Opacity */}
        <div className="pt-4 border-t border-white/[0.04]">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-4">Master Opacity</h4>
          <div className="flex items-center gap-4">
            <input
              type="range" min={0} max={1} step={0.01}
              value={layer.opacity}
              onChange={e => update({ opacity: parseFloat(e.target.value) })}
              className="flex-1 h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer accent-accent"
            />
            <span className="text-[10px] font-mono text-white/40 w-10 text-right">{Math.round(layer.opacity * 100)}%</span>
          </div>
        </div>



        {/* IconTypography-Specific Config */}
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
                    <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0, 8)}`}</option>
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
                <IconRefresh size={16} />
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
                <IconRefresh size={16} />
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
              Change IconPhoto
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
