import deskthingLogo from '../../assets/deskthing.svg'

interface DeskThingIconProps {
  size?: number
  className?: string
}

export function DeskThingIcon({ size = 16, className = '' }: DeskThingIconProps) {
  return (
    <img
      src={deskthingLogo}
      width={size}
      height={size}
      alt="DeskThing"
      aria-hidden="true"
      className={className}
      style={{ display: 'inline-block', flexShrink: 0, objectFit: 'contain' }}
    />
  )
}
