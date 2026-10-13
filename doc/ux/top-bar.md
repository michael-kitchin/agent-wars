# Top Bar

The bar across the top of the window. It holds the two sides, the date block, and the Settings and Help buttons.

## Purpose

Show who is fighting and the match's date at a glance, without opening a panel.

## Availability

Shown in Strategic planning, Resolution playback, Tactical planning, the tactical battles list, and Tactical annihilation. It is not on screen in New game or Game over, including while the new-game form is hidden, and the map fills the window. It accepts pointer input in Strategic planning, Tactical planning, and Resolution playback. While the tactical battles list or the annihilation dialog is open, it stays visible and does not receive pointer input.

## Information Displayed

From left to right:

- The two sides: a teal mark and the human side's name, "vs", then a rose mark and the opponent's name. A long name ends in an ellipsis. With no match loaded, each name is an em dash.
- The date block, on two lines. The first line is the match date, such as "March, Year 1" on the global map or "March 8th, Year 1" on a regional map. The second line is "Turn N · Planning" outside a battle. In a battle it is "Beat N · Tactical planning" while the player drafts and "Beat N · Tactical resolution" while a beat resolves or plays back, and the first line ends with the battle's weather icon and word when the weather bonus is on. With no match loaded, both lines are an em dash.
- Settings and Help. Both are disabled in this version.
- Below a 1100 px window, each side's name is shortened sooner.
- Control tips for the buttons are in [control-tooltips.md](control-tooltips.md).

## Inputs and Responses

### Mouse

- The sides and the date block do not respond to clicks.

### Keyboard

- None.

### Other

- The sides and the date block refresh with each game-state snapshot, on tactical entry and exit, after a tactical Ready commit, and when beat playback ends.

## States

- Match loaded: the names and the date block show the match.
- No match: em dashes.
- Pointer input off: the tactical battles list or Tactical annihilation.
- Absent: New game and Game over.

## Invariants

- The sides and the date block are display only. They never change game state.
- During a battle, the two date-block lines never describe different theaters.
- The bar's height never changes with the window width; names give way instead.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| Second date-block line | Strategic turn and phase | Battle beat and tactical phase |
| First date-block line | Match date | Match date, then the battle's weather when the weather bonus is on |

## Related Documents

- [modes-and-transitions.md](modes-and-transitions.md)
- [right-panel.md](right-panel.md)
- [control-tooltips.md](control-tooltips.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#app-topbar`, `#topbar-human-side`, `#topbar-opponent-side`, `#topbar-date`, `#topbar-turn-phase`, `#topbar-settings-btn`, `#topbar-help-btn`)
- `static/frameChrome.css`
- `src/renderer/chrome/topBar.ts`
- `src/renderer/core/uiState.ts` (`updateGameStateSidebar`, `setMainUIControlsEnabled`)
- `src/shared/topBarDateBlock.ts`
