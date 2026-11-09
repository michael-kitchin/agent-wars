# Res4 Global Road/Rail Overlay + Boolean Contract Execution Plan

This plan defines a reliable, phased path to:

1. Lock and formalize a long-term **boolean side-mask transport contract** (pipeline + generated data + loaders + IPC).
2. Ensure road/rail extraction runs at **planet scale** for approved Natural Earth `scalerank` values.
3. Render city labels/star markers and road/rail overlays whenever **res4 hexes are visible** (independent of `t`).
4. Ensure all in-scope generated artifacts are zipped/extracted and included in CI build paths.

Audience: lower-quality coding agent.  
Goal: maximize reliability, independent verification, and maintainability.

---

## Scope and non-goals

### In scope

1. Pipeline/data-contract updates for boolean transport masks.
2. Optional final/global display-vector artifacts (if retained) as display-only data.
3. End-to-end loading/wiring through main/preload/renderer IPC.
4. Overlay visibility policy update to `res4 visible` only.
5. City marker replacement: yellow SVG star glyph (2x current dot scale), layered under airport/seaport glyphs.
6. Removal of spike-only code/data not applicable to final capability.
7. Zip/extract + CI inclusion for all in-scope artifacts.

### Explicit non-goals

1. No pathfinding cache/graph implementation.
2. No gameplay movement/cost changes.
3. No replacing boolean masks as gameplay truth.
4. No unrelated renderer refactors.

---

## Locked clarifications from product owner

1. Overlays may be visible all the time when **res4** is visible (not res1-gated).
2. `t` is fully decoupled from city/road/rail overlay visibility.
3. Road/rail scalerank range is exactly `0..4` globally.
4. CI workflow reference is `.github/workflows/build.yml`.
5. In-scope artifact set includes boolean and final/global vector artifacts (if any), all zipped/extracted and CI-covered.

---

## Locked contract direction (target architecture)

1. Canonical gameplay-facing transport data remains boolean side masks:
   - `road_sides: boolean[5|6]`
   - `rail_sides: boolean[5|6]`
2. Side index semantics remain globally defined by one `side_ordering_contract`.
3. Any vector artifact is display-only and must not alter gameplay/pathfinding semantics.
4. Future pathfinding acceleration derives from masks later (out of scope here).

---

## Phase 0 - Contract freeze + acceptance baseline

Objective: remove ambiguity before implementation.

Tasks:

1. Freeze envelope/record schema for boolean road/rail artifacts.
2. Freeze visibility policy (`res4 visible` only; no `t` dependency).
3. Freeze city marker contract:
   - SVG-based yellow star glyph
   - approximately 2x current dot scale
   - rendered under airport/seaport glyphs.
4. Freeze artifact inclusion rule:
   - in-scope generated artifacts must be wired in:
     - `scripts/zip-generated-data.cjs`
     - `scripts/extract-generated-data.cjs`
     - `.github/workflows/build.yml`
     - any packaging-resource contract tests.

Verification:

1. Plan contains locked clarifications and no unresolved policy conflicts.
2. No open questions block coding start.

Exit:

- contract and visibility semantics are fully locked.

---

## Phase 1 - Pipeline/data contract hardening (boolean-first)

Objective: ensure boolean road/rail output is globally correct and explicit.

Tasks:

1. Audit `scripts/terrain_pipeline/road_rail_sides.py` + CLI for:
   - explicit scalerank-filter summary logging
   - explicit global-scan completion summary.
2. Ensure schema/docs describe masks as canonical gameplay substrate.
3. Add/adjust only essential pipeline tests:
   - array parity/length (5/6), booleans, deterministic ordering expectations.
4. If final/global vector artifact is retained, finalize and document its display-only schema.

Verification:

1. `python -m scripts.terrain_pipeline.road_rail_sides_cli validate`
2. `python -m scripts.terrain_pipeline.road_rail_sides_cli run --mode fast --verbose`
3. `python -m unittest scripts.terrain_pipeline.tests.test_road_rail_sides -q`
4. (if vector artifact retained) run its generator/validator and parser tests.

Exit:

- in-scope generated contracts are explicit, validated, and test-covered.

---

## Phase 2 - Planet-scale coverage assurance

Objective: prove extraction covers global roads/rails at scalerank `0..4`.

Tasks:

1. Run full generation (no feature cap) for boolean road/rail sides.
2. Run QA coverage command(s) and capture summary in `.spec`.
3. Record deterministic summary metrics (record_count, scan summary, QA counters).

Verification:

1. Full run exits 0 with non-trivial record count.
2. QA command exits 0 without critical miss regressions.
3. Artifact timestamp/hash changes after run.

Exit:

- global coverage is reproducible and documented.

---

## Phase 3 - Artifact packaging + build/CI inclusion

Objective: ensure all in-scope generated artifacts are zipped, extracted, and CI-covered.

Tasks:

1. Wire all in-scope artifact names in:
   - `scripts/zip-generated-data.cjs`
   - `scripts/extract-generated-data.cjs`.
2. Ensure `package.json` build/test paths include extraction assumptions (already via `build`/`build:main`; verify no bypass paths).
3. Verify `.github/workflows/build.yml` uses commands that include extraction (`npm run test`, `npm run build`).
4. Ensure packaging contract tests include in-scope artifacts.

Verification:

1. `npm run generated:zip`
2. `npm run generated:extract`
3. `node scripts/electron-builder-config.test.cjs`
4. Workflow review confirms build/test command path coverage.

Exit:

- all in-scope artifacts are packaged and CI path-complete.

---

