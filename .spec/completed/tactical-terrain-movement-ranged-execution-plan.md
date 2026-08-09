# Execution plan: tactical terrain limits on movement and ranged attacks

## Audience and intent

This document is written for an **implementing agent with limited context**. Follow phases **in order**. Do not skip verification gates. Prefer **small, pure helpers** in `src/shared/` (or existing tactical modules) with **unit tests** over scattering inline conditionals.

## Goals

Implement four combat-design behaviors on the **tactical res4 footprint** only (unless a phase explicitly says otherwise):

1. **Mountain ranged block (air, armor, naval):** Tactical ranged attacks are **implicit line-of-sight (LOS)**. Those unit types **cannot** execute a ranged attack if **LOS is blocked by a mountain** res4 cell. Blocked means any **LOS cell** (attacker cell, target cell, or intervening cell on the LOS trace) is classified as **mountain** per terrain rules below. *(Infantry is out of scope for this mountain rule unless design later extends it.)*
2. **Forest / urban / rubble ranged cap (armor, infantry):** When the **attacker** stands on a **forest**, **urban**, or **rubble** res4 cell, its **tactical ranged max range is 1** (same grid semantics as today: H3 `gridDistance` / existing `isWithinGridRangeSafe` cap).
3. **Forest movement cap (armor):** When **armor** starts a march leg from a **forest** res4 cell, its **movement point budget** for that leg equals **infantry’s** budget (`MOVEMENT_RANGE_BY_UNIT_TYPE.infantry`, currently `2`).
4. **Urban / rubble movement cap (armor, infantry):** When **armor or infantry** starts a march leg from an **urban** or **rubble** res4 cell, its **movement point budget** for that leg is **`1`** movement point (not “one H3 edge” unless the planner already maps that way—see **Locked semantics**).

## Non-goals

- Changing **strategic** ranged or movement rules (`validateRangedAttack` on DB units, strategic grid range) except where code is **unavoidably shared**—then branch on `isTacticalBattleActive()` like `validateGroupRangedTarget` already does.
- Changing **melee**, **air strikes** (separate pipeline), **ferry**, or **naval** movement topology rules beyond the stated ranged mountain block for **naval** *ranged attacks*.
- Inventing new terrain types; use **existing** res4 terrain strings and **feature flags** already loaded for tactical snapshots.
- **Post-validation return fire:** Do **not** add new terrain or LOS checks inside `runRangedPhase` / `resolveOneRangedEngagement` that could forbid **return fire** for an engagement that **already passed** order validation. If the attack is **allowed**, **return fire is allowed** (existing dice rules). **Superseded** by `.spec/return-fire-planning-parity.md` (return fire now uses planning-parity reach / terrain checks).

## Stakeholder decisions and open questions (resolve before coding if ambiguous)

These are **defaults assumed by this plan** unless product owner overrides:

| Topic | Locked default for implementation |
|--------|-----------------------------------|
| **Line-of-sight (LOS) geometry** | **Product rule:** ranged is implicit LOS; **mountain on LOS forbids** the attack. **Implementation default:** treat the LOS cell sequence as **`gridPathCells(attackerH3, targetH3)`** on the **res4** H3 indexes (same pair used for range). Examine **every returned cell** for mountain. If **`gridPathCells` throws**, **reject** the attack (fail closed) and log at **error** with both indexes—do not fall back to distance-only, which would violate LOS. If `.spec` combat rules later define a different LOS trace (e.g. alternate hex-line algorithm), replace this row only after updating tests. |
| **Mountain detection** | A res4 cell is “mountain” when the **effective kind** for that cell normalizes to mountains per `normalizeDbTerrainKindToTacticalCategory` (e.g. raw `mountain` / `mountains` in `res4TerrainKindByH3` or parent fallback)—consistent with `src/shared/tacticalTerrainMovement.ts`. |
| **Forest detection** | Effective kind normalizes to **`forests`** **or** raw strings match `forest` / `forests` (same normalizer). |
| **Urban / rubble detection** | A cell qualifies if **`isUrban === true` and not rubble** *or* **`isRubble === true`** on the merged res4 row model used by `getRes4TerrainOverridesForRendererFromGame` (`src/main/game-db/controlInfrastructure.ts`). **Do not** rely on `res4TerrainKindByH3` alone for rubble: infrastructure strikes flip **`isRubble`** while terrain kind may remain a base pipeline kind. **Preferred approach:** extend `TacticalBattleSnapshot` refresh (`refreshTacticalBattleRes4TerrainFromGameDb` / `computeTacticalBattleSnapshot`) with explicit **`res4IsUrbanByH3`** / **`res4IsRubbleByH3`** (or a single compact map) **frozen** with the snapshot, mirroring how **`res4IsSeaportByH3`** is optional but authoritative. |
| **“Ranged range reduced to one hex”** | Means **`maxRange = 1`** in the **same** `isWithinGridRangeSafe` sense as today (H3 grid steps). Applies to **ordering / validation** of **direct** ranged fire for **armor and infantry** from listed cells. **Return fire:** no extra range or LOS terrain checks in resolution—once orders are accepted, **return fire proceeds** per existing combat resolution (**if attack allowed, return fire allowed**). |
| **Urban/rubble “movement budget one hex”** | Means **`movementPointBudget = 1`** for **`planTacticalRes4MarchWithSessionCache`** / `tacticalMarchFirstStopAlongPath` for that march leg—i.e. **one unit of §12.4 movement points**, not “exactly one res4 adjacency step” unless costs make them equal. |
| **Air units** | **Excluded** from movement items (2–4); air does not use tactical march (`air_no_march`). **Included** in **mountain ranged block** (item 1) for any code path where air uses **tactical ranged** validation—confirm call sites (`validateGroupAirStrikeTarget` vs ranged; item 1 names **ranged**, not strikes). If air has **no** tactical ranged weapon in UI, still implement the **pure predicate** so future features stay consistent. |

