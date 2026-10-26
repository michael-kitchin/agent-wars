# Top Bar

The bar across the top of the window. It holds the game menu button, the sides, the match readouts, the date block, and the Settings and Help buttons. In a battle it becomes the battle header, and on the new-game screen it becomes the new-game bar.

## Purpose

Show the match's standing and its date at a glance, without opening a panel, and give one place to reach the game menu. In a battle, show where the fight is and which beat it is.

## Availability

Shown in every mode. In New game and Game over it is the new-game bar, including while the new-game choices are hidden. It accepts pointer input in Strategic planning, Tactical planning, Resolution playback, New game, and Game over. While the tactical battles list or the annihilation dialog is open, it stays visible and does not receive pointer input.

## Information Displayed

From left to right:

- The game menu button. See [game-menu.md](game-menu.md).
- The sides. With a human seat playing: that seat's dot and full home name, "vs", then one chip per other seat in seat order. Each chip has its seat dot and short name (`shortSideName`). That short name is the full home name cut at the first ` & `, `, `, or ` and `, with a leading compass word shortened to its initial and a period: `Western Turkey` is `W. Turkey`. When the cut name is only single-letter words, or the cut leaves an unclosed parenthesis, the chip uses the letter form of the full name instead: `South & east China, Taiwan` is `SECT`, and `Tasman (Victoria, Tasmania, NZ)` is `TVTNZ`. When that letter form is still one letter, the chip keeps the full name: `East`. A short form longer than the full name is not used. A trailing abbreviation in parentheses, such as ` (SECT)`, is not part of the short name. The full home name of a side whose short name is a letter form ends with that letter form in parentheses, such as `South & east China, Taiwan (SECT)` or `Tasman (Victoria, Tasmania, NZ) (TVTNZ)`. `East` does not. A match saved before that parenthesis was stored still shows the saved spelling as its full name, and its chip still uses the letter form. A commander that is planning shows an arc in the seat's text color, labeled "Planning". A commander with orders ready shows a check in `#86EFAC`, labeled "Orders ready". No model and a timed-out consult show no icon. A knocked-out seat's dot is dimmed, its name is struck through, and the chip reads "out T{N}". While observing, the block is an eye and the word "Observing", then one chip per seat. With no match loaded, the two name slots are em dashes. A long name ends in an ellipsis.
- View as, only while observing. The label is "View as". The select offers "All sides, no fog", then each seat's full home name in seat order. A knocked-out seat's entry is disabled. The closed select shows that seat's dot. All sides keeps the Observing chips and the null-viewer readouts. A seat shows that seat's fog, and the readouts below use that seat. The chip row stays "Observing".
- Production: `+N` and "/turn". N is the sum of the current urban count of every strategic hex the side you are watching controls, leaving out neutral-border hexes. That side is the active human seat, or the seat chosen in View as. While View as is All sides, Production is zero.
- Forces: units that side has fielded, then "/" and the most this game size allows across the four unit types. The numbers come from `getMaxUnitsPerType` in `src/shared/gameSize.ts`. While View as is All sides, Forces is zero.
- Your home: hexes of your home that you hold, then "/" and the hexes in that home. Hidden while View as is All sides. Shown for the seat chosen in View as.
- Enemy homes: hexes of every active enemy home that you hold, then "/" and the hexes in those homes. A knocked-out side's home is left out of both numbers. Hidden while View as is All sides, hidden for a seat in a match that ends on a turn limit, and hidden while a human seat is playing a turn-limit match.
- Cities, only in a match that ends on a turn limit: "{n} · {place} of {seats}". n is the city hexes you hold. place comes from `rankSeatsByCityHexes` over the active seats, and two sides with the same count share a place. The tip lists every active seat's city hexes, highest first, and marks yours with "(you)". While View as is All sides, the readout stays, with no number and no "(you)". While View as is a seat, n is that seat's city hexes and the tip marks that seat with "(you)".
- The date block, on two lines. The first line is the match date, such as "March, Year 1" on the global map or "March 8th, Year 1" on a regional map. The second line is "Turn N · Planning", or "Turn N of L · Planning" when the match has a turn limit. With no match loaded, both lines are an em dash.
- Settings and Help. Both are disabled in this version.
- Below a 1360 px window, the captions Production, Forces, Your home, Enemy homes, and Cities hide and the numbers stay. Below 1100 px, each side's name is shortened sooner.
- Control tips for the readouts and the buttons are in [control-tooltips.md](control-tooltips.md). The Forces tip lists each unit type against its cap.

While a battle is open, the bar is the battle header. Its face is darker and warmer (`--battle-header-bg`, with a `--battle-header-border` edge), and the sides, the readouts, and the date block are hidden. From left to right:

