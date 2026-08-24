import { useEffect, useMemo, useState } from 'react'
import {
  IconBolt,
  IconCoin,
  IconDeviceGamepad2,
  IconGift,
  IconPlus,
  IconRefresh,
  IconSettings,
  IconTrash,
  IconTrophy
} from '@tabler/icons-react'
import { PageHeader } from '../../components/layout/PageHeader'
import { IconEconomy } from '../../components/ui/icons/nav'
import type { LightingDevice } from '../../../shared/lighting'
import {
  DEFAULT_ECONOMY_CONFIG,
  type EconomyConfig,
  type EconomyDashboard,
  type EconomyLightingAction,
  type EconomyRedemption,
  type EconomySoundAction
} from '../../../shared/economy'

type Tab = 'overview' | 'rewards' | 'settings'

interface SoundOption {
  id: string
  name: string
}

const EMPTY_DASHBOARD: EconomyDashboard = {
  config: DEFAULT_ECONOMY_CONFIG,
  totals: {
    accounts: 0,
    pointsInCirculation: 0,
    lifetimeEarned: 0,
    lifetimeSpent: 0,
    activeRedemptions: 0
  },
  leaders: [],
  recentTransactions: [],
  redemptions: []
}

function newRedemption(soundId = ''): EconomyRedemption {
  return {
    id: '',
    name: 'New reward',
    command: 'reward',
    description: '',
    cost: 250,
    minLevel: 1,
    cooldownSeconds: 30,
    enabled: true,
    action: soundId
      ? { type: 'sound', soundId, volume: 1 }
      : {
          type: 'lighting',
          effect: 'flash',
          color: '#19C8FF',
          durationMs: 1500,
          targetDeviceIds: [],
          targetPlatforms: []
        }
  }
}

