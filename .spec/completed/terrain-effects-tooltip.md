# Terrain Effects Tooltip (res4)

## Goal

Add an `Effects:` line to the **res4** terrain tooltip (after `Features:`) listing tactical terrain impacts on movement and ranged attacks. Omit the line when no effects apply. Res1 tooltips are unchanged.

## Integration

- Pure logic: `src/shared/terrainEffectsForTooltip.ts` → `computeTerrainEffectsLine(input)`
- Renderer: `terrainStateForPointer` supplies `parentTerrain`, `isSeaport`, `hasRoad`, `hasRail`
- HTML: `formatTerrainTooltipHtml` when `namingTarget?.resolution === 4`; `computeTerrainEffectsLineHtml` emits styled symbol spans directly

## Unit labels

`Air`, `Armored`, `Infantry`, `Naval` (title case).

## Effect symbols

| Symbol | Meaning |
|--------|---------|
| `-` | Reduces but does not block |
| `x` | Blocks |
| `+` | Improves (road/rail) |

Mixed symbols for one unit/category: join in order `x`, `-`, `+` with `/` (e.g. `x/- Range (Armored)`). One space between the symbol prefix and the category label (e.g. `- Movement (All)`). In tooltip HTML, each symbol character is wrapped in `<strong class="terrain-effect-symbol">`; category and unit labels are not emphasized.

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
2. Mountains category: `x Range` for Air, Armored, Naval (LOS property).
3. Do **not** show range cap from road/rail transport alone.

### Output

- Comma-delimited after `Effects: `
- Unique entries, sorted alphabetically
- `(All)` when every **occupiable** unit with a symbol for that category shares the same symbol set

## Occupiable units

| Unit | Occupiable when |
|------|-----------------|
| Infantry, Armored | Not water/arctic category; always on urban/rubble |
| Naval | Seaport, or category water/coastal |
| Air | Not occupiable; still receives mountain `x Range` |

## Expected output matrix

| Terrain + overlays | Effects |
|---|---|
| Plains | _(omit)_ |
| Plains + road/rail | `+ Movement (All)` |
| Coastal | `- Movement (Armored)` |
| Coastal + road/rail | `+ Movement (All)` |
| Forest | `- Movement (All), - Range (All)` |
| Forest + road/rail | `- Range (All), + Movement (All)` |
| Mountain | `- Movement (Infantry), x Movement (Armored), x Range (Air), x Range (Armored), x Range (Naval)` |
| Mountain + road/rail | `+ Movement (All), x Range (Air), x Range (Armored), x Range (Naval)` |
| Wetlands / Arctic | `x Movement (Armored)` |
| Wetlands / Arctic + road/rail | `+ Movement (All)` |
| Desert / Water | _(omit)_ |
| Urban | `- Movement (All), - Range (All)` |
| Urban on Mountain | `- Movement (All), - Range (Infantry), x Range (Air), x Range (Naval), x/- Range (Armored)` |
| Rubble (+ road masks) | `- Movement (All), - Range (All)` |
