import { IconTerminal2, IconTrash, IconArrowDown, IconSearch, IconCopy, IconDownload, IconFilter } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLogStore, type LogLevel, type LogEntry } from '../../../stores/log-store'

/* ─── Config ────────────────────────────────── */

const LOG_LEVELS: { key: LogLevel; label: string; color: string; bg: string; ring: string }[] = [
  { key: 'log',   label: 'Log',   color: 'text-white/60',    bg: 'bg-white/[0.05]',    ring: 'ring-white/10'   },
  { key: 'info',  label: 'Info',  color: 'text-sky-300',     bg: 'bg-sky-500/10',       ring: 'ring-sky-500/25' },
  { key: 'warn',  label: 'Warn',  color: 'text-amber-300',   bg: 'bg-amber-500/10',     ring: 'ring-amber-500/25' },
  { key: 'error', label: 'Error', color: 'text-red-300',     bg: 'bg-red-500/10',       ring: 'ring-red-500/25' },
  { key: 'debug', label: 'Debug', color: 'text-emerald-300', bg: 'bg-emerald-500/10',   ring: 'ring-emerald-500/25' },
]

const CATEGORIES = ['Renderer', 'Platforms', 'Hardware', 'System'] as const
type Category = (typeof CATEGORIES)[number]

const MAX_ENTRIES = 2000
const LEVEL_COLORS: Record<LogLevel, string> = {
  log: 'text-white/50',
  info: 'text-sky-400',
  warn: 'text-amber-400',
  error: 'text-red-400',
  debug: 'text-emerald-400',
}

/* ─── Mapping ───────────────────────────────── */

function detectSourceAndCategory(text: string): { source: string; category: Category } {
  let source = 'app'
  let category: Category = 'System'

  const t = text.toLowerCase()

  // Hardware
  if (t.includes('[audio]') || t.includes('[sound]') || t.includes('[mic]') || t.includes('[speaker]')) {
    source = 'audio'; category = 'Hardware'
  } else if (t.includes('[obs]') || t.includes('[obs-websocket]')) {
    source = 'obs'; category = 'Hardware'
  } else if (t.includes('[elgato]') || t.includes('[streamdeck]')) {
    source = 'elgato'; category = 'Hardware'
  } else if (t.includes('[govee]') || t.includes('[hue]') || t.includes('[lifx]') || t.includes('[nanoleaf]')) {
    source = 'lights'; category = 'Hardware'
  } else if (t.includes('[deskthing]') || t.includes('[loupedeck]') || t.includes('[razer]') || t.includes('[logitech]')) {
    source = 'peripherals'; category = 'Hardware'
  }
  // Platforms
  else if (t.includes('[tiktok]') || t.includes('[twitch]') || t.includes('[youtube]') || t.includes('[kick]') || t.includes('[discord]')) {
    source = 'social'; category = 'Platforms'
  } else if (t.includes('[tts]') || t.includes('[elevenlabs]') || t.includes('[kokoro]')) {
    source = 'tts'; category = 'Platforms'
  } else if (t.includes('[streaming]') || t.includes('[rtmp]') || t.includes('[broadcast]')) {
    source = 'streaming'; category = 'Platforms'
  } else if (t.includes('[overlay]') || t.includes('[widgets]')) {
    source = 'overlay'; category = 'Platforms'
  }
  // Renderer
  else if (t.includes('[renderer]') || t.includes('[ui]') || t.includes('[nav]') || t.includes('[style]')) {
    source = 'renderer'; category = 'Renderer'
  } else if (t.includes('[vite]') || t.includes('[hmr]')) {
    source = 'dev-server'; category = 'Renderer'
  } else if (t.includes('[preload]')) {
    source = 'preload'; category = 'Renderer'
  }
  // System
  else if (t.includes('[main]') || t.includes('[electron]')) {
    source = 'main'; category = 'System'
  } else if (t.includes('[store]') || t.includes('[state]') || t.includes('[db]') || t.includes('[sqlite]')) {
    source = 'store'; category = 'System'
  } else if (t.includes('[socket]') || t.includes('[ws]') || t.includes('[network]')) {
    source = 'network'; category = 'System'
  }

  return { source, category }
}

const CATEGORY_COLORS: Record<Category, string> = {
  Renderer: 'text-sky-400',
  Platforms: 'text-pink-400',
  Hardware: 'text-amber-400',
  System: 'text-violet-400',
}

