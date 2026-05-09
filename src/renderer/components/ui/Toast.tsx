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
    <div className="fixed bottom-8 right-8 z-[9999] flex flex-col gap-3 pointer-events-none">
      {activeToasts.map((t) => (
        <div
          key={t.id}
          className={`
            pointer-events-auto flex items-center gap-4 px-6 py-4 rounded-2xl shadow-2xl backdrop-blur-xl border animate-alert
            ${t.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : ''}
            ${t.type === 'error' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : ''}
            ${t.type === 'warning' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : ''}
            ${t.type === 'info' ? 'bg-sky-500/10 border-sky-500/20 text-sky-400' : ''}
          `}
        >
          <div className={`w-2 h-2 rounded-full ${
            t.type === 'success' ? 'bg-emerald-400' : 
            t.type === 'error' ? 'bg-rose-400' : 
            t.type === 'warning' ? 'bg-amber-400' : 'bg-sky-400'
          }`} />
          <span className="text-sm font-bold uppercase tracking-widest">{t.message}</span>
          <button 
            onClick={() => toast.dismiss(t.id)}
            className="ml-2 hover:opacity-50 transition-opacity"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