- The game menu button.
- The title, "Battle at (E8)", naming the battle's world hex by its code (`orderTargetHexCode`), then that hex's caption as the hex tooltip shows it, with flags. The caption ends in an ellipsis when the header is narrow; the title keeps its width.
- Under the title, the status line: "Beat N · Tactical planning" while the player drafts, or "Beat N · Tactical resolution" while a beat resolves or plays back. N is the battle's current beat. A committed beat advances that number before playback, so the resolution line names the next beat. The line then gives the match date (`formatBattleHeaderStatus` in `src/shared/battleHeaderText.ts`), then the battle's weather icon and word when the battle has weather (`formatWeatherIconHtml`, added by `renderBattleHeader`).
- The force bar, centred in the space between the title and Exit Battle: the player's sub-unit count and "yours", the caption "Sub-units in battle", then the opposing party's dot, short name (or "Neutral"), and that party's sub-unit count, over a bar whose two colors are the human seat's and the opposing party's `forceBar` colors (`countBattleForces` in `src/shared/battleForceCounts.ts`, `paletteForOwner` in `src/shared/seatPalette.ts`). A light edge marks where the colors meet, and it is left off when one side has the whole bar. The count is the human seat versus that one party, including a sub-unit carried by a ship. A battle has no fog of war, so the enemy count is exact. Against Neutral, the status line ends "· The garrison defends in place". While a beat plays back, the bar keeps the counts from before the beat and catches up when the playback ends. Below a 1100 px window the bar narrows and the words and the caption hide; the counts, the dot, and the bar stay.
- Exit Battle, beside Settings. When it is shown, enabled, or hidden is in [tactical-battle-controls.md](tactical-battle-controls.md).
- Settings and Help.

While the new-game overlay is open, in New game and Game over, the bar is the new-game bar, on the usual face. The sides, the readouts, the date block, and the battle header are hidden, even when the overlay was opened from a battle. The overlay's own visibility switches the bar, so it follows every way the overlay opens or closes. From left to right:

- The game menu button. The menu works there, with New game… disabled. See [game-menu.md](game-menu.md).
- The title "New game", also on the game-over screen.
- Load game…, with a folder icon, disabled in this version.
- Settings and Help.

## Inputs and Responses

### Mouse

- When the player clicks the game menu button, the game menu opens or closes. See [game-menu.md](game-menu.md).
- The sides, the readouts, and the date block do not respond to clicks. View as changes which fog is drawn. It does not change the match.

### Keyboard

- None for the bar itself. Escape closes the game menu. See [input-map.md](input-map.md).

### Other

- The sides, the readouts, the date block, and the battle header refresh with each game-state snapshot, on tactical entry and exit, after a tactical Ready commit, and when beat playback ends. The side chips also refresh when a commander's status changes.

## States

- Match loaded: names, readouts, and the date block show the match.
- Battle: the battle header shows in place of the names, readouts, and date block.
- No match: em dashes, and the readout suffixes are empty. The new-game bar covers this case while the new-game overlay is open.
- New game bar: New game and Game over.
- Pointer input off: the tactical battles list or Tactical annihilation.

## Invariants

- The sides, the readouts, and the date block never change the match. View as changes only which snapshot is drawn.
- The match status, the battle header, and the new-game bar never show together. The date block always describes the world-map turn.
- The bar's height never changes with the window width; captions and names give way instead.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| What the bar shows | The match status: sides, readouts, and the date block | The battle header: the title, the hex caption, the status line, the force bar, and Exit Battle beside Settings |
| Turn line | "Turn N · Planning" in the date block, or "Turn N of L · Planning" when the match has a turn limit | "Beat N · Tactical planning" while drafting. While a beat plays back, "Beat N · Tactical resolution", and N is already the next beat. Then the match date and the battle's weather |
| Face | `--chrome-bg-deep` | `--battle-header-bg` |
| Readouts | Strategic snapshot | Hidden; a battle does not change them |

## Related Documents

- [modes-and-transitions.md](modes-and-transitions.md)
- [game-menu.md](game-menu.md)
- [console.md](console.md)
- [control-tooltips.md](control-tooltips.md)
- [tactical-battle-controls.md](tactical-battle-controls.md)
- [home region rules](../region-vs-region.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#app-topbar`, `#game-menu-btn`, `#topbar-sides`, `#topbar-human-side`, `#topbar-second-side`, `#topbar-stat-production`, `#topbar-stat-production-suffix`, `#topbar-stat-forces-host`, `#topbar-stat-forces`, `#topbar-stat-forces-cap`, `#topbar-stat-human-home-host`, `#topbar-stat-human-home`, `#topbar-stat-human-home-total`, `#topbar-stat-enemy-home-host`, `#topbar-stat-enemy-home`, `#topbar-stat-enemy-home-total`, `#topbar-stat-cities-host`, `#topbar-stat-cities`, `#topbar-date`, `#topbar-turn-phase`, `#topbar-settings-btn`, `#topbar-help-btn`, `#topbar-new-game-title`, `#topbar-load-btn`, `#battle-header-place`, `#battle-header-title`, `#battle-header-caption`, `#battle-header-status`, `#battle-header-center`, `#battle-force-bar`, `#battle-force-human-count`, `#battle-force-enemy-count`, `#battle-force-human-fill`, `#tactical-exit-host`, `#tactical-exit-btn`)
- `static/frameChrome.css`
- `static/newGameChrome.css`
- `src/renderer/chrome/topBar.ts`
- `src/renderer/chrome/battleHeader.ts` (`renderBattleHeader`)
- `src/renderer/core/uiState.ts` (`updateGameStateSidebar`, `setMainUIControlsEnabled`)
- `src/shared/topBarStats.ts`
- `src/shared/topBarSides.ts` (`buildTopBarSideChips`)
- `src/shared/shortSideName.ts` (`shortSideName`, `sideHomeNameKey`)
- `src/shared/topBarDateBlock.ts`
- `src/shared/victoryRules.ts` (`rankSeatsByCityHexes`)
- `src/shared/battleHeaderText.ts`
- `src/shared/battleForceCounts.ts`
