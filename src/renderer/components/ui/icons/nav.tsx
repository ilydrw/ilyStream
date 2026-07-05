import { useId, type ReactNode, type SVGProps } from 'react'

interface NavIconProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'stroke'> {
  size?: number
  stroke?: number
}

type GradientIconChildren = ReactNode | ((gradientId: string) => ReactNode)

function useGradientId(prefix: string) {
  return `${prefix}-${useId().replace(/:/g, '')}`
}

function Ic({ children, size = 16, stroke = 1.5, ...rest }: NavIconProps & { children: GradientIconChildren }) {
  const gradientId = useGradientId('nav-icon-gradient')

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={`url(#${gradientId})`}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="22" y1="22" x2="2" y2="2">
          <stop offset="0" stopColor="var(--icon-gradient-from)" />
          <stop offset="0.5" stopColor="var(--icon-gradient-via)" />
          <stop offset="1" stopColor="var(--icon-gradient-to)" />
        </linearGradient>
      </defs>
      {typeof children === 'function' ? children(gradientId) : children}
    </svg>
  )
}

export function IconDashboard(props: NavIconProps) {
  return (
    <Ic {...props}>
      <rect x="3" y="3" width="7.5" height="9" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="5" rx="1.5" />
      <rect x="13.5" y="12" width="7.5" height="9" rx="1.5" />
      <rect x="3" y="16" width="7.5" height="5" rx="1.5" />
    </Ic>
  )
}

export function IconActivity(props: NavIconProps) {
  return (
    <Ic {...props}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </Ic>
  )
}

export function IconHealthCenter(props: NavIconProps) {
  return (
    <Ic {...props}>
      <rect x="3.5" y="4" width="17" height="16" rx="3" />
      <path d="M7.25 8.25h4.5" />
      <path d="M7.25 12h3.25" />
      <path d="M7.25 15.75h2.5" />
      <circle cx="16.5" cy="8.25" r="1.25" />
      <path d="m12.75 15.25 1.65 1.65 3.65-4.15" />
    </Ic>
  )
}

export function IconStats(props: NavIconProps) {
  return (
    <Ic {...props}>
      {(gradientId) => (
        <>
          <path d="M3 15h3l2-6 3 10 3-14 3 10h4" />
          <circle cx="6" cy="15" r="1" fill={`url(#${gradientId})`} stroke="none" />
          <circle cx="11" cy="19" r="1" fill={`url(#${gradientId})`} stroke="none" />
          <circle cx="17" cy="15" r="1" fill={`url(#${gradientId})`} stroke="none" />
        </>
      )}
    </Ic>
  )
}

export function IconBroadcast(props: NavIconProps) {
  return (
    <Ic {...props}>
      <path d="M4 12a8 8 0 1 1 16 0" />
      <path d="M6 12a6 6 0 1 1 12 0" />
      <circle cx="12" cy="12" r="2" />
    </Ic>
  )
}

export function IconVideo(props: NavIconProps) {
  return (
    <Ic {...props}>
      <rect x="3" y="6" width="14" height="12" rx="2" />
      <path d="M17 10l4-2v8l-4-2" />
    </Ic>
  )
}

export function IconChat(props: NavIconProps) {
  return (
    <Ic {...props}>
      <path d="M21 12a8 8 0 0 1-11.7 7.1L4 20l.9-5.3A8 8 0 1 1 21 12Z" />
    </Ic>
  )
}

export function IconTTS(props: NavIconProps) {
  return (
    <Ic {...props}>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </Ic>
  )
}

export function IconBolt(props: NavIconProps) {
  return (
    <Ic {...props}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </Ic>
  )
}

export function IconAutomation(props: NavIconProps) {
  return (
    <Ic {...props}>
      {(gradientId) => (
        <>
          <path d="M12 3.25 19 7.3v8.1l-7 4.05-7-4.05V7.3l7-4.05Z" />
          <path d="M4 12H2.5" />
          <path d="M21.5 12H20" />
          <path d="M12 2v1.25" />
          <path d="M12 20.75V22" />
          <path
            d="M13.1 7.25 9.4 12.2h2.85l-1.05 4.55 3.95-5.75H12.3l.8-3.75Z"
            fill={`url(#${gradientId})`}
            stroke="none"
          />
        </>
      )}
    </Ic>
  )
}