**Residual question (only if combat §12.x contradicts):** whether official LOS uses a different cell trace than `gridPathCells` for same-resolution H3 pairs; if yes, swap the implementation helper but keep the **mountain-on-LOS ⇒ reject** and **Phase 4 filter** contracts.

## Completeness vs stated needs

| Need | Where addressed |
|------|-----------------|
| Air / armor / naval ranged blocked when mountain on LOS | Goals §1; table LOS row; Phase 1 helper + Phase 3 validation + Phase 4 filter |
| Armor / infantry in forest, urban, rubble → ranged max 1 | Goals §2; Phase 1 + 3 + previews |
| Armor in forest → movement budget = infantry | Goals §3; Phase 1 + 2 |
| Armor / infantry in urban or rubble → movement budget 1 MP | Goals §4; Phase 0 urban/rubble maps + Phase 1 + 2 |
| Independent / cumulative verification | Per-phase stop gates and verification bullets |
| Reliability for junior agents | Ordered phases, single helpers, code map, risk register, checklist |
| User rules (logging, tests scope, comments, file size, no doc spam) | Design principles + Phase 5; keep new markdown limited to this file unless combat spec must be updated |

## Code map (read before editing)

| Concern | Primary locations |
|--------|-------------------|
| Movement point budgets | `src/shared/tacticalRanges.ts` → `MOVEMENT_RANGE_BY_UNIT_TYPE` |
| Human/opponent march reachability | `src/main/tacticalBattle/tacticalSnapshotGuards.ts` → `tacticalComputeHumanMovementOrderOutcome`, `tacticalComputeMovementOrderOutcome` |
| Ready-beat march truncation (human) | `src/main/gameActions.ts` → `tacticalMarchFirstStopAlongPath` with `maxEdges` from `MOVEMENT_RANGE_BY_UNIT_TYPE` (duplicate of guards—**must stay in sync** after refactor) |
| Terrain-aware pathfinding type | `src/shared/tacticalTerrainMovement.ts` → `tacticalMovementUnitTypeForPathfinding` |
| Tactical ranged validation (human) | `src/main/gameActions.ts` → `validateGroupRangedTarget` delegates tactical body to `src/main/game-actions/tacticalGroupRangedTargetValidation.ts` (`RANGED_RANGE_BY_UNIT_TYPE` + **`isWithinGridRangePure`** parity with `isWithinGridRangeSafe`) |
| Grid range helper | `src/shared/h3GridRangePure.ts` (`computeGridDistancePure`, `isWithinGridRangePure`); `src/main/game-actions/gridRange.ts` → `isWithinGridRangeSafe` (disk fallback + logging), air wrappers `isWithinAirFerryGridRange` / `isWithinAirStrikeGridRange` |
| Ranged dice resolution | `src/main/combatResolution.ts` → `runRangedPhase` (**does not** re-check range; validation must remain authoritative) |
| Snapshot terrain refresh | `src/main/tacticalBattle/computeTacticalBattleSnapshot.ts` → `refreshTacticalBattleRes4TerrainFromGameDb` |

