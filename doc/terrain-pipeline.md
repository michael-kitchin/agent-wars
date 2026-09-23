# Terrain pipeline (runtime)

How generated Earth hex data reaches the Electron app. **How to regenerate the files** (Python, PostGIS, EarthEnv, Natural Earth shapefiles, credentials) is documented in [`scripts/terrain_pipeline/README.md`](../scripts/terrain_pipeline/README.md). Do not copy that runbook here.

The engine under `src/` wins if this file drifts.

## What the game loads

Build/start extracts a pack into `data/generated/` (`npm run generated:extract`). Startup fails fast if required metadata is missing or invalid (including empty res-4 metadata). Packaged builds include those JSON files.

Typical runtime inputs (names may grow; the extract/assert scripts are the checklist):

- Res-1 base terrain and res-4 exceptions / kind maps
- Per-hex feature metadata (urban, airport, seaport counts and flags)
- Road/rail side masks and optional vector overlays
- Landmass connectivity used by strategic land pathfinding

Main-process classification (`terrainClassificationCache.ts` and related) turns that cache into hex kinds, infrastructure counts, and overlay records. SQLite is seeded from the cache; res-4 feature overrides (rubble after strikes, destroyed ports) live in the match DB and overlay the pack.

## Resolutions

- **Strategic map:** H3 resolution **1**.
- **Tactical battles:** H3 resolution **4** children of one contested res-1 cell.

Parent-child mapping is H3's native hierarchy (res 1 → res 4 spans three steps). Terrain kinds at res 4 can differ from the parent (coastal, forest, mountain, urban flags, rubble).

## What this is not

- Not a live GIS query at play time. Regeneration is an offline `npm run terrain:generate` (metadata CLI, then road/rail sides). High-fidelity road/rail and vector CLIs are separate npm scripts (see root `package.json`).
- Not player-facing save data. Destroyed urban/airports/seaports are match state on top of the generated baseline.

## Related

- Movement and combat vs terrain: [combat-rules-v3.md](combat-rules-v3.md) §12
- Root README “Terrain generation pipeline” section
- Python tests: `npm run terrain:test`
