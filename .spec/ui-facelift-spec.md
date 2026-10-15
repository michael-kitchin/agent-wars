# UI Facelift: Layout Specification

This is the target layout for the UI facelift milestone. Each phase's execution plan cites it, and the plans hold the step-by-step work. The milestone changes where things are on screen and how they are reached. It does not change game rules, the opponent, saved data, or IPC.

Everything here was settled with the product owner in the layout review: layout C, the docked operations console, plus parts of layouts A and B. Two changes were settled after Phase 4 was built: the map modes move into a row of tabs across the top of the minimap, and the selection panel opens as a compact bar from layout C that expands upward. Phase 6 builds them. Three details of the new-game screen were settled when Phase 7 was planned: the map beside the setup panel always takes drag and the wheel, the hide-choices button sits at the left of the panel's header and hiding the choices widens the map, and the panel uses the mockups' wording. [New Game and Game Over](#new-game-and-game-over) has them.

## How to Read This Document

- **Text wins over pictures.** The screenshots are mockups rendered from a fixed scenario. They show arrangement, proportion, and wording. When a picture and a sentence disagree, follow the sentence.
- **The mockups use Inter as a stand-in font.** The app keeps its `system-ui, -apple-system, sans-serif` stack. The renderer's Content Security Policy (`font-src 'self' data:`) blocks web fonts, so do not add any. Numbers use `font-variant-numeric: tabular-nums`, not a monospace face.
- **The map in the mockups is an approximation.** Hex codes, names, counts, and captions come from game data for the scenario below. The basemap and hex drawing are a stand-in for Leaflet and the canvas overlay.
- **Phases.** Section [Phases](#phases) lists the phases. Each element section says which phase builds it. Phase numbers belong in `.spec` only. Never put them in code, comments, tests, `doc/`, or configuration (`.cursor/rules/12-no-plan-identifiers.mdc`).
- **The execution plans are the authority for what gets built.** When a plan and this document disagree, follow the plan and change this document to match.

Mockup scenario: Global map, Small game, bonuses Low, fog of war on, started in September. Southern Europe (human, 15 home hexes) against Northern Africa (opponent, 24 home hexes). Turn 7 is March, Year 1. The battle mockup is at hex E8 in April, Year 1.

## Screens

| File | Shows |
| --- | --- |
| [ui-facelift-strategic-orders.png](ui-facelift-strategic-orders.png) | Strategic planning, Orders tab, a three-unit stack selected, the selection bar compact |
| [ui-facelift-selection-expanded.png](ui-facelift-selection-expanded.png) | The same moment with the selection panel expanded |
| [ui-facelift-opponent-tab.png](ui-facelift-opponent-tab.png) | Opponent tab while the opponent plans; Ready reads "AI: 00:12"; a turn-update toast |
| [ui-facelift-reports-strike.png](ui-facelift-reports-strike.png) | Reports tab, aiming an air strike from the selection bar |
| [ui-facelift-collapsed-menu.png](ui-facelift-collapsed-menu.png) | Console collapsed to its rail, game menu open, terrain legend open |
| [ui-facelift-tactical.png](ui-facelift-tactical.png) | Tactical battle: battle header with the force bar |
| [ui-facelift-new-game-global.png](ui-facelift-new-game-global.png) | New game, Global tab |
| [ui-facelift-new-game-regional.png](ui-facelift-new-game-regional.png) | New game, Regional tab |
| [ui-facelift-frame-step.png](ui-facelift-frame-step.png) | End of Phase 2: the final frame, with today's panel contents moved in unchanged |
| [ui-facelift-regions.png](ui-facelift-regions.png) | Frame regions and sizes at a 1440 × 810 window |

![Strategic planning, Orders tab](ui-facelift-strategic-orders.png)

![Frame regions](ui-facelift-regions.png)

## Decisions

These were confirmed with the product owner. Decisions 9 and 10 were revised after Phase 4 was built, and Phase 6 builds the revision.

1. **Layout C.** The map takes the window. A 44 px top bar runs across the top, and an operations console docks on the right. There are no floating side panels, and no small icon clusters spread around the map.
2. **One milestone, no gameplay changes.** No rule, IPC, or saved-data change. Renderer-only display values, such as top-bar totals, are allowed when a pure function in `src/shared` computes them from the snapshot and has a unit test.
3. **Placeholders only at entry points.** A future feature gets a disabled control only where a player would look for it: a menu item, a tab, a top-bar button, a map mode, a button on a report. Each one is disabled and has the tip "<Name> is not available in this version." Content features with no entry point are deferred with no placeholder. See [Placeholders and Deferred Items](#placeholders-and-deferred-items).
4. **Selection ring on the map.** Each hex holding a selected unit gets a gold ring around its top marker.
5. **Ranged and Strike stay visible.** While units are selected they stay on screen and are greyed out when they can't be used, instead of hiding. The reason, when one of the two sentences applies, is in [Selection Panel](#selection-panel).
6. **Destination codes in order rows.** Every queued-order row names its target hex code.
7. **The Opponent tab shows its tools and the activity log together**, with no Tools/Model sub-tabs.
8. **Force bar in tactical battles**, from layout B2, in the top bar.
9. **The minimap stays upper-left, with the map modes in a row of tabs across its top.** The tabs match the console rail's tabs, and the last one toggles the legend.
10. **Compact selection bar**, from layouts C1 and C2, at the bottom-left of the map. A chevron at its left edge expands it upward into the resizable selection panel from layout A1, with the bar as the panel's top row.
11. **Order lines get arrowheads and outlines.** Ranged and air-strike lines get the movement arrowhead. Every order line (movement, ranged, strike; queued, previewed, and played back) gets a light outline under it. The outline is a pale casing that keeps the dashed line readable on any terrain.
12. **The API key stays on the Opponent tab.** There is no Settings dialog in this milestone. Settings is a placeholder.
13. **Tactical battles lives only in the game menu**, as "Offer tactical battles". It is not on the new-game screen.
14. **Electron's File/Edit/View menu bar auto-hides** (`autoHideMenuBar: true`). Alt still shows it, and its keyboard shortcuts keep working.
15. **Window size.** The minimum stays 800 × 600. Layouts are verified at 1280 × 720 and 1920 × 1080, and checked for overflow at 800 × 600.
16. **Verification includes a screenshot smoke run** (`npm run ui:smoke`), added in Phase 2 and extended by later phases. From Phase 3 on it also checks the console and the selection panel at the 800 × 600 minimum, after the app restarts on the saved match, inside a battle, in a regional match, and on a finished match's game-over screen.

## Compatibility Names

This milestone doesn't rename identifiers that existed before it, so bindings by id and the source-reading contract tests keep working. A name this milestone added can change in a later phase when its element changes shape: Phase 6 renames `#map-mode-column` to `#map-mode-tabs`. These names stay even though the UI around them changes:

- `#sidebar` is the console root (`aside#sidebar.console`).
- `src/renderer/gameplay/sidebarSupport.ts`, `updateSidebar`, `updateGameStateSidebar`, and the `updateGameStateSidebarUi` option. `updateGameStateSidebar` now writes the top bar.
- `#sidebar-selected-unit`, `#sidebar-error`, `#pending-orders-list`, `#ranged-attacks-list`, and `#air-strikes-list`.
- Every `#openrouter-*` id, including `#openrouter-new-btn` and `#openrouter-tactical-battles` after they move into the game menu.
- `openNewGameOverlayFromModelTab`. Its orienting comment changes to say the game menu calls it.

A later cleanup can rename these with the naming tool (`npm run naming:apply`). That is outside this milestone.

## Frame

![Frame regions](ui-facelift-regions.png)

| Region | Element | Size and position |
| --- | --- | --- |
| Top bar | `header#app-topbar` | Full width, 44 px tall, at the top of the window |
| Map | `#canvas-container`, inside `#app-body` | Everything under the top bar and left of the console. On the new-game screen, everything right of the setup panel |
| Setup panel | `#game-over-overlay.new-game-panel`, first in `#app-body` | Left edge, full height under the top bar, 432 px. Shown only while the new-game overlay is open |
| Console | `aside#sidebar.console`, inside `#app-body` | Right edge, full height under the top bar. 376 px expanded (320 px content column and a 56 px tab rail on the outer edge); 56 px collapsed |
| Game menu | `#game-menu` | Fixed popup, 248 px wide, top-left corner at (0, 44) |

- `body` is a column: `#app-topbar`, then `#app-body`, a row holding the map and the console.
- While the new-game overlay is open (`#game-over-overlay` without `hidden`), the console is not displayed, the top bar is the new-game bar, and the setup panel docks at the left of `#app-body`, so the map is the area right of it. Before Phase 7 the top bar and the game menu were hidden too, and the map filled the window.
- Overlays drawn on the map keep a 12 px inset from the map's edges. That covers the minimap panel, the selection panel, the zoom control, toasts, scale, and attribution.
- Fixed-position popups (build popup, stack callout, tooltips) already use viewport coordinates and need no change. Code that turns a pointer into a map position must subtract the map container's `getBoundingClientRect()`, as the existing code does. Phase 2 verifies this by hand near the top edge of the map.
- When the map container changes size (window resize, console collapse, overlay open or close, hiding or showing the new-game choices), the canvas and Leaflet resize on the next animation frame. A `ResizeObserver` on `#canvas-container` triggers this. The tactical battles dialog, which already sized itself to the map, uses the same watcher.
- Control tips open below and to the right of the pointer, or above or to the left of it where they would leave the window. The console's rail and Ready sit at the window's edges, so their tips need this.

### Visibility by mode

| Mode | Top bar | Console | Map chrome |
| --- | --- | --- | --- |
| Strategic planning, resolution playback | Match status | Shown | Shown |
| Tactical planning and beat playback | Battle header (Phase 5) | Shown | Shown |
| Tactical battles list, annihilation dialog | Shown, no pointer input | Shown, no pointer input | Shown, no pointer input |
| New game, game over | New-game bar (Phase 7), taking pointer input | Hidden | Hidden; the map beside the setup panel shows the preview |

Pointer input is switched off by `setMainUIControlsEnabled(false)`. From Phase 2 it covers the top bar and closes the game menu. From Phase 7 the top bar keeps pointer input while the new-game overlay is open, so the game menu works there.

## Top Bar

Built in Phase 2. The battle header replaces it in battles in Phase 5. See [ui-facelift-strategic-orders.png](ui-facelift-strategic-orders.png).

From left to right:

1. **Game menu button** (`#game-menu-btn`): 44 × 44, in the button teal. Opens the [game menu](#game-menu).
2. **Sides**: a teal dot and the human side's name, "vs", then a rose dot and the opponent's name. The names are `state.humanHomeRegion` and `state.aiHomeRegion`, with an em dash when missing. Long names end in an ellipsis: at most 220 px each, and 120 px below a 1100 px window.
3. **Four readouts**, each a caption and a value. Below a 1360 px window the captions hide and the values stay. Every readout keeps its tip.

   | Caption | Value | Source |
   | --- | --- | --- |
   | Production | `+530` with suffix `/turn` | Sum of `urbanHexCount` (truncated, at least 0) over `state.strategicInfrastructure` rows whose hex `state.strategicControl` lists as `human`, skipping neutral-border hexes (`isNeutralBorderHex`). This matches the per-turn credit in `src/main/gameActions/controlAndProduction.ts`. A city adds it only while it is building. |
   | Forces | `10` with suffix `/34` | Count of `state.units` with `player === 'human'`, out of the sum of `getMaxUnitsPerType(parseGameSize(state.gameSize))`. The tip lists each type, for example "infantry 3 of 12". |
   | Your home | `12` with suffix `/15` | `countControlledHexesInRegion(state.strategicControl, state.humanHomeRegionHexes, 'human')` |
   | Enemy home | `3` with suffix `/24` | `countControlledHexesInRegion(state.strategicControl, state.aiHomeRegionHexes, 'human')` |

   Numbers use `toLocaleString('en-US')`. With no match loaded, each value is an em dash and the suffix is empty.
4. **Spacer.**
5. **Date block**, right-aligned on two lines. The first line is the date (`state.currentDateLabel`). The second is "Turn 7 · Planning", using the title-cased strategic phase. During a battle the second line is "Beat 2 · Tactical planning" or "Beat 2 · Tactical resolution", and the first line ends with the weather icon and word (`formatWeatherIconHtml`) when the battle has weather. With no match loaded, both lines are an em dash.
6. **Settings** (`#topbar-settings-btn`) and **Help** (`#topbar-help-btn`): 44 × 44 icon buttons. Both are disabled placeholders.

The top bar replaces the "Game state" lines (`#sidebar-phase`, `#sidebar-turn`) and the "Selected hex" heading. `src/shared/sidebarPhaseLabel.ts` is replaced by `src/shared/topBarDateBlock.ts`.

## Game Menu

Built in Phase 2. See [ui-facelift-collapsed-menu.png](ui-facelift-collapsed-menu.png).

A disclosure popup (`#game-menu`, `role="group"`, toggled with the `hidden` attribute) under the menu button. The button carries `aria-expanded` and `aria-controls="game-menu"`.

| Item | Element | Behavior |
| --- | --- | --- |
| New game… | `#openrouter-new-btn`, moved from the Model tab | Today's New button. The click handler is unchanged. |
| Save game… | `#game-menu-save-btn` | Disabled placeholder |
| Load game… | `#game-menu-load-btn` | Disabled placeholder |
| Offer tactical battles | `#openrouter-tactical-battles`, moved from the Model tab, now inside its label | Today's checkbox. The label text changes from "Tactical battles". The persistence and tip are unchanged. |
| How to play | `#game-menu-how-to-play-btn` | Disabled placeholder |
| Quit | `#game-menu-quit-btn` | Calls `window.close()`. On Windows and Linux the app quits (`window-all-closed`). On macOS the window closes and the app stays in the dock, which is the platform convention. |

- Clicking the menu button opens or closes the menu.
- Clicking an enabled menu button closes the menu. Toggling the checkbox leaves it open.
- A pointer press anywhere outside the menu and its button closes it.
- Escape closes it and puts focus back on the menu button. The menu takes Escape first, so the map's Escape handling doesn't also run.
- Opening the new-game overlay, or switching pointer input off, closes it.
- From Phase 7 the menu works on the new-game screen. New game… is disabled there, inside a tip host with the tip "The new-game screen is already open." Offer tactical battles and Quit work. Before Phase 7 the menu was not shown during the overlay.

## Console

The frame and tabs are built in Phase 2. The contents are restyled in Phase 3.

- **Tab rail** (`#console-rail`, `role="tablist"`, vertical) on the outer right edge, 56 px wide, with 58 px tabs showing an icon and a label. In order:
  1. Orders (`#console-tab-orders`).
  2. Reports (`#console-tab-reports`, from Phase 3).
  3. Opponent (`#console-tab-opponent`).
  4. Build (`#console-tab-build`), a disabled placeholder.
  5. Forces (`#console-tab-forces`), a disabled placeholder.

  The selected tab has a 3 px accent bar on its outer edge. Badges appear on Orders (queued orders) and Reports (unread entries) in Phase 3.

  Each tab shows an 18 px icon above its label. The labels are 10 px semibold until Phase 6 makes them 9 px, the same as the [map-mode tabs](#map-chrome), so that "Production" fits a 56 px tab there. The tabs keep their 56 × 58 size.
- **Header**, 48 px: the active tab's title (`#console-title`) and a subtitle (Phase 3), then the collapse button (`#console-collapse-btn`).
- **Panels**: `#console-panel-orders`, `#console-panel-reports` (Phase 3), and `#console-panel-opponent`, switched with `selectTabPanel`. Only one is visible at a time, and the visible panel scrolls.
- **Footer** (`#console-footer`): Ready (`#ready-btn`), full width and 46 px tall, with its existing labels: "Ready", or "AI:" and the elapsed wait. From Phase 3 a status line sits above Ready.
- **Collapse**:
  - The collapse button or a click on the active tab collapses the console to the rail (`data-collapsed="true"`).
  - A click on any tab while collapsed expands it on that tab.
  - While collapsed, the footer moves under the rail and Ready shrinks to 44 × 44. The "AI:" label and its timer wrap onto two lines.
  - The collapsed state lasts for the app session only and is not saved.
- **Opening state**: expanded, on Orders.

### Orders tab

- **Phase 2**: today's top-panel contents, moved without changes. That is "Selected unit", the Ranged/Strike row, the three order lists, and `#sidebar-error`. Ready moves to the footer.
- **Phase 3**: three groups: Movement, Ranged attacks, Air strikes.
  - Each group has a header with a count. An empty group shows "None".
  - A row shows the unit's flag and name, then a sub-line: an arrow, the target hex code, and the distance. Air strikes add the target type, using the dropdown's option label. A ferry adds "Ferry". Examples: "→ E5 · 1h", "→ GK · 2h · Airports".
  - Each row keeps its cancel ×. Rows for selected units are highlighted.
  - Clicking a row selects its unit, and Shift-click toggles it. There is no separate select button (today's ⊕ goes away).
  - Inside a battle, the code names the battle's hex and the cell, for example "E8.K3".
  - A code or a distance that cannot be found shows "?".
  - Subtitle: "N queued for turn T", or "for beat B" in a battle.
  - The "Selected unit" line and the Ranged/Strike row move to the [selection panel](#selection-panel).

### Reports tab (Phase 3)

- A list of what the two map toasts showed during this match, newest first: the turn update (`#map-toast`) and the opponent's message and strategy (`#ai-strategy-toast`).
  - Each entry shows a tag (T7, or B2 in a battle), a kind (Turn report, Message, or Notice), and the text.
  - Turn reports carry a disabled Replay placeholder.
- An entry is unread until the Reports tab is shown. Showing the tab marks every entry read. Entries filed while the tab is shown are never unread. Entries filed since the player last left the tab are marked with a gold dot. The Reports rail tab shows the unread count.
- The list clears when a new match starts, as the AI activity log does. It is not saved. A restart starts it empty. A toast shown once the app is up, such as a basemap failure, can file a new entry.
- Kinds: a turn update is a Turn report, the AI strategy toast is a Message, and any other informational map toast, such as "AI: standing orders only (no consultation).", is a Notice. Error toasts are not filed.
- A turn report's tag is the turn or beat it covers: the report shown when turn 7 begins is tagged T6. The standing-orders and unknown-battle notices that the same Ready raises take that tag too. Other messages and notices take the current turn or beat.
- The list keeps the newest 200 entries. An empty list reads "No reports yet this match."
- Toasts keep their behavior. They move to the top centre of the map, between the minimap panel and the zoom control, at most 560 px wide.
- Two text fixes come with this phase, because these lines become permanent entries. In `consolidatedTurnUpdateToast.ts`, "1 hexes lost to opponent" and "1 infantry units deployed" become singular when the count is 1.

### Opponent tab

- **Phase 2**: today's lower-panel contents, moved without changes. That is the Tools/Model sub-tabs and the activity log. New and Tactical battles move to the game menu. Showing the tab scrolls the activity log to its newest line, because lines added while the tab is hidden cannot scroll it.
- **Phase 3**: four sections and no sub-tabs. See [ui-facelift-opponent-tab.png](ui-facelift-opponent-tab.png).
  1. **Status**: Run and one sentence saying whether opponent planning is on.
  2. **Commander**: API key with the match cost, model with refresh, and reasoning effort. Same controls and ids.
  3. **Tool groups**: the existing toggles and counts in two columns.
  4. **Activity log**: `#openrouter-log`, filling the rest.

  Turning Run on no longer switches tabs. Update Run's tip to match.

  The status sentence reads "Opponent planning is on." while Run is pressed, and "Opponent planning is off." otherwise. The tab's subtitle names the opponent's home region.

### Footer status line (Phase 3)

One line above Ready:

- A dot.
- "Opponent planning on", "Opponent planning off", or "Opponent planning…", from Run and the wait state Ready already uses.
- The selected model's name: the option text before " [".
- The match cost.

The line is read-only.

- The dot is grey while planning is off, teal while it is on, and rose while the opponent plans. "Opponent planning…" shows exactly while Ready shows "AI:" and a time.
- With no model selected, the name reads "No model". A long name ends in "…".
- The line is hidden while the console is collapsed.

## Selection Panel

Built in Phase 3 as a resizable panel. Phase 6 turns its header and its action row into a compact bar: the panel opens as that bar and expands upward into the full panel. See [ui-facelift-strategic-orders.png](ui-facelift-strategic-orders.png) (compact), [ui-facelift-selection-expanded.png](ui-facelift-selection-expanded.png) (expanded), and [ui-facelift-reports-strike.png](ui-facelift-reports-strike.png) (aiming a strike).

- **Placement**:
  - Bottom-left of the map, 12 px inset. The panel's bottom-left corner never moves.
  - Shown while at least one of the player's units is selected, and hidden otherwise and during the new-game overlay.
  - Two states. **Compact**: the summary bar alone. **Expanded**: the summary bar on top and the details under it.
  - The app opens compact. The state the player picks lasts for the app session: across selection changes, while the panel is hidden, and in and out of battles. It is not saved.
  - Both states share one width: 440 px by default, and never wider than the map minus 24 px. Phase 3 opened the panel at 400 px; the bar needs the extra width for the Strike controls and its two lines of text. A map can be narrower than 424 px, because the window's frame can take part of the 800 px minimum width. The 12 px insets then win, the panel narrows below 400 px, and the two lines of text give way first.
  - Compact, the panel is the bar's height, whatever height was dragged. Expanded, the height fits the bar and the details, up to half the map's height; past that the unit rows scroll. The bar never scrolls. When the panel is dragged shorter than the details' caption, chips, and one row, the details scroll as a whole.
  - Where the panel overlaps the terrain legend, the map scale, or, in a short window with the panel expanded, the minimap panel, it draws above them.
- **Summary bar** (`#selection-panel-bar`): one row, 50 px tall, the panel's top row in both states. From left to right:
  1. **Expand control** (`#selection-panel-expand`): the bar's full height and 32 px wide, with a chevron that points up while compact and down while expanded. Its `aria-label` is "Show selection details" while compact and "Hide selection details" while expanded. It carries `aria-expanded` and `aria-controls="selection-panel-details"`.
  2. **Two lines of text**, each ending in an ellipsis when it doesn't fit:
     - Line 1 (`#sidebar-selected-unit`, 13 px semibold): the first selected unit's hex code in parentheses, " · ", then "N selected of M", where M is the player's selectable units in that hex. When exactly one unit is selected, its flag and name take the place of the count, as in layout C2. When selected units also stand in other hexes, the line ends with " · +K elsewhere", where K counts them, because the compact bar hides their rows: "(D4) · 2 selected of 3 · +1 elsewhere". `#selection-panel-count` is removed, and the count moves into this line.
     - Line 2 (`#selection-panel-hint`, 11 px, muted): what the next map gesture does. The first row that applies wins.

       | When | Line 2 |
       | --- | --- |
       | Playback runs, of a world-map turn or a battle beat | Playback is running · right-click to deselect |
       | Ranged or Strike targeting is on | Double-click a target in range |
       | Every selected unit is air | Double-click a hex to ferry · right-click to deselect |
       | Air units are selected with other types | Air units can't move with other units |
       | Otherwise | Double-click a hex to move · right-click to deselect |

       Line 2 follows the selection, and changes as soon as targeting or playback starts or stops. Layout C1's "right-click to stop" is not used: right-click clears the selection and leaves queued orders alone (`doc/ux/order-lifecycle.md`).
  3. A divider.
  4. **Ranged or Strike**:
     - Always present while the panel shows. It is greyed out when it can't be used.
     - The label is Strike when the selection has any air unit, and Ranged otherwise. The panel is hidden when nothing is selected, so an empty selection never shows the button.
     - Aiming keeps today's behavior: Ranged turns into Cancel, and Strike turns into the target-type list and Cancel. Those controls (`#ranged-attack-btn`, `#air-strike-target-type`, `#air-strike-cancel-btn`) sit in the bar. Layout C2's "Strike" caption is left out, so the text keeps its room.
     - While targeting is on, the bar's border takes the order color: amber `#a06020` for Ranged, purple `#7a3db5` for Strike.
     - These controls keep their full size, and the two lines of text take the width that is left.
  5. **Close** (`#selection-panel-close`, ×): clears the selection, the same as the existing clear-selection action. Shown in both states.
- **Greyed-out reason**: when one of these sentences applies, it is the greyed-out control's tip in both states, and it also shows in the details under the unit rows (`#selection-panel-action-note`). No reason shows otherwise. The control sits in a tip host (`#ranged-attack-tip-host`), as the disabled placeholders do, because a disabled button gets no pointer events.
  - "Infantry can't fire on the world map." when a world-map selection includes infantry and no air unit.
  - "Strike needs a selection of air units only." when air is mixed with other types.
- **Details** (`#selection-panel-details`), shown only while expanded, top to bottom:
  - The hex caption (`#selection-panel-caption`): the same naming line the hex tooltip shows, with its flags. It appears once its lookup returns.
  - **Chips**, in this order, each only when it applies: terrain, with the map key's swatch; weather, with its icon, while the weather bonus is on and the weather is known; the tech tier of units built there, while the tech bonus is on and the hex can produce units (not in a battle); production `$N/turn` when the hex has urban cells, that number is at least 1, and the hex is not on the neutral border (not in a battle); and "Home" or "Enemy home" (not in a battle).
  - **Unit rows**:
    - Each row shows a type token, the unit's flag, and its name.
    - The order chip uses the Orders-tab wording, with a cancel ×, or reads "No orders".
    - A selected unit in another hex shows that hex code after its name.
  - The greyed-out reason, when one applies.
  - `#sidebar-error`, which stays hidden as today.
- **Expanding and collapsing**:
  - A click on the expand control, or Enter or Space while it has focus, switches the state. There is no other key.
  - Expanding grows the panel upward from its bottom edge. The bar slides up as the details open under it, over about 150 ms, and collapsing reverses the slide. When the system asks for reduced motion, the change is immediate.
  - `aria-expanded` and the label change on the click. The chevron turns when the slide ends: down once the panel is fully expanded, up once it is fully compact.
  - A click during the slide sends it back the other way. If the panel hides during the slide, it keeps the state the last click chose.
  - The panel is not a drawer at the map's bottom edge. The bar stays the panel's top row in both states, so a later version can let the player move the panel.
- **Resize**:
  - A grip at the top-right corner resizes the panel while it is expanded. It sits clear of the close control, and it is hidden while compact.
  - Width runs from 400 to 640 px (Phase 3 allowed 320), and height from 140 px to the map height minus 24 px. A dragged height replaces the half-the-map limit. A dragged width applies to both states.
  - The size is kept for the session only.
- **Tips**: the expand control's tip is "Show the hex, its terrain, and each selected unit's orders." while compact, and "Hide the details. The bar stays." while expanded. The close control and the grip keep their tips.
- **Not added**: no "Clear orders" button, although layout C1 has one; orders are cancelled per row. No moving the panel; see [Placeholders and Deferred Items](#placeholders-and-deferred-items).
- **In a battle**: line 1 names the first selected unit's battle cell, such as "(E8.K3)". The chips are that cell's terrain and the battle's weather.

## Map Chrome

Built in Phase 4, with the map modes in a column to the right of the minimap. Phase 6 moves them into a row of tabs across the minimap's top and widens the minimap. See [ui-facelift-strategic-orders.png](ui-facelift-strategic-orders.png) and [ui-facelift-collapsed-menu.png](ui-facelift-collapsed-menu.png).

- **Minimap panel** (`#minimap-panel`), upper-left of the map at (12, 12), 280 px wide inside its border:
  - On top, a row of five map-mode tabs (`#map-mode-tabs`, `role="group"`, `aria-label="Map modes"`). Phase 4 named this group `#map-mode-column`; the five button ids stay.
  - Under the tabs, the 280 × 200 overview (`#minimap`). Phase 4 made it 200 × 200, with a 96 px column of 40 px mode buttons to its right.
  - Each tab is the console rail's tab cell, 56 × 58 px: an 18 px icon above a 9 px semibold label that never wraps, in the rail's colors, with a 1 px divider between tabs inside the 280 px. In order:
    1. **Weather**, selected by default. Today's normal view.
    2. **Tech**, a latched version of what holding T shows, on the world map only. A battle, the new-game preview, and the game-over screen keep their normal view, and Tech applies again when they close. While Tech is latched, holding T changes nothing; under Weather, T works as today.
    3. **Control**, a disabled placeholder.
    4. **Production**, a disabled placeholder.
    5. **Legend**, a toggle.
  - A pressed tab (the chosen view, and Legend while the legend is open) is lighter, with a 3 px accent bar on its bottom edge, next to the overview. Phase 4 put the bar on the button's inner edge, beside the overview, and it stays on that side.
  - The selected mode lasts for the session.
  - The overview keeps its content and its rules. At 280 px wide it shows the whole width of the world in a global match. It is still 200 px tall, so, as before, it cuts the world off at about 80° north and south. In a regional match it fits the region to the new box.
- **Legend popover**:
  - The Legend toggle shows `#terrain-legend`, with its style dropdown and rows unchanged, as a panel to the right of the minimap panel. On a map too narrow for that, it opens under the panel instead.
  - It is closed by default, and its open state lasts for the session.
  - It no longer sits permanently under the minimap.
- **Zoom control**: Leaflet's + and − at the map's top-right, in the chrome colors. A button is dimmed at the zoom limit.
- **Scale and attribution**: bottom-right of the map.
- **Toast band**: between the minimap panel (or the legend open beside it) and the zoom buttons. When that space is narrower than 280 px, as at the 800 × 600 minimum with the console expanded, the band runs from the map's left inset to the zoom buttons and covers the panel while a toast shows.
- **Order lines**:
  - Movement, ranged, and air-strike lines — queued, hover previews, and the shot lines drawn during playback — all draw a pale casing first, then the colored line.
  - Ranged and air-strike lines end in the movement arrowhead, its tip a unit radius short of the target (`orderArrowGeometry` in `src/shared/orderArrowGeometry.ts`). Movement lines keep the arrowheads they have today: a move played back for the player, other than an air strike's flight, still has none.
  - Colors and dash patterns stay as they are: movement teal, solid for this turn and dashed beyond; ranged amber `#a06020`; strike purple `#7a3db5`.
- **Selection ring**: a 3 px `#f2c14e` ring around the top marker of every hex that holds a selected unit, in both theaters. Existing selection highlights stay.

## Tactical Battles

Built in Phase 5. See [ui-facelift-tactical.png](ui-facelift-tactical.png).

In a battle the top bar becomes a battle header, on a darker, warmer face (`--battle-header-bg`). The sides, the readouts, and the date block hide; the date block always describes the world-map turn.

- Menu button.
- "Battle at (E8)" and the hex caption, with flags. The caption ends in an ellipsis first when the header is narrow.
- A line reading "Beat 2 · Tactical planning · April, Year 1", then the weather icon and word when the battle has weather. "Tactical resolution" replaces "Tactical planning" while a beat resolves or plays back.
- A centred force bar: the player's sub-unit count, a two-colour bar in proportion, and the enemy's count, captioned "Sub-units in battle". Counts come from the battle snapshot and include sub-units carried by a ship. A battle has no fog of war, so the snapshot lists every enemy sub-unit and the tip says the counts are exact. While a beat plays back, the bar keeps the counts from before the beat. Below a 1100 px window the bar narrows and keeps only the two counts and the bar.
- Exit Battle (`#tactical-exit-btn`, moved from `#tactical-battle-hud`), with the same rules and tip, in the shared button colors.
- Settings and Help.

The console works as on the world map. Orders shows the beat's orders, and Ready commits the beat. The annihilation dialog is unchanged.

## New Game and Game Over

Built in Phase 7. See [ui-facelift-new-game-global.png](ui-facelift-new-game-global.png) and [ui-facelift-new-game-regional.png](ui-facelift-new-game-regional.png). Every control keeps its id, its tip, its options, and its behavior; only its place and its label change.

- **Top bar** while the overlay is open: the new-game bar.
  - The menu button, the title "New game", the spacer, Load game… (a disabled placeholder with a folder icon and text), Settings, and Help.
  - The sides, the readouts, the date block, and the battle header are hidden, and a battle's darker face gives way. The overlay's own `hidden` class drives this in `static/newGameChrome.css`, a new stylesheet for the new-game screen, so the bar follows however the overlay opens.
  - The top bar takes pointer input. The game menu works: New game… is disabled with its tip, and Offer tactical battles and Quit work.
  - After a start, the top bar shows the match status again.
- **Setup panel** (`#game-over-overlay.new-game-panel`) docked at the left of `#app-body`, 432 px wide (`--new-game-panel-width`), replacing today's centred dialog box. Its styles follow the bar's in `static/newGameChrome.css`. From top to bottom:
  1. **Header**: the hide-choices button (`#new-game-dialog-collapse`) at the left, then the overlay message (`#game-over-message`).
  2. **Body** (`#game-over-dialog`), which scrolls when the window is short, in three sections with titles:
     - **Map**: the Global and Regional tabs, then rows of a label, a dropdown, and a randomize button, with every dropdown the same width. Global has the rows Human and AI. Regional has Region, Your side, and Opponent. The label column is 5em in both tabs, so the dropdowns line up across them. Under the rows, Add another opponent is a disabled placeholder, full width, with a dashed border.
     - **Forces**: the title with the Advanced tech line at its right, the game size, and the unit row. Each unit is its icon, its cap, a dot, and its price, as in "12 · $20". Each icon's alt text names the type: Infantry, Armor, Naval, Air.
     - **Rules**: the four bonuses in a grid of two label and dropdown pairs per line (Origin bonus, Tech bonus, Terrain bonus, Weather bonus), the starting month with its randomize button, then Fog of war.
  3. **Footer**: Start game, or New game after a match ends, full width.
- **Wording**: the mockups' labels. No label ends in a colon, and no line uses a slash between items. The Advanced tech line keeps its colon, as in the mockups. The price format comes from `formatUnitCostLabel` in `src/shared/gameMapList.ts` ("$20").
- **Map**: the preview fills the area right of the panel. The preview frame centres on that area, and Leaflet's size is brought up to date before a new preview is fitted. While the overlay is open, drag and the wheel always reach the preview; a click still does not select a unit or give an order.
- **Hiding the choices**: the hide-choices button hides the message, the body, and the footer. The panel leaves the row, the map widens to the full window under the top bar and keeps its centre and zoom, and the button stays in the same spot over the map's top-left corner. Its tip is "Hide the new game choices and widen the map." while the choices show and "Show the new game choices." while they are hidden.
- **Game over**: a finished match opens the same panel, with the result as the message. At the 800 × 600 minimum nothing overflows sideways.
- **Not on this screen**: the opponent model, a matchup summary, Tactical battles (it lives in the game menu), and any way to cancel the overlay. The overlay still closes only when a start succeeds (`doc/ux/new-game-dialog.md`).

## Placeholders and Deferred Items

Disabled placeholders, each with the tip "<Name> is not available in this version.":

| Placeholder | Where | Phase |
| --- | --- | --- |
| Settings | Top bar | 2 |
| Help | Top bar | 2 |
| Save game…, Load game…, How to play | Game menu | 2 |
| Build, Forces | Console rail | 2 |
| Replay | Turn-report entries in Reports | 3 |
| Control, Production | Map-mode tabs on the minimap panel (a column until Phase 6) | 4 |
| Load game… | New-game top bar | 7 |
| Add another opponent | New-game setup panel | 7 |

Save game… gets a longer tip: "Saving to a file is not available in this version. The match in progress is kept on disk between sessions."

Deferred with no placeholder:

- The alerts strip (idle production, units without orders).
- A "No orders" group in the Orders tab.
- The "woken by" detail and token counts on the Opponent tab.
- Report filters.
- The matchup summary on the new-game screen.
- Minimap zoom buttons.
- Moving the selection panel. Its summary bar stays the panel's top row in both states, so a later version can let the player drag it elsewhere.

## Element Migration

| Today | After | Phase |
| --- | --- | --- |
| `body` (row: map and `#sidebar`) | Column: `#app-topbar`, then `#app-body` (map and console) | 2 |
| `#sidebar` | Console root `aside#sidebar.console`, with a content column, a tab rail, and a footer | 2 |
| `<h2>Selected hex</h2>` | Removed | 2 |
| `#sidebar-phase`, `#sidebar-turn` | Removed; replaced by `#topbar-date` and `#topbar-turn-phase` | 2 |
| `#ready-btn` and its tip host | Console footer | 2 |
| `#sidebar-selected-unit` | Orders tab (2), then the selection panel header (3), then line 1 of the selection bar (6) | 2, 3, 6 |
| `#ranged-attack-btn`, `#air-strike-target-type`, `#air-strike-cancel-btn` | Orders tab (2), then the selection panel action row (3), then the selection bar (6) | 2, 3, 6 |
| `#pending-orders-list`, `#ranged-attacks-list`, `#air-strikes-list` | Orders tab (2), restyled with destination codes (3) | 2, 3 |
| `#sidebar-error` | Orders tab (2), then the selection panel (3), then its details (6) | 2, 3, 6 |
| `#sidebar-bottom` (Tools/Model sub-tabs, log) | Opponent tab (2), restructured into sections (3) | 2, 3 |
| `#openrouter-new-btn` | Game menu, "New game…" | 2 |
| `#openrouter-tactical-battles` | Game menu, "Offer tactical battles" | 2 |
| `#map-toast`, `#ai-strategy-toast` | Top centre of the map, and recorded in Reports | 3 |
| `#minimap` | Minimap panel with the mode column | 4 |
| `#terrain-legend` | Legend popover | 4 |
| Leaflet zoom and scale controls | Top-right and bottom-right | 4 |
| `#tactical-battle-hud`, `#tactical-exit-btn` | The button moves into the battle header; the HUD is removed | 5 |
| `#map-mode-column` | `#map-mode-tabs`, a row of tabs across the top of the minimap panel | 6 |
| Selection panel header and action row | The summary bar (`#selection-panel-bar`) with the expand control | 6 |
| Selection panel caption, chips, and unit rows | The details (`#selection-panel-details`), shown while expanded | 6 |
| `#selection-panel-count` | Removed; its text moves into line 1 of the selection bar | 6 |
| `#game-over-overlay` dialog box inside `#canvas-container` | The setup panel, first in `#app-body`: header, body (`#game-over-dialog`), and footer | 7 |
| The new-game controls' styles in `static/feedbackChrome.css` | `static/newGameChrome.css`, after the new-game bar's | 7 |
| `src/renderer/gameplay/newGameRegionSelectWidth.ts`, and the code that hid a slash at a wrapped bonus line | Removed; the rows' grid and the Rules grid do the same work in CSS | 7 |
| `#tactical-annihilation-overlay`, `#build-popup`, `#stack-callout`, all tooltips | Unchanged | — |

## Colors and Tokens

The existing tokens in `static/shellChrome.css` stay. Phase 2 adds these:

| Token | Value | Use |
| --- | --- | --- |
| `--chrome-bg-deep` | `#121b27` | Top bar and console footer |
| `--chrome-rail-bg` | `#141f2d` | Console tab rail |
| `--chrome-divider` | `#243246` | Dividers inside bars and the rail |
| `--player-human` | `#115e59` | Human side mark |
| `--player-opponent` | `#9d174d` | Opponent side mark |
| `--topbar-height` | `44px` | Top bar height |
| `--console-content-width` | `320px` | Console content column |
| `--console-rail-width` | `56px` | Console tab rail |

Phase 4 adds `#f2c14e` (selection ring) to `src/renderer/core/constants.ts`, next to the other map colors.

Phase 5 adds these:

| Token | Value | Use |
| --- | --- | --- |
| `--battle-header-bg` | `#17141f` | The top bar's face in a battle |
| `--battle-header-border` | `#4a3247` | The battle header's bottom edge |
| `--force-bar-human` | `#1b8a82` | The player's part of the force bar |
| `--force-bar-opponent` | `#b02a62` | The opponent's part of the force bar |

Phase 6 adds these. The first three give the console rail and the map-mode tabs one size; the last two are the map's ranged and air-strike colors, for the selection panel's border while the player aims:

| Token | Value | Use |
| --- | --- | --- |
| `--chrome-tab-height` | `58px` | Console rail tabs and map-mode tabs |
| `--chrome-tab-label-size` | `9px` | The labels on those tabs |
| `--minimap-width` | `280px` | The minimap overview and the tab row above it |
| `--order-ranged` | `#a06020` | The selection panel's border while Ranged is aimed |
| `--order-strike` | `#7a3db5` | The selection panel's border while Strike is aimed |

Phase 7 adds this:

| Token | Value | Use |
| --- | --- | --- |
| `--new-game-panel-width` | `432px` | The new-game setup panel |

## New Control Tips

These sentences go in `src/renderer/chrome/frameTooltipText.ts`, beside `controlTooltipText.ts` (which is near the file-size limit), in the static markup, and in the Sentences list of `doc/ux/control-tooltips.md`.

- **Game menu button:** Open the game menu to start a new game, choose whether Ready offers tactical battles, or quit.
- **Production:** The production your cities can add each turn. A city adds its share only while it is building, and a city on the neutral border adds none.
- **Forces:** Units you have fielded, out of the most this game size allows: <breakdown>.
- **Your home:** Hexes of your home region that you hold, out of all its hexes.
- **Enemy home:** Hexes of the opponent's home region that you hold, out of all its hexes.
- **Orders tab:** Show the selected unit and the orders queued for this turn or beat.
- **Opponent tab:** Show the opponent's model, its tools, and the AI activity log.
- **Collapse the console:** Hide the console to widen the map. Click a tab to show it again.
- **Quit:** Close Agent Wars.
- **Model tab**, changed: Show the API key, model, reasoning effort, and the Run control for opponent planning.
- **Placeholders:** see [Placeholders and Deferred Items](#placeholders-and-deferred-items).

Phases 3 through 7 add their own tips in their plans. Phase 6's tips are in [Selection Panel](#selection-panel). Phase 7's are in [Game Menu](#game-menu) and [New Game and Game Over](#new-game-and-game-over).

## Phases

| Phase | Content | Done when |
| --- | --- | --- |
| 1 | This specification and its screens | The product owner accepts it |
| 2 | Frame: smoke harness, top bar with readouts, console shell with tabs, collapse and live resize, game menu, Electron menu auto-hide, docs | `npm test` passes; `npm run ui:smoke` shows no FAIL; the manual checklist passes; the screens match [ui-facelift-frame-step.png](ui-facelift-frame-step.png) |
| 3 | Console contents: Orders restyle with destination codes, Reports tab, Opponent tab sections, footer status line, selection panel, toast band, text fixes | The same gates, plus the Phase 3 smoke checks |
| 4 | Map chrome and drawing: minimap panel and modes, legend popover, Leaflet control positions, line casing and arrowheads, selection ring | The same gates |
| 5 | Battles: battle header, force bar, Exit Battle in the header | The same gates, plus a battle played to the end and an exit mid-battle |
| 6 | Map chrome revision: map-mode tabs across the top of the minimap panel and the wider overview; the console rail's labels at 9 px; the selection panel's compact bar, its expansion, and its hints | The same gates, plus the selection bar checked compact, expanded, and while aiming a strike, at 1280 × 720 and at the 800 × 600 minimum |
| 7 | New game and game over: the new-game bar and the game menu on the overlay, the docked setup panel, and its sections with the mockups' wording | The same gates, plus a global and a regional start, and the choices hidden and shown again |
| 8 | Docs, screenshots, release: refresh `doc/media`; update the README's images, its OpenRouter setup steps (they still name the Model tab), and its test count; sweep `doc/` for "right panel" wording; regression pass | The product owner signs off |

Each phase gets its own execution plans in `.spec`. Phase 2 has five, run in order and committed one at a time; [ui-facelift-frame-execution-plan.md](ui-facelift-frame-execution-plan.md) lists them. Phase 3 also has five, run the same way; [ui-facelift-console-execution-plan.md](ui-facelift-console-execution-plan.md) lists them. Phase 4 has three; [ui-facelift-map-execution-plan.md](ui-facelift-map-execution-plan.md) lists them. Phase 5 also has three; [ui-facelift-battle-execution-plan.md](ui-facelift-battle-execution-plan.md) lists them. Phase 6 also has three; [ui-facelift-revision-execution-plan.md](ui-facelift-revision-execution-plan.md) lists them. Phase 7 also has three; [ui-facelift-start-execution-plan.md](ui-facelift-start-execution-plan.md) lists them.

## Open Questions

- **macOS Quit.** `window.close()` leaves the app in the dock on macOS. That is normal for closing a window, but it isn't "Quit". A real quit would need an IPC channel, which this milestone avoids. The macOS build has not been opened yet (release notes, Known limits), so this stays as is until someone tests on a Mac.
