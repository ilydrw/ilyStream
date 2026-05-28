import React from 'react'
import { cn } from '../../lib/utils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg' | 'icon'
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: ButtonProps) {
  const variants = {
    primary: 'bg-accent text-[#04111a] hover:bg-accent-hover transition-colors',
    secondary: 'bg-white/[0.03] border border-white/[0.05] text-white hover:bg-white/[0.06] hover:border-white/[0.12]',
    outline: 'border border-white/[0.05] bg-transparent hover:bg-white/[0.03] hover:border-white/[0.12] text-foreground',
    ghost: 'bg-transparent hover:bg-white/[0.03] text-muted hover:text-foreground',
    danger: 'bg-[#e11d48] text-white hover:bg-[#f43f5e]'
  }

  const sizes = {
    sm: 'h-7 px-2.5 text-xs',
    md: 'h-[34px] px-3.5 text-[13px]',
    lg: 'h-10 px-5 text-[14px]',
    icon: 'h-[34px] w-[34px] flex items-center justify-center'
  }

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors active:translate-y-px disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        variant === 'primary' && 'font-semibold',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  )
}
