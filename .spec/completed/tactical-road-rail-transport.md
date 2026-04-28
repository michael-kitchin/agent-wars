# Tactical road and rail (res4)

## Movement

- Bundled `roadSides` / `railSides` masks (same clockwise slot order as `gridDisk(cell, 1)` without the origin) classify **edges** to ring-1 neighbors.
- A land step `from → to` may use **transport** when `tacticalRes4TransportEdgeActive` is true: the **from** cell’s `roadSides`/`railSides` must mark the slot for that step (head-only; neighbor masks do not help), the arrays must match the `gridDisk(from,1)` ring length, and **neither** endpoint is rubble.
- When transport applies, enter **movement points** are a **base transport cost** divided by a **line speed multiplier**:
  - **Open terrain (non-blocking destination):** base = §12.4 **plains** enter cost for the unit type.
  - **Blocking destination** (e.g. armor → mountain, infantry → water): base = **1** MP (infantry) or **2** MPs (armor), matching a “two hexes per full baseline budget” pace on that hex.
  - **Road** along the traversed edge: divide by **2.0** (effective 2× movement budget on that step).
  - **Rail** along the traversed edge: divide by **3.0**.
  - If **both** `roadSides` and `railSides` mark the same edge on the **from** cell, **rail** wins (more favorable to the unit).
- MPs may be fractional after division; march truncation and reachability compare the running sum to the integer per-leg budget.
- **First-stop floor (`planTacticalRes4March`):** If the cheapest path has length ≥ 2 but strict truncation would spend **0** MPs on the first turn (the first step cost alone exceeds `movementPointBudget`) while the budget is **positive**, the applied first stop is still the **first cell after the origin** on that path so Ready never records a zero-hex leg for a valid order.
- **Blocking corridors (mountain / water, etc.):** after reciprocal boundary masks, a **transit** step onto a blocking non-goal cell is allowed when the **blocking** cell has a through-corridor witness (marked entry from the approach cell and marked exit toward some other footprint neighbor). The approach cell does **not** need dual transport masks toward the previous off-road hex—only the shared `from → blocking` boundary must be reciprocal, matching how the march treats the first leg from an adjacent approach.
- **Spawn:** Land units may start on an otherwise blocked cell only if it shares an active transport edge with another **footprint** cell (bridge / causeway), using the same predicate.

## Ranged and rubble

- Cells with any active non-rubble road or rail side count as **strikeable infrastructure** for tactical ranged validation and AI legal-target lists (alongside urban / airport / seaport from snapshot or DB rows).
- Defender elimination or a successful infra-only ranged hit on such a cell triggers **rubble** persistence: `UPDATE` when a `res4_feature_overrides` row already exists; **`INSERT`** (rubble-only row, merged `terrain_kind`, facilities false) when the cell had transport masks but no prior row.

## Cache and refresh

- `tacticalTerrainLayerSignature` includes a compact `tr:` fingerprint of footprint transport masks so march memo keys invalidate when overlays change.
- `refreshTacticalBattleRes4TerrainFromGameDb` rebuilds transport snapshot fields from the classification cache so renderer-aligned masks stay available after DB terrain mutations.
