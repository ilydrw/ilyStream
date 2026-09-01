import React from 'react'
import { IconClock } from '@tabler/icons-react'
import { PageHeader } from '../layout/PageHeader'
import { getIntegration } from '../../../shared/integration-registry'

export interface PlannedIntegrationPageProps {
  integrationId: string
}

export function PlannedIntegrationPage({ integrationId }: PlannedIntegrationPageProps) {
  const integration = getIntegration(integrationId)

  if (!integration) {
    return <div className="p-8 text-white">Integration not found</div>
  }

  return (
    <div className="app-page">
      <PageHeader
        title={integration.label}
        description="This integration is planned but is not available in the current build."
        iconNode={<IconClock size={24} className="text-white/50" />}
      />

      <div className="flex flex-col items-center justify-center min-h-[400px] mt-8 p-8 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
        <div className="w-20 h-20 rounded-2xl bg-white/[0.03] flex items-center justify-center mb-6 text-white/20">
          <IconClock size={40} />
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 text-accent text-xs font-semibold tracking-wider mb-6">
          <IconClock size={14} />
          <span>COMING SOON</span>
        </div>

        <h2 className="text-xl font-semibold text-white mb-3">
          {integration.label} is on our roadmap
        </h2>

        <p className="text-sm text-white/40 max-w-md mx-auto leading-relaxed">
          We are actively working on bringing {integration.label} support to ilyStream.
          Check back in a future update or keep an eye on our release notes.
        </p>
      </div>
    </div>
  )
}