export default function EconomyPage() {
  const [dashboard, setDashboard] = useState<EconomyDashboard>(EMPTY_DASHBOARD)
  const [configDraft, setConfigDraft] = useState<EconomyConfig>(DEFAULT_ECONOMY_CONFIG)
  const [sounds, setSounds] = useState<SoundOption[]>([])
  const [devices, setDevices] = useState<LightingDevice[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [editing, setEditing] = useState<EconomyRedemption | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [grant, setGrant] = useState({ username: '', platform: 'tiktok', amount: 100, reason: 'Host bonus' })

  const load = async () => {
    if (!window.api?.economy) return
    setLoading(true)
    setError(null)
    try {
      const [nextDashboard, soundFiles, lightingState] = await Promise.all([
        window.api.economy.getDashboard(),
        window.api.sound.getAll('board').catch(() => []),
        window.api.lighting.getState().catch(() => ({ devices: [] }))
      ])
      const data = nextDashboard as EconomyDashboard
      setDashboard(data)
      setConfigDraft(data.config)
      setSounds((soundFiles as SoundOption[]).map((sound) => ({ id: sound.id, name: sound.name })))
      setDevices((lightingState as { devices: LightingDevice[] }).devices || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the viewer economy.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    const interval = window.setInterval(() => {
      if (activeTab === 'overview') void load()
    }, 10_000)
    return () => window.clearInterval(interval)
  }, [activeTab])

  const saveConfig = async () => {
    setSaving(true)
    setError(null)
    try {
      const saved = await window.api.economy.updateConfig(configDraft)
      setConfigDraft(saved)
      setNotice('Economy settings saved.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save economy settings.')
    } finally {
      setSaving(false)
    }
  }

  const saveRedemption = async () => {
    if (!editing) return
    setSaving(true)
    setError(null)
    try {
      await window.api.economy.saveRedemption(editing)
      setEditing(null)
      setNotice('Reward saved. Its chat command is live immediately.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the reward.')
    } finally {
      setSaving(false)
    }
  }

  const removeRedemption = async (redemption: EconomyRedemption) => {
    if (!window.confirm(`Delete ${redemption.name}? Existing transaction history will be kept.`)) return
    await window.api.economy.deleteRedemption(redemption.id)
    if (editing?.id === redemption.id) setEditing(null)
    await load()
  }

  const grantPoints = async () => {
    if (!grant.username.trim() || !grant.amount) return
    setSaving(true)
    setError(null)
    try {
      const balance = await window.api.economy.grantPoints(grant)
      setNotice(`${grant.username}'s balance is now ${formatNumber(balance)} ${configDraft.currencyName}.`)
      setGrant((current) => ({ ...current, username: '' }))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not adjust that balance.')
    } finally {
      setSaving(false)
    }
  }

  const tabs = useMemo(() => [
    { id: 'overview' as const, label: 'Overview', icon: IconTrophy },
    { id: 'rewards' as const, label: 'Reward shop', icon: IconGift },
    { id: 'settings' as const, label: 'Rules & games', icon: IconSettings }
  ], [])

  return (
    <div className="app-page">
      <PageHeader
        title="Points & Rewards"
        description="A level-aware viewer economy with fair games, daily streaks, sound redemptions, and studio lighting rewards."
        icon={IconEconomy}
        actions={
          <button onClick={() => void load()} disabled={loading} className="app-button !h-10 !px-4 text-[10px] font-semibold tracking-tight">
            <IconRefresh size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      <div className="app-segment w-fit mb-8">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`app-segment-btn ${activeTab === tab.id ? 'is-active' : ''}`}>
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {(error || notice) && (
        <div className={`mb-6 rounded-lg border px-5 py-4 text-sm ${error ? 'border-red-500/25 bg-red-500/10 text-red-300' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'}`}>
          {error || notice}
        </div>
      )}

      {activeTab === 'overview' && <Overview dashboard={dashboard} />}
      {activeTab === 'rewards' && (
        <Rewards
          redemptions={dashboard.redemptions}
          sounds={sounds}
          devices={devices}
          editing={editing}
          saving={saving}
          onEdit={(reward) => setEditing(structuredClone(reward))}
          onCreate={() => setEditing(newRedemption(sounds[0]?.id))}
          onChange={setEditing}
          onSave={() => void saveRedemption()}
          onCancel={() => setEditing(null)}
          onDelete={(reward) => void removeRedemption(reward)}
        />
      )}
      {activeTab === 'settings' && (
        <RulesAndGames
          config={configDraft}
          saving={saving}
          grant={grant}
          onConfig={setConfigDraft}
          onSave={() => void saveConfig()}
          onGrant={setGrant}
          onGrantSubmit={() => void grantPoints()}
        />
      )}
    </div>
  )
}

function Overview({ dashboard }: { dashboard: EconomyDashboard }) {
  const metrics = [
    { label: 'In circulation', value: formatNumber(dashboard.totals.pointsInCirculation), detail: dashboard.config.currencyName, icon: IconCoin },
    { label: 'Viewer accounts', value: formatNumber(dashboard.totals.accounts), detail: 'with XP or points', icon: IconTrophy },
    { label: 'Lifetime spent', value: formatNumber(dashboard.totals.lifetimeSpent), detail: 'games and rewards', icon: IconDeviceGamepad2 },
    { label: 'Live rewards', value: formatNumber(dashboard.totals.activeRedemptions), detail: 'chat redemptions', icon: IconBolt }
  ]

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {metrics.map((metric) => (
          <div key={metric.label} className="app-section-card glass p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-accent/10 text-accent flex items-center justify-center"><metric.icon size={20} /></div>
            <div><div className="text-xl font-semibold text-white">{metric.value}</div><div className="text-[11px] text-white/35">{metric.label} · {metric.detail}</div></div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <section className="app-section-card glass overflow-hidden">
          <div className="app-section-head"><div><h2>Point leaders</h2><p>Balances and level progress share the same viewer account.</p></div></div>
          <div className="divide-y divide-white/[0.04]">
            {dashboard.leaders.slice(0, 12).map((account, index) => (
              <div key={`${account.platform}:${account.username}`} className="px-6 py-3 flex items-center gap-4">
                <div className="w-7 text-sm font-semibold text-white/25">#{index + 1}</div>
                <div className="flex-1 min-w-0"><div className="text-sm text-white truncate">{account.username}</div><div className="text-[10px] text-white/30">{account.platform} · level {account.level} · {formatNumber(account.xp)} XP</div></div>
                <div className="text-sm font-semibold text-amber-300">{formatNumber(account.points)}</div>
              </div>
            ))}
            {dashboard.leaders.length === 0 && <EmptyState text="Viewer activity will populate this leaderboard." />}
          </div>
        </section>

        <section className="app-section-card glass overflow-hidden">
          <div className="app-section-head"><div><h2>Economy ledger</h2><p>Every earn, wager, purchase, transfer, and refund is auditable.</p></div></div>
          <div className="divide-y divide-white/[0.04] max-h-[520px] overflow-y-auto">
            {dashboard.recentTransactions.slice(0, 30).map((entry) => (
              <div key={entry.id} className="px-6 py-3 flex items-center gap-4">
                <div className={`w-16 text-right text-sm font-semibold ${entry.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{entry.delta >= 0 ? '+' : ''}{formatNumber(entry.delta)}</div>
                <div className="flex-1 min-w-0"><div className="text-sm text-white truncate">{entry.username}</div><div className="text-[10px] text-white/30 truncate">{entry.reason} · {entry.platform}</div></div>
                <div className="text-xs text-white/30">{formatNumber(entry.balanceAfter)}</div>
              </div>
            ))}
            {dashboard.recentTransactions.length === 0 && <EmptyState text="Ledger entries appear as viewers earn and spend points." />}
          </div>
        </section>
      </div>
    </div>
  )
}

function Rewards(props: {
  redemptions: EconomyRedemption[]
  sounds: SoundOption[]
  devices: LightingDevice[]
  editing: EconomyRedemption | null
  saving: boolean
  onEdit: (reward: EconomyRedemption) => void
  onCreate: () => void
  onChange: (reward: EconomyRedemption) => void
  onSave: () => void
  onCancel: () => void
  onDelete: (reward: EconomyRedemption) => void
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
      <section className="xl:col-span-7 app-section-card glass overflow-hidden">
        <div className="app-section-head">
          <div><h2>Viewer reward shop</h2><p>Each item becomes a direct chat command with level and cooldown gates.</p></div>
          <button onClick={props.onCreate} className="app-button !h-10 !px-4 text-[10px] font-semibold"><IconPlus size={14} />Add reward</button>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          {props.redemptions.map((reward) => (
            <button key={reward.id} onClick={() => props.onEdit(reward)} className={`text-left rounded-lg border p-5 transition-colors ${props.editing?.id === reward.id ? 'border-accent/40 bg-accent/10' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'}`}>
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${reward.action.type === 'sound' ? 'bg-violet-500/10 text-violet-300' : 'bg-cyan-500/10 text-cyan-300'}`}>
                  {reward.action.type === 'sound' ? '🔊' : <IconBolt size={18} />}
                </div>
                <div className="flex-1 min-w-0"><div className="font-semibold text-white truncate">{reward.name}</div><div className="text-xs text-accent">!{reward.command}</div></div>
                <span className={`text-[9px] px-2 py-1 rounded-full ${reward.enabled ? 'bg-emerald-500/10 text-emerald-300' : 'bg-white/5 text-white/30'}`}>{reward.enabled ? 'LIVE' : 'OFF'}</span>
              </div>
              <p className="mt-4 min-h-8 text-xs text-white/35 line-clamp-2">{reward.description || 'No description'}</p>
              <div className="mt-4 flex items-center justify-between text-[11px] text-white/40"><span>{formatNumber(reward.cost)} points</span><span>Level {reward.minLevel}+ · {reward.cooldownSeconds}s</span></div>
            </button>
          ))}
          {props.redemptions.length === 0 && <div className="md:col-span-2"><EmptyState text="Add a sound or lighting reward to open the shop." /></div>}
        </div>
      </section>

      <section className="xl:col-span-5 app-section-card glass overflow-hidden">
        <div className="app-section-head"><div><h2>{props.editing?.id ? 'Edit reward' : 'Reward builder'}</h2><p>Failed device effects refund the viewer automatically.</p></div></div>
        {props.editing ? (
          <RedemptionEditor {...props} reward={props.editing} />
        ) : (
          <EmptyState text="Select a reward or create a new one." />
        )}
      </section>
    </div>
  )
}

function RedemptionEditor(props: {
  reward: EconomyRedemption
  sounds: SoundOption[]
  devices: LightingDevice[]
  saving: boolean
  onChange: (reward: EconomyRedemption) => void
  onSave: () => void
  onCancel: () => void
  onDelete: (reward: EconomyRedemption) => void
}) {
  const reward = props.reward
  const update = (patch: Partial<EconomyRedemption>) => props.onChange({ ...reward, ...patch })
  const setActionType = (type: 'sound' | 'lighting') => {
    if (type === 'sound') {
      update({ action: { type: 'sound', soundId: props.sounds[0]?.id || '', volume: 1 } })
    } else {
      update({ action: { type: 'lighting', effect: 'flash', color: '#19C8FF', durationMs: 1500, targetDeviceIds: [], targetPlatforms: [] } })
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-2 gap-4"><TextField label="Reward name" value={reward.name} onChange={(name) => update({ name })} /><TextField label="Chat command" prefix="!" value={reward.command} onChange={(command) => update({ command: command.replace(/^!/, '') })} /></div>
      <TextField label="Description" value={reward.description} onChange={(description) => update({ description })} />
      <div className="grid grid-cols-3 gap-4">
        <NumberField label="Cost" value={reward.cost} min={1} onChange={(cost) => update({ cost })} />
        <NumberField label="Min level" value={reward.minLevel} min={1} onChange={(minLevel) => update({ minLevel })} />
        <NumberField label="Cooldown sec" value={reward.cooldownSeconds} min={0} onChange={(cooldownSeconds) => update({ cooldownSeconds })} />
      </div>
      <label className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm text-white/70"><span>Reward enabled</span><input type="checkbox" checked={reward.enabled} onChange={(event) => update({ enabled: event.target.checked })} /></label>

      <div><Label>Effect type</Label><div className="app-segment w-full"><button onClick={() => setActionType('sound')} className={`app-segment-btn flex-1 ${reward.action.type === 'sound' ? 'is-active' : ''}`}>Sound</button><button onClick={() => setActionType('lighting')} className={`app-segment-btn flex-1 ${reward.action.type === 'lighting' ? 'is-active' : ''}`}>Lights</button></div></div>

      {reward.action.type === 'sound'
        ? <SoundEditor action={reward.action} sounds={props.sounds} onChange={(action) => update({ action })} />
        : <LightEditor action={reward.action} devices={props.devices} onChange={(action) => update({ action })} />}

      <div className="flex items-center gap-3 pt-2">
        <button onClick={props.onSave} disabled={props.saving} className="app-button !h-10 !px-5 text-[10px] font-semibold bg-accent/15 border-accent/25 text-accent">{props.saving ? 'Saving…' : 'Save reward'}</button>
        <button onClick={props.onCancel} className="app-button !h-10 !px-4 text-[10px]">Cancel</button>
        {reward.id && <button onClick={() => props.onDelete(reward)} className="ml-auto app-button !h-10 !px-3 text-rose-300 border-rose-500/20"><IconTrash size={14} /></button>}
      </div>
    </div>
  )
}

function SoundEditor({ action, sounds, onChange }: { action: EconomySoundAction; sounds: SoundOption[]; onChange: (action: EconomySoundAction) => void }) {
  return <div className="space-y-4"><div><Label>Soundboard file</Label><select className={inputClass} value={action.soundId} onChange={(event) => onChange({ ...action, soundId: event.target.value })}><option value="">Choose a sound…</option>{sounds.map((sound) => <option key={sound.id} value={sound.id}>{sound.name}</option>)}</select>{sounds.length === 0 && <p className="mt-2 text-[10px] text-amber-300/70">Upload sounds on the Soundboard page first.</p>}</div><div><Label>Volume · {Math.round(action.volume * 100)}%</Label><input type="range" min="0" max="1" step="0.05" value={action.volume} onChange={(event) => onChange({ ...action, volume: Number(event.target.value) })} className="w-full accent-[var(--accent)]" /></div></div>
}

function LightEditor({ action, devices, onChange }: { action: EconomyLightingAction; devices: LightingDevice[]; onChange: (action: EconomyLightingAction) => void }) {
  const toggleDevice = (id: string) => onChange({ ...action, targetDeviceIds: action.targetDeviceIds.includes(id) ? action.targetDeviceIds.filter((value) => value !== id) : [...action.targetDeviceIds, id] })
  return <div className="space-y-4"><div className="grid grid-cols-3 gap-4"><div><Label>Effect</Label><select className={inputClass} value={action.effect} onChange={(event) => onChange({ ...action, effect: event.target.value as 'flash' | 'pulse' })}><option value="flash">Flash</option><option value="pulse">Pulse</option></select></div><div><Label>Color</Label><input className={`${inputClass} !p-1`} type="color" value={action.color} onChange={(event) => onChange({ ...action, color: event.target.value })} /></div><NumberField label="Duration ms" value={action.durationMs} min={250} onChange={(durationMs) => onChange({ ...action, durationMs })} /></div><div><Label>Target lights · none selected means every reachable light</Label><div className="max-h-36 overflow-y-auto rounded-lg border border-white/[0.06] divide-y divide-white/[0.04]">{devices.map((device) => <label key={`${device.platform}:${device.id}`} className="flex items-center gap-3 px-3 py-2 text-xs text-white/55"><input type="checkbox" checked={action.targetDeviceIds.includes(device.id)} onChange={() => toggleDevice(device.id)} /><span className="flex-1 truncate">{device.name}</span><span className="text-white/25">{device.platform}</span></label>)}{devices.length === 0 && <div className="p-3 text-xs text-white/30">No lighting devices discovered.</div>}</div></div></div>
}

function RulesAndGames(props: {
  config: EconomyConfig
  saving: boolean
  grant: { username: string; platform: string; amount: number; reason: string }
  onConfig: (config: EconomyConfig) => void
  onSave: () => void
  onGrant: (grant: { username: string; platform: string; amount: number; reason: string }) => void
  onGrantSubmit: () => void
}) {
  const set = <K extends keyof EconomyConfig>(key: K, value: EconomyConfig[K]) => props.onConfig({ ...props.config, [key]: value })
  return <div className="grid grid-cols-1 xl:grid-cols-12 gap-8"><section className="xl:col-span-7 app-section-card glass"><div className="app-section-head"><div><h2>Earning and game rules</h2><p>Levels increase earning power without allowing runaway multipliers.</p></div><button onClick={props.onSave} disabled={props.saving} className="app-button !h-10 !px-5 text-[10px] bg-accent/15 border-accent/25 text-accent">Save rules</button></div><div className="p-6 space-y-6"><div className="grid grid-cols-2 gap-4"><TextField label="Currency name" value={props.config.currencyName} onChange={(value) => set('currencyName', value)} /><NumberField label="Points per XP" value={props.config.pointsPerXp} min={0} step={0.05} onChange={(value) => set('pointsPerXp', value)} /></div><div className="grid grid-cols-3 gap-4"><NumberField label="Level boost %" value={props.config.levelBoostPercent} min={0} step={0.5} onChange={(value) => set('levelBoostPercent', value)} /><NumberField label="Max boost %" value={props.config.maxLevelBoostPercent} min={0} onChange={(value) => set('maxLevelBoostPercent', value)} /><NumberField label="Level-up bonus" value={props.config.levelUpBonusPerLevel} min={0} onChange={(value) => set('levelUpBonusPerLevel', value)} /></div><div className="grid grid-cols-3 gap-4"><NumberField label="Daily base" value={props.config.dailyBase} min={0} onChange={(value) => set('dailyBase', value)} /><NumberField label="Daily per level" value={props.config.dailyPerLevel} min={0} onChange={(value) => set('dailyPerLevel', value)} /><NumberField label="Command cooldown ms" value={props.config.commandCooldownMs} min={500} onChange={(value) => set('commandCooldownMs', value)} /></div><div className="grid grid-cols-2 gap-4"><NumberField label="Minimum bet" value={props.config.minBet} min={1} onChange={(value) => set('minBet', value)} /><NumberField label="Maximum bet" value={props.config.maxBet} min={props.config.minBet} onChange={(value) => set('maxBet', value)} /></div><div className="grid grid-cols-1 md:grid-cols-3 gap-3"><ToggleRow label="Economy active" checked={props.config.enabled} onChange={(value) => set('enabled', value)} /><ToggleRow label="Viewer gambling" checked={props.config.gamblingEnabled} onChange={(value) => set('gamblingEnabled', value)} /><ToggleRow label="Reward shop" checked={props.config.redemptionsEnabled} onChange={(value) => set('redemptionsEnabled', value)} /></div><div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 text-xs leading-5 text-white/40"><strong className="text-white/65">Published odds:</strong> coinflip pays 2× at 50%; European roulette pays 2× on red/black and 36× on green; slots use visible payout tiers with a 94% long-run return. Bets are settled atomically, so parallel commands cannot make a balance negative.</div></div></section><section className="xl:col-span-5 space-y-8"><div className="app-section-card glass"><div className="app-section-head"><div><h2>Host balance adjustment</h2><p>Grants and deductions are written to the ledger.</p></div></div><div className="p-6 space-y-4"><div className="grid grid-cols-2 gap-4"><TextField label="Username" value={props.grant.username} onChange={(username) => props.onGrant({ ...props.grant, username })} /><div><Label>Platform</Label><select className={inputClass} value={props.grant.platform} onChange={(event) => props.onGrant({ ...props.grant, platform: event.target.value })}><option value="tiktok">TikTok</option><option value="twitch">Twitch</option><option value="youtube">YouTube</option><option value="kick">Kick</option></select></div></div><NumberField label="Amount · negative deducts up to the current balance" value={props.grant.amount} onChange={(amount) => props.onGrant({ ...props.grant, amount })} /><TextField label="Ledger reason" value={props.grant.reason} onChange={(reason) => props.onGrant({ ...props.grant, reason })} /><button onClick={props.onGrantSubmit} disabled={props.saving || !props.grant.username.trim()} className="app-button !h-10 !px-5 text-[10px] bg-accent/15 border-accent/25 text-accent">Apply adjustment</button></div></div><div className="app-section-card glass"><div className="app-section-head"><div><h2>Viewer commands</h2><p>Host replies respect the existing chat-response setting.</p></div></div><div className="p-6 text-xs leading-6 text-white/45"><code>!points</code> · <code>!level</code> · <code>!rank</code> · <code>!daily</code><br/><code>!gamble 50</code> · <code>!coinflip tails 50</code> · <code>!slots all</code><br/><code>!roulette red 100</code> · <code>!shop</code> · <code>!give username 25</code><br/><span className="text-white/30">Shop items also work directly, for example <code>!party</code>.</span></div></div></section></div>
}

const inputClass = 'w-full h-10 rounded-md border border-white/[0.08] bg-black/20 px-3 text-sm text-white outline-none focus:border-accent/40'

function Label({ children }: { children: React.ReactNode }) { return <label className="block mb-2 text-[10px] font-semibold tracking-tight text-white/35">{children}</label> }
function TextField({ label, value, prefix, onChange }: { label: string; value: string; prefix?: string; onChange: (value: string) => void }) { return <div><Label>{label}</Label><div className="relative">{prefix && <span className="absolute left-3 top-2.5 text-white/30">{prefix}</span>}<input className={`${inputClass} ${prefix ? '!pl-7' : ''}`} value={value} onChange={(event) => onChange(event.target.value)} /></div></div> }
function NumberField({ label, value, min, step = 1, onChange }: { label: string; value: number; min?: number; step?: number; onChange: (value: number) => void }) { return <div><Label>{label}</Label><input className={inputClass} type="number" value={value} min={min} step={step} onChange={(event) => onChange(Number(event.target.value))} /></div> }
function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3 flex items-center justify-between text-xs text-white/60"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label> }
function EmptyState({ text }: { text: string }) { return <div className="p-10 text-center text-sm text-white/30">{text}</div> }
function formatNumber(value: number) { const number = Math.floor(Number(value) || 0); return `${number < 0 ? '-' : ''}${Math.abs(number).toLocaleString('en-US')}` }
