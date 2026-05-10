import { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

interface Props {
  children: ReactNode
}

export function DashboardLayout({ children }: Props) {
  return (
    <div className="app-shell">
      <Header />
      <div className="app-body">
        <Sidebar />
        <main className="app-main custom-scrollbar">
          {children}
        </main>
      </div>
    </div>
  )
}
