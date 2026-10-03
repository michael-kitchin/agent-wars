# Milestone 2.1 — Tactical Battle Entry Execution Plan

*Execution plan for implementing milestone 2.1 tactical battle entry and tactical-session behavior, optimized for a lower-capability coding agent with reliability-first sequencing.*

---

## 1. Goal, non-goals, and success criteria

### 1.1 Goal

Implement a reliable tactical-battle entry flow that starts from contested `res1` hexes at strategic planning-phase start, presents a tactical-entry UI affordance, transitions into constrained `res4` tactical view, runs a fully interactive tactical session with temporary sub-units, and returns cleanly to strategic view while preserving strategic turn continuity.

### 1.2 Non-goals

1. Applying tactical battle outcomes back into strategic unit state (explicitly deferred).
2. Rebalancing global combat numbers, unit caps, or strategic turn flow beyond tactical entry/exit requirements.
3. Introducing fog-of-war behavior at tactical scale (must remain universal visibility).
4. Post-milestone balancing or optimization tuning beyond functional correctness and reliability.

### 1.3 Success criteria (binary)

1. At strategic planning-phase start, if human and AI parent units coexist in a `res1` hex, a tactical-entry button appears in that hex overlay.
2. Tactical-entry button is square, has magnifying-glass icon, is about 2x build-button height, horizontally centered, and vertically offset above center by the same magnitude that build button sits below center.
3. Clicking tactical-entry smoothly zooms into enclosed `res4` tactical map for that `res1` hex.
4. Tactical mode creates temporary sub-units from parent units using fixed ratios: infantry x8, armor x4, air x3, naval x4.
5. Tactical sub-units are exempt from strategic unit caps and exist only during tactical battle lifecycle.
6. Tactical view has no fog-of-war: both sides always see all `res4` hexes and all sub-units.
7. Tactical rules reuse strategic movement/stack/attack/air strike/embark/debark constraints but compute range/path/movement over `res4`.
8. During tactical mode, player cannot manually zoom back to `res1`, cannot pan outside enclosing `res1`, and map rendering excludes outside `res4` plus adjacent `res1`.
9. Tactical mode shows an Exit button at bottom-center with legend-like style using temporary assets (small `x` glyph acceptable).
10. Exit is enabled only during tactical planning phases and disabled during tactical resolution phases.
11. Tactical ends when one side has no surviving tactical sub-units or human clicks enabled Exit.
12. Tactical end restores strategic camera/zoom/pan behavior and returns to `res1` view; strategic game resumes without applying tactical-to-strategic casualties yet.
13. Tactical turns are independent of strategic turns: each tactical battle starts at tactical turn `1` and increments independently.
14. During tactical mode, strategic production, strategic standing orders, strategic parent-unit controls/orders, and strategic AI-memory displays are paused/hidden and resume unchanged on tactical end.
15. Tactical AI is fully interactive and uses tactical prompt input scoped to `res4` and sub-unit-relevant information only.
16. Tactical display name format is `N1 Type (N2)` where `N1` is human ordinal or AI roman numeral parent index and `N2` is two-digit sub-unit ordinal (`01`, `02`, ...).
17. Sub-unit placement prefers parent entry edge, then adjacent edges with deterministic fallback policy, then global in-hex placement fallback; unplaceable parent units are reported via existing invalid-action error-style toast and skipped.
18. If parent has no previous `res1` hex (first turn, spawned, unknown), spawn in a type-compatible reasonable grouping with weighted urban preference.
19. New/updated backend public methods include orienting comments and required logs (debug for mutators, trace for getters, error for caught exceptions).
20. When tactical ends (Exit or annihilation), strategic flow resumes at the current strategic turn as if the human clicked `Ready` (resume into strategic resolution, not a new strategic planning cycle).
21. Tests cover happy paths and essential failure contracts only.

---

## 2. Locked implementation rules

