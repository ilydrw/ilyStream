import { routes, AppRoute } from '../../routes'

export type NavigationItem = Omit<AppRoute, 'component'>

export const navigationItems: NavigationItem[] = routes.map(({ component, ...item }) => item)

export function getNavigationItem(pathname: string): NavigationItem {
  const exactMatch = navigationItems.find((item) => item.path === pathname)
  if (exactMatch) {
    return exactMatch
  }

  const nestedMatch = navigationItems.find(
    (item) => item.path !== '/' && pathname.startsWith(item.path)
  )

  return nestedMatch ?? navigationItems[0]
}

