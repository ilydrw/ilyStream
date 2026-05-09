import React from 'react'

interface GoveeIconProps {
  size?: number
  className?: string
}

export const GoveeIcon: React.FC<GoveeIconProps> = ({ size = 24, className = '' }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 150 150"
      width={size}
      height={size}
      className={`govee-icon ${className}`}
    >
      {/* Top arc of the G */}
      <path 
        className="govee-path"
        fill="#1CB6FF"
        d="M26.88 53.33l.68.36c5.24 2.67 11.64 1.11 15.06-3.68 13.98-19.09 40.79-23.24 59.88-9.26.52.38 1.03.77 1.53 1.17 4.33 3.49 10.51 3.47 14.82-.04l.61-.5c5.05-4.1 5.81-11.52 1.7-16.57-.48-.59-1.01-1.12-1.59-1.61C90.81-.2 48.51 4.14 25.1 32.91c-.86 1.06-1.69 2.14-2.48 3.25-3.72 5.3-2.43 12.62 2.87 16.34.44.31.91.59 1.39.84z" 
      />
      {/* Bottom arc and middle bar of the G */}
      <path 
        className="govee-path"
        fill="#1CB6FF"
        d="M132.33 63.36H66.16c-6.59 0-11.93 5.34-11.93 11.93s5.34 11.93 11.93 11.93h52.23c-4.58 15.63-17.58 27.35-33.6 30.28h0c-1.12.2-2.2.34-3.33.45-15.01 1.51-29.71-4.99-38.69-17.12-3.97-5.42-11.59-6.59-17.01-2.62s-6.59 11.59-2.62 17.01c22.04 29.84 64.11 36.17 93.95 14.12 17.15-12.67 27.27-32.72 27.27-54.05v-.12c-.1-6.57-5.47-11.84-12.04-11.82z" 
      />
    </svg>
  )
}
