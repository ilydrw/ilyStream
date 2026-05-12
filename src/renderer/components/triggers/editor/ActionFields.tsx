import React from 'react'
import type { Action } from '../../../../main/triggers/trigger-types'
import type { VoiceProfile } from '../../../../main/tts/voice-profiles'
import type { SoundFile } from '../../../hooks/useSoundboard'
import type { AssetFile } from '../../../hooks/useAssets'
import { FieldBlock, NumberInput, HeaderRow, replaceHeader, removeHeader } from './common'

export function ActionFields({
  action,
  voiceProfiles,
  sounds,
  images,
  onChange
}: {
  action: Action
  voiceProfiles: VoiceProfile[]
  sounds: SoundFile[]
  images: AssetFile[]
  onChange: (action: Action) => void
}) {
  switch (action.type) {
    case 'tts':
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <FieldBlock label="Voice Profile">
            <select
              value={action.voiceProfileId ?? ''}
              onChange={(event) => onChange({ ...action, voiceProfileId: event.target.value || undefined })}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="">Default Voice</option>
              {voiceProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </FieldBlock>
          <FieldBlock label="Template">
            <textarea
              value={action.template ?? ''}
              onChange={(event) => onChange({ ...action, template: event.target.value })}
              rows={4}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent resize-y"
            />
          </FieldBlock>
        </div>
      )

    case 'play_sound':
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <FieldBlock label="Sound">
            <select
              value={action.filePath}
              onChange={(event) => onChange({ ...action, filePath: event.target.value })}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="">Select a sound...</option>
              {sounds.map((sound) => (
                <option key={sound.id} value={sound.id}>
                  {sound.name}
                </option>
              ))}
            </select>
          </FieldBlock>
          <FieldBlock label="Volume">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={action.volume}
              onChange={(event) => onChange({ ...action, volume: Number(event.target.value) })}
              className="w-full accent-accent"
            />
            <p className="mt-1 text-xs text-muted">{Math.round(action.volume * 100)}%</p>
          </FieldBlock>
        </div>
      )

    case 'show_alert':
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <FieldBlock label="HTML Template">
            <textarea
              value={action.template}
              onChange={(event) => onChange({ ...action, template: event.target.value })}
              rows={5}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent resize-y"
            />
          </FieldBlock>
          <div className="grid gap-3">
            <FieldBlock label="Duration (ms)">
              <NumberInput
                value={action.durationMs}
                min={100}
                step={100}
                onChange={(value) => onChange({ ...action, durationMs: value })}
              />
            </FieldBlock>
            <div className="grid gap-3 md:grid-cols-2">
              <FieldBlock label="Animation In">
                <select
                  value={action.animationIn}
                  onChange={(event) => onChange({ ...action, animationIn: event.target.value as any })}
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  <option value="fade">Fade</option>
                  <option value="slide">Slide</option>
                  <option value="bounce">Bounce</option>
                  <option value="zoom">Zoom</option>
                  <option value="wave">Wave</option>
                </select>
              </FieldBlock>
              <FieldBlock label="Animation Out">
                <select
                  value={action.animationOut}
                  onChange={(event) => onChange({ ...action, animationOut: event.target.value as any })}
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  <option value="fade">Fade</option>
                  <option value="slide">Slide</option>
                  <option value="dissolve">Dissolve</option>
                </select>
              </FieldBlock>
            </div>
            <FieldBlock label="Alert Image">
              <select
                value={action.imageUrl || ''}
                onChange={(event) => onChange({ ...action, imageUrl: event.target.value || undefined })}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="">No Image</option>
                {images.map((image) => (
                  <option key={image.id} value={image.id}>
                    {image.name}
                  </option>
                ))}
              </select>
            </FieldBlock>
            <FieldBlock label="Alert Sound">
              <select
                value={action.audioUrl || ''}
                onChange={(event) => onChange({ ...action, audioUrl: event.target.value || undefined })}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="">No Sound</option>
                {sounds.map((sound) => (
                  <option key={sound.id} value={sound.id}>
                    {sound.name}
                  </option>
                ))}
              </select>
            </FieldBlock>
          </div>
        </div>
      )

    case 'http_webhook':
      return (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
            <FieldBlock label="URL">
              <input
                type="url"
                value={action.url}
                onChange={(event) => onChange({ ...action, url: event.target.value })}
                placeholder="https://example.com/webhook"
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </FieldBlock>
            <FieldBlock label="Method">
              <select
                value={action.method}
                onChange={(event) => onChange({ ...action, method: event.target.value as any })}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
              </select>
            </FieldBlock>
          </div>
          <FieldBlock label="Headers">
            <div className="space-y-2">
              {Object.entries(action.headers || {}).map(([key, value]) => (
                <HeaderRow
                  key={key}
                  headerKey={key}
                  value={value}
                  onChange={(nextKey, nextValue) =>
                    onChange({ ...action, headers: replaceHeader(action.headers || {}, key, nextKey, nextValue) })
                  }
                  onRemove={() => onChange({ ...action, headers: removeHeader(action.headers || {}, key) })}
                />
              ))}
              <button
                onClick={() => onChange({ ...action, headers: { ...(action.headers || {}), [`Header-${Object.keys(action.headers || {}).length + 1}`]: '' } })}
                className="text-xs px-3 py-1.5 rounded-lg bg-card hover:bg-card-hover border border-border transition-colors"
              >
                + Add Header
              </button>
            </div>
          </FieldBlock>
          <FieldBlock label="Body">
            <textarea
              value={action.body}
              onChange={(event) => onChange({ ...action, body: event.target.value })}
              rows={5}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent resize-y"
            />
          </FieldBlock>
        </div>
      )

    case 'obs_set_scene':
      return (
        <FieldBlock label="Scene Name">
          <input
            type="text"
            value={action.sceneName}
            onChange={(event) => onChange({ ...action, sceneName: event.target.value })}
            placeholder="Gameplay"
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </FieldBlock>
      )

    case 'obs_set_source_visibility':
      return (
        <div className="grid gap-3 md:grid-cols-3">
          <FieldBlock label="Scene Name">
            <input
              type="text"
              value={action.sceneName}
              onChange={(event) => onChange({ ...action, sceneName: event.target.value })}
              placeholder="Gameplay"
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </FieldBlock>
          <FieldBlock label="Source Name">
            <input
              type="text"
              value={action.sourceName}
              onChange={(event) => onChange({ ...action, sourceName: event.target.value })}
              placeholder="Camera"
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </FieldBlock>
          <FieldBlock label="Visibility">
            <button
              onClick={() => onChange({ ...action, visible: !action.visible })}
              className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                action.visible ? 'bg-success/15 text-success border border-success/30' : 'bg-card border border-border text-muted hover:bg-card-hover'
              }`}
            >
              {action.visible ? 'Visible' : 'Hidden'}
            </button>
          </FieldBlock>
        </div>
      )

    case 'obs_toggle_source_visibility':
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <FieldBlock label="Scene Name">
            <input
              type="text"
              value={action.sceneName}
              onChange={(event) => onChange({ ...action, sceneName: event.target.value })}
              placeholder="Gameplay"
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </FieldBlock>
          <FieldBlock label="Source Name">
            <input
              type="text"
              value={action.sourceName}
              onChange={(event) => onChange({ ...action, sourceName: event.target.value })}
              placeholder="Be Right Back"
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </FieldBlock>
        </div>
      )

    case 'run_command':
      return (
        <FieldBlock label="Command">
          <input
            type="text"
            value={action.command}
            onChange={(event) => onChange({ ...action, command: event.target.value })}
            placeholder="powershell -File scripts\\notify.ps1"
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </FieldBlock>
      )

    case 'ai_respond':
      return (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <FieldBlock label="Output Channel">
              <select
                value={action.output}
                onChange={(event) => onChange({ ...action, output: event.target.value as any })}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="chat">Outbound Chat Only</option>
                <option value="tts">TTS Speech Only</option>
                <option value="both">Both Chat & TTS</option>
              </select>
            </FieldBlock>
            <FieldBlock label="System Prompt Override (Optional)">
              <textarea
                value={action.systemPrompt || ''}
                onChange={(event) => onChange({ ...action, systemPrompt: event.target.value || undefined })}
                placeholder="e.g. Respond as a grumpy pirate."
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent min-h-[80px]"
              />
            </FieldBlock>
          </div>
        </div>
      )

    case 'voicemod_voice':
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <FieldBlock label="Voice ID (Voicemod)">
            <input
              type="text"
              value={action.voiceId}
              onChange={(e) => onChange({ ...action, voiceId: e.target.value })}
              placeholder="VOICE_CHIPMUNK"
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </FieldBlock>
          <FieldBlock label="Duration (Seconds)">
            <NumberInput
              value={action.durationSec}
              min={1}
              onChange={(val) => onChange({ ...action, durationSec: val })}
            />
          </FieldBlock>
        </div>
      )

    case 'voicemod_sound':
      return (
        <FieldBlock label="Sound ID (Voicemod)">
          <input
            type="text"
            value={action.soundId}
            onChange={(e) => onChange({ ...action, soundId: e.target.value })}
            placeholder="SOUND_FAIL_HORN"
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </FieldBlock>
      )

    case 'vtube_expression':
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <FieldBlock label="Expression ID">
            <input
              type="text"
              value={action.expressionId}
              onChange={(e) => onChange({ ...action, expressionId: e.target.value })}
              placeholder="Blush"
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </FieldBlock>
          <FieldBlock label="Toggle Mode">
            <button
              onClick={() => onChange({ ...action, toggle: !action.toggle })}
              className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                action.toggle ? 'bg-accent/15 text-accent border border-accent/30' : 'bg-card border border-border text-muted'
              }`}
            >
              {action.toggle ? 'Toggle (On/Off)' : 'Trigger Once'}
            </button>
          </FieldBlock>
        </div>
      )

    case 'vtube_animation':
      return (
        <FieldBlock label="Animation ID">
          <input
            type="text"
            value={action.animationId}
            onChange={(e) => onChange({ ...action, animationId: e.target.value })}
            placeholder="WaveArms"
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </FieldBlock>
      )

    case 'vtube_throw':
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <FieldBlock label="Item ID">
            <input
              type="text"
              value={action.itemId}
              onChange={(e) => onChange({ ...action, itemId: e.target.value })}
              placeholder="CoffeeCup"
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </FieldBlock>
          <FieldBlock label="Amount">
            <NumberInput
              value={action.count || 1}
              min={1}
              onChange={(val) => onChange({ ...action, count: val })}
            />
          </FieldBlock>
        </div>
      )

    case 'discord_embed':
      return (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <FieldBlock label="Embed Title">
              <input
                type="text"
                value={action.title || ''}
                onChange={(e) => onChange({ ...action, title: e.target.value })}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </FieldBlock>
            <FieldBlock label="Color (Hex)">
              <input
                type="color"
                value={action.color || '#ff00ff'}
                onChange={(e) => onChange({ ...action, color: e.target.value })}
                className="w-full h-10 bg-card border border-border rounded-lg px-1 py-1 outline-none focus:border-accent"
              />
            </FieldBlock>
          </div>
          <FieldBlock label="Description">
            <textarea
              value={action.description || ''}
              onChange={(e) => onChange({ ...action, description: e.target.value })}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent min-h-[80px]"
            />
          </FieldBlock>
        </div>
      )

    case 'physics_spawn':
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <FieldBlock label="Amount of Objects">
            <NumberInput
              value={action.amount || 1}
              min={1}
              onChange={(val) => onChange({ ...action, amount: val })}
            />
          </FieldBlock>
          <FieldBlock label="Gravity Override">
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={action.gravityOverride || 1}
              onChange={(e) => onChange({ ...action, gravityOverride: Number(e.target.value) })}
              className="accent-accent w-full"
            />
            <p className="mt-1 text-xs text-muted">{(action.gravityOverride || 1).toFixed(1)}x</p>
          </FieldBlock>
        </div>
      )

    default:
      return <div className="text-danger p-2 text-xs">Unknown Action Type: {(action as any).type}</div>
  }
}
