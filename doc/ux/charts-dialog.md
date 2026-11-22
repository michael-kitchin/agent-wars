# Charts Dialog

The dialog the charts key opens: a relationship stack for each side an AI commander reports on, a stance timeline, an agreements timeline, a posture timeline, and nine line charts of every side over every turn.

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
3. **Agreements over time.** A strip of cells directly under the stance strip, one row per AI commander and one cell per turn, as wide as a line chart. A `Kind` dropdown offers All and the five agreement kinds, and a `With` dropdown offers All sides and every side in the match. Both start on All. See [The agreement strip](#the-agreement-strip).
4. **Posture over time.** A strip of cells directly under the agreement strip, one row per AI commander and one cell per turn, as wide as a line chart. It has no dropdown. See [The posture strip](#the-posture-strip).
5. **A legend.** Each side's color swatch, flag, and name, once, above the line charts.
6. **Nine line charts,** in this order: Built units, Mercenary units, Hexes held, Production per turn, Stored production points, Credits, Upkeep per turn, Units lost per turn, and Model cost so far (USD). The X axis is the strategic turn and the Y axis is the count. Each side has one line in its `--seat-N-bar` color. Model cost lists AI sides only. A turn with no value for a side is a gap in its line. Built units has a dropdown for Total, Infantry, Armor, Naval, Air, or Missile. Mercenary units has one for Total, Infantry, Armor, Naval, or Air. The numbers are the ones recorded at each turn boundary (`TurnStatistics` in `src/shared/matchStatistics.ts`). The chart rules are in `src/shared/matchChartSeries.ts`.

Every dropdown in the dialog uses the field colors of the top bar's View as select (`--field-text` on `--field-bg` with a `--field-border` edge), so its text is readable both on the closed control and in the open list.

A line chart, with its title row, axes, and labels, is at most a quarter of the dialog's height (`chartBlockHeight` in `src/shared/chartsDialogState.ts`). So are the stance strip, the agreement strip, and the posture strip, and the agreement and posture blocks count their title rows and their legends. The relationship stacks are not held to that rule.

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

### The agreement strip

Each row is an AI commander, in side order, and the commander is the side that keeps the agreements. The side chosen in `With` has no row, and the human seat never has one, because the human keeps no agreements. A row's label is the commander's flag and name, as on the stance strip. The turns on the axis are the stance strip's turns, so the two line up. The rules are in `agreementStrip` in `src/shared/agreementStrip.ts`, and the history comes from the charts snapshot's `agreementHistory`, which `readAgreementHistory` in `src/main/matchStatistics/agreementHistoryRead.ts` rebuilds from recorder events. The strip shows every commander's agreements, intents, and decisions, because the charts show the player everything.

**What a cell counts.** The number of that commander's agreements that are active at that turn and match both dropdowns. Proposed agreements are counted apart and never in the main number. Expired, lapsed, ended, and broken agreements are not shown. `Kind` limits the cell to one kind. `With` matches the agreement's other side only, not the third side of a joint action.

**Turn timing.** Each turn's state is rebuilt from the agreements recorded up to and including that turn, with `sideAgreementStanding`. An agreement made in a turn's talk appears in that turn. An agreement lapses after the last turn its other side played (the seat's `outTurn`). It lapses the same way after the last turn its own commander played, so a knocked-out commander's row is empty from then on.

**Breach.** An active agreement is breached in a turn when that turn its keeper's ranged, air, or missile attacks destroyed units of the other side on the world map, or its keeper recorded a `break` decision for it. Melee and battle losses do not count, because the game cannot tell who started them.

**Mismatch.** For an agreement with another AI commander, the other side records a matching agreement when, that turn, it has a proposed or active agreement of the same kind with this side. Only an active agreement with no match marks the cell. A proposal with no match is normal and only adds a tooltip line. An agreement with the human seat is never a mismatch. The match ignores the dropdowns.

**Marks.**

| Part | Rule |
|---|---|
| Fill | None when the cell has no active agreement. Otherwise `--agreement-1`, `--agreement-2`, or `--agreement-3` for one, two, or three or more |
| Empty cell | A 1 px outline in `--chrome-muted`, as the stance strip draws "no report" |
| Proposal | A 1 px dashed outline in `--chrome-accent-edge`, inset 2 px, when the cell has a proposal. A cell with proposals and no active agreement shows this outline in place of the muted one |
| Breach | Diagonal red hatching at 45 degrees, then a 2 px outline, both in `--chrome-error` |
| Mismatch | A triangle in `--stance-wary` in the top-right corner, with legs of 6 px, or a third of the cell width when that is smaller |
| Label | `agreementCellLabel`: the active count, then `+N` for proposals, then `!` for a breach, when it and 4 px fit in the cell. Otherwise `agreementCellShortLabel` (the active count and `!`) when that fits, otherwise none. Dark text on a cell with two or more active agreements |

A text legend under the strip says: "Number: active agreements. +N: proposed agreements. Dashed edge: at least one proposal. Red hatching and !: a breach that turn, an attack on the other side or a decision to break. Amber corner: the other side does not record a matching proposed or active agreement."

**Tooltip.** Hovering a cell lists every matching agreement, active first and then proposed, with no cap, built by `agreementCellTooltip` in `src/shared/agreementStripText.ts`. The heading is bold and reads "{name} (turn {n})", and an empty cell says "No matching agreements." Each agreement has a head line that opens with the bold lead-in "Agreement #{id}:", followed in regular weight by "{kind} with {name}, turns {start} to {end}, {active or proposed}, intent: {intent}", with ", against {name}" added for a joint action. Every line under it is a bullet in a list: "Terms: ...", "Zone: ..." when it has one, "Decision on turn {n}: {keep or break}" with ": {reason}" when there is a reason, "Breach this turn: ..." when breached, and "{name} records it as #{id} ({standing})" or "{name} records no matching agreement". The head line carries `lead` and the detail lines carry `bullet` in `AgreementTooltipLine`, and `tooltipLineElements` in `src/renderer/charts/stripTimelineCore.ts` draws them. Side codes in terms and reasons print as display names. A long tooltip wraps, and it opens above the pointer when it would pass the bottom of the dialog body. Kind labels are `SIDE_AGREEMENT_KIND_LABELS` and intent labels are `SIDE_AGREEMENT_INTENT_LABELS` in `src/shared/sideAgreements.ts`.

### The posture strip

Each row is an AI commander, in side order. The human seat never has a row, because the human has no posture. A row's label is the commander's flag and name, as on the stance strip. Each cell is one recorded turn, the same turns the other strips show, and shows the posture saved in that turn's `side_statistics` event (`PostureReport` in `src/shared/matchStatistics.ts`). A cell holds no text. The rules live in `src/shared/postureStrip.ts`, and `src/renderer/charts/postureTimeline.ts` draws them.

| Cell | Drawing |
| --- | --- |
| Declared posture, lead activity ran | A full-color fill: `--posture-overland`, `--posture-maritime`, `--posture-strangle`, or `--posture-blitz` |
| Declared posture, lead activity did not run | The same fill at 45% opacity, the stance strip's carried-over opacity |
| Default posture, never declared | A 2 px outline in `--posture-overland`, with no fill, whether or not its activity ran |
| Not recorded, no report, or out of the match | A 1 px outline in `--chrome-muted`, as the stance strip draws "no report" |

**Lead activity.** The activity that makes a posture's cell full, read when the turn's statistics are written (`postureActing` in `src/main/matchStatistics/postureReportsRead.ts`):

- overland: the commander has a stored campaign objective in its assault phase with the land approach;
- maritime: the commander has a stored sea operation in transit or assault, a raid or a campaign lift;
- strangle: a missile of the commander was spent since the previous strategic step;
- blitz: the commander has a stored air operation in any phase.

**Not recorded.** A turn recorded before 3.4.0 has no `postures` list, and a list that is not an array reads the same way. Every cell of that turn is not recorded. An entry with an unknown posture or a missing flag is dropped, so that commander's cell for the turn reads "no report". A bad list never hides the turn's other statistics.

**Tooltip.** Hovering a turn shows "Turn {n}" and one line per commander: "{name}: not recorded", "{name}: out of the match" (the turn is the commander's out turn or later), "{name}: no report", "{name}: overland by default, acting" or "idle", or "{name}: {posture}, acting" or "idle" (`postureCellTooltipText`).

A text legend under the strip names the four posture colors, then says: "Full color: the posture's lead activity ran that turn. Light: declared, but that activity did not run. Colored outline: overland by default, never declared. Gray outline: not recorded, or out of the match. Lead activity: overland, the land campaign assaulting; maritime, a sea operation at sea or landed; strangle, a missile launched; blitz, an air operation."

## Inputs and Responses

### Mouse

- Clicking the close control, or the backdrop outside the dialog, closes the dialog. A backdrop click closes it only when the press also started on the backdrop, so a text selection dragged out of the dialog leaves it open.
- Hovering a line chart shows a tooltip: "Turn {n}", one line per side with a color swatch and that side's value at the nearest turn, "no data" for a gap, and a "Total" over the values that exist. Model cost prints two decimals. Every other chart prints whole numbers.
- The wheel over a line chart or any strip zooms the X axis around the pointer. Scrolling up zooms in, to no fewer than three turns (`MIN_ZOOM_SPAN_TURNS` in `src/renderer/charts/chartZoom.ts` is the last turn shown minus the first). Scrolling down zooms out, to every recorded turn, or to the 12-turn opening window when fewer than 12 turns are recorded. Each wheel step scales the span by `WHEEL_ZOOM_IN_FACTOR` or its reciprocal. A strip always shows whole turns, so its cells fill its width and its turn labels stay under their cells after a zoom or a pan (`wholeTurnRange`). The wheel does not scroll the dialog while the pointer is over one of them. Each strip zooms and pans on its own, so zooming one strip leaves the others where they were.
- Dragging a zoomed line chart or any strip left or right pans it. Dragging does not select a region.
- A double-click on a line chart or any strip zooms all the way out: every recorded turn, or the 12-turn opening window when fewer than 12 turns are recorded. A chart zoomed all the way out past the opening window, by a double-click or by the wheel, keeps showing every recorded turn as turns arrive (`refreshedTurnView` in `src/shared/chartTurnWindow.ts`). A series of 12 turns or fewer already fills that opening window, so the same zoom-out keeps following the newest turns. A narrower zoom or a pan stays where the player left it.
- Changing a dropdown redraws that chart, or that strip, and keeps its zoom. Changing `Kind` or `With` redraws the agreement strip.
- Hovering an agreement cell shows the tooltip for that cell, not for the whole turn.
- Every chart with turns on its X axis (the nine line charts and the three strips) opens on a window of 12 turns (`INITIAL_VISIBLE_TURNS` and `initialTurnWindow` in `src/shared/chartTurnWindow.ts`), and every time the dialog opens it starts from that window again, whatever the player did before. Points fill in from the left edge, the first recorded turn. With fewer than 12 turns, blank space stays to the right of the last point, and it shrinks as turns arrive, until turn 12 fills the axis. With more than 12 turns, the window ends on the newest turn. The three strips open on the same window, so they line up until the player zooms one. While the player has not zoomed or panned, a refresh keeps following that window. A tooltip appears only over a recorded turn, not over the blank space.
- A click, wheel, or drag on the dialog or its backdrop never reaches the map.

### Keyboard

- C closes the dialog while it is open. Escape closes it too, and no other dialog also acts on that Escape. While the dialog is open no map key acts. See [input-map.md](input-map.md).
- Tab stays inside the dialog. From the last control it returns to the close control, and Shift+Tab from the close control goes to the last control. Focus returns to where it was when the dialog closes.
- C typed into a text field, or while a dropdown has focus, does not open or close the dialog.

### Other

- The dialog reads the charts when it opens, and again after each strategic turn resolves while it is open. A battle beat does not refresh it. Every chart gains the new turn and keeps its zoom, each dropdown keeps its choice, and the body keeps its scroll position. There is no timer.
- While replay is on, the charts show the match as it stood on the turn replay shows and follow the replay slider, as the map does. Turns, agreement states, decisions, and attacks after that turn are left out, a side that left later is still in, and the horizontal axis ends at that turn. The cut is made on the snapshot already read, with no new read (`capChartsSnapshot` in `src/shared/chartsTurnCap.ts`). Zoom, selectors, and scroll position are kept. Leaving replay shows the whole match. See [replay-panel.md](replay-panel.md).
- When Ready opens the melee intercept list, or knocks the human seat out, the dialog closes first, so that dialog is not hidden under it.
- A refresh that finds a new match has started, or a save has been loaded, closes the dialog instead of drawing the old match (`currentRendererMatchEpoch`). A refresh whose read fails is logged and keeps the charts on screen.
- Resizing the window resizes every chart. Nothing overflows the dialog horizontally at the smallest window the app allows. The stacks wrap onto more rows when they do not fit side by side. A long heading wraps, and a long side name in a row card ends in an ellipsis.

## States

- Closed: the start state. The overlay is hidden and the body is empty.
- Open, empty: the one-sentence message.
- Open: the stacks, the stance strip, the agreement strip, the posture strip, the legend, and the nine charts.
- Open, no AI commander: the posture strip shows `No AI commander has a posture.` in place of its cells.
- Open, no agreement rows: the agreement strip shows `No AI commander to show.` in place of its cells. This happens when the match has no AI commander, or when **With** names the only one.

## Invariants

- The charts show every side and every turn whatever fog of war is set to. No AI commander is told any chart value.
- Match text reaches the page as text, never as markup.
- Color is never the only signal. The row card prints the stance word, a spoke is labelled, a stance cell carries a letter and a tooltip, an agreement cell carries a number, a `!`, hatching, a legend, and a tooltip, and a posture cell carries a legend and a tooltip, with no letter in the cell.
- A missing report and an old report each look different from a fresh one. A proposal and a breach each look different from a plain active agreement.
- No line chart block, not the stance strip, not the agreement strip's block, and not the posture strip's block is taller than a quarter of the dialog.
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
- `src/renderer/charts/chartsDialog.ts` (`wireChartsDialog`, `toggleChartsDialog`, `refreshChartsDialogIfOpen`, `closeChartsDialogIfOpen`, `followReplayTurn`)
- `src/renderer/charts/chartsDialogBlocks.ts` (`buildLineChartBlock`, `fillStacks`)
- `src/shared/chartsTurnCap.ts` (`capChartsSnapshot`)
- `src/renderer/chrome/modalDialogKit.ts` (`trapTabWithin`, `wireBackdropDismiss`: the Tab trap and the click-the-backdrop rule)
- `src/renderer/chrome/gameMenuActions.ts` (`openChartsDialog`, the game menu's Charts… checkbox)
- `src/renderer/charts/lineChart.ts`
- `src/renderer/charts/relationshipStack.ts`
- `src/renderer/charts/relationshipTimeline.ts`
- `src/renderer/charts/stripTimelineCore.ts` and `src/renderer/charts/stripTimelineTypes.ts` (the label column, canvas, axis, zoom, pan, and tooltip the three strips share)
- `src/renderer/charts/agreementTimeline.ts`
- `src/renderer/charts/agreementStripBlock.ts`
- `src/renderer/charts/postureTimeline.ts`
- `src/renderer/charts/postureStripBlock.ts`
- `src/renderer/charts/chartZoom.ts` (`MIN_ZOOM_SPAN_TURNS`, `WHEEL_ZOOM_IN_FACTOR`, `wholeTurnRange`)
- `src/renderer/chrome/blockingDialogGuards.ts`
- `src/renderer/map/initCore.ts` (the window `keydown` handler)
- `src/renderer/gameplay/readyHandler.ts`
- `src/shared/chartTurnWindow.ts` (`INITIAL_VISIBLE_TURNS`, `initialTurnWindow`, `zoomExtentTurnRange`, `refreshedTurnView`)
- `src/shared/matchChartSeries.ts` (`relationshipSubjectSeatIds`, `relationshipRows`, `relationshipStrip`)
- `src/shared/chartsDialogState.ts`
- `src/shared/agreementStrip.ts` (`agreementStrip`)
- `src/shared/postureStrip.ts` (`postureReportsOf`, `postureStrip`, `postureCellTooltipText`)
- `src/main/matchStatistics/postureReportsRead.ts` (`readPostureReports`, `postureActing`)
- `src/shared/agreementStripText.ts` (`agreementCellLabel`, `agreementCellTooltip`)
- `src/shared/agreementHistoryTypes.ts`
- `src/shared/sideAgreements.ts` (`SIDE_AGREEMENT_KIND_LABELS`, `SIDE_AGREEMENT_INTENT_LABELS`)
- `src/main/matchStatistics/agreementHistoryRead.ts` (`readAgreementHistory`)
