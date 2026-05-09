import { ReactNode, useState, useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

interface Props {
  children: ReactNode
}

export function DashboardLayout({ children }: Props) {
  const [metrics, setMetrics] = useState({ scale: 1, logicalHeight: 1000 })

  useEffect(() => {
    const handleResize = () => {
      // We lock the "Logical Width" to 1600px.
      // This ensures the layout (sidebar width, columns, etc) is EXACTLY the same everywhere.
      const targetWidth = 1600
      const scale = window.innerWidth / targetWidth
      
      // We calculate the logical height needed to fill the actual window height at this scale
      const logicalHeight = window.innerHeight / scale
      
      setMetrics({ scale, logicalHeight })
    }

    window.addEventListener('resize', handleResize)
    handleResize()
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div className="h-screen w-screen overflow-hidden bg-background">
      {/* 
        This container always thinks it is 1600px wide.
        The height is dynamic to ensure it perfectly fills the window.
      */}
      <div 
        className="bg-background text-foreground overflow-hidden flex shrink-0"
        style={{ 
          width: '1600px', 
          height: `${metrics.logicalHeight}px`,
          transform: `scale(${metrics.scale})`,
          transformOrigin: 'top left',
          transition: 'transform 0.05s linear' 
        }}
      >
        <Sidebar />
        <div className="min-w-0 flex-1 bg-background flex flex-col overflow-hidden">
          <Header />
          <main className="flex-1 w-full min-w-0 flex flex-col min-h-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}