const CATEGORY_ICONS: Record<Category, string> = {
  Renderer: 'bg-sky-500/10 ring-sky-500/20 text-sky-400',
  Platforms: 'bg-pink-500/10 ring-pink-500/20 text-pink-400',
  Hardware: 'bg-amber-500/10 ring-amber-500/20 text-amber-400',
  System: 'bg-violet-500/10 ring-violet-500/20 text-violet-400',
}

/* ─── UI Utilities ────────────────────────── */

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const parts = text.split(new RegExp(`(${query})`, 'gi'))
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <span key={i} className="bg-accent/40 text-white rounded-[2px] px-0.5">{part}</span>
          : part
      )}
    </>
  )
}

/* ─── Component ────────────────────────────── */

export function ConsoleSection() {
  const entries = useLogStore(state => state.entries)
  const clear = useLogStore(state => state.clear)
  const [enabledLevels, setEnabledLevels] = useState<Set<LogLevel>>(new Set(['log', 'info', 'warn', 'error', 'debug']))
  const [enabledCategories, setEnabledCategories] = useState<Set<Category>>(new Set(CATEGORIES))
  const [searchQuery, setSearchQuery] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [paused, setPaused] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pauseBufferRef = useRef<LogEntry[]>([])
  const [displayEntries, setDisplayEntries] = useState<LogEntry[]>([])

  // Update display entries based on paused state
  useEffect(() => {
    if (!paused) {
      setDisplayEntries(entries)
    }
  }, [entries, paused])

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [displayEntries, autoScroll])

  // Detect manual scroll
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50)
  }, [])

  const toggleLevel = (level: LogLevel) => {
    setEnabledLevels(prev => {
      const next = new Set(prev)
      if (next.has(level)) {
        next.delete(level)
      } else {
        next.add(level)
      }
      return next
    })
  }

  const toggleCategory = (cat: Category) => {
    setEnabledCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) {
        next.delete(cat)
      } else {
        next.add(cat)
      }
      return next
    })
  }

  const toggleAllLevels = () => {
    if (enabledLevels.size === LOG_LEVELS.length) {
      setEnabledLevels(new Set())
    } else {
      setEnabledLevels(new Set(LOG_LEVELS.map(l => l.key)))
    }
  }

  const clearEntries = () => {
    clear()
  }

  const copyAll = () => {
    const text = filteredEntries.map(e =>
      `[${new Date(e.timestamp).toLocaleTimeString()}] [${e.level.toUpperCase()}] [${e.category}:${e.source}] ${e.args}`
    ).join('\n')
    navigator.clipboard.writeText(text)
  }

  const exportLog = () => {
    const text = filteredEntries.map(e => `[${formatTime(e.timestamp)}] [${e.level.toUpperCase()}] ${e.source}: ${e.args}`).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ilystream-console-${new Date().toISOString().slice(0, 10)}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  const simulateChat = async () => {
    try {
      console.log('[Console] Requesting chat simulation...')
      await window.api.events.simulateChat({
        platform: 'tiktok',
        message: 'This is a test message from the Console!',
        username: 'ilyStreamTest'
      })
    } catch (err) {
      console.error('[Console] Simulation failed:', err)
    }
  }

  // Filter entries
  const filteredEntries = useMemo(() => displayEntries.filter(e => {
    if (!enabledLevels.has(e.level)) return false
    if (!enabledCategories.has(e.category as Category)) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return e.args.toLowerCase().includes(q) || e.source.toLowerCase().includes(q) || e.category.toLowerCase().includes(q)
    }
    return true
  }), [displayEntries, enabledLevels, enabledCategories, searchQuery])

  // Count by level
  const counts = useMemo(() => {
    const c: Record<LogLevel, number> = { log: 0, info: 0, warn: 0, error: 0, debug: 0 }
    for (const e of entries) {
      if (c[e.level] !== undefined) c[e.level]++
    }
    return c
  }, [entries])

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
      + '.' + String(d.getMilliseconds()).padStart(3, '0')
  }

  return (
    <section className="app-section-card glass overflow-visible">
      <div className="app-section-head">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center text-accent">
            <div className="relative">
              <IconTerminal2 size={32} />
              {paused && <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full border-2 border-black animate-pulse" />}
            </div>
          </div>
          <div>
            <h2 className="flex items-center gap-2">
              Console
              {paused && <span className="text-[10px] font-black text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded uppercase tracking-widest border border-amber-500/20">Paused</span>}
            </h2>
            <p>Real-time application log feed with severity and module filtering.</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] font-bold text-white/20 tabular-nums uppercase tracking-widest">
              {filteredEntries.length.toLocaleString()} of {entries.length.toLocaleString()} visible
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPaused(p => !p)}
                className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-widest transition-all ${
                  paused
                    ? 'border-amber-500 bg-amber-500 text-black shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                    : 'border-accent/20 bg-accent/10 text-accent hover:border-accent/40'
                }`}
              >
                {paused ? 'Resume Feed' : 'Pause'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="app-section-content !p-0 flex flex-col min-h-0 bg-black/40">
        {/* Toolbar: Level & Category Toggles */}
        <div className="flex flex-col border-b border-white/[0.05]">
          {/* Level Bar */}
          <div className="flex items-center gap-2 px-6 py-3 bg-white/[0.02] flex-wrap">
            <span className="text-[9px] font-black uppercase tracking-widest text-white/20 mr-2 select-none">Levels</span>
            <button
              onClick={toggleAllLevels}
              className={`h-7 px-3 rounded-lg ring-1 text-[8px] font-black uppercase tracking-widest transition-all ${
                enabledLevels.size === LOG_LEVELS.length
                  ? 'bg-accent/20 ring-accent/40 text-accent'
                  : 'bg-white/[0.03] ring-white/[0.06] text-white/28 hover:text-white/50'
              }`}
            >
              All
            </button>

            {LOG_LEVELS.map(level => {
              const active = enabledLevels.has(level.key)
              return (
                <button
                  key={level.key}
                  onClick={() => toggleLevel(level.key)}
                  className={`h-7 px-3 rounded-lg ring-1 text-[8px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                    active
                      ? `${level.bg} ${level.ring} ${level.color}`
                      : 'bg-white/[0.01] ring-white/[0.04] text-white/20 hover:text-white/40 hover:bg-white/[0.03]'
                  }`}
                >
                  {level.label}
                  <span className={`text-[7px] tabular-nums font-bold ${active ? 'opacity-60' : 'opacity-30'}`}>
                    {counts[level.key]}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Category Bar */}
          <div className="flex items-center gap-2 px-6 py-3 bg-white/[0.01] flex-wrap border-t border-white/[0.03]">
            <span className="text-[9px] font-black uppercase tracking-widest text-white/20 mr-2 select-none">Groups</span>
            {CATEGORIES.map(cat => {
              const active = enabledCategories.has(cat)
              return (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={`h-7 px-4 rounded-lg ring-1 text-[8px] font-black uppercase tracking-widest transition-all ${
                    active
                      ? `${CATEGORY_ICONS[cat]}`
                      : 'bg-white/[0.01] ring-white/[0.04] text-white/20 hover:text-white/40'
                  }`}
                >
                  {cat}
                </button>
              )
            })}
          </div>

          {/* Action Bar */}
          <div className="flex items-center gap-3 px-6 py-3 bg-black/40">
            <div className={`relative flex-1 transition-all duration-300 ${isSearchOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none w-0 overflow-hidden'}`}>
              <IconSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search logs..."
                className="w-full h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] pl-9 pr-3 text-xs text-white placeholder:text-white/15 focus:outline-none focus:ring-1 focus:ring-accent/40"
              />
            </div>

            {!isSearchOpen && <div className="flex-1" />}

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setIsSearchOpen(s => !s)}
                className={`h-8 w-8 rounded-lg ring-1 transition-all flex items-center justify-center ${
                  isSearchOpen ? 'bg-accent/20 ring-accent/40 text-accent' : 'bg-white/[0.03] ring-white/[0.06] text-white/30 hover:text-white/60 hover:bg-white/[0.06]'
                }`}
                title="Toggle Search"
              >
                <IconSearch size={14} />
              </button>

              <button
                onClick={simulateChat}
                className="h-8 px-3 rounded-lg ring-1 ring-accent/30 bg-accent/5 text-accent hover:bg-accent/10 flex items-center gap-2 transition-all"
                title="Simulate incoming chat event"
              >
                <IconTerminal2 size={14} />
                <span className="text-[9px] font-black uppercase tracking-widest">Simulate</span>
              </button>

              <div className="w-px h-4 bg-white/5 mx-1" />

              <button
                onClick={copyAll}
                className="h-8 w-8 rounded-lg ring-1 ring-white/[0.06] bg-white/[0.03] text-white/30 hover:text-white/60 hover:bg-white/[0.06] flex items-center justify-center transition-all"
                title="Copy Filtered Logs"
              >
                <IconCopy size={14} />
              </button>

              <button
                onClick={exportLog}
                className="h-8 w-8 rounded-lg ring-1 ring-white/[0.06] bg-white/[0.03] text-white/30 hover:text-white/60 hover:bg-white/[0.06] flex items-center justify-center transition-all"
                title="Export .log file"
              >
                <IconDownload size={14} />
              </button>

              <button
                onClick={clearEntries}
                className="h-8 w-8 rounded-lg ring-1 ring-white/[0.06] bg-white/[0.03] text-white/30 hover:text-red-400 hover:ring-red-500/30 hover:bg-red-500/10 flex items-center justify-center transition-all"
                title="Clear All"
              >
                <IconTrash size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Log Viewer Content */}
        <div className="relative flex-1 min-h-0 bg-[#070707]">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className={`h-[500px] overflow-y-auto custom-scrollbar font-mono text-[11px] leading-[1.6] px-4 py-2 transition-opacity duration-300 ${paused ? 'opacity-40 grayscale-[0.5]' : 'opacity-100'}`}
          >
            {filteredEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-white/10 gap-4">
                <div className="p-4 rounded-full bg-white/[0.02] border border-white/[0.04]">
                  <IconTerminal2 size={48} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-black uppercase tracking-widest">No Log Entries</p>
                  <p className="text-[10px] text-white/20 mt-1 uppercase tracking-wider">
                    {entries.length === 0 ? 'Awaiting application events...' : 'Try adjusting filters or search query'}
                  </p>
                </div>
              </div>
            ) : (
              <table className="w-full border-collapse">
                <tbody>
                  {filteredEntries.map(entry => (
                    <tr
                      key={entry.id}
                      className={`group hover:bg-white/[0.03] transition-colors ${
                        entry.level === 'error' ? 'bg-red-500/[0.05]' : entry.level === 'warn' ? 'bg-amber-500/[0.03]' : ''
                      }`}
                    >
                      {/* Timestamp */}
                      <td className="py-1 pr-4 text-white/10 whitespace-nowrap align-top select-none w-[1%] font-bold tabular-nums">
                        {formatTime(entry.timestamp)}
                      </td>

                      {/* Source */}
                      <td className="py-1 pr-4 align-top w-[1%]">
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-sm bg-white/[0.03] border border-white/[0.05] ${CATEGORY_COLORS[entry.category as Category]}`}>
                            {entry.category}
                          </span>
                          <span className="text-[9px] font-bold uppercase tracking-widest text-white/20">
                            {entry.source}
                          </span>
                        </div>
                      </td>

                      {/* Level */}
                      <td className="py-1 pr-4 align-top w-[1%]">
                        <span className={`text-[9px] font-black uppercase tracking-wider ${LEVEL_COLORS[entry.level]}`}>
                          {entry.level}
                        </span>
                      </td>

                      {/* Message */}
                      <td className={`py-1 break-all whitespace-pre-wrap ${LEVEL_COLORS[entry.level]} group-hover:text-white transition-colors`}>
                        {searchQuery ? (
                          <HighlightedText text={entry.args} query={searchQuery} />
                        ) : (
                          entry.args
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Scroll Bottom Indicator */}
          {!autoScroll && filteredEntries.length > 0 && (
            <div className="absolute bottom-6 right-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <button
                onClick={() => {
                  if (scrollRef.current) {
                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
                    setAutoScroll(true)
                  }
                }}
                className="flex items-center gap-2 px-4 h-10 rounded-full bg-brand-gradient text-white font-black text-[10px] uppercase tracking-widest shadow-glow hover:scale-105 active:scale-95 transition-all"
              >
                <IconArrowDown size={14} />
                New Events Below
              </button>
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="px-6 py-2 border-t border-white/[0.05] bg-black/60 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Runtime Active</span>
            </div>
            <span className="text-[9px] font-bold text-white/10 uppercase tracking-widest">System Architecture</span>
          </div>
          <span className="text-[9px] font-black text-white/15 uppercase tracking-widest">ilyStream v0.0.7 Console</span>
        </div>
      </div>
    </section>
  )
}