1. **Tactical entry trigger:** Only allow tactical entry for contested `res1` hexes containing both human and AI parent units, and only when strategic phase is planning.
2. **Single active tactical battle:** At most one tactical battle context can be active at a time.
3. **Temporary tactical entities:** Tactical sub-units are isolated entities with an explicit lifecycle state; hard-delete on tactical end.
4. **Visibility contract:** Tactical map and tactical units are globally visible to both players at all times.
5. **Boundary contract:** Tactical camera and rendering are clipped to enclosing `res1` child-hex footprint.
6. **Rules parity contract:** Tactical movement/combat/embark/debark restrictions must delegate to shared strategic validators where possible, with scale adapter (`res4` distances/pathing).
7. **Exit contract:** Tactical exit is human-controlled, enabled only during tactical planning phase, and never mutates strategic force outcomes in this milestone.
8. **Placement determinism:** Placement priority order is deterministic given input state and RNG seed (if randomization is used for left/right edge selection).
9. **Error handling contract:** Parent units that cannot place any sub-unit produce one actionable existing error-style toast per affected parent and do not crash tactical initialization.
10. **Turn continuity contract:** Tactical turn counter is local to battle and resets to `1` on each tactical start; strategic turn index remains unchanged until tactical end.
11. **Strategic pause contract:** While tactical is active, strategic production, standing-order execution, strategic controls, strategic production UI, and strategic AI-memory display must be paused/hidden.
12. **Prompt scope contract:** Tactical AI prompt uses sub-unit and `res4` context only, omits production/control/AI-memory sections, and keeps command vocabulary aligned with parent-unit order types.
13. **Strategic resume contract:** Tactical end (Exit or annihilation) resumes strategic flow at the same strategic turn in resolution-ready state, equivalent to human `Ready`.

---

## 3. Reliability and maintainability principles

1. Keep tactical battle state in a dedicated state object (`TacticalBattleContext`) rather than scattered flags.
2. Separate phase responsibilities:
   - UI affordance + transition,
   - tactical state assembly,
   - placement engine,
   - tactical view constraints,
   - tactical end/cleanup.
3. Prefer pure helper functions for:
   - parent-to-sub-unit expansion,
   - name formatting,
   - edge-priority generation,
   - candidate-hex scoring,
   - tactical prompt projection.
4. Reuse strategic validators via adapter layer to avoid divergent combat/movement rules.
5. Log policy on new/updated backend public methods:
   - debug: tactical mutating calls (start/end, place, resolve-turn actions),
   - trace: tactical queries/getters (visibility, candidate lists, formatted labels),
   - error: all caught exceptions with battle id, parent unit id, and action context.
6. Add orienting comments to all new/updated fields and non-overriding methods.
7. Keep files under 600 preferred lines; split placement and tactical camera constraints into focused modules if needed.
8. Add explicit tactical/strategic state-boundary assertions to prevent cross-mode side effects.

---

## 4. Proposed data contracts and invariants

### 4.1 Suggested tactical context model

1. `tacticalBattleId`
2. `enclosingRes1HexId`
3. `childRes4HexIds[]`
4. `phase` (`initializing | active | ending`)
5. `subUnitsById`
6. `parentToSubUnitIds`
7. `entryEdgeByParentUnitId`
8. `cameraConstraints`
9. `startedAtTurnIndex`
10. `endReason` (`annihilation | human_exit`)
11. `tacticalTurnNumber`
12. `strategicTurnNumberSnapshot`
13. `isStrategicSystemsPaused`

### 4.2 Tactical sub-unit model

1. `subUnitId`
2. `parentUnitId`
3. `side` (`human | ai`)
4. `unitType`
5. `displayName`
6. `res4HexId`
7. `embarkedOnSubUnitId | null`
8. tactical movement/combat fields aligned to existing shared contracts.

### 4.3 Invariants

1. All tactical sub-units must be inside `childRes4HexIds`.
2. No tactical sub-unit exists outside active tactical context.
3. Tactical map renderer only consumes tactical context while tactical mode is active.
4. Strategic camera interaction handlers are disabled while tactical mode is active.
5. Exit always triggers cleanup and full strategic camera-control restoration.
6. Tactical turn number starts at `1` on battle entry and is not coupled to strategic turn number.
7. Strategic production/standing-order execution is suspended while tactical context is active.

---

## 5. Phased execution plan (ordered, independently verifiable)

### Phase A — Contract lock and tactical state skeleton

