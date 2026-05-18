import {
  IconRadio,
  IconMenu2,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconStack2,
  IconRotate2,
  IconRotateClockwise2,
  IconCamera,
  IconCircle,
  IconRefresh,
  IconVideo,
  IconSquare,
  IconPlayerPlay,
  IconChevronRight,
  IconChevronLeft,
  IconPlus,
  IconLayoutGrid,
  IconKeyboard,
  IconSettings,
  IconBroadcast,
  IconScreenShare,
  IconActivity,
  IconChevronDown
} from '@tabler/icons-react'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

import { Select } from '../../../components/ui/Select'
import { PlatformLogo } from '../../../components/platforms/PlatformLogo'
import { Tooltip } from '../../../components/ui/Tooltip'

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
  virtualCameraInfo: any
  onToggleVirtualCamera: () => void
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
  onShowMultiView: () => void
  studioMode: boolean
  onToggleStudioMode: () => void
  onToggleHotkeys: () => void
  showHotkeys: boolean
  onOpenRecordingSettings: () => void
}

export function BroadcastHeader(props: BroadcastHeaderProps) {
  const {
    isStreaming, isRecording, recordingTime, showLeftSidebar, onToggleLeftSidebar,
    showRightSidebar, onToggleRightSidebar, broadcastLayoutMode, onLayoutModeChange,
    undo, redo, canUndo, canRedo, onTakeScreenshot, onStartRecording, onStopRecording,
    onForceRefreshMedia, monitors, selectedMonitorId, onSetSelectedMonitorId,
    onOpenProjector, obsStatus, onToggleObsVirtualCamera, virtualCameraInfo, onToggleVirtualCamera,
    platforms, layoutAssignments, onToggleLayoutAssignment, onRemoveLayoutAssignment,
    customRtmpUrl, onCustomRtmpUrlChange, customStreamKey, onCustomStreamKeyChange,
    onStartBroadcast, onStopBroadcast, studioMode, onToggleStudioMode, onShowMultiView,
    onToggleHotkeys, showHotkeys, onOpenRecordingSettings
  } = props

  const [showOutputsMenu, setShowOutputsMenu] = useState(false)
  const assignedStreamCount = layoutAssignments.horizontal.length + layoutAssignments.vertical.length

  return (
    <header className="relative z-[900] shrink-0 h-20 px-3 xl:px-4 2xl:px-6 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)_minmax(0,auto)] items-center gap-2 xl:gap-3 2xl:gap-4 overflow-visible border-b border-white/[0.04] bg-[#080808]/80 backdrop-blur-xl" style={{ WebkitAppRegion: 'drag' } as any}>
      {/* Workspace Group */}
      <div className="min-w-0 flex items-center gap-2 xl:gap-3 2xl:gap-4" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <div className="flex bg-white/5 rounded-2xl p-1 border border-white/10">
          <Tooltip content={showLeftSidebar ? "Hide Navigation" : "Show Navigation"} position="bottom">
            <button
              onClick={onToggleLeftSidebar}
              className={`p-2 rounded-xl transition-all ${showLeftSidebar ? 'bg-white/10 text-white' : 'text-white/20 hover:text-white'}`}
            >
              <IconMenu2 size={20} />
            </button>
          </Tooltip>
        </div>

        <div className="hidden xl:block h-8 w-px bg-white/5 mx-1" />

        <div className="min-w-0 flex bg-white/5 rounded-2xl p-1 border border-white/10">
          <Select
            value={broadcastLayoutMode}
            onChange={onLayoutModeChange}
            options={[
              { value: 'horizontal', label: 'Landscape', icon: <IconDeviceDesktop size={15} /> },
              { value: 'vertical', label: 'Portrait', icon: <IconDeviceMobile size={15} /> },
              { value: 'dual', label: 'Dual Mix', icon: <IconStack2 size={15} /> },
              { value: 'dual-horizontal', label: 'Dual Landscape', icon: <IconStack2 size={15} /> },
              { value: 'dual-portrait', label: 'Dual Vertical', icon: <IconStack2 size={15} className="rotate-90" /> }
            ]}
            className="w-28 2xl:w-36"
            buttonClassName="h-9 bg-transparent border-0 rounded-xl px-2 2xl:px-3 hover:bg-white/5 transition-all text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white"
          />
          <div className="w-px h-6 bg-white/5 mx-1 self-center" />
          <button
            onClick={onToggleStudioMode}
            className={`shrink-0 px-2 2xl:px-3 h-9 rounded-xl transition-all text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border ${studioMode ? 'bg-brand-gradient border-transparent text-white shadow-lg shadow-accent/20 shadow-glow' : 'text-white/30 border-transparent hover:text-white hover:bg-white/5'}`}
          >
            <div className={`w-2 h-2 rounded-full ${studioMode ? 'bg-white animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'bg-white/10'}`} />
            <span className="hidden 2xl:inline">Studio</span>
          </button>
        </div>
      </div>

      {/* Telemetry & Center Group */}
      <div className="justify-self-center min-w-0 max-w-full flex items-center gap-3 2xl:gap-8 py-2 px-3 2xl:px-6 bg-white/[0.02] border border-white/5 rounded-2xl 2xl:rounded-full backdrop-blur-md">
        <div className="min-w-0 flex items-center gap-3 2xl:gap-6">
          <div className="flex flex-col items-center">
            <span className="hidden 2xl:block text-[9px] font-black uppercase tracking-[0.2em] text-white/20 mb-1">Status</span>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-success animate-pulse' : isRecording ? 'bg-red-500 animate-pulse' : 'bg-white/10'}`} />
              <span className={`max-w-20 truncate text-[10px] 2xl:text-[11px] font-black uppercase tracking-widest ${isStreaming ? 'text-success' : isRecording ? 'text-red-400' : 'text-white/40'}`}>
                {isStreaming ? 'Streaming' : isRecording ? 'Recording' : 'Offline'}
              </span>
            </div>
          </div>

          <div className="w-px h-7 2xl:h-8 bg-white/5" />

          <div className="flex flex-col items-center">
            <span className="hidden 2xl:block text-[9px] font-black uppercase tracking-[0.2em] text-white/20 mb-1">Session</span>
            <span className="text-[10px] 2xl:text-[11px] font-mono font-bold text-white/80 tabular-nums">
              {isRecording || isStreaming ? recordingTime : '00:00:00'}
            </span>
          </div>

          <div className="hidden 2xl:block w-px h-8 bg-white/5" />

          <div className="hidden 2xl:flex flex-col items-center">
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20 mb-1">Health</span>
            <div className="flex items-center gap-1.5">
              <IconActivity size={12} className="text-accent/60" />
              <span className="text-[11px] font-bold text-white/60">Stable</span>
            </div>
          </div>
        </div>
      </div>

      {/* Control Room Group */}
      <div className="justify-self-end min-w-0 flex items-center gap-2 2xl:gap-3" style={{ WebkitAppRegion: 'no-drag' } as any}>
        {/* Production Tools */}
        <div className="hidden 2xl:flex bg-white/5 rounded-2xl p-1 border border-white/10">
          <Tooltip content="Undo (Ctrl+Z)" position="bottom">
            <button onClick={undo} disabled={!canUndo} className="p-2.5 rounded-lg text-white/20 hover:text-white disabled:opacity-5 transition-all"><IconRotate2 size={18} /></button>
          </Tooltip>
          <Tooltip content="Redo (Ctrl+Y)" position="bottom">
            <button onClick={redo} disabled={!canRedo} className="p-2.5 rounded-lg text-white/20 hover:text-white disabled:opacity-5 transition-all"><IconRotateClockwise2 size={18} /></button>
          </Tooltip>
          <div className="w-px h-6 bg-white/5 mx-1 self-center" />
          <Tooltip content="Screenshot" position="bottom">
            <button onClick={onTakeScreenshot} className="p-2.5 rounded-lg text-white/20 hover:text-white hover:bg-white/5 transition-all">
              <IconCamera size={18} />
            </button>
          </Tooltip>
          <Tooltip content="Reset Media Engine" position="bottom">
            <button onClick={onForceRefreshMedia} className="p-2.5 rounded-lg text-white/20 hover:text-white hover:bg-white/5 transition-all">
              <IconRefresh size={18} />
            </button>
          </Tooltip>
        </div>

        {/* Outputs Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowOutputsMenu(!showOutputsMenu)}
            className={`h-10 2xl:h-11 px-3 2xl:px-4 rounded-2xl border transition-all flex items-center gap-2 2xl:gap-3 text-[10px] font-black uppercase tracking-widest ${showOutputsMenu ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'}`}
          >
            <IconScreenShare size={18} />
            <span className="hidden 2xl:inline">Outputs</span>
            <IconChevronDown size={14} className={`transition-transform duration-300 ${showOutputsMenu ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {showOutputsMenu && (
              <>
                <div className="fixed inset-0 z-[600]" onClick={() => setShowOutputsMenu(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-3 w-72 bg-[#0c0c0e] border border-white/10 rounded-3xl shadow-2xl p-4 flex flex-col gap-2 z-[700] backdrop-blur-2xl"
                >
                  <div className="px-3 pb-3 border-b border-white/5 mb-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/20">External Projections</p>
                  </div>

                  <div className="space-y-1">
                    <button
                      onClick={() => { onOpenProjector(); setShowOutputsMenu(false); }}
                      className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-all text-left group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-white/5 text-white/40 group-hover:text-accent transition-colors">
                          <IconDeviceDesktop size={16} />
                        </div>
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-tight text-white/80">Fullscreen Projector</p>
                          <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Monitor Output</p>
                        </div>
                      </div>
                    </button>

                    <button
                      onClick={() => { onToggleVirtualCamera(); setShowOutputsMenu(false); }}
                      disabled={virtualCameraInfo?.state === 'unsupported'}
                      className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-all text-left group"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg transition-colors ${virtualCameraInfo?.state === 'active' ? 'bg-accent/20 text-accent' : 'bg-white/5 text-white/40 group-hover:text-accent'}`}>
                          <IconVideo size={16} />
                        </div>
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-tight text-white/80">ilyStream Virtual Cam</p>
                          <p className={`text-[9px] font-bold uppercase tracking-widest ${virtualCameraInfo?.state === 'active' ? 'text-accent' : 'text-white/20'}`}>
                            {virtualCameraInfo?.state === 'active' ? 'Streaming' : 'Ready'}
                          </p>
                        </div>
                      </div>
                      {virtualCameraInfo?.state === 'active' && <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />}
                    </button>

                    <button
                      onClick={() => { onToggleObsVirtualCamera(); setShowOutputsMenu(false); }}
                      disabled={!obsStatus?.connected}
                      className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-all text-left group disabled:opacity-20"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg transition-colors ${obsStatus?.virtualCameraActive ? 'bg-success/20 text-success' : 'bg-white/5 text-white/40 group-hover:text-success'}`}>
                          <IconVideo size={16} />
                        </div>
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-tight text-white/80">OBS Virtual Camera</p>
                          <p className={`text-[9px] font-bold uppercase tracking-widest ${obsStatus?.virtualCameraActive ? 'text-success' : 'text-white/20'}`}>
                            {obsStatus?.virtualCameraActive ? 'Active' : 'Connected'}
                          </p>
                        </div>
                      </div>
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Stream Block */}
        <div className="min-w-0 flex bg-white/5 rounded-2xl p-1 border border-white/10">
          <Select
            value={platforms.find(p => layoutAssignments.horizontal.includes(p.id) || layoutAssignments.vertical.includes(p.id))?.id || (customRtmpUrl ? 'custom' : '')}
            onChange={(val) => {
              platforms.forEach(p => {
                if (layoutAssignments.horizontal.includes(p.id)) onRemoveLayoutAssignment('horizontal', p.id)
                if (layoutAssignments.vertical.includes(p.id)) onRemoveLayoutAssignment('vertical', p.id)
              })
              if (val === 'custom') {
                if (!customRtmpUrl) onCustomRtmpUrlChange('rtmp://')
              } else {
                onCustomRtmpUrlChange(''); onCustomStreamKeyChange('')
                const isVertical = broadcastLayoutMode === 'vertical' || broadcastLayoutMode === 'dual-portrait'
                onToggleLayoutAssignment(isVertical ? 'vertical' : 'horizontal', val)
              }
            }}
            options={[
              ...platforms.map(p => ({ value: p.id, label: p.name, icon: <PlatformLogo platform={p.id} size={14} /> })),
              { value: 'custom', label: 'Custom RTMP', icon: <IconPlus size={14} /> }
            ]}
            className="w-32 2xl:w-44"
            buttonClassName="h-10 2xl:h-11 bg-transparent border-0 px-2 2xl:px-4 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white transition-all"
            placeholder="Destination"
          />

          <div className="w-px h-7 2xl:h-8 bg-white/10 mx-1 self-center" />

          {isStreaming ? (
            <button
              onClick={onStopBroadcast}
              className="h-10 2xl:h-11 px-4 2xl:px-6 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/30 transition-all flex items-center gap-2 2xl:gap-3"
            >
              <IconSquare size={12} className="fill-current" /> Stop
            </button>
          ) : (
            <button
              onClick={onStartBroadcast}
              disabled={assignedStreamCount === 0 && (!customRtmpUrl.trim() || !customStreamKey.trim())}
              className="h-10 2xl:h-11 px-4 2xl:px-8 rounded-xl bg-brand-gradient text-white text-[10px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all flex items-center gap-2 2xl:gap-3 shadow-lg shadow-accent/20 disabled:opacity-20 disabled:cursor-not-allowed shadow-glow"
            >
              <IconBroadcast size={16} /> Go Live
            </button>
          )}
        </div>

        <button
          onClick={onToggleRightSidebar}
          className={`p-2.5 2xl:p-3 rounded-2xl border transition-all ${showRightSidebar ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/10 text-white/30 hover:text-white'}`}
        >
          {showRightSidebar ? <IconChevronRight size={20} /> : <IconChevronLeft size={20} />}
        </button>
      </div>
    </header>
  )
}
