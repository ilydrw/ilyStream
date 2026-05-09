import React from 'react'

export function RestreamIcon({ size = 24, className = "" }: { size?: number, className?: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 64 64" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={`brand-icon-restream ${className}`}
    >
      <path 
        d="M48.86 19.38v21.57c0 1.2.98 2.18 2.18 2.18h3.35V56h-9.98c-3.1 0-5.61-2.51-5.61-5.61V22.97c0-1.2.98-2.18 2.18-2.18h1.22c1.2 0 2.18-.98 2.18-2.18V12.1c0-1.2.98-2.18 2.18-2.18h8.54c1.2 0 2.18.98 2.18 2.18v5.1c0 1.2-.98 2.18-2.18 2.18h-3.35c-1.2 0-2.18.98-2.18 2.18l.01.01zM28.48 35.8c0-3.34-2.71-6.05-6.05-6.05-3.34 0-6.05 2.71-6.05 6.05s2.71 6.05 6.05 6.05c3.34 0 6.05-2.71 6.05-6.05zm14.1 0c0-6.68-5.42-12.1-12.1-12.1-6.68 0-12.1 5.42-12.1 12.1 0 6.68 5.42 12.1 12.1 12.1 6.68 0 12.1-5.42 12.1-12.1z" 
        fill="#0072CE"
      />
    </svg>
  )
}
