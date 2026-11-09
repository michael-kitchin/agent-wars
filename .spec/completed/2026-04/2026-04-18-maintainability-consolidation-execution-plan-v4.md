# Maintainability consolidation and reuse — execution plan (v4)

Audience: a **lower-quality** coding agent (mechanical refactors preferred; avoid cleverness).  
Goal: improve **maintainability** through **consolidation, reuse, and small extractions** with **low behavior risk** and **clear verification** after every phase.

This plan **does not** replace `.spec/file-size-decomposition-plan-v1.md` (renderer/main mega-file strategy). It **aligns** with it: prefer **thin extractions** and **typed seams** over big-bang rewrites.

---

## Non-goals (explicit)

1. No gameplay rule changes, movement costs, combat, or pathfinding semantics.
2. No changes to generated JSON schemas, pipeline outputs, or IPC channel names.
3. No dependency upgrades or adoption of `@types/leaflet` unless listed as its own optional follow-up.
4. No commits or pushes (human review stays authoritative).

---

## Baseline facts (anchor the work)

These are approximate **line counts** (including comments) observed in-repo; re-measure at Phase 0:

| Area | File | Approx lines | Why it matters |
|------|------|---------------|----------------|
| Renderer monolith | `src/renderer/renderer.ts` | ~3000+ | Hard to review safely; highest regression risk if rushed |
| Renderer shared state | `src/renderer/core/state.ts` | ~870 | Large surface area; risky to “clean up” without a seam |
| Terrain cache | `src/main/terrainClassificationCache.ts` | ~560 | Mixed responsibilities (load vs IPC serialization) |
| Main entry | `src/main/main.ts` | ~560 | IPC wiring density |

---

## Consolidation opportunities (8), prioritized

1. **Deduplicate `withOpacity` / hex→rgba helpers**  
   - Today: duplicated implementations in `src/renderer/rendering/terrainRendering.ts` and `src/renderer/rendering/res4MapInspectionOverlays.ts`.  
   - Target: one small module (e.g. `src/renderer/rendering/canvasColor.ts`) used by both.

2. **Centralize Leaflet vector polyline styling constants**  
   - Today: weights, dash pattern, and halo opacity are split between `res4TransportVectorLayer.ts` and `res4MapOverlayConstants.ts`.  
   - Target: all **vector display tuning knobs** live beside other res4 overlay constants.

3. **Reduce repeated `getMainLeafletMap() as { ... }` casts**  
   - Today: many modules re-declare overlapping “minimal map” shapes.  
   - Target: a **single exported narrow type** + optional `assertMainMapForProjection(map)` helper (start with 2–3 call sites, expand later).

4. **Split `terrainClassificationCache.ts` by responsibility**  
   - Target: separate **load/build** path from **renderer IPC serialization** (`getRes4*ForRenderer`) to shrink files and clarify ownership.

5. **Begin `renderer.ts` decomposition with one vertical slice**  
   - Target: move a **self-contained** cluster (**res4 overlay hydration** helpers near `applyRes4TerrainOverrides` / `refreshRes4TerrainOverridesForRenderer`) into `src/renderer/rendererRes4Hydration.ts` (name flexible) leaving `renderer.ts` as a thin façade.

6. **Viewport / projection helper reuse for res4 overlays**  
   - Today: parent viewport prefilter + child overlap checks are correct but easy to drift.  
   - Target: a tiny helper (e.g. `shouldConsiderRes4ChildrenForViewport(...)`) colocated with `terrainView.ts` or a `res4Viewport.ts` helper used by overlay passes.

7. **Naming drift cleanup (in-scope in this plan)**  
   - Today: symbols still say “MapInspection” while behavior is broader.  
   - Target: rename **only** when paired with a mechanical grep checklist and no behavior change.

8. **Documentation cross-links (low risk)**  
   - Link this plan + `file-size-decomposition-plan-v1.md` from `scripts/terrain_pipeline/README.md` **only** in a short “Renderer overlays” subsection (1–2 paragraphs), pointing maintainers to the correct docs.

---

## Phases (ordered for reliability)

Each phase should end with: **`npm run lint`**, **`npm run build:main`**, **`npm run build:renderer`**, and (when touched) **`npm run test`** or a **narrower** test command listed below.

### Phase 0 — Readiness + inventory (no functional change)

**Objective:** create a repeatable baseline so later diffs are obviously mechanical.

Tasks:

