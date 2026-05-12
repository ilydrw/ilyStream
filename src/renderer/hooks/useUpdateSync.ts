import { useEffect } from 'react'
import { useUIStore } from '../stores/ui-store'
import { toast } from '../components/ui/Toast'

export function useUpdateSync() {
  const setUpdateStatus = useUIStore((state) => state.setUpdateStatus)

  useEffect(() => {
    if (!window.api?.on) return

    const unsubscribe = window.api.on('system:update-status', (payload: any) => {
      console.log('[updates] Status update received:', payload)
      
      if (payload.state === 'downloaded') {
        toast.success(`Update v${payload.version} is ready to install!`)
      } else if (payload.state === 'error' && payload.message) {
        toast.error(`Update error: ${payload.message}`)
      }

      setUpdateStatus(payload)
    })

    return () => {
      unsubscribe?.()
    }
  }, [setUpdateStatus])
}
