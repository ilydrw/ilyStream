import { IconTerminal2 } from '@tabler/icons-react'
import { ConsoleSection } from '../SettingsPage/components/ConsoleSection'

export default function ConsolePage() {
  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="flex items-center gap-6">
          <div className="flex items-center justify-center">
            <IconTerminal2 size={32} className="text-accent" />
          </div>
          <div>
            <h1>Console</h1>
            <p className="app-page-intro">
              Real-time application log viewer. Filter by severity, search messages, and export diagnostics.
            </p>
          </div>
        </div>
      </header>

      <ConsoleSection />
    </div>
  )
}
