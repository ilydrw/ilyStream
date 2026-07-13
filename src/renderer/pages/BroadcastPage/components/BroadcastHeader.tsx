import { IconRadio, IconMenu2, IconDeviceDesktop, IconDeviceMobile, IconStack2, IconRotate2, IconRotateClockwise2, IconCamera, IconCircle, IconVideo, IconSquare, IconLayoutGrid, IconKeyboard, IconSettings, IconBroadcast, IconScreenShare, IconActivity, IconSparkles } from '@tabler/icons-react'
import { IconRefresh, IconPlayerPlay, IconChevronRight, IconChevronLeft, IconPlus, IconChevronDown, IconDeviceFloppy } from '../../../components/ui/icons'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

import { Select } from '../../../components/ui/Select'
import { PlatformLogo } from '../../../components/platforms/PlatformLogo'
import { Tooltip } from '../../../components/ui/Tooltip'
import type { VirtualCameraFeedConfig, VirtualCameraFeedMode, VirtualCameraSourceFitMode, VirtualCameraSourceOption } from './CanvasEditor.types'

interface BroadcastHeaderProps {
  isStreaming: boolean
  isRecording: boolean
  recordingTime: string
  status: string
  /** Per-destination health from the streaming heartbeat (reconnecting/degraded). */
  outputHealth?: Array<{ id: string; name: string; state: string; degraded: boolean }>
  showLeftSidebar: boolean
  onToggleLeftSidebar: () => void
  showRightSidebar: boolean
  onToggleRightSidebar: () => void
  broadcastLayoutMode: any
  onLayoutModeChange: (mode: string) => void
  onApplyTikTokPreset: () => void
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
  virtualCameraFeed: VirtualCameraFeedConfig
  onVirtualCameraFeedChange: (feed: VirtualCameraFeedConfig) => void
  virtualCameraSourceOptions: VirtualCameraSourceOption[]
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
    onApplyTikTokPreset,
    undo, redo, canUndo, canRedo, onTakeScreenshot, onStartRecording, onStopRecording,
    onForceRefreshMedia, monitors, selectedMonitorId, onSetSelectedMonitorId,
    onOpenProjector, obsStatus, onToggleObsVirtualCamera, virtualCameraInfo, onToggleVirtualCamera,
    virtualCameraFeed, onVirtualCameraFeedChange, virtualCameraSourceOptions,
    platforms, layoutAssignments, onToggleLayoutAssignment, onRemoveLayoutAssignment,
    customRtmpUrl, onCustomRtmpUrlChange, customStreamKey, onCustomStreamKeyChange,
    onStartBroadcast, onStopBroadcast, studioMode, onToggleStudioMode, onShowMultiView,
    onToggleHotkeys, showHotkeys, onOpenRecordingSettings
  } = props

  const [showOutputsMenu, setShowOutputsMenu] = useState(false)
  const assignedStreamCount = layoutAssignments.horizontal.length + layoutAssignments.vertical.length
  const selectedVirtualCameraSource = virtualCameraSourceOptions.find(option => option.id === virtualCameraFeed.sourceLayerId)
  const virtualCameraSourceSelectOptions = virtualCameraSourceOptions.map(option => ({
    value: option.id,
    label: option.name,
    icon: <IconVideo size={14} />
  }))
  const virtualCameraLoading = !virtualCameraInfo
  const virtualCameraStarting = virtualCameraInfo?.state === 'starting'
  const virtualCameraInstallAvailable = Boolean(virtualCameraInfo?.canInstallDriver)
  const virtualCameraDisabled =
    virtualCameraLoading ||
    virtualCameraStarting ||
    ((virtualCameraInfo?.state === 'unsupported' || virtualCameraInfo?.canStart === false) && !virtualCameraInstallAvailable)
  const virtualCameraLabel =
    virtualCameraLoading ? 'Checking' :
    virtualCameraInfo?.state === 'active' ? 'Streaming' :
    virtualCameraStarting ? 'Starting' :
    virtualCameraInstallAvailable ? 'Install driver' :
    virtualCameraDisabled ? 'Driver needed' :
    virtualCameraInfo?.state === 'error' ? 'Error' :
    'Ready'
  const virtualCameraTooltip =
    virtualCameraLoading ? 'Checking ilyStream Virtual Camera status' :
    virtualCameraStarting ? 'Starting ilyStream Virtual Camera' :
    virtualCameraInstallAvailable ? (virtualCameraInfo?.installDriverHint || 'Install ilyStream Virtual Camera') :
    virtualCameraDisabled ? (virtualCameraInfo?.driverHint || virtualCameraInfo?.lastError || 'Virtual camera unavailable') :
    virtualCameraInfo?.state === 'active' ? 'Stop ilyStream Virtual Camera' :
    'Start ilyStream Virtual Camera'
  const updateVirtualCameraFeedMode = (mode: VirtualCameraFeedMode) => {
    onVirtualCameraFeedChange({
      ...virtualCameraFeed,
      mode,
      sourceLayerId: mode === 'source'
        ? virtualCameraFeed.sourceLayerId || virtualCameraSourceOptions[0]?.id
        : virtualCameraFeed.sourceLayerId
    })
  }
  const updateVirtualCameraSourceFitMode = (sourceFitMode: VirtualCameraSourceFitMode) => {
    onVirtualCameraFeedChange({ ...virtualCameraFeed, sourceFitMode })
  }

  return (
    <header className="relative z-[900] shrink-0 h-16 px-3 xl:px-4 2xl:px-6 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)_minmax(0,auto)] items-center gap-2 xl:gap-3 2xl:gap-4 overflow-visible border-b border-white/[0.05] bg-[#0E1014]" style={{ WebkitAppRegion: 'drag' } as any}>
      {/* Workspace Group */}
      <div className="min-w-0 flex items-center gap-2 xl:gap-3 2xl:gap-4" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <div className="flex bg-transparent rounded-md p-0.5 border border-white/[0.05]">
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

        <div className="min-w-0 flex bg-transparent rounded-md p-0.5 border border-white/[0.05]">
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
            buttonClassName="h-9 bg-transparent border-0 rounded-xl px-2 2xl:px-3 hover:bg-white/5 transition-all text-[12px] font-medium tracking-tight text-white/40 hover:text-white"
          />
          <div className="w-px h-6 bg-white/5 mx-1 self-center" />
          <button
            onClick={onToggleStudioMode}
            className={`shrink-0 px-2 2xl:px-3 h-9 rounded-md transition-colors text-[13px] font-medium tracking-tight flex items-center gap-2 ${studioMode ? 'bg-accent/15 text-accent' : 'text-white/55 hover:text-white hover:bg-white/[0.03]'}`}
          >
            <div className={`w-2 h-2 rounded-full ${studioMode ? 'bg-accent animate-pulse' : 'bg-white/10'}`} />
            <span className="hidden 2xl:inline">Studio</span>
          </button>
          <Tooltip content="Apply TikTok overlay kit" position="bottom">
            <button
              onClick={onApplyTikTokPreset}
              className="shrink-0 h-9 w-9 rounded-xl text-white/30 hover:text-white hover:bg-white/5 transition-all flex items-center justify-center"
            >
              <IconSparkles size={16} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Telemetry & Center Group */}
      <div className="justify-self-center min-w-0 max-w-full flex items-center gap-3 2xl:gap-8 py-2 px-3 2xl:px-6 bg-white/[0.02] border border-white/5 rounded-md 2xl:rounded-full">
        <div className="min-w-0 flex items-center gap-3 2xl:gap-6">
          <div className="flex flex-col items-center">
            <span className="hidden 2xl:block text-[11px] font-medium tracking-normal text-white/20 mb-1">Status</span>
            {(() => {
              const reconnecting = isStreaming ? (props.outputHealth ?? []).filter(o => o.state === 'reconnecting') : []
              const dropping = isStreaming ? (props.outputHealth ?? []).filter(o => o.state === 'live' && o.degraded) : []
              const unhealthy = reconnecting.length > 0 || dropping.length > 0
              const label = reconnecting.length > 0
                ? 'Reconnecting'
                : dropping.length > 0
                  ? 'Dropping frames'
                  : isStreaming ? 'Streaming' : isRecording ? 'Recording' : 'Offline'
              const detail = [...reconnecting, ...dropping].map(o => o.name).join(', ')
              const dotClass = reconnecting.length > 0
                ? 'bg-red-500 animate-pulse'
                : dropping.length > 0
                  ? 'bg-warning animate-pulse'
                  : isStreaming ? 'bg-success animate-pulse' : isRecording ? 'bg-red-500 animate-pulse' : 'bg-white/10'
              const textClass = reconnecting.length > 0
                ? 'text-red-400'
                : dropping.length > 0
                  ? 'text-warning'
                  : isStreaming ? 'text-success' : isRecording ? 'text-red-400' : 'text-white/40'

              const statusBody = (
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${dotClass}`} />
                  <span className={`max-w-24 truncate text-[10px] 2xl:text-[11px] font-semibold tracking-tight ${textClass}`}>
                    {label}
                  </span>
                </div>
              )

              return unhealthy ? (
                <Tooltip content={`${label}: ${detail}`} position="bottom">{statusBody}</Tooltip>
              ) : statusBody
            })()}
          </div>

          <div className="w-px h-7 2xl:h-8 bg-white/5" />

          <div className="flex flex-col items-center">
            <span className="hidden 2xl:block text-[11px] font-medium tracking-normal text-white/20 mb-1">Session</span>
            <span className="text-[10px] 2xl:text-[11px] font-mono font-semibold text-white/80 tabular-nums">
              {isRecording || isStreaming ? recordingTime : '00:00:00'}
            </span>
          </div>

          <div className="hidden 2xl:block w-px h-8 bg-white/5" />

          <div className="hidden 2xl:flex flex-col items-center">
            <span className="text-[11px] font-medium tracking-normal text-white/20 mb-1">Health</span>
            <div className="flex items-center gap-1.5">
              <IconActivity size={12} className="text-accent/60" />
              <span className="text-[11px] font-semibold text-white/60">Stable</span>
            </div>
          </div>
        </div>
      </div>

      {/* Control Room Group */}
      <div className="justify-self-end min-w-0 flex items-center gap-2 2xl:gap-3" style={{ WebkitAppRegion: 'no-drag' } as any}>
        {/* Production Tools */}
        <div className="hidden 2xl:flex bg-transparent rounded-md p-0.5 border border-white/[0.05]">
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
          <div className="w-px h-6 bg-white/5 mx-1 self-center" />
          <Tooltip content={isRecording ? 'Stop Recording' : 'Start Recording'} position="bottom">
            <button
              onClick={isRecording ? onStopRecording : onStartRecording}
              className={`p-2.5 rounded-lg transition-all ${isRecording ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25' : 'text-white/25 hover:text-white hover:bg-white/5'}`}
            >
              <IconDeviceFloppy size={18} />
            </button>
          </Tooltip>
          <Tooltip content="Recording Settings" position="bottom">
            <button onClick={onOpenRecordingSettings} className="p-2.5 rounded-lg text-white/20 hover:text-white hover:bg-white/5 transition-all">
              <IconSettings size={18} />
            </button>
          </Tooltip>
        </div>

        <Tooltip content="Keyboard shortcuts" position="bottom">
          <button
            type="button"
            onClick={onToggleHotkeys}
            aria-label="Keyboard shortcuts"
            aria-pressed={showHotkeys}
            className={`h-10 w-10 2xl:h-11 2xl:w-11 shrink-0 rounded-md border transition-all flex items-center justify-center ${showHotkeys ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/10 text-white/30 hover:text-white hover:bg-white/10'}`}
          >
            <IconKeyboard size={18} />
          </button>
        </Tooltip>

        {/* Virtual Camera quick toggle (OBS-style) */}
        <Tooltip
          content={virtualCameraTooltip}
          position="bottom"
        >
          <button
            onClick={onToggleVirtualCamera}
            disabled={virtualCameraDisabled}
            className={`h-10 2xl:h-11 px-3 2xl:px-4 rounded-md border transition-all flex items-center gap-2 text-[12px] font-medium tracking-tight disabled:opacity-20 disabled:cursor-not-allowed ${ virtualCameraInfo?.state === 'active' ? 'bg-accent/20 border-accent/40 text-accent ' : virtualCameraLoading || virtualCameraStarting ? 'bg-white/10 border-white/20 text-white/80' : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10' }`}
          >
            <IconVideo size={18} />
            <span className="hidden xl:inline">
              {virtualCameraInfo?.state === 'active' ? 'Cam Live' : virtualCameraInstallAvailable ? 'Install Cam' : virtualCameraLoading ? 'Checking' : 'Cam'}
            </span>
            {virtualCameraInfo?.state === 'active' && <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />}
            {(virtualCameraLoading || virtualCameraStarting) && <div className="w-2 h-2 rounded-full bg-white/50 animate-pulse" />}
          </button>
        </Tooltip>

        {/* Outputs Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowOutputsMenu(!showOutputsMenu)}
            className={`h-10 2xl:h-11 px-3 2xl:px-4 rounded-md border transition-all flex items-center gap-2 2xl:gap-3 text-[12px] font-medium tracking-tight ${showOutputsMenu ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'}`}
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
                  className="absolute right-0 mt-3 w-72 bg-[#0c0c0e] border border-white/10 rounded-lg shadow-2xl p-4 flex flex-col gap-2 z-[700]"
                >
                  <div className="px-3 pb-3 border-b border-white/5 mb-2">
                    <p className="text-[12px] font-medium tracking-tight text-white/20">External Projections</p>
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
                          <p className="text-[13px] font-semibold tracking-tight text-white/80">Fullscreen Projector</p>
                          <p className="text-[9px] font-semibold text-white/20 tracking-tight">Monitor Output</p>
                        </div>
                      </div>
                    </button>

                    <button
                      onClick={() => { onToggleVirtualCamera(); setShowOutputsMenu(false); }}
                      disabled={virtualCameraDisabled}
                      title={virtualCameraTooltip}
                      className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-all text-left group disabled:opacity-20"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg transition-colors ${virtualCameraInfo?.state === 'active' ? 'bg-accent/20 text-accent' : 'bg-white/5 text-white/40 group-hover:text-accent'}`}>
                          <IconVideo size={16} />
                        </div>
                        <div>
                          <p className="text-[13px] font-semibold tracking-tight text-white/80">ilyStream Virtual Cam</p>
                          <p className={`text-[11px] font-normal tracking-normal ${virtualCameraInfo?.state === 'active' ? 'text-accent' : 'text-white/20'}`}>
                            {virtualCameraLabel}
                          </p>
                        </div>
                      </div>
                      {virtualCameraInfo?.state === 'active' && <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />}
                      {(virtualCameraLoading || virtualCameraStarting) && <div className="w-2 h-2 rounded-full bg-white/50 animate-pulse" />}
                    </button>

                    <div className="p-3 rounded-md bg-white/[0.025] border border-white/5 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <IconLayoutGrid size={14} className="text-white/30 shrink-0" />
                          <span className="text-[12px] font-medium tracking-tight text-white/30">Virtual Cam Feed</span>
                        </div>
                        <span className="max-w-[104px] truncate text-[11px] font-normal tracking-normal text-accent/80">
                          {virtualCameraFeed.mode === 'source' ? selectedVirtualCameraSource?.name || 'Source' : 'Layout'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-black/30 border border-white/5">
                        <button
                          type="button"
                          onClick={() => updateVirtualCameraFeedMode('layout')}
                          className={`h-8 rounded-lg text-[11px] font-medium tracking-normal transition-all flex items-center justify-center gap-1.5 ${ virtualCameraFeed.mode === 'layout' ? 'bg-white/10 text-white shadow-sm' : 'text-white/30 hover:text-white hover:bg-white/5' }`}
                        >
                          <IconLayoutGrid size={13} /> Layout
                        </button>
                        <button
                          type="button"
                          onClick={() => updateVirtualCameraFeedMode('source')}
                          disabled={virtualCameraSourceOptions.length === 0}
                          className={`h-8 rounded-lg text-[11px] font-medium tracking-normal transition-all flex items-center justify-center gap-1.5 disabled:opacity-20 disabled:cursor-not-allowed ${ virtualCameraFeed.mode === 'source' ? 'bg-white/10 text-white shadow-sm' : 'text-white/30 hover:text-white hover:bg-white/5' }`}
                        >
                          <IconVideo size={13} /> Source
                        </button>
                      </div>

                      {virtualCameraFeed.mode === 'source' ? (
                        <div className="space-y-2">
                          <Select
                            value={selectedVirtualCameraSource?.id || ''}
                            onChange={(sourceLayerId) => onVirtualCameraFeedChange({ ...virtualCameraFeed, mode: 'source', sourceLayerId })}
                            options={virtualCameraSourceSelectOptions}
                            placeholder="Choose source"
                            className="w-full"
                            buttonClassName="h-9 bg-white/[0.03] border border-white/[0.05] rounded-md px-3 text-[12px] font-medium tracking-tight text-white/55 hover:text-white"
                            maxListHeight={220}
                          />
                          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-black/30 border border-white/5">
                            {[
                              { value: 'contain' as const, label: 'Fit' },
                              { value: 'cover' as const, label: 'Crop' },
                              { value: 'stretch' as const, label: 'Fill' }
                            ].map(option => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => updateVirtualCameraSourceFitMode(option.value)}
                                className={`h-8 rounded-lg text-[11px] font-medium tracking-normal transition-all ${ virtualCameraFeed.sourceFitMode === option.value ? 'bg-white/10 text-white shadow-sm' : 'text-white/30 hover:text-white hover:bg-white/5' }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <Select
                          value={virtualCameraFeed.layout}
                          onChange={(layout) => onVirtualCameraFeedChange({ ...virtualCameraFeed, mode: 'layout', layout: layout as VirtualCameraFeedConfig['layout'] })}
                          options={[
                            { value: 'current', label: 'Current Canvas', icon: <IconLayoutGrid size={14} /> },
                            { value: 'landscape', label: 'Landscape', icon: <IconDeviceDesktop size={14} /> },
                            { value: 'portrait', label: 'Portrait', icon: <IconDeviceMobile size={14} /> }
                          ]}
                          className="w-full"
                          buttonClassName="h-9 bg-white/[0.03] border border-white/[0.05] rounded-md px-3 text-[12px] font-medium tracking-tight text-white/55 hover:text-white"
                        />
                      )}
                    </div>

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
                          <p className="text-[13px] font-semibold tracking-tight text-white/80">OBS Virtual Camera</p>
                          <p className={`text-[11px] font-normal tracking-normal ${obsStatus?.virtualCameraActive ? 'text-success' : 'text-white/20'}`}>
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
        <div className="min-w-0 flex bg-transparent rounded-md p-0.5 border border-white/[0.05]">
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
            buttonClassName="h-10 2xl:h-11 bg-transparent border-0 px-2 2xl:px-4 text-[12px] font-medium tracking-tight text-white/60 hover:text-white transition-all"
            placeholder="Destination"
          />

          <div className="w-px h-7 2xl:h-8 bg-white/10 mx-1 self-center" />

          {isStreaming ? (
            // `.app-button-live` matches the design's "On Air" treatment:
            // solid red surface with white text, inset hairline highlight,
            // colored outer glow, and a pulsing white dot baked in via ::before.
            // Sized via --h-button (30px) to align with the rest of the
            // Pro Console primitives in this header.
            <button
              onClick={onStopBroadcast}
              className="app-button-live"
              title="End the live broadcast"
            >
              <IconSquare size={12} className="fill-current" /> Stop
            </button>
          ) : (
            // `.app-button-primary` carries the brand gradient + cyan glow.
            // Replaces the previous flat-cyan inline styling so Go Live matches
            // the design system's primary CTA pattern (also used on Dashboard).
            <button
              onClick={onStartBroadcast}
              disabled={assignedStreamCount === 0 && (!customRtmpUrl.trim() || !customStreamKey.trim())}
              className="app-button-primary"
              title="Start the live broadcast"
            >
              <IconBroadcast size={14} /> Go live
            </button>
          )}
        </div>

        <button
          onClick={onToggleRightSidebar}
          className={`p-2.5 2xl:p-3 rounded-md border transition-all ${showRightSidebar ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/10 text-white/30 hover:text-white'}`}
        >
          {showRightSidebar ? <IconChevronRight size={20} /> : <IconChevronLeft size={20} />}
        </button>
      </div>
    </header>
  )
}
