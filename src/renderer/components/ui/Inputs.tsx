import { ReactNode, useRef } from 'react'
import { IconMinus, IconPlus } from './icons'

export function Toggle({ value, onChange, disabled = false }: { value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      role="switch"
      aria-checked={value}
      className={`relative h-5 w-9 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background ${ value ? 'bg-accent' : 'bg-white/10' } ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
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
  const stepSize = step ?? 1
  const repeatTimerRef = useRef<number | null>(null)
  const repeatIntervalRef = useRef<number | null>(null)

  const clamp = (next: number) => Math.min(max, Math.max(min, next))

  const bump = (direction: 1 | -1) => {
    onChange(clamp(value + direction * stepSize))
  }

  // Press-and-hold autorepeat: a short delay before kicking in, then a tight
  // interval so dragging a value across a wide range feels native instead of
  // requiring 80 separate clicks.
  const startRepeat = (direction: 1 | -1) => {
    bump(direction)
    stopRepeat()
    repeatTimerRef.current = window.setTimeout(() => {
      repeatIntervalRef.current = window.setInterval(() => bump(direction), 60)
    }, 350)
  }

  const stopRepeat = () => {
    if (repeatTimerRef.current !== null) {
      window.clearTimeout(repeatTimerRef.current)
      repeatTimerRef.current = null
    }
    if (repeatIntervalRef.current !== null) {
      window.clearInterval(repeatIntervalRef.current)
      repeatIntervalRef.current = null
    }
  }

  const stepperButton = (direction: 1 | -1, label: string, icon: ReactNode) => (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault()
        startRepeat(direction)
      }}
      onPointerUp={stopRepeat}
      onPointerLeave={stopRepeat}
      onPointerCancel={stopRepeat}
      disabled={direction === 1 ? value >= max : value <= min}
      className="grid place-items-center w-9 h-9 rounded-md text-white/55 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.1] transition-colors disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer select-none"
    >
      {icon}
    </button>
  )

  return (
    <div
      className={`app-input-stepper inline-flex items-center gap-0.5 h-10 px-1 rounded-md border border-[var(--line)] bg-white/[0.025] focus-within:border-accent/40 focus-within:bg-white/[0.04] transition-colors ${className}`}
    >
      {stepperButton(-1, 'Decrease value', <IconMinus size={15} />)}
      <input
        type="number"
        value={value}
        onChange={(event) => {
          const raw = event.target.value
          if (raw === '' || raw === '-') return
          const nextValue = Number(raw)
          if (Number.isFinite(nextValue)) onChange(clamp(nextValue))
        }}
        min={min}
        max={max}
        step={step}
        className="flex-1 min-w-0 bg-transparent border-none outline-none text-center font-mono text-[14px] text-white tabular-nums px-1 focus-visible:outline-none"
      />
      {stepperButton(1, 'Increase value', <IconPlus size={15} />)}
    </div>
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
      className={`app-input text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all ${className}`}
    />
  )
}
