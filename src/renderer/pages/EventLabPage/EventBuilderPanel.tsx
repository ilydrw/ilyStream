import type { Dispatch, SetStateAction } from 'react'
import { IconPlayerPlay } from '../../components/ui/icons'
import type { EventLabSimulationPayload, EventLabTestEventType } from '../../../shared/event-lab'
import type { Platform } from '../../../main/platforms/types'
import { EVENT_TYPES, PLATFORMS, QUICK_TESTS } from './EventLabPage.constants'
import { Field, NumberInput } from './EventLabPage.widgets'

interface EventBuilderPanelProps {
  draft: EventLabSimulationPayload
  setDraft: Dispatch<SetStateAction<EventLabSimulationPayload>>
  onFireEvent: (override?: Partial<EventLabSimulationPayload>) => void | Promise<void>
}

export function EventBuilderPanel({ draft, setDraft, onFireEvent }: EventBuilderPanelProps) {
  return (
    <section className="app-section-card glass !p-0 overflow-hidden">
      <div className="app-section-head">
        <div>
          <h2 className="text-sm font-semibold text-white">Test event builder</h2>
          <p>Send a realistic local event through alerts, widgets, TTS, triggers, stats, and devices.</p>
        </div>
      </div>

      <div className="p-5 flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Platform">
            <select
              value={draft.platform}
              onChange={(event) => setDraft((prev) => ({ ...prev, platform: event.target.value as Platform }))}
              className="app-input !h-10 !text-xs"
            >
              {PLATFORMS.map((platform) => (
                <option key={platform} value={platform}>{platform}</option>
              ))}
            </select>
          </Field>

          <Field label="Event Type">
            <select
              value={draft.type}
              onChange={(event) => setDraft((prev) => ({ ...prev, type: event.target.value as EventLabTestEventType }))}
              className="app-input !h-10 !text-xs"
            >
              {EVENT_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Username">
            <input
              value={draft.username ?? ''}
              onChange={(event) => setDraft((prev) => ({ ...prev, username: event.target.value }))}
              className="app-input !h-10 !text-xs"
            />
          </Field>
          <Field label="Display Name">
            <input
              value={draft.displayName ?? ''}
              onChange={(event) => setDraft((prev) => ({ ...prev, displayName: event.target.value }))}
              className="app-input !h-10 !text-xs"
            />
          </Field>
        </div>

        {draft.type === 'chat' && (
          <Field label="Message">
            <textarea
              value={draft.message ?? ''}
              onChange={(event) => setDraft((prev) => ({ ...prev, message: event.target.value }))}
              className="app-input min-h-[92px] !py-3 !text-xs resize-none"
            />
          </Field>
        )}

        {draft.type === 'gift' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gift Name">
              <input
                value={draft.giftName ?? ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, giftName: event.target.value }))}
                className="app-input !h-10 !text-xs"
              />
            </Field>
            <Field label="Gift Count">
              <NumberInput value={draft.giftCount ?? 1} min={1} max={999} onChange={(giftCount) => setDraft((prev) => ({ ...prev, giftCount }))} />
            </Field>
          </div>
        )}

        {draft.type === 'like' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Like Count">
              <NumberInput value={draft.likeCount ?? 25} min={1} max={100000} onChange={(likeCount) => setDraft((prev) => ({ ...prev, likeCount }))} />
            </Field>
            <Field label="Total Likes">
              <NumberInput value={draft.totalLikes ?? 2500} min={0} max={100000000} onChange={(totalLikes) => setDraft((prev) => ({ ...prev, totalLikes }))} />
            </Field>
          </div>
        )}

        {(draft.type === 'raid' || draft.type === 'viewer-count') && (
          <Field label={draft.type === 'raid' ? 'Raid Viewers' : 'Viewer Count'}>
            <NumberInput value={draft.viewerCount ?? 24} min={0} max={50000} onChange={(viewerCount) => setDraft((prev) => ({ ...prev, viewerCount }))} />
          </Field>
        )}

        {(draft.type === 'subscription' || draft.type === 'superfan') && (
          <Field label="Months">
            <NumberInput value={draft.months ?? 3} min={1} max={120} onChange={(months) => setDraft((prev) => ({ ...prev, months }))} />
          </Field>
        )}

        <label className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3">
          <span>
            <span className="block text-xs font-semibold text-white/80">Suppress sound</span>
            <span className="block text-[10px] text-white/30">Useful when testing visuals without audio.</span>
          </span>
          <input
            type="checkbox"
            checked={draft.suppressSound === true}
            onChange={(event) => setDraft((prev) => ({ ...prev, suppressSound: event.target.checked }))}
            className="h-4 w-4 accent-[#d035f1]"
          />
        </label>

        <div className="grid grid-cols-3 gap-2">
          {QUICK_TESTS.map((test) => {
            const Icon = test.icon
            return (
              <button
                key={test.type}
                type="button"
                onClick={() => void onFireEvent({ type: test.type })}
                className="h-10 rounded-lg border border-white/10 bg-white/[0.03] text-[10px] font-semibold tracking-normal text-white/55 hover:border-[#d035f1]/40 hover:text-white transition-all"
              >
                <Icon size={14} className="inline mr-1.5 opacity-70" />
                {test.label}
              </button>
            )
          })}
        </div>

        <button onClick={() => void onFireEvent()} className="app-button-primary !h-11 text-xs font-semibold">
          <IconPlayerPlay size={15} className="mr-2" />
          Run full test
        </button>
      </div>
    </section>
  )
}
