# Tactical paths vs res1 infrastructure reconciliation (Phase 2.5 audit)

Purpose: satisfy Phase 2.5 deliverable **audit** — which tactical mutators touch res4-derived infrastructure that rolls up to res1 `res1_infrastructure`, and when `reconcileRes1InfrastructureCountsFromRes4Overrides` runs.

## Call `reconcileRes1InfrastructureCountsFromRes4Overrides`

| Trigger | Location | When |
|--------|----------|------|
| Tactical Ready commit after strikes | `gameActions.commitHumanTacticalDraftOrders` | When `infrastructureDestroyedEvents.length > 0` on the merged air+ranged beat result. |

## Mutators that can change res4 / res1 infra during tactical play

| Path | Mutates infra / res4 overrides? | Reconciled in same beat? |
|------|----------------------------------|---------------------------|
| `applyTacticalAirStrikeThenRangedPhaseOnBattle` (incl. merged) | Yes — `applyInfrastructureDestructionEffects` for non-units strikes | Yes — via commit success path above when events emitted |
| `applyTacticalMeleeAfterSupportOrders` | Indirect — strategic parent deletes via `syncStrategicUnitsDbWhenTacticalParentsEliminated` | No separate reconcile here; not infra-count–driven in the same way as urban/airport strikes |
| `applyValidatedOpponentTacticalOrders` / `projectTacticalSnapshotAfterValidatedOpponentOrders` | Same air+ranged stack as before | Legacy / tests; live tactical AI uses buffer + Ready commit |
| Sealift slot IPC (`tacticalSealiftSlotUpdate`) | Embark links on snapshot + strategic DB rows | Not the same reconcile helper; uses sealift sync helpers |

## Regression tests (Phase 2.5)

- `src/main/tacticalBattle/tacticalStrategicOrderingAlignment.test.ts` — `reconcileRes1InfrastructureCountsFromRes4Overrides` smoke after `withTempGameDb`, and **tactical urban air strike** → `infrastructureDestroyedEvents` → reconcile → `res1_infrastructure.urban_hex_count` drops by one for the parent res1 hex.

## Notes

- Prefer **one reconcile per Ready commit** after the human+opponent merged beat produces infra events, to avoid redundant `saveDatabase` churn (D4).
- Failed Ready (**D6**) must not run reconcile or bump `tacticalTurnNumber`; `commitHumanTacticalDraftOrders` returns before reconcile when the beat fails.
- **D5 (buffer replace):** Main logs each successful tactical AI buffer handoff (`handleRequestAiOrders`); when the renderer already held a draft, `applySuccessfulPrecomputedAiResult` emits `console.debug('[agent-wars] tactical opponent draft replaced…')` before overwriting `S.tacticalOpponentDraft`.
