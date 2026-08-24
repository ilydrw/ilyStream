import React from 'react'

interface AvatarProps {
  url?: string | null
  name: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  className?: string
  style?: React.CSSProperties
}

export function Avatar({ url, name, size = 'md', className = '', style }: AvatarProps) {
  const sizeClasses = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-[11px]',
    lg: 'w-10 h-10 text-xs',
    xl: 'w-16 h-16 text-xl',
    '2xl': 'w-24 h-24 text-3xl'
  }

  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const [error, setError] = React.useState(false)

  // Use local cache proxy if it's an HTTP URL (TikTok URLs expire)
  let proxyUrl = url
  if (url?.startsWith('http')) {
    const b64 = btoa(url)
    const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    proxyUrl = typeof window !== 'undefined' && window.api
      ? `ily-avatar://proxy/${b64url}`
      : `/avatar/${b64url}`
  }

  return (
    <div 
      className={`shrink-0 rounded-full overflow-hidden border border-white/10 bg-white/5 flex items-center justify-center font-semibold text-white/40 ring-1 ring-white/5 shadow-inner shadow-black/40 ${sizeClasses[size]} ${className}`}
      style={style}
    >
      {proxyUrl && !error ? (
        <img
          src={proxyUrl}
          alt={name}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setError(true)}
        />
      ) : (
        <span>{initials || '?'}</span>
      )}
    </div>
  )
}