## Design principles for the implementing agent

1. **Single source of truth:** Add something like `effectiveTacticalRangedMaxRange(battle, attackerSubUnit, baseRange)` and `effectiveTacticalMovementPointBudget(battle, subUnit, moveType, fromH3)` in **`src/shared/`** (new file e.g. `tacticalTerrainCombatModifiers.ts`) with orienting comments per project rules.
2. **Logging:** New **public** functions called from main process: **debug** on entry for mutating/validation flows, **trace** for pure getters, **error** in `catch` paths—use existing `logDebug` / `logTrace` / `logError` patterns from neighboring code.
3. **Tests:** Focus on **happy path + one failure per rule** in **pure** tests (fixtures building minimal `TacticalBattleSnapshot` + sub-units). Avoid testing IPC wrappers directly unless necessary.
4. **File size:** If a file approaches **600 lines**, split helpers per user standards.

---

## Phase 0 — Contracts and data model

**Deliverables**

- Add a short **“Tactical terrain combat modifiers”** subsection to this plan’s **Locked semantics** (copy into module docblock or `tacticalTerrainCombatModifiers.ts` top comment): the four bullets from **Goals**, plus the table defaults.
- Extend `TacticalBattleSnapshot` typing (`src/shared/tacticalBattleTypes.ts`) with optional parallel maps **`res4IsUrbanByH3`** and **`res4IsRubbleByH3`** (or one combined structure), populated wherever **`res4TerrainKindByH3`** is built or refreshed so **in-memory tactical validation** does not query SQLite ad hoc.
- Update `refreshTacticalBattleRes4TerrainFromGameDb` and initial `computeTacticalBattleSnapshot` paths to fill these maps from **`getRes4TerrainOverridesForRendererFromGame`** merged rows.

**Verification**

- Typecheck passes.
- **Unit test:** constructing a snapshot manually with a cell `{ terrainKind: 'plains', isRubble: true }` equivalent in the new maps yields **rubble = true** even when `res4TerrainKindByH3[cell] !== 'rubble'` (if that scenario exists).

**Stop gate:** No movement/range behavior change yet—only schema + refresh.

---

## Phase 1 — Pure predicates and effective caps (no gameActions wiring)

**Deliverables**

- New shared module (name suggestion: `tacticalTerrainCombatModifiers.ts`) exporting:
  - `effectiveMountainBlockedTacticalRanged(args)` — boolean: true when **LOS** (default: **`gridPathCells`**) from attacker to target includes any **mountain** res4 cell; only consult for unit types **air | armor | naval** (caller may pass unit type so the helper stays pure).
  - `tacticalRangedForestUrbanRubbleCapActive(attackerCellTerrain)` — true when attacker cell is forest-class, urban, or rubble (per Phase 0 maps + normalizer).
  - `effectiveTacticalRangedMaxRangeForAttacker(...)` — returns **`1`** when cap active **and** unit is armor/infantry; else **`RANGED_RANGE_BY_UNIT_TYPE[unitType]`**.
  - `effectiveTacticalMovementPointBudgetForMarchLeg(...)` — returns **infantry budget** for armor-in-forest; **1** for armor/infantry in urban/rubble; otherwise **`MOVEMENT_RANGE_BY_UNIT_TYPE[moveType]`** unchanged.

**Verification**

- **Isolated unit tests** for each predicate with tiny fixed H3 indexes (reuse patterns from `tacticalSpatialAdapter.test.ts` / `tacticalRes4MovementPlanner.test.ts` for valid res4 cells).
- Test: armor in plains → movement budget **unchanged**; armor in forest → **2** (current infantry); infantry in urban → **1**; naval unchanged by forest/urban rules.

**Stop gate:** No imports from `gameActions`; main process may import this module in later phases only.

---

## Phase 2 — Movement: wire budgets into all march planners

**Deliverables**

- Replace raw `MOVEMENT_RANGE_BY_UNIT_TYPE[...]` usage in:
  - `tacticalSnapshotGuards.ts` (human + opponent outcomes)
  - `gameActions.ts` duplicate `maxEdges` calculations for `tacticalMarchFirstStopAlongPath`
- Pass **`fromH3`** (unit’s current cell) into the helper from Phase 1. **Embarked land:** use the **carrier naval cell** for terrain if that is already how `tacticalMovementUnitTypeForPathfinding` resolves movement domain; if unclear, match **embarked cargo hex** to naval `h3Index` for terrain reads.

