# assess_unit omniscient grid proximity

When fog of war is off on the strategic (H3 resolution 1) map, `assess_unit` includes every other unit and scores distances and turn estimates with H3 grid hops. Fog-on games, a missing fog flag, and tactical (resolution 4) snapshots keep the path-distance plus radius scan.

**Audience:** Maintainers of Tool 2, strategic precomputation, and Commander briefing copy.

## Gate

Omniscient grid proximity is active only when **both** are true:

1. `fogOfWarEnabled === false` (missing or `true` is not omniscient)
2. `getResolution(h3Index) === 1` for the assessed unit (from `executeAssessUnit`) or a representative hex (`state.hexes[0]` in briefing / precomputation logs)

Tactical plan snapshots always set `fogOfWarEnabled: false` so pathfinding can see everyone in the footprint. Those hexes are resolution 4, so they stay on the path plus radius scan. Do not treat fog-off alone as omniscient.

## Scan when the gate is true

- Include every other living unit (enemies and friendlies). Ignore `radius`, including precomputation’s hardcoded `4`.
- `hexDistance` is unweighted H3 hop count (the same number `gridDistance` would return when it succeeds). Do not run march/sail path BFS.
- Skip a pair when the other unit’s index is not a valid H3 cell, or when neighbor hop search cannot reach it.
- Pentagon-crossing pairs still get a hop count. Do not rely on H3 `gridDistance` alone; it throws on many global res1 pairs.
- Skip stale-intel merge. Living enemies are already on the snapshot.
- Enemy-row `estimatedTurnsToReach` uses the **assessed** unit’s movement budget (how fast you close). Reverse threat ETA uses the **other** unit’s budget (how fast they close).
- If `movementBudget < 1` (air is 0), turns are `null`. Never divide by a sub-1 budget.
- Threat severity: **critical** if they can shoot (`gridDist <= getRange(other)`) or share the hex; else **moderate** if reverse ETA is not null and `<= 2`; else **low**. Null reverse ETA is not moderate via the ETA branch.
- `canAttackThisTurn` lists **in-range rows only** (`gridDist <= getRange(assessed)`). Do not emit `attackType: "none"` for every enemy on the map.
- Nearby lists sort by `hexDistance` ascending. Unit Status still prints only the nearest enemy, not a full roster dump.

## Scan when the gate is false

Path BFS plus the requested radius (default 4). Pentagon pairs that fail `gridDistance` are kept for the path check. Out-of-range enemies inside the radius still get `attackType: "none"` rows. Stale intel may merge when that path allows it.

## Briefing honesty line

When the gate is true, strategic `formatBriefing` inserts this sentence immediately after `## Unit Status and Threats`, then a blank line, then the unit table:

> Nearest-enemy distances and threat ETAs are H3 grid hops (straight hex count), not march or sail paths. Best Options This Turn Target Hexes are this-turn legal dests; use plan_route only for dests not listed for that unit.

The line is absent when fog is on, the fog flag is missing, or hexes are not resolution 1.

## Unchanged tools and surfaces

- `plan_route` and `check_distance` remain path-based. Briefing `@ N` can disagree with those tools; the honesty line is the mitigation.
- Best Options this-turn move/melee stay legal reachability this turn. Do not list unreachable global hexes.
- Combat range math, air-strike envelopes, standing-order auto-fire, and `assess_hex` are unchanged.
- Lightweight tactical assessments already use grid over the battle; tactical Tool 2 stays stripped.

## Expected side effects

- Fog-off strategic Unit Status fills nearest-enemy for stacks farther than radius 4 or with no land path.
- Reverse grid ETA `<= 2` is moderate even across water. Coastal stacks near raiders may light attention; transoceanic stacks at grid 10+ stay low if standing orders are healthy.
