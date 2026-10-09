# Region vs region

The only persisted scenario id in 2.5.0 is `region_vs_region` (`REGION_VS_REGION_SCENARIO_ID` in `src/main/gameDb/scenarioState.ts`). A new match writes the two homes to `scenario_region_human` and `scenario_region_ai`. Combat resolution is unchanged; this page is win evaluation, visibility, and UI.

The engine under `src/` wins if this file drifts.

## Setup

On the Global tab the player picks:

- Human home region
- AI home region
- Game size (caps only — [game-size-unit-caps.md](game-size-unit-caps.md))
- Origin bonus and Terrain bonus dropdowns (Off, Low, or High; both default to Low; rules in [combat-rules-v3.md](combat-rules-v3.md) §4.9, "Origin bonus and terrain bonus")
- Weather bonus dropdown (Off, Low, or High; default Low; rules in [combat-rules-v3.md](combat-rules-v3.md) §4.9, "Weather bonus")
- Tech bonus dropdown (Off, Low, or High; default Low; rules in [combat-rules-v3.md](combat-rules-v3.md) §4.9, "Tech bonus")
- Fog of war (default on), on the same row as the starting month and to its left. The month is a random month whenever the new-game dialog opens, with a square randomize button beside the list.

A global match stores the two home-region names in `scenario_region_human` and `scenario_region_ai`. Those two regions may be the same.

A regional match stores the two side groups' display names in those same keys. The groups must differ. Win evaluation, forced visibility, and the home outlines use those side-group hexes. The strategic hexes are the loaded map's resolution: 1 on the global map, and 2 or 3 on a regional map.

Opening a saved regional match fails when a stored home is not an installed side group's id or display name. The message is "This saved {map} game uses side groups that no longer exist. Start a new game." If that map's urban baseline is not loaded, the regional control win uses every hex.

While the new-game dialog is open, a Global preview frames the world one zoom level closer than the world fit, and a Regional preview frames that region. A Global preview draws the two chosen homes and leaves the strategic hex grid hidden until the player holds T. A Regional preview always draws its strategic hex grid. Weather icons sit on every strategic hex until that hold, and tech icons replace them while it lasts. See [new-game-dialog.md](ux/new-game-dialog.md).

`scenarioId` on the snapshot is always `region_vs_region` for a new match (`fogState` / seeding). There is no second scenario picker in the live overlay.

Global home regions may overlap. Exclusive sets, the intersection, and contested home hexes are computed for prompting by `computeHomeRegionHexPartitionsForPrompting`.

## How you win

Evaluated at end of turn after combat, movement, control, and production (`evaluateRegionControlWinnerAtEndOfTurn` in `src/main/gameActions/regionControlWinner.ts`):

1. **Control.** On the global map you control **every** strategic hex in the **enemy** home, and the enemy does not symmetrically control yours. On a regional map the controlled enemy-home hexes must hold at least 75% of that home's generated urban cells. Bombing does not lower that target. A home with no generated urban cells falls back to every hex. The enemy must not symmetrically meet their own control rule.
2. **Urban elimination.** Tactical urban count summed across the enemy home is **zero**, and your home still has at least one urban cell. If **both** homes are at zero urban, there is no urban-only winner (play continues until a control win or urban returns).

Prompt copy for the AI (`scenarioGoals.ts`) states the same two paths. On a regional map the control sentence is the 75% urban-cell share, and the prompt adds two progress lines: enemy-home urban cells in hexes you control, and your-home urban cells in hexes the enemy controls. The hex-count lines remain territory. On the global map the control sentence is still every enemy home hex.

**Force elimination** (one side has no strategic units left) is a separate game-over path in turn finalize, not this function.

Tactical battles do **not** restate home-region victory. The tactical goal is to engage and defeat forces in the footprint (`buildTacticalBattleGoalClause`).

## Visibility

`getForcedVisibleHomeRegionHexesForPlayer`: your home hexes **and** the intersection stay visible even under fog. Both outlines are drawn on the map. Air and unit vision disks still apply outside that forced set ([combat-rules-v3.md](combat-rules-v3.md) §6).

## Related

- Dice and phases: [combat-rules-v3.md](combat-rules-v3.md) §4 (resolution order, and dice in §4.9); win conditions in §14
- AI briefing objective block: [ai-commander-prompts/strategic-prompt.md](ai-commander-prompts/strategic-prompt.md)
- Hybrid loop: [hybrid-ai.md](hybrid-ai.md)
