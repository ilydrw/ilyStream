import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  IconCalendar,
  IconDatabase,
  IconFolderOpen,
  IconMovie,
  IconRefresh,
  IconVideo
} from '@tabler/icons-react'
import { format } from 'date-fns'
import { IconPlayerPlay, IconSearch, IconTrash } from '../../components/ui/icons'
import { PageHeader } from '../../components/layout/PageHeader'

interface Recording {
  id: string
  name: string
  path: string
  size: number
  createdAt: number
  extension: string
}

export default function RecordingsPage() {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  const loadRecordings = async () => {
    setIsLoading(true)
    try {
      const list = await window.api.recordings.list()
      setRecordings(Array.isArray(list) ? list : [])
    } catch (error) {
      console.error('Failed to load recordings', error)
      setRecordings([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadRecordings()
  }, [])

  const filteredRecordings = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return recordings
    return recordings.filter((recording) => recording.name.toLowerCase().includes(query))
  }, [recordings, searchQuery])

  const totalSize = useMemo(
    () => recordings.reduce((total, recording) => total + recording.size, 0),
    [recordings]
  )

  const handleDelete = async (path: string) => {
    if (!confirm('Delete this recording? This cannot be undone.')) return

    const result = await window.api.recordings.delete(path)
    if (result.success) {
      await loadRecordings()
    }
  }

  return (
    <div className="app-page recordings-page">
      <PageHeader
        kicker="Capture archive"
        title="Recording Library"
        description="Preview, play, search, and manage your local broadcast captures."
        icon={IconVideo}
        actions={
          <>
            <div className="relative">
              <IconSearch size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type="search"
                placeholder="Search recordings"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="app-input !h-12 w-64 !pl-10"
              />
            </div>
            <button
              onClick={() => void loadRecordings()}
              className="app-button !h-12 !w-12 !p-0"
              title="Refresh recordings"
            >
              <IconRefresh size={16} />
            </button>
            <button
              onClick={() => void window.api.recordings.openFolder()}
              className="app-button !h-12 !px-5 text-xs font-semibold"
            >
              <IconFolderOpen size={16} />
              Open folder
            </button>
          </>
        }
      />

      <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <LibraryStat icon={<IconMovie size={17} />} label="Recordings" value={String(recordings.length)} />
        <LibraryStat icon={<IconDatabase size={17} />} label="Disk usage" value={formatSize(totalSize)} />
        <LibraryStat
          icon={<IconCalendar size={17} />}
          label="Latest capture"
          value={recordings[0] ? format(recordings[0].createdAt, 'MMM d, yyyy') : 'No captures'}
        />
      </section>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-32 text-white/30 gap-4">
          <div className="w-10 h-10 border-2 border-accent/20 border-t-accent rounded-full animate-spin" />
          <span className="text-xs font-medium">Indexing recording library…</span>
        </div>
      ) : filteredRecordings.length === 0 ? (
        <div className="min-h-[360px] flex flex-col items-center justify-center gap-5 rounded-lg border border-dashed border-white/10 bg-white/[0.015] text-center">
          <div className="grid h-16 w-16 place-items-center rounded-lg border border-white/10 bg-white/[0.025] text-white/20">
            <IconVideo size={30} strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white/70">
              {recordings.length === 0 ? 'No recordings yet' : 'No matching recordings'}
            </h3>
            <p className="mt-1 text-sm text-white/35">
              {recordings.length === 0
                ? 'Your next local capture will appear here automatically.'
                : 'Try a different filename or clear the search.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {filteredRecordings.map((recording) => (
              <RecordingCard
                key={recording.id}
                recording={recording}
                onDelete={() => void handleDelete(recording.path)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

function RecordingCard({
  recording,
  onDelete
}: {
  recording: Recording
  onDelete: () => void
}) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="app-section-card glass group overflow-hidden"
    >
      <button
        onClick={() => void window.api.recordings.play(recording.path)}
        className="relative block aspect-video w-full overflow-hidden bg-black/45 text-left"
        aria-label={`Play ${recording.name}`}
      >
        <RecordingThumbnail recording={recording} />
        <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/25" />
        <span className="absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/65 text-white opacity-0 shadow-xl transition-all group-hover:scale-105 group-hover:opacity-100">
          <IconPlayerPlay size={20} fill="currentColor" />
        </span>
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3">
          <span className="rounded-md border border-white/10 bg-black/65 px-2 py-1 text-[9px] font-semibold uppercase text-white/65">
            {recording.extension}
          </span>
          <span className="rounded-md border border-white/10 bg-black/65 px-2 py-1 text-[9px] font-semibold text-white/65">
            {formatSize(recording.size)}
          </span>
        </div>
      </button>

      <div className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-white" title={recording.name}>
            {recording.name}
          </h3>
          <div className="mt-2 flex items-center gap-2 text-white/35">
            <IconCalendar size={13} />
            <span className="text-[10px] font-medium">
              {format(recording.createdAt, 'MMM d, yyyy · h:mm a')}
            </span>
          </div>
        </div>
        <button
          onClick={onDelete}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-white/30 transition-colors hover:bg-danger/10 hover:text-danger"
          title="Delete recording"
        >
          <IconTrash size={15} />
        </button>
      </div>
    </motion.article>
  )
}

function RecordingThumbnail({ recording }: { recording: Recording }) {
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setThumbnail(null)
    setLoading(true)

    void window.api.recordings.thumbnail(recording.path)
      .then((value) => {
        if (!cancelled) setThumbnail(value)
      })
      .catch((error) => {
        console.warn(`Failed to load thumbnail for ${recording.name}`, error)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [recording.name, recording.path])

  if (thumbnail) {
    return (
      <img
        src={thumbnail}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
    )
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/18">
      {loading ? (
        <div className="h-7 w-7 rounded-full border-2 border-white/10 border-t-accent animate-spin" />
      ) : (
        <>
          <IconVideo size={34} strokeWidth={1.4} />
          <span className="text-[10px] font-medium text-white/25">Preview unavailable</span>
        </>
      )}
    </div>
  )
}

function LibraryStat({
  icon,
  label,
  value
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex min-h-16 items-center gap-3 rounded-lg bg-white/[0.025] px-4">
      <div className="text-accent">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-white/40">{label}</p>
        <strong className="block truncate text-base font-semibold text-white">{value}</strong>
      </div>
    </div>
  )
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value >= 100 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
}
