import { IconMenu2, IconDeviceDesktop, IconDeviceMobile, IconStack2, IconRotate2, IconRotateClockwise2, IconCamera, IconVideo, IconSquare, IconLayoutGrid, IconKeyboard, IconSettings, IconBroadcast, IconScreenShare, IconSparkles, IconChecklist } from '@tabler/icons-react'
import { IconRefresh, IconChevronRight, IconChevronLeft, IconPlus, IconChevronDown, IconDeviceFloppy, IconPencil } from '../../../components/ui/icons'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

import { Select } from '../../../components/ui/Select'
import { PlatformLogo } from '../../../components/platforms/PlatformLogo'
import { Tooltip } from '../../../components/ui/Tooltip'
import type { VirtualCameraFeedConfig, VirtualCameraFeedMode, VirtualCameraSourceFitMode, VirtualCameraSourceOption } from './CanvasEditor.types'
import { LiveReadinessPanel } from './LiveReadinessPanel'
import type { LiveReadinessIncident, LiveReadinessReport } from '../utils/live-readiness'

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
  streamInfoTitle: string
  onOpenStreamInfo: () => void
  onStartBroadcast: () => void
  onStopBroadcast: () => void
  onShowMultiView: () => void
  studioMode: boolean
  studioModeToggleDisabled?: boolean
  onToggleStudioMode: () => void
  onToggleHotkeys: () => void
  showHotkeys: boolean
  onOpenRecordingSettings: () => void
  readinessReport: LiveReadinessReport
  readinessRefreshing: boolean
  streamIncidents: LiveReadinessIncident[]
  onRefreshReadiness: () => void
  onCopyReadinessDiagnostic: () => void
}