export function IconTriggerRelay({ size = 16, stroke = 2, ...rest }: NavIconProps) {
  const gradientId = useGradientId('trigger-relay-gradient')

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={`url(#${gradientId})`}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="22" y1="22" x2="2" y2="2">
          <stop offset="0" stopColor="var(--icon-gradient-from)" />
          <stop offset="0.5" stopColor="var(--icon-gradient-via)" />
          <stop offset="1" stopColor="var(--icon-gradient-to)" />
        </linearGradient>
      </defs>
      <circle cx="8" cy="12" r="2.25" />
      <circle cx="18" cy="6" r="1.75" />
      <circle cx="18" cy="12" r="1.75" />
      <circle cx="18" cy="18" r="1.75" />
      <path d="M10.25 12H14" />
      <path d="M14 12c1.5 0 2-1.25 2-3.5V7.75" />
      <path d="M14 12h2.25" />
      <path d="M14 12c1.5 0 2 1.25 2 3.5v.75" />
      <path d="M4.75 8.75a4.5 4.5 0 0 0 0 6.5" />
      <path d="M3 6.75a7.25 7.25 0 0 0 0 10.5" />
    </svg>
  )
}

export function IconTerminal(props: NavIconProps) {
  return (
    <Ic {...props}>
      <polyline points="5 8 9 12 5 16" />
      <line x1="12" y1="16" x2="19" y2="16" />
      <rect x="2.5" y="4" width="19" height="16" rx="2" />
    </Ic>
  )
}

export function IconAlert(props: NavIconProps) {
  return (
    <Ic {...props}>
      <path d="M10 5a2 2 0 1 1 4 0c4 1 5 4 5 8v2l1 2H4l1-2v-2c0-4 1-7 5-8" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </Ic>
  )
}

export function IconSoundboard(props: NavIconProps) {
  return (
    <Ic {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Ic>
  )
}

export function IconFx(props: NavIconProps) {
  return (
    <Ic {...props}>
      <rect x="9" y="3" width="6" height="10" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
      <path d="M8.5 21h7" />
      <path d="M4 7.75c-1.35 2.3-1.35 6.2 0 8.5" />
      <path d="M20 7.75c1.35 2.3 1.35 6.2 0 8.5" />
    </Ic>
  )
}

export function IconBulb(props: NavIconProps) {
  return (
    <Ic {...props}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 1 4 10.5V16H8v-2.5A6 6 0 0 1 12 3Z" />
    </Ic>
  )
}

export function IconSettings(props: NavIconProps) {
  return (
    <Ic {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </Ic>
  )
}

export function IconWidgets(props: NavIconProps) {
  return (
    <Ic {...props}>
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </Ic>
  )
}

export function IconCreate(props: NavIconProps) {
  return (
    <Ic {...props}>
      <rect x="5" y="4.5" width="14" height="14" rx="2.5" />
      <path d="M3 9.25V17a4 4 0 0 0 4 4h7.75" />
      <path d="M12 8.25v6.5" />
      <path d="M8.75 11.5h6.5" />
    </Ic>
  )
}

export function IconMixer(props: NavIconProps) {
  return (
    <Ic {...props}>
      {(gradientId) => (
        <>
          <line x1="4" y1="6" x2="20" y2="6" />
          <circle cx="9" cy="6" r="2" fill={`url(#${gradientId})`} stroke="none" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <circle cx="15" cy="12" r="2" fill={`url(#${gradientId})`} stroke="none" />
          <line x1="4" y1="18" x2="20" y2="18" />
          <circle cx="8" cy="18" r="2" fill={`url(#${gradientId})`} stroke="none" />
        </>
      )}
    </Ic>
  )
}
