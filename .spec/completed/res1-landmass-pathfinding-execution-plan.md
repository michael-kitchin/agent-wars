# Res1 Land-Mass Pathfinding Execution Plan

## Goal
Replace the res1 (strategic world map) land-unit traversal rules with a continent/island-membership + water-fraction model derived from two USGS shapefiles. Res4 (tactical) logic and the naval/water movement domain stay unchanged.

## Confirmed design decisions
- Water source: `water_pct = 100 - landPct`, where land = union of Continents (area>0) + all BigIslands polygons, measured in an equal-area projection.
- Large-island filter: BigIslands with total area >= 1000 km2 (339 islands).
- New rules FULLY REPLACE the current res1 land passability (terrain-kind land/coastal/wetlands) and the "no two consecutive water/arctic hexes" rule.
- Every march step requires destination `water_pct(B) < 90` (90% or more water blocks the step).
- A step is allowed when the destination shares at least one **continent id or island id** with the origin (either overlap suffices) and passes the water check.
- Offshore islands with no shared continent or island id on the origin remain unreachable overland (e.g. mainland South America to Caribbean island with empty `continent_ids`).
- Naval transport, embark/debark at ports, and water-unit movement are unchanged; land units may debark at any port (including high-water hexes) via a one-step seaport debark bypass that skips land-mass edge rules.
- Land-unit single-water-hex "wading" crossings are ELIMINATED. Water is crossed only via existing naval transport/ferry mechanics.
- ALL land-movement decision points switch to the new logic for consistency.

## Movement rules (res1 land units only)
Edge predicate `canLandUnitTraverseEdge(A, B, data)` for ring-1 neighbors:
1. If `water_pct(B) >= 90`, block.
2. Otherwise allow when `continents(A)` intersects `continents(B)` **or** `islands(A)` intersects `islands(B)`.

Dual-tagged destination cells (both continent and island polygons, e.g. Baja/F9) are reachable from mainland on the same continent. Pure offshore islands with no overlapping continent id on the origin stay blocked.

Seaport debark: a one-step move from an embarked land unit at a seaport **water** hex to an adjacent **occupiable** land hex bypasses `canLandUnitTraverseEdge` (validation, pathfinding, and reachable-hex enumeration all use `allowsLandUnitStepWithOptionalSeaportDebark`, which requires `landUnitCanOccupyHex` on the destination). Embarked units on **coastal** seaport hexes follow normal land-mass rules and may multi-step march.

Node predicate `landUnitCanOccupyHex(h, data)`: hex overlaps a continent OR a qualifying island. A hex may be occupiable while still blocking overland entry when `water_pct >= 90`; port debark is the intended way onto such cells.

## Deferred / revisit
- **Narrow isthmus bridges** (e.g. Panama I8 at ~85.6% water with dual continent ids): pass at the 90% threshold; other high-water chokepoints may still block. May revisit exception rules later.

## Data model (per res1 hex)
- `water_pct`: 0-100
- `continent_ids`: number[] of `FID_Contin`
- `island_ids`: number[] of `USGS_ISID` for islands >= 1000 km2

Inputs: `F:/Data/USGSEsriWCMC_GlobalIslandsv2_Continents.shp`, `F:/Data/USGSEsriWCMC_GlobalIslandsv2_BigIslands.shp`

## Architecture
Static geography loaded once into terrain cache; shared predicates in `src/shared/landTraversalRes1.ts`; no DB schema change.

## Phases
1. ETL: `scripts/terrain_pipeline/landmass.py` -> `data/generated/terrain_res1_landmass.json`
2. Loader: `terrainLandMassLoad.ts` + cache getter
3. Predicates: `landTraversalRes1.ts` + tests
4. Pathfinding integration
5. Order validation, destinations, AI/LLM, preview
6. Cleanup, docs, full test suite
