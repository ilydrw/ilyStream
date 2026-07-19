import { IconChevronRight, IconChevronLeft, IconChevronDown } from '../ui/icons'
import { IconActivity, IconCreate, IconAutomation, IconSettings, IconBroadcast } from '../ui/icons/nav'
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
    drawerTitle: 'Go live',
    icon: IconActivity,
    items: [itemByPath('/'), itemByPath('/health'), itemByPath('/broadcast'), itemByPath('/chat'), itemByPath('/stats'), itemByPath('/recordings')]
  },
  {
    id: 'create',
    label: 'Create',
    drawerTitle: 'Overlays & assets',
    icon: IconCreate,
    items: [itemByPath('/widgets'), itemByPath('/alerts'), itemByPath('/soundboard'), itemByPath('/voice-effects')]
  },
  {
    id: 'automation',
    label: 'Automate',
    drawerTitle: 'Chat automation',
    icon: IconAutomation,
    items: [itemByPath('/tts'), itemByPath('/ai-cohost'), itemByPath('/triggers'), itemByPath('/spotify'), itemByPath('/event-lab')]
  },
  {
    id: 'connect',
    label: 'Connect',
    drawerTitle: 'Connections',
    icon: IconBroadcast,
    items: [
      { isHeader: true, label: 'Live Platforms' },
      itemByPath('/connections/tiktok'),
      itemByPath('/connections/twitch'),
      itemByPath('/connections/youtube'),
      itemByPath('/connections/kick'),
      itemByPath('/connections/restream'),
      { isHeader: true, label: 'Social Channels' },
      itemByPath('/connections/discord'),
      itemByPath('/connections/instagram'),
      itemByPath('/connections/facebook'),
      itemByPath('/connections/x'),
      itemByPath('/connections/linkedin'),
      itemByPath('/connections/telegram'),
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
      itemByPath('/connections/yeelight')
    ]
  },
  {
    id: 'system',
    label: 'System',
    drawerTitle: 'App settings',
    icon: IconSettings,
    items: [itemByPath('/settings'), itemByPath('/console'), itemByPath('/engine-preview')]
  }
]

export function Sidebar() {
  const location = useLocation()
  const { sidebarCollapsed, toggleSidebar, isPageDirty, setConsoleOpen } = useUIStore()
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  const activeGroup =
    navigationGroups.find((group) =>
      group.items.some((node) => {
        if ('isHeader' in node) return false
        return isRouteActive(location.pathname, node.path)
      })
    ) ?? navigationGroups[0]

  const handleNavClick = (e: React.MouseEvent, path: string) => {
    if (path === '/console') {
      e.preventDefault()
      setConsoleOpen(true)
      return
    }

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
                onClick={(e) => handleNavClick(e, targetPath)}
                className={`app-rail-item ${isActive ? 'is-active' : ''} ${isPageDirty ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <div className="app-rail-icon-wrapper">
                  <Icon size={18} />
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
            className="w-9 h-9 flex items-center justify-center rounded-md bg-transparent border border-white/[0.05] text-white/40 hover:text-white hover:bg-white/[0.03] hover:border-white/[0.12] transition-colors active:translate-y-px"
            title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {sidebarCollapsed ? <IconChevronRight size={16} /> : <IconChevronLeft size={16} />}
          </button>
        </div>
      </div>

      {/* Secondary Drawer - Collapsible */}
      <div
        aria-hidden={sidebarCollapsed}
        className={`app-sidebar-drawer titlebar-no-drag flex flex-col overflow-hidden whitespace-nowrap bg-background/80 border-r border-white/5 relative transition-[width,opacity] duration-300 ease-in-out ${ sidebarCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100' }`}
        style={{
          width: sidebarCollapsed ? 0 : 240,
          flexBasis: sidebarCollapsed ? 0 : 240,
          borderRightWidth: sidebarCollapsed ? 0 : 1,
        }}
      >
        <div className="app-sidebar-brand px-4 py-4 border-b border-white/[0.05] shrink-0">
          <div className="min-w-0">
            <h1 className="text-[12px] font-semibold text-white/85 tracking-tight">
              {activeGroup.label}
            </h1>
            <p className="text-[11px] font-normal text-white/40 mt-0.5">
              {activeGroup.drawerTitle}
            </p>
          </div>
        </div>

        <nav className="app-drawer-nav flex-1 overflow-y-auto custom-scrollbar" aria-label={`${activeGroup.drawerTitle} navigation`}>
          <div className="app-drawer-heading">
            <h2>{activeGroup.drawerTitle}</h2>
          </div>

          <div className="app-drawer-list">
            {sections.map((section, sIdx) => {
              const headerLabel = section.header?.label || 'General'
              const isExpanded = expandedSections[headerLabel] || false

              return (
                <div key={sIdx} className="flex flex-col">
                  {section.header && (
                    <div className="flex items-center justify-between px-3 pt-5 pb-1.5 group/header">
                      <div className="flex items-center gap-3 flex-1">
                        <span className="text-[11px] font-semibold text-white/32 tracking-normal normal-case">{section.header.label}</span>
                      </div>
                      {section.items.length > 6 && (
                        <button
                          type="button"
                          onClick={() => toggleSection(headerLabel)}
                          className="ml-3 p-1 rounded-md hover:bg-white/5 text-white/30 hover:text-white/70 transition-colors active:translate-y-px"
                        >
                          <IconChevronDown
                            size={14}
                            className={`transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}
                          />
                        </button>
                      )}
                    </div>
                  )}

                  <div className={`flex flex-col transition-all duration-200 ease-out ${ section.items.length > 6 ? (isExpanded ? 'max-h-[800px] overflow-y-visible' : 'max-h-[220px] overflow-y-auto custom-scrollbar-slim') : '' }`}>
                    {section.items.map((item) => {
                      const Icon = item.icon
                      return (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          end={item.path === '/' || item.path === '/connections'}
                          onClick={(e) => handleNavClick(e, item.path)}
                          className={({ isActive }) =>
                            `app-drawer-item ${isActive ? 'is-active' : ''} ${isPageDirty ? 'cursor-not-allowed opacity-50' : ''}`
                          }
                        >
                          <div className="app-drawer-icon-container">
                            <Icon size={16} />
                          </div>
                          <span className="truncate">{item.drawerLabel ?? item.label}</span>
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
