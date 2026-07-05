import type { ComponentType, ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: ReactNode
  kicker?: string
  icon?: ComponentType<{ size?: number; className?: string }>
  iconNode?: ReactNode
  actions?: ReactNode
  className?: string
  iconClassName?: string
  actionsClassName?: string
}

export function PageHeader({
  title,
  description,
  kicker,
  icon: Icon,
  iconNode,
  actions,
  className,
  iconClassName,
  actionsClassName
}: PageHeaderProps) {
  return (
    <header className={['app-page-header', className].filter(Boolean).join(' ')}>
      <div className="app-page-title-cluster">
        {(Icon || iconNode) && (
          <div className={['app-page-title-icon', iconClassName].filter(Boolean).join(' ')}>
            {iconNode ?? (Icon ? <Icon size={22} /> : null)}
          </div>
        )}
        <div className="app-page-title-copy">
          {kicker && <div className="app-page-title-kicker">{kicker}</div>}
          <h1>{title}</h1>
          {description && <p className="app-page-intro">{description}</p>}
        </div>
      </div>
      {actions && <div className={['app-page-actions', actionsClassName].filter(Boolean).join(' ')}>{actions}</div>}
    </header>
  )
}
