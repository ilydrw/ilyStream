import { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { IconAlertCircle, IconBook2, IconEdit, IconFileImport, IconShieldCheck, IconSparkles, IconTemplate } from '@tabler/icons-react'
import { IconCheck, IconCopy, IconPlayerPlay, IconPlus, IconTrash, IconX } from '../../components/ui/icons'
import type { TriggerRule } from '../../../main/triggers/trigger-types'
import {
  automationRecipes,
  createRecipeRule,
  getRecipeEventLabel,
  type AutomationRecipe
} from '../../lib/automation-recipes'
import {
  createRecipePack,
  normalizeRecipePack,
  parseRecipePackText,
  prepareRulesForImport,
  reviewRecipePack,
  starterRecipePacks,
  type RecipePack,
  type RecipePackReview,
  type RecipePackRisk
} from '../../lib/recipe-packs'
import {
  describeAction,
  describeCondition
} from '../../lib/trigger-editor'

interface RecipeGalleryProps {
  triggers: TriggerRule[]
  onInstallRecipe: (recipe: AutomationRecipe) => Promise<void>
  onCustomizeRecipe: (recipe: AutomationRecipe) => void
  onTestRecipe: (recipe: AutomationRecipe) => Promise<void>
  onImportRules: (rules: TriggerRule[]) => Promise<number>
}

const LOCAL_PACKS_KEY = 'ilystream.recipePackLibrary.v1'

const ACCENT_STYLES: Record<AutomationRecipe['accent'], string> = {
  pink: 'border-[#d035f1]/35 bg-[#d035f1]/10 text-[#f0a6ff]',
  cyan: 'border-cyan-300/30 bg-cyan-300/10 text-cyan-200',
  green: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200',
  amber: 'border-amber-300/30 bg-amber-300/10 text-amber-200',
  red: 'border-rose-300/30 bg-rose-300/10 text-rose-200',
  violet: 'border-violet-300/30 bg-violet-300/10 text-violet-200'
}

export function RecipeGallery({
  triggers,
  onInstallRecipe,
  onCustomizeRecipe,
  onTestRecipe,
  onImportRules
}: RecipeGalleryProps) {
  const [selectedId, setSelectedId] = useState(automationRecipes[0]?.id ?? '')
  const [selectedCategory, setSelectedCategory] = useState<AutomationRecipe['category'] | 'All'>('All')
  const [packText, setPackText] = useState('')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  const [busyRecipeId, setBusyRecipeId] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [localPacks, setLocalPacks] = useState<RecipePack[]>([])
  const [reviewTarget, setReviewTarget] = useState<{ pack: RecipePack; source: 'paste' | 'starter' | 'library' } | null>(null)
  const [packDraft, setPackDraft] = useState({
    name: 'My Stream Pack',
    author: 'ilyStream Creator',
    description: 'My current automation setup.',
    tags: 'stream, automation'
  })

  useEffect(() => {
    setLocalPacks(loadLocalPacks())
  }, [])

  const categories = useMemo(() => {
    return ['All', ...Array.from(new Set(automationRecipes.map((recipe) => recipe.category)))] as Array<AutomationRecipe['category'] | 'All'>
  }, [])

  const recipes = useMemo(() => {
    return selectedCategory === 'All'
      ? automationRecipes
      : automationRecipes.filter((recipe) => recipe.category === selectedCategory)
  }, [selectedCategory])

  const selectedRecipe =
    automationRecipes.find((recipe) => recipe.id === selectedId) ?? automationRecipes[0]
  const selectedRule = useMemo(
    () => createRecipeRule(selectedRecipe, 0, `preview-${selectedRecipe.id}`),
    [selectedRecipe]
  )
  const installedNames = useMemo(() => new Set(triggers.map((trigger) => trigger.name)), [triggers])
  const review = useMemo(
    () => reviewTarget ? reviewRecipePack(reviewTarget.pack, triggers) : null,
    [reviewTarget, triggers]
  )

  const withRecipeBusy = async (recipe: AutomationRecipe, task: () => Promise<void>) => {
    setBusyRecipeId(recipe.id)
    setNotice(null)
    try {
      await task()
    } finally {
      setBusyRecipeId(null)
    }
  }

  const createCurrentPack = () => {
    return createRecipePack(triggers, {
      name: packDraft.name,
      author: packDraft.author,
      description: packDraft.description,
      tags: packDraft.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
    })
  }

  const saveCurrentPack = () => {
    if (triggers.length === 0) {
      setNotice({ tone: 'warn', text: 'There are no trigger rules to save yet.' })
      return
    }

    const pack = createCurrentPack()
    const nextPacks = [pack, ...localPacks.filter((item) => item.metadata.id !== pack.metadata.id)].slice(0, 24)
    setLocalPacks(nextPacks)
    saveLocalPacks(nextPacks)
    setNotice({ tone: 'ok', text: `Saved ${pack.metadata.name} to the local library.` })
  }

  const copyPack = async (pack = createCurrentPack()) => {
    if (pack.rules.length === 0) {
      setNotice({ tone: 'warn', text: 'There are no trigger rules to export yet.' })
      return
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(pack, null, 2))
      setNotice({ tone: 'ok', text: `Copied ${pack.metadata.name} as an .ilypack JSON payload.` })
    } catch {
      setNotice({ tone: 'warn', text: 'Could not access the clipboard. Review the pack and copy it from the import/export payload instead.' })
    }
  }

  const reviewPastedPack = () => {
    try {
      const pack = parseRecipePackText(packText)
      setReviewTarget({ pack, source: 'paste' })
      setNotice(null)
    } catch (error) {
      setNotice({
        tone: 'warn',
        text: error instanceof Error ? error.message : 'Could not parse that recipe pack.'
      })
    }
  }

  const deleteLocalPack = (packId: string) => {
    const nextPacks = localPacks.filter((pack) => pack.metadata.id !== packId)
    setLocalPacks(nextPacks)
    saveLocalPacks(nextPacks)
    setNotice({ tone: 'ok', text: 'Removed the pack from the local library.' })
  }

  const confirmImport = async () => {
    if (!reviewTarget || !review?.canImport) return

    setIsImporting(true)
    try {
      const rules = prepareRulesForImport(reviewTarget.pack, triggers.length, {
        namePrefix: reviewTarget.source === 'starter' ? '' : 'Imported: '
      })
      const importedCount = await onImportRules(rules)
      setPackText('')
      setReviewTarget(null)
      setNotice({ tone: 'ok', text: `Imported ${importedCount} rule(s) from ${reviewTarget.pack.metadata.name}.` })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {notice && (
        <div className={`rounded-xl border px-4 py-3 text-xs font-semibold flex items-center gap-3 ${ notice.tone === 'ok' ? 'border-success/25 bg-success/10 text-success' : 'border-warning/25 bg-warning/10 text-warning' }`}>
          {notice.tone === 'ok' ? <IconCheck size={16} /> : <IconAlertCircle size={16} />}
          {notice.text}
        </div>
      )}

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
        <div className="app-section-card glass !p-0 overflow-hidden">
          <div className="app-section-head">
            <div className="flex items-center gap-4">
              <div className="text-accent">
                <IconTemplate size={30} />
              </div>
              <div>
                <h2 className="text-sm font-semibold tracking-tight">Recipe Gallery</h2>
                <p>Install proven event setups, customize them, then test the exact route in Event Lab.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`h-9 px-3 rounded-lg border text-[10px] font-semibold tracking-normal transition-all ${ selectedCategory === category ? 'border-[#d035f1]/50 bg-[#d035f1]/15 text-white' : 'border-white/10 bg-white/[0.03] text-white/35 hover:text-white' }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {recipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                selected={recipe.id === selectedRecipe.id}
                installed={installedNames.has(recipe.rule.name)}
                busy={busyRecipeId === recipe.id}
                onSelect={() => setSelectedId(recipe.id)}
                onInstall={() => void withRecipeBusy(recipe, async () => {
                  await onInstallRecipe(recipe)
                  setNotice({ tone: 'ok', text: `Installed ${recipe.name}.` })
                })}
                onCustomize={() => onCustomizeRecipe(recipe)}
                onTest={() => void withRecipeBusy(recipe, async () => {
                  await onTestRecipe(recipe)
                  setNotice({ tone: 'ok', text: `Fired a ${getRecipeEventLabel(recipe)} test event for ${recipe.name}.` })
                })}
              />
            ))}
          </div>
        </div>

        <aside className="app-section-card glass !p-0 overflow-hidden">
          <div className="app-section-head">
            <div>
              <p className="text-[10px] font-semibold tracking-normal text-white/30">Visual Builder</p>
              <h2 className="text-sm font-semibold tracking-tight text-white">{selectedRecipe.name}</h2>
            </div>
            <NavLink to="/event-lab" className="app-button !h-9 !px-3 text-[10px] font-semibold">
              Event Lab
            </NavLink>
          </div>

          <div className="p-5 space-y-5">
            <div className={`rounded-xl border p-4 ${ACCENT_STYLES[selectedRecipe.accent]}`}>
              <p className="text-[10px] font-semibold tracking-normal opacity-70">{selectedRecipe.category}</p>
              <p className="mt-2 text-sm font-semibold text-white">{selectedRecipe.summary}</p>
              <p className="mt-2 text-xs text-white/45 leading-relaxed">{selectedRecipe.outcome}</p>
            </div>

            <RecipeFlowPreview rule={selectedRule} recipe={selectedRecipe} />

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onCustomizeRecipe(selectedRecipe)}
                className="app-button !h-10 text-[10px] font-semibold tracking-normal"
              >
                <IconEdit size={14} className="mr-2" />
                Customize
              </button>
              <button
                onClick={() => void withRecipeBusy(selectedRecipe, async () => {
                  await onTestRecipe(selectedRecipe)
                  setNotice({ tone: 'ok', text: `Fired a ${getRecipeEventLabel(selectedRecipe)} test event.` })
                })}
                className="app-button-primary !h-10 text-[10px] font-semibold tracking-normal"
              >
                <IconPlayerPlay size={14} className="mr-2" />
                Test
              </button>
            </div>
          </div>
        </aside>
      </section>

      <section className="app-section-card glass !p-0 overflow-hidden">
        <div className="app-section-head">
          <div className="flex items-center gap-4">
            <div className="text-accent">
              <IconShieldCheck size={30} />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Pack Library</h2>
              <p>Save local packs, review starter packs, and inspect shared imports before they touch your rules.</p>
            </div>
          </div>
        </div>

        <div className="p-5 grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
          <div className="space-y-6 min-w-0">
            <PackShelf
              title="Starter Packs"
              emptyText="Starter packs are unavailable."
              packs={starterRecipePacks}
              onReview={(pack) => setReviewTarget({ pack, source: 'starter' })}
              onCopy={(pack) => void copyPack(pack)}
            />

            <PackShelf
              title="Local Library"
              emptyText="No saved local packs yet."
              packs={localPacks}
              onReview={(pack) => setReviewTarget({ pack, source: 'library' })}
              onCopy={(pack) => void copyPack(pack)}
              onDelete={deleteLocalPack}
            />
          </div>

          <div className="space-y-6 min-w-0">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center gap-3 mb-4">
                <IconBook2 size={18} className="text-accent" />
                <div>
                  <h3 className="text-sm font-semibold text-white">Save Current Rules</h3>
                  <p className="text-xs text-white/35">Create a local pack from the rules currently installed.</p>
                </div>
              </div>
              <div className="space-y-3">
                <input
                  value={packDraft.name}
                  onChange={(event) => setPackDraft((prev) => ({ ...prev, name: event.target.value }))}
                  className="app-input !h-10 !text-xs"
                  placeholder="Pack name"
                />
                <input
                  value={packDraft.author}
                  onChange={(event) => setPackDraft((prev) => ({ ...prev, author: event.target.value }))}
                  className="app-input !h-10 !text-xs"
                  placeholder="Author"
                />
                <textarea
                  value={packDraft.description}
                  onChange={(event) => setPackDraft((prev) => ({ ...prev, description: event.target.value }))}
                  className="app-input min-h-[76px] !py-3 !text-xs resize-none"
                  placeholder="Description"
                />
                <input
                  value={packDraft.tags}
                  onChange={(event) => setPackDraft((prev) => ({ ...prev, tags: event.target.value }))}
                  className="app-input !h-10 !text-xs"
                  placeholder="tags, comma, separated"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={saveCurrentPack} className="app-button-primary !h-10 text-[10px] font-semibold tracking-normal">
                    <IconPlus size={14} className="mr-2" />
                    Save Pack
                  </button>
                  <button onClick={() => void copyPack()} className="app-button !h-10 text-[10px] font-semibold tracking-normal">
                    <IconCopy size={14} className="mr-2" />
                    Copy
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center gap-3 mb-4">
                <IconFileImport size={18} className="text-accent" />
                <div>
                  <h3 className="text-sm font-semibold text-white">Import Review</h3>
                  <p className="text-xs text-white/35">Paste shared `.ilypack` JSON. You will review it before import.</p>
                </div>
              </div>
              <textarea
                value={packText}
                onChange={(event) => setPackText(event.target.value)}
                placeholder='Paste {"type":"ilystream.trigger-pack","metadata":...,"rules":[...]}'
                className="app-input min-h-[154px] !py-3 !text-xs font-mono resize-none"
              />
              <button
                onClick={reviewPastedPack}
                disabled={packText.trim().length === 0}
                className="app-button-primary mt-3 w-full !h-10 text-[10px] font-semibold tracking-normal disabled:opacity-40"
              >
                <IconShieldCheck size={14} className="mr-2" />
                Review Pack
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="app-section-card glass">
        <div className="app-section-head !px-0 !pt-0">
          <div className="flex items-center gap-4">
            <div className="text-accent">
              <IconSparkles size={28} />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight">One-Click Test Loop</h2>
              <p>Install a recipe, customize it if needed, fire a synthetic event, and inspect every downstream packet.</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {['Pick Recipe', 'Customize Rule', 'Run Test Event', 'Inspect Event Lab'].map((label, index) => (
            <div key={label} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
              <p className="text-[10px] font-semibold tracking-normal text-white/20">Step {index + 1}</p>
              <p className="mt-2 text-sm font-semibold text-white/75">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {reviewTarget && review && (
        <PackReviewModal
          review={review}
          source={reviewTarget.source}
          isImporting={isImporting}
          onClose={() => setReviewTarget(null)}
          onImport={() => void confirmImport()}
        />
      )}
    </div>
  )
}

function RecipeCard({
  recipe,
  selected,
  installed,
  busy,
  onSelect,
  onInstall,
  onCustomize,
  onTest
}: {
  recipe: AutomationRecipe
  selected: boolean
  installed: boolean
  busy: boolean
  onSelect: () => void
  onInstall: () => void
  onCustomize: () => void
  onTest: () => void
}) {
  return (
    <div
      className={`rounded-xl border p-4 transition-all ${ selected ? 'border-[#d035f1]/45 bg-[#d035f1]/10' : 'border-white/[0.07] bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.04]' }`}
      onMouseEnter={onSelect}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`rounded-md border px-2 py-1 text-[9px] font-semibold tracking-normal ${ACCENT_STYLES[recipe.accent]}`}>
              {recipe.category}
            </span>
            <span className="text-[9px] font-semibold tracking-normal text-white/25">{recipe.difficulty}</span>
            {installed && <span className="text-[9px] font-semibold tracking-normal text-success">Installed</span>}
          </div>
          <h3 className="mt-3 text-base font-semibold text-white tracking-tight">{recipe.name}</h3>
          <p className="mt-2 text-xs text-white/42 leading-relaxed">{recipe.summary}</p>
        </div>
        <button
          onClick={onTest}
          disabled={busy}
          className="h-9 w-9 rounded-lg border border-white/10 bg-black/25 flex items-center justify-center text-white/45 hover:text-white hover:border-[#d035f1]/50 transition-all disabled:opacity-30 shrink-0"
          title="Test recipe"
        >
          <IconPlayerPlay size={14} />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {recipe.tags.map((tag) => (
          <span key={tag} className="rounded-md bg-black/25 border border-white/[0.06] px-2 py-1 text-[9px] font-semibold text-white/28">
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={onInstall}
          disabled={busy}
          className="app-button-primary !h-9 text-[10px] font-semibold tracking-normal disabled:opacity-40"
        >
          <IconPlus size={13} className="mr-1.5" />
          Install
        </button>
        <button
          onClick={onCustomize}
          disabled={busy}
          className="app-button !h-9 text-[10px] font-semibold tracking-normal disabled:opacity-40"
        >
          <IconEdit size={13} className="mr-1.5" />
          Edit
        </button>
      </div>
    </div>
  )
}

function PackShelf({
  title,
  emptyText,
  packs,
  onReview,
  onCopy,
  onDelete
}: {
  title: string
  emptyText: string
  packs: RecipePack[]
  onReview: (pack: RecipePack) => void
  onCopy: (pack: RecipePack) => void
  onDelete?: (packId: string) => void
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <span className="text-[10px] font-semibold tracking-normal text-white/25">{packs.length} pack(s)</span>
      </div>
      {packs.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-5 text-sm font-semibold text-white/25">
          {emptyText}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {packs.map((pack) => (
            <PackCard
              key={pack.metadata.id}
              pack={pack}
              onReview={() => onReview(pack)}
              onCopy={() => onCopy(pack)}
              onDelete={onDelete ? () => onDelete(pack.metadata.id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PackCard({
  pack,
  onReview,
  onCopy,
  onDelete
}: {
  pack: RecipePack
  onReview: () => void
  onCopy: () => void
  onDelete?: () => void
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-white truncate">{pack.metadata.name}</h4>
          <p className="mt-1 text-[10px] font-semibold text-white/28">by {pack.metadata.author}</p>
        </div>
        <span className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[9px] font-semibold tracking-normal text-white/28 shrink-0">
          {pack.rules.length} rules
        </span>
      </div>
      <p className="mt-3 text-xs text-white/42 leading-relaxed line-clamp-2">{pack.metadata.description}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {pack.metadata.tags.slice(0, 4).map((tag) => (
          <span key={tag} className="rounded-md bg-black/25 border border-white/[0.06] px-2 py-1 text-[9px] font-semibold text-white/28">
            {tag}
          </span>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button onClick={onReview} className="app-button-primary !h-9 flex-1 text-[10px] font-semibold tracking-normal">
          Review
        </button>
        <button onClick={onCopy} className="app-button !h-9 !w-9 !p-0" title="Copy pack">
          <IconCopy size={14} />
        </button>
        {onDelete && (
          <button onClick={onDelete} className="app-button-danger !h-9 !w-9 !p-0" title="Delete pack">
            <IconTrash size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

function PackReviewModal({
  review,
  source,
  isImporting,
  onClose,
  onImport
}: {
  review: RecipePackReview
  source: 'paste' | 'starter' | 'library'
  isImporting: boolean
  onClose: () => void
  onImport: () => void
}) {
  const highRiskCount = review.risks.filter((risk) => risk.severity === 'high').length
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-5xl max-h-[88vh] overflow-hidden rounded-md border border-white/10 bg-background shadow-2xl">
        <div className="border-b border-white/10 p-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold tracking-normal text-white/30">
              {source === 'paste' ? 'Shared Pack Review' : source === 'starter' ? 'Starter Pack Review' : 'Local Pack Review'}
            </p>
            <h3 className="mt-1 text-xl font-semibold text-white">{review.pack.metadata.name}</h3>
            <p className="mt-1 text-sm text-white/45">{review.pack.metadata.description}</p>
          </div>
          <button onClick={onClose} className="app-button !h-9 !w-9 !p-0">
            <IconX size={15} />
          </button>
        </div>

        <div className="max-h-[calc(88vh-152px)] overflow-y-auto custom-scrollbar p-5 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <ReviewMetric label="Rules" value={review.pack.rules.length} />
            <ReviewMetric label="Risks" value={review.risks.length} tone={review.risks.length > 0 ? 'warn' : 'ok'} />
            <ReviewMetric label="High Risk" value={highRiskCount} tone={highRiskCount > 0 ? 'danger' : 'ok'} />
            <ReviewMetric label="Duplicates" value={review.duplicateRuleCount} tone={review.duplicateRuleCount > 0 ? 'warn' : 'ok'} />
            <ReviewMetric label="Invalid" value={review.invalidRuleCount} tone={review.invalidRuleCount > 0 ? 'danger' : 'ok'} />
          </div>

          {review.risks.length > 0 && (
            <div className="rounded-xl border border-warning/20 bg-warning/10 p-4">
              <div className="flex items-center gap-2 text-warning mb-3">
                <IconAlertCircle size={16} />
                <p className="text-xs font-semibold tracking-normal">Review risky actions before importing</p>
              </div>
              <div className="space-y-2">
                {review.risks.map((risk, index) => (
                  <div key={`${risk.ruleName}-${risk.actionType}-${index}`} className="flex items-start gap-2">
                    <RiskBadge risk={risk} />
                    <p className="text-xs text-white/62 leading-relaxed">
                      <span className="font-semibold text-white/80">{risk.ruleName}</span>: {risk.message}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {review.rules.map((item) => (
              <div key={item.rule.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-semibold text-white">{item.rule.name}</h4>
                      {item.duplicateName && <span className="text-[9px] font-semibold tracking-normal text-warning">duplicate name</span>}
                      {item.validationErrors.length > 0 && <span className="text-[9px] font-semibold tracking-normal text-danger">needs fixes</span>}
                    </div>
                    <p className="mt-1 text-[10px] font-semibold text-white/28">
                      {item.rule.platforms.join(', ')} • {item.rule.conditions.length} condition(s) • {item.rule.actions.length} action(s)
                    </p>
                  </div>
                </div>

                {item.validationErrors.length > 0 && (
                  <div className="mt-3 rounded-lg border border-danger/25 bg-danger/10 p-3">
                    {item.validationErrors.map((error) => (
                      <p key={error} className="text-xs font-semibold text-danger">{error}</p>
                    ))}
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <SummaryList title="Conditions" items={item.conditionSummaries} />
                  <SummaryList title="Actions" items={item.actionSummaries} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-white/10 p-4 flex items-center justify-end gap-2">
          <button onClick={onClose} className="app-button !h-10 !px-4 text-[10px] font-semibold tracking-normal">
            Cancel
          </button>
          <button
            onClick={onImport}
            disabled={!review.canImport || isImporting}
            className="app-button-primary !h-10 !px-5 text-[10px] font-semibold tracking-normal disabled:opacity-40"
          >
            {isImporting ? 'Importing...' : highRiskCount > 0 ? 'Import Reviewed Pack' : 'Import Pack'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RecipeFlowPreview({ rule, recipe }: { rule: TriggerRule; recipe: AutomationRecipe }) {
  return (
    <div className="space-y-3">
      <FlowBlock
        eyebrow="Event"
        title={getRecipeEventLabel(recipe)}
        items={rule.platforms.map((platform) => platform)}
      />
      <FlowBlock
        eyebrow="Conditions"
        title={`${rule.conditions.length} gate(s)`}
        items={rule.conditions.map((condition) => describeCondition(condition))}
      />
      <FlowBlock
        eyebrow="Actions"
        title={`${rule.actions.length} response(s)`}
        items={rule.actions.map((action) => describeAction(action))}
      />
    </div>
  )
}

function FlowBlock({ eyebrow, title, items }: { eyebrow: string; title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[10px] font-semibold tracking-normal text-white/25">{eyebrow}</p>
        <p className="text-xs font-semibold text-white/70">{title}</p>
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item, index) => (
          <div key={`${eyebrow}-${index}`} className="flex items-start gap-2">
            <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#d035f1]/70 shrink-0" />
            <p className="text-xs text-white/42 leading-relaxed">{item}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
      <p className="text-[10px] font-semibold tracking-normal text-white/24 mb-2">{title}</p>
      <div className="space-y-1.5">
        {items.map((item, index) => (
          <p key={`${title}-${index}`} className="text-xs text-white/48 leading-relaxed">{item}</p>
        ))}
      </div>
    </div>
  )
}

function RiskBadge({ risk }: { risk: RecipePackRisk }) {
  const className =
    risk.severity === 'high'
      ? 'border-danger/30 bg-danger/10 text-danger'
      : risk.severity === 'medium'
        ? 'border-warning/30 bg-warning/10 text-warning'
        : 'border-white/10 bg-white/[0.04] text-white/40'

  return (
    <span className={`rounded-md border px-2 py-0.5 text-[9px] font-semibold tracking-normal shrink-0 ${className}`}>
      {risk.severity}
    </span>
  )
}

function ReviewMetric({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'ok' | 'warn' | 'danger' }) {
  const valueClass =
    tone === 'ok' ? 'text-success' : tone === 'warn' ? 'text-warning' : tone === 'danger' ? 'text-danger' : 'text-white'

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
      <p className="text-[10px] font-semibold tracking-normal text-white/25">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${valueClass}`}>{value.toLocaleString()}</p>
    </div>
  )
}

function loadLocalPacks(): RecipePack[] {
  try {
    const raw = localStorage.getItem(LOCAL_PACKS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => normalizeRecipePack(item)).filter((pack) => pack.rules.length > 0)
  } catch {
    return []
  }
}

function saveLocalPacks(packs: RecipePack[]): void {
  localStorage.setItem(LOCAL_PACKS_KEY, JSON.stringify(packs))
}
