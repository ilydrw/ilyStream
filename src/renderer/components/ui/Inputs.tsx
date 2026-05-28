import { ReactNode } from 'react'

export function Toggle({ value, onChange, disabled = false }: { value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      role="switch"
      aria-checked={value}
      className={`relative h-5 w-9 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#19c8ff] focus-visible:ring-offset-2 focus-visible:ring-offset-background ${ value ? 'bg-accent' : 'bg-white/10' } ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-all duration-200 ${ value ? 'left-[18px]' : 'left-0.5' }`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
      />
    </button>
  )
}


export function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  className = ''
}: {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  className?: string
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(event) => {
        const nextValue = Number(event.target.value)
        if (nextValue >= min && nextValue <= max) onChange(nextValue)
      }}
      min={min}
      max={max}
      step={step}
      className={`app-input font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#19c8ff] focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all ${className}`}
    />
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  className = ''
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: 'text' | 'password'
  className?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={`app-input text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#19c8ff] focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all ${className}`}
    />
  )
}
