# Terrain Naming Caption Strategy (res1/res4)

## Purpose

Define the deterministic rules for generating hover caption headlines from terrain naming metadata so captions are readable, stable, and geographically representative.

## Scope

- Applies to naming headline generation in `src/main/terrainNamingLoad.ts`.
- Covers:
  - `preferredNamingLineForRes1Record`
  - `preferredNamingLineForRes4Record`
- References shared constants/behavior:
  - `TOOLTIP_NAME_LIST_MAX_ITEMS = 5`
  - Scalerank-priority sorting and grouped label formatting

## Shared Rules

### Candidate ordering

1. Sort candidate rows by `scalerank` ascending.
2. Treat `null` scalerank as lowest priority (after numeric ranks).
3. Preserve source order as a tie-breaker for equal rank.

### Candidate cap

- City/state selection phases only evaluate the first 5 candidates after sorting.
- Country fallback is uncapped.

### Output formatting

- City captions are grouped by country, then by state:
  - Example: `Country A: City 1 (State X), City 2 (State X); Country B: City 3 (State Y)`
- State captions are grouped by country:
  - Example: `Country A: State 1, State 2; Country B: State 3`
- Country captions are grouped by continent:
  - Example: `Europe: France, Spain; Asia: Japan`

## Resolution 4 Strategy

Function: `preferredNamingLineForRes4Record(record)`

### Decision order

1. **Cities (preferred)**  
   Use the top-5 city rows **only if** they cover:
   - all associated states, and
   - all associated countries
2. **States (first fallback)**  
   Use the top-5 state rows **only if** they cover:
   - all associated countries, and
   - all associated continents
3. **Countries (final fallback)**  
   Use all country rows grouped by continent.
4. Return `null` when cities, states, and countries are all empty.

### Rationale

- Favor local detail when city coverage is complete.
- Escalate to broader geography when local names are incomplete or too dense.
- Ensure a caption always represents the full geographic scope before stopping at a level.

## Resolution 1 Strategy

Function: `preferredNamingLineForRes1Record(record)`

### Decision order

1. **States (preferred)**  
   Use the top-5 state rows **only if** they cover:
   - all associated countries, and
   - all associated continents
2. **Countries (fallback)**  
   Use all country rows grouped by continent.
3. Return `null` when both states and countries are empty.

### Rationale

- At world-map scale, state/province labels are primary when they still represent full coverage.
- Country-level fallback prevents misleading partial state captions.

## Behavioral Guarantees

- Captions are deterministic for identical input ordering and values.
- Captions never rely on random sampling.
- Fallback always moves from more specific to less specific geography.
- `null` only indicates no available naming data at any supported level.

## Validation

Essential contract tests live in `src/main/terrainNamingLoad.test.ts` and cover:

- Top-5 escalation behavior for cities/states.
- Coverage-gate fallbacks.
- Country fallback grouping.
- Empty-data `null` behavior.
- Grouped formatting structure for city/state outputs.
