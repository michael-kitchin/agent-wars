# Docs

Living documentation for Agent Wars. **The engine under `src/` is first authority.** If a number, phase order, cap, range, or legality rule here disagrees with a symbol in code, the code is correct and this folder should be updated.

Shipping version as of this writing: **2.4.0** (`package.json`). Phase 0 (hybrid AI) and Phase 1 (global strategic game) are complete. Phase 2 tactical battles are complete through milestone **2.4**. Milestone **2.5** (player-facing save/load and session management) is not shipped. Later polish, diplomacy, and async multiplayer remain unbuilt.

## How to read this folder

| Document | Role | Status |
| --- | --- | --- |
| [combat-rules-v3.md](combat-rules-v3.md) | Combat, movement, production, fog, sealift, and tactical battles | **Current mechanics.** Numbers are taken from engine constants. |
| [game-size-unit-caps.md](game-size-unit-caps.md) | Small / Medium / Large per-side caps | **Current.** Matches `getMaxUnitsPerType`. |
| [region-vs-region.md](region-vs-region.md) | Shipped scenario, home regions, win evaluation | **Current.** Matches `evaluateRegionControlWinnerAtEndOfTurn`. |
| [hybrid-ai.md](hybrid-ai.md) | Hybrid opponent loop, callbacks, consult bounds | **Current engine behavior.** Prompt copy lives in the prompt package. |
| [ai-tools.md](ai-tools.md) | The six tool groups the model (and host) can invoke | **Current.** Names from `PATHFINDING_TOOL_NAMES` and sibling `*_TOOL_NAMES` consts. |
| [terrain-pipeline.md](terrain-pipeline.md) | What the app loads from `data/generated/` | **Current runtime.** Regeneration runbook stays in `scripts/terrain_pipeline/README.md`. |
| [game-vision-v2.md](game-vision-v2.md) | Product intent and why the game is shaped this way | **Intent, with an implementation-status note.** Where a roster, fog, or phase claim disagrees with the engine, the combat rules (and the code) win. |
| [ui-style-guide.md](ui-style-guide.md) | Map-first UI character, chrome, and interaction | **Target aesthetic plus an implementation-status note.** Unbuilt surfaces (save/load UI, diplomacy, async multiplayer) are marked. |
| [naming-conventions.md](naming-conventions.md) | How files, directories, and exported symbols are named | **Living index.** Authoritative rules stay in [`.spec/naming-conventions-contract-v1.md`](../.spec/naming-conventions-contract-v1.md). |
| [ai-commander-prompts/](ai-commander-prompts/README.md) | What the AI opponent's model is told today | **Current emission.** Builders under `src/main/openRouter/` win if this package drifts. Prompt copy is not game-rule authority; the engine is. |
| [devleopment-plan-v3.3.md](devleopment-plan-v3.3.md) | Original phased roadmap (filename keeps the historical spelling) | **Historical plan** with a current-progress header. Milestone writeups inside it are not live rules. |
| [poc-analysis.md](poc-analysis.md) | Phase 0 latency/cost research that justified the hybrid AI | **Historical research.** The hybrid pattern it recommended is now the live architecture. |
| [market-research.md](market-research.md) | 2025–2026 market landscape | **Dated research.** Not a mechanics or shipping-status document. |

## Engine constants these docs must track

When you change one of these, update `combat-rules-v3.md` (and any table that quotes it) in the same change:

| Topic | Symbol |
| --- | --- |
| Attack / defense / strategic move / strategic range | `src/main/combatConstants.ts`, `src/shared/rangePerimeterModel.ts` |
| Unit costs and build prerequisites | `src/shared/productionConfig.ts`, `src/main/productionRules.ts` |
| Per-side caps by game size | `src/shared/productionConfig.ts` (`MAX_UNITS_PER_TYPE`), `src/shared/gameSize.ts` |
| Fog vision radii | `VISION_RANGE_BY_UNIT_TYPE` in `src/main/visibility.ts` |
| Tactical ranged and movement budgets | `src/shared/tacticalRanges.ts` |
| Tactical terrain enter costs | `tacticalEnterHexMovementCost` in `src/shared/tacticalTerrainMovement.ts` |
| Tactical combat modifiers (LOS, range caps, MP) | `src/shared/tacticalTerrainCombatModifiers.ts` |
| Sub-unit multiplication | `tacticalSubUnitCountForStrategicUnitType` in `src/main/tacticalBattle/computeTacticalBattleSnapshot.ts` |
| Resolution phase order | `executeReadyStrategicTurn`, `buildResolutionOrderRule` |

Prompt-generating code is catalogued in [ai-commander-prompts/](ai-commander-prompts/README.md). That package describes today's emitted prompts and answers to the same engine symbols; it does not invent stats. How the consult is scheduled and which tools exist: [hybrid-ai.md](hybrid-ai.md) and [ai-tools.md](ai-tools.md).
