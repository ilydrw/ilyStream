import { useEffect, useRef, useState } from 'react'
import { IconBookmark, IconCheck, IconSearch, IconX } from '@tabler/icons-react'

import { Modal } from '../../../components/ui/Modal'
import { Select } from '../../../components/ui/Select'
import { PlatformLogo } from '../../../components/platforms/PlatformLogo'
import {
  MAX_STREAM_INFO_PRESETS,
  YOUTUBE_CATEGORIES,
  type BroadcastStreamInfo,
  type StreamCategory,
  type StreamInfoPreset
} from '../../../../shared/stream-info'
import { formatIpcError } from '../utils/broadcast-page-utils'

interface StreamInfoModalProps {
  open: boolean
  onClose: () => void
  value: BroadcastStreamInfo
  onSave: (next: BroadcastStreamInfo) => void
  /** Configured destination ids ('twitch', 'youtube', 'tiktok', 'kick') — drives which fields show. */
  platformIds: string[]
  /** When live, saving can also push the update to Twitch/YouTube/Kick immediately. */
  isStreaming: boolean
  onApplyLive: (info: BroadcastStreamInfo) => Promise<void>
}

const TITLE_MAX_LENGTH = 140

const inputClass =
  'h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-[13px] text-white placeholder:text-white/20 focus:border-accent/50 focus:outline-none transition-colors'

