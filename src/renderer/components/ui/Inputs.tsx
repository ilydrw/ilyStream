import { ReactNode } from 'react'

export function Toggle({ value, onChange, disabled = false }: { value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      role="switch"
      aria-checked={value}
      className={`relative h-6 w-11 rounded-full transition-all duration-300 ${
        value 
          ? 'bg-white/40' 
          : 'bg-white/10 shadow-inner'
      } ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:scale-105 active:scale-95'}`}
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all duration-500 ${
          value ? 'left-6' : 'left-1'
        }`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}
      />
    </button>
  )
}


export function NumberInput({
  value,
  onChange,
  min,
  max,
  className = ''
}: {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
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
      className={`app-input font-mono text-sm ${className}`}
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
      className={`app-input text-sm ${className}`}
    />
  )
}
