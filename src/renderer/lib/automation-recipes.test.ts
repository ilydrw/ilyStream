import { describe, expect, it } from 'vitest'
import { automationRecipes, createRecipeRule } from './automation-recipes'
import { getTriggerValidationErrors } from './trigger-editor'

describe('automation recipes', () => {
  it('ships recipes that generate valid trigger rules', () => {
    expect(automationRecipes.length).toBeGreaterThanOrEqual(6)

    for (const [index, recipe] of automationRecipes.entries()) {
      const rule = createRecipeRule(recipe, index, `test-${recipe.id}`)
      expect(rule.id).toBe(`test-${recipe.id}`)
      expect(rule.sortOrder).toBe(index)
      expect(rule.platforms.length).toBeGreaterThan(0)
      expect(rule.conditions.length).toBeGreaterThan(0)
      expect(rule.actions.length).toBeGreaterThan(0)
      expect(getTriggerValidationErrors(rule)).toEqual([])
    }
  })

  it('pairs every recipe with an Event Lab simulation payload', () => {
    for (const recipe of automationRecipes) {
      expect(recipe.simulation.type).toBeTruthy()
      expect(recipe.simulation.platform).toBeTruthy()
    }
  })

  it('ships alert recipes as plain text templates', () => {
    for (const recipe of automationRecipes) {
      for (const action of recipe.rule.actions) {
        if (action.type === 'show_alert') {
          expect(action.template).not.toMatch(/<\/?[a-z][\s>]/i)
        }
      }
    }
  })
})
