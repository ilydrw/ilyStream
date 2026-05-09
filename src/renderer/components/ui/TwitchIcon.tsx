import React from 'react'

interface TwitchIconProps {
  size?: number
  className?: string
}

export function TwitchIcon({ size = 24, className = '' }: TwitchIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M11.5 3.5v9h-3l-2.5 2.5v-2.5h-3v-11h11.5z"
        fill="white"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M18.5 0h-13l-5 5v13h4v4l4-4h4l7-7V0h-5.5zM22 11l-3 3h-4l-3 3v-3H9V2h13v9zM18 4h2v5h-2V4zm-5 0h2v5h-2V4z"
        fill="currentColor"
      />
    </svg>
  )
}
