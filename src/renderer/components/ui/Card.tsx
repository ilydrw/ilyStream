import React from 'react'
import { cn } from '../../lib/utils'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glass?: boolean
}

export function Card({ className, glass = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-[10px] bg-card',
        glass && 'bg-white/[0.025]',
        className
      )}
      {...props}
    />
  )
}
