import { useEffect, useRef, useState } from 'react'
import { IconSearch, IconX } from '@tabler/icons-react'

import { Modal } from '../../../components/ui/Modal'
import { PlatformLogo } from '../../../components/platforms/PlatformLogo'
import type { BroadcastStreamInfo, TwitchCategory } from '../../../../shared/stream-info'
import { formatIpcError } from '../utils/broadcast-page-utils'

interface StreamInfoModalProps {
  open: boolean
  onClose: () => void
  value: BroadcastStreamInfo
  onSave: (next: BroadcastStreamInfo) => void
  /** Configured destination ids ('twitch', 'youtube', 'tiktok', 'kick') — drives the per-platform hints. */
  platformIds: string[]
}

const TITLE_MAX_LENGTH = 140

export function StreamInfoModal({ open, onClose, value, onSave, platformIds }: StreamInfoModalProps) {
  const [draft, setDraft] = useState<BroadcastStreamInfo>(value)
  const [categoryQuery, setCategoryQuery] = useState('')
  const [categoryResults, setCategoryResults] = useState<TwitchCategory[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const searchSeq = useRef(0)

  const hasTwitch = platformIds.includes('twitch')

  useEffect(() => {
    if (!open) return
    setDraft(value)
    setCategoryQuery('')
    setCategoryResults([])
    setSearchError(null)
  }, [open, value])

  // Debounced Twitch category search.
  useEffect(() => {
    if (!open || !hasTwitch) return
    const query = categoryQuery.trim()
    if (!query) {
      setCategoryResults([])
      setSearching(false)
      setSearchError(null)
      return
    }

    const seq = ++searchSeq.current
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const results = await window.api.platform.twitch.searchCategories(query)
        if (searchSeq.current !== seq) return
        setCategoryResults(results)
        setSearchError(null)
      } catch (err) {
        if (searchSeq.current !== seq) return
        setCategoryResults([])
        setSearchError(formatIpcError(err))
      } finally {
        if (searchSeq.current === seq) setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [categoryQuery, hasTwitch, open])

  const selectCategory = (category: TwitchCategory) => {
    setDraft(current => ({ ...current, twitchCategoryId: category.id, twitchCategoryName: category.name }))
    setCategoryQuery('')
    setCategoryResults([])
  }

  const clearCategory = () => {
    setDraft(current => ({ ...current, twitchCategoryId: '', twitchCategoryName: '' }))
  }

  const save = () => {
    onSave({ ...draft, title: draft.title.trim() })
    onClose()
  }

  const appliesTo: Array<{ id: string; note: string }> = [
    { id: 'twitch', note: 'Title and category' },
    { id: 'youtube', note: 'Title (set on the broadcast)' },
    { id: 'tiktok', note: 'Title (LIVE room name)' }
  ].filter(entry => platformIds.includes(entry.id))

  return (
    <Modal open={open} onClose={onClose} title="Stream info" className="max-w-lg">
      <div className="p-5 flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label className="text-[12px] font-medium tracking-tight text-white/40">Stream title</label>
          <input
            type="text"
            value={draft.title}
            maxLength={TITLE_MAX_LENGTH}
            onChange={(event) => setDraft(current => ({ ...current, title: event.target.value }))}
            placeholder="What are you streaming today?"
            className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-[13px] text-white placeholder:text-white/20 focus:border-accent/50 focus:outline-none transition-colors"
          />
          <span className="self-end text-[10px] font-medium text-white/20 tabular-nums">
            {draft.title.length}/{TITLE_MAX_LENGTH}
          </span>
        </div>

        {hasTwitch && (
          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-medium tracking-tight text-white/40">Twitch category</label>
            {draft.twitchCategoryId ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-accent/25 bg-accent/[0.06] px-3 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <PlatformLogo platform="twitch" size={14} />
                  <span className="truncate text-[13px] font-semibold text-white">{draft.twitchCategoryName}</span>
                </div>
                <button
                  onClick={clearCategory}
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
                  value={categoryQuery}
                  onChange={(event) => setCategoryQuery(event.target.value)}
                  placeholder="Search categories — e.g. Just Chatting"
                  className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] pl-9 pr-3 text-[13px] text-white placeholder:text-white/20 focus:border-accent/50 focus:outline-none transition-colors"
                />
              </div>
            )}

            {searching && <p className="text-[11px] text-white/25">Searching…</p>}
            {searchError && <p className="text-[11px] text-danger">{searchError}</p>}
            {categoryResults.length > 0 && (
              <div className="custom-scrollbar max-h-52 overflow-y-auto rounded-lg border border-white/10 bg-black/40">
                {categoryResults.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => selectCategory(category)}
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
        )}

        {appliesTo.length > 0 ? (
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3 flex flex-col gap-2">
            <p className="text-[11px] font-medium tracking-tight text-white/25">Applied when you go live</p>
            {appliesTo.map(entry => (
              <div key={entry.id} className="flex items-center gap-2.5">
                <PlatformLogo platform={entry.id} size={13} />
                <span className="text-[12px] text-white/55">{entry.note}</span>
              </div>
            ))}
            {platformIds.includes('kick') && (
              <div className="flex items-center gap-2.5 opacity-40">
                <PlatformLogo platform="kick" size={13} />
                <span className="text-[12px] text-white/55">Not supported yet — set it on kick.com</span>
              </div>
            )}
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
          <button onClick={save} className="app-button-primary">
            Save
          </button>
        </div>
      </div>
    </Modal>
  )
}
