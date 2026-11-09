# Strategic/tactical prompt disparity fixes

## Decisions (locked)
1. Permanently strip Tool 2/3 (`assess_*` / `estimate_combat`) from every tactical AI pass.
2. Attention Flags: severity-sort then cap **5** (strategic + tactical).
3. Best Options approach rows: Action = `approach` and Target Units = nearest enemy unit id(s).
4. Tactical opener: drop regional win-condition text; use local “engage and defeat enemy forces in this battle.”

## Also applied
- Strategic turn / tactical beat header labeling.
- Naval `plan_route` suffix only when opponent has naval.
- Air/ferry JSON contract/example only when opponent has air.
- Tactical map legend drops unused `?` fog token.
- `infrastructure_destroyed` callback line formatted without empty `{}`.
