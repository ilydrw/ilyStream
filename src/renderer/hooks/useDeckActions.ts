import { useState, useEffect, useCallback } from 'react'

export interface DeckAction {
  id: string
  name: string
  icon: string
  color?: string
  type: string
  payload_json?: string
  sort_order: number
}

export function useDeckActions() {
  const [actions, setActions] = useState<DeckAction[]>([])

  const refreshActions = useCallback(async () => {
    if (!window.api?.studio?.getDeckActions) return
    const allActions = await window.api.studio.getDeckActions()
    setActions(allActions)
  }, [])

  useEffect(() => {
    refreshActions()
  }, [refreshActions])

  const saveAction = async (action: Partial<DeckAction>) => {
    await window.api.studio.saveDeckAction(action)
    await refreshActions()
  }

  const deleteAction = async (id: string) => {
    await window.api.studio.deleteDeckAction(id)
    await refreshActions()
  }

  return {
    actions,
    refreshActions,
    saveAction,
    deleteAction
  }
}
