import { describe, expect, it } from 'vitest'
import {
  createDefaultTrigger,
  getTriggerValidationErrors,
  normalizeTriggerRule
} from './trigger-editor'

describe('trigger editor helpers', () => {
  it('normalizes empty trigger fields into a safe save payload', () => {
    const trigger = createDefaultTrigger(4)
    trigger.name = '   '
    trigger.platforms = []
    trigger.conditions = []
    trigger.actions = []
    trigger.cooldown = -4
    trigger.userCooldown = -8

    expect(normalizeTriggerRule(trigger)).toEqual(
      expect.objectContaining({
        name: 'Untitled Trigger',
        cooldown: 0,
        userCooldown: 0
      })
    )
    expect(normalizeTriggerRule(trigger).platforms).toEqual([])
    expect(normalizeTriggerRule(trigger).conditions).toHaveLength(1)
    expect(normalizeTriggerRule(trigger).actions).toHaveLength(1)
  })

  it('reports missing required editor fields', () => {
    const trigger = createDefaultTrigger(0)
    trigger.name = ''
    trigger.platforms = []
    trigger.actions = [{ type: 'run_command', command: '' }]

    expect(getTriggerValidationErrors(trigger)).toEqual(
      expect.arrayContaining([
        'Trigger name is required.',
        'Select at least one platform.',
        'Run command actions need a command.'
      ])
    )
  })
})
