import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Modal } from './Modal'
import { ConsoleSection } from '../../pages/SettingsPage/components/ConsoleSection'
import { useUIStore } from '../../stores/ui-store'

export function ConsoleModal() {
  const { consoleOpen, setConsoleOpen } = useUIStore()
  const location = useLocation()

  // Close console on navigation to prevent "trapping" the user
  useEffect(() => {
    if (consoleOpen) {
      setConsoleOpen(false)
    }
  }, [location.pathname])

  return (
    <Modal
      open={consoleOpen}
      onClose={() => setConsoleOpen(false)}
      title="System Console"
      className="max-w-6xl w-[95vw]"
      noScroll
    >
      <div className="h-[75vh] flex flex-col">
        <ConsoleSection />
      </div>
    </Modal>
  )
}