Work:

1. Add tactical mode state contracts (`TacticalBattleContext`, `TacticalSubUnit`, end reason enums, UI mode enum).
2. Add orienting comments and logging scaffolding for new tactical backend/public entrypoints.
3. Add fixtures for contested `res1`, entry-edge metadata present/missing, and type-mixed parent stacks.

**Shipped mapping (recommended option: keep IPC-stable names):** `TacticalBattleSnapshot` is the serializable tactical context (§4.1 fields map as `battleId` → tacticalBattleId, `enclosingRes1H3Index` → enclosingRes1HexId, `res4ChildH3Indexes` → childRes4HexIds, `strategicTurnNumber` / `tacticalTurnNumber` → snapshots, `subUnits` → sub-unit roster). `TacticalSubUnitSnapshot` is the tactical sub-unit row (§4.2: `h3Index` → res4HexId, `player` → side). End-of-battle reasons (`annihilation` | `human_exit`) are enforced in renderer/session flow rather than a field on the snapshot. UI mode is expressed by `S.tacticalBattleSnapshot` presence plus `S.tacticalPhasePlanning` (planning vs resolution), not a separate enum.

Verification:

- Typecheck/lint passes with no gameplay behavior change.
- Contract tests for tactical context serialization/deserialization and required fields.

Dependencies: none.

---

### Phase B — Tactical entry button and click wiring

Work:

1. Render tactical-entry button in contested `res1` hex overlays at strategic planning-phase start only.
2. Apply layout contract:
   - square button,
   - magnifying-glass icon,
   - approximately 2x build-button height,
   - centered horizontally,
   - mirrored vertical offset above center relative to build button below center.
3. Wire click action to `startTacticalBattle(enclosingRes1HexId)` command path.

Verification:

- UI tests: button visibility on contested vs non-contested hexes, and hidden outside strategic planning phase.
- Manual visual check for size and placement relative to build button.
- Click action invokes tactical-start command once per click.

Dependencies: Phase A.

---

### Phase C — Zoom transition and tactical camera constraints

Work:

1. Implement smooth zoom transition from strategic view to enclosing `res1` tactical `res4` footprint.
2. During tactical mode, enforce:
   - min/max zoom locked at tactical scale,
   - pan bounds clipped to enclosing `res1`,
   - render culling excludes outside tactical boundary.
3. Add transition back to strategic zoom on tactical end.

Verification:

- Integration test: entering tactical locks zoom/pan boundaries.
- Manual check: adjacent `res1` and external `res4` never shown during tactical.
- Integration test: ending tactical restores prior strategic camera behavior.

Dependencies: Phase B.

---

### Phase D — Tactical turn isolation and strategic pause gating

Work:

1. Initialize tactical turn counter to `1` on tactical entry and increment independently from strategic turns.
2. Freeze strategic turn progression while tactical mode is active.
3. Pause/hide strategic production controls, strategic standing-order controls, and strategic AI-memory UI while tactical mode is active.
4. Restore strategic systems and UI exactly as they were on tactical end.
5. On tactical end, resume strategic processing in resolution-ready state equivalent to human `Ready`.

Verification:

- Integration test: tactical turn begins at `1` for each tactical battle.
- Integration test: strategic turn number unchanged during tactical turns.
- UI tests: production/standing-order/AI-memory strategic sections hidden or disabled during tactical and restored on exit.
- Integration test: tactical end resumes strategic flow as `Ready` equivalent in current strategic turn.

Dependencies: Phase C.

---

### Phase E — Sub-unit synthesis and lifecycle

Work:

1. Expand parent units into tactical sub-units using fixed ratios.
2. Mark sub-units as tactical-temporary and exclude from strategic cap accounting.
3. Add deterministic tactical teardown that removes all tactical sub-units on end.
4. Ensure tactical victory condition checks annihilation (one side has zero living sub-units).

Verification:

- Unit-expansion tests for each type ratio.
- Lifecycle tests: tactical sub-units exist only within active context.
- End-condition test for annihilation-triggered tactical end.

Dependencies: Phase A, C, D.

---

### Phase F — Sub-unit naming and parent indexing

