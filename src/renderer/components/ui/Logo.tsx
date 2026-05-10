import React from 'react'

interface LogoProps {
  className?: string
  size?: number
}

export function Logo({ className, size = 1024 }: LogoProps) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 1024 1024" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg" 
      className={className}
    >
      <defs>
        <linearGradient id="ilyStreamBrandGradient" x1="122" y1="96" x2="902" y2="928" gradientUnits="userSpaceOnUse">
          <stop stopColor="#19C8FF"/>
          <stop offset="1" stopColor="#D035F1"/>
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="224" fill="url(#ilyStreamBrandGradient)"/>
      <path d="M512 916L451.75 861.12C236.8 666.16 96 538.56 96 382.4C96 254.8 196.4 154.4 324 154.4C396 154.4 465.2 187.6 512 240.8C558.8 187.6 628 154.4 700 154.4C827.6 154.4 928 254.8 928 382.4C928 538.56 787.2 666.16 572.25 861.12L512 916Z" fill="#020306"/>
      <text x="512" y="470" textAnchor="middle" dominantBaseline="middle" fill="white" style={{ fontFamily: "'Outfit', 'Inter', sans-serif", fontWeight: 900, fontSize: 140, letterSpacing: '-0.05em' }}>stream!</text>
    </svg>
  )
}