## Phase 4 - Spike cleanup to final capability

Objective: remove temporary spike-only implementation and keep only final-capability code/data.

Tasks:

1. Remove spike-only scripts, runtime switches, temporary IPC paths, and temporary artifacts that are not part of final capability.
2. Keep only canonical boolean flow and approved final/global vector display flow (if retained).
3. Remove stale “spike” references from active source/docs (excluding historical `.spec/completed` docs).

Verification:

1. Targeted repo search confirms no active spike-only runtime references.
2. `npm run build:main`, `npm run build:renderer`, `npm run lint` all pass post-cleanup.

Exit:

- repository contains only final-capability paths.

---

## Phase 5 - Main/preload/IPC contract alignment (no gameplay changes)

Objective: keep transport contract stable across load boundaries.

Tasks:

1. Ensure loaders/parsers remain strict for boolean invariants.
2. Ensure IPC docs clearly distinguish gameplay-truth masks vs display-only vectors.
3. Ensure startup hydration does not mutate contract semantics.
4. Add/adjust focused parse/serialization tests only.

Verification:

1. `npm run build:main`
2. targeted main tests for road/rail parse + IPC serialization
3. `npm run lint`

Exit:

- transport contracts are stable and explicit end-to-end.

---

## Phase 6 - Renderer visibility + city star symbol

Objective: apply final always-visible-res4 policy and city glyph update.

Tasks:

1. Remove `isMapInspectionModeHeld()` dependency for city/road/rail overlay visibility.
2. Keep res4 visibility gate as sole visibility gate for these overlays.
3. Replace city dot with yellow SVG star marker:
   - ~2x old dot size
   - sharp scaling across zoom
   - rendered under airport/seaport glyphs.
4. Preserve draw order for transport lines (roads under rails).
5. Remove stale comments/docs claiming `t` is required.

Verification:

1. `npm run build:renderer`
2. `npm run lint`
3. Manual checks:
   - res4 visible + `t` released: city/star + road/rail visible
   - res4 visible + `t` held: same overlays visible
   - res4 hidden: overlays hidden
   - city star is yellow, ~2x old dot size, below airport/seaport glyphs
   - tactical/strategic parity.

Exit:

- renderer behavior matches final visibility + city-symbol requirements.

---

## Phase 7 - Final docs and handoff

Objective: leave clear future-facing documentation.

Tasks:

1. Update active `.spec` docs with:
   - boolean contract as gameplay substrate
   - optional final/global vector artifact as display-only
   - final visibility policy
   - city star contract + layering.
2. Add future-pathfinding note: derive adjacency/cache from masks later.
3. Ensure no active contradictory statements remain.

Verification:

1. Docs align with implemented behavior.
2. Targeted search finds no contradictory active guidance.

Exit:

- handoff docs are accurate and maintainable.

---

## Manual acceptance checklist

1. Strategic and tactical views: with res4 visible, city stars + road/rail overlays are visible without `t`.
2. With res4 hidden, these overlays are hidden.
3. City marker is yellow SVG star, ~2x prior dot scale, and under airport/seaport glyphs.
4. Rail renders above road where both exist.
5. Boolean road/rail contract (`road_sides`/`rail_sides`) remains canonical for gameplay.
6. All in-scope artifacts (boolean + final/global vector, if retained) are zipped and extracted successfully.
7. Build/test/CI command paths include extraction via `package.json` + `.github/workflows/build.yml`.
8. Planet-scale generation + QA succeed at scalerank `0..4`.
9. No gameplay/pathfinding behavior change introduced.

---

## Implementation notes (handoff)

Implemented in-repo (automatable phases):

- **Boolean contract:** `road_sides` / `rail_sides` remain the gameplay substrate; chord rendering is display-only inference from masks.
- **Vectors:** Final artifact name `terrain_res4_road_rail_vectors.json` (schema `0.1.0` only). Loader module `terrainRoadRailVectorsLoad.ts`; CLI `scripts/terrain_pipeline/road_rail_vectors_cli.py`.
- **Visibility:** City labels, yellow five-point star, boolean chords, and optional Leaflet vectors follow **`shouldRenderRes4Hexes()`** and the same strategic exploration parent filter as `drawRes4TerrainHexes`; **`t` does not gate** these overlays (terrain fill/outline behavior for `t` is unchanged).
- **Layering:** `drawRes4MapInspectionOverlaysPass` runs **before** `drawTerrainInfrastructureOverlays` so the city star sits under airport/seaport glyphs; rail strokes still paint above road strokes within the overlay pass.
- **Packaging:** `terrain_res4_road_rail_vectors.json` is included in `zip-generated-data`, `extract-generated-data` **required** list, `electron-builder.config.cjs` `files` + `extraResources`, and `scripts/electron-builder-config.test.cjs`.
- **Pipeline logging:** `road_rail_sides.py` logs a post-scan summary of indexed cells before merge/write (in addition to per-layer scalerank skip counts).

**Operator-only (not automated here):** full planet boolean generation, QA line-coverage runs, and recording counters in `.spec/res4-planet-scale-road-rail-qa.md`.

---

## Reliability guardrails for lower-quality agent

1. Never conflate display vectors with gameplay transport truth.
2. Do not implement caching/pathfinding mechanics in this plan.
3. Keep phase boundaries strict; verify each phase before moving on.
4. Keep changes modular (pipeline, packaging/CI, IPC, renderer, docs).
5. Keep orienting comments and logging policy compliant with project standards.
6. For new caught exceptions: log error-level context unless an intentional render-loop silent fallback is explicitly documented.