Work:

1. Implement parent ordinal naming source:
   - human parent uses existing ordinal display convention,
   - AI parent uses roman numeral convention.
2. Implement sub-unit ordinal formatter (`01`, `02`, ...).
3. Compose tactical display names as `N1 Type (N2)`.

Verification:

- Formatting unit tests for representative values and boundaries.
- UI snapshot/manual checks for examples like `23rd Infantry (11)` and `IV Fleet (02)`.

Dependencies: Phase E.

---

### Phase G — Entry-edge placement engine with robust fallback

Work:

1. Use recorded previous `res1` to derive entry edge for each parent.
2. Placement priority:
   - primary edge cells nearest entry edge,
   - adjacent edges alternating left/right with deterministic random source,
   - remaining edges by increasing angular distance,
   - global compatible fallback inside enclosing `res1`.
3. For missing previous `res1`, choose reasonable grouped spawn area with weighted preference for compatible urban `res4` cells.
4. If no legal placement exists for a parent's sub-units, skip unplaceable units and emit error toast identifying affected parent(s).

Verification:

- Placement tests for:
  - normal entry edge,
  - blocked entry edge with adjacent fallback,
  - no-edge-available global fallback,
  - missing previous `res1`,
  - no legal placement => error toast + continue.
- Determinism test with fixed seed for edge-choice ordering.

Dependencies: Phase E, F.

---

### Phase H — Tactical rules adapter (movement/combat/embark/debark parity)

Work:

1. Create tactical rules adapter that reuses strategic restrictions while switching spatial math to `res4`.
2. Confirm movement/path/range systems read `res4` graph for tactical context.
3. Enforce same stacking, ranged/melee, air strike, and naval transport constraints as strategic rules.

Verification:

- Adapter tests: tactical calls route to shared validators with `res4` context.
- Essential behavior tests:
  - naval transport capacity and embark/debark constraints,
  - no naval on land without port-equivalent tactical rule,
  - ranged/movement math uses `res4` distances.

Dependencies: Phase C, E.

---

### Phase I — Tactical mode UI shell and Exit flow

Work:

1. Add persistent Exit button at bottom-center in legend-like style while tactical mode active (temporary small `x` glyph acceptable).
2. Enable Exit only during tactical planning phase; disable during tactical resolution phase.
3. Exit click ends tactical battle immediately with `human_exit`.
4. Tactical end flow:
   - cleanup tactical entities/state,
   - zoom out to strategic `res1`,
   - restore full strategic pan/zoom/map visibility,
   - resume strategic game loop in `Ready`-equivalent resolution state for current strategic turn.
5. Ensure no tactical outcome is projected into strategic parent unit outcomes in this milestone.

Verification:

- UI test for Exit button visibility only in tactical mode and enable/disable state by tactical phase.
- Integration test for full exit lifecycle and restored controls.
- Regression test confirms no strategic casualty mutation from tactical exit.

Dependencies: Phase C, D, E.

---

### Phase J — Tactical AI prompt projection and interactive tactical orders

Work:

1. Reuse existing AI order prompt structure with coordinate precision appropriate for `res4`.
2. Build tactical prompt projection that includes only:
   - tactical sub-unit data,
   - tactical `res4` map/terrain context,
   - tactical-only actionable orders.
3. Exclude strategic production status, strategic controls, and strategic AI-memory sections from tactical prompts and tactical UI.
4. Ensure tactical orders use same command family as parent units with sub-unit identifiers.

Verification:

- Prompt contract tests ensure excluded strategic sections are absent in tactical mode.
- Parser/validator tests accept tactical sub-unit orders in same command style.
- Integration test confirms AI can complete at least one tactical planning+resolution cycle interactively.

Dependencies: Phase E, H.

---

### Phase K — No-fog tactical visibility and regression hardening

Work:

1. Force tactical renderer + visibility service to reveal all tactical hexes and units to both sides.
2. Audit event handlers to ensure no strategic fog filters leak into tactical.
3. Run milestone acceptance and regression suite.

Verification:

- Visibility tests proving full reveal for both human and AI views.
- End-to-end tactical entry/exit acceptance checklist pass.
- Lint and targeted tests clean.

