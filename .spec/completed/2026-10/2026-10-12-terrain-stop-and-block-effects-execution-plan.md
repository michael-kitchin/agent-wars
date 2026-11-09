# Terrain Stop and Block Effects

## Locked copy

The word in every Effects clause is `Movement`. The clauses are `Armored Movement`, `Infantry Movement`, `Naval Movement`, and `All Movement`. Air does not move through terrain, so it is not added. The existing collapse to `All Movement` and `All Range`, among occupiable units that share a symbol, stays as it is.

- A world hex that is rugged, arctic, or city leads the Effects line with the yellow double-down icon and `Armored Movement`. A battle cell does not gain that clause.
- A legal armor march adds `Urban` for a city hex, `Mountain` for a rugged hex, and `Arctic` for an arctic hex, for every stop hex the route enters, including the destination and excluding the origin. One hex can add more than one word. A group names the union. Weather stays on that same line, after those words. The old planning line `Effects:` plus the red X is removed. A legal march does not also show `Blocked:`.
- Infantry and armor keep the red X on a battle cell they cannot enter. Naval planning names the hovered terrain when the cell is not navigable, including when the Effects line hides that block. Planning says `Blocked:` plus the hovered terrain for those entry blocks. Every other illegal march, including a cell outside the battle, says `Blocked: Unreachable`. The cell a unit already occupies is a legal empty preview.
- Who may enter a hex, movement budgets, and the submit-time armor one-turn gate stay as they are.

## Where it lives

- `doubleDown` in `src/shared/statusIconHtml.ts` points at `static/status/arrow_down_double.svg`. `EFFECT_SYMBOL_KIND` still maps `x` to the single red X.
- `strategicHexEffectsBodyHtml` uses that icon for a world stop hex.
- `armorStopTerrainLabels` maps city to `Urban`, rugged to `Mountain`, and arctic to `Arctic`.
- `plan_route` returns `pathH3Indexes` for the segments the player sees. `redactPlanRouteResult` deletes it.
- `armorMarchStopImpact` walks `pathH3Indexes` after the origin and sets `orderPreviewTerrainImpact`. `slowerTerrainDisplayTitle` stays null on a strategic march.
- `strategicMarchHtml` builds one `Slower:` line from that impact plus weather.
- `tacticalCellBlocksEntry` is true for an infantry or armor movement symbol of `x`, and for naval when the cell is not navigable. A terrain-bonus stop is not a block. An intact road is not a block. A rubbled road on terrain the unit cannot enter is a block.
- `TACTICAL_DESTINATION_BLOCKS_ENTRY_REASON`, `NAVAL_DESTINATION_NOT_OCCUPIABLE_REASON`, and `STRATEGIC_DESTINATION_UNREACHABLE_REASON` live in `src/shared/marchInvalidReasons.ts`.
- `blockingHoverMessageFromMarchInvalidReason` matches those sentences, the land-mass sentence, and the armor-stop sentence before any substring test. The armor-stop sentence says `Blocked: Unreachable`, so the word arctic inside it cannot become `Blocked: Arctic`.

## Out of scope

- `Blocked: Coastal` for a mixed land-and-naval stack, and the two substring branches whose sentences have no live producer.
- Changing who may enter a hex, how far armor moves, or the submit-time check that rejects an armor order outside the one-turn set.
- Per-unit hex popups. A battle cell does not change its X because the selected unit has a terrain bonus.

## Check

`npm test` and `npm run check:circular`.

Manual pass after that:

- Armor from rugged F6 onto rugged FO: `Slower: Mountain`, once.
- Armor whose later hex is a city and whose destination is not: `Slower: Urban`.
- FO hex popup and a Tactical Battles list row: double-down icon and `Armored Movement`.
- Battle, armor hovering a mountain cell: `Blocked: Mountain`.
- Battle, a plains cell out of reach: `Blocked: Unreachable`.
- Strategic land unit on sea: `Blocked: Water`.
- Naval unit on an inland hex: `Blocked:` plus that hex's terrain.
