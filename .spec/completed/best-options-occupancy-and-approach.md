# Best Options occupancy and approach (strategic + tactical)

Keeps the Commander **Best Options This Turn** table from recommending own stacks as combat targets, and offers approach hexes when no enemy is in this-turn reach (empty-city capture does not suppress that).

Interest and approach live in `src/main/openrouter/possibleUnitActionsBestOptionsInterest.ts`; `collectAggregatedPossibleActionRows` in `possibleUnitActions.ts` still collects legal dests and builds rows.

**Audience:** Maintainers of possible-actions / operational-map briefing tables.  
Do not copy this document’s internal labels into product code, comments, configuration, or other version-controlled artifacts.

---

## Locked decisions

1. Interest shape is still enemy-occupied ∪ interesting infrastructure (`keepsBestOptionsThisTurnInterestHex`).
2. Interesting infrastructure requires **uncontrolled** cells and **no friendly occupants**. Contested hexes (friendly + enemy) stay via the enemy-occupied signal.
3. Strategic ranged rows remain enemy-occupied only. Tactical ranged Best Options lists **human-occupied** cells only (legal infra-only shots stay valid outside the table). Tactical Target Infrastructure uses res4 urban/airport/seaport flags, not strategic res1 maps.
4. When interest is empty **or infra-only** (no enemy in this-turn dests), both modes keep this-turn-legal move hexes that strictly reduce H3 grid distance to the nearest observed enemy. Those rows use the `approach` action label and list nearest enemy unit ids in Target Units. Approach may include a friendly-occupied hex if it shortens that distance (stacking while closing). When ranking the per-unit top-5, approach rows ignore urban/infra counts so closer empty hexes are not crowded out by those cities.
5. Empty uncontrolled cities remain move/melee capture options when approach cannot run (no observed enemy, or no dest that closes). Adjacent enemy hexes remain move/melee, not approach.

## Out of scope

- Changing ranged-attack validation or legal-target collectors.
- Changing `plan_route` / land-mass pathfinding.