Dependencies: Phases A-J.

---

## 6. Suggested test matrix (happy paths + essential failures)

1. **Happy:** Contested `res1` shows tactical-entry button; non-contested does not.
2. **Happy:** Tactical-entry button placement/size relative to build button meets layout contract.
3. **Happy:** Tactical entry triggers smooth zoom and tactical camera locks.
4. **Happy:** Tactical map shows only enclosing `res1` child `res4` cells.
5. **Happy:** Sub-unit expansion ratios are correct for all parent unit types.
6. **Happy:** Tactical display naming format is correct for human and AI.
7. **Happy:** Entry-edge placement succeeds at primary edge for normal cases.
8. **Happy:** Blocked entry edge uses adjacent-edge and then global fallback.
9. **Happy:** Missing previous `res1` uses reasonable grouped spawn with urban preference.
10. **Happy:** Tactical turn starts at `1` and increments independently while strategic turn remains unchanged.
11. **Happy:** Strategic production/standing-order/AI-memory sections are paused/hidden during tactical and restored on exit.
12. **Happy:** Exit button is visible in tactical mode, enabled only during tactical planning, and returns game to strategic mode with controls restored.
13. **Happy:** Tactical ends on annihilation.
14. **Happy:** Tactical visibility has no fog for both sides.
15. **Happy:** Tactical AI prompt omits production/control/memory and uses `res4` coordinates with sub-unit actions.
16. **Essential failure:** Parent sub-units cannot be placed anywhere -> existing invalid-action error-style toast shown, tactical init continues.
17. **Essential failure:** Tactical context creation failure is caught, logged at error, and does not deadlock UI mode.
18. **Essential failure:** Attempted pan/zoom outside tactical constraints is rejected while tactical active.

Avoid tests for pure delegation wrappers, DTO accessors/constructors, and styling internals.

---

## 7. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Strategic and tactical camera logic interfere | High | Separate camera mode state + integration tests for enter/exit restoration. |
| Tactical placement fails unpredictably on dense terrain | High | Deterministic candidate ordering + layered fallback + explicit error toasts. |
| Rule drift between strategic and tactical combat | High | Shared validator adapter and parity tests across movement/attack/embark constraints. |
| Tactical entities leak into strategic systems | High | Temporary lifecycle markers + teardown assertions + cap-accounting tests. |
| Visibility regressions from reused fog code | Medium | Tactical visibility force-reveal guard + dedicated tests. |
| Strategic systems continue running during tactical mode | High | Explicit strategic pause gate + tactical/strategic state-boundary assertions + integration tests. |
| Tactical prompt accidentally leaks strategic sections | Medium | Dedicated tactical prompt projection module + prompt contract tests. |
| Lower-quality agent introduces large/complex methods | Medium | Phase-by-phase checkpoints, method-size guardrails, and helper extraction early. |

---

## 8. Acceptance checklist

- [x] Tactical-entry button appears only for contested `res1` hexes at strategic planning-phase start.
- [x] Button style/placement contract relative to build button is implemented.
- [x] Clicking tactical-entry starts smooth zoom into enclosed `res4` grid.
- [x] Tactical mode enforces pan/zoom/render boundaries to enclosing `res1`.
- [x] Tactical turn numbering starts at `1` per tactical battle and is independent from strategic turn numbering.
- [x] Strategic turn progression is paused during tactical play and resumes at same strategic turn number after tactical end.
- [x] Tactical sub-units are generated with correct per-type multiplication ratios.
- [x] Tactical sub-units are temporary and excluded from strategic unit caps.
- [x] Tactical names follow `N1 Type (N2)` with proper human/AI conventions.
- [x] Entry-edge placement honors previous `res1` direction with fallback ordering.
- [x] Missing previous `res1` uses compatible grouped fallback with weighted urban preference.
- [x] Unplaceable parents trigger existing invalid-action error-style toast and do not block tactical start.
- [x] Tactical visibility reveals all terrain/units to both players.
- [x] Tactical movement/combat/stack/embark/debark reuse strategic restrictions with `res4` math.
- [x] Tactical AI prompt is interactive, uses tactical `res4` precision, and omits strategic production/control/memory sections.
- [x] Exit button uses temporary legend-like style, is visible in tactical mode, enabled only during tactical planning, and ends battle immediately when enabled.
- [x] Tactical end on annihilation is implemented.
- [x] Exiting tactical restores strategic camera/controls and resumes strategic play.
- [x] Tactical end (Exit or annihilation) resumes strategic flow as if human clicked `Ready` for current strategic turn.
- [x] Strategic production, strategic standing orders, and strategic AI memory display are paused/hidden during tactical mode and restored on return.
- [x] Tactical outcomes do not yet affect strategic outcomes.
- [x] Required orienting comments and logging are present in new/updated backend public methods.