1. Re-run line counts for the anchor table (use your preferred script; `rg` line counts are acceptable if consistent).
2. Record a short “before” grep inventory:
   - `withOpacity` definitions under `src/renderer`
   - `getMainLeafletMap() as` occurrences under `src/renderer`
3. Read `.spec/file-size-decomposition-plan-v1.md` and note which renderer extraction it recommends next (do not start it in Phase 0).

Verification:

- A short “Phase 0 inventory” subsection appended to **this document** OR a tiny companion note in `.spec/` (your choice), listing counts + grep totals.

Exit:

- Inventory exists; no code changes required.

---

### Phase 1 — Shared canvas color helper (`withOpacity`)

**Objective:** one implementation, identical behavior.

Tasks:

1. Add `src/renderer/rendering/canvasColor.ts` exporting `withOpacityHex(color: string, alpha: number): string` (name flexible).
2. Replace local duplicates in:
   - `src/renderer/rendering/terrainRendering.ts`
   - `src/renderer/rendering/res4MapInspectionOverlays.ts`
3. Keep behavior identical: same clamping, same `#rrggbb` parsing, same fallback for non-`#` colors.

Verification:

- `npm run lint`
- `npm run build:renderer`
- Manual smoke: terrain fills + city label halos + star border still render (no color regressions).

Exit:

- Exactly one `withOpacity*` implementation remains in `src/renderer/rendering/`.

---

### Phase 2 — Vector polyline styling constants consolidation

**Objective:** one place to tune vector roads/rails appearance.

Tasks:

1. Move remaining “magic numbers” from `src/renderer/map/res4TransportVectorLayer.ts` into `src/shared/res4MapOverlayConstants.ts` (weights, dash array string, any future opacity if not already centralized).
2. Import and use those constants from `res4TransportVectorLayer.ts`.

Verification:

- `npm run lint`
- `npm run build:renderer`
- Manual smoke: roads/rails still look correct; dashed rails still present.

Exit:

- `res4TransportVectorLayer.ts` contains **no** inline polyline weight/dash literals (except unavoidable Leaflet option object structure).

---

### Phase 3 — Narrow Leaflet “main map projection” typing (incremental)

**Objective:** reduce unsafe casts without adopting full Leaflet types.

Tasks:

1. Add a small module (preferred: extend `src/renderer/map/worldLeafletMap.ts` exports **or** add `src/renderer/map/leafletMainMapProjection.ts`) exporting:
   - `MainMapProjection` interface (must include at minimum: `latLngToContainerPoint`, `getContainer`, `getBounds` + corner getters, `getZoom?`, `containerPointToLatLng` as needed by current vector code)
2. Add `getMainLeafletMapForProjection(): MainMapProjection | null` (or equivalent) that performs a **single** narrowing step.
3. Migrate **only** these files first:
   - `src/renderer/map/res4TransportVectorLayer.ts`
   - `src/renderer/rendering/res4MapInspectionOverlays.ts`

Verification:

- `npm run lint`
- `npm run build:renderer`
- Manual smoke: pan/zoom + vector layer rebuild still works.

Exit:

- The two migrated files no longer contain large inline `as { ... }` map shapes.

Follow-up (optional later phase): migrate additional `getMainLeafletMap()` call sites in small batches.

---

### Phase 4 — Split `terrainClassificationCache.ts`

**Objective:** separate “build/load snapshot” from “serialize for renderer IPC”.

Tasks:

1. Create `src/main/terrainClassificationCacheSerialization.ts` (name flexible) containing the `getRes4*ForRenderer` style functions and any small pure transforms they need.
2. Keep the cache singleton + load path in `terrainClassificationCache.ts` (or rename to `terrainClassificationCacheCore.ts` only if you update imports carefully).
3. Preserve **all** existing logging semantics (debug/trace/error) per project rules.

Verification:

- `npm run lint`
- `npm run build:main`
- `node dist/main/terrainRes4MapOverlay.test.js` (or full `npm run test` if time allows)

Exit:

- No file in the split exceeds **600 lines** if avoidable; never exceed **1000**.

---

### Phase 5 — `renderer.ts` vertical slice extraction (single slice only)

**Objective:** reduce `renderer.ts` size without changing draw order or IPC contracts.

Tasks:

1. Extract **one** cohesive cluster into a new module under `src/renderer/`: **res4 overlay hydration** functions and closely-related state writes (locked choice).
2. `renderer.ts` should import and call the extracted functions; **no behavior changes**.
3. Avoid drive-by refactors in unrelated renderer code.

Verification:

