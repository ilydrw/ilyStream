import {IconChevronRight, IconSettings, IconBolt, IconActivity, IconMusic, IconChevronLeft, IconChevronDown} from '@tabler/icons-react'
import { useState, useMemo } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import type { NavigationItem } from './navigation'
import { navigationItems } from './navigation'
import { useUIStore } from '../../stores/ui-store'

type DrawerItem = NavigationItem & {
  drawerLabel?: string
}

type DrawerHeader = {
  isHeader: true
  label: string
}

type DrawerNode = DrawerItem | DrawerHeader

interface NavigationGroup {
  id: string
  label: string
  drawerTitle: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  items: DrawerNode[]
}

const itemByPath = (path: string): DrawerItem => {
  const item = navigationItems.find((navigationItem) => navigationItem.path === path)
  if (!item) {
    throw new Error(`Missing navigation item for ${path}`)
  }

  return item
}

const navigationGroups: NavigationGroup[] = [
  {
    id: 'live',
    label: 'Live',
    drawerTitle: 'Live Operations',
    icon: IconActivity,
    items: [itemByPath('/'), itemByPath('/broadcast'), itemByPath('/stats'), itemByPath('/chat')]
  },
  {
    id: 'studio',
    label: 'Studio',
    drawerTitle: 'Studio Assets',
    icon: IconMusic,
    items: [itemByPath('/alerts'), itemByPath('/soundboard'), itemByPath('/voice-effects'), itemByPath('/widgets')]
  },
  {
    id: 'automation',
    label: 'Rules',
    drawerTitle: 'Automation & Logic',
    icon: IconBolt,
    items: [itemByPath('/ai-cohost'), itemByPath('/triggers'), itemByPath('/tts')]
  },
  {
    id: 'system',
    label: 'System',
    drawerTitle: 'Studio Systems',
    icon: IconSettings,
    items: [
      { isHeader: true, label: 'Platform' },
      itemByPath('/connections/discord'),
      itemByPath('/connections/facebook'),
      itemByPath('/connections/instagram'),
      itemByPath('/connections/kick'),
      itemByPath('/connections/linkedin'),
      itemByPath('/connections/restream'),
      itemByPath('/spotify'),
      itemByPath('/connections/telegram'),
      itemByPath('/connections/tiktok'),
      itemByPath('/connections/twitch'),
      itemByPath('/connections/x'),
      itemByPath('/connections/youtube'),
      { isHeader: true, label: 'Hardware' },
      itemByPath('/connections/deskthing'),
      itemByPath('/connections/elgato'),
      itemByPath('/connections/govee'),
      itemByPath('/connections/hue'),
      itemByPath('/connections/lifx'),
      itemByPath('/connections/logitech'),
      itemByPath('/connections/loupedeck'),
      itemByPath('/connections/nanoleaf'),
      itemByPath('/connections/razer'),
      itemByPath('/connections/wiz'),
      itemByPath('/connections/yeelight'),
      { isHeader: true, label: 'General' },
      itemByPath('/console'),
      itemByPath('/settings')
    ]
  }
]

