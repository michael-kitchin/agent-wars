# Tactical March Planner Performance — Execution Plan

Status: Implemented (Phases 1–4, 7; Phase 3 gated tests pass; Phases 5–6 deferred)
Author: performance review of `debug.log` (session 2026-06-02T21:53–21:59Z, 3,229 lines)
Scope: Reduce CPU time in tactical res4 march planning and the tactical AI-briefing
options filter, which together dominate perceived tactical-battle slowness. No
gameplay-rule or output changes are intended.

---

## 1. Did the previously applied optimizations work?

Measured from the session log:

| Optimization | Evidence in log | Verdict |
| --- | --- | --- |
| Per-turn parity-check dedup | 11 resets, **0** `differs from DB getHexController` reads | Working; no DB-read spam |
| `res4RendererOverrideCache` | Wrapper invoked each refresh; rebuild only on DB change | Working |
| `gridDistance` / `gridDisk` memoization | No repeated fallback-disk rebuild storms in strategic flow | Working |
| Phase 7 shared `latLngByH3` / `IndexedState` | `reusedLatLngByH3:true`, `reusedIndexedState:true` on briefing | Working |

**Conclusion:** the earlier (strategic-leaning) optimizations are effective. The
remaining slowness is concentrated in tactical battle code that the earlier plan did
not target.

---

## 2. Strategic vs. tactical: where time actually goes

This plan deliberately checked **both** games before concluding.

### Strategic game — healthy, no work proposed

- Strategic route planning (`tool1Pathfinding executePlanRouteWithSession`):
  **187 routes measured, average 5 ms, max 42 ms, zero over 100 ms.**
- Pathfinding session: **77 reuses, 0 fresh rebuilds** in-session — the strategic
  session/graph reuse is doing its job.
- The large wall-clock gaps in the log on the strategic side
  (`executeStandingOrderActionForPlayer` ~71 s, `previewBuild: strategic outcome`
  ~9.6 s, etc.) are **human think-time, LLM network latency, or renderer playback
  animation**, not main-process compute. Verified by reading the surrounding log
  lines (the operations themselves complete in single-digit ms).

No strategic phase is included because there is no measured strategic compute
bottleneck. (See §6 Question 1 if a specific strategic concern exists.)

### Tactical game — the real bottleneck

The planner `planTacticalRes4March` (stateful `(hex, prevHex)` Dijkstra over the res4
footprint; `src/shared/tacticalRes4MovementPlanner.ts` →
`planInfantryArmorLandContinuityMarch` in `src/shared/tacticalRes4LandMarchContinuity.ts`)
is invoked for march validation, beat application, AI order projection, and hover
preview. The cache wrapper is
`planTacticalRes4MarchWithSessionCache` (`src/main/tacticalBattle/tacticalMovementPlanningCache.ts`).

Measured tactical costs in the session:

- `tacticalMarchPlan ok` fired **140 times**. Consecutive plans split into
  **~90 "warm" (<60 ms)** and **~34 "cold" (≥60 ms, typically ~250–315 ms)**.
- Single interactive validations (`validateHumanMarchOrdersWhenTacticalActive`):
  **~280–355 ms each** (10 sampled) — every march-order click lags ~1/3 s.
- Tactical AI-briefing options filter
  (`collectAggregatedPossibleActionRows … thisTurnOptionsFilterTotal`):
  **~120–167 ms each**, on every AI consultation during a battle.
- Tactical battle init (res4 registry build, ASCII projection): **~3–25 ms** — fine,
  not targeted.

### Verified root causes (from code reading, not just timing)

1. **The Dijkstra itself is expensive (~250 ms cold).** `res4NeighborsInFootprint`
   calls H3 `gridDisk(h, 1)` on **every** state pop. With `(hex, prevHex)` state
   expansion over a ~343-cell res1 footprint that is thousands of native H3 calls per
   plan, recomputed from scratch each plan, even though footprint adjacency is static
   for the whole battle. This is the dominant cold-plan cost.

2. **`tacticalTerrainLayerSignature` is recomputed on every plan call — including
   cache hits.** `planTacticalRes4MarchWithSessionCache` builds its `envKey` (which
   includes a full sort of every seaport/urban/rubble/road/rail entry) on every call.
   This is the most likely explanation for warm cache *hits* still costing ~16–23 ms
   (a hit does only: build `envKey` → compare → `Map.get`). Across 140 calls this is
   ~2 s of pure signature work.