- `npm run lint`
- `npm run build:renderer`
- Manual smoke: startup still hydrates res4 overlays; switching games / refresh paths still work.

Exit:

- `renderer.ts` line count drops measurably (record before/after in Phase 0 inventory).

---

### Phase 6 — Naming alignment (“MapInspection” → accurate names)

**Objective:** reduce confusion for future developers.

Tasks:

1. Mechanical renames only (TypeScript symbols + filenames), paired with a grep checklist:
   - `drawRes4MapInspectionOverlaysPass` → clearer name (example: `drawRes4CityOverlayPass`)
   - `Res4MapInspectionOverlayDeps` → clearer name
2. Update imports and **only** comments that are now misleading.

Verification:

- `npm run lint`
- `npm run build:renderer`
- `rg "MapInspection"` should be empty **or** intentionally limited to historical `.spec/completed` docs only (do not churn completed specs unless asked).

Exit:

- Public renderer API names match behavior.

---

## Reliability guardrails (for the implementing agent)

1. Prefer **move + re-export** over “clever” abstraction.
2. Every phase should be reviewable as: “imports moved, logic unchanged.”
3. If a change touches Electron IPC boundaries, add/adjust **only** essential tests; do not add brittle implementation-detail tests.
4. If unsure, **stop** and leave a `TODO` with a short note rather than guessing gameplay semantics.

---

## Locked implementation decisions

1. **Renderer first slice:** The first `renderer.ts` extraction is locked to **res4 overlay hydration** (not draw-loop orchestration) for lower behavior risk.
2. **Shared color helper location:** `withOpacity` consolidation lives in `src/renderer/rendering/canvasColor.ts` to match existing renderer-local pattern usage.
3. **Naming alignment:** Phase 6 is in-scope and should be completed as part of this plan (not deferred backlog).

---

## Final verification (after all chosen phases)

1. `npm run lint`
2. `npm run build:main`
3. `npm run build:renderer`
4. `npm run test` (or the narrowest superset that covers touched modules)
5. Manual smoke: map pan/zoom, terrain styles, res4 vector overlays, city labels/stars.

---

## Phase 0 inventory (baseline, 2026-04-18)

Re-measured line counts (PowerShell `Measure-Object -Line`, code lines excluding blank lines may differ slightly from editor totals):

| File | Lines |
|------|------:|
| `src/renderer/renderer.ts` | 3029 |
| `src/renderer/core/state.ts` | 872 |
| `src/main/terrainClassificationCache.ts` | 560 |
| `src/main/main.ts` | 561 |

**`withOpacity` / hex→rgba helpers (`src/renderer`):** before Phase 1, **2** local definitions (`terrainRendering.ts`, `res4MapInspectionOverlays.ts`); target **1** shared module under `src/renderer/rendering/`.

**`getMainLeafletMap() as` (`src/renderer`):** **30** occurrences across **12** files (Phase 3 migrates `res4TransportVectorLayer.ts` and city overlay module first).

**Next step per `.spec/file-size-decomposition-plan-v1.md`:** P0 `renderer.ts` decomposition order begins with **types + pointer helpers**, then map wiring, resolution/canvas, stack/ready — **not** started in this plan’s Phase 0 (first executed slice here was **res4 overlay hydration** extraction per locked choice).

**Post Phase 5:** `renderer.ts` line count re-measured at **3003** after moving `applyRes4CityOverlayRows` into `rendererRes4Hydration.ts` (same counting method as above).

**Post Phase 1–3 + 6:** `withOpacity*` definitions under `src/renderer/rendering/`: **1** (`withOpacityHex` in `canvasColor.ts`). `getMainLeafletMap() as` under `src/renderer`: **29** occurrences across **12** files (includes the single cast inside `getMainLeafletMapForProjection`).

**Post Phase 4:** `src/main/terrainClassificationCache.ts` **548** lines; companion `terrainClassificationCacheSerialization.ts` added for snapshot→IPC row transforms.

**Consolidation opportunity #6 (viewport gate):** `shouldConsiderRes4ChildrenForViewport` and `shouldDrawRes4ChildHexInViewport` are exported from `src/renderer/map/terrainView.ts` and used by `drawRes4TerrainHexes`, `drawTerrainInfrastructureOverlays` (res4 branch), and `drawRes4CityOverlays`. The parent helper performs projection + overlap; the child helper is a thin name over `projectedPolygonOverlapsViewport` on an already-projected ring so call sites stay symmetric without double projection.
