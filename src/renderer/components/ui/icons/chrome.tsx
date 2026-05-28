import type { ReactNode, SVGProps } from 'react'

interface ChromeIconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number
  stroke?: number
}

function Ic({ children, size = 16, stroke = 1.5, ...rest }: ChromeIconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  )
}

/* ─── Chevrons / arrows ─── */
export function IconChevronRight(props: ChromeIconProps) {
  return <Ic {...props}><polyline points="9 6 15 12 9 18" /></Ic>
}
export function IconChevronLeft(props: ChromeIconProps) {
  return <Ic {...props}><polyline points="15 6 9 12 15 18" /></Ic>
}
export function IconChevronDown(props: ChromeIconProps) {
  return <Ic {...props}><polyline points="6 9 12 15 18 9" /></Ic>
}
export function IconChevronUp(props: ChromeIconProps) {
  return <Ic {...props}><polyline points="6 15 12 9 18 15" /></Ic>
}
export function IconArrowRight(props: ChromeIconProps) {
  return (
    <Ic {...props}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="13 6 19 12 13 18" />
    </Ic>
  )
}
export function IconArrowLeft(props: ChromeIconProps) {
  return (
    <Ic {...props}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="11 6 5 12 11 18" />
    </Ic>
  )
}
export function IconExternalLink(props: ChromeIconProps) {
  return (
    <Ic {...props}>
      <path d="M14 4h6v6" />
      <line x1="10" y1="14" x2="20" y2="4" />
      <path d="M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
    </Ic>
  )
}

/* ─── Actions ─── */
export function IconPlus(props: ChromeIconProps) {
  return (
    <Ic {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </Ic>
  )
}
export function IconMinus(props: ChromeIconProps) {
  return <Ic {...props}><line x1="5" y1="12" x2="19" y2="12" /></Ic>
}
export function IconX(props: ChromeIconProps) {
  return (
    <Ic {...props}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </Ic>
  )
}
export function IconCheck(props: ChromeIconProps) {
  return <Ic {...props}><polyline points="5 12 10 17 19 7" /></Ic>
}
export function IconTrash(props: ChromeIconProps) {
  return (
    <Ic {...props}>
      <polyline points="4 7 20 7" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </Ic>
  )
}
export function IconCopy(props: ChromeIconProps) {
  return (
    <Ic {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </Ic>
  )
}
export function IconPencil(props: ChromeIconProps) {
  return (
    <Ic {...props}>
      <path d="M4 20h4l11-11-4-4L4 16v4Z" />
      <path d="M14 6l4 4" />
    </Ic>
  )
}
export function IconSave(props: ChromeIconProps) {
  return (
    <Ic {...props}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </Ic>
  )
}
// Tabler-compatible alias
export const IconDeviceFloppy = IconSave
export function IconDownload(props: ChromeIconProps) {
  return (
    <Ic {...props}>
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      <polyline points="7 11 12 16 17 11" />
      <line x1="12" y1="4" x2="12" y2="16" />
    </Ic>
  )
}
export function IconUpload(props: ChromeIconProps) {
  return (
    <Ic {...props}>
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      <polyline points="7 9 12 4 17 9" />
      <line x1="12" y1="4" x2="12" y2="16" />
    </Ic>
  )
}
export function IconSearch(props: ChromeIconProps) {
  return (
    <Ic {...props}>
      <circle cx="11" cy="11" r="7" />
      <line x1="20" y1="20" x2="16.5" y2="16.5" />
    </Ic>
  )
}
export function IconRefresh(props: ChromeIconProps) {
  return (
    <Ic {...props}>
      <polyline points="20 4 20 10 14 10" />
      <polyline points="4 20 4 14 10 14" />
      <path d="M20 10A8 8 0 0 0 6.5 6.5L4 9" />
      <path d="M4 14a8 8 0 0 0 13.5 3.5L20 15" />
    </Ic>
  )
}
export function IconDots(props: ChromeIconProps) {
  return (
    <Ic {...props}>
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
    </Ic>
  )
}
export function IconDotsVertical(props: ChromeIconProps) {
  return (
    <Ic {...props}>
      <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
    </Ic>
  )
}
export function IconLink(props: ChromeIconProps) {
  return (
    <Ic {...props}>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    </Ic>
  )
}

/* ─── Window controls ─── */
export function IconWindowMinimize(props: ChromeIconProps) {
  return <Ic {...props} stroke={1.1}><line x1="4" y1="12" x2="20" y2="12" /></Ic>
}
export function IconWindowMaximize(props: ChromeIconProps) {
  return <Ic {...props} stroke={1.1}><rect x="5" y="5" width="14" height="14" /></Ic>
}
export function IconWindowClose(props: ChromeIconProps) {
  return (
    <Ic {...props} stroke={1.1}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </Ic>
  )
}

/* ─── Media controls ─── */
export function IconPlayerPlay(props: ChromeIconProps) {
  return (
    <Ic {...props}>
      <path d="M7 5v14l12-7L7 5Z" fill="currentColor" stroke="none" />
    </Ic>
  )
}
export function IconPlayerPause(props: ChromeIconProps) {
  return (
    <Ic {...props}>
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    </Ic>
  )
}
export function IconPlayerStop(props: ChromeIconProps) {
  return <Ic {...props}><rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none" /></Ic>
}

/* ─── Status / feedback ─── */
export function IconAlertTriangle(props: ChromeIconProps) {
  return (
    <Ic {...props}>
      <path d="M12 4 2.5 20h19L12 4Z" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </Ic>
  )
}
export function IconCircleCheck(props: ChromeIconProps) {
  return (
    <Ic {...props}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="8 12 11 15 16 9" />
    </Ic>
  )
}
export function IconInfoCircle(props: ChromeIconProps) {
  return (
    <Ic {...props}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </Ic>
  )
}
export function IconEye(props: ChromeIconProps) {
  return (
    <Ic {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </Ic>
  )
}
export function IconEyeOff(props: ChromeIconProps) {
  return (
    <Ic {...props}>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A9.9 9.9 0 0 1 12 5c6.5 0 10 7 10 7a16.5 16.5 0 0 1-3.1 4" />
      <path d="M6.6 6.6A16.4 16.4 0 0 0 2 12s3.5 7 10 7a9.9 9.9 0 0 0 5.1-1.4" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </Ic>
  )
}

/* ─── Power / bolt ─── */
export function IconPower(props: ChromeIconProps) {
  return (
    <Ic {...props}>
      <path d="M7.5 4.5A8 8 0 1 0 16.5 4.5" />
      <line x1="12" y1="3" x2="12" y2="12" />
    </Ic>
  )
}
