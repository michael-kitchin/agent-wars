# Terrain Naming Water Caption Strategy (res1/res4)

## Purpose

Define deterministic rules for water-body hover captions from the `water` section of hex naming JSON, complementing the geographic naming rules in [terrain-naming-caption-strategy.md](completed/terrain-naming-caption-strategy.md).

## Scope

- Applies to caption generation in `src/main/terrainNamingLoad.ts`:
  - `waterNamingLineForRes1Record`
  - `waterNamingLineForRes4Record`
- Selection gating in `src/main/terrainClassificationCache.ts` (`buildSnapshot`)
- JSON schema version `1.1.0`

## JSON `water` entry shape

Each hex record includes a `water` array (peer to `states` and `countries`). Every record has the key; empty array when no water bodies intersect.

```json
{
  "name": "North Pacific Ocean",
  "type": "ocean",
  "scalerank": 0
}
```

| Field | Source |
|-------|--------|
| `name` | `name` field from shapefile |
| `type` | `"lake"` from `ne_10m_lakes.shp`; `"ocean"` from `ne_10m_geography_marine_polys.shp` |
| `scalerank` | `scalerank` field from shapefile |

Pipeline ordering: `scalerank ASC`, then `name ASC`. Deduplication key: `(cell, name, type)`.

## Caption precedence (res1 and res4)

Functions: `namingLineForRes1Record`, `namingLineForRes4Record` in `terrainNamingLoad.ts`; wired from `buildSnapshot` in `terrainClassificationCache.ts`.

1. **Geographic first** — `preferredNamingLineForRes1Record` / `preferredNamingLineForRes4Record` (states, countries, cities per [terrain-naming-caption-strategy.md](completed/terrain-naming-caption-strategy.md)).
2. **Water fallback** — `waterNamingLineForRes1Record` / `waterNamingLineForRes4Record` when geographic naming returns `null`.

Terrain kind is not consulted. Hexes with both land-based and water naming data (e.g. Iceland in an ocean-dominated res1 cell) keep the geographic label. Pure ocean hexes with no states/countries/cities receive water captions when `water` is non-empty.

## Empty naming data

When geographic naming is `null` and `record.water` is empty, the combined functions return `null` (tooltip naming header omitted).

## Water caption (res1 and res4)

Functions: `waterNamingLineForRes1Record`, `waterNamingLineForRes4Record` (shared `formatGroupedWaterNamingLine` implementation)

1. Return `null` when `record.water` is empty.
2. Group rows by `scalerank` value.
3. Within each group, sort names alphabetically.
4. Order groups by scalerank **descending** (highest integer = least prominent first; `null` scalerank = least prominent, first group).
5. Join scalerank groups with `, ` (comma-space). Do not prefix the line with `Water:`.

Example: `Tiny Lake A, Tiny Lake B, Arctic Ocean, North Pacific Ocean`

## Display rendering

Water-only captions have no geographic heading colon, so `formatGroupedNamingLineHtml` renders the full line as plain escaped text (no bold segment).

## Validation

Essential contract tests live in:

- `scripts/naming_pipeline/tests/test_generate_hex_naming.py` (JSON shape, sort, dedupe)
- `src/main/terrainNamingLoad.test.ts` (caption selection and formatting)
