# Tactical Battles List

The dialog that lists melee hexes after Ready, where the player chooses Fight or Ignore.

## Purpose

Let the player pick one contested hex to fight as a tactical battle, or ignore melee for the turn.

## Availability

Opens in the Tactical battles list mode, after Ready reports at least one battle the player can fight, and Offer tactical battles is checked in the game menu. A match with no human seat still playing does not open it. A contested hex the human can see is listed even when it cannot be fought: three sides, or two sides that do not include the human. Those resolve on the world map. A dimmed backdrop covers the window, and the panel is centered on the visible map area (not on the map plus the console). The panel follows the map area when the window resizes. On a small map area the panel shrinks to fit, and a long list scrolls inside it. The map, the top bar, the console, and the selection panel stay visible underneath and do not receive pointer input. Markers that were already on the map are not refreshed until the dialog closes. When that checkbox is unchecked, the dialog does not open and the turn continues as Ignore. See [modes-and-transitions.md](modes-and-transitions.md) and [game-menu.md](game-menu.md).

## Information Displayed

- A navy panel, using the chrome in the [UI style guide](../ui-style-guide.md), titled "Tactical Battles (N)", where N is the number of battles the player can fight. Under the title: "Choose one battle to fight. The others resolve on the world map."
- One choice row per eligible hex. The columns are Hex, Yours, and Enemy. The hex cell is the world-hex tooltip, in the same line order as [hex-tooltips.md](hex-tooltips.md): the hex code and place name, a country flag before each country name, then Control, Production, Tech, Features, Terrain, Weather, and Effects. A legend chip comes before each terrain kind. A line that does not apply is left out. The cell shows the hex code while that tooltip loads. Yours is the human seat's unit summary. Enemy is that party's dot and short name, or "Neutral" with the Neutral dot, and its unit summary. A Neutral summary ends ", defends in place". An empty summary shows an em dash.
- Below the choice rows, when any contested hex cannot be fought: "Resolve on the world map this turn", then each such hex. A hex with the human seat and two other sides reads "Three sides: you, {A}, {B}". A hex with two sides reads "{A} vs {B}". Each name has that side's dot.
- Fight, disabled until a row is chosen.
- Ignore.
- Control tips for Fight and Ignore are in [control-tooltips.md](control-tooltips.md).

## Inputs and Responses

### Mouse

- When the player chooses a row, Fight becomes enabled. Only one row is chosen.
- When the player clicks Fight, the dialog closes, the strategic turn finishes, and a tactical battle starts on that hex.
- When the player clicks Ignore, or clicks the dimmed backdrop, the dialog closes and melee resolves without a battle.
- When the hex information for a row fails to load, the cell keeps the hex code it showed while loading.

### Keyboard

- When the player presses Escape, the dialog closes as Ignore. That keypress does nothing else: a build popup or stack callout under the dialog stays as it is. See [input-map.md](input-map.md).

### Other

- None.

## States

- Closed: not waiting on a melee choice.
- Open, no row chosen: Fight is disabled.
- Open, row chosen: Fight is enabled.

## Invariants

- Fight never starts a battle without a chosen row.
- Ignore never starts a tactical battle.
- The dialog never opens while Offer tactical battles is unchecked.
- Escape on this dialog never closes another popup.

## Strategic and Tactical Differences

The dialog is a strategic Ready step. Fight is what enters Tactical planning. The battle itself is specified in [tactical-battle-controls.md](tactical-battle-controls.md) and [map-surface.md](map-surface.md).

## Related Documents

- [modes-and-transitions.md](modes-and-transitions.md)
- [hex-tooltips.md](hex-tooltips.md)
- [opponent-tab-commander.md](opponent-tab-commander.md)
- [tactical-entry-markers.md](tactical-entry-markers.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `src/renderer/gameplay/meleeInterceptModal.ts`
- `src/renderer/gameplay/meleeInterceptHexTooltip.ts`
- `src/renderer/gameplay/readyHandler.ts`
- `src/renderer/gameplay/readyTacticalCommit.ts`
- `src/renderer/gameplay/tacticalBattlePromptPreference.ts`
- `src/renderer/map/visibleMapFrame.ts`
- `static/overlayChrome.css` (`.melee-intercept-*`)