3. **The cache identity conflates terrain with unit placement, though neither the
   terrain resolver nor plan results depend on placement.** The `envKey` includes
   `tacticalSubUnitPlacementSignature`. Verified facts:
   - `buildTacticalTerrainKindResolverFromSnapshot` reads only terrain layers.
   - `planInfantryArmorLandContinuityMarch` and the naval branch read only terrain,
     the footprint set, and `from`/`to` — there is **no occupancy/stacking check**.
   Because `projectTacticalSnapshotAfter*MovementOrders` passes a **constant** `battle`
   object through its internal order loop, the resolver is **not** rebuilt per applied
   unit; it is rebuilt and the memo cleared at **projection-phase boundaries**
   (human → opponent → ferry → air-strike), where `battle.subUnits` changes. This is
   wasted work (placement is irrelevant to results) but is a secondary cost behind
   causes 1 and 2.

4. **Secondary: tactical AI-briefing options filter (~140 ms).** The
   `forThisTurnOptionsTable` path in `collectAggregatedPossibleActionRows`
   (`src/main/openrouter/possibleUnitActions.ts`) evaluates per-unit candidate hexes in
   tactical mode and benefits from the same planner/range speedups.

---

## 3. Goals and non-goals

Goals
- Cut interactive march-validation latency from ~300 ms to tens of ms.
- Cut warm/repeat plan cost (signature recompute) to near-zero.
- Remove placement-driven cache invalidation so a full beat stays bounded.
- Preserve **identical** plan results (paths, costs, first-stop truncation, failure
  reasons) for all unit types and terrain/transport cases.

Non-goals
- No change to §12.4 movement rules, transport continuity, or naval navigability.
- No change to log-message semantics beyond added debug/trace per house rules.
- No strategic-pathfinding changes (verified healthy).
- Renderer-side hover preview (`tacticalMarchHoverPreview.ts`) is not refactored here,
  but it shares the planner and will benefit from Phases 1–2 automatically
  (see §6 Question 3).

---

## 4. Phased plan (ordered by measured impact × safety)

Each phase is independently shippable and independently verifiable. Every
behavior-preserving phase is guarded by an equality test against the current
implementation. Phases that change cache semantics are gated behind invariance tests
and are dropped (not forced) if a gate fails.

### Phase 1 — Precompute footprint adjacency once per footprint (safe; largest win)

Targets cause 1 (the ~250 ms cold Dijkstra).

Change:
- Build `Map<string, string[]>` of res4 ring-1 neighbors restricted to `res4Set`
  **once** per footprint and cache it next to the terrain resolver in
  `tacticalMovementPlanningCache.ts`.
- Thread an optional neighbor-lookup into `planTacticalRes4March`,
  `planInfantryArmorLandContinuityMarch`, the naval branch, and
  `landTransportPlainsEnterAllowed`'s `footprintNeighborsOf`, so the search reads the
  precomputed adjacency instead of calling `res4NeighborsInFootprint` (which calls
  `gridDisk`) per state.
- Keep `res4NeighborsInFootprint` as the fallback when no precomputed map is supplied
  (preserves shared-module/test callers and exact behavior).

Verification:
- Unit test: precomputed adjacency equals `res4NeighborsInFootprint` for every cell in
  a sample footprint (including pentagon-adjacent cells).
- Existing planner test suite passes unchanged.
- Re-run an equivalent beat; cold-plan times drop substantially in `debug.log`.

File-size note: `tacticalRes4MovementPlanner.ts` /
`tacticalRes4LandMarchContinuity.ts` are already large; keep the adjacency builder in
`tacticalRes4TransportLink.ts` or a small new module to stay under the 600-line target.

### Phase 2 — Make terrain identity cheap (safe; helps every call incl. hits)

Targets cause 2 (per-call `tacticalTerrainLayerSignature` recompute, ~20 ms × 140).

Change:
- Stop recomputing the full signature on every call. Preferred: memoize the signature
  with a `WeakMap` keyed on the terrain-layer object references
  (`res4TerrainKindByH3`, `res4IsRubbleByH3`, `res4IsUrbanByH3`, `res4IsSeaportByH3`,
  road/rail maps). **Prerequisite check:** confirm the beat-application snapshot clones
  **share** those layer object references (read the clone path; add a test). If they
  do, identity comparison is O(1).
- Fallback if clones copy terrain layers: cache the computed signature alongside the
  resolver and recompute only when `battleId|turn` changes plus a cheap terrain-version
  counter bumped by terrain-mutating events (air strike / rubble creation).

Verification:
- Test-only signature-computation counter does not increment across repeated plans
  within one unchanged-terrain beat.
- Warm-hit plan latency in `debug.log` drops from ~16–23 ms toward ~0.

### Phase 3 — Drop unit placement from the cache identity (gated by invariance tests)

Targets cause 3 (placement-driven rebuilds + memo clears at phase boundaries).

