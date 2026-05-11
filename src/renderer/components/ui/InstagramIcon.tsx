import React from 'react'

export function InstagramIcon({ size = 24, className = "" }: { size?: number, className?: string }) {
  const uniqueId = React.useId().replace(/:/g, '')
  const gradId = `insta-grad-${uniqueId}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`brand-icon-instagram ${className}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient
          id={gradId}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(4 22) rotate(-45) scale(28)"
        >
          <stop offset="0" stopColor="#FED373" />
          <stop offset="0.18" stopColor="#F58439" />
          <stop offset="0.4" stopColor="#E03A55" />
          <stop offset="0.65" stopColor="#C12E96" />
          <stop offset="0.85" stopColor="#7638CB" />
          <stop offset="1" stopColor="#4F5BD5" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5.5" fill={`url(#${gradId})`} />
      <circle cx="12" cy="12" r="4.25" fill="none" stroke="#fff" strokeWidth="1.6" />
      <circle cx="17.6" cy="6.4" r="1.15" fill="#fff" />
    </svg>
  )
}
