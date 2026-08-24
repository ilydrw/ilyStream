import type { Dispatch, SetStateAction } from 'react'
import { IconActivity, IconBell, IconDeviceDesktop, IconFilter, IconMusic } from '@tabler/icons-react'
import { IconCopy, IconRefresh } from '../../components/ui/icons'
import type { EventLabEntry, EventLabEntryKind } from '../../stores/event-lab-store'
import { KIND_LABELS } from './EventLabPage.constants'
import { Metric, TimelineRow } from './EventLabPage.widgets'

interface EventTimelinePanelProps {
  entries: EventLabEntry[]
  filteredEntries: EventLabEntry[]
  selectedEntry: EventLabEntry | null
  counts: Record<string, number>
  kindFilter: EventLabEntryKind | 'all'
  setKindFilter: Dispatch<SetStateAction<EventLabEntryKind | 'all'>>
  searchQuery: string
  setSearchQuery: Dispatch<SetStateAction<string>>
  onSelectEntry: (entryId: string) => void
  onReplayEntry: (entry: EventLabEntry) => void | Promise<unknown>
  onCopySelectedPayload: () => void | Promise<unknown>
}

export function EventTimelinePanel({
  entries,
  filteredEntries,
  selectedEntry,
  counts,
  kindFilter,
  setKindFilter,
  searchQuery,
  setSearchQuery,
  onSelectEntry,
  onReplayEntry,
  onCopySelectedPayload
}: EventTimelinePanelProps) {
  return (
    <div className="flex flex-col gap-6 min-w-0">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="Events" value={entries.length} icon={IconActivity} />
        <Metric label="Overlay" value={counts.overlay || 0} icon={IconDeviceDesktop} />
        <Metric label="Alerts" value={counts.alert || 0} icon={IconBell} />
        <Metric label="Sounds" value={counts.sound || 0} icon={IconMusic} />
      </div>

      <section className="app-section-card glass !p-0 overflow-hidden min-h-[680px]">
        <div className="app-section-head">
          <div>
            <h2 className="text-sm font-semibold text-white">Live timeline</h2>
            <p>Follow every event and downstream action in one place.</p>
          </div>
          <div className="flex items-center gap-2">
            <IconFilter size={14} className="text-white/25" />
            <select
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value as EventLabEntryKind | 'all')}
              className="app-input !h-9 !w-32 !text-xs"
            >
              {Object.entries(KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search"
              className="app-input !h-9 !w-44 !text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_360px] min-h-[580px]">
          <div className="border-r border-white/5 min-w-0">
            <div className="h-[580px] overflow-y-auto custom-scrollbar p-3">
              {filteredEntries.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-white/25">
                  <IconRefresh size={32} className="mb-3 opacity-40" />
                  <p className="text-sm font-semibold text-white/35">No matching events yet</p>
                  <p className="text-xs text-white/20 mt-1">Fire a test event or wait for live traffic.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {filteredEntries.map((entry) => (
                    <TimelineRow
                      key={entry.id}
                      entry={entry}
                      selected={selectedEntry?.id === entry.id}
                      onSelect={() => onSelectEntry(entry.id)}
                      onReplay={() => void onReplayEntry(entry)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <aside className="bg-black/20 min-w-0">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold tracking-normal text-white/30">Payload</p>
                <p className="text-xs text-white/60 truncate max-w-[220px]">{selectedEntry?.title ?? 'Nothing selected'}</p>
              </div>
              <button
                onClick={onCopySelectedPayload}
                disabled={!selectedEntry?.payload}
                className="app-button !h-9 !w-9 !p-0 disabled:opacity-30"
                title="Copy payload"
              >
                <IconCopy size={14} />
              </button>
            </div>
            <pre className="h-[526px] overflow-auto custom-scrollbar p-4 text-[11px] leading-relaxed text-white/45 whitespace-pre-wrap">
              {selectedEntry?.payload ? JSON.stringify(selectedEntry.payload, null, 2) : 'Select a timeline row to inspect the payload.'}
            </pre>
          </aside>
        </div>
      </section>
    </div>
  )
}
