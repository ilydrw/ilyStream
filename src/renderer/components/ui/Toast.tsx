import React, { useEffect, useState } from 'react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  message: string
  type: ToastType
  duration?: number
}

let toastListeners: ((toasts: Toast[]) => void)[] = []
let toasts: Toast[] = []

export const toast = {
  show: (message: string, type: ToastType = 'info', duration = 3000) => {
    const id = Math.random().toString(36).substring(2, 9)
    toasts = [...toasts, { id, message, type, duration }]
    toastListeners.forEach(l => l(toasts))
    
    setTimeout(() => {
      toast.dismiss(id)
    }, duration)
  },
  success: (msg: string) => toast.show(msg, 'success'),
  error: (msg: string) => toast.show(msg, 'error'),
  info: (msg: string) => toast.show(msg, 'info'),
  warning: (msg: string) => toast.show(msg, 'warning'),
  dismiss: (id: string) => {
    toasts = toasts.filter(t => t.id !== id)
    toastListeners.forEach(l => l(toasts))
  }
}

export function useToasts() {
  const [currentToasts, setCurrentToasts] = useState<Toast[]>(toasts)

  useEffect(() => {
    const listener = (newToasts: Toast[]) => setCurrentToasts(newToasts)
    toastListeners.push(listener)
    return () => {
      toastListeners = toastListeners.filter(l => l !== listener)
    }
  }, [])

  return currentToasts
}

export function ToastContainer() {
  const activeToasts = useToasts()

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
      {activeToasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2.5 pl-3 pr-2 py-2 rounded-md bg-[#0E1014] border shadow-[0_12px_32px_rgba(0,0,0,0.5)] animate-alert ${t.type === 'success' ? 'border-success/30 text-success' : ''} ${t.type === 'error' ? 'border-danger/30 text-danger' : ''} ${t.type === 'warning' ? 'border-warning/30 text-warning' : ''} ${t.type === 'info' ? 'border-accent/30 text-accent' : ''}`}
        >
          <div className={`w-1.5 h-1.5 rounded-full ${ t.type === 'success' ? 'bg-success' : t.type === 'error' ? 'bg-danger' : t.type === 'warning' ? 'bg-warning' : 'bg-accent' }`} />
          <span className="text-[13px] font-medium tracking-tight">{t.message}</span>
          <button
            onClick={() => toast.dismiss(t.id)}
            className="w-6 h-6 grid place-items-center rounded text-white/40 hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
