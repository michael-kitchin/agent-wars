# Region vs region

The only persisted scenario id in 2.4.0 is `region_vs_region` (`REGION_VS_REGION_SCENARIO_ID` in `src/main/gameDb/scenarioState.ts`). New-game home-region selectors write `scenario_region_human` and `scenario_region_ai`. Combat resolution is unchanged; this page is win evaluation, visibility, and UI.

The engine under `src/` wins if this file drifts.

## Setup

On New game the player picks:

- Human home region
- AI home region
- Game size (caps only — [game-size-unit-caps.md](game-size-unit-caps.md))
- Fog of war (default on)

`scenarioId` on the snapshot is always `region_vs_region` for a new match (`fogState` / seeding). There is no second scenario picker in the live overlay.

Home regions may overlap. Exclusive sets, the intersection, and contested home hexes are computed for prompting by `computeHomeRegionHexPartitionsForPrompting`.

## How you win

Evaluated at end of turn after combat, movement, control, and production (`evaluateRegionControlWinnerAtEndOfTurn` in `src/main/gameActions/regionControlWinner.ts`):

1. **Control.** You control **every** res1 hex in the **enemy** home region, and the enemy does not symmetrically control yours.
2. **Urban elimination.** Urban count summed across the enemy home region is **zero**, and your home region still has at least one urban hex. If **both** homes are at zero urban, there is no urban-only winner (play continues until a control win or urban returns).

Prompt copy for the AI (`scenarioGoals.ts`) states the same two paths: controlling all hexes intersecting the enemy home region, or eliminating all res4 urban production there.

**Force elimination** (one side has no strategic units left) is a separate game-over path in turn finalize, not this function.

Tactical battles do **not** restate home-region victory. The tactical goal is to engage and defeat forces in the footprint (`buildTacticalBattleGoalClause`).

## Visibility

`getForcedVisibleHomeRegionHexesForPlayer`: your home hexes **and** the intersection stay visible even under fog. Both outlines are drawn on the map. Air and unit vision disks still apply outside that forced set ([combat-rules-v3.md](combat-rules-v3.md) §6).

## Related

- Dice and phases: [combat-rules-v3.md](combat-rules-v3.md) §14
- AI briefing objective block: [ai-commander-prompts/strategic-prompt.md](ai-commander-prompts/strategic-prompt.md)
- Hybrid loop: [hybrid-ai.md](hybrid-ai.md)
