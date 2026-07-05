import { useEffect } from 'react'
import { reconnectKnownGoveeBleDevices, sendGoveeBleCommand } from '../../lib/govee-ble-runtime'
import type { GoveeBleCommandPayload } from '../../../shared/govee-ble'

export function GoveeBleRuntime() {
  useEffect(() => {
    let disposed = false

    reconnectKnownGoveeBleDevices().catch((error) => {
      console.warn('[Govee BLE] Could not restore Bluetooth devices:', error)
    })

    const unsubscribe = window.api.on('govee:ble-command', (payload: GoveeBleCommandPayload) => {
      if (disposed) return
      sendGoveeBleCommand(payload).catch((error) => {
        console.warn('[Govee BLE] Command failed:', error)
      })
    })

    return () => {
      disposed = true
      unsubscribe()
    }
  }, [])

  return null
}
