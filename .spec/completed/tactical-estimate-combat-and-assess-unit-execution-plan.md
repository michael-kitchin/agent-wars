# Tactical estimate_combat and assess_unit — Execution Plan

Enable `estimate_combat` and a battle-aware `assess_unit` during tactical battles, gated by the user's Assessment and Estimation tool-group toggles. Melee estimates cover both random role assignments in both theaters, and both theaters exclude embarked-at-sea land units the same way their combat resolution does.

**Do not** put this document's phase numbers or labels into product code, comments, configuration, or docs. Never commit or push.

## Locked Decisions

- **Gating:** in battles the two tools follow the user's Assessment and Estimation toggles. `assess_hex`, memory, orders, and production stay stripped. Every group is on by default (`src/renderer/core/state.ts`), so battles get both tools by default. This is an intended behavior change.
- **assess_unit in battles:** the richer version, with path-based beats-to-reach from the battle march planner.
- **Guidance:** strategic-parity wording, narrowed to what the tool covers: "Use estimate_combat before any ranged or melee attack. Do not guess at combat odds." Plus an assess_unit bullet adapted for sub-units.
- **Melee role randomness, both theaters:** `runMeleePhase` shuffles which side rolls attack and which rolls defense, 50/50 for two sides. The melee `prediction` is the average of both cases; `meleeRoleOutcomes` carries `attackersRollAttack` and `attackersRollDefense`.
- **Air strikes:** not estimated. In battles an air attacker (real or assumed) gets a clear error. Strategic air behavior is unchanged.
- **Embarked cargo:**
  - Strategic: land units with `embarkedOnNavalUnitId` standing on a `water` hex are excluded from ranged and melee input, matching `readyStrategicResolutionPipeline.ts`. Pure snapshot check, no database call.
  - Battles: embarked-at-sea land units are excluded from ranged input only (`tacticalEmbarkedLandExcludedFromRangedInput`); melee keeps every unit.

## Verified Facts

- Battle ranged and melee use the same dice as strategic (`runRangedPhase`, `resolveOneRangedEngagement`, `runMeleePhase`).
- The battle return-fire context was built inline in `tacticalStrategicOrderPhases.ts`.
- Shared battle rules: `tacticalRangedDirectFirePassesTerrainAndRange`, `effectiveTacticalRangedMaxRangeForAttacker`, `effectiveTacticalMovementPointBudgetForMarchLeg`, `tacticalMovementTerrainAnchorH3`, `effectiveRes4TerrainKindString`, `canDefenderReturnFireAtAttackerHex`, `planTacticalRes4MarchWithSessionCache` (memoized per battle and turn).
- Argument and result encoding already handle `targetHex` and `position` in battle mode.
- The first tool round is already forced to a tool call whenever tools exist.
- Attack: infantry 1, armor 3, naval 2, air 3. Defense: infantry 2, armor 2, naval 2, air 1.

## Phases

Each phase ends with `npm run build:main`, the named `node dist/...test.js` files, and `npm run lint`. If a result does not match, investigate instead of editing assertions.

0. **Preflight.** `npm run rebuild:native:node`, `npm run build:main`, baseline the affected tests.
1. **Fixture and march estimate.** `testSupport/tacticalToolFixtures.ts` (near/mid/far line from `cellToCenterChild`), `tools/tacticalMarchEstimate.ts` (`estimateTacticalMarch`, `estimateTacticalTurnsRequired`); `tacticalPathfinding.ts` uses the helper.
2. **Battle combat input rules.** `tacticalBattle/tacticalCombatInput.ts` with `buildTacticalReturnFireContext` and the moved `tacticalEmbarkedLandExcludedFromRangedInput`; `tacticalStrategicOrderPhases.ts` imports them.
3. **Strategic estimator refactor.** `computeEngagementPrediction`, `CombatEstimationTheater`, strategic theater, melee both roles, strategic embarked filter; update `testExactCombatProbabilities` (5/12, 1/4, `even`; roles 1/2 & 1/3, 1/3 & 1/6).
4. **Battle theater for estimate_combat.** `buildTacticalCombatEstimationTheater`; optional `tacticalBattle` on the executors; tests for infantry range 2 on plains, forest cap, air rejection, melee averaging, embarked cargo.
5. **Battle assess_unit.** `tools/tacticalAssessUnit.ts`; `executeAssessment` gains `tacticalBattle`; `assess_hex` refused in battles.
6. **Wiring.** `filterToolNamesForTacticalBattle` in `openRouterToolGroups.ts`; `requestOrdersFlow.ts` and `requestOrdersToolLoop.ts`.
7. **Prompt text.** Mode-neutral tool descriptions, `TACTICAL_TOOL_PROMPT_LINES`, tactical guidance bullets, planning gate in the tactical tools intro; contract tests.
8. **Living docs.** `tactical-prompt.md`, `assembly-contract.md`, `variants.md`, `source-inventory.md`, `ai-tools.md`.
9. **Final verification.** `npm test`, `npm run check:circular`, file sizes, rule audit, phase-label grep.

## Status

All phases are implemented and verified (`npm test`, `npm run check:circular`). Review passes added:

- `normalizeCombatSideArgs`: non-array `units` and malformed `assumed` entries are ignored, and counts round down and never go below zero. This restores the old array-only handling of `units`.
- Battle `assess_unit` out-of-reach reasons name the blocking rule (airport, embarked cargo, or distance against battle range).
- Trace logs in `tacticalCombatInput.ts`.
- `doc/ai-tools.md` documents the argument and side rules; `doc/combat-rules-v3.md` §4.8 states which melee side rolls attack.

## Known Limits

- Very large `assumed` counts are not capped (as before), so a huge count can stall the main process.
- `doc/combat-rules-v3.md` says air does not take part in melee, but both melee paths pass air units to `runMeleePhase`. Estimates follow the engine.

- Strategic-parity wording can add tool rounds in large battles (limit 50; batching bullet applies).
- Air strikes are not estimated.
- Out of scope: the shared option-copy clause in `optionCopyText.ts` names `plan_route` even when planning is off.
- The briefing's lightweight assessment still treats adjacency as melee range, so the tool's field is named `canEnterCellThisBeat`.