export function BroadcastHeader(props: BroadcastHeaderProps) {
  const {
    isStreaming, isRecording, recordingTime, showLeftSidebar, onToggleLeftSidebar,
    showRightSidebar, onToggleRightSidebar, broadcastLayoutMode, onLayoutModeChange,
    onApplyTikTokPreset,
    undo, redo, canUndo, canRedo, onTakeScreenshot, onStartRecording, onStopRecording,
    onForceRefreshMedia,
    onOpenProjector, obsStatus, onToggleObsVirtualCamera, virtualCameraInfo, onToggleVirtualCamera,
    virtualCameraFeed, onVirtualCameraFeedChange, virtualCameraSourceOptions,
    platforms, layoutAssignments, onToggleLayoutAssignment, onRemoveLayoutAssignment,
    customRtmpUrl, onCustomRtmpUrlChange, customStreamKey, onCustomStreamKeyChange,
    streamInfoTitle, onOpenStreamInfo,
    onStartBroadcast, onStopBroadcast, studioMode, studioModeToggleDisabled = false, onToggleStudioMode,
    onToggleHotkeys, showHotkeys, onOpenRecordingSettings,
    readinessReport, readinessRefreshing, streamIncidents, onRefreshReadiness, onCopyReadinessDiagnostic
  } = props

  const [showOutputsMenu, setShowOutputsMenu] = useState(false)
  const [showReadiness, setShowReadiness] = useState(false)
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
  const reconnectingOutputs = isStreaming
    ? (props.outputHealth ?? []).filter(output => output.state === 'reconnecting')
    : []
  const startingOutputs = isStreaming
    ? (props.outputHealth ?? []).filter(output => output.state === 'starting')
    : []
  const degradedOutputs = isStreaming
    ? (props.outputHealth ?? []).filter(output => output.state === 'live' && output.degraded)
    : []
  const unhealthyOutputs = [...reconnectingOutputs, ...degradedOutputs]
  const sessionLabel = reconnectingOutputs.length > 0
    ? 'Reconnecting'
    : startingOutputs.length > 0 || (isStreaming && (props.outputHealth ?? []).length === 0)
      ? 'Starting'
    : degradedOutputs.length > 0
      ? 'Dropping frames'
      : isStreaming
        ? 'Live'
        : isRecording
          ? 'Recording'
          : 'Offline'
  const sessionTone = reconnectingOutputs.length > 0
    ? 'is-danger'
    : degradedOutputs.length > 0
      ? 'is-warning'
      : isStreaming
        ? 'is-live'
        : isRecording
          ? 'is-recording'
          : 'is-offline'
  const sessionStatus = (
    <div className={`broadcast-header-session-status ${sessionTone}`}>
      <span className="broadcast-header-session-dot" />
      <span>{sessionLabel}</span>
    </div>
  )
  const readinessLabel = readinessReport.blockerCount > 0
    ? `${readinessReport.blockerCount} blocked`
    : readinessReport.warningCount > 0 || readinessReport.checkingCount > 0
      ? 'Check'
      : 'Ready'
  const readinessTooltip = readinessReport.blockerCount > 0
    ? `${readinessReport.blockerCount} required live-readiness check${readinessReport.blockerCount === 1 ? '' : 's'} failed`
    : readinessReport.warningCount > 0 || readinessReport.checkingCount > 0
      ? 'Review live-readiness warnings'
      : 'Live readiness checks passed'
  const attemptStartBroadcast = () => {
    if (readinessReport.blockerCount > 0) {
      setShowReadiness(true)
      setShowOutputsMenu(false)
      onRefreshReadiness()
      return
    }
    onStartBroadcast()
  }

  return (
    <header className="broadcast-header" style={{ WebkitAppRegion: 'drag' } as any}>
      {/* Workspace Group */}
      <div className="broadcast-header-workspace" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <div className="broadcast-header-segment is-compact">
          <Tooltip content={showLeftSidebar ? "Hide Navigation" : "Show Navigation"} position="bottom">
            <button
              onClick={onToggleLeftSidebar}
              className={`broadcast-header-icon-button ${showLeftSidebar ? 'is-active' : ''}`}
            >
              <IconMenu2 size={20} />
            </button>
          </Tooltip>
        </div>

        <div className="broadcast-header-segment min-w-0">
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
            buttonClassName="broadcast-header-select-button"
          />
          <div className="broadcast-header-divider" />
          <button
            onClick={onToggleStudioMode}
            disabled={studioModeToggleDisabled}
            title={studioModeToggleDisabled ? 'Stop streaming and recording before changing Studio Mode' : 'Toggle Studio Mode'}
            className={`broadcast-header-text-button ${studioMode ? 'is-active' : ''}`}
          >
            <span className="broadcast-header-mode-dot" />
            <span className="hidden 2xl:inline">Studio</span>
          </button>
          <Tooltip content="Apply TikTok overlay kit" position="bottom">
            <button
              onClick={onApplyTikTokPreset}
              className="broadcast-header-icon-button"
            >
              <IconSparkles size={16} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Telemetry & Center Group */}
      <div className="broadcast-header-session">
        {unhealthyOutputs.length > 0 ? (
          <Tooltip content={`${sessionLabel}: ${unhealthyOutputs.map(output => output.name).join(', ')}`} position="bottom">
            {sessionStatus}
          </Tooltip>
        ) : sessionStatus}
        <div className="broadcast-header-divider" />
        <span className="broadcast-header-session-time">
          {isRecording || isStreaming ? recordingTime : '00:00:00'}
        </span>
      </div>

      {/* Control Room Group */}
      <div className="broadcast-header-controls" style={{ WebkitAppRegion: 'no-drag' } as any}>
        {/* Production Tools */}
        <div className="broadcast-header-tools hidden 2xl:flex">
          <Tooltip content="Undo (Ctrl+Z)" position="bottom">
            <button onClick={undo} disabled={!canUndo} className="broadcast-header-tool-button"><IconRotate2 size={17} /></button>
          </Tooltip>
          <Tooltip content="Redo (Ctrl+Y)" position="bottom">
            <button onClick={redo} disabled={!canRedo} className="broadcast-header-tool-button"><IconRotateClockwise2 size={17} /></button>
          </Tooltip>
          <div className="broadcast-header-divider" />
          <Tooltip content="Screenshot" position="bottom">
            <button onClick={onTakeScreenshot} className="broadcast-header-tool-button">
              <IconCamera size={17} />
            </button>
          </Tooltip>
          <Tooltip content="Reset Media Engine" position="bottom">
            <button onClick={onForceRefreshMedia} className="broadcast-header-tool-button">
              <IconRefresh size={17} />
            </button>
          </Tooltip>
          <div className="broadcast-header-divider" />
          <Tooltip content={isRecording ? 'Stop Recording' : 'Start Recording'} position="bottom">
            <button
              onClick={isRecording ? onStopRecording : onStartRecording}
              className={`broadcast-header-tool-button ${isRecording ? 'is-recording' : ''}`}
            >
              <IconDeviceFloppy size={17} />
            </button>
          </Tooltip>
          <Tooltip content="Recording Settings" position="bottom">
            <button onClick={onOpenRecordingSettings} className="broadcast-header-tool-button">
              <IconSettings size={17} />
            </button>
          </Tooltip>
        </div>

        <div className="relative">
          <Tooltip content={readinessTooltip} position="bottom">
            <button
              type="button"
              onClick={() => {
                const next = !showReadiness
                setShowReadiness(next)
                if (next) {
                  setShowOutputsMenu(false)
                  onRefreshReadiness()
                }
              }}
              aria-label="Live readiness"
              aria-expanded={showReadiness}
              className={`broadcast-header-action ${showReadiness ? 'is-active' : ''}`}
            >
              <IconChecklist size={18} />
              <span className="hidden 2xl:inline">{readinessLabel}</span>
              <span
                className={`h-2 w-2 rounded-sm ${
                  readinessReport.tone === 'ready'
                    ? 'bg-emerald-400'
                    : readinessReport.tone === 'blocked'
                      ? 'bg-red-400'
                      : 'bg-amber-400'
                }`}
              />
            </button>
          </Tooltip>

          <AnimatePresence>
            {showReadiness && (
              <>
                <motion.button
                  type="button"
                  aria-label="Close live readiness"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[610] cursor-default bg-transparent"
                  onClick={() => setShowReadiness(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                >
                  <LiveReadinessPanel
                    report={readinessReport}
                    refreshing={readinessRefreshing}
                    incidents={streamIncidents}
                    onRefresh={onRefreshReadiness}
                    onCopyDiagnostic={onCopyReadinessDiagnostic}
                    onClose={() => setShowReadiness(false)}
                  />
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <Tooltip content="Keyboard shortcuts" position="bottom">
          <button
            type="button"
            onClick={onToggleHotkeys}
            aria-label="Keyboard shortcuts"
            aria-pressed={showHotkeys}
            className={`broadcast-header-action is-icon ${showHotkeys ? 'is-active' : ''}`}
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
            className={`broadcast-header-action ${virtualCameraInfo?.state === 'active' ? 'is-active' : virtualCameraLoading || virtualCameraStarting ? 'is-loading' : ''}`}
          >
            <IconVideo size={18} />
            <span className="hidden xl:inline">
              {virtualCameraInfo?.state === 'active' ? 'Cam Live' : virtualCameraInstallAvailable ? 'Install Cam' : virtualCameraLoading ? 'Checking' : 'Cam'}
            </span>
            {virtualCameraInfo?.state === 'active' && <span className="broadcast-header-action-dot is-active animate-pulse" />}
            {(virtualCameraLoading || virtualCameraStarting) && <span className="broadcast-header-action-dot animate-pulse" />}
          </button>
        </Tooltip>

        {/* Outputs Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowOutputsMenu(!showOutputsMenu)}
            className={`broadcast-header-action ${showOutputsMenu ? 'is-active' : ''}`}
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
                  className="broadcast-output-menu"
                >
                  <div className="broadcast-output-menu-heading">
                    <p>External projections</p>
                  </div>

                  <div className="broadcast-output-menu-list">
                    <button
                      onClick={() => { onOpenProjector(); setShowOutputsMenu(false); }}
                      className="broadcast-output-menu-item group"
                    >
                      <div className="broadcast-output-menu-copy">
                        <div className="broadcast-output-menu-icon">
                          <IconDeviceDesktop size={16} />
                        </div>
                        <div>
                          <p className="broadcast-output-menu-title">Fullscreen Projector</p>
                          <p className="broadcast-output-menu-subtitle">Monitor output</p>
                        </div>
                      </div>
                    </button>

                    <button
                      onClick={() => { onToggleVirtualCamera(); setShowOutputsMenu(false); }}
                      disabled={virtualCameraDisabled}
                      title={virtualCameraTooltip}
                      className="broadcast-output-menu-item group"
                    >
                      <div className="broadcast-output-menu-copy">
                        <div className={`broadcast-output-menu-icon ${virtualCameraInfo?.state === 'active' ? 'is-active' : ''}`}>
                          <IconVideo size={16} />
                        </div>
                        <div>
                          <p className="broadcast-output-menu-title">ilyStream Virtual Cam</p>
                          <p className={`broadcast-output-menu-subtitle ${virtualCameraInfo?.state === 'active' ? 'is-active' : ''}`}>
                            {virtualCameraLabel}
                          </p>
                        </div>
                      </div>
                      {virtualCameraInfo?.state === 'active' && <span className="broadcast-header-action-dot is-active animate-pulse" />}
                      {(virtualCameraLoading || virtualCameraStarting) && <span className="broadcast-header-action-dot animate-pulse" />}
                    </button>

                    <div className="broadcast-output-feed-card">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <IconLayoutGrid size={14} className="shrink-0" />
                          <span className="broadcast-output-feed-label">Virtual Cam Feed</span>
                        </div>
                        <span className="broadcast-output-feed-value">
                          {virtualCameraFeed.mode === 'source' ? selectedVirtualCameraSource?.name || 'Source' : 'Layout'}
                        </span>
                      </div>

                      <div className="broadcast-output-segment grid grid-cols-2">
                        <button
                          type="button"
                          onClick={() => updateVirtualCameraFeedMode('layout')}
                          className={virtualCameraFeed.mode === 'layout' ? 'is-active' : ''}
                        >
                          <IconLayoutGrid size={13} /> Layout
                        </button>
                        <button
                          type="button"
                          onClick={() => updateVirtualCameraFeedMode('source')}
                          disabled={virtualCameraSourceOptions.length === 0}
                          className={virtualCameraFeed.mode === 'source' ? 'is-active' : ''}
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
                            buttonClassName="broadcast-output-select-button"
                            maxListHeight={220}
                          />
                          <div className="broadcast-output-segment grid grid-cols-3">
                            {[
                              { value: 'contain' as const, label: 'Fit' },
                              { value: 'cover' as const, label: 'Crop' },
                              { value: 'stretch' as const, label: 'Fill' }
                            ].map(option => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => updateVirtualCameraSourceFitMode(option.value)}
                                className={virtualCameraFeed.sourceFitMode === option.value ? 'is-active' : ''}
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
                          buttonClassName="broadcast-output-select-button"
                        />
                      )}
                    </div>

                    <button
                      onClick={() => { onToggleObsVirtualCamera(); setShowOutputsMenu(false); }}
                      disabled={!obsStatus?.connected}
                      className="broadcast-output-menu-item group"
                    >
                      <div className="broadcast-output-menu-copy">
                        <div className={`broadcast-output-menu-icon ${obsStatus?.virtualCameraActive ? 'is-success' : ''}`}>
                          <IconVideo size={16} />
                        </div>
                        <div>
                          <p className="broadcast-output-menu-title">OBS Virtual Camera</p>
                          <p className={`broadcast-output-menu-subtitle ${obsStatus?.virtualCameraActive ? 'is-success' : ''}`}>
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
        <div className="broadcast-header-stream">
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
            buttonClassName="broadcast-header-destination-button"
            placeholder="Destination"
          />

          <Tooltip
            content={streamInfoTitle ? `Stream info: "${streamInfoTitle}"` : 'Set stream title & category'}
            position="bottom"
          >
            <button
              onClick={onOpenStreamInfo}
              className={`broadcast-header-icon-button ${streamInfoTitle ? 'is-active' : ''}`}
            >
              <IconPencil size={15} />
            </button>
          </Tooltip>

          <div className="broadcast-header-divider" />

          {isStreaming ? (
            <button
              onClick={onStopBroadcast}
              className="app-button-live"
              title="End the live broadcast"
            >
              <IconSquare size={12} className="fill-current" /> Stop
            </button>
          ) : (
            <button
              onClick={attemptStartBroadcast}
              className="app-button-primary"
              title={readinessReport.blockerCount > 0 ? 'Review the required live-readiness checks' : 'Start the live broadcast'}
            >
              <IconBroadcast size={14} /> Go live
            </button>
          )}
        </div>

        <button
          onClick={onToggleRightSidebar}
          aria-label={showRightSidebar ? 'Hide source controls' : 'Show source controls'}
          className={`broadcast-header-action is-icon ${showRightSidebar ? 'is-active' : ''}`}
        >
          {showRightSidebar ? <IconChevronRight size={20} /> : <IconChevronLeft size={20} />}
        </button>
      </div>
    </header>
  )
}
