# Charts Dialog

The dialog the charts key opens: a relationship stack for each side an AI commander reports on, a stance timeline, and nine line charts of every side over every turn.

## Purpose

Show the player how the match has gone, side by side, from the first recorded turn to the present. Every value is shown whatever fog of war is set to, and no AI commander is ever shown them.

## Availability

The charts key (C) opens the dialog while a match is loaded, in Strategic planning, Tactical planning, Resolution playback, New game over a running match, and Game over. A match is loaded when the game state has seats, and that stays true at game over. At Game over the dialog opens over the standings.

The dialog does not open while another dialog is showing that needs the player's choice: the tactical battles list, the melee intercept list, "You're out", the start and load confirmations, the annihilation dialog, the Game Options popover, the game menu, or a commander popover (`blockingDialogIsOpen` in `src/renderer/chrome/blockingDialogGuards.ts`). The new-game screen is not on that list, because it shows the standings at game over.

The game menu's Charts… checkbox opens the dialog under the same conditions as the C key, and closes it when unchecked (`openChartsDialog`, `closeChartsDialogIfOpen`). It is checked while the dialog is open.

A match that began in an earlier build has no recorded turns before the turn it was loaded on. Until a turn is played, the dialog shows "No turns have been recorded yet." A failed read when the dialog opens shows "The charts could not be loaded." A database error in the main process is a failed read: `buildMatchChartsSnapshot` throws and the channel rejects, rather than returning an empty snapshot. A failed read while charts are already showing leaves them as they were.

## Information Displayed

One modal dialog, centered, 90% of the window's width and height, over the top bar, the console, and every panel. A dimmed backdrop covers the rest. The header holds the title "Charts" and a close control. The body scrolls vertically and never horizontally. In order, it shows:

1. **Relationships.** One stack per side that at least one AI commander reports on, in side order (`relationshipSubjectSeatIds` in `src/shared/matchChartSeries.ts`). A commander never reports on its own side, so a side whose only possible reporter is itself has no stack: with the human and one AI opponent, only the human's stack shows. The human seat is a subject like any other. Each stack is a column as wide as its content, with its graph and row card centered in it. The columns are spread evenly across the row, a single stack sits centered, and a dialog too narrow for every column wraps them onto another row. Each stack is headed "How they see you" for the human seat and "How they see {flag} {name}" for the others. It holds a spoke graph over a row card, and both show how the AI commanders regard that side. A snapshot with no AI seat, which a real match never has, shows "No AI commander reports on any side." in place of the stacks.
2. **Stance over time.** A strip of cells, one row per reporting commander and one cell per turn, as wide as a line chart. A `How they see` dropdown names the side the strip is about, and lists the sides that have a stack, in side order, the first selected. A side with no stack is not offered.
3. **A legend.** Each side's color swatch, flag, and name, once, above the line charts.
4. **Nine line charts,** in this order: Built units, Mercenary units, Hexes held, Production per turn, Stored production points, Credits, Upkeep per turn, Units lost per turn, and Model cost so far (USD). The X axis is the strategic turn and the Y axis is the count. Each side has one line in its `--seat-N-bar` color. Model cost lists AI sides only. A turn with no value for a side is a gap in its line. Built units has a dropdown for Total, Infantry, Armor, Naval, Air, or Missile. Mercenary units has one for Total, Infantry, Armor, Naval, or Air. The numbers are the ones recorded at each turn boundary (`TurnStatistics` in `src/shared/matchStatistics.ts`). The chart rules are in `src/shared/matchChartSeries.ts`.

Every dropdown in the dialog uses the field colors of the top bar's View as select (`--field-text` on `--field-bg` with a `--field-border` edge), so its text is readable both on the closed control and in the open list.

A line chart, with its title row, axes, and labels, is at most a quarter of the dialog's height (`chartBlockHeight` in `src/shared/chartsDialogState.ts`). So is the stance strip. The relationship stacks are not held to that rule.

### The spoke graph

