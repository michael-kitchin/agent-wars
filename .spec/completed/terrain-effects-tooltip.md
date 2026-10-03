# Terrain Effects Tooltip (res4)

## Goal

Add an `Effects:` line to the **res4** terrain tooltip (after `Features:`) listing tactical terrain impacts on movement and ranged attacks. Omit the line when no effects apply. Res1 tooltips are unchanged.

## Integration

- Pure logic: `src/shared/terrainEffectsForTooltip.ts` → `computeTerrainEffectsLine(input)`
- Renderer: `terrainStateForPointer` supplies `parentTerrain`, `isSeaport`, `hasRoad`, `hasRail`
- HTML: `formatTerrainTooltipHtml` when `namingTarget?.resolution === 4`; `computeTerrainEffectsLineHtml` emits the same text shape as the plain formatter

## Unit labels

`Air`, `Armored`, `Infantry`, `Naval` (title case).

## Effect symbols

| Symbol | Meaning |
|--------|---------|
| `-` | Reduces but does not block |
| `x` | Blocks |
| `+` | Improves (road/rail) |

Mixed symbols for one unit/category: join in order `x`, `-`, `+` with `/`, then wrap the whole set in one pair of parentheses (e.g. `(x/-) Armored Range`). One space between the symbol prefix and the unit/category label (e.g. `(-) All Movement`, `(-) Armored Movement`). Prefix collapsed occupiable entries with `All` before the category (`All Movement`, `All Range`); prefix unit-specific entries with the unit label before the category (`Armored Movement`, `Infantry Range`). Symbol prefixes are plain text in tooltip HTML.

## Rules

### Movement (Infantry, Armored, Naval; not Air)

1. Base enter cost via `tacticalEnterHexMovementCost(unit, category)` after `normalizeDbTerrainKindToTacticalCategory(terrainKind, parentTerrain)`:
   - `Infinity` → `x` (unless exception D)
   - `2` → `-`
   - `1` → no symbol
2. Urban or rubble: Infantry and Armored always `-`; Naval omitted (exception D).
3. Road/rail (not rubble): Infantry and Armored get `+` only; prior `-`/`x` removed (exception C).
4. Exception D: omit naval `x` on land; omit infantry/armor `x` on water.

### Range (Infantry, Armored, Naval, Air)

1. Forest category, urban, or rubble: `- Range` for Infantry and Armored (anchor cap).
2. Mountains category: `x Range` for Armored and Naval (LOS property). Air strikes and ferry are not blocked by mountains.
3. Do **not** show range cap from road/rail transport alone.

### Output

- Comma-delimited after `Effects: `
- Unique entries, sorted alphabetically
- `(All)` collapse when every **occupiable** unit with a symbol for that category shares the same symbol set; render as `All Movement` / `All Range`

## Occupiable units

| Unit | Occupiable when |
|------|-----------------|
| Infantry, Armored | Not water/arctic category; always on urban/rubble |
| Naval | Seaport, or category water/coastal |
| Air | Not occupiable; mountains do not add an air range block |

## Expected output matrix

| Terrain + overlays | Effects |
|---|---|
| Plains | _(omit)_ |
| Plains + road/rail | `(+) All Movement` |
| Coastal | `(-) Armored Movement` |
| Coastal + road/rail | `(+) All Movement` |
| Forest | `(-) All Movement, (-) All Range` |
| Forest + road/rail | `(-) All Range, (+) All Movement` |
| Mountain | `(-) Infantry Movement, (x) Armored Movement, (x) Armored Range, (x) Naval Range` |
| Mountain + road/rail | `(+) All Movement, (x) Armored Range, (x) Naval Range` |
| Wetlands / Arctic | `(x) Armored Movement` |
| Wetlands / Arctic + road/rail | `(+) All Movement` |
| Desert / Water | _(omit)_ |
| Urban | `(-) All Movement, (-) All Range` |
| Urban on Mountain | `(-) All Movement, (-) Infantry Range, (x) Naval Range, (x/-) Armored Range` |
| Rubble | `(-) All Movement, (-) All Range` |
| Rubble + road/rail on plains | `(-) All Range` |
