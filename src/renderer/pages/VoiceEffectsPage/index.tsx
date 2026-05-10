import {
  IconActivity,
  IconAntennaBars5,
  IconDroplet,
  IconHeadphones,
  IconMicrophone,
  IconMountain,
  IconPhoneCall,
  IconPower,
  IconRadio,
  IconRipple,
  IconRobot,
  IconSkull,
  IconSpeakerphone,
  IconUfo,
  IconVolume,
  IconWaveSawTool,
  IconWaveSine
} from '@tabler/icons-react'
import type { Icon } from '@tabler/icons-react'
import type { CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { PageHeader } from '../../components/layout/PageHeader'
import { useVoiceFX } from '../../hooks/useVoiceFX'

interface VoiceEffect {
  id: string
  name: string
  icon: Icon
  description: string
  band: string
  accent: string
}

const VOICE_EFFECTS: VoiceEffect[] = [
  { id: 'alien', name: 'Alien', icon: IconUfo, description: 'Bright resonant formants for a non-human edge.', band: 'Formant shift', accent: '#65f6a0' },
  { id: 'robot', name: 'Robot', icon: IconRobot, description: 'Hard clipped tone with a narrow synthetic band.', band: 'Vocoder grit', accent: '#6ab8ff' },
  { id: 'monster', name: 'Monster', icon: IconSkull, description: 'Low-pass weight, saturation, and heavy body.', band: 'Sub harmonic', accent: '#ff6c7b' },
  { id: 'chipmunk', name: 'Chipmunk', icon: IconWaveSawTool, description: 'Fast, bright high-pass lift for comic timing.', band: 'Pitch lift', accent: '#f5c95c' },
  { id: 'radio', name: 'Radio', icon: IconRadio, description: 'Crunchy mid-band filter for vintage broadcast texture.', band: 'AM band', accent: '#b8c2d6' },
  { id: 'echo', name: 'Deep Space', icon: IconAntennaBars5, description: 'Filtered delay with feedback for long tails.', band: 'Feedback delay', accent: '#b985ff' },
  { id: 'telephone', name: 'Telephone', icon: IconPhoneCall, description: 'Tight bandpass and light drive for call-in voices.', band: 'Narrow band', accent: '#ffe16a' },
  { id: 'cave', name: 'The Cave', icon: IconMountain, description: 'Short reflective delay with a darker room tone.', band: 'Room slap', accent: '#53dbde' },
  { id: 'vibrato', name: 'Vibrato', icon: IconWaveSine, description: 'Controlled pitch wobble that stays intelligible.', band: 'LFO motion', accent: '#ff7ac8' },
  { id: 'megaphone', name: 'Megaphone', icon: IconSpeakerphone, description: 'Projected mids, edge, and crowd-control presence.', band: 'Mid boost', accent: '#ff9b4d' },
  { id: 'underwater', name: 'Underwater', icon: IconDroplet, description: 'Moving low-pass filter for muffled submerged tone.', band: 'Low-pass sweep', accent: '#7aa8ff' }
]

const METER_BARS = [18, 44, 28, 72, 36, 88, 55, 31, 63, 47, 78, 26, 52, 92, 41, 67, 33, 58, 24, 74, 49, 84, 39, 61]

export default function VoiceEffectsPage() {
  const {
    isEnabled,
    setIsEnabled,
    selectedEffectId,
    setSelectedEffectId,
    isMonitoring,
    setIsMonitoring,
    volume,
    setVolume
  } = useVoiceFX()

  const selectedEffect = VOICE_EFFECTS.find((effect) => effect.id === selectedEffectId) ?? null

  return (
    <div className="app-page voice-fx-page">
      <PageHeader
        kicker="Studio processing"
        title="Voice FX"
        icon={IconVolume}
        description="Shape the live mic into characters, radios, rooms, and cinematic delays without leaving the broadcast workflow."
        actions={
          <button
            type="button"
            onClick={() => setIsEnabled(!isEnabled)}
            className={`app-button !h-11 !px-5 !text-[10px] font-black tracking-[0.14em] ${
              isEnabled ? '!border-accent/30 !bg-accent/20 !text-white' : '!text-white/40'
            }`}
          >
            <IconPower size={15} />
            {isEnabled ? 'FX Active' : 'FX Bypassed'}
          </button>
        }
      />

      <div className="voice-fx-console">
        <section className="voice-fx-rack">
          <div className="voice-fx-rack__head">
            <div>
              <h2>Patch Rack</h2>
              <p>Choose one voice route. Selecting the active route clears the patch.</p>
            </div>
            <div className="voice-fx-input-pill">
              <IconMicrophone size={14} />
              <span>Default mic</span>
            </div>
          </div>

          <div className="voice-fx-grid">
            {VOICE_EFFECTS.map((effect) => {
              const EffectIcon = effect.icon
              const active = selectedEffectId === effect.id
              return (
                <motion.button
                  key={effect.id}
                  type="button"
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.985 }}
                  onClick={() => setSelectedEffectId(active ? null : effect.id)}
                  className={`voice-fx-tile ${active ? 'is-active' : ''}`}
                  style={{ '--fx-accent': effect.accent } as CSSProperties}
                >
                  <span className="voice-fx-tile__rail" />
                  <span className="voice-fx-tile__icon">
                    <EffectIcon size={24} />
                  </span>
                  <span className="voice-fx-tile__copy">
                    <span className="voice-fx-tile__name">{effect.name}</span>
                    <span className="voice-fx-tile__band">{effect.band}</span>
                    <span className="voice-fx-tile__description">{effect.description}</span>
                  </span>
                </motion.button>
              )
            })}
          </div>
        </section>

        <aside className="voice-fx-side">
          <section className="voice-fx-meter">
            <div className="voice-fx-meter__top">
              <div>
                <span>Signal</span>
                <strong>{selectedEffect?.name ?? 'Clean mic'}</strong>
              </div>
              <IconActivity size={18} />
            </div>

            <div className={`voice-fx-spectrum ${isEnabled ? 'is-live' : ''}`} aria-hidden="true">
              {METER_BARS.map((height, index) => (
                <span
                  key={index}
                  style={{
                    height: isEnabled ? `${height}%` : '8%',
                    animationDelay: `${index * 38}ms`
                  }}
                />
              ))}
            </div>

            <label className="voice-fx-slider">
              <span>
                <span>Monitor level</span>
                <strong>{Math.round(volume * 100)}%</strong>
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(event) => setVolume(parseFloat(event.target.value))}
                className="studio-range"
              />
            </label>
          </section>

          <section className="voice-fx-monitor">
            <div className="voice-fx-monitor__icon">
              <IconHeadphones size={20} />
            </div>
            <div>
              <h2>Confidence Monitor</h2>
              <p>Listen locally to the processed mic. Keep this off when you do not need to hear the wet signal.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsMonitoring(!isMonitoring)}
              className={`app-button !h-11 !w-full !text-[10px] font-black tracking-[0.12em] ${
                isMonitoring ? '!border-accent/30 !bg-accent/20 !text-white' : ''
              }`}
            >
              <IconRipple size={15} />
              {isMonitoring ? 'Monitoring On' : 'Monitoring Off'}
            </button>
          </section>
        </aside>
      </div>
    </div>
  )
}