export function Sidebar() {
  const location = useLocation()
  const { sidebarCollapsed, toggleSidebar, isPageDirty } = useUIStore()
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  
  const activeGroup =
    navigationGroups.find((group) =>
      group.items.some((node) => {
        if ('isHeader' in node) return false
        return isRouteActive(location.pathname, node.path)
      })
    ) ?? navigationGroups[0]

  const handleNavClick = (e: React.MouseEvent) => {
    console.log('[nav] Click detected. isPageDirty:', isPageDirty);
    if (isPageDirty) {
      console.warn('[nav] Navigation blocked because page is dirty.');
      e.preventDefault()
    }
  }

  const sections = useMemo(() => {
    const groups: { header?: DrawerHeader; items: DrawerItem[] }[] = []
    let currentGroup: { header?: DrawerHeader; items: DrawerItem[] } = { items: [] }

    activeGroup.items.forEach((node) => {
      if ('isHeader' in node) {
        if (currentGroup.header || currentGroup.items.length > 0) {
          groups.push(currentGroup)
        }
        currentGroup = { header: node, items: [] }
      } else {
        currentGroup.items.push(node)
      }
    })
    groups.push(currentGroup)
    return groups
  }, [activeGroup])

  const toggleSection = (label: string) => {
    setExpandedSections((prev) => ({ ...prev, [label]: !prev[label] }))
  }

  return (
    <aside className={`app-sidebar titlebar-drag hidden md:flex h-full overflow-hidden ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
      {/* Primary Rail */}
      <div className="app-sidebar-rail titlebar-no-drag shrink-0">
        <nav className="app-rail-nav" aria-label="Primary modules">
          {navigationGroups.map((group) => {
            const Icon = group.icon
            const isActive = group.id === activeGroup.id
            const targetPath = (group.items.find(item => !('isHeader' in item)) as DrawerItem)?.path ?? '/'

            return (
              <NavLink
                key={group.id}
                to={targetPath}
                onClick={handleNavClick}
                className={`app-rail-item ${isActive ? 'is-active' : ''} ${isPageDirty ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <div className="app-rail-icon-wrapper">
                  <Icon size={24} />
                </div>
                <span className="app-rail-label">{group.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="mt-auto pb-6 flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              toggleSidebar()
            }}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/[0.03] border border-white/5 text-white/40 hover:text-white hover:bg-accent/20 hover:border-accent/30 transition-all active:scale-95 shadow-lg"
            title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {sidebarCollapsed ? <IconChevronRight size={18} /> : <IconChevronLeft size={18} />}
          </button>
        </div>
      </div>

      {/* Secondary Drawer - Collapsible */}
      <div
        aria-hidden={sidebarCollapsed}
        className={`app-sidebar-drawer titlebar-no-drag flex flex-col overflow-hidden whitespace-nowrap bg-background/80 border-r border-white/5 relative transition-[width,opacity] duration-300 ease-in-out ${
          sidebarCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
        style={{
          width: sidebarCollapsed ? 0 : 228,
          flexBasis: sidebarCollapsed ? 0 : 228,
          borderRightWidth: sidebarCollapsed ? 0 : 1,
        }}
      >
        <div className="glass absolute inset-0 pointer-events-none opacity-40" />

        <div className="app-sidebar-brand px-6 py-5 border-b border-white/[0.03] shrink-0">
          <div className="min-w-0">
            <h1 className="kicker mb-1.5 opacity-100">
              {activeGroup.label}
            </h1>
            <p className="text-[9px] font-black tracking-[0.1em] text-white/10 uppercase">
              {activeGroup.drawerTitle}
            </p>
          </div>
        </div>

        <nav className="app-drawer-nav flex-1 overflow-y-auto custom-scrollbar" aria-label={`${activeGroup.drawerTitle} navigation`}>
          <div className="app-drawer-heading">
            <h2>{activeGroup.drawerTitle}</h2>
            <div className="h-px flex-1 bg-white/[0.03] ml-4" />
          </div>

          <div className="app-drawer-list">
            {sections.map((section, sIdx) => {
              const headerLabel = section.header?.label || 'General'
              const isExpanded = expandedSections[headerLabel] || false

              return (
                <div key={sIdx} className="flex flex-col">
                  {section.header && (
                    <div className="flex items-center justify-between px-4 pt-8 pb-3 group/header">
                      <div className="flex items-center gap-4 flex-1">
                        <span className="kicker opacity-100">{section.header.label}</span>
                        <div className="h-px flex-1 bg-white/[0.03]" />
                      </div>
                      {section.items.length > 4 && (
                        <button
                          type="button"
                          onClick={() => toggleSection(headerLabel)}
                          className="ml-3 p-1 rounded-md hover:bg-white/5 text-white/20 hover:text-white/60 transition-all active:scale-90"
                        >
                          <IconChevronDown
                            size={14}
                            className={`transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}
                          />
                        </button>
                      )}
                    </div>
                  )}
                  
                  <div className={`flex flex-col transition-all duration-200 ease-out ${
                    section.items.length > 4 
                      ? (isExpanded ? 'max-h-[800px] overflow-y-visible' : 'max-h-[180px] overflow-y-auto custom-scrollbar-slim') 
                      : ''
                  }`}>
                    {section.items.map((item) => {
                      const Icon = item.icon
                      return (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          end={item.path === '/' || item.path === '/connections'}
                          onClick={handleNavClick}
                          className={({ isActive }) =>
                            `app-drawer-item ${isActive ? 'is-active' : ''} ${isPageDirty ? 'cursor-not-allowed opacity-50' : ''}`
                          }
                        >
                          <div className="app-drawer-icon-container">
                            <Icon size={20} />
                          </div>
                          <span className="truncate">{item.drawerLabel ?? item.label}</span>
                          <IconChevronRight size={12} className="ml-auto opacity-0 group-hover:opacity-20 transition-opacity" />
                        </NavLink>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </nav>
      </div>
    </aside>
  )
}

function isRouteActive(pathname: string, itemPath: string): boolean {
  if (itemPath === '/') {
    return pathname === '/'
  }

  return pathname === itemPath || pathname.startsWith(`${itemPath}/`)
}
