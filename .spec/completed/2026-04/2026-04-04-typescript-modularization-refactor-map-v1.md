# TypeScript Modularization Refactor Map (v1)

This map records the first implemented extraction pass from the modularization execution plan.

## `src/main/gameDb.ts`

- Spawn-region and spawn-pool selection helpers moved to:
  - `src/main/game-db/seeding/spawnSelection.ts`
- `gameDb.ts` now imports staged regional predicates and closest-candidate selection utilities from the new module.
- Corrupt-database recovery routines moved to:
  - `src/main/game-db/recovery/corruptRecovery.ts`
- `gameDb.ts` now delegates silent/UI recovery rename-delete-create flows to the new recovery module.

## `src/main/gameActions.ts`

- Air-order validation logic moved to:
  - `src/main/game-actions/airValidation.ts`
- `gameActions.ts` now delegates `validateAirStrikeOrder` and `validateFerryOrder` to the extracted module while keeping grouped validation orchestration local.
- Shared resilient H3 range-check helpers moved to:
  - `src/main/game-actions/gridRange.ts`
- `gameActions.ts` and `airValidation.ts` now share one fallback strategy for grid-distance/path/disk checks.

## `src/main/openRouter.ts`

- Air-briefing range counting helpers moved to:
  - `src/main/openrouter/rangeSupport.ts`
- `openRouter.ts` now consumes `countRowsInStrikeRange` and `isInRange` from the new module.
- Prompt briefing section builders moved to:
  - `src/main/openrouter/briefingSections.ts`
- `openRouter.ts` now delegates production and air-status briefing block construction to focused briefing modules.

## `src/renderer/renderer.ts`

- Shared projected-geometry helpers moved to:
  - `src/renderer/renderGeometry.ts`
- `renderer.ts` now imports geometry overlap/span helpers to reduce local utility concentration.
- Resolution playback timing/state derivation moved to:
  - `src/renderer/resolutionPlayback.ts`
- `renderer.ts` keeps a thin compatibility wrapper (`buildResolutionPlaybackState`) and delegates phase derivation to the extracted module.

## Phase 0 automation additions

- Baseline and phase checklist docs:
  - `.spec/typescript-modularization-baseline.md`
  - `.spec/typescript-modularization-phase-checklist.md`
- Automated circular dependency check script:
  - `scripts/check-circular-deps.cjs`
- Package scripts:
  - `check:circular`
  - `verify:modularization`
