# Top Bar

The bar across the top of the window. It holds the game menu button, the two sides, four match readouts, the date block, and the Settings and Help buttons. In a battle it becomes the battle header.

## Purpose

Show the match's standing and its date at a glance, without opening a panel, and give one place to reach the game menu. In a battle, show where the fight is and which beat it is.

## Availability

Shown in Strategic planning, Resolution playback, Tactical planning, the tactical battles list, and Tactical annihilation. It is not on screen in New game or Game over, including while the new-game form is hidden, and the map fills the window. It accepts pointer input in Strategic planning, Tactical planning, and Resolution playback. While the tactical battles list or the annihilation dialog is open, it stays visible and does not receive pointer input.

## Information Displayed

From left to right:

- The game menu button. See [game-menu.md](game-menu.md).
- The two sides: a teal mark and the human side's name, "vs", then a rose mark and the opponent's name. A long name ends in an ellipsis. With no match loaded, each name is an em dash.
- Production: `+N` and "/turn". N is the sum of the current urban count of every strategic hex the human player controls, leaving out neutral-border hexes.
- Forces: units the human player has fielded, then "/" and the most this game size allows across the four unit types. The numbers come from `getMaxUnitsPerType` in `src/shared/gameSize.ts`.
- Your home: hexes of the human home region that the human player controls, then "/" and the hexes in that region.
- Enemy home: hexes of the opponent's home region that the human player controls, then "/" and the hexes in that region.
- The date block, on two lines. The first line is the match date, such as "March, Year 1" on the global map or "March 8th, Year 1" on a regional map. The second line is "Turn N · Planning", with the strategic phase. With no match loaded, both lines are an em dash.
- Settings and Help. Both are disabled in this version.
- Below a 1360 px window, the captions Production, Forces, Your home, and Enemy home hide and the numbers stay. Below 1100 px, each side's name is shortened sooner.
- Control tips for the readouts and the buttons are in [control-tooltips.md](control-tooltips.md). The Forces tip lists each unit type against its cap.

While a battle is open, the bar is the battle header. Its face is darker and warmer (`--battle-header-bg`, with a `--battle-header-border` edge), and the sides, the readouts, and the date block are hidden. From left to right:

- The game menu button.
- The title, "Battle at (E8)", naming the battle's world hex by its code (`orderTargetHexCode`), then that hex's caption as the hex tooltip shows it, with flags. The caption ends in an ellipsis when the header is narrow; the title keeps its width.
- Under the title, the status line: "Beat N · Tactical planning" while the player drafts, or "Beat N · Tactical resolution" while a beat resolves or plays back. N is the battle's current beat. A committed beat advances that number before playback, so the resolution line names the next beat. The line then gives the match date (`formatBattleHeaderStatus` in `src/shared/battleHeaderText.ts`), then the battle's weather icon and word when the battle has weather (`formatWeatherIconHtml`, added by `renderBattleHeader`).
- The force bar, centred in the space between the title and Exit Battle: the player's sub-unit count and "yours", the caption "Sub-units in battle", then "enemy" and the opponent's count, over a bar whose teal part is the player's share of both counts (`countBattleForces` in `src/shared/battleForceCounts.ts`). A light edge marks where the teal and rose meet, and it is left off when one side has the whole bar. Every sub-unit counts, including one carried by a ship. A battle has no fog of war, so the enemy count is exact. While a beat plays back, the bar keeps the counts from before the beat and catches up when the playback ends. Below a 1100 px window the bar narrows and the words and the caption hide; the counts and the bar stay.
- Exit Battle, beside Settings. When it is shown, enabled, or hidden is in [tactical-battle-controls.md](tactical-battle-controls.md).
- Settings and Help.

## Inputs and Responses

### Mouse

- When the player clicks the game menu button, the game menu opens or closes. See [game-menu.md](game-menu.md).
- The sides, the readouts, and the date block do not respond to clicks.

### Keyboard

- None for the bar itself. Escape closes the game menu. See [input-map.md](input-map.md).

### Other

- The sides, the readouts, the date block, and the battle header refresh with each game-state snapshot, on tactical entry and exit, after a tactical Ready commit, and when beat playback ends.

## States

- Match loaded: names, readouts, and the date block show the match.
- Battle: the battle header shows in place of the names, readouts, and date block.
- No match: em dashes, and the readout suffixes are empty.
- Pointer input off: the tactical battles list or Tactical annihilation.
- Absent: New game and Game over.

## Invariants

- The sides, the readouts, and the date block are display only. They never change game state.
- The match status and the battle header never show together. The date block always describes the world-map turn.
- The bar's height never changes with the window width; captions and names give way instead.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| What the bar shows | The match status: sides, readouts, and the date block | The battle header: the title, the hex caption, the status line, the force bar, and Exit Battle beside Settings |
| Turn line | "Turn N · Planning" in the date block | "Beat N · Tactical planning" while drafting. While a beat plays back, "Beat N · Tactical resolution", and N is already the next beat. Then the match date and the battle's weather |
| Face | `--chrome-bg-deep` | `--battle-header-bg` |
| Readouts | Strategic snapshot | Hidden; a battle does not change them |

## Related Documents

- [modes-and-transitions.md](modes-and-transitions.md)
- [game-menu.md](game-menu.md)
- [right-panel.md](right-panel.md)
- [control-tooltips.md](control-tooltips.md)
- [tactical-battle-controls.md](tactical-battle-controls.md)
- [home region rules](../region-vs-region.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#app-topbar`, `#game-menu-btn`, `#topbar-human-side`, `#topbar-opponent-side`, `#topbar-stat-production`, `#topbar-stat-production-suffix`, `#topbar-stat-forces-host`, `#topbar-stat-forces`, `#topbar-stat-forces-cap`, `#topbar-stat-human-home`, `#topbar-stat-human-home-total`, `#topbar-stat-opponent-home`, `#topbar-stat-opponent-home-total`, `#topbar-date`, `#topbar-turn-phase`, `#topbar-settings-btn`, `#topbar-help-btn`, `#battle-header-place`, `#battle-header-title`, `#battle-header-caption`, `#battle-header-status`, `#battle-header-center`, `#battle-force-bar`, `#battle-force-human-count`, `#battle-force-opponent-count`, `#battle-force-human-fill`, `#tactical-exit-host`, `#tactical-exit-btn`)
- `static/frameChrome.css`
- `src/renderer/chrome/topBar.ts`
- `src/renderer/chrome/battleHeader.ts` (`renderBattleHeader`)
- `src/renderer/core/uiState.ts` (`updateGameStateSidebar`, `setMainUIControlsEnabled`)
- `src/shared/topBarStats.ts`
- `src/shared/topBarDateBlock.ts`
- `src/shared/battleHeaderText.ts`
- `src/shared/battleForceCounts.ts`
