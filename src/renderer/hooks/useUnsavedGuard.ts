import { useEffect, useCallback, useState } from 'react'
import { useBlocker } from 'react-router-dom'

interface UnsavedGuardOptions {
  isDirty: boolean
  onSave?: () => Promise<void> | void
  onDiscard?: () => void
}

export function useUnsavedGuard({ isDirty, onSave, onDiscard }: UnsavedGuardOptions) {
  // Use React Router's useBlocker to prevent navigation when dirty
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname
  )

  // Register beforeunload handler for window close
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Modern browsers ignore custom messages but require returnValue
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // State for async save in progress
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = useCallback(async () => {
    if (!onSave) return
    setIsSaving(true)
    try {
      await onSave()
      blocker.proceed?.()
    } catch (err) {
      console.error('[useUnsavedGuard] Save failed:', err)
    } finally {
      setIsSaving(false)
    }
  }, [onSave, blocker])

  const handleDiscard = useCallback(() => {
    onDiscard?.()
    blocker.proceed?.()
  }, [onDiscard, blocker])

  const handleStay = useCallback(() => {
    blocker.reset?.()
  }, [blocker])

  return {
    isBlocked: blocker.state === 'blocked',
    isSaving,
    handleSave,
    handleDiscard,
    handleStay,
  }
}