**Verification**

- Existing **`tacticalRes4MovementPlanner.test.ts`** still passes; add **one** new test file or cases: armor on forest res4 cannot reach a hex that plain armor could reach with budget 4 but infantry cannot with budget 2 (construct explicit terrain grid).
- Manual: `validateHumanTacticalMarchOrders` rejects destinations beyond new budget.

**Stop gate:** Ranged behavior still old; movement only.

---

## Phase 3 — Ranged: validation and UI parity

**Deliverables**

- **`validateGroupRangedTarget`** tactical branch: after footprint checks, compute **`effectiveRange`** from Phase 1; run **`isWithinGridRangeSafe`** with that cap; then if unit type ∈ {air, armor, naval}, reject when **`effectiveMountainBlockedTacticalRanged`** is true (clear user-facing reason string, e.g. “Line of sight blocked by mountains.”).
- **Opponent / AI validation:** locate every tactical ranged order validator (search for `RANGED_RANGE_BY_UNIT_TYPE` and tactical snapshot usage) and apply the **same** helper so human and opponent cannot diverge.
- **Legal targets preview:** update `src/main/openrouter/possibleUnitActions.ts` (and any tactical ranged hover in renderer IPC if separate) to use the **same** effective range and mountain predicate so UI matches server.

**Verification**

- New tests calling **`validateGroupRangedTarget`** with a mocked active tactical session **or** factor inner logic into a testable `assertTacticalRangedLegal(...)` used by both production and tests (preferred if session mocking is heavy).
- Regression: strategic `validateRangedAttack` behavior unchanged when tactical inactive.

**Stop gate:** **`runRangedPhase`:** do **not** add terrain-based gates to **return fire**; optional **debug** logging only if needed. Dice tables unchanged.

---

## Phase 4 — Order application hardening

**Deliverables**

- **`applyTacticalAirStrikeThenRangedPhaseOnBattle`** / composite apply paths: **filter or skip** ranged orders that fail the same checks (defense in depth). Log **debug** counts of stripped orders.
- Ensure **`projectTacticalSnapshotAfterOpponentMovementOrders`** / human support projection does not assume old ranges.

**Verification**

- Extend **`tacticalCompositeOrdersApply.test.ts`** or adjacent tests with an intentionally invalid opponent ranged order; expect **no casualty** / order ignored with stable logging contract.

---

## Phase 5 — Documentation, cross-reference, and cleanup

**Deliverables**

- Update **`src/shared/tacticalRanges.ts`** doc comments for `RANGED_RANGE_BY_UNIT_TYPE` / `MOVEMENT_RANGE_BY_UNIT_TYPE` to state: values are **baselines**; tactical terrain may **reduce** them per `tacticalTerrainCombatModifiers` (link file name).
- If `.spec` combat rules doc exists, add one paragraph referencing terrain modifiers (optional; only if already maintained).

**Verification**

- Full **`npm test`** (or project-standard test command) green.
- Grep for remaining **raw** `MOVEMENT_RANGE_BY_UNIT_TYPE[` / `RANGED_RANGE_BY_UNIT_TYPE[` in tactical paths; each should either use helpers or have a comment why not.

---

## Risk register

| Risk | Mitigation |
|------|------------|
| `gridPathCells` throws on malformed indexes | Centralize try/catch; fail closed for mountain block; log **error** with both indexes. |
| Urban/rubble only in DB flags, not in `res4TerrainKindByH3` | Phase 0 snapshot maps **required**. |
| Duplicate budget logic in `gameActions` vs guards | Phase 2 **must** deduplicate to one helper. |
| Accidentally gating return fire in resolution | **Forbidden:** validation + Phase 4 filter define legality; resolution stays unchanged for return-fire eligibility. |

---

## Checklist for the implementing agent (order matters)

1. Complete **Phase 0** and verify snapshot contains urban/rubble flags.
2. Complete **Phase 1** pure functions + tests (**no** IPC).
3. Wire **Phase 2** movement; run tactical movement tests.
4. Wire **Phase 3** ranged validation + previews; run `gameActions` / openrouter tests touching ranged.
5. **Phase 4** defense-in-depth on apply paths.
6. **Phase 5** docs + full test suite.

When a phase’s tests are green, **commit locally** only if your workflow allows; the repository owner requested **no automated git push** from agents.
