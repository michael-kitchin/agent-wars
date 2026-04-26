# ASCII Hex Map — Execution Plan

*For: LLM Briefing System — Commander's Briefing "Possible Unit Actions" replacement*
*April 2026*

---

## Goal

Replace the current flat-table "Possible Unit Actions" section of the LLM briefing prompt with a compact ASCII hex map plus focused supporting tables. The map provides spatial relationships at a glance (terrain, features, force distribution). The tables provide precise tactical metadata (unit rosters, this-turn options, production). The combination should reduce the token cost of the spatial sections while improving the LLM's ability to reason about geography, adjacency, and force posture.

---

## Design Summary

### The Map

An ASCII hex map rendered with **offset rows** (staggered horizontal), where each hex occupies a **2×2 character cell**:

```
 Top row:    2-character hex coordinate (e.g., "CQ")
 Bottom row: terrain character + overlay character
```

**Terrain character** (bottom-left):

| Character | Meaning                  |
|-----------|--------------------------|
| `.`       | Water                    |
| `x`       | Land (all land terrains) |

The terrain character tells the LLM definitively where naval vs. land units can go. Finer terrain distinctions (mountains, forests, desert, etc.) are not encoded in the map because terrain combat modifiers are deferred — if they're introduced later, a richer terrain alphabet can replace the binary `x`/`.` without changing the map format.

**Overlay character** (bottom-right), in priority order:

| Character | Meaning                                          | When shown         |
|-----------|--------------------------------------------------|---------------------|
| `#`       | Both sides have units here (contested)            | Highest priority    |
| `*`       | Only AI units here                                | Second priority     |
| `!`       | Only enemy units here                             | Second priority     |
| `?`       | Undiscovered: infrastructure/ownership unknown     | Discovery-gated     |
| `B`       | AI-controlled: airport(s) AND seaport(s) (implies urban) | Feature, no units   |
| `b`       | Not AI-controlled: airport(s) AND seaport(s) (implies urban) | Feature, no units   |
| `A`       | AI-controlled: airport(s) present, no seaport (implies urban) | Feature, no units   |
| `a`       | Not AI-controlled: airport(s) present, no seaport (implies urban) | Feature, no units   |
| `S`       | AI-controlled: seaport(s) present, no airport (implies urban) | Feature, no units   |
| `s`       | Not AI-controlled: seaport(s) present, no airport (implies urban) | Feature, no units   |
| `U`       | AI-controlled: urban hex(es), no airport or seaport | Feature, no units   |
| `u`       | Not AI-controlled: urban hex(es), no airport or seaport | Feature, no units   |
| `.`       | No features, no units (blank land or open water)  | Default             |

**Casing encodes ownership.** Uppercase = AI-controlled hex. Lowercase = uncontrolled, enemy-controlled, or neutral. This lets a low-cost LLM immediately distinguish its own production base from enemy or neutral infrastructure at a glance, without cross-referencing a separate table. The casing rule is stated once in the system prompt: *"On the map, uppercase feature letters are yours; lowercase are not."*

When a unit presence marker (`*`, `!`, `#`) displaces a feature code, the displaced feature (with correct casing) is recovered in a footnote below the map (see Phase 4).

**Fog of war, discovery parity, and presence markers.** Visibility must match the human-player discovery model exactly:

- Terrain uses the same visibility policy used for human players at this game stage.
- Infrastructure and ownership are discovery-gated: undiscovered hexes render `?` for the overlay (unknown infrastructure/ownership), discovered hexes render normal feature overlays with casing.
- Presence markers (`*`, `!`, `#`) are populated exclusively from the AI's subjective fog-of-war-filtered view.
- The AI's own units always show `*` since it always knows where its own forces are.

The `enemyUnitCount` field in `HexGameState` must be sourced from the same subjective view that the existing briefing pipeline uses.

### Offset Row Convention

Odd-numbered display rows are indented one character to the right to encode hex adjacency. The system prompt includes a one-line rule: *"Odd rows offset right. Each hex is adjacent to its two horizontal neighbors and the four nearest hexes in the rows above and below."*

Visual example (3×3 region):

```
AA AB AC
 AD AE AF
AG AH AI
```

Hex `AE` (odd row) is adjacent to: `AD`, `AF` (horizontal), `AB`, `AC` (row above), `AH`, `AI` (row below).

### Supporting Tables

1. **Unit roster** — one row per unit: designator, unit ID, type, hex coordinate, standing order summary.
2. **This-turn options** — one row per actionable opportunity: unit ID, action type, target hex coordinate, target description (enemy units, infrastructure).
3. **Displaced features** — hex coordinates where unit presence displaced a feature code, with the original feature listed.
4. **Production summary** — hex coordinate, urban count, queue status (carried forward from existing briefing with hex codes replacing lat/lng).

### Coordinate System

Hex codes are the **exclusive** coordinate system across the entire LLM interface. The LLM never sees lat/lng pairs or H3 index strings. Hex codes appear in:

- The ASCII map (cell labels)
- All briefing tables (position columns)
- Tool call parameters and responses
- The LLM's response JSON (order destinations, strike targets, production hexes)
- All prompt text (unit positions, standing order destinations, scenario descriptions)

The game engine translates between hex codes and internal H3 indices at the interface boundary. This translation is invisible to the LLM.

### Coordinate Scope by Active Context

Hex codes are interpreted against the **active game context**:

- Strategic context: codes resolve via the global res1 registry.
- Tactical context: codes resolve via the active battle's res4 registry.

The game is stateful and only in one context at a time, so 2-character codes remain unambiguous. All translation APIs must require context and reject cross-context lookups.

---

## Reliability-First Execution Protocol (For Lower-Capability Agents)

This plan is intentionally structured for deterministic execution by a lower-quality coding agent. Prioritize clarity, small change sets, and strict verification over speed.

### Operating Rules

1. **Strict phase order only.** Implement phases in sequence. Do not run phases in parallel, even where technically possible.
2. **One phase, one focused change set.** Complete implementation + verification + cleanup for the current phase before touching the next phase.
3. **Phase gate required.** A phase is complete only when all required verification checks for that phase pass.
4. **Stop-on-failure.** If a verification check fails, do not proceed; fix the phase until all checks pass.
5. **No silent behavior changes.** If the implementation deviates from this document, update the plan first, then implement.
6. **Keep code understandable.** Prefer small functions, explicit names, orienting comments, and predictable control flow.

### Per-Phase Execution Template

For each phase, execute this checklist in order:

1. Read the phase goal and "What to Build" section.
2. Implement only the files/functions listed for that phase.
3. Add/adjust tests for happy path + essential failure contracts only.
4. Run phase-specific verification checks listed in this document.
5. Confirm cross-cutting contract compliance (logging, orienting comments, maintainability limits).
6. Record a short "Phase Completion Note" in the PR/working notes:
   - What changed
   - Which checks passed
   - Known risks (if any)

### Phase Exit Criteria (Mandatory)

A phase can be marked complete only if all are true:

- Required behavior is implemented exactly as specified for that phase.
- Phase tests pass.
- No contradictory TODOs remain in touched files.
- Cross-cutting contract requirements are satisfied for touched code.
- Output is independently verifiable or verifiable with previously completed phases only.

