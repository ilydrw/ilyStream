import {IconRadio, IconMenu2, IconDeviceDesktop, IconDeviceMobile, IconStack2, IconRotate2, IconRotateClockwise2, IconCamera, IconCircle, IconRefresh, IconVideo, IconSquare, IconPlayerPlay, IconChevronRight, IconChevronLeft} from '@tabler/icons-react'
import { Select } from '../../../components/ui/Select'
import { LayoutPlatformPicker } from '../components/LayoutPlatformPicker'

interface BroadcastHeaderProps {
  isStreaming: boolean
  isRecording: boolean
  recordingTime: string
  status: string
  showLeftSidebar: boolean
  onToggleLeftSidebar: () => void
  showRightSidebar: boolean
  onToggleRightSidebar: () => void
  broadcastLayoutMode: any
  onLayoutModeChange: (mode: string) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  onTakeScreenshot: () => void
  onStartRecording: () => void
  onStopRecording: () => void
  onForceRefreshMedia: () => void
  monitors: any[]
  selectedMonitorId: number | null
  onSetSelectedMonitorId: (id: number) => void
  onOpenProjector: () => void
  obsStatus: any
  onToggleObsVirtualCamera: () => void
  platforms: any[]
  layoutAssignments: any
  onToggleLayoutAssignment: (layout: any, id: string) => void
  onRemoveLayoutAssignment: (layout: any, id: string) => void
  customRtmpUrl: string
  onCustomRtmpUrlChange: (val: string) => void
  customStreamKey: string
  onCustomStreamKeyChange: (val: string) => void
  onStartBroadcast: () => void
  onStopBroadcast: () => void
}

