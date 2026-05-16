import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  IconVideo,
  IconPlayerPlay,
  IconTrash,
  IconFolderOpen,
  IconDotsVertical,
  IconCalendar,
  IconDatabase,
  IconSearch,
  IconFilter,
  IconArrowRight
} from '@tabler/icons-react'
import { format } from 'date-fns'

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
    const list = await window.api.recordings.list()
    setRecordings(list)
    setIsLoading(false)
  }

  useEffect(() => {
    loadRecordings()
  }, [])

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const handleDelete = async (path: string) => {
    if (confirm('Are you sure you want to delete this recording? This cannot be undone.')) {
      const res = await window.api.recordings.delete(path)
      if (res.success) {
        loadRecordings()
      }
    }
  }

  const filteredRecordings = recordings.filter(r =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="flex items-center gap-6">
          <div className="p-3 rounded-2xl bg-accent/20 text-accent">
            <IconVideo size={32} />
          </div>
          <div>
            <h1>Recording Library</h1>
            <p className="app-page-intro">Manage your past broadcasts and high-quality captures.</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <IconSearch size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
            <input
              type="text"
              placeholder="Search captures..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-12 w-64 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 text-sm outline-none focus:border-accent/40 transition-all"
            />
          </div>
          <button
            onClick={() => window.api.recordings.openFolder()}
            className="app-button !h-12 !px-6 !text-[10px] font-black tracking-widest"
          >
            <IconFolderOpen size={16} />
            OPEN FOLDER
          </button>
        </div>
      </header>

      <div className="mt-12">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32 text-white/20 gap-4">
            <div className="w-12 h-12 border-4 border-accent/20 border-t-accent rounded-full animate-spin" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Indexing Library...</span>
          </div>
        ) : filteredRecordings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-white/10 gap-6 border-2 border-dashed border-white/5 rounded-[40px]">
            <IconVideo size={64} strokeWidth={1} />
            <div className="text-center">
              <h3 className="text-lg font-bold text-white/20">No Recordings Found</h3>
              <p className="text-sm font-medium">Capture your first broadcast to see it here.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <AnimatePresence mode="popLayout">
              {filteredRecordings.map((rec) => (
                <motion.div
                  key={rec.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="group relative bg-white/[0.03] border border-white/5 rounded-[32px] overflow-hidden hover:border-white/20 transition-all hover:shadow-2xl hover:shadow-black/40"
                >
                  {/* Thumbnail Placeholder / Icon */}
                  <div className="aspect-video bg-black/40 flex items-center justify-center relative group-hover:bg-black/20 transition-all">
                    <IconVideo size={48} className="text-white/5 group-hover:text-accent/20 transition-all" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={() => window.api.recordings.play(rec.path)}
                        className="w-14 h-14 rounded-full bg-brand-gradient text-white flex items-center justify-center shadow-xl shadow-accent/40 hover:scale-110 active:scale-95 transition-all shadow-glow"
                      >
                        <IconPlayerPlay size={24} fill="currentColor" />
                      </button>
                    </div>
                    <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center">
                      <span className="px-2 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[9px] font-black text-white/60 uppercase tracking-widest border border-white/5">
                        {rec.extension}
                      </span>
                      <span className="px-2 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[9px] font-black text-white/60 uppercase tracking-widest border border-white/5">
                        {formatSize(rec.size)}
                      </span>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-6">
                    <h3 className="text-sm font-bold text-white truncate mb-4" title={rec.name}>
                      {rec.name}
                    </h3>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-white/30">
                        <IconCalendar size={14} />
                        <span className="text-[10px] font-bold">{format(rec.createdAt, 'MMM dd, yyyy · HH:mm')}</span>
                      </div>
                      <button
                        onClick={() => handleDelete(rec.path)}
                        className="p-2 rounded-xl text-white/10 hover:text-red-400 hover:bg-red-500/10 transition-all"
                      >
                        <IconTrash size={16} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
