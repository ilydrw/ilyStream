import { type Widget } from '../../../../../shared/widgets'
import { ChatConfigEditor } from './ChatConfigEditor'
import { FollowerGoalConfigEditor } from './FollowerGoalConfigEditor'
import { NowPlayingConfigEditor } from './NowPlayingConfigEditor'
import { BorderConfigEditor } from './BorderConfigEditor'
import { SocialsConfigEditor } from './SocialsConfigEditor'
import { ParticleConfigEditor } from './ParticleConfigEditor'
import { RoseConfigEditor } from './RoseConfigEditor'
import { ParticlesConfigEditor } from './ParticlesConfigEditor'
import { DiscordPromoConfigEditor } from './DiscordPromoConfigEditor'
import { NodeNetworkConfigEditor } from './NodeNetworkConfigEditor'
import { LatestGifterConfigEditor } from './LatestGifterConfigEditor'
import { PhysicsConfigEditor } from './PhysicsConfigEditor'
import { ChatUnifiedConfigEditor } from './ChatUnifiedConfigEditor'
import { LikesTrackerConfigEditor } from './LikesTrackerConfigEditor'
import { AlertsConfigEditor } from './AlertsConfigEditor'
import { LeaderboardConfigEditor } from './LeaderboardConfigEditor'

export function ConfigEditor({
  draft,
  onChange,
  onPreview
}: {
  draft: Widget
  onChange: (next: Widget) => void
  onPreview?: (next: Widget) => void
}) {
  if (draft.type === 'now-playing') {
    return <NowPlayingConfigEditor draft={draft} onChange={onChange} />
  }
  if (draft.type === 'chat') {
    return <ChatConfigEditor draft={draft} onChange={onChange} />
  }
  if (draft.type === 'follower-goal') {
    return <FollowerGoalConfigEditor draft={draft} onChange={onChange} />
  }
  if (draft.type === 'socials') {
    return <SocialsConfigEditor draft={draft} onChange={onChange} />
  }
  if (draft.type === 'screen-border') {
    return <BorderConfigEditor draft={draft} onChange={onChange} />
  }
  if (draft.type === 'event-particles' || draft.type === 'gift-overlays') {
    return <ParticleConfigEditor draft={draft} onChange={onChange} />
  }
  if (draft.type === 'falling-roses') {
    return <RoseConfigEditor draft={draft} onChange={onChange} />
  }
  if (draft.type === 'particles') {
    return <ParticlesConfigEditor draft={draft} onChange={onChange} onPreview={onPreview} />
  }
  if (draft.type === 'discord-promo') {
    return <DiscordPromoConfigEditor draft={draft} onChange={onChange} />
  }
  if (draft.type === 'node-network') {
    return <NodeNetworkConfigEditor draft={draft} onChange={onChange} />
  }
  if (draft.type === 'latest-gifter') {
    return <LatestGifterConfigEditor draft={draft} onChange={onChange} />
  }
  if (draft.type === 'physics') {
    return <PhysicsConfigEditor draft={draft} onChange={onChange} />
  }
  if (draft.type === 'chat-unified') {
    return <ChatUnifiedConfigEditor draft={draft} onChange={onChange} />
  }
  if (draft.type === 'likes-tracker') {
    return <LikesTrackerConfigEditor draft={draft} onChange={onChange} />
  }
  if (draft.type === 'alerts') {
    return <AlertsConfigEditor draft={draft} onChange={onChange} />
  }
  if (draft.type === 'leaderboard') {
    return <LeaderboardConfigEditor draft={draft} onChange={onChange} />
  }

  return (
    <div className="text-xs text-white/40 leading-relaxed">
      Configuration UI for "{draft.type}" widgets is coming soon. The widget will use sensible defaults
      until then.
    </div>
  )
}
