import React from 'react'
import { Volume2, Mic2, Activity, Waves, Power, Headphones, Ghost, User, Cat, Bot, Radio as RadioIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { useVoiceFX } from '../../hooks/useVoiceFX'

interface VoiceEffect {
  id: string
  name: string
  icon: React.ReactNode
  description: string
  color: string
  params?: Record<string, any>
}

const VOICE_EFFECTS: VoiceEffect[] = [
  { id: 'alien', name: 'Alien', icon: <Ghost size={32} />, description: 'Resonant high-pitched extraterrestrial voice.', color: 'bg-green-500/20 text-green-400' },
  { id: 'robot', name: 'Robot', icon: <Bot size={32} />, description: 'Metallic, vocoded synthesized modulation.', color: 'bg-blue-500/20 text-blue-400' },
  { id: 'monster', name: 'Monster', icon: <Cat size={32} />, description: 'Deep, growling sub-harmonic frequencies.', color: 'bg-red-500/20 text-red-400' },
  { id: 'chipmunk', name: 'Chipmunk', icon: <User size={32} />, description: 'Hyper-accelerated pitch shifting.', color: 'bg-amber-500/20 text-amber-400' },
  { id: 'radio', name: 'Radio', icon: <RadioIcon size={32} />, description: '1940s bandwidth-limited broadcast filter.', color: 'bg-slate-500/20 text-slate-400' },
  { id: 'echo', name: 'Deep Space', icon: <Waves size={32} />, description: 'Infinite delay with spectral diffusion.', color: 'bg-purple-500/20 text-purple-400' },
  { id: 'telephone', name: 'Telephone', icon: <Volume2 size={32} />, description: 'Vintage telecommunication bandpass filter.', color: 'bg-yellow-500/20 text-yellow-400' },
  { id: 'cave', name: 'The Cave', icon: <Activity size={32} />, description: 'Enclosed space with dark reflections.', color: 'bg-cyan-500/20 text-cyan-400' },
  { id: 'vibrato', name: 'Vibrato', icon: <Waves size={32} />, description: 'Rapid frequency modulation for tremolo voice.', color: 'bg-pink-500/20 text-pink-400' },
  { id: 'megaphone', name: 'Megaphone', icon: <Volume2 size={32} />, description: 'Aggressive mid-range projection and saturation.', color: 'bg-orange-500/20 text-orange-400' },
  { id: 'underwater', name: 'Underwater', icon: <Waves size={32} />, description: 'Submerged low-pass aquatic environment.', color: 'bg-indigo-500/20 text-indigo-400' },
]

export default function VoiceEffectsPage() {
  const { 
    isEnabled, setIsEnabled, 
    selectedEffectId, setSelectedEffectId, 
    isMonitoring, setIsMonitoring, 
    volume, setVolume 
  } = useVoiceFX()

  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="flex items-center gap-6">
          <div className="flex items-center justify-center">
            <Volume2 size={48} className="text-accent" />
          </div>
          <div>
            <div className="app-header-eyebrow">
              <Volume2 size={14} className="text-accent" />
              <span>Audio Processing</span>
            </div>
            <h1>Voice Effects</h1>
            <p className="app-page-intro">
              Transform your vocal signature with real-time modulation.
              Apply professional-grade filters to create unique characters and immersive broadcast environments.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsEnabled(!isEnabled)}
            className={`app-button !h-12 !px-8 !text-[10px] font-black tracking-[0.2em] transition-all ${
              isEnabled ? 'bg-accent text-white' : 'bg-white/5 text-white/40 border-white/10'
            }`}
          >
            <Power size={16} />
            {isEnabled ? 'SYSTEM ACTIVE' : 'SYSTEM BYPASSED'}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-8 mt-12">
        {/* FX Grid */}
        <div className="col-span-8">
          <div className="app-section-card glass min-h-[500px] relative overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-10">
              <div>
                <h2 className="text-xs font-black tracking-widest text-white/40 uppercase">Voice Library</h2>
                <p className="text-[10px] font-black text-white/10 mt-1 uppercase">Select a filter to transform your voice in real-time</p>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/5 rounded-xl">
                <Mic2 size={14} className="text-accent" />
                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Input: Default Mic</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
              {VOICE_EFFECTS.map((fx) => (
                <motion.button
                  key={fx.id}
                  whileHover={{ y: -4, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedEffectId(fx.id === selectedEffectId ? null : fx.id)}
                  style={{ 
                    background: selectedEffectId === fx.id ? 'var(--brand-gradient)' : '',
                  }}
                  className={`relative p-6 rounded-2xl border transition-all text-center group overflow-hidden flex flex-col items-center ${
                    selectedEffectId === fx.id 
                      ? 'border-white/20' 
                      : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04] hover:border-white/20'
                  }`}
                >
                  <div className={`mb-4 w-14 h-14 rounded-2xl flex items-center justify-center transition-transform duration-500 ${
                    selectedEffectId === fx.id ? 'scale-110 bg-white/20 text-white' : `${fx.color}`
                  }`}>
                    {fx.icon}
                  </div>
                  
                  <h3 className={`text-lg font-black uppercase tracking-tighter mb-1 ${
                    selectedEffectId === fx.id ? 'text-white' : 'text-white/60 group-hover:text-white'
                  }`}>
                    {fx.name}
                  </h3>
                  <p className={`text-[9px] font-medium leading-relaxed uppercase tracking-wider max-w-[140px] ${
                    selectedEffectId === fx.id ? 'text-white/70' : 'text-white/20'
                  }`}>
                    {fx.description}
                  </p>

                  {selectedEffectId === fx.id && (
                    <motion.div 
                      layoutId="active-fx"
                      className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-white"
                    />
                  )}
                </motion.button>
              ))}
            </div>
          </div>
        </div>

        {/* Signal Processing Sidebar */}
        <div className="col-span-4 flex flex-col gap-8">
          <div className="app-section-card glass !bg-black/40">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                <Activity size={18} className="text-accent" />
              </div>
              <h3 className="text-xs font-black tracking-widest text-white uppercase">Input Monitoring</h3>
            </div>
            
            <div className="space-y-8">
              {/* Audio Fader */}
              <div className="space-y-4">
                <div className="flex justify-between items-center px-1">
                  <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Mic Sensitivity</span>
                  <span className="text-[10px] font-mono text-accent">{Math.round(volume * 100)}%</span>
                </div>
                <input 
                  type="range" min="0" max="1" step="0.01" value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer accent-accent"
                />
              </div>

              {/* Spectrum Visualization */}
              <div className="h-48 bg-black/60 rounded-3xl border border-white/5 relative overflow-hidden p-1 shadow-inner">
                <div className="absolute inset-0 opacity-[0.05] pointer-events-none">
                  <svg className="w-full h-full">
                    {Array.from({length: 12}).map((_, i) => (
                      <line key={i} x1={i * 10 + "%"} y1="0" x2={i * 10 + "%"} y2="100%" stroke="white" strokeWidth="1" />
                    ))}
                  </svg>
                </div>
                <div className="flex items-end justify-between h-full px-4 pb-6 gap-1">
                  {Array.from({length: 24}).map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{ height: isEnabled ? Math.random() * 80 + 10 + "%" : "5%" }}
                      transition={{ duration: 0.1, repeat: Infinity, repeatType: "reverse" }}
                      className={`w-full rounded-full ${isEnabled ? 'bg-accent/40' : 'bg-white/5'}`}
                    />
                  ))}
                </div>
                <div className="absolute top-4 right-6 flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${isEnabled ? 'bg-accent animate-ping' : 'bg-white/10'}`} />
                  <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Live Spectrum</span>
                </div>
              </div>
            </div>
          </div>

          <div className="app-section-card glass !bg-accent/5 !border-accent/10">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center shrink-0 transition-all">
                <Headphones size={18} className="text-accent" />
              </div>
              <h3 className="text-xs font-black tracking-widest text-white uppercase">Vocal Monitoring</h3>
            </div>
            <p className="text-xs text-white/40 leading-relaxed font-medium mb-8">
              Enable low-latency monitoring to hear your transformed voice in your headphones before going live.
            </p>
            <button 
              onClick={() => setIsMonitoring(!isMonitoring)}
              className={`app-button !w-full !h-12 !text-[10px] font-black tracking-widest transition-all ${
                isMonitoring ? 'bg-accent text-white' : ''
              }`}
            >
              {isMonitoring ? 'STOP MONITORING' : 'START MONITORING'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
