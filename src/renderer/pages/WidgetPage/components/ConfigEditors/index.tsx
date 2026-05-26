import { type ComponentType } from 'react'
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

type ConfigEditorProps = {
  draft: Widget
  onChange: (next: Widget) => void
  onPreview?: (next: Widget) => void
}

type ConfigEditorComponent = ComponentType<ConfigEditorProps>

const CONFIG_EDITORS = {
  'now-playing': NowPlayingConfigEditor,
  chat: ChatConfigEditor,
  'follower-goal': FollowerGoalConfigEditor,
  socials: SocialsConfigEditor,
  'screen-border': BorderConfigEditor,
  'event-particles': ParticleConfigEditor,
  'gift-overlays': ParticleConfigEditor,
  'falling-roses': RoseConfigEditor,
  particles: ParticlesConfigEditor,
  'discord-promo': DiscordPromoConfigEditor,
  'node-network': NodeNetworkConfigEditor,
  'latest-gifter': LatestGifterConfigEditor,
  physics: PhysicsConfigEditor,
  'chat-unified': ChatUnifiedConfigEditor,
  'likes-tracker': LikesTrackerConfigEditor,
  alerts: AlertsConfigEditor,
  leaderboard: LeaderboardConfigEditor
} satisfies Partial<Record<Widget['type'], ConfigEditorComponent>>

export function ConfigEditor({
  draft,
  onChange,
  onPreview
}: ConfigEditorProps) {
  const Editor = CONFIG_EDITORS[draft.type]

  if (Editor) {
    return <Editor draft={draft} onChange={onChange} onPreview={onPreview} />
  }

  return (
    <div className="text-xs text-white/40 leading-relaxed">
      Configuration UI for "{draft.type}" widgets is coming soon. The widget will use sensible defaults
      until then.
    </div>
  )
}