### Phase 0: Readiness Checklist (Before Phase 1)

Complete this checklist before touching implementation code:

1. **Baseline state captured**
   - Run and record baseline test status for relevant suites.
   - Generate and save one current-format briefing sample for later comparison.

2. **Environment/tooling verified**
   - Confirm project installs/builds cleanly in current environment.
   - Confirm `h3-js` is available and importable in the target package.
   - Confirm test runner can execute targeted test files in isolation.

3. **Reference fixtures prepared**
   - Identify one stable strategic scenario fixture (example prompt scenario).
   - Identify one antimeridian fixture (`+179/-179` span) for wrapped-longitude checks.
   - Identify one fog/discovery fixture containing discovered and undiscovered hexes.

4. **Contract alignment confirmed**
   - Confirm logging API usage pattern for debug/error/trace requirements.
   - Confirm orienting comment style expected by the codebase.
   - Confirm target files will remain within maintainability limits or pre-plan decomposition.

5. **Schema and prompt baseline audit**
   - Enumerate all current tool/request/response fields that still use `[lat,lng]` or H3 strings.
   - Enumerate all prompt template sections containing coordinate text.
   - Record this inventory as the migration checklist for Phases 5B–5E.

6. **Definition of done acknowledged**
   - Phase work proceeds only when this checklist is complete.
   - Any unknowns discovered during Phase 0 are resolved in the plan before coding.

---

## Phase 1: Stable Coordinate Registry

**Goal:** Assign every H3 res1 hex a deterministic 2-character code that never changes across turns or map crops. These codes become the exclusive coordinate system for the entire LLM interface — every tool parameter, tool response, prompt reference, and response JSON field that currently uses lat/lng or H3 indices will use these codes instead.

**Why this is first:** Every subsequent phase depends on this registry. The map renderer needs it for labels. The tables need it for cross-references. The tool wrappers need it for translation. The response parser needs it for validation. This phase has zero gameplay dependencies and is independently testable.

### What to Build

A module that maps H3 res1 hex indices to stable 2-character codes.

```typescript
// hex-coordinates.ts

/**
 * Returns the stable 2-character display code for an H3 res1 hex.
 * Codes are assigned by sorting ALL res1 hex centers by
 * (latitude descending, longitude ascending) and assigning
 * sequentially from a 36-character alphabet ordered as:
 * A, B, C, ..., Z, 0, 1, ..., 9.
 *
 * First codes: AA, AB, ..., AZ, A0, ..., A9, BA, BB, ...
 * Last codes: ..., 97, 98, 99.
 *
 * The sort is computed once at startup from the full set of
 * res1 hex centers and cached as a Map<H3Index, string>.
 */
export function getHexCode(h3Index: string): string;

/**
 * Reverse lookup: given a 2-character code, return the H3 index.
 * Returns undefined if the code is not assigned.
 */
export function getH3Index(code: string): string | undefined;

/**
 * Initialize the registry. Call once at startup.
 * Iterates all res1 hexes (h3.getRes0Indexes() → children at res1),
 * computes center lat/lng for each, sorts, and assigns codes.
 */
export function initCoordinateRegistry(): void;
```

**Sort order rationale:** Latitude descending puts northern hexes first (row AA... is the top of the map). Longitude ascending puts western hexes first within a row. This means the code roughly tracks spatial position — codes starting with `A` are in the far north, codes starting with later letters are further south — which gives the LLM a weak but useful positional hint even without the map.

**Character set:** Use uppercase A–Z plus digits 0–9 for both characters, giving 1,296 codes (36 × 36). This comfortably covers the ~842 res1 hexes at the global level and the ~343 res4 hexes per parent hex at the tactical level. Codes like `A3`, `7B`, and `CF` are all valid. The alphanumeric set avoids lowercase letters, which are reserved for the map's overlay characters (lowercase = uncontrolled infrastructure).

### Verification

Write a test that:

1. Calls `initCoordinateRegistry()`.
2. Verifies every res1 hex has a unique 2-character code.
3. Verifies round-trip: `getH3Index(getHexCode(h3Index)) === h3Index` for all hexes.
4. Verifies stability: calling `initCoordinateRegistry()` again produces identical assignments.
5. Spot-checks a few known hexes (e.g., a hex over Central Europe should have a code in the first third of the alphabet; a hex over Antarctica should have a code in the last third).

---

## Phase 2: Grid Projection

**Goal:** Map H3 res1 hex centers onto a regular 2D grid (row, column) suitable for ASCII rendering with offset rows.

**Why this is second:** Grid projection is the spatial backbone. The map renderer (Phase 3) needs (row, col) positions. This phase depends on Phase 1 for hex identification but is otherwise independent.

### What to Build

A module that converts a set of H3 indices into a 2D grid layout.

```typescript
// hex-grid-projection.ts

interface GridCell {
  h3Index: string;       // the H3 index for this hex
  code: string;          // 2-character display code from Phase 1
  row: number;           // 0-based row in the grid
  col: number;           // 0-based column in the grid
  lat: number;           // center latitude
  lng: number;           // center longitude
}

interface HexGrid {
  cells: GridCell[];      // all hexes in the grid
  numRows: number;
  numCols: number;
}

/**
 * Given a set of H3 res1 indices, compute a 2D grid layout.
 *
 * Algorithm:
 * 1. Get center lat/lng for each hex.
 * 2. Cluster latitudes into rows using a tolerance band.
 *    H3 res1 hexes have centers spaced roughly 7–9 degrees apart
 *    in latitude. Use a clustering threshold of ~4 degrees to
 *    group centers into the same row.
 * 3. Normalize longitudes around the shortest wrapped span for
 *    this map window (antimeridian-safe).
 * 4. Within each row, sort by normalized longitude ascending
 *    → column index.
 * 4. Assign 0-based row indices (0 = northernmost) and 0-based
 *    column indices (0 = westernmost within that row).
 *
 * The output grid is sparse — not every (row, col) has a hex.
 */
export function projectToGrid(h3Indices: string[]): HexGrid;
```

### Bounding Box Computation

A separate function computes which hexes appear on the map for a given turn.

```typescript
// hex-bounding-box.ts

/**
 * Compute the set of H3 res1 indices to include on the map.
 *
 * Algorithm:
 * 1. Collect the lat/lng centers of all units on both sides
 *    (AI + observed enemy).
 * 2. Compute a wrapped longitude window that minimizes span
 *    (supports antimeridian crossing) plus a latitude range.
 * 3. Expand by a buffer (default: 5 hex-widths, roughly 35–45
 *    degrees of latitude/longitude). This generous buffer
 *    ensures the LLM sees approach corridors, flanking routes,
 *    and strategic depth around the force distribution.
 * 4. Return all res1 hexes whose centers fall within the
 *    expanded bounding box.
 */
export function computeMapHexes(
  aiUnits: Array<{ lat: number; lng: number }>,
  enemyUnits: Array<{ lat: number; lng: number }>,
  bufferHexes?: number
): string[];  // H3 indices
```

### Latitude Clustering Detail

H3 res1 hex centers do not fall on a perfectly regular latitude grid because H3 uses an icosahedron-based projection. The clustering step must handle this:

1. Sort all hex centers by latitude descending.
2. Walk the sorted list. Start a new row whenever the current hex's latitude is more than `CLUSTER_THRESHOLD` degrees below the previous hex's latitude.
3. Tune `CLUSTER_THRESHOLD` empirically — start with 4.0 degrees, verify visually that hex rows look correct on a known map region (e.g., Europe/Middle East from the example prompt).

**Important:** The clustering must be deterministic. Use the same sort order and threshold every time so that row/column assignments are stable across turns for the same set of hexes. Since the set of hexes in the bounding box can change between turns (units move, the box shifts), row/column indices are NOT stable across turns — only the 2-character hex codes from Phase 1 are stable. This is fine because the grid layout is a rendering concern, not a referencing concern.

### Longitude Wrapping Detail

Use wrapped longitude normalization to avoid map discontinuities near `+180/-180`:

1. Convert all longitudes to a circular domain.
2. Select the shortest arc containing all relevant unit positions.
3. Expand that arc by the configured buffer.
4. Normalize candidate hex longitudes into that arc before row-wise sort.

This guarantees that theaters near the antimeridian render as one continuous map region rather than split at the edge.

### Verification

1. Project the ~122 res1 land hexes onto a grid. Print the grid with hex codes. Visually verify that the layout roughly resembles a Mercator world map — continents should be recognizable, relative positions should be correct.
2. Verify that no two hexes share the same (row, col).
3. Verify that the bounding box for the example prompt's unit positions (Western Asia vs. Northern Africa) produces a grid covering the Middle East, North Africa, and Eastern Mediterranean, with water hexes included.
4. Verify that the bounding box expansion/contraction produces reasonable results: remove a unit from the edge, recompute, and confirm the map shrinks without corrupting the layout. Row/column assignments may shift when the hex set changes — this is expected and acceptable since hex codes (not grid positions) are the stable identifier.
5. Verify antimeridian behavior with a fixture spanning longitudes near `+179/-179`: output should be continuous and use the shortest wrapped span.

---

## Phase 3: Cell Encoding and Map Renderer

**Goal:** Render a `HexGrid` into an ASCII string with 2×2 cells and offset rows.

**Why this is third:** This phase takes the spatial layout (Phase 2) and the coordinate codes (Phase 1) and produces the visual output. It also needs game state (unit positions, terrain, features) to populate the overlay character, so it integrates with the existing game state model.

### What to Build

```typescript
// hex-map-renderer.ts

interface HexGameState {
  terrain: 'land' | 'water';
  isDiscovered: boolean; // visibility/discovery state in parity with human player rules
  features: {
    hasAirport: boolean;
    hasSeaport: boolean;
    urbanCount: number;   // 0 = no urban hexes
  };
  controlledByAI: boolean; // determines uppercase vs. lowercase feature characters
  aiUnitCount: number;     // number of AI units in this hex (always known)
  enemyUnitCount: number;  // number of OBSERVED enemy units (fog-of-war filtered)
  // enemyUnitCount must come from the AI's subjective view,
  // NOT from ground-truth game state. Hexes outside the AI's
  // visibility always have enemyUnitCount = 0, even if enemies
  // are actually present.
}

interface MapRenderResult {
  mapString: string;           // the ASCII map
  displacedFeatures: Array<{   // hexes where presence hid features
    code: string;
    feature: string;           // the feature character that was hidden
  }>;
}

/**
 * Render the hex grid as an ASCII map string.
 *
 * For each cell at (row, col), produce a 2x2 block:
 *   [code_char_1][code_char_2]
 *   [terrain_char][overlay_char]
 *
 * Offset: for odd-numbered rows, prepend one space to indent.
 * Between cells within a row, insert one space for readability.
 * Between row pairs (each row is 2 lines tall), insert no blank
 * line — the rows should be visually dense.
 *
 * Empty grid positions (no hex) render as 2x2 spaces: "  \n  "
 */
export function renderMap(
  grid: HexGrid,
  gameState: Map<string, HexGameState>  // keyed by H3 index
): MapRenderResult;
```

### Rendering Rules

1. **Top line of each cell:** The 2-character hex code from Phase 1.
2. **Bottom line of each cell:**
   - First character: `x` if land, `.` if water.
   - Second character: determined by priority cascade (see overlay table in Design Summary above), including `?` for undiscovered infrastructure/ownership.
3. **Offset:** Odd display rows (row index 1, 3, 5...) are indented by 1 character.
4. **Spacing:** One space between cells horizontally. No blank lines between rows vertically.
5. **Empty cells:** Where the grid has no hex (sparse grid), render as two spaces on both lines.
6. **Discovery handling:** If `isDiscovered` is false and no unit presence marker applies, render `?` as overlay and do not render feature casing.
7. **Track displaced features:** When a presence marker (`*`, `!`, `#`) replaces a feature code, record the hex code and displaced feature character in the `displacedFeatures` array.

### Rendering Example

Given a 4-column, 3-row grid with some units and features (AI controls hexes A3, AD, AF, AK; does not control AC, AG):

```
A1 A2 AC AD
 A3 AF AG AH
A9 AJ AK AL
```

Rendered (illustrative):

```
A1 A2 AC AD
x. x. .a xU
 A3 AF AG AH
 x* xB x! ..
A9 AJ AK AL
x. x. xA x.
```

Reading hex `AF`: code `AF`, land (`x`), AI-controlled airport+seaport (`B` uppercase).
Reading hex `AC`: code `AC`, water (`.`), uncontrolled airport (`a` lowercase).
Reading hex `AG`: code `AG`, land (`x`), observed enemy units present (`!`).
Reading hex `A3`: code `A3`, land (`x`), AI units present (`*`). If `A3` has an airport, it appears in the displaced features footnote with correct casing.

**Note:** Hex codes on the grid are ordered by geographic position (latitude → row, longitude → column), not by code sequence. Codes like `A1` and `AC` can appear in the same row because they happen to be at similar latitudes — the code sequence reflects the global sort order of all res1 hexes, while the grid layout reflects the local geographic arrangement of the hexes in the current bounding box.

### Verification

1. Render the example prompt's game state (Western Asia vs. Northern Africa scenario) as an ASCII map. Visually verify:
   - Water hexes show `.` terrain.
   - Known urban/airport/seaport hexes show correct feature codes with correct casing (uppercase for AI-controlled, lowercase for uncontrolled).
   - AI unit positions show `*`.
   - Enemy unit positions show `!`.
   - The hex at `[21.14, 18.36]` (where human-infantry-1 and human-armor-1 are co-located) shows `!` — both are enemy units, not contested.
2. Verify displaced features are tracked correctly: render a hex with an airport and an AI unit, confirm the displaced feature list includes that hex.
3. Verify that the map is valid ASCII — no unicode characters, consistent line lengths (padded with spaces if needed for alignment).
4. Count the tokens (approximate: characters ÷ 4) and compare to the token count of the "Possible Unit Actions" tables from the example prompt. The map should be significantly smaller.

---

## Phase 4: Supporting Tables

**Goal:** Build the compact tables that accompany the map, replacing the verbose "Possible Unit Actions" section.

