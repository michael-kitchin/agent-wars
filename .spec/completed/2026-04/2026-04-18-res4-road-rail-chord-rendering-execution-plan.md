# Res4 Road/Rail Chord Rendering Execution Plan

This plan defines an incremental upgrade from center-to-edge spokes to edge-to-edge chords for res4 road/rail inspection overlays, without changing game logic or IPC data contracts.

Audience: lower-quality coding agent.  
Goal: maximize reliability, readability, and phase-by-phase verification.

---

## Scope and intent

Current rendering draws each active side mask as a center-to-midpoint spoke. This is easy to render but diverges from source geometry (QGIS look), especially around curves and junctions.

Target behavior for this increment:

1. Keep existing road/rail JSON schema and loader (`road_sides` / `rail_sides` boolean arrays).
2. Keep existing visibility gating:
   - res4 visible
   - map inspection key held (`t`)
3. Replace per-hex spoke rendering with deterministic edge-to-edge chord rendering inferred from active side masks.
4. Preserve road/rail styling and rail-over-road draw order.
5. Keep city dot/label overlays unchanged except for ordering compatibility.

Non-goals (for this iteration):

- Do not introduce polyline geometry payloads in JSON.
- Do not alter gameplay state, fog-of-war logic, or tactical/strategic rules.
- Do not refactor unrelated renderer systems.

---

## Existing integration anchors

1. Overlay renderer: `src/renderer/rendering/res4MapInspectionOverlays.ts`
2. Visual constants: `src/shared/res4MapOverlayConstants.ts`
3. Draw call pass location: `drawRes4MapInspectionOverlaysPass` in `src/renderer/renderer.ts`
4. Res4 and map-inspection gates:
   - `shouldRenderRes4Hexes()` in `src/renderer/map/terrainView.ts`
   - `isMapInspectionModeHeld()` in `src/renderer/renderer.ts`
5. Data shape:
   - renderer cache `S.res4RoadRailSidesByH3`
   - IPC row type `Res4RoadRailOverlayRow`

---

## Phase 0 - Contract freeze and deterministic pairing policy

Objective: eliminate ambiguity before coding.

Tasks:

1. Freeze pairing policy from side mask to chords:
   - collect active side indices in canonical order
   - pair farthest across the ring with deterministic logic
2. Freeze odd-count fallback:
   - if active side count is odd and >= 3, use one short spur for the last unpaired side
   - spur should be much shorter than legacy center-to-edge spoke (to reduce starburst look)
3. Freeze tiny-count behavior:
   - 0 active sides: draw nothing
   - 1 active side: draw one short spur
   - 2 active sides: draw one direct chord
4. Freeze that roads and rails are paired independently (no shared-pair suppression).

Verification:

- policy table added to this plan and echoed as comments in code.

Exit:

- no unresolved pairing behavior questions.

### Locked pairing policy for implementation

- `active = [indices where mask[i] === true]` in canonical side order.
- While `active.length >= 2`:
  - take first remaining side `a`
  - pair with remaining side `b` maximizing cyclic distance from `a` (tie-break by lower index)
  - remove `a` and `b`
- If one side remains, draw spur from that edge midpoint toward hex centroid, length factor `0.35`.

This provides straight cross-hex continuity when two opposite sides are active and reduces radial clutter for branched cells.

---

## Phase 1 - Extract geometry helpers (pure, testable)

Objective: isolate chord construction from canvas drawing.

Tasks:

1. In `res4MapInspectionOverlays.ts`, add pure helpers:
   - `activeSideIndices(mask: boolean[]): number[]`
   - `cyclicDistance(a: number, b: number, n: number): number`
   - `pairActiveSides(indices: number[], n: number): Array<[number, number]>` and optional leftover index
   - `buildTransportSegmentsForMask(...)` returning screen-space segments
2. Keep helpers side-effect free and independent of canvas.
3. Add orienting comments for every new helper method and field.

Verification:

- add focused unit tests for pairing behavior in a small new test file:
  - `0`, `1`, `2`, `3`, `4`, `5`, `6` active-side patterns
  - deterministic output order and tie-break behavior

Exit:

- segment generation can be validated without visual QA.

---

## Phase 2 - Renderer integration (roads first, rails second)

Objective: switch from spoke drawing to chord drawing while preserving draw pass and gating.

Tasks:

1. Replace spoke segment generation in `drawRes4MapInspectionOverlays` with helper output:
   - road pass: draw all road segments (outline + center)
   - rail pass: draw all rail segments (halo + center + ties)
