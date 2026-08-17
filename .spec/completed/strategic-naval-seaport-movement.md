# Strategic naval seaport movement

Land seaports are berths, not canals. Native water and coastal hexes stay fully navigable so ships can follow coastlines at sea. A seaport on land does not turn that hex into water for routing.

## Transit vs occupancy

- **Transit** hexes may appear as intermediate path nodes. A hex is transit when native passability is `water` or `coastal`, or when `terrainKind` is `coastal`. A seaport on a transit hex stays transit.
- **Land seaport** means a seaport on any non-transit hex (`land`, `plains`, `wetlands`, forest, and similar). Naval units may occupy a land seaport. They may not use it as an intermediate node.
- Do **not** promote `seaportCount > 0` to `coastal` for movement, pathfinding, or destination filters.

## Legal naval steps

- Transit → transit: always legal (coastline and open water).
- Transit → land seaport: legal **berth**. This edge may only be the last step of a same-turn path.
- Land seaport → transit: legal **egress**. A unit that starts the turn on a land seaport may take only this one step.
- Stay/hold on a land seaport (`dist === 0`) is legal.
- Land seaport → land seaport is illegal.
- Land seaport → inland land (no seaport) is illegal.
- A land seaport must not shortcut between water bodies.

## Step caps

Do not unify naval step caps as part of this rule. `getValidDestinations` (pending-order validation) keeps `MOVEMENT_RANGE_BY_UNIT_TYPE.naval`. `plan_route` and `check_distance` keep `getMovementBudget('naval')`. Human march preview and assign use `plan_route`, so occupiable water beyond the same-turn cap remains a legal multi-turn standing order. Egress from a land seaport remains one step. Only connectivity changes.

`check_distance`, `assess_unit`, and `plan_route` report the same turn count. `hexDistance` is berth/egress path edges. From a transit origin, turns are `ceil(hexDistance / budget)`. From a land seaport, the first turn is one egress step and later turns use the naval budget: `1 + ceil((hexDistance - 1) / budget)` when `hexDistance > 0` (hold is 0 turns). `plan_route` partitions that way so this turn’s order is still a single egress step.

## Mixed stacks and sealift

- Native coastal hexes remain mixed land+naval destinations.
- Land seaports remain mixed-occupiable (land units occupy land; naval berths). A mixed order is legal only if land units can occupy the hex and the naval unit can berth there this turn.
- If a naval unit occupies a land seaport, embark and debark there like coastal (no extra control check). Water seaports keep the existing controlled-port rule. Sealift occupancy does not make the hex transit.

## Unchanged

- Land-unit movement
- Production and build-queue seaport requirements
- Naval spawn on a land seaport (occupancy)
- Hex control capture by a sole naval occupant
- Tactical res4 naval planner (already blocks land-berth → land-berth)
- Mixed cells whose native classification is already `water`

## AI briefing

Hex `passableBy` for naval lists **transit** only. Do not list inland land seaports as naval-passable. `plan_route` to a land seaport remains the berth API.