export function BroadcastHeader(props: BroadcastHeaderProps) {
  const { 
    isStreaming, isRecording, recordingTime, showLeftSidebar, onToggleLeftSidebar, 
    showRightSidebar, onToggleRightSidebar, broadcastLayoutMode, onLayoutModeChange,
    undo, redo, canUndo, canRedo, onTakeScreenshot, onStartRecording, onStopRecording,
    onForceRefreshMedia, monitors, selectedMonitorId, onSetSelectedMonitorId,
    onOpenProjector, obsStatus, onToggleObsVirtualCamera, platforms, layoutAssignments,
    onToggleLayoutAssignment, onRemoveLayoutAssignment, customRtmpUrl, onCustomRtmpUrlChange,
    customStreamKey, onCustomStreamKeyChange, onStartBroadcast, onStopBroadcast
  } = props

  const assignedStreamCount = layoutAssignments.horizontal.length + layoutAssignments.vertical.length

  return (
    <header className="shrink-0 px-6 py-4 flex items-center justify-between border-b border-white/[0.04] bg-[#080808]" style={{ WebkitAppRegion: 'drag' } as any}>
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-4">
          <IconRadio size={20} className={isStreaming ? 'text-success animate-pulse' : 'text-white/20'} />
        </div>

        <div style={{ WebkitAppRegion: 'no-drag' } as any} className="flex bg-white/5 rounded-xl p-0.5 border border-white/10">
          <button onClick={onToggleLeftSidebar} className={`p-2.5 rounded-xl transition-all ${showLeftSidebar ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-white/30 hover:text-white'}`}>
            <IconMenu2 size={20} />
          </button>
          <div className="w-px h-6 bg-white/10 mx-2" />
          <Select
            value={broadcastLayoutMode}
            onChange={onLayoutModeChange}
            options={[
              { value: 'horizontal', label: 'Landscape', icon: <IconDeviceDesktop size={15} /> },
              { value: 'vertical', label: 'Portrait', icon: <IconDeviceMobile size={15} /> },
              { value: 'dual', label: 'Dual (H+V)', icon: <IconStack2 size={15} /> },
              { value: 'dual-horizontal', label: 'Dual Landscape', icon: <IconStack2 size={15} /> },
              { value: 'dual-portrait', label: 'Dual Vertical', icon: <IconStack2 size={15} className="rotate-90" /> }
            ]}
            className="w-40"
            buttonClassName="h-9 bg-black/30 border-white/5 rounded-xl px-3 hover:bg-black/50 transition-all ring-1 ring-white/5 text-[10px] font-black uppercase tracking-widest"
          />
        </div>
      </div>

      <div style={{ WebkitAppRegion: 'no-drag' } as any} className="flex items-center gap-3">
        <div className="flex bg-white/5 rounded-xl p-1 border border-white/10">
          <button onClick={undo} disabled={!canUndo} className="p-2 rounded-lg text-white/30 hover:text-white disabled:opacity-20 transition-all"><IconRotate2 size={18} /></button>
          <button onClick={redo} disabled={!canRedo} className="p-2 rounded-lg text-white/30 hover:text-white disabled:opacity-20 transition-all"><IconRotateClockwise2 size={18} /></button>
        </div>

        <div className="flex bg-white/5 rounded-xl p-1 border border-white/10">
          <button onClick={onTakeScreenshot} className="p-2.5 rounded-lg text-white/30 hover:text-white hover:bg-white/5 transition-all">
            <IconCamera size={20} />
          </button>
          <div className="w-px h-6 bg-white/10 mx-2 self-center" />
          <button onClick={isRecording ? onStopRecording : onStartRecording} className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all ${isRecording ? 'bg-red-500/20 text-red-400' : 'text-white/30 hover:text-white hover:bg-white/5'}`}>
            <IconCircle size={16} className={isRecording ? 'fill-red-400 animate-pulse' : ''} />
            {isRecording && <span className="text-[13px] font-black tabular-nums">{recordingTime}</span>}
          </button>
        </div>

        <button onClick={onForceRefreshMedia} className="h-9 px-4 rounded-xl bg-white/5 border border-white/10 text-white/30 hover:text-white hover:bg-white/10 transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
          <IconRefresh size={14} /> Reset Cam
        </button>

        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-2 h-9">
          <Select
            value={selectedMonitorId?.toString() ?? ''}
            onChange={val => onSetSelectedMonitorId(Number(val))}
            options={monitors.map(monitor => ({ value: monitor.id.toString(), label: monitor.label }))}
            className="w-32"
            buttonClassName="h-7 bg-transparent border-0 px-2 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white"
          />
          <button onClick={onOpenProjector} disabled={!monitors.length} className="h-7 px-3 rounded-lg bg-white/5 text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-20 transition-all flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest">
            <IconDeviceDesktop size={13} /> Project
          </button>
        </div>

        <button onClick={onToggleObsVirtualCamera} disabled={!obsStatus?.connected} className={`h-9 px-4 rounded-xl border transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest disabled:opacity-25 disabled:cursor-not-allowed ${obsStatus?.virtualCameraActive ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' : 'bg-white/5 border-white/10 text-white/35 hover:text-white hover:bg-white/10'}`}>
          <IconVideo size={14} /> OBS Cam
        </button>

        <LayoutPlatformPicker layout="horizontal" label="Horizontal" icon={<IconDeviceDesktop size={14} />} platforms={platforms} selectedIds={layoutAssignments.horizontal} blockedIds={layoutAssignments.vertical} disabled={broadcastLayoutMode === 'vertical'} isStreaming={isStreaming} onToggle={onToggleLayoutAssignment} onRemove={onRemoveLayoutAssignment} />
        <LayoutPlatformPicker layout="vertical" label="Vertical" icon={<IconDeviceMobile size={14} />} platforms={platforms} selectedIds={layoutAssignments.vertical} blockedIds={layoutAssignments.horizontal} disabled={broadcastLayoutMode === 'horizontal'} isStreaming={isStreaming} onToggle={onToggleLayoutAssignment} onRemove={onRemoveLayoutAssignment} />

        {assignedStreamCount === 0 && (
          <div className="flex items-center gap-2">
            <input value={customRtmpUrl} onChange={e => onCustomRtmpUrlChange(e.target.value)} placeholder="rtmp://server/app" className="h-9 w-44 rounded-xl bg-white/5 border border-white/10 px-3 text-[11px] font-bold text-white/70 placeholder:text-white/20 outline-none focus:border-accent/40" />
            <input value={customStreamKey} onChange={e => onCustomStreamKeyChange(e.target.value)} placeholder="Stream key" type="password" className="h-9 w-36 rounded-xl bg-white/5 border border-white/10 px-3 text-[11px] font-bold text-white/70 placeholder:text-white/20 outline-none focus:border-accent/40" />
          </div>
        )}

        {isStreaming ? (
          <button onClick={onStopBroadcast} className="h-9 px-5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/30 transition-all flex items-center gap-2">
            <IconSquare size={12} /> End
          </button>
        ) : (
          <button onClick={onStartBroadcast} disabled={assignedStreamCount === 0 && (!customRtmpUrl.trim() || !customStreamKey.trim())} className="h-9 px-6 rounded-xl bg-accent text-white text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all flex items-center gap-2 shadow-lg shadow-accent/20 disabled:opacity-30 disabled:cursor-not-allowed">
            <IconPlayerPlay size={12} /> Go Live
          </button>
        )}

        <button onClick={onToggleRightSidebar} className={`ml-3 p-3 rounded-xl border transition-all ${showRightSidebar ? 'bg-accent/10 border-accent/30 text-accent shadow-lg shadow-accent/20' : 'bg-white/5 border-white/10 text-white/30'}`}>
          {showRightSidebar ? <IconChevronRight size={20} /> : <IconChevronLeft size={20} />}
        </button>
      </div>
    </header>
  )
}
