export type IntegrationStatus = 'implemented' | 'beta' | 'planned'

export interface IntegrationMeta {
  id: string
  label: string
  status: IntegrationStatus
  statusNote?: string
}

export const INTEGRATIONS: Record<string, IntegrationMeta> = {
  tiktok:    { id: 'tiktok',    label: 'TikTok',       status: 'implemented' },
  twitch:    { id: 'twitch',    label: 'Twitch',       status: 'implemented' },
  youtube:   { id: 'youtube',   label: 'YouTube',      status: 'implemented' },
  kick:      { id: 'kick',      label: 'Kick',         status: 'implemented' },
  discord:   { id: 'discord',   label: 'Discord',      status: 'implemented' },
  x:         { id: 'x',         label: 'X Composer',   status: 'implemented' },
  deskthing: { id: 'deskthing', label: 'DeskThing',    status: 'implemented' },
  hue:       { id: 'hue',       label: 'Philips Hue',  status: 'implemented' },
  govee:     { id: 'govee',     label: 'Govee',        status: 'implemented' },
  razer:     { id: 'razer',     label: 'Razer Chroma', status: 'implemented' },
  restream:  { id: 'restream',  label: 'ReStream',     status: 'planned' },
  instagram: { id: 'instagram', label: 'Instagram',    status: 'planned' },
  facebook:  { id: 'facebook',  label: 'Facebook',     status: 'planned' },
  linkedin:  { id: 'linkedin',  label: 'LinkedIn',     status: 'planned' },
  telegram:  { id: 'telegram',  label: 'Telegram',     status: 'planned' },
  elgato:    { id: 'elgato',    label: 'Elgato',       status: 'planned' },
  lifx:      { id: 'lifx',      label: 'LIFX',         status: 'planned' },
  logitech:  { id: 'logitech',  label: 'Logitech G',   status: 'planned' },
  loupedeck: { id: 'loupedeck', label: 'Loupedeck',    status: 'planned' },
  nanoleaf:  { id: 'nanoleaf',  label: 'Nanoleaf',     status: 'planned' },
  wiz:       { id: 'wiz',       label: 'WiZ',          status: 'planned' },
  yeelight:  { id: 'yeelight',  label: 'Yeelight',     status: 'planned' },
}

export function getIntegration(id: string): IntegrationMeta | undefined {
  return INTEGRATIONS[id]
}

export function isPlanned(id: string): boolean {
  return INTEGRATIONS[id]?.status === 'planned'
}

export function getPlannedIntegrations(): IntegrationMeta[] {
  return Object.values(INTEGRATIONS).filter(i => i.status === 'planned')
}

export function getImplementedIntegrations(): IntegrationMeta[] {
  return Object.values(INTEGRATIONS).filter(i => i.status === 'implemented')
}
