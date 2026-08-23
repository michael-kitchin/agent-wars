# Suggested destinations for units without standing orders

Strategic `## Units Without Standing Orders` must offer every unit it lists a destination it can actually be sent to.

**Audience:** Maintainers of `getInjectionText`, `orderlessUnitSuggestions`, and the Best Options approach filter.

## The failure this prevents

The table used to name only the unit id and its type. The prompt asks the model to assign an order to every unit listed
there, but the destination had to be found by joining that table against Unit Status and Best Options by unit id, across
a prompt well over 100 KB. Weaker models skipped the join and marched the unit to its own hex, which `assignOrder` drops
as already arrived. The unit was then orderless again on the next turn, so the same no-op repeated forever and the unit
never moved. Newly produced units are the most exposed, because they start with no order and no threat nearby.

## Rule

Every listed unit that can take a march order gets a `Suggested Destination`, chosen so that it:

- is a legal, unoccupied, one-step destination for that unit this turn
- strictly reduces hop distance to the nearest enemy-occupied hex
- is never the unit's own hex

Units that cannot be given a useful destination render an em dash rather than a fabricated one. That covers air units
(which reposition by ferry and are refused march orders outright), units with no legal unoccupied step, and units with
no enemy they can measurably close on.

## Consistency with Best Options

The suggestion and the Best Options approach rows must be drawn from one definition of "closes on the enemy", because
the prompt presents Best Options Target Hexes as the authority on what is legal this turn. A suggestion that Best
Options does not also list would make the model distrust both tables. Both therefore call
`pickApproachHexesTowardNearestEnemy`, over the same enemy set derived from the snapshot.

Where Best Options lists every closing hex, the column has room for one. Pick the candidate with the smallest hop
distance to the nearest enemy, breaking ties by hex id so the briefing does not churn between equivalent hexes.

## Cost

The suggestion pass runs a destination search per distinct unit hex and type, so call it only for the ids being listed
as orderless — never for the whole roster. `getValidDestinations` caches by origin and type, so stacked same-type units
share one search.

## Prompt copy

The standing-orders guidance must point at the column, tell the model it may override the suggestion, and keep the
warning that marching to the current hex is dropped. It must not imply the suggestion is binding; choosing the
destination remains the model's call.
