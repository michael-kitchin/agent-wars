# Terrain Classification Strategy (res1/res4)

## Purpose

Document the current production terrain classification approach for world-scale (`res1`) and detail-scale (`res4`) hexes.

## Data Sources and Resolution Contract

- Runtime classification consumes generated metadata JSON:
  - `data/generated/terrain_res1_metadata.json`
  - `data/generated/terrain_res4_metadata.json`
- Required schema/version and record contracts are validated during load.
- Expected resolutions are fixed:
  - parent/world: `res1`
  - child/detail: `res4`

## Core Classification Logic (Shared)

Terrain kind decisions are replayed in TypeScript from metadata fields in `src/main/terrainClassifierFromMetadata.ts`.

### 1) No-data gate

- If all primary land-cover means are missing (`arctic_mean`, `forest_mean`, `desert_mean`), return fallback terrain.
- Current fallback is fixed to `water`.

### 2) Water relation gate

Water relation is derived from mask metrics:

- `all_water == true` -> `water`
- `intersects_water == false` -> continue to interior biome stack
- Otherwise:
  - `water_edges <= 2` -> `wetlands`
  - `water_edges > 2` -> `coastal`

### 3) Interior biome stack (ordered)

If water relation is interior (`no_water`), classify in this order:

1. `arctic` when `arctic_mean >= 26`
2. `forest` when `forest_mean >= 38`
3. `mountain` when either:
   - `tri_mean >= 24`, or
   - `slope_mean >= 5` and `elevation_max >= 700`
4. `desert` when `desert_mean >= 28`
5. else `plains`

These thresholds mirror `DEFAULT_CLASSIFIER_THRESHOLDS`.

## res4 Strategy (Detail Layer)

Each `res4` row is classified with the shared logic above as a **base terrain** (`childKind`).

### Urban overlay (separate from base terrain)

- Urban is not substituted as a base terrain kind.
- A child hex is marked `isUrban = true` when any `urban_by_scalerank` row has:
  - `scalerank` in `[0, 5]`, and
  - `intersects_urban == true` or `all_urban == true`

Renderer uses `isUrban` as an overlay style flag while retaining base terrain semantics.

### res4 override rows for renderer

Runtime emits sparse overrides for child hexes when either:

- `childKind != parentKind`, or
- `isUrban == true`

This keeps renderer payload compact while preserving detail where it differs from parent cells.

## res1 Strategy (World Layer)

`res1` has two computed candidates:

1. **Direct fallback classification** from its own `res1` metadata row.
2. **Dominant child-derived classification** from all `res4` children grouped by parent.

Final world terrain uses child dominance when available:

- Choose the most frequent child `childKind` under each parent.
- Tie-break by lexicographic terrain-kind order.
- If no child rows exist for a parent, use direct fallback classification.

This ensures world-map terrain reflects actual detail distribution where child coverage exists.

## Downstream Semantics

- Pipeline terrain kinds: `water`, `coastal`, `wetlands`, `plains`, `forest`, `mountain`, `desert`, `arctic`
- Passability mapping:
  - `water` -> `water`
  - `coastal` -> `coastal`
  - `wetlands` -> `wetlands`
  - all others -> `land`

## Validation and Quality Gates

- Metadata load enforces schema version, resolution, count consistency, and unique `h3_index`.
- Runtime fails fast if required metadata is missing or empty.
- Parity harness in `src/main/terrainMetadataParity.test.ts` checks TS replay against generated CSV outputs:
  - `res1` parity vs `terrain_res1_base.csv`
  - `res4` override parity vs `terrain_res4_exceptions.csv`
  - minimum agreement gate: `>= 99%`

## Operational Notes

- Classification is built once into a process-level snapshot cache (`terrainClassificationCache`) and reused.
- Cache serves:
  - `res1` terrain map for DB seeding
  - `res4` terrain/urban overrides for renderer detail mode
  - derived infrastructure and naming context used by hover and production UI flows
