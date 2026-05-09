import React from 'react'
import { cn } from '../../lib/utils'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glass?: boolean
}

export function Card({ className, glass = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-card shadow-sm',
        glass && 'bg-white/[0.02] backdrop-blur-md border-white/10',
        className
      )}
      {...props}
    />
  )
}
