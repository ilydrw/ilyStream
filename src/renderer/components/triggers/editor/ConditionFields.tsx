import React from 'react'
import type { Condition } from '../../../../main/triggers/trigger-types'
import { EVENT_TYPE_OPTIONS } from '../../../lib/trigger-editor'
import { FieldBlock, NumberInput } from './common'

export function ConditionFields({
  condition,
  onChange
}: {
  condition: Condition
  onChange: (condition: Condition) => void
}) {
  switch (condition.type) {
    case 'event_type':
      return (
        <FieldBlock label="Event">
          <select
            value={condition.value}
            onChange={(event) => onChange({ ...condition, value: event.target.value as any })}
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {EVENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FieldBlock>
      )

    case 'keyword':
      return (
        <div className="grid gap-3 md:grid-cols-3">
          <FieldBlock label="Keyword or Pattern">
            <input
              type="text"
              value={condition.value}
              onChange={(event) => onChange({ ...condition, value: event.target.value })}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </FieldBlock>
          <FieldBlock label="Match Mode">
            <select
              value={condition.matchMode}
              onChange={(event) =>
                onChange({ ...condition, matchMode: event.target.value as any })
              }
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="contains">Contains</option>
              <option value="exact">Exact</option>
              <option value="starts_with">Starts With</option>
              <option value="regex">Regex</option>
            </select>
          </FieldBlock>
          <FieldBlock label="Case Sensitive">
            <button
              onClick={() => onChange({ ...condition, caseSensitive: !condition.caseSensitive })}
              className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                condition.caseSensitive
                  ? 'bg-accent/15 text-accent border border-accent/30'
                  : 'bg-card border border-border text-muted hover:bg-card-hover'
              }`}
            >
              {condition.caseSensitive ? 'Enabled' : 'Disabled'}
            </button>
          </FieldBlock>
        </div>
      )

    case 'gift_value_gte':
      return (
        <FieldBlock label="Minimum Value (cents)">
          <NumberInput
            value={condition.value}
            min={0}
            onChange={(value) => onChange({ ...condition, value })}
          />
        </FieldBlock>
      )

    case 'user_role':
      return (
        <FieldBlock label="Required Role">
          <select
            value={condition.value}
            onChange={(event) => onChange({ ...condition, value: event.target.value as any })}
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="moderator">Moderator</option>
            <option value="subscriber">Subscriber</option>
            <option value="vip">VIP / Broadcaster</option>
          </select>
        </FieldBlock>
      )

    case 'username':
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <FieldBlock label="Username">
            <input
              type="text"
              value={condition.value}
              onChange={(event) => onChange({ ...condition, value: event.target.value })}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </FieldBlock>
          <FieldBlock label="Match Mode">
            <select
              value={condition.matchMode}
              onChange={(event) =>
                onChange({ ...condition, matchMode: event.target.value as any })
              }
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="exact">Exact</option>
              <option value="contains">Contains</option>
            </select>
          </FieldBlock>
        </div>
      )

    case 'viewer_count_gte':
      return (
        <FieldBlock label="Minimum Viewer Count">
          <NumberInput
            value={condition.value}
            min={0}
            onChange={(value) => onChange({ ...condition, value })}
          />
        </FieldBlock>
      )

    case 'user_status':
      return (
        <FieldBlock label="User Status Type">
          <select
            value={condition.status}
            onChange={(event) => onChange({ ...condition, status: event.target.value as any })}
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="is_super_fan">Super Fan (VIP/High Level/Top Gifter)</option>
            <option value="is_fan_club">Fan Club Member</option>
            <option value="is_team">Team Member</option>
          </select>
        </FieldBlock>
      )

    default:
      return <div className="text-danger p-2 text-xs">Unknown Condition Type: {(condition as any).type}</div>
  }
}