**Why this is fourth:** The tables reference hex codes from Phase 1 and are designed to complement the map from Phase 3. They can be built and tested against the same game state data.

### Table 1: Unit Roster

One row per unit. This replaces the scattered unit position information currently spread across the briefing.

```
| Hex | ID | Type | Standing Order | Nearest Enemy | Dist |
|-----|----|------|----------------|---------------|------|
| AE  | opponent-infantry-1 | infantry | MARCH → CF | human-infantry-1 | 3 |
| CF  | opponent-armor-1    | armor    | MARCH → CF | human-infantry-1 | 2 |
```

- **Hex** column uses the 2-character code, giving the LLM a direct cross-reference to the map.
- The rest of the columns carry forward from the existing "Unit Status and Threats" table with minimal change.
- Sort by distance to nearest enemy (ascending) so the most actionable units are at the top.

### Table 2: This-Turn Options

One row per actionable opportunity this turn. This replaces the massive multi-section "Possible Unit Actions" tables. Only include actions the unit can actually take this turn — not every hex it could theoretically reach.

```
| Unit ID | Action | Target Hex | Target | Notes |
|---------|--------|------------|--------|-------|
| opponent-air-1 | air strike | RA | 1 armor, 1 infantry | enemy units |
| opponent-air-1 | air strike | CF | 26 urban, 7 airports | infrastructure |
| opponent-armor-1 | ranged | RA | 1 armor, 1 infantry | range 1 |
| opponent-armor-1 | move/melee | CF | — | 26 urban, 7 airports |
```

- **Target Hex** uses the 2-character code. The LLM can glance at the map to see where `RA` is relative to its own forces.
- Only list actions for this turn: ranged attacks from current position, air strikes from current base, and single-turn move destinations. Multi-turn march destinations stay in the standing order column of the unit roster — they're not per-turn options.
- This table should be dramatically smaller than the current "Possible Unit Actions" section because it excludes: (a) hexes that are reachable but have nothing interesting, (b) multi-turn destinations, (c) the redundant "Other Hexes" catchall.

### Table 3: Displaced Features (footnote)

A compact list below the map:

```
Units at featured hexes: A3(A), CF(b), RA(u)
```

Meaning: hex `A3` has an AI-controlled airport (hidden by presence marker), hex `CF` has an uncontrolled airport+seaport, hex `RA` has uncontrolled urban hexes. Casing follows the same uppercase/lowercase convention as the map. Only present when there are displaced features; omit entirely otherwise.

### Table 4: Production Summary

Carried forward from the existing briefing with hex codes replacing lat/lng:

```
| Hex | Urban | Airports | Seaports | Queue |
|-----|-------|----------|----------|-------|
| DK  | 79    | 5        | 2        | 1 armor |
```

The hex code cross-references to the map. The engine translates hex codes back to H3 indices internally when processing production orders.

### What to Build

```typescript
// briefing-tables.ts

interface UnitRosterRow {
  hexCode: string;
  unitId: string;
  unitType: string;
  standingOrder: string;    // human-readable summary
  nearestEnemy: string;     // enemy unit ID or "—"
  distance: number | null;
}

interface TurnOptionRow {
  unitId: string;
  action: string;           // "air strike", "ranged", "move/melee"
  targetHexCode: string;
  targetDescription: string;
  notes: string;
}

/**
 * Generate the unit roster table as a markdown string.
 * Sort by distance to nearest enemy, ascending (nulls last).
 */
export function renderUnitRoster(units: UnitRosterRow[]): string;

/**
 * Generate the this-turn options table as a markdown string.
 * Only include actions executable this turn.
 */
export function renderTurnOptions(options: TurnOptionRow[]): string;

/**
 * Generate the displaced features footnote as a single-line string.
 * Returns empty string if no features were displaced.
 */
export function renderDisplacedFeatures(
  displaced: Array<{ code: string; feature: string }>
): string;

/**
 * Generate the production summary table as a markdown string.
 */
export function renderProductionSummary(
  production: Array<{
    hexCode: string;
    urbanCount: number;
    airports: number;
    seaports: number;
    queue: string;
  }>
): string;
```

### Filtering and Capping This-Turn Options

The existing briefing lists every hex each unit could reach (hundreds of rows). The new table applies a three-step pipeline to produce a compact, high-signal list:

1. **Filter** to only actionable opportunities this turn:
   - **Ranged attacks** from the unit's current position (armor range 1, naval range 2).
   - **Air strikes** from the air unit's current base (range 3).
   - **Move/melee destinations** reachable in one turn that contain observed enemy units, OR uncontrolled hexes with any infrastructure features (airport, seaport, or urban > 0). Do NOT list empty featureless hexes — the map shows those.
   - **Standing order arrivals** where the unit reaches its march destination this turn (confirmation row).

2. **Sort** each unit's eligible rows by enemy unit count descending, then urban hex count descending — most tactically relevant options first.

3. **Cap at 5 rows per unit.** Take the top 5 after sorting. The LLM can still issue orders to any hex on the map — the cap prunes the pre-listed suggestions, not the available actions.

The filtering question for each potential row is: *"Would the LLM plausibly choose this action this turn?"* If the answer is "only if it had no better options and happened to notice this hex existed," don't list it.

```typescript
/**
 * Determine whether a reachable hex should appear in the
 * this-turn options table (step 1: filter).
 *
 * Include if ANY of:
 * - Hex contains observed enemy units (move/melee or ranged target)
 * - Hex has any feature (airport, seaport, or urban > 0)
 *   AND is not controlled by the AI (strategic target,
 *   capture opportunity, or ferry destination)
 * - Hex is the destination of a standing march order AND
 *   the unit arrives this turn (confirmation row)
 *
 * Exclude otherwise — the map shows the terrain; the LLM
 * can issue march orders to any hex code it sees on the map
 * without needing it pre-listed.
 */
function shouldIncludeInTurnOptions(
  hex: HexGameState,
  isControlledByAI: boolean,
  hasObservedEnemyUnits: boolean,
  isStandingOrderArrival: boolean
): boolean;

/**
 * After filtering, sort and cap each unit's rows (steps 2–3).
 *
 * Sort: enemy unit count descending, then urban hex count
 * descending. Take top MAX_ROWS_PER_UNIT (default 5).
 */
const MAX_ROWS_PER_UNIT = 5;

function sortAndCapOptions(
  rows: TurnOptionRow[],
  maxPerUnit?: number
): TurnOptionRow[];
```

**Tactical-level note:** At res4, unit counts are higher (12 infantry sub-units, 6 armor sub-units, etc.) and the hex grid is denser (~343 hexes). The per-unit row cap becomes essential to prevent the table from exploding. The same 5-row cap and sort order apply at res4. If playtesting reveals that 5 rows per unit at res4 is still too verbose (many units × 5 = large table), reduce the cap to 3.

### Verification

