import { useState, useEffect } from 'react'
import { IconVideo, IconStack2, IconWorld, IconTypography, IconPhoto as ImageIcon, IconChevronLeft, IconMicrophone, IconDeviceDesktop, IconVolume, IconMusic } from '@tabler/icons-react'
import type { LayerType } from '../../../../shared/studio'
import { Modal } from '../../../components/ui/Modal'

interface Props {
  open: boolean
  onClose: () => void
  onAdd: (type: LayerType, config: Record<string, any>, name?: string) => void
  widgets: Array<{ id: string; name: string; type: string }>
  devices: MediaDeviceInfo[]
}

const SOURCE_TYPES: Array<{ type: LayerType; label: string; desc: string; icon: any; iconClass: string; bgClass: string }> = [
  { type: 'camera', label: 'Video Capture', desc: 'Webcams & Capture Cards', icon: IconVideo, iconClass: 'text-[rgb(var(--accent-rgb))]', bgClass: 'bg-[rgb(var(--accent-rgb))/0.1]' },
  { type: 'display', label: 'Screen / Window', desc: 'Display capture with optional audio', icon: IconDeviceDesktop, iconClass: 'text-cyan-300', bgClass: 'bg-cyan-500/10' },
  { type: 'audio', label: 'Audio Input', desc: 'Mics & External Inputs', icon: IconMicrophone, iconClass: 'text-amber-400', bgClass: 'bg-amber-500/10' },
  { type: 'widget', label: 'Ily Widget', desc: 'Chat, Alerts, Goals', icon: IconStack2, iconClass: 'text-purple-400', bgClass: 'bg-purple-500/10' },
  { type: 'browser', label: 'Browser Source', desc: 'External URLs & Overlays', icon: IconWorld, iconClass: 'text-emerald-400', bgClass: 'bg-emerald-500/10' },
  { type: 'text', label: 'Text Label', desc: 'Custom Titles & Branding', icon: IconTypography, iconClass: 'text-blue-400', bgClass: 'bg-blue-500/10' },
  { type: 'image', label: 'Photo / Logo', desc: 'PNG, JPG, SVG files', icon: ImageIcon, iconClass: 'text-sky-400', bgClass: 'bg-sky-500/10' },
  { type: 'spotify' as any, label: 'Spotify / Music', desc: 'Capture Spotify or System audio', icon: IconMusic, iconClass: 'text-green-400', bgClass: 'bg-green-500/10' },
]

interface DesktopSourceOption {
  id: string
  name: string
  thumbnail?: string | null
  appIcon?: string | null
  type: 'screen' | 'window'
}

