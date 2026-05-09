import { ShieldAlert } from 'lucide-react'
import kickLogo from '../../assets/platforms/kick.svg'
import tiktokLogo from '../../assets/platforms/tiktok.svg'
import twitchLogo from '../../assets/platforms/twitch.svg'
import youtubeLogo from '../../assets/platforms/youtube.svg'
import xLogo from '../../assets/platforms/x.svg'
import discordLogo from '../../assets/platforms/discord.svg'

const platformLogoSrc: Record<string, string> = {
  tiktok: tiktokLogo,
  twitch: twitchLogo,
  youtube: youtubeLogo,
  kick: kickLogo,
  x: xLogo,
  discord: discordLogo
}

interface PlatformLogoProps {
  platform: string
  size?: number
  className?: string
}

export function PlatformLogo({ platform, size = 16, className = '' }: PlatformLogoProps) {
  const src = platformLogoSrc[platform]

  if (src) {
    return (
      <img
        src={src}
        width={size}
        height={size}
        alt={platform}
        aria-hidden="true"
        className={className}
        style={{ display: 'inline-block', flexShrink: 0, objectFit: 'contain' }}
      />
    )
  }

  // Fallback to error icon if platform not found
  return <ShieldAlert size={size} className={`text-white/20 ${className}`} />
}