1. Generate both the current "Possible Unit Actions" section and the new table set for the same game state (the example prompt). Compare row counts — the new table should have at most 5 × (number of units) rows, and in practice significantly fewer since many units share targets. Expect roughly 15–30 rows vs. the current 50+ rows.
2. Verify that the top-5 sort order is correct: for each unit, the included rows should be the 5 most relevant by enemy count then urban count.
3. Verify that every action the LLM could legally take this turn is either in the this-turn options table or is inferable from the map (e.g., "move infantry one hex north" doesn't need a table row if the map shows the hex is empty land). Actions that were filtered by the row cap are acceptable omissions — the LLM can still issue those orders.
4. Verify that the unit roster table contains every unit, and that hex codes match the map.
5. Verify that the displaced features footnote is accurate against the map rendering, including correct uppercase/lowercase casing.

---

## Phase 5: Coordinate System Migration

**Goal:** Replace lat/lng coordinates and H3 indices with 2-character hex codes as the exclusive coordinate system across the entire LLM interface: tool call parameters, tool call responses, the LLM's response JSON schema, and all prompt text. The engine translates between hex codes and internal representations (H3 indices) at the boundary — the LLM never sees anything other than hex codes.

**Why this is the right approach:** Lat/lng coordinates are semantically meaningless to the LLM — `[26.39, 41.06]` conveys no spatial information. Hex codes are short, human-readable, and directly cross-reference the ASCII map. Eliminating the translation burden from the LLM removes an entire class of errors (miscopied coordinates, invented coordinates, transposed lat/lng) and saves tokens throughout the prompt. The engine already maintains the mapping (Phase 1), so the translation cost is trivial.

**Why this is fifth:** Phases 1–4 establish the hex code system and prove it works for display. This phase extends it to the entire interface, which requires modifying tool schemas, response parsing, and prompt content. Those modifications are mechanical once the coordinate registry exists, but they touch many files and need careful verification.

### 5A: Translation Layer

Build a bidirectional translation service that sits at the boundary between the LLM interface and the game engine internals.

```typescript
// hex-code-translator.ts

interface CoordinateContext {
  mode: 'strategic' | 'tactical';
  battleId?: string; // required when mode === 'tactical'
}

/**
 * Translate a hex code to its H3 index.
 * Throws if the code is not in the active context registry.
 */
export function codeToH3(code: string, context: CoordinateContext): string;

/**
 * Translate a hex code to [lat, lng] at 2 decimal places.
 * Throws if the code is not in the active context registry.
 */
export function codeToLatLng(code: string, context: CoordinateContext): [number, number];

/**
 * Translate an H3 index to its hex code.
 * Throws if the index is not in the active context registry.
 */
export function h3ToCode(h3Index: string, context: CoordinateContext): string;

/**
 * Translate a [lat, lng] pair to a hex code by snapping to
 * the nearest hex center in the active context first, then
 * looking up the code.
 * Used during migration to convert existing lat/lng references.
 */
export function latLngToCode(
  lat: number,
  lng: number,
  context: CoordinateContext
): string;

/**
 * Validate that a string is a known hex code.
 * Returns true if the code exists in the active context registry.
 */
export function isValidHexCode(code: string, context: CoordinateContext): boolean;
```

### 5B: Tool Schema Migration

Every tool that accepts or returns coordinates changes from `[lat, lng]` to hex code strings. The tool implementation translates internally before calling game logic.

**Tools that accept coordinates as parameters:**

| Tool | Current Parameter | New Parameter |
|------|-------------------|---------------|
| `plan_route` | `destination: [lat, lng]` | `destination: string` (hex code) |
| `check_distance` | `from: [lat, lng]`, `to: [lat, lng]` | `from: string`, `to: string` |
| `assess_unit` | (unitId only) | (no change) |
| `assess_hex` | `hex: [lat, lng]` | `hex: string` (hex code) |
| `set_build_queue` | `hex: [lat, lng]` | `hex: string` (hex code) |

**Tools that return coordinates in responses:**

| Tool | Current Response Field | New Response Field |
|------|------------------------|---------------------|
| `plan_route` | `orderToXY: [lat, lng]`, path steps as `[lat, lng]` | `orderTo: string` (hex code), path steps as hex codes |
| `check_distance` | `from: [lat, lng]`, `to: [lat, lng]` | `from: string`, `to: string` |
| `assess_unit` | unit positions as `[lat, lng]` | unit positions as hex codes |
| `assess_hex` | hex position as `[lat, lng]` | hex position as hex code |
| `query_orders` | destinations as `[lat, lng]` | destinations as hex codes |
| `query_production` | hex positions as `[lat, lng]` | hex positions as hex codes |

**Implementation pattern:** Each tool function gets a thin wrapper that translates inbound hex codes to H3 indices (or lat/lng) before calling the existing implementation, and translates outbound H3 indices (or lat/lng) back to hex codes before returning the response. The existing tool logic does not change — only the interface boundary.

```typescript
// Example: plan_route wrapper
async function planRoute(params: { unitId: string; destination: string }) {
  const context = getActiveCoordinateContext();
  const destH3 = codeToH3(params.destination, context);  // translate inbound
  const result = await planRouteInternal(params.unitId, destH3);
  return {
    ...result,
    orderTo: h3ToCode(result.orderToH3, context),          // translate outbound
    path: result.path.map(step => ({
      ...step,
      hex: h3ToCode(step.h3Index, context),
    })),
  };
}
```

### 5C: Response JSON Schema Migration

The LLM's response JSON changes from lat/lng to hex codes everywhere a hex position appears, and target fields become explicit to avoid parser ambiguity.

**Current → New:**

```jsonc
// CURRENT (lat/lng)
{
  "orders": [
    { "action": "assign_order", "unitId": "opponent-infantry-1",
      "order": { "type": "march", "destination": [12.34, 56.78] } },
    { "action": "explicit_move", "unitId": "opponent-armor-1",
      "destination": [12.35, 56.79] },
    { "action": "ranged_attack", "unitId": "opponent-naval-1",
      "targetHex": [12.36, 56.80] }
  ],
  "airStrikes": [
    { "unitId": "opponent-air-1", "targetHex": [12.37, 56.81],
      "targetType": "urban" }
  ],
  "productionOrders": [
    { "action": "set_build_queue", "hex": [12.34, 56.78],
      "unitType": "infantry", "count": 1 }
  ]
}

// NEW (hex codes)
{
  "orders": [
    { "action": "assign_order", "unitId": "opponent-infantry-1",
      "order": { "type": "march", "destination": "CF" } },
    { "action": "explicit_move", "unitId": "opponent-armor-1",
      "destination": "CG" },
    { "action": "ranged_attack", "unitId": "opponent-naval-1",
      "targetHexCode": "CH" },
    { "action": "ranged_attack", "unitId": "opponent-naval-1",
      "targetUnitId": "human-armor-1" }
  ],
  "airStrikes": [
    { "unitId": "opponent-air-1", "targetHexCode": "CI",
      "targetType": "urban" }
  ],
  "productionOrders": [
    { "action": "set_build_queue", "hex": "CF",
      "unitType": "infantry", "count": 1 }
  ]
}
```

**Explicit-target rule:** Replace polymorphic `targetHex` with explicit optional fields:

- `targetHexCode`: 2-character hex destination/target.
- `targetUnitId`: unit-designator target.

Validation rule: exactly one of these fields must be present where targeting applies. If both or neither are provided, reject with a clear schema/validation error.

**Callback parameters** that reference hex positions also migrate:

```jsonc
// CURRENT
{ "event": "territory_changed", "params": { "hexId": [12.34, 56.78] } }

// NEW
{ "event": "territory_changed", "params": { "hexId": "CF" } }
```

### 5D: Response Parser Update

The engine's response parser currently extracts `[lat, lng]` arrays from the LLM's JSON and passes them to the order execution pipeline. Update it to:

1. Accept only hex-code-based fields in the new schema (hard cutover; no legacy fallback).
2. Validate explicit targeting fields (`targetHexCode`, `targetUnitId`) with exactly-one semantics.
3. Translate each hex code to the internal representation (H3 index or lat/lng) using `codeToH3()` or `codeToLatLng()` before passing to the execution pipeline.
4. Validate each hex code against the context-specific registry — reject unknown codes with a clear error message rather than silently failing downstream.

```typescript
// response-parser.ts (sketch of the translation step)

const HEX_CODE_PATTERN = /^[A-Z0-9]{2}$/;

/**
 * Parse explicit targeting fields.
 * Returns either an H3 index (for hex target) or unit ID target.
 */
function parseTarget(
  input: { targetHexCode?: unknown; targetUnitId?: unknown },
  context: CoordinateContext
): { type: 'hex'; h3: H3Index } | { type: 'unitId'; id: string } {
  const hasHex = input.targetHexCode !== undefined;
  const hasUnit = input.targetUnitId !== undefined;
  if (hasHex === hasUnit) {
    throw new Error('Exactly one of targetHexCode or targetUnitId is required');
  }
  if (hasHex) {
    if (typeof input.targetHexCode !== 'string' || !HEX_CODE_PATTERN.test(input.targetHexCode)) {
      throw new Error(`Invalid targetHexCode: ${JSON.stringify(input.targetHexCode)}`);
    }
    if (!isValidHexCode(input.targetHexCode, context)) {
      throw new Error(`Unknown hex code in active context: "${input.targetHexCode}"`);
    }
    return { type: 'hex', h3: codeToH3(input.targetHexCode, context) };
  }
  if (typeof input.targetUnitId !== 'string' || input.targetUnitId.length === 0) {
    throw new Error(`Invalid targetUnitId: ${JSON.stringify(input.targetUnitId)}`);
  }
  return { type: 'unitId', id: input.targetUnitId };
}
```

**Migration safety:** Hard cutover for unreleased software. Reject legacy `[lat, lng]` arrays immediately with a clear error.

### 5E: Prompt Content Migration

Every reference to lat/lng in the prompt text changes to hex codes. This includes:

1. **System prompt header** — remove the instruction about `[lat, lng]` at 2 decimal places. Replace with: *"All positions use 2-character hex codes shown on the Operational Map. Use only hex codes that appear on the map or in tables below — never invent codes."*

2. **Unit position listing** at the end of the prompt — currently:
   ```
   Your units: opponent-infantry-1 (infantry) at [26.39, 41.06]; ...
   Human units: human-infantry-1 (infantry) at [21.14, 18.36]; ...
   ```
   Becomes:
   ```
   Your units: opponent-infantry-1 (infantry) at AE; ...
   Human units: human-infantry-1 (infantry) at RA; ...
   ```

3. **Standing order destinations** — `MARCH to [27.56, 32.30]` becomes `MARCH to CF`.

4. **Combat rules summary** in the system prompt — remove coordinate examples that use `[lat, lng]`. Replace with hex code examples.

5. **JSON example** at the end of the prompt — update to use hex codes (as shown in 5C above).

6. **Tool descriptions** in the Available Tools section — update parameter descriptions to say "hex code" instead of `[lat, lng]`.

7. **Air Operations, Naval Transport, and Production tables** — all position columns change from `[lat, lng]` to hex codes.

### What to Build

```typescript
// hex-code-translator.ts     — 5A: translation layer
// tool-wrappers.ts           — 5B: thin wrappers around each tool
// response-parser-v2.ts      — 5D: updated parser with hex code support
// prompt-templates-v2.ts     — 5E: updated prompt text templates
```

The tool schema definitions (JSON schemas provided to the LLM for tool calling) also need updating — every `description` field that mentions `[lat, lng]` changes to reference hex codes, and parameter types change from arrays/tuples to strings.

### Verification

**5A (Translation layer):**
1. Round-trip every hex in the registry: `codeToH3(h3ToCode(h3)) === h3` for all res1 hexes.
2. `latLngToCode()` correctly snaps known hex center coordinates to the right code.
3. `isValidHexCode()` returns true for all assigned codes, false for random strings.

**5B (Tool schemas):**
1. Call each tool with hex code parameters. Verify the tool returns the expected result with hex codes in the response.
2. Call each tool with an invalid hex code. Verify it returns a clear error, not a crash.
3. Compare tool responses between the old (lat/lng) and new (hex code) interfaces for the same query — results should be identical except for the coordinate format.

**5C/5D (Response parsing):**
1. Parse a well-formed response JSON with hex codes. Verify all coordinates are correctly translated to H3 indices internally.
2. Parse a response with an invalid hex code. Verify the parser rejects it with a useful error message.
3. Parse a response with `targetUnitId`. Verify it passes through correctly.
4. Parse a response that sets both `targetHexCode` and `targetUnitId`. Verify parser rejects it.
5. Parse a legacy response with `[lat, lng]` arrays. Verify parser rejects it with a clear hard-cutover error.

**5E (Prompt content):**
1. Search the complete generated prompt for any remaining `[lat, lng]` patterns (regex: `\[\s*-?\d+\.\d+\s*,\s*-?\d+\.\d+\s*\]`). The search should return zero matches.
2. Search for any remaining H3 index strings (regex for H3 format). Zero matches.
3. Read the prompt end-to-end. Every hex reference should be a 2-character code that appears on the map.

---

## Phase 6: Briefing Integration

**Goal:** Wire the map, tables, and hex-code coordinate system into the existing briefing generator. Replace the "Possible Unit Actions" section with the map. Update every other section to use hex codes exclusively. Verify the complete prompt end-to-end.

**Why this is last:** This phase touches the production prompt pipeline and depends on every prior phase: the map renderer (Phases 1–3), the supporting tables (Phase 4), and the coordinate system migration (Phase 5).

### What to Change

The briefing generator currently produces these sections (in order). Items marked with ★ are affected:

1. ★ System prompt header — replace lat/lng instructions with hex code instructions; add adjacency rule
2. ★ Commander's Briefing / Unit Status table — hex code column replaces lat/lng position column
3. ★ Attention Flags — hex codes replace lat/lng references
4. ★ **Possible Unit Actions** — **replace entirely** with:
   - ASCII hex map
   - Displaced features footnote
   - This-turn options table
5. ★ Supplemental Hex Intelligence — hex codes replace lat/lng
6. Losses Since Last Consultation — no change (references unit IDs, not positions)
7. ★ Production Status — hex codes replace lat/lng; add urban count from Phase 4
8. Strategic Memory — no change
9. ★ Standing Order Status — hex codes for destinations and next-move positions
10. ★ Air Operations Status — hex codes for base, targets, ferry destinations
11. ★ Naval Transport Status — hex codes for positions, embark hexes
12. ★ Available Tools — parameter descriptions updated (per Phase 5B)
13. ★ Unit position summary — hex codes replace lat/lng
14. ★ JSON example — hex codes replace lat/lng (per Phase 5C)
15. ★ Scenario Objective — hex codes for any hex references

### Integration Steps

1. **Select strategic map cells** as the full registered strategic res1 set (`listStrategicRes1H3Indexes()`), pole-to-pole / dateline-safe extent (no unit-centered viewport). `computeMapHexes()` remains available for other callers that need a bounded window.
2. **Call `projectToGrid()`** on that hex set.
3. **Populate `HexGameState`** for each hex from the game state (terrain, features, unit counts by side).
4. **Call `renderMap()`** to produce the ASCII map and displaced features list.
5. **Call the table renderers** (unit roster, this-turn options, production summary).
6. **Assemble the map section** in the briefing:

```markdown
## Operational Map

Each cell: top = hex code, bottom = terrain + overlay.
Terrain: x = land, . = water.
Overlay: * = your units, ! = enemy units, # = contested.
Features: A/a = airport, S/s = seaport, B/b = both, U/u = urban only.
Uppercase = your hex, lowercase = not yours.
Odd rows offset right. Each hex is adjacent to its two horizontal
neighbors and the four nearest hexes in the rows above and below.
Use only hex codes from this map — never invent codes.

[ASCII map]

[displaced features footnote, if any]

### This-Turn Options
[options table]
```

7. **Update all other briefing sections** to use hex codes exclusively. The translation layer from Phase 5A converts internal H3 indices to hex codes at the point where each section's text is generated.

### What to Build

```typescript
// briefing-map-section.ts

/**
 * Top-level function that produces the complete map section
 * for the briefing prompt.
 *
 * Orchestrates: bounding box → grid projection → map rendering
 * → table generation → assembly into a single markdown string.
 *
 * This function replaces the existing "Possible Unit Actions"
 * section builder.
 */
export function buildMapSection(
  aiUnits: Unit[],
  observedEnemyUnits: Unit[],
  gameState: GameState,
  bufferHexes?: number
): string;
```

Each existing section builder function also needs updating to call `h3ToCode()` wherever it currently formats an H3 index or lat/lng pair into the prompt string. This is mechanical: find every place a position is interpolated into the output string, replace the formatting with a `h3ToCode()` call. The Phase 5E verification step (regex search for remaining lat/lng patterns) catches any missed instances.

### Prompt Updates

1. **Coordinate instruction** at the top of the system prompt:
   > *"All positions use 2-character hex codes from the Operational Map. Tools accept and return hex codes. Your response JSON uses hex codes for all positions. Never use lat/lng coordinates or H3 indices — use only hex codes that appear on the map or in tables."*

2. **The map section header** (shown above) contains the complete legend: cell structure, terrain characters, overlay characters, casing rule, presence markers, and adjacency rule. This is self-contained — a low-cost LLM can read the map without referencing other sections.

3. **The "how to use tools" section** — note that the map shows spatial relationships and the LLM should use the map for strategic assessment and the this-turn options table for tactical decisions, rather than calling `assess_hex` or `assess_unit` for information the briefing already provides.

4. **Explicit target fields rule:**
   > *"Use `targetHexCode` to target a position and `targetUnitId` to target a unit. Provide exactly one where targeting applies. Hex codes are exactly 2 uppercase alphanumeric characters (e.g., `CF`, `A3`, `7B`) and must exist in the active map context."*

### Verification

1. **Generate a complete briefing** for the example prompt scenario using the new format. Read it as if you were the LLM. Verify you can determine:
   - Where your units are relative to the enemy?
   - What attacks are available this turn?
   - Where the production centers are?
   - What the overall strategic picture looks like?
   If any of these require more than a few seconds of scanning, the format needs adjustment.

2. **Zero lat/lng audit.** Regex search the complete prompt for `[lat, lng]` patterns and H3 index patterns. Zero matches.

3. **Token count comparison.** Count total tokens for the entire old-format briefing vs. the entire new-format briefing (not just the map section — the coordinate migration affects every section). Target: at least 20% total reduction. The savings come from two sources: (a) the map replacing verbose tables, and (b) 2-character hex codes replacing 16+ character `[xx.xx, xx.xx]` coordinate arrays throughout the prompt.

4. **End-to-end LLM test.** Feed the complete new-format briefing to the game's target LLM. Verify:
   - The LLM produces valid JSON with hex codes, not lat/lng.
   - The response parser (Phase 5D) correctly translates all hex codes to internal H3 indices.
   - The LLM's strategic reasoning references the map (e.g., "my armor at AE is two hexes from the enemy cluster at RA").
   - The LLM does not hallucinate hex codes that don't exist on the map.
   - The LLM takes available attacks listed in the this-turn options table.
   - Tool calls (if any) use hex codes in parameters.

5. **Regression test.** Play the same starting position twice: once with the old briefing format, once with the new. Compare the LLM's decision quality subjectively. The new format should produce decisions that are at least as good, ideally better due to the spatial context and reduced cognitive load.

---

## Phase 7: Res4 Scalability Review (Design Only)

**Goal:** Verify that the map format scales to the tactical level (res4) without architectural changes. No code in this phase — just a design review and documented decisions.

**Why this is separate:** Res4 gameplay is deferred to Phase 3 of the development plan, but the map format should not require a redesign when it arrives. This phase ensures forward compatibility.

### What to Evaluate

1. **Hex count.** A single res1 hex contains ~343 res4 children. The ASCII map for a tactical battle is roughly 20×17 hexes. At 3 characters per cell (2 code chars + 1 space) × 17 columns, each row pair is ~50 characters. 20 rows = 40 lines. This is compact enough for the context window.

2. **Coordinate codes.** With 343 hexes per parent, the existing 2-character alphanumeric scheme (36² = 1,296 codes) covers res4 comfortably. The same `initCoordinateRegistry()` approach works — sort res4 hex centers within the parent res1 hex, assign codes. Codes only need to be stable within a single tactical battle, not globally. The res1 and res4 code spaces are independent — code `A3` at the global level is a different hex than code `A3` within a tactical battle. This remains safe because all lookups are context-bound (`strategic` global registry vs active tactical battle registry) and cross-context lookups must fail fast.

3. **Unit count.** Tactical sub-units (12 infantry sub-units, 6 armor sub-units, etc.) can exceed 26, so single-letter designators on the map won't work — confirming the design decision to use presence markers (`*`, `!`, `#`) rather than unit designators on the map.

4. **Terrain alphabet.** At res4, terrain combat modifiers may apply (mountains slow armor, forests favor infantry defense). The terrain character could expand from binary (`x`/`.`) to a richer set. Choose characters that **do not overlap with overlay characters** (B, A, S, U and their lowercase variants) to avoid visual confusion — e.g., `M` mountains, `F` forest, `D` desert, `W` wetlands, `P` plains, `C` coastal, `R` arctic, `.` water. This is a backward-compatible change — the renderer just maps from a wider enum to a wider character set. No structural change to the 2×2 cell format.

### Deliverable

A short section added to this document (or a separate design note) confirming:
- The 2×2 cell format works at res4 without changes.
- The coordinate scheme scales.
- Any res4-specific rendering decisions (e.g., whether to show terrain type or keep it binary) are documented as deferred decisions with clear criteria for when to revisit.

### Phase 7 review completion (recorded)

Implementation review against the goals above (design-only phase; no new gameplay code required):

- **2×2 cell format at res4:** The shipped renderer (`hex-map-renderer.ts`) keeps the 2×2 code + terrain/overlay layout; tactical consultations use a per-battle res4 registry (`initTacticalCoordinateRegistry` in `hex-coordinates.ts`) so map density stays within the same structural format without a redesign.
- **Coordinate scheme:** Context-bound lookups (`CoordinateContext`: strategic res1 vs tactical res4 + `battleId`) preserve disjoint code spaces; cross-context misuse is rejected at translator/parser boundaries.
- **Unit markers:** Presence markers (`*`, `!`, `#`) remain the chosen approach for crowded tactical unit counts rather than per-unit letters on the grid.
- **Terrain alphabet (deferred):** Binary land/water (`x` / `.`) stays the default until tactical combat modifiers justify a richer terrain symbol set; any expansion must avoid characters already reserved for infrastructure overlays (A/a, S/s, B/b, U/u) and presence markers.

---

## Implementation Notes for the Coding Agent

### Cross-Cutting Implementation Contract (Required)

These constraints are mandatory acceptance criteria for all phases:

1. **Logging policy**
   - Every new or updated public backend method invocation logs at debug level.
   - Every caught exception logs at error level with actionable context.
   - Every new or updated getter-style non-mutating method logs at trace level.
   - Use existing logging APIs directly; do not add redundant level checks unless constructing unusually large inline strings.

2. **Orienting comments**
   - All new and updated fields and non-overriding methods (any visibility/cardinality) include orienting comments.
   - Interface/abstract comments describe contract; implementation comments describe high-level behavior and expectations.

3. **Testing scope**
   - Test happy paths and essential failure contracts only.
   - Avoid tests for boilerplate accessors/DTO plumbing/controller pass-through behavior.
   - Remove tests made unnecessary by these scope rules.

4. **Maintainability constraints**
   - Target source file size under 600 lines (hard limit 1000); decompose before exceeding limits.
   - Target no more than 6 named parameters (hard limit 10); use decomposition or parameter objects when needed.
   - Prefer reusable components/utilities where this does not compromise reliability/performance/UX.

### Dependencies

- **h3-js** (`npm install h3-js`): H3 spatial indexing. Used for `getRes0Indexes()`, `cellToChildren()`, `cellToLatLng()`, `gridDistance()`, and resolution queries. This package should already be in the project.
- No other external dependencies are needed for the map renderer — it produces plain strings.

### Code Organization

All new code goes in a single directory (e.g., `src/ai/briefing/map/`):

```
map/
  hex-coordinates.ts      — Phase 1: coordinate registry
  hex-grid-projection.ts  — Phase 2: grid layout + bounding box
  hex-map-renderer.ts     — Phase 3: ASCII rendering
  briefing-tables.ts      — Phase 4: supporting tables
  hex-code-translator.ts  — Phase 5A: bidirectional code ↔ H3/latlng translation
  tool-wrappers.ts        — Phase 5B: tool interface translation wrappers
  response-parser-v2.ts   — Phase 5D: updated response parser
  briefing-map-section.ts — Phase 6: top-level orchestrator
  __tests__/
    hex-coordinates.test.ts
    hex-grid-projection.test.ts
    hex-map-renderer.test.ts
    briefing-tables.test.ts
    hex-code-translator.test.ts
    tool-wrappers.test.ts
    response-parser.test.ts
    integration.test.ts    — end-to-end: game state → complete map section
    no-latlng-audit.test.ts — regex scan of generated prompt for stale coordinates
```

Note: Phase 5E (prompt content migration) modifies existing prompt template files in place rather than creating new files. The `no-latlng-audit.test.ts` test generates a complete prompt and verifies zero lat/lng or H3 patterns remain.

### Testing Approach

Each phase has its own verification criteria listed above. In addition:

- **Snapshot tests:** For Phases 3 and 4, create a fixed game state fixture (based on the example prompt) and snapshot the rendered output. Any future change to the renderer that changes the output will fail the snapshot, forcing a deliberate review.
- **Token counting:** Add a utility that estimates token count for a string (characters ÷ 4 is a rough approximation; for precision, use `tiktoken` or a similar tokenizer). Use this in the integration test to assert that the map section is smaller than the old format for the same game state.
- **Visual inspection:** The integration test should also write the rendered map to a `.txt` file so a human can visually inspect it. This is not automatable but is critical for catching rendering bugs that are technically correct but visually confusing.

### Error Handling

- If a hex has no game state data (e.g., it's in the bounding box but outside the explored area), render it with terrain only and no overlay features. Do not crash.
- If the coordinate registry is not initialized when `getHexCode()` is called, throw an explicit error rather than returning undefined.
- If the bounding box produces zero hexes (no units on the board — shouldn't happen in practice), return an empty map section with a comment: `"No units on the board — map not rendered."`

### Performance Considerations

The map is rendered once per LLM consultation (not per turn — only on turns where the LLM is consulted). At res1 with ~300 hexes in a typical bounding box, every operation is trivially fast. Do not optimize prematurely. If res4 rendering proves slow (unlikely with 343 hexes), profile first before adding caching.

---

## Summary: Phase Dependencies

```
Phase 1 (Coordinate Registry)
  ↓
Phase 2 (Grid Projection)          — depends on Phase 1 for hex codes
  ↓
Phase 3 (Map Renderer)             — depends on Phase 2 for grid layout
  ↓
Phase 4 (Supporting Tables)        — depends on Phases 1–3 outputs
  ↓
Phase 5A (Translation Layer)       — depends on Phase 1 for registry
  ↓
Phase 5B (Tool Schema Migration)   — depends on Phase 5A
Phase 5C (Response Schema)         — depends on Phase 5A (design only, no code dep)
Phase 5D (Response Parser)         — depends on Phase 5A
Phase 5E (Prompt Content)          — depends on Phase 5A
  ↓
Phase 6 (Integration)              — depends on all prior phases
  ↓
Phase 7 (Res4 Review)              — design only, no code dependency
```

Although some phases are technically parallelizable, this plan must be executed sequentially for maximum reliability with lower-capability agents. Phase 6 remains the integration point. Phase 7 is a review checkpoint with no code output.

**Mandatory execution order (reliability-first):**
1. Phase 1 — Coordinate Registry
2. Phase 2 — Grid Projection (including wrapped-longitude handling)
3. Phase 3 — Map Renderer (including discovery-gated `?` overlay)
4. Phase 4 — Supporting Tables
5. Phase 5A — Translation Layer (context-bound lookups)
6. Phase 5B — Tool Schema Migration
7. Phase 5C — Response Schema Migration
8. Phase 5D — Response Parser Migration (hard cutover, explicit targets)
9. Phase 5E — Prompt Content Migration
10. Phase 6 — Briefing Integration
11. Phase 7 — Res4 Scalability Review (design only)