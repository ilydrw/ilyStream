import React from 'react'

export function YeelightIcon({ size = 24, className = "" }: { size?: number, className?: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 48 48" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={`brand-icon-yeelight ${className}`}
    >
      <path 
        d="M15.7 31L4.5 26.6V13.8L24 21.4V34.2M32.3 31L43.5 26.6V13.8L24 21.4V34.2" 
        stroke="#DF3336" 
        strokeWidth="4" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
    </svg>
  )
}
