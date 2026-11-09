# Keyless Hillshade Basemaps — Execution Plan

This document defines a phased, reliability-first implementation that removes CARTO raster tiles (which watermark “API key required” without failing HTTP) and uses one keyless Esri hillshade for every terrain style, with a CSS invert on tile panes for the Wargame style only.

**Audience:** Coding agent or developer implementing the feature end-to-end.  
**Primary objective:** Maximum reliability, clarity, and independently verifiable increments.  
**Do not** put this document’s internal section or checklist labels into product code, comments, configuration, or other version-controlled artifacts.

---

## 1. Goal, scope, and done criteria

### 1.1 Goal

1. Atlas, Wargame, and Scientific must load real geography tiles without a map API key and without CARTO watermarks.
2. Every terrain style uses **Esri World Shaded Relief** (the same keyless XYZ host Default already uses).
3. Named styles stay visually distinct on that shared hillshade via **tile-pane CSS filters** (Atlas higher-contrast muted relief, Scientific grayscale, Wargame invert). Hex overlays, units, attribution, and scale are not filtered.
4. Switching styles that share the same provider id must not remount/reload tiles.

### 1.2 Explicitly out of scope

1. Shipping, prompting for, or storing a CARTO / MapTiler / Stadia / Esri API key.
2. MapLibre, OpenFreeMap, or other vector-tile stacks.
3. Esri Canvas / Topo / Street rasters (they include place labels).
4. Recoloring Wargame hex fill, hatch, or stroke.
5. Self-hosted tiles or offline basemap bundles.
6. Raising Esri’s native max zoom (13). Tactical zoom 16 already upscales Default; all styles inherit that limit.
7. README copy updates.
8. Git commit or push.

### 1.3 Definition of done

1. Locked behaviors in Section 2 are implemented.
2. Increments A–C tests pass under `npm test` (or `npm run build:main` plus the new test files).
3. `npm run build:renderer` has been run so `static/renderer.js` matches source.
4. Manual checks in Section 3 Increment D pass.
5. New/updated non-override methods have orienting comments.
6. Touched source files stay within project size guidance (desirable 600 lines, hard 1000).
7. Product code, comments, and configuration do not mention this document’s increment labels.

---

## 2. Locked behavior contract

### 2.1 Why CARTO cannot remain in the catalog

CARTO `basemaps.cartocdn.com` still returns **HTTP 200** PNG tiles with **“API key required”** burned in. Leaflet only treats HTTP failures as `tileerror`, so the existing fallback chain never runs. Leaving CARTO in the catalog as a “fallback” would show watermarks, not geography.

### 2.2 Tiles and catalog

| Rule | Behavior |
|------|----------|
| Style tiles | `default`, `atlas`, `wargame`, and `scientific` all use `basemapId: 'esri_world_shaded_relief'`. |
| Catalog | Remove `carto_light_nolabels`, `carto_voyager_nolabels`, and `carto_dark_nolabels`. Keep Esri World Shaded Relief first, then `osm_mapnik` last. |
| OSM last | Emergency HTTP-error fallback only. OSMF policy forbids using `tile.openstreetmap.org` as the shipped default. |
| Init fallback | `initWorldLeafletMaps` default provider id is `'esri_world_shaded_relief'`, never a CARTO id. |
| Esri URL | Keep `{z}/{y}/{x}` on `server.arcgisonline.com` (not OSM `{z}/{x}/{y}`). |
| Attribution | Keep the existing Esri shaded-relief attribution string. |

### 2.3 Tile-pane filters

Hex overlay palettes for Atlas and Scientific are only a few RGB points apart from Default at low alpha. On a shared hillshade they are not readable as different styles. Each named style therefore applies a distinct CSS filter to **tile panes only**.

| Style id | Filter |
|----------|--------|
| `default` | `''` (unfiltered Esri hillshade) |
| `atlas` | `saturate(0.78) contrast(1.2) brightness(1.03)` |
| `scientific` | `grayscale(1) contrast(1.18) brightness(1.08)` |
| `wargame` | `invert(1) hue-rotate(180deg)` |
| unknown / empty | `''` |

| Rule | Behavior |
|------|----------|
| Where applied | Leaflet **tile pane** of the main map **and** the minimap. |
| Where forbidden | `#main-map` container, overlay canvas, attribution control, scale control, hex/unit drawing. |
| Legacy fallback | Do **not** set `mapEl.style.filter` to a non-empty filter. Clearing a leftover container filter to `''` is allowed. |

### 2.4 Remount skip

| Rule | Behavior |
|------|----------|
| Skip | `setMainBasemapByProviderId` does not add/remove tile layers when **both** the main map and minimap already show the requested provider id. |
| Independent fallback | Track mounted provider ids for main and mini separately. If one map HTTP-fell back (e.g. minimap on OSM while main is still Esri), the next style change remounts **both** so they resync. |
| Null current | If either map’s mounted id is `null`, remount. |
| Maps missing | If main or mini map is missing, return without throwing. |
| Filter still runs | Style change still applies the CSS filter and still requests a hex overlay redraw. |

### 2.5 Unchanged overlay styling

Wargame (and other) hex fill, hatch, and stroke values stay as they are. They were designed for a dark base; the invert provides that dark base.

### 2.6 Files

