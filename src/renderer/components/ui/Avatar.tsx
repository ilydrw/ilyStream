import React from 'react'

interface AvatarProps {
  url?: string | null
  name: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

export function Avatar({ url, name, size = 'md', className = '' }: AvatarProps) {
  const sizeClasses = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-[11px]',
    lg: 'w-10 h-10 text-xs',
    xl: 'w-16 h-16 text-xl'
  }

  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const [error, setError] = React.useState(false)

  return (
    <div 
      className={`
        shrink-0 rounded-full overflow-hidden border border-white/10 
        bg-white/5 flex items-center justify-center font-bold text-white/40
        ring-1 ring-white/5 shadow-inner shadow-black/40
        ${sizeClasses[size]} 
        ${className}
      `}
    >
      {url && !error ? (
        <img
          src={url}
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
