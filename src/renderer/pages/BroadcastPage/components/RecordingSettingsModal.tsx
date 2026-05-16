import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { IconX, IconSettings, IconDeviceFloppy, IconVideo, IconMusic, IconSparkles } from '@tabler/icons-react'
import { useStudioStore } from '../../../stores/studio-store'

interface RecordingSettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function RecordingSettingsModal({ isOpen, onClose }: RecordingSettingsModalProps) {
  const { recordingSettings, setRecordingSettings, audioReactivity, setAudioReactivity } = useStudioStore()

  if (!isOpen) return null

  const smoothing = audioReactivity?.smoothing ?? 0.6

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-[500px] bg-[#0c0c0e] rounded-[32px] border border-white/10 shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="px-8 py-6 border-b border-white/5 flex justify-between items-center bg-gradient-to-r from-accent/5 to-transparent">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-accent/20 text-accent">
                <IconSettings size={20} />
              </div>
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight text-white">Recording Settings</h2>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/20 mt-0.5">Advanced Production Config</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl text-white/20 hover:text-white hover:bg-white/5 transition-all">
              <IconX size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="p-8 space-y-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
            {/* Format & Container */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40">
                <IconVideo size={14} /> Video Container
              </div>
              <div className="grid grid-cols-4 gap-2">
                {(['mkv', 'mp4', 'mov', 'flv'] as const).map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => setRecordingSettings({ container: fmt })}
                    className={`py-3 rounded-xl border font-black uppercase text-[11px] tracking-widest transition-all ${recordingSettings.container === fmt ? 'bg-accent border-accent text-white shadow-lg shadow-accent/20' : 'bg-white/5 border-white/10 text-white/30 hover:border-white/20'}`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-white/20 font-medium italic">
                MKV is recommended for safety (avoids corruption if the app crashes).
              </p>
            </div>

            {/* Encoder */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40">
                <IconSparkles size={14} /> Video Encoder
              </div>
              <div className="space-y-2">
                {[
                  { id: 'auto', name: 'Auto (Recommended)', desc: 'Best available hardware' },
                  { id: 'h264_nvenc', name: 'NVIDIA NVENC', desc: 'GPU accelerated' },
                  { id: 'h264_amf', name: 'AMD AMF', desc: 'GPU accelerated' },
                  { id: 'h264_qsv', name: 'Intel QSV', desc: 'GPU accelerated' },
                  { id: 'libx264', name: 'Software (x264)', desc: 'CPU only - High load' }
                ].map(enc => (
                  <button
                    key={enc.id}
                    onClick={() => setRecordingSettings({ encoder: enc.id as any })}
                    className={`w-full px-4 py-3 rounded-xl border flex items-center justify-between transition-all ${recordingSettings.encoder === enc.id ? 'bg-white/10 border-accent/40 text-white shadow-inner' : 'bg-white/5 border-white/5 text-white/30 hover:bg-white/10'}`}
                  >
                    <div className="text-left">
                      <div className="text-[11px] font-black uppercase tracking-tight">{enc.name}</div>
                      <div className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{enc.desc}</div>
                    </div>
                    {recordingSettings.encoder === enc.id && <div className="w-2 h-2 rounded-full bg-accent animate-pulse shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Audio Reactivity */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40">
                <IconMusic size={14} /> Audio Reactivity
              </div>
              <div className="p-5 rounded-2xl bg-white/5 border border-white/5 space-y-5">
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Smoothing (EMA)</label>
                    <span className="text-[10px] font-mono font-black text-accent">{Math.round(smoothing * 100)}%</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <input
                      type="range" min="0" max="0.95" step="0.01"
                      value={smoothing}
                      onChange={(e) => setAudioReactivity({ smoothing: Number(e.target.value) })}
                      className="flex-1 accent-accent"
                    />
                  </div>
                  <p className="text-[8px] text-white/15 leading-relaxed font-bold uppercase tracking-wider">
                    Higher = smoother & slower pulses. Lower = snappier & more aggressive.
                  </p>
                </div>
              </div>
            </div>

            {/* Quality & Bitrate */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40">Video Quality (CRF)</label>
                <div className="flex items-center gap-4">
                  <input
                    type="range" min="0" max="51" step="1"
                    value={recordingSettings.crf}
                    onChange={(e) => setRecordingSettings({ crf: Number(e.target.value) })}
                    className="flex-1 accent-accent"
                  />
                  <span className="text-xs font-black font-mono text-white/80 w-6 text-center">{recordingSettings.crf}</span>
                </div>
                <p className="text-[8px] text-white/15 leading-relaxed font-bold uppercase tracking-wider">Lower is higher quality. 18-23 is typical.</p>
              </div>

              <div className="space-y-4">
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40">Audio Bitrate (kbps)</label>
                <div className="grid grid-cols-2 gap-2">
                  {[128, 160, 192, 320].map(br => (
                    <button
                      key={br}
                      onClick={() => setRecordingSettings({ audioBitrate: br })}
                      className={`py-2 rounded-lg border font-mono text-[10px] transition-all ${recordingSettings.audioBitrate === br ? 'bg-accent/20 border-accent/40 text-accent' : 'bg-white/5 border-white/10 text-white/30'}`}
                    >
                      {br}k
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-8 py-6 border-t border-white/5 bg-black/40 flex items-center justify-end">
            <button
              onClick={onClose}
              className="px-8 py-3 bg-accent text-white font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-accent/20 hover:brightness-110 active:scale-95 transition-all text-xs"
            >
              Apply Settings
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
