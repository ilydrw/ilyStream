import React from 'react'

export function RestreamIcon({ size = 24, className = "" }: { size?: number, className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`brand-icon-restream ${className}`}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5 3v18h3v-7h2.6l4.2 7H18l-4.4-7.3c2.6-.6 4.4-2.7 4.4-5.3 0-3-2.5-5.4-5.5-5.4H5zm3 3h4.5c1.4 0 2.5 1.1 2.5 2.5S13.9 11 12.5 11H8V6z"
        fill="currentColor"
      />
    </svg>
  )
}
