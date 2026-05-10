import {IconBell, IconVolume} from '@tabler/icons-react'
import { NavLink } from 'react-router-dom'
import { SpotifyIcon } from '../ui/SpotifyIcon'

export function SoundSubNav() {
  return (
    <div className="flex items-center justify-center gap-12 mb-6 mt-[-16px]">
      <NavLink
        to="/tts"
        className={({ isActive }) =>
          `transition-all duration-300 ${
            isActive 
              ? 'text-accent scale-110 drop-shadow-[0_0_15px_rgba(var(--accent-rgb),0.5)]' 
              : 'text-white/20 hover:text-white/60 hover:scale-105'
          }`
        }
        title="Voice Engine (TTS)"
      >
        <IconVolume size={36} strokeWidth={1.5} />
      </NavLink>

      <NavLink
        to="/alerts"
        className={({ isActive }) =>
          `transition-all duration-300 ${
            isActive 
              ? 'text-accent scale-110 drop-shadow-[0_0_15px_rgba(var(--accent-rgb),0.5)]' 
              : 'text-white/20 hover:text-white/60 hover:scale-105'
          }`
        }
        title="Alerts & Sounds"
      >
        <IconBell size={36} strokeWidth={1.5} />
      </NavLink>

      <NavLink
        to="/spotify"
        className={({ isActive }) =>
          `transition-all duration-300 ${
            isActive 
              ? 'text-accent scale-110 drop-shadow-[0_0_15px_rgba(var(--accent-rgb),0.5)]' 
              : 'text-white/20 hover:text-white/60 hover:scale-105'
          }`
        }
        title="Spotify Integration"
      >
        <SpotifyIcon size={36} />
      </NavLink>
    </div>
  )
}