The subject is a circle at the center with its side number. Each reporting commander is a circle on a ring around it, with its side number, its name, and a line to the center.

- The line's color is the commander's stance toward the subject: hostile, wary, neutral, cordial, or friendly. A commander that has not reported has a gray line, a dashed outline, and the text "no report".
- The line's width grows with trust, and is the thinnest when trust is unknown.
- The line is solid for a fresh report and dashed for an old one or none. A report is old when it is more than three turns behind (`RELATIONSHIP_OLD_AFTER_TURNS`).
- Hovering a commander shows one sentence: "{name}: {stance}, trust {n}, threat {n}, reported turn {t}", or "{name}: no report yet".

### The row card

A table under the graph with one row per reporting commander and the columns Side, Stance, Trust, Threat, Taken, and As of.

- Stance is the word on a pill in the stance's color, or "no report".
- Trust and Threat are a bar of five steps with the number beside it, from 0 to 4. An unknown score is a dashed empty bar and a dash.
- Taken is how many hexes that commander took from the subject in the last five turns, or a dash when unknown (`HEXES_TAKEN_WINDOW_TURNS`).
- As of is "turn {t}", with " (old)" after it for an old report, or a dash.

### The stance strip

Each cell is filled with the stance's color. A cell the commander reported at that step is solid. A cell that carries an earlier stance forward is the same color, lighter. A turn with no report is an empty outline. A cell at least 14 pixels wide shows the stance's first letter. A turn axis with whole-number ticks runs under the rows.

Hovering a turn shows "Turn {n}" and one line per commander: "{name}: {stance} (reported this turn)", "{name}: {stance} (from an earlier turn)", or "{name}: no report". The row height is 22 pixels, and it shrinks, to 10 at the least, when the rows would not fit in a quarter of the dialog.

## Inputs and Responses

### Mouse

- Clicking the close control, or the backdrop outside the dialog, closes the dialog. A backdrop click closes it only when the press also started on the backdrop, so a text selection dragged out of the dialog leaves it open.
- Hovering a line chart shows a tooltip: "Turn {n}", one line per side with a color swatch and that side's value at the nearest turn, "no data" for a gap, and a "Total" over the values that exist. Model cost prints two decimals. Every other chart prints whole numbers.
- The wheel over a line chart or the strip zooms the X axis around the pointer. Scrolling up zooms in, to no fewer than three turns (`MIN_ZOOM_SPAN_TURNS` in `src/renderer/charts/chartZoom.ts` is the last turn shown minus the first). Scrolling down zooms out, to every recorded turn, or to the 12-turn opening window when fewer than 12 turns are recorded. Each wheel step scales the span by `WHEEL_ZOOM_IN_FACTOR` or its reciprocal. The strip always shows whole turns, so its cells fill its width and its turn labels stay under their cells after a zoom or a pan (`wholeTurnRange`). The wheel does not scroll the dialog while the pointer is over one of them.
- Dragging a zoomed line chart or the strip left or right pans it. Dragging does not select a region.
- A double-click on a line chart or the strip zooms all the way out: every recorded turn, or the 12-turn opening window when fewer than 12 turns are recorded. A chart zoomed all the way out past the opening window, by a double-click or by the wheel, keeps showing every recorded turn as turns arrive (`refreshedTurnView` in `src/shared/chartTurnWindow.ts`). A series of 12 turns or fewer already fills that opening window, so the same zoom-out keeps following the newest turns. A narrower zoom or a pan stays where the player left it.
- Changing a dropdown redraws that chart, or the strip, and keeps its zoom.
- Every chart with turns on its X axis (the nine line charts and the stance strip) opens on a window of 12 turns (`INITIAL_VISIBLE_TURNS` and `initialTurnWindow` in `src/shared/chartTurnWindow.ts`), and every time the dialog opens it starts from that window again, whatever the player did before. Points fill in from the left edge, the first recorded turn. With fewer than 12 turns, blank space stays to the right of the last point, and it shrinks as turns arrive, until turn 12 fills the axis. With more than 12 turns, the window ends on the newest turn. While the player has not zoomed or panned, a refresh keeps following that window. A tooltip appears only over a recorded turn, not over the blank space.
- A click, wheel, or drag on the dialog or its backdrop never reaches the map.