export function AddSourceModal({ open, onClose, onAdd, widgets, devices }: Props) {
  const [step, setStep] = useState<'pick' | 'configure'>('pick')
  const [selectedType, setSelectedType] = useState<LayerType | null>(null)
  const [name, setName] = useState('')
  const [config, setConfig] = useState<Record<string, any>>({})
  const [desktopSources, setDesktopSources] = useState<DesktopSourceOption[]>([])

  useEffect(() => {
    if (open) {
      setStep('pick')
      setSelectedType(null)
      setName('')
      setConfig({})
      setDesktopSources([])
    }
  }, [open])

  useEffect(() => {
    if (step === 'configure' && selectedType === 'camera' && !config.deviceId && devices.length > 0) {
      const defaultVideoDevice = devices.find(d => d.kind === 'videoinput')
      if (defaultVideoDevice) {
        const matchedAudioDevice = findLikelyAudioDevice(defaultVideoDevice, devices)
        setConfig(prev => ({
          ...prev,
          deviceId: defaultVideoDevice.deviceId,
          audioDeviceId: matchedAudioDevice?.deviceId || 'match'
        }))
        if (!name) setName(defaultVideoDevice.label || 'Camera')
      }
    }
  }, [devices, step, selectedType])

  const handleSelectType = (type: LayerType) => {
    const defaultVideoDevice = devices.find(d => d.kind === 'videoinput')
    const matchedAudioDevice = findLikelyAudioDevice(defaultVideoDevice, devices)
    setSelectedType(type)
    setStep('configure')
    setName({ 
      camera: defaultVideoDevice?.label || 'Camera', 
      display: 'Display Capture', 
      audio: 'Microphone', 
      widget: 'Widget', 
      browser: 'Browser Source', 
      text: 'Text', 
      image: 'Image' 
    }[type] || type)
    setConfig({
      camera: {
        deviceId: defaultVideoDevice?.deviceId || '',
        audioDeviceId: matchedAudioDevice?.deviceId || 'match',
        capturePreset: '1080p30',
        captureWidth: 1920,
        captureHeight: 1080,
        captureFps: 30,
        stabilize: false,
        fitMode: 'contain'
      },
      display: { captureAudio: true, desktopSourceId: '', desktopSourceName: '', fitMode: 'contain' },
      audio: { captureMode: 'mic', deviceId: devices.find(d => d.kind === 'audioinput')?.deviceId || '', desktopSourceId: '', desktopSourceName: '' },
      widget: { widgetId: widgets[0]?.id || '', fps: 8 },
      browser: { url: '', fps: 8, fitMode: 'contain' },
      text: { text: 'New Text', color: '#ffffff', fontSize: 48 },
      image: { assetPath: '', fitMode: 'contain' }
    }[type])

    if (type === ('spotify' as any)) {
      setSelectedType('audio')
      setStep('configure')
      setName('Spotify')
      setConfig({ captureMode: 'desktop', desktopSourceId: '', desktopSourceName: '', audioOnlyDisplayCapture: true })
      void loadDesktopSources()
      return
    }

    if (type === 'display' || type === 'audio') {
      void loadDesktopSources()
    }
  }

  const handleSubmit = () => {
    if (!selectedType) return
    if (selectedType === 'audio' && config.captureMode === 'desktop') {
      onAdd('audio', { ...config, audioOnlyDisplayCapture: true }, name || 'Desktop Audio')
      return
    }
    onAdd(selectedType, config, name)
  }

  const loadDesktopSources = async () => {
    if (!window.api?.studio?.getDesktopSources) return
    let sources = await window.api.studio.getDesktopSources()
    
    if (name === 'Spotify') {
      sources = [...sources].sort((a, b) => {
        const isA = a.name.toLowerCase().includes('spotify')
        const isB = b.name.toLowerCase().includes('spotify')
        return isA === isB ? 0 : (isA ? -1 : 1)
      })
    }
    
    setDesktopSources(sources || [])
  }

  const selectDesktopSource = (source: DesktopSourceOption) => {
    setConfig({
      ...config,
      desktopSourceId: source.id,
      desktopSourceName: source.name
    })
    if (!name || name === 'Display Capture' || name === 'Desktop Audio') {
      setName(source.name)
    }
  }

  const handlePickImage = async () => {
    if (!window.api?.assets?.images) return
    const filePath = await window.api.assets.images.pickFile()
    if (!filePath) return
    const uploaded = await window.api.assets.images.upload(filePath)
    if (uploaded?.id) {
      setConfig({ ...config, assetPath: `asset://${uploaded.id}` })
      if (!name || name === 'Image') setName(uploaded.name || 'Image')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={step === 'pick' ? 'Add Source' : `Configure ${name}`}
      headerActions={step === 'configure' && (
        <button onClick={() => setStep('pick')} className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-all cursor-pointer">
          <IconChevronLeft size={18} />
        </button>
      )}
    >
      {step === 'pick' ? (
        <div className="p-8 space-y-8">
          <div className="grid grid-cols-2 gap-4">
            {SOURCE_TYPES.map(st => {
              const Icon = st.icon
              return (
                <button
                  key={st.type}
                  onClick={() => handleSelectType(st.type)}
                  className="flex items-center gap-4 p-5 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-accent/30 hover:bg-white/[0.06] transition-all group text-left cursor-pointer"
                >
                  <div className={`w-12 h-12 rounded-xl ${st.bgClass} flex items-center justify-center ${st.iconClass} transition-transform`}>
                    <Icon size={24} />
                  </div>
                  <div>
                    <div className="font-bold text-white text-sm">{st.label}</div>
                    <div className="text-2xs text-white/30">{st.desc}</div>
                  </div>
                </button>
              )
            })}
          </div>

          {widgets.length > 0 && (
            <div>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/20 mb-4 px-1">Quick Add Widgets</h3>
              <div className="grid grid-cols-3 gap-3">
                {widgets.slice(0, 3).map(w => (
                  <button
                    key={w.id}
                    onClick={() => onAdd('widget', { widgetId: w.id }, w.name)}
                    className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-purple-500/5 border border-purple-500/10 hover:border-purple-500/30 hover:bg-purple-500/10 transition-all group cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400 transition-transform">
                      <IconStack2 size={20} />
                    </div>
                    <span className="text-xs font-bold text-white/60 group-hover:text-white transition-colors">{w.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-8 space-y-6">
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-white/30 mb-2 block">Source Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full app-input text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all"
              autoFocus
            />
          </div>

          {selectedType === 'camera' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-white/30 mb-2 block">Camera Device</label>
                <select
                  value={config.deviceId || ''}
                  onChange={e => {
                    const videoDevice = devices.find(d => d.deviceId === e.target.value)
                    const matchedAudioDevice = findLikelyAudioDevice(videoDevice, devices)
                    setConfig({
                      ...config,
                      deviceId: e.target.value,
                      audioDeviceId: matchedAudioDevice?.deviceId || config.audioDeviceId || 'match'
                    })
                    if (videoDevice?.label) setName(videoDevice.label)
                  }}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-accent/50 focus:outline-none [&>option]:bg-[#1a1a1a]"
                >
                  {devices.filter(d => d.kind === 'videoinput').length === 0 && <option value="">No cameras detected</option>}
                  {devices.filter(d => d.kind === 'videoinput').map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 8)}`}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-white/30 mb-2 block">Audio Input</label>
                <select
                  value={config.audioDeviceId || 'match'}
                  onChange={e => setConfig({ ...config, audioDeviceId: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-accent/50 focus:outline-none [&>option]:bg-[#1a1a1a]"
                >
                  <option value="match">Auto-match capture card audio</option>
                  <option value="default">Default system input</option>
                  <option value="none">No audio from this source</option>
                  {devices.filter(d => d.kind === 'audioinput').map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || `Audio ${d.deviceId.slice(0, 8)}`}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-white/30 mb-2 block">Capture Preset</label>
                  <select
                    value={config.capturePreset || '1080p60'}
                    onChange={e => {
                      const preset = {
                        '1080p60': { captureWidth: 1920, captureHeight: 1080, captureFps: 60 },
                        '1080p30': { captureWidth: 1920, captureHeight: 1080, captureFps: 30 },
                        '720p60': { captureWidth: 1280, captureHeight: 720, captureFps: 60 },
                        '720p30': { captureWidth: 1280, captureHeight: 720, captureFps: 30 }
                      }[e.target.value] || {}
                      setConfig({ ...config, capturePreset: e.target.value, ...preset })
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-accent/50 focus:outline-none [&>option]:bg-[#1a1a1a]"
                  >
                    <option value="1080p60">1080p 60 FPS</option>
                    <option value="1080p30">1080p 30 FPS</option>
                    <option value="720p60">720p 60 FPS</option>
                    <option value="720p30">720p 30 FPS</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-white/30 mb-2 block">Frame Pacer</label>
                  <button
                    onClick={() => setConfig({ ...config, stabilize: config.stabilize === false })}
                    className={`w-full rounded-xl border px-4 py-3 text-sm font-bold transition-all cursor-pointer ${config.stabilize === false ? 'bg-white/5 border-white/10 text-white/40' : 'bg-accent/15 border-accent/30 text-accent'}`}
                  >
                    {config.stabilize === false ? 'Raw Device' : 'OBS-style Stable'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {selectedType === 'audio' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/[0.025] p-1 ring-1 ring-white/10">
                <button
                  onClick={() => setConfig({ ...config, captureMode: 'mic' })}
                  className={`h-10 rounded-lg text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${config.captureMode !== 'desktop' ? 'bg-accent/15 text-accent ring-1 ring-accent/30' : 'text-white/35 hover:bg-white/[0.04]'}`}
                >
                  Input
                </button>
                <button
                  onClick={() => {
                    setConfig({ ...config, captureMode: 'desktop' })
                    if (!desktopSources.length) void loadDesktopSources()
                    if (!name || name === 'Microphone') setName('Desktop Audio')
                  }}
                  className={`h-10 rounded-lg text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${config.captureMode === 'desktop' ? 'bg-accent/15 text-accent ring-1 ring-accent/30' : 'text-white/35 hover:bg-white/[0.04]'}`}
                >
                  Desktop/App
                </button>
              </div>

              {config.captureMode === 'desktop' ? (
                <DesktopSourcePicker
                  sources={desktopSources}
                  selectedId={config.desktopSourceId || ''}
                  onRefresh={loadDesktopSources}
                  onSelect={selectDesktopSource}
                />
              ) : (
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-white/30 mb-2 block">Audio Device</label>
                  <select
                    value={config.deviceId || ''}
                    onChange={e => setConfig({ ...config, deviceId: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-accent/50 focus:outline-none [&>option]:bg-[#1a1a1a]"
                  >
                    {devices.filter(d => d.kind === 'audioinput').length === 0 && <option value="">No audio devices detected</option>}
                    {devices.filter(d => d.kind === 'audioinput').map(d => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0, 8)}`}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {selectedType === 'display' && (
            <div className="space-y-4">
              <DesktopSourcePicker
                sources={desktopSources}
                selectedId={config.desktopSourceId || ''}
                onRefresh={loadDesktopSources}
                onSelect={selectDesktopSource}
              />
              <button
                onClick={() => setConfig({ ...config, captureAudio: config.captureAudio !== true })}
                className={`w-full rounded-xl border px-4 py-3 text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${config.captureAudio === true ? 'bg-accent/15 border-accent/30 text-accent' : 'bg-white/5 border-white/10 text-white/40'}`}
              >
                <IconVolume size={16} />
                {config.captureAudio === true ? 'Capture desktop audio' : 'Video only'}
              </button>
            </div>
          )}

          {selectedType === 'widget' && (
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-white/30 mb-2 block">Widget</label>
              <select
                value={config.widgetId || ''}
                onChange={e => {
                  const w = widgets.find(w => w.id === e.target.value)
                  setConfig({ ...config, widgetId: e.target.value })
                  if (w) setName(w.name)
                }}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-accent/50 focus:outline-none [&>option]:bg-[#1a1a1a]"
              >
                {widgets.length === 0 && <option value="">No widgets configured</option>}
                {widgets.map(w => (
                  <option key={w.id} value={w.id}>{w.name} ({w.type})</option>
                ))}
              </select>
            </div>
          )}

          {selectedType === 'browser' && (
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-white/30 mb-2 block">URL</label>
              <input
                value={config.url || ''}
                onChange={e => setConfig({ ...config, url: e.target.value })}
                placeholder="https://example.com"
                className="w-full app-input text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all placeholder:text-white/20"
              />
            </div>
          )}

          {selectedType === 'text' && (
            <>
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-white/30 mb-2 block">Text Content</label>
                <input
                  value={config.text || ''}
                  onChange={e => setConfig({ ...config, text: e.target.value })}
                  className="w-full app-input text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-white/30 mb-2 block">Color</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={config.color || '#ffffff'}
                      onChange={e => setConfig({ ...config, color: e.target.value })}
                      className="w-10 h-10 rounded-lg border border-white/10 cursor-pointer bg-transparent"
                    />
                    <span className="text-xs text-white/40 font-mono">{config.color || '#ffffff'}</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-white/30 mb-2 block">Font Size</label>
                  <input
                    type="number"
                    value={config.fontSize || 48}
                    onChange={e => setConfig({ ...config, fontSize: parseInt(e.target.value) || 48 })}
                    className="w-full app-input text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all"
                  />
                </div>
              </div>
            </>
          )}

          {selectedType === 'image' && (
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-white/30 mb-2 block">Image</label>
              <button
                onClick={handlePickImage}
                className="w-full bg-white/[0.03] border border-white/10 border-dashed rounded-xl px-4 py-8 text-sm text-white/30 hover:text-white/50 hover:border-white/20 transition-all text-center cursor-pointer"
              >
                {config.assetPath ? 'Photo selected — click to change' : 'Click to select an image file'}
              </button>
              {config.assetPath && (
                <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/5">
                  <ImageIcon size={14} className="text-accent shrink-0" />
                  <span className="text-xs text-white/50 truncate font-mono">{config.assetPath}</span>
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={
              (selectedType === 'browser' && !config.url) ||
              (selectedType === 'display' && !config.desktopSourceId) ||
              (selectedType === 'audio' && config.captureMode === 'desktop' && !config.desktopSourceId)
            }
            className="w-full app-button-primary !py-3 text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            {selectedType === 'audio' ? 'Add to Mixer' : 'Add to Scene'}
          </button>
        </div>
      )}
    </Modal>
  )
}

function DesktopSourcePicker({
  sources,
  selectedId,
  onRefresh,
  onSelect
}: {
  sources: DesktopSourceOption[]
  selectedId: string
  onRefresh: () => void
  onSelect: (source: DesktopSourceOption) => void
}) {
  const sortedSources = [
    ...sources.filter(source => source.type === 'screen'),
    ...sources.filter(source => source.type !== 'screen')
  ]

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-[10px] font-black uppercase tracking-widest text-white/30">Screen / Window</label>
        <button
          onClick={onRefresh}
          className="text-[10px] font-black uppercase tracking-widest text-accent/80 hover:text-accent cursor-pointer"
        >
          Refresh
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto custom-scrollbar grid grid-cols-2 gap-3 pr-1">
        {sortedSources.length === 0 ? (
          <div className="col-span-2 rounded-xl border border-white/5 bg-white/[0.03] p-4 text-xs text-white/35 text-center">
            No screens or windows found.
          </div>
        ) : sortedSources.map(source => (
          <button
            key={source.id}
            onClick={() => onSelect(source)}
            className={`min-w-0 overflow-hidden rounded-xl border text-left transition-all cursor-pointer ${
              selectedId === source.id
                ? 'border-accent/45 bg-accent/10'
                : 'border-white/8 bg-white/[0.03] hover:border-white/18 hover:bg-white/[0.055]'
            }`}
          >
            <div className="aspect-video bg-black/60 overflow-hidden">
              {source.thumbnail ? (
                <img src={source.thumbnail} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-white/20">
                  <IconDeviceDesktop size={22} />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 p-3">
              {source.appIcon ? <img src={source.appIcon} alt="" className="h-4 w-4 shrink-0" /> : <IconDeviceDesktop size={14} className="shrink-0 text-white/35" />}
              <span className="truncate text-[11px] font-bold text-white/70">{source.name}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function findLikelyAudioDevice(videoDevice: MediaDeviceInfo | undefined, devices: MediaDeviceInfo[]): MediaDeviceInfo | undefined {
  if (!videoDevice?.label) return undefined
  const audioInputs = devices.filter(device => device.kind === 'audioinput')
  const videoLabel = videoDevice.label.toLowerCase()
  
  const exactMatch = audioInputs.find(d => {
    const al = d.label.toLowerCase()
    return al.includes(videoLabel) || videoLabel.includes(al.replace('audio', 'video')) || al.includes(videoLabel.replace('video', 'audio'))
  })
  if (exactMatch) return exactMatch

  const idMatch = videoLabel.match(/[0-9a-f]{4}:[0-9a-f]{4}/)
  if (idMatch) {
    const suffix = idMatch[0]
    const matchedId = audioInputs.find(d => d.label.toLowerCase().includes(suffix))
    if (matchedId) return matchedId
  }

  const videoWords = normalizeDeviceLabel(videoDevice.label)
  if (videoWords.length === 0) return undefined

  return audioInputs.find(device => {
    const audioWords = normalizeDeviceLabel(device.label)
    return videoWords.some(word => word.length >= 3 && audioWords.includes(word))
  })
}

function normalizeDeviceLabel(label: string): string[] {
  const words = label
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter(word => word && word.length >= 2)
    .map(word => word.replace(/[0-9]+$/, ''))
  
  const filtered = words.filter(word => !['video', 'audio', 'camera', 'device', 'digital', 'interface', 'usb'].includes(word))
  return filtered.length > 0 ? filtered : words
}