Change:
- Remove `tacticalSubUnitPlacementSignature` from `envKey`, so terrain resolver,
  precomputed adjacency (Phase 1), and the `(from,to,type,budget)` memo persist for the
  whole beat as long as **terrain** is unchanged.

Prerequisite correctness proof (must pass before merging):
- Add tests asserting plan output is invariant to sub-unit placement for: land
  infantry/armor across plains/road/rail/rubble/urban, armor-over-mountain-via-road,
  naval across coastal/seaport, and a blocking-goal case.
- If any case proves placement-dependent, **do not** drop placement from the key.
  Fall back to the strictly-safe split: cache the terrain resolver + adjacency by
  `(battleId, turn, terrain-identity)` independently of the plan memo (the resolver and
  adjacency are placement-independent regardless), and keep the plan memo keyed as
  today. This still removes the resolver/adjacency rebuilds at phase boundaries.

Verification:
- Re-targeting the same unit shows memo hits across projection phases; no terrain
  rebuild logged mid-beat unless terrain changed.

### Phase 4 — Tactical AI-briefing options filter (safe; secondary win)

Targets cause 4 (~140 ms per AI consultation).

Change:
- Profile `collectAggregatedPossibleActionRows` `forThisTurnOptionsTable` in tactical
  mode; confirm it benefits from Phases 1–2 (shared adjacency / cheap terrain identity)
  and eliminate any remaining redundant per-unit range recomputation, reusing the
  per-request `indexedState` already plumbed in Phase 7 of the prior plan.

Verification:
- `thisTurnOptionsFilterTotal` time drops in `debug.log`; option-table output identical
  (compare rendered markdown for a fixed snapshot).

### Phase 5 — Single-source search reuse (optional; higher risk)

N destination/budget queries from one origin each run a full Dijkstra, though one
search already yields distance to every footprint cell. Cache `distLand`/`parentLand`
per `(terrain-identity, fromH3, unitType)` and derive all `toH3` + budgets from it.

Correctness caveat (must handle): the goal cell gets special blocking-terrain handling
(`landTransportPlainsEnterAllowed` has a `toH3 === marchGoalH3` short-circuit;
`blockedHexLandTransitAllowsRelaxation` treats start/goal specially). A single-source
result is valid only for **non-blocking** goal cells; blocking-without-transport goals
must fall back to a targeted search. Defer until Phases 1–3 are measured — may be
unnecessary.

### Phase 6 — Per-cell base-cost memoization within a search (optional; low priority)

Cache the placement-independent, non-transport base enter cost per cell during a single
search to cut repeated `effectiveKindForRes4Hex` / `normalizeDbTerrainKindToTacticalCategory`
calls. Pursue only if profiling after Phase 1 still shows enter-cost evaluation hot.

### Phase 7 — Verification & instrumentation

- Add debug-level timing around `planTacticalRes4MarchWithSessionCache` misses and the
  options filter (guarded per house logging rules) for direct before/after comparison.
- Capture a fresh `debug.log` of an equivalent tactical beat and record new per-plan,
  per-beat, and options-filter timings in a short follow-up note in `.spec`.

---

## 5. Risk and rollback

- Phases 1, 2, 4 are behavior-preserving caching/precomputation changes guarded by
  equality tests; low risk.
- Phase 3 carries correctness risk and is gated behind placement-invariance tests with
  a strictly-safe fallback that still captures most of its benefit.
- Phase 5 carries correctness risk (blocking-goal special-casing) and is gated/optional.
- Each phase is an independent commit; rollback is reverting that phase only.
- Per house rule: changes will not be committed or pushed; the developer reviews each.

## 6. Resolved scope decisions

1. **Strategic work is descoped.** Measurements show the strategic game is healthy
   (avg 5 ms routes, session reused 77×, 0 rebuilds). No strategic phase will be done
   unless a specific regression is later identified.
2. **All phases included, gated.** Phases 3 and 5 (cache-semantics changes) are
   included but gated behind placement-invariance / blocking-goal tests, with the
   strictly-safe fallback applied automatically if any gate fails.
3. **Hover preview benefits implicitly.** The renderer hover path shares the planner
   and will benefit from Phases 1–2; it will not be separately instrumented or
   refactored in this plan.
4. **Target:** interactive march validation < ~50 ms and no single-beat tactical
   compute stall > ~0.5 s (revisit after Phase 1–2 measurements).

## 7. Expected outcome

- Interactive march validation: ~300 ms → tens of ms (Phases 1 + 2).
- Warm/repeat plans: ~20 ms → near-0 (Phase 2).
- Beat application: bounded to one terrain build + cheap searches (Phases 1–3).
- Tactical AI-briefing options filter: meaningfully reduced (Phase 4).
- No change to any plan path, cost, first-stop, or failure reason; strategic game
  untouched.
