# Region vs region

The only persisted scenario id in 2.5.0 is `region_vs_region` (`REGION_VS_REGION_SCENARIO_ID` in `src/main/gameDb/scenarioState.ts`). A new match writes that id and stores each home on a row of the `seats` table (`readSeatRoster` in `src/main/gameDb/seatRosterStore.ts`). Combat resolution is unchanged; this page is win evaluation, visibility, and UI.

The engine under `src/` wins if this file drifts.

## Setup

The player picks two to four sides in the Sides section (`buildSeatsPayload` in `src/shared/newGameSides.ts`). Each side needs a home, and two sides cannot share one (`startBlockedReason`). Observe only leaves every side to an AI commander.

On the Global tab each row stores a home-region name on its `seats` row.

On the Regional tab the player picks one region, and each row stores a different side group's display name.

In the Forces section the player picks:

- Game size (caps only — [game-size-unit-caps.md](game-size-unit-caps.md))

In the Rules section the player picks:

- Origin bonus and Terrain bonus dropdowns (Off, Default, or High; both start at Default; rules in [combat-rules-v3.md](combat-rules-v3.md) §4.9, "Origin bonus and terrain bonus")
- Weather bonus dropdown (Off, Default, or High; starts at Default; rules in [combat-rules-v3.md](combat-rules-v3.md) §4.9, "Weather bonus")
- Tech bonus dropdown (Off, Default, or High; starts at Default; rules in [combat-rules-v3.md](combat-rules-v3.md) §4.9, "Tech bonus")
- Fog of war (default on), on the line after the starting month, with Auto-start AI to its right. Auto-start AI is checked when the dialog opens. What it does when the match starts is in [new-game-dialog.md](ux/new-game-dialog.md). The month is a random month whenever the new-game dialog opens, with a square randomize button beside the list. The engine does not store Auto-start AI.

A global match stores one home-region name on each `seats` row. A regional match stores that side group's display name on the row. A display name whose short name is a letter form ends with that letter form in parentheses, such as `South & east China, Taiwan (SECT)`. `East` does not. The short-name rule is in [ux/top-bar.md](ux/top-bar.md). Win evaluation, forced visibility, and the home outlines use the hexes of the stored home. The strategic hexes are the loaded map's resolution: 1 on the global map, and 2 or 3 on a regional map.

`getScenarioHomeRegionHexes` in `src/main/regionScenario.ts` resolves a stored home to an installed side group when the trimmed stored string is that group's id, or when `sideHomeNameKey` of the stored string equals `sideHomeNameKey` of that group's display name. `sideHomeNameKey` in `src/shared/shortSideName.ts` trims the string and removes one trailing abbreviation parenthesis, ` (LETTERS)`, whose letters are two or more capitals. A parenthesis that contains a comma, a space, or a lowercase letter stays. `Tasman (Victoria, Tasmania, NZ)` matches `Tasman (Victoria, Tasmania, NZ) (TVTNZ)`. `Tasman` matches neither. After that group lookup misses, the global naming cache is read with the trimmed stored string. Opening a saved regional match fails when a stored home matches neither an installed id nor a display name under that key (`assertStoredSideGroupsExist` in `src/main/gameDb.ts`). The message is "This saved {map} game uses side groups that no longer exist. Start a new game." If that map's urban baseline is not loaded, the regional control win uses every hex.

While the new-game dialog is open, a Global preview frames the world one zoom level closer than the world fit, and a Regional preview frames that region. A Global preview draws every chosen home and leaves the strategic hex grid hidden until the player holds T. A Regional preview always draws its strategic hex grid. Weather icons sit on every strategic hex, and tech icons sit beside them while that hold lasts. See [new-game-dialog.md](ux/new-game-dialog.md).

`scenarioId` on the snapshot is always `region_vs_region` for a new match (`fogState` / seeding). There is no second scenario picker in the live overlay.

Global home regions may overlap. Exclusive sets, the intersection, and contested home hexes are computed for prompting by `computeHomeRegionHexPartitionsForPrompting`.

## How you win

Evaluated at end of turn after combat, movement, control, and production (`decideEndOfTurnOutcome` in `src/main/gameActions/endOfTurnOutcomeRules.ts`). The same rules apply to a two-sided match. An active seat is knocked out when any of these hold, and every reason that holds is stored:

1. **Home control.** Another active seat meets the control rule against this seat's home. On the global map that is every strategic hex of the home. On a regional map the held hexes must contain at least 75% of that home's generated urban cells. Bombing does not lower that target. A home with no generated urban cells falls back to every hex.
2. **No city hexes.** The seat controls no strategic hex whose current urban count is greater than zero.
3. **Home cities destroyed.** The current urban sum of the seat's own home is zero.

When those knockouts would leave no active seat, none are recorded. The seats are ranked by city hexes and the match ends. Ties share a place. Several seats in first place leave no single winner. A Most city hexes match also ends at its stored turn limit and ranks the seats still active the same way. Deathmatch, on either map, has no turn limit.

The goal sentence (`buildWinConditionReminderClause` in `scenarioGoals.ts`) states last side standing, the three knockout conditions, the mutual-wipe sentence, and, when the stored rule is `most_city_hexes_at_turn_limit`, the turn limit. Deathmatch omits that sentence. The Scenario Objective block still lists two paths: controlling the enemy home, and eliminating that home's urban production. On a regional map the control sentence is the 75% urban-cell share. One progress line per enemy follows: that home's urban cells in hexes you control. A second line, your home urban cells in hexes that enemy controls, is included only when that enemy holds any. On the global map the control sentence is every enemy home hex. The hex-count lines in the coaching block remain territory.

Losing every strategic unit does not by itself end the match. `finalizeReadyTurnAfterMelee` in `src/main/gameActions/meleeInterceptReadyFinalize.ts` records the outcome from `evaluateEndOfTurnOutcome`, so a side with no units left keeps playing and can still build until a knockout or the turn limit.

Tactical battles do **not** restate home-region victory. The tactical goal is to engage and defeat forces in the footprint (`buildTacticalBattleGoalClause`).

## Visibility

`getForcedVisibleHomeRegionHexesForPlayer`: that seat's home hexes and every hex in more than one home stay visible even under fog. Every home outline is drawn on the map. Air and unit vision disks still apply outside that forced set ([combat-rules-v3.md](combat-rules-v3.md) §6).

## Related

- Dice and phases: [combat-rules-v3.md](combat-rules-v3.md) §4 (resolution order, and dice in §4.9); win conditions in §14
- AI briefing objective block: [ai-commander-prompts/strategic-prompt.md](ai-commander-prompts/strategic-prompt.md)
- Hybrid loop: [hybrid-ai.md](hybrid-ai.md)
