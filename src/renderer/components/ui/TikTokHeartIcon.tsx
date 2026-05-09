import React from 'react'

interface TikTokHeartIconProps {
  size?: number
  className?: string
}

export function TikTokHeartIcon({ size = 24, className = "" }: TikTokHeartIconProps) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="heartGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff2d55" />
          <stop offset="100%" stopColor="#ff5e7d" />
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <path 
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" 
        fill="url(#heartGradient)"
        filter="url(#glow)"
      />
      <path 
        d="M13.5 7.5v5.5a1.5 1.5 0 11-1-1.3" 
        stroke="white" 
        strokeWidth="1.2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        opacity="0.9"
      />
    </svg>
  )
}
