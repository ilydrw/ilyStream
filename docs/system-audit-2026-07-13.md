# ilyStream system audit — 2026-07-13

## Executive summary

ilyStream's core architecture is sound for a desktop broadcast application: the Electron renderer is isolated from Node, privileged work is routed through the preload bridge, and production dependencies currently have no reported npm vulnerabilities. The highest operational risk is concentrated in a few large, stateful modules that combine device lifecycle, rendering, persistence, and platform behavior.

This audit deliberately avoided a large rewrite. It removed confirmed structural defects, extracted low-risk boundaries from the two largest user-facing pages, added regression guards, and verified the result in the running Electron app. No runtime dependency was added.

## Scope and method

The review covered:

- Electron main, preload, renderer, and shared-process boundaries
- Broadcast Studio media, canvas, output, and modal lifecycles
- TikTok native authorization UI and sender contracts
- overlay routing, event transport, and offline asset behavior
- database repository dependencies
- IPC registration and event contracts
- module graph cycles and large-file concentration
- security posture, dependency audit, tests, build output, and live UI smoke checks

This is a system and code-quality audit with security-posture checks. It is not a penetration test or an exhaustive adversarial security assessment.

## Improvements completed

### 1. Broadcast Studio decomposition

`src/renderer/pages/BroadcastPage/index.tsx` remains the lifecycle coordinator, but pure calculations and presentation-only concerns no longer live inline with media orchestration.

Extracted boundaries:

- `utils/broadcast-page-utils.ts` for output normalization, Twitch caps, virtual-camera preferences, aspect mapping, and rectangle helpers
- `components/StingerConfigModal.tsx` for transition configuration
- `components/HotkeyLegend.tsx` for the production shortcut guide

The page is now about 1,200 lines instead of also owning those helpers and modal implementations. The extracted pure utilities have direct edge-case tests.

Live verification also found that the shortcut dialog's state existed without a rendered trigger. A compact, accessible header control was restored, outside-click dismissal was added, and Escape now closes active Broadcast Studio overlays consistently.

### 2. TikTok page decomposition

The native Login Kit workflow is now isolated in `components/TikTokNativeAccessCard.tsx`. It owns native-auth status, progress, errors, countdowns, connection actions, and cleanup while preserving the full platform configuration when the client key is saved.

`src/renderer/pages/TikTokPage/index.tsx` is now about 750 lines and is focused on page composition and the event/manual RTMP experience.

### 3. Circular dependencies eliminated

The production TypeScript graph contained four circular import paths. They came from:

- database row types being defined in the database implementation and imported by repositories
- event-replay types being defined through the renderer store that also consumed replay behavior

Database row contracts now live in `src/main/db/types.ts`, and the event-lab entry kind is owned by the replay contract. The graph now reports zero cycles across roughly 500 production modules.

`src/main/architecture.test.ts` makes this an enforced invariant so cycles cannot silently return.

### 4. Duplicate IPC registration removed

`overlay:notify-speech-state` was registered by both overlay and widget handler groups even though both groups are installed at startup. The duplicate widget-side listener was removed.

`src/main/ipc/handlers/handler-registration.test.ts` now builds the aggregate handler set and asserts that the channel is registered exactly once.

### 5. Cross-process contract tightened

The TikTok sender status contract moved to `src/shared/tiktok-sender.ts`. The main sender continues to re-export it for compatibility, while the renderer imports the process-neutral contract directly.

This is the pattern recommended for the remaining renderer-to-main type imports: move contracts incrementally, keep compatibility re-exports, and avoid a flag-day rewrite.

### 6. Content security policy made more offline-friendly

The renderer already bundles its Inter font, so the unused Google Fonts allowances were removed from the CSP. Font loading is now restricted to the packaged app.

### 7. Accessibility and interaction polish

- native TikTok auth fields have linked labels and status/alert semantics
- extracted dialogs have dialog semantics and labeled close controls
- numeric stinger timing cannot be set below zero
- the shortcut toggle exposes its pressed state and remains available at normal desktop widths
- Escape closes source, multi-view, stinger, shortcut, and recording overlays

## Verification record

| Check | Result |
| --- | --- |
| TypeScript validation (`npm run lint`) | Pass |
| Full Vitest suite (`npm test`) | 74 files, 487 tests passed |
| Production build (`npm run build`) | Pass |
| Production dependency audit (`npm audit --omit=dev`) | 0 reported vulnerabilities |
| Production import graph | About 500 modules, 0 cycles |
| Electron security defaults | sandbox enabled, context isolation enabled, Node integration disabled |
| Live TikTok page | Native-access card, saved client key, and connect control rendered |
| Live Broadcast Studio | Editor rendered; shortcut trigger, dialog, close control, and Escape dismissal verified |

## Remaining priorities

| Priority | Area | Why it matters | Safest next move |
| --- | --- | --- | --- |
| P1 | `StatsRepository.ts` | About 1,250 lines with identity aggregation and persistence behavior but no direct repository-level suite | Add characterization tests around identity merge, leaderboards, and transaction boundaries; then extract query groups behind the existing repository API |
| P1 | `useRenderLoop.ts` | About 900 lines combining frame scheduling, layout, masks, effects, and multiple outputs | Add deterministic canvas/frame fixtures first; then extract draw stages as pure operations while preserving one scheduler and current media ownership |
| P1 | Shared contracts | Renderer and shared modules still import several types from `src/main/platforms/types.ts` | Move one contract family at a time into `src/shared`, with compatibility re-exports and type-only import checks |
| P2 | YouTube and Kick connectors | Discovery, authorization, mapping, and polling are concentrated in large connector classes | Add connector contract tests, then extract response mapping and polling policy without changing the public connector interface |
| P2 | Preload typing | The bridge still uses broad `any` casts in high-churn IPC paths | Introduce a channel-to-argument/result map and migrate one feature family per change |
| P2 | Polling ownership | Timers are scattered across pages and services | Consolidate only equivalent polls into visibility-aware hooks or service schedulers; do not merge device/media heartbeats with network polling |
| P2 | Initial renderer payload | The main entry is roughly 2.2 MB; Broadcast Studio is statically included to preserve its post-visit media lifecycle | Add an integration test for mount-after-first-visit behavior before attempting lazy loading; retain the deliberate keep-mounted semantics |
| P3 | Fully offline overlays | A small number of optional visual fallbacks may still reference remote assets | Finish the runtime asset inventory and replace only fallbacks that can appear inside embedded browser sources |

## Architecture guidance

Further decomposition should follow ownership boundaries, not arbitrary line counts:

1. Keep resource owners stable. Camera tracks, audio graphs, render schedulers, and platform sockets should each have one lifecycle owner.
2. Extract pure transformations first. They are cheap to test and do not alter runtime timing.
3. Characterize stateful behavior before moving it. This is mandatory for database identity logic and the render loop.
4. Preserve compatibility at process boundaries. Shared contracts plus temporary re-exports allow incremental migration.
5. Measure startup and live-frame behavior before and after performance work. Bundle size alone is not a sufficient reason to disturb the Broadcast Studio lifecycle.

## Working-tree note

The repository had pre-existing uncommitted work spanning TikTok authorization, overlay hardening, camera/media behavior, and UI polish. This audit left unrelated changes intact and added narrowly scoped refactors and regression guards on top of that state. Review or commit by logical feature group rather than treating the entire dirty tree as one audit patch.