### 8.1 Implementation status (engineering)

This subsection records what the current tree implements against §8 so reviewers do not have to diff the whole codebase. **Manual playtests** (smooth zoom feel, adjacent `res1` never shown) remain valuable; several items below are additionally guarded by **renderer consolidation** or **main unit** tests.

| §8 theme | Status | Notes |
| --- | --- | --- |
| Tactical entry (contested, planning-only) | Done | `tacticalEntryLayer.ts` + consolidation tests |
| Entry button layout vs build label | Done | Mirrored `2*center.y - textY`; square magnifier styling in `static/index.html` |
| Zoom / pan / render to footprint | Done | `tacticalMapView.ts`, `terrainRendering.ts` tactical branch, consolidation tests |
| Tactical vs strategic turn isolation | Done | Snapshot fields + `advanceActiveTacticalTurn`; reconciliation on strategic snapshot |
| Strategic pause / sidebar | Done | `tactical-strategic-suppress`, `openRouterUiHelpers` tactical gate |
| Sub-unit ratios, names, placement, toasts | Done | `computeTacticalBattleSnapshot.ts` + tests |
| Tactical visibility (no strategic fog overlays) | Done | Early return in `drawGameScene` tactical branch; res4 parent explored-gate skipped when tactical |
| Tactical AI prompt scope | Done | `tacticalPromptProjection.ts` + tests; `requestOrdersFlow` tactical branches |
| Exit / annihilation / Ready-equivalent end | Done | `renderer.ts` + `tacticalAnnihilation` + session IPC |
| Exit vs resolution (planning gate) | Done | `tacticalPhasePlanning` + `performTacticalAdvanceTurn` waits on background AI when Run is on |
| **Rules parity at tactical snapshot** | **Done** | **March** (`explicit_move`, **`transport_move`** naval id, **`disembark`** as land march) uses `tacticalRulesAdapter` + `tacticalMovementApply` / `tacticalPlanStateMovement` (disembark clears `embarkedOnSubUnitId`); **ranged / air / ferry / embark** validated in `requestOrdersFlow` and projected via `tacticalCompositeOrdersApply` / `tacticalOpponentOrderValidation` (tactical-only casualties). |

---

## 9. Confirmed decisions applied

1. Tactical-entry button appears at strategic planning-phase start when co-location exists.
2. Tactical AI is fully interactive and reuses prompt style with `res4` precision.
3. Tactical prompt and tactical UI hide strategic production, strategic controls, and strategic AI-memory content.
4. Missing-entry placement uses weighted (soft) urban preference.
5. Placement failures use the existing invalid-action error-style toast pattern.
6. Exit is enabled only during tactical planning and disabled during tactical resolution.
7. Exit ends tactical immediately when enabled.
8. Tactical turns are independent and start at `1`; strategic turn number is paused and resumes unchanged after tactical ends.
9. Strategic production and standing orders are paused while tactical is active.
10. Temporary assets are acceptable for buttons; small `x` glyph is acceptable for Exit.
11. Tactical naval/port restrictions mirror strategic rules at `res4` scope.
12. Adjacent-edge fallback uses seeded deterministic RNG.
13. Tactical entry is allowed immediately whenever co-location exists at strategic planning-phase start.
14. Tactical end resumes strategic flow in `Ready`-equivalent resolution state for the same strategic turn (Exit and annihilation).

---

## 10. Remaining required clarification

No remaining required clarifications.

---

*End of plan.*