### Keyboard

- C closes the dialog while it is open. Escape closes it too, and no other dialog also acts on that Escape. While the dialog is open no map key acts. See [input-map.md](input-map.md).
- Tab stays inside the dialog. From the last control it returns to the close control, and Shift+Tab from the close control goes to the last control. Focus returns to where it was when the dialog closes.
- C typed into a text field, or while a dropdown has focus, does not open or close the dialog.

### Other

- The dialog reads the charts when it opens, and again after each strategic turn resolves while it is open. A battle beat does not refresh it. Every chart gains the new turn and keeps its zoom, each dropdown keeps its choice, and the body keeps its scroll position. There is no timer.
- When Ready opens the melee intercept list, or knocks the human seat out, the dialog closes first, so that dialog is not hidden under it.
- A refresh that finds a new match has started, or a save has been loaded, closes the dialog instead of drawing the old match (`currentRendererMatchEpoch`). A refresh whose read fails is logged and keeps the charts on screen.
- Resizing the window resizes every chart. Nothing overflows the dialog horizontally at the smallest window the app allows. The stacks wrap onto more rows when they do not fit side by side. A long heading wraps, and a long side name in a row card ends in an ellipsis.

## States

- Closed: the start state. The overlay is hidden and the body is empty.
- Open, empty: the one-sentence message.
- Open: the stacks, the strip, the legend, and the nine charts.

## Invariants

- The charts show every side and every turn whatever fog of war is set to. No AI commander is told any chart value.
- Match text reaches the page as text, never as markup.
- Color is never the only signal. The row card prints the stance word, a spoke is labelled, and a strip cell carries a letter and a tooltip.
- A missing report and an old report each look different from a fresh one.
- No line chart block and not the stance strip is taller than a quarter of the dialog.
- The dialog does not change the application mode or the match.

## Strategic and Tactical Differences

None. The charts are the same in both theaters.

## Related Documents

- [modes-and-transitions.md](modes-and-transitions.md)
- [input-map.md](input-map.md)
- [control-tooltips.md](control-tooltips.md)
- [new-game-dialog.md](new-game-dialog.md)
- [../match-statistics.md](../match-statistics.md)
- [../ui-style-guide.md](../ui-style-guide.md)

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#charts-overlay`, `#charts-dialog`, `#charts-dialog-close`, `#charts-dialog-body`)
- `static/chartsChrome.css`
- `src/renderer/charts/chartsDialog.ts` (`wireChartsDialog`, `toggleChartsDialog`, `refreshChartsDialogIfOpen`, `closeChartsDialogIfOpen`)
- `src/renderer/chrome/gameMenuActions.ts` (`openChartsDialog`, the game menu's Charts… checkbox)
- `src/renderer/charts/lineChart.ts`
- `src/renderer/charts/relationshipStack.ts`
- `src/renderer/charts/relationshipTimeline.ts`
- `src/renderer/charts/chartZoom.ts` (`MIN_ZOOM_SPAN_TURNS`, `WHEEL_ZOOM_IN_FACTOR`, `wholeTurnRange`)
- `src/renderer/chrome/blockingDialogGuards.ts`
- `src/renderer/map/initCore.ts` (the window `keydown` handler)
- `src/renderer/gameplay/readyHandler.ts`
- `src/shared/chartTurnWindow.ts` (`INITIAL_VISIBLE_TURNS`, `initialTurnWindow`, `zoomExtentTurnRange`, `refreshedTurnView`)
- `src/shared/matchChartSeries.ts` (`relationshipSubjectSeatIds`, `relationshipRows`, `relationshipStrip`)
- `src/shared/chartsDialogState.ts`