| Path | Role |
|------|------|
| `src/shared/basemapStyleLogic.ts` | Pure remount predicate and filter string for a style id. |
| `src/shared/basemapStyleLogic.test.ts` | Node tests for that logic. |
| `src/main/basemapRasterCatalog.test.ts` | Source-scan renderer catalog and presets. |
| `src/renderer/map/basemapProvider.ts` | Raster URL catalog. |
| `src/renderer/rendering/terrainVisualStyles.ts` | Per-style `basemapId`; fix stale comments that still mention CARTO ids. |
| `src/renderer/map/worldLeafletMap.ts` | Init id, remount skip, tile-pane filter on main+mini. |
| `src/renderer/map/initCore.ts` | Apply filter on init and on style change. |
| `static/renderer.js` | Regenerated via `npm run build:renderer` only. Do not hand-edit. |

Tactical view uses the same main Leaflet map; no separate tile URL. Briefing maps do not use this catalog.

`tsconfig.main.json` compiles `src/main` and `src/shared` only. Keep testable logic in `src/shared`. Renderer source-scan tests live under `src/main`.

---

## 3. Implementation increments

### Increment A — Shared logic + tests (no UI)

1. Add `src/shared/basemapStyleLogic.ts`:
   - `basemapNeedsRemount(currentId: string \| null, nextId: string): boolean` is `true` iff `currentId !== nextId`.
   - `basemapNeedsRemountForMaps(mainId, miniId, nextId)` is `true` if either map needs a remount.
   - `basemapCssFilterForStyle(styleId: string): string` returns `invert(1) hue-rotate(180deg)` iff `styleId === 'wargame'`, else `''`.
   - Export a named constant for the Wargame filter string so tests and callers share one value.
   - Orienting comments on exported functions and the constant.
2. Add `src/shared/basemapStyleLogic.test.ts` (happy path + essential failure): remount when current is `null` or different; no remount when equal; remount a map pair when only the minimap differs; Wargame filter exact; `'default'` / `'atlas'` / `'scientific'` / `''` / unknown → `''`.

**Verify:** `npm run build:main` and the new shared tests pass.

### Increment B — Catalog without CARTO

1. Rewrite `RASTER_BASEMAP_ORDER` to Esri hillshade then OSM. No `cartocdn.com` URLs.
2. `initWorldLeafletMaps` default provider id → `'esri_world_shaded_relief'`.
3. All four `TERRAIN_STYLE_PRESETS` `basemapId` values → `'esri_world_shaded_relief'`. Update object-literal orienting comments that still embed old `basemapId` text.
4. `src/main/basemapRasterCatalog.test.ts`: `basemapProvider.ts` has no `cartocdn.com`; catalog `id` list is exactly `esri_world_shaded_relief` then `osm_mapnik`; `terrainVisualStyles.ts` has four `basemapId: 'esri_world_shaded_relief'` assignments and no `carto_` provider ids in those assignments; `worldLeafletMap.ts` default init id is Esri, not CARTO.

**Verify:** New catalog test passes. App: Default still hillshade. Atlas and Scientific show the same hillshade, not CARTO watermarks (Wargame invert comes in the next increment).

### Increment C — Remount skip + Wargame/minimap filter

1. Track mounted provider ids for **main and mini** separately. `setMainBasemapByProviderId` returns immediately when `basemapNeedsRemountForMaps` is false (after the maps-exist guard).
2. Set each map’s tracked id when that map’s raster layer is actually mounted (including fallback to OSM, so a later request for Esri will remount). Exhausting the chain on a map sets that map’s id to `null`.
3. `setMainBasemapFilter` applies the filter to **both** main and mini tile panes. Never assign a non-empty filter to `#main-map`.
4. `wireInitCore`: `setMainBasemapFilter(basemapCssFilterForStyle(getActiveTerrainStyleId()))` after map init and again in `onStyleChanged` (after `setMainBasemapByProviderId`).
5. Source-scan: `setMainBasemapByProviderId` uses `basemapNeedsRemountForMaps`; `setMainBasemapFilter` touches `miniMap`; no `mapEl.style.filter = filter`.
6. `npm run build:renderer`.

**Verify:** Default → Atlas/Scientific: hex colors change, tiles do not flash-reload, hillshade unchanged. Wargame: dark hillshade, hex overlays not inverted, minimap matches, attribution not inverted. Back to Default: filter clears. Tactical battle on Wargame: invert still tile-pane only.

### Increment D — Manual regression pass

1. Cycle Default / Atlas / Wargame / Scientific.
2. Pan and zoom; minimap viewport rectangle still tracks.
3. Attribution visible and readable on the main map.
4. Overlay canvas, units, and toasts are not CSS-filtered.
5. OSM tiles are not the default; they appear only if Esri HTTP-fails.

---

## 4. Project rules the implementing agent must follow

1. **Logging:** No new main-process public APIs. Renderer/shared getters stay free of debug spam unless matching an existing renderer log pattern.
2. **Comments:** New and updated exported functions, constants, and non-overriding methods get orienting comments (why / when / how / results / exceptions).
3. **Tests:** Happy paths and essential failures only. Do not test Leaflet DOM wiring. Do not over-test boilerplate.
4. **Naming:** `src/` camelCase files; exported functions camelCase; no `Utils`/`Impl` suffixes. Frozen string values (Esri URL path, OSM URL, Leaflet option keys) stay unchanged except the intentional catalog/id edits in this plan.
5. **No plan identifiers in product code.**
6. **Never commit or push.**
7. **File size:** Split before hitting 1000 lines; `worldLeafletMap.ts` should stay well under that with these small edits.
8. **Arguments:** Stay within 6 desirable / 10 hard named parameters.

---

## 5. Recommended options (already decided)

1. One keyless Esri hillshade for every style (not Canvas/Topo, not per-style CARTO).
2. Wargame / Atlas / Scientific darkening or restyling via tile-pane CSS filters, not overlay recolor and not extra tile hosts.
3. Skip remount when **both** maps already show the requested provider id.
4. OSM remains last-resort fallback only.