2. Preserve existing rail screen offset constants and apply offset to both endpoints of each rail segment.
3. Keep full-pass ordering:
   - all roads globally
   - all rails globally (over roads)
   - city dots
   - city labels
4. Keep `ctx.save()/restore()` safety and try/finally protection.

Verification:

- `npm run build:renderer` succeeds.
- lints clean for modified renderer files.
- manual visual sanity in one known dense region:
  - no starburst from every active side
  - rails still visible above roads

Exit:

- chord renderer active with no runtime regressions.

---

## Phase 3 - Rail ties and line continuity tuning

Objective: ensure ties remain visually coherent on chord segments and not over-dense.

Tasks:

1. Keep tie count constant (3) for normal segments.
2. For short spur segments, reduce ties to 1 to avoid clutter (deterministic midpoint tie).
3. Ensure tie orientation remains perpendicular to rail segment direction.
4. Verify ties remain legible across zoom scale multiplier.

Verification:

- manual check at two zoom levels with heavy rail presence.
- no tie rendering errors on near-zero-length segments.

Exit:

- ties match chord geometry cleanly.

---

## Phase 4 - Regression guardrails and docs update

Objective: lock behavior and keep future maintenance clear.

Tasks:

1. Update/append section in:
   - `.spec/res4-city-road-rail-display-execution-plan.md`
   describing chord inference policy and odd-side spur fallback.
2. Add explicit comments in renderer code that this is still mask-inferred geometry (not true clipped polylines).
3. Add one concise troubleshooting note in code comment or spec:
   - if visual mismatch remains, next step is geometry payload export (outside this plan).

Verification:

- docs updated and aligned with code.
- no stale comments about center-to-side spokes.

Exit:

- handoff documentation accurate and future-proof enough.

---

## Manual acceptance checklist

1. Strategic view: with res4 + `t` held, road/rail corridors in Lyon/Geneva area look less radial and closer to QGIS continuity.
2. Tactical view: with res4 + `t` held, road/rail corridors show the same chord behavior (no spoke/starburst regression).
3. Strategic + tactical: with `t` released, transport overlays disappear.
4. Strategic + tactical: with res4 hidden, transport overlays disappear.
5. Rail remains visible over road where both exist.
6. City labels/dots still render with same style and no obvious regressions.
7. Performance remains acceptable while panning.

---

## Reliability and readability requirements for the coding agent

1. Keep methods small and named for intent; avoid embedding pairing logic inline in draw loops.
2. Add orienting comments for all new fields/methods.
3. Add debug-level logs only where method invocations or notable branch decisions are useful; keep draw-loop logs minimal to avoid noise.
4. Prefer typed intermediate structures over ad-hoc tuples where clarity improves.
5. Do not change IPC schema or generated data format in this increment.
6. Keep source files within project size guidance (target < 600 lines; hard limit < 1000) by extracting helpers when needed.
7. Keep function signatures small (target <= 6 args; hard limit <= 10) by introducing parameter objects where appropriate.

---

## User-rule compliance notes (must-follow)

1. If implementation touches main-process/public backend method invocations, add debug-level logs for those invocations.
2. Any caught exception paths introduced by this change must emit error-level logs with troubleshooting context.
3. Getter-style methods added/updated in backend code must emit trace-level logs.
4. For this renderer-focused increment, avoid adding broad per-frame logs in hot draw loops; if temporary diagnostics are needed, remove them before completion.

---

## Open questions to resolve before coding (required)

Resolved by product owner:

1. Odd active-side fallback spur length factor: `0.35` (approved).
2. Pairing tie-break for equal cyclic distance: lower side index wins (approved).
3. Three active sides: one main chord + one short spur (approved), not three-way star.
4. Visual acceptance scope: both strategic and tactical res4 views (approved).

---

## Implementation status (repo)

Phases 0–3 are implemented in code: pairing + spur factor live in `src/shared/res4TransportChordGeometry.ts` and constants in `src/shared/res4MapOverlayConstants.ts`; `src/renderer/rendering/res4MapInspectionOverlays.ts` draws chords (roads then rails) with rail tie heuristics. Phase 4 doc hook: `.spec/res4-city-road-rail-display-execution-plan.md` (supplement). Unit coverage: `src/main/res4TransportChordGeometry.test.ts` (run via `npm test` after `build:main`). Phase 7 / manual checklist items in this document remain operator-verified.