export function StreamInfoModal({
  open,
  onClose,
  value,
  onSave,
  platformIds,
  isStreaming,
  onApplyLive
}: StreamInfoModalProps) {
  const [draft, setDraft] = useState<BroadcastStreamInfo>(value)
  const [applying, setApplying] = useState(false)
  const [kickUserConnected, setKickUserConnected] = useState(false)
  const [presets, setPresets] = useState<StreamInfoPreset[]>([])
  const [savingPreset, setSavingPreset] = useState(false)
  const [presetName, setPresetName] = useState('')

  const hasTwitch = platformIds.includes('twitch')
  const hasKick = platformIds.includes('kick')
  const hasYouTube = platformIds.includes('youtube')

  useEffect(() => {
    if (!open) return
    setDraft(value)
    setApplying(false)
    setSavingPreset(false)
    setPresetName('')
    window.api.streamInfo.getPresets().then(setPresets).catch(() => setPresets([]))
  }, [open, value])

  useEffect(() => {
    if (!open || !hasKick) return
    window.api.platform.kick.getUserAuthStatus()
      .then((status) => setKickUserConnected(status.connected))
      .catch(() => setKickUserConnected(false))
  }, [open, hasKick])

  const normalizedDraft = () => ({ ...draft, title: draft.title.trim() })

  const persistPresets = (next: StreamInfoPreset[]) => {
    setPresets(next)
    void window.api.streamInfo.setPresets(next).catch((err: unknown) => {
      console.warn('[StreamInfoModal] Failed to persist presets:', err)
    })
  }

  const applyPreset = (preset: StreamInfoPreset) => {
    setDraft(preset.info)
  }

  const deletePreset = (id: string) => {
    persistPresets(presets.filter(preset => preset.id !== id))
  }

  const savePreset = () => {
    const name = presetName.trim().slice(0, 60)
    if (!name) return
    const preset: StreamInfoPreset = { id: crypto.randomUUID(), name, info: normalizedDraft() }
    // Same name replaces in place; new names append (capped by the shared limit).
    const existingIndex = presets.findIndex(p => p.name.toLowerCase() === name.toLowerCase())
    const next = existingIndex >= 0
      ? presets.map((p, i) => (i === existingIndex ? { ...preset, id: p.id } : p))
      : [...presets, preset].slice(0, MAX_STREAM_INFO_PRESETS)
    persistPresets(next)
    setSavingPreset(false)
    setPresetName('')
  }

  const save = () => {
    onSave(normalizedDraft())
    onClose()
  }

  const saveAndApply = async () => {
    const next = normalizedDraft()
    onSave(next)
    setApplying(true)
    try {
      await onApplyLive(next)
      onClose()
    } finally {
      setApplying(false)
    }
  }

  const appliesTo: Array<{ id: string; note: string }> = [
    { id: 'twitch', note: 'Title and category' },
    { id: 'youtube', note: 'Title and category (set on the broadcast)' },
    {
      id: 'kick',
      note: kickUserConnected
        ? 'Title and category'
        : 'Connect your Kick account on the Kick page to apply'
    },
    { id: 'tiktok', note: 'Title (LIVE room name, at go-live only)' }
  ].filter(entry => platformIds.includes(entry.id))

  return (
    <Modal open={open} onClose={onClose} title="Stream info" className="max-w-lg">
      <div className="p-5 flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <label className="text-[12px] font-medium tracking-tight text-white/40">Presets</label>
            {!savingPreset && (
              <button
                onClick={() => { setSavingPreset(true); setPresetName(draft.title.trim().slice(0, 60)) }}
                disabled={presets.length >= MAX_STREAM_INFO_PRESETS}
                className="flex items-center gap-1.5 text-[11px] font-medium text-white/35 hover:text-accent transition-colors disabled:opacity-30"
              >
                <IconBookmark size={12} /> Save as preset
              </button>
            )}
          </div>
          {savingPreset && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={presetName}
                maxLength={60}
                autoFocus
                onChange={(event) => setPresetName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') savePreset()
                  if (event.key === 'Escape') { setSavingPreset(false); setPresetName('') }
                }}
                placeholder="Preset name — e.g. variety night"
                className="h-9 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-[12px] text-white placeholder:text-white/20 focus:border-accent/50 focus:outline-none transition-colors"
              />
              <button
                onClick={savePreset}
                disabled={!presetName.trim()}
                className="h-9 w-9 shrink-0 grid place-items-center rounded-lg border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-30"
                title="Save preset"
              >
                <IconCheck size={14} />
              </button>
              <button
                onClick={() => { setSavingPreset(false); setPresetName('') }}
                className="h-9 w-9 shrink-0 grid place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-white/40 hover:text-white transition-colors"
                title="Cancel"
              >
                <IconX size={14} />
              </button>
            </div>
          )}
          {presets.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {presets.map((preset) => (
                <span
                  key={preset.id}
                  className="group inline-flex items-center overflow-hidden rounded-full border border-white/10 bg-white/[0.03] hover:border-accent/40 transition-colors"
                >
                  <button
                    onClick={() => applyPreset(preset)}
                    className="px-3 py-1.5 text-[11px] font-medium text-white/60 group-hover:text-white transition-colors"
                    title={preset.info.title || preset.name}
                  >
                    {preset.name}
                  </button>
                  <button
                    onClick={() => deletePreset(preset.id)}
                    className="pr-2 pl-0.5 py-1.5 text-white/20 hover:text-danger transition-colors"
                    title={`Delete "${preset.name}"`}
                  >
                    <IconX size={11} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            !savingPreset && (
              <p className="text-[11px] text-white/20">
                Save the current title and categories as a one-click preset.
              </p>
            )
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[12px] font-medium tracking-tight text-white/40">Stream title</label>
          <input
            type="text"
            value={draft.title}
            maxLength={TITLE_MAX_LENGTH}
            onChange={(event) => setDraft(current => ({ ...current, title: event.target.value }))}
            placeholder="What are you streaming today?"
            className={inputClass}
          />
          <span className="self-end text-[10px] font-medium text-white/20 tabular-nums">
            {draft.title.length}/{TITLE_MAX_LENGTH}
          </span>
        </div>

        {hasTwitch && (
          <CategorySearchField
            label="Twitch category"
            platform="twitch"
            placeholder="Search categories — e.g. Just Chatting"
            selectedId={draft.twitchCategoryId}
            selectedName={draft.twitchCategoryName}
            search={(query) => window.api.platform.twitch.searchCategories(query)}
            onSelect={(category) => setDraft(current => ({
              ...current,
              twitchCategoryId: category.id,
              twitchCategoryName: category.name
            }))}
            onClear={() => setDraft(current => ({ ...current, twitchCategoryId: '', twitchCategoryName: '' }))}
          />
        )}

        {hasKick && (
          <CategorySearchField
            label="Kick category"
            platform="kick"
            placeholder="Search Kick categories"
            selectedId={draft.kickCategoryId}
            selectedName={draft.kickCategoryName}
            search={(query) => window.api.platform.kick.searchCategories(query)}
            onSelect={(category) => setDraft(current => ({
              ...current,
              kickCategoryId: category.id,
              kickCategoryName: category.name
            }))}
            onClear={() => setDraft(current => ({ ...current, kickCategoryId: '', kickCategoryName: '' }))}
          />
        )}

        {hasYouTube && (
          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-medium tracking-tight text-white/40">YouTube category</label>
            <Select
              value={draft.youtubeCategoryId}
              onChange={(youtubeCategoryId) => setDraft(current => ({ ...current, youtubeCategoryId }))}
              options={[
                { value: '', label: 'No category' },
                ...YOUTUBE_CATEGORIES.map(category => ({ value: category.id, label: category.name }))
              ]}
              placeholder="No category"
              className="w-full"
              buttonClassName="h-10 bg-white/[0.03] border border-white/10 rounded-lg px-3 text-[13px] font-medium tracking-tight text-white/70 hover:text-white"
              maxListHeight={220}
            />
          </div>
        )}

        {appliesTo.length > 0 ? (
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3 flex flex-col gap-2">
            <p className="text-[11px] font-medium tracking-tight text-white/25">
              {isStreaming ? 'Applied at go-live, or right now with "Save & apply"' : 'Applied when you go live'}
            </p>
            {appliesTo.map(entry => (
              <div key={entry.id} className={`flex items-center gap-2.5 ${entry.id === 'kick' && !kickUserConnected ? 'opacity-40' : ''}`}>
                <PlatformLogo platform={entry.id} size={13} />
                <span className="text-[12px] text-white/55">{entry.note}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-white/30">
            No stream destinations are configured yet — the title still saves and applies once a platform is set up.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-lg border border-white/10 bg-white/[0.03] text-[12px] font-medium text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            Cancel
          </button>
          {isStreaming && (
            <button onClick={saveAndApply} disabled={applying} className="app-button-primary disabled:opacity-50">
              {applying ? 'Applying…' : 'Save & apply'}
            </button>
          )}
          <button
            onClick={save}
            className={isStreaming
              ? 'h-9 px-4 rounded-lg border border-white/10 bg-white/[0.03] text-[12px] font-medium text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors'
              : 'app-button-primary'}
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  )
}

function CategorySearchField({
  label,
  platform,
  placeholder,
  selectedId,
  selectedName,
  search,
  onSelect,
  onClear
}: {
  label: string
  platform: string
  placeholder: string
  selectedId: string
  selectedName: string
  search: (query: string) => Promise<StreamCategory[]>
  onSelect: (category: StreamCategory) => void
  onClear: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StreamCategory[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchSeq = useRef(0)

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setSearching(false)
      setError(null)
      return
    }

    const seq = ++searchSeq.current
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const found = await search(trimmed)
        if (searchSeq.current !== seq) return
        setResults(found)
        setError(null)
      } catch (err) {
        if (searchSeq.current !== seq) return
        setResults([])
        setError(formatIpcError(err))
      } finally {
        if (searchSeq.current === seq) setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const select = (category: StreamCategory) => {
    onSelect(category)
    setQuery('')
    setResults([])
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-[12px] font-medium tracking-tight text-white/40">{label}</label>
      {selectedId ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-accent/25 bg-accent/[0.06] px-3 py-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <PlatformLogo platform={platform} size={14} />
            <span className="truncate text-[13px] font-semibold text-white">{selectedName}</span>
          </div>
          <button
            onClick={onClear}
            className="shrink-0 p-1 rounded-md text-white/30 hover:text-white hover:bg-white/10 transition-colors"
            title="Clear category"
          >
            <IconX size={14} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] pl-9 pr-3 text-[13px] text-white placeholder:text-white/20 focus:border-accent/50 focus:outline-none transition-colors"
          />
        </div>
      )}

      {searching && <p className="text-[11px] text-white/25">Searching…</p>}
      {error && <p className="text-[11px] text-danger">{error}</p>}
      {results.length > 0 && (
        <div className="custom-scrollbar max-h-52 overflow-y-auto rounded-lg border border-white/10 bg-black/40">
          {results.map((category) => (
            <button
              key={category.id}
              onClick={() => select(category)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/5 transition-colors"
            >
              {category.boxArtUrl && (
                <img
                  src={category.boxArtUrl.replace('{width}', '36').replace('{height}', '48')}
                  alt=""
                  className="h-12 w-9 shrink-0 rounded-sm object-cover bg-white/5"
                />
              )}
              <span className="truncate text-[13px] font-medium text-white/80">{category.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
