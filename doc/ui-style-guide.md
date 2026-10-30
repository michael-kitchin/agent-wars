# UI Style Guide

*March 2026 target aesthetic; implementation-status note October 2026*

---

This document defines UI aesthetics, control patterns, and application-specific guidelines for the grand strategy wargame. Use it for all UI and map chrome so the product reads as a coherent, serious strategy wargame.

**Implementation status (2.10.0):** The live app is a map-first Electron window: Leaflet world map + canvas overlay, top bar, docked console with the Orders, Reports, and Commanders tabs, selection panel, minimap panel with map-mode tabs, hex tooltips, control tips, stack callout, build-queue popup, a message toast at the top of the map and an update toast at the lower right, both 12 px in from the map's right edge, the update toast 12 px above the bottom edge, covering the + and − buttons, WASD/arrow pan, wheel zoom, + and − buttons at the map's bottom-right, NATO-inspired SVG unit glyphs, and tactical-entry magnifiers on contested hexes. The map stays the light cartographic theme (no dark-mode switch). Panels, popups, tooltips, and the message and update toasts use navy chrome `#1b2838` with off-white text so flags and weather icons separate from the pale terrain. Every button uses the Ready button's teal, except a hire-only map button, whose resting face is the light border color and whose label is dark teal, the map's + and − buttons, and the message-popup tabs, whose face is `--chrome-bg`, the same dark slate as the expand control. A selected message tab stays bold and is underlined in `--chrome-accent-edge`. Text fields and dropdowns use a lighter teal so they read as editable. Seat colors follow seat order: teal `#115E59`, rose `#9D174D`, orange `#C2410C`, and blue `#2563EB`, with Neutral tokens `#141414`, on map background `#e0dcd4`. Matches of two to four sides, including Observe, are built. Unbuilt in this guide: replay strip, async turn-file exchange, diplomacy panel, in-app reference manual, and a documented full keyboard-shortcut overlay.

When this guide and the running app disagree, the app wins until this file is updated.

---

## 1. General UI Aesthetics

### 1.1 Overall Character

- **Military-cartographic.** The UI should feel like a professional command or operations view: clear, data-rich, and oriented toward decision-making. Avoid gamey flourishes, decorative chrome, or playful styling that would undermine that tone.
- **Map-first.** The hex map is the primary workspace. All panels, toolbars, and overlays are secondary and should support rather than compete with the map. Layout and hierarchy should keep the map as the dominant frame.
- **Information-dense but organized.** Strategy players expect a lot of data (units, terrain, resources, turn state). Present it in structured panels with clear hierarchy, not as a single wall of text or a clutter of equal-weight elements.
- **Restraint over flair.** Prefer muted palettes, clear typography, and deliberate accents over bold colors or busy visuals. Readability and scannability trump visual novelty.

### 1.2 Typography

- **Primary UI and data:** Clear, legible sans-serif. Choose a single family for all game information (unit names, stats, resource counts, labels). Avoid display or decorative fonts for body and controls.
- **Weights:** Use regular for body and labels; medium or semibold for emphasis (e.g., selected unit, critical alerts). Avoid heavy or black weights except for rare emphasis (e.g., “Your turn”).
- **Sizes:** Establish a small scale (e.g., 12–14 px base) so panels can show many rows without overwhelming the map. Reserve larger sizes for headings and critical state (e.g., turn/phase).
- **Monospace:** Use only where semantically appropriate: coordinates, hex indices, numeric IDs, or technical data (e.g., AI observatory logs). Keep the rest in the main sans-serif.

### 1.3 Color

- **Terrain (map):** Muted, topographic-style palette. Land: earth tones (tans, olives, soft browns). Water: cool blues/greys. Distinct but low-saturation hues for forest, mountain, desert, arctic so the map reads at a glance without looking garish.
- **UI chrome:** Navy panels, popups, and tooltips (`#1b2838`) with off-white text. Borders are a muted steel blue. Editable fields stay light. Legend and tooltip swatches are opaque colors in the same family as each map style, stronger than the translucent hex fills. The Rubble chip uses that style's opaque urban fill plus a dark-red crosshatch. Backgrounds should recede from the map; borders and dividers stay subtle.
- **Accents:** Restrained. Use a limited set of accent colors for:
  - **Player identification** (e.g., faction color for unit outlines, control shading, minimap).
  - **State and alerts** (e.g., selected unit, pending order, combat, notification).
  - **Semantic states** (e.g., success/warning/error only where needed).
- Avoid saturated primaries everywhere; accents should read clearly without dominating the map or panels.

**Implemented palette (2.10.0). Map colors live in `src/renderer/core/constants.ts`, except the combat bolt and the casualty mark, which take their colors from the SVGs named below. Panel chrome tokens, and the shared button and field rules, are the `:root` variables in `static/shellChrome.css`. The top bar, the console's frame and tab rail, and the game menu are in `static/frameChrome.css`. The console's contents, such as the order groups, the rail counts, the Commanders tab's sections, and the footer status line, are in `static/consoleChrome.css`. The selection panel is in `static/selectionChrome.css`. `--selection-mark` (`#f2c14e`) marks what the player has selected. The footer status line's dot uses `--chrome-disabled` while opponent planning is off, `--chrome-accent-edge` while it is on, and `--chrome-opponent-edge` while the opponent plans. Map overlays and popups are in `static/overlayChrome.css`. Toasts and the battle-result dialog are in `static/feedbackChrome.css`, and the new-game bar and the new-game setup panel are in `static/newGameChrome.css`. The dual-theme rows below are a reference. Chrome is already the navy in the live table; those terrain rows are not a second map theme:**

| Role | Live app | Notes |
|------|----------|--------|
| Map canvas bg | `#e0dcd4` | `BACKGROUND_COLOR` |
| Top bar and console footer bg | `#121b27` | `--chrome-bg-deep` |
| Console tab rail bg | `#141f2d` | `--chrome-rail-bg` |
| Dividers inside the top bar and the rail | `#243246` | `--chrome-divider` |
| Battle header bg / bottom edge | `#17141f` / `#4a3247` | `--battle-header-bg` / `--battle-header-border`. The top bar's face while a battle is open, so the theater reads at a glance |
| Force bar, seat 1 / seat 2 | `#1B8A82` / `#B02A62` | `--force-bar-human` / `--force-bar-opponent`, the same values as `--seat-1-bar` / `--seat-2-bar`. Seats 3 and 4 use `--seat-3-bar` `#EA580C` and `--seat-4-bar` `#3B82F6`. Brighter forms of the seat colors, so the battle header's force bar reads on its dark face |
| Panel, popup, tooltip, and toast bg | `#1b2838` | Console, game menu, legend, hex tooltip, control tips, stack callout, build popup, new-game setup panel, tactical-battles dialog, update toast, message toast, and Reports tab |
| Chrome text / muted | `#f4f6f8` / `#b7c4d4` | Off-white body; blue-gray for secondary lines |
| Chrome error text | `#f0a8a8` | On the navy surfaces only |
| Button face / border / hover | `#115e59` / `#7dcec8` / `#3a6a8f` | Every button, styled like Ready, with white text, except the map's + and − buttons, whose face is `--chrome-bg` (`#1b2838`) with `--chrome-text` glyphs, the same dark slate as the expand control, with `--chrome-bg-raised` on hover and `--chrome-border` on the edge, and the message-popup tabs, whose face stays `--chrome-bg` on hover and when disabled, with the selected tab bold and underlined in `--chrome-accent-edge`. Each side's home randomize button, and the region and starting-month randomize buttons, use the shared teal and match the dropdown beside them. The model-list refresh button sits on the commander popover's model row, to the right of the model selector, and shows a refresh glyph in the button text color. A hire-only map button (`.hire-entry-btn`) rests with face `#7dcec8` (`--button-border`) and border and label `#115e59` (`--button-bg`). On hover it uses the Ready face, the light border, and white text |
| Button off / disabled | `#3b5654` / `#6b8a87` border | Dimmed teal with `#b5c9c7` text for disabled buttons, toggles that are off, and unselected tabs. Message-popup tabs use `--chrome-bg` for that face instead. A + or − button at the zoom limit uses `--chrome-bg-deep` and `--chrome-disabled` instead. A disabled tool-group toggle, or a disabled Start, also fades |
| Text field, dropdown, and checkbox | `#d4efec` / `#0f766e` border | Shared light teal with `#0b3b37` text, distinctly lighter than the button face. Placeholder text is `#456864`. A checkbox uses that same box, with a dark check. Disabled fields and checkboxes are `#9fb8b5` with `#243e3c` text |
| Seat 1 | `#115E59` map, `#1B8A82` bar, `#7DCEC8` text | `--seat-1-map`, `--seat-1-bar`, `--seat-1-text`. Unit fill, order lines, and dice-chip fill use the map color. A two-sided match's first seat stays teal |
| Seat 2 | `#9D174D` map, `#B02A62` bar, `#F0B4C8` text | `--seat-2-map`, `--seat-2-bar`, `--seat-2-text` |
| Seat 3 | `#C2410C` map, `#EA580C` bar, `#FDBA74` text | `--seat-3-map`, `--seat-3-bar`, `--seat-3-text` |
| Seat 4 | `#2563EB` map, `#3B82F6` bar, `#A9C1F5` text | `--seat-4-map`, `--seat-4-bar`, `--seat-4-text` |
| Neutral | `#141414` token, `#1F1F1F` held-hex outline, `#9CA3AF` bar, `#D9D9D9` ring and glyph | `--neutral-map`, `--neutral-outline`, `--neutral-bar`, `--neutral-text`. Not a seat |
| Ranged shot playback | `#a06020` | A ranged shot played back (`RANGE_PERIMETER_RANGED_COLOR`) |
| Air-strike shot playback | `#7a3db5` | An air-strike shot played back (`RANGE_PERIMETER_AIR_STRIKE_COLOR`) |
| Planned attack line, reach outline, and aim chrome | `#B91C1C` | Queued and hover ranged, air-strike, and missile arrows, and the ranged and air-strike reach outlines (`RANGE_PERIMETER_MISSILE_COLOR`, the same value as `--order-missile`). Ranged arrows are solid, air-strike arrows are dashed, and missile arrows are dotted, all at `MOVEMENT_HOVER_VALID_ALPHA` (0.55). The reach outline keeps its animated dash at `RANGE_PERIMETER_ALPHA` (0.75). Launch aiming draws no outline. While a ranged attack, an air strike, or a launch is aimed, the selection panel's border and the pressed reticle use this crimson. The glyph is `static/units/missile.svg`. A missile flight played back uses the launching seat's map color |
| Selection ring | `#f2c14e` | 3 px ring in place of the border of each marker of a hex that holds a selected unit, including both markers of a stack. The upper marker's ring stays above the lower marker's ring (`SELECTION_RING_COLOR`). The same gold as the `--selection-mark` token on selected order rows |
| Order-line casing | `#ffffff` at 80% | A solid outline 1.5 px wider than the line on each side, under every movement, ranged, air-strike, and missile line and its arrowhead (`ORDER_LINE_CASING_COLOR`, `ORDER_LINE_CASING_PAD`) |
| Combat lightning | `#F5C400` | Resolution overlay. The bolt is `resolution/lightning_bolt.svg`, with a `#8A6D00` outline. It is drawn smaller than a unit token |
| Casualty X | `#E53935` | Removal overlay. The mark is `resolution/x_destroyed.svg`, with an `#8E1C1A` outline. It is drawn a little larger than the bolt |
| Dice chip bg / border | `#1b2838` at 92% / `#5a7090` | Resolution dice chips, with the chrome text and muted colors for text and tags. Mini-token fill is the owner's map color, the glyph is white, and the ring is that owner's text color (`miniTokenColors` in `src/shared/seatPalette.ts`). See `src/renderer/rendering/combatDiceChipDrawing.ts` |
| Dice hit / miss | `#86efac` / `#8aa0b8` | Die faces on resolution dice chips |
| Opponent number flag | Side map color, white digit | The size of a country flag (`1.125em` by `0.75em`, `.country-flag` and `.side-number-flag` in `static/overlayChrome.css`). The digit is the opponent index, 1–4 (`aiIndexForSeatId`), centered in the badge (`translateY(0.12em)` on `.side-number-flag span`). Human and Neutral have none. The badge and the country flag, including a unit's origin flag, sit on the midpoint of a system-ui line (`vertical-align: 0.04em`). A button's line is shorter, so a message-tab badge and an origin flag inside an Orders row use `vertical-align: -0.05em`. The battle header caption's line is shorter than the font and clips, so its country flags use `vertical-align: -0.05em` too. The Reports sender row centers the badge on the name (`align-self: center` in `static/consoleChrome.css`). The terrain swatch (`.terrain-swatch`) is the same size and keeps `vertical-align: -0.05em`. Message tabs, opponent loss headers, hex-sentence names, and Reports message rows (`createSideNumberFlag`) all use that shared badge, including the drop shadow and the `0.65em` digit. A message tab does not set its own `vertical-align`, so the button's `-0.05em` still applies, the same offset as an origin flag in an Orders row |
| Loss type token | Side map color, white glyph, text-color ring | A 12px circle before a collapsed loss group such as `4x Infantry` (`createLossTypeToken`). The glyph is mirrored for every side except the human seat, including Neutral. It uses the same `vertical-align: 0.04em` as the country flag, so a mixed loss line shifts the circle and the origin flag together. |
| Mixed stack fill / stroke | `#b0b0b0` / `#222222` | Multi-player hex |

**Suggested palette reference if a dark theme is added later:**

| Role | Light theme example | Dark theme example | Notes |
|------|---------------------|---------------------|--------|
| Ocean / water | `#7a9eb5` | `#3d5a6c` | Cool, low saturation |
| Land / plains | `#c4a574` | `#6b5d4a` | Earth tan |
| Forest | `#5a7a5a` | `#3d523d` | Muted green |
| Mountain | `#8a7a6a` | `#4a423a` | Stone / grey-brown |
| Desert | `#c9b896` | `#6b5d4a` | Sandy, distinct from plains |
| Arctic | `#d8dce4` | `#4a5058` | Cool grey, slight blue |
| UI chrome bg | — | `#1b2838` | Shipped panel, popup, and tooltip fill. `#2a2a2a` is an unused earlier suggestion. |
| Player 1 accent | `#2e5a7b` | `#4a8abb` | Readable on terrain |
| Player 2 accent | `#7b4a2e` | `#bb6a4a` | Distinct from P1 |
| Selection / focus | `#c49b2e` | `#c49b2e` | High visibility |
| Warning | `#a06020` | `#d08030` | Amber/orange |
| Error / critical | `#a03030` | `#c05050` | Muted red |

### 1.4 Layout and Hierarchy

- **Panels:** Subordinate to the map. Use collapsible sidebars and compact bars (top/bottom) so users can reclaim map space. Default to “enough visible to play” rather than “everything open.”
- **Z-order:** Map base → terrain → units and overlays → UI panels. Ensure panels have clear boundaries (background + optional border) so they don’t merge with the map.
- **Spacing:** Consistent padding and gaps within panels and between major regions (e.g., top bar, map, side panel, bottom bar). Avoid cramped blocks of controls or text.

### 1.5 Interaction Model

- **Mouse-primary:** Click to select, click to command. Hover for tooltips and contextual hints. No reliance on touch or gesture for core actions.
- **Keyboard accelerators (live):** WASD and arrow keys pan the map. Mouse wheel zooms toward the cursor. Further accelerators (next unit, documented shortcut overlay) are still target, not shipped.
- **Feedback:** Every meaningful action (order placed, turn committed, unit selected) should have immediate visual (and later, optional audio) feedback so the player never doubts that input was registered.

---

## 2. Controls and Components

### 2.1 Map View

- **Canvas:** The hex map is the main interactive surface. Support pan (e.g., drag or edge-scroll) and zoom (e.g., wheel or pinch) with smooth, predictable behavior. Keep map rendering performant (culling, LOD if applicable).
- **Hex affordance:** Selected hex and hovered hex should be visually distinct (e.g., highlight or outline) without obscuring terrain. Movement range and valid targets (e.g., for an order) should use clear, consistent highlighting (e.g., fill or border).
- **Fortification ticks (live):** A fortified hex draws the same inward ticks on every edge, in the controller's color, gray when ownership is unknown, and hidden while terrain inspection is held. The count is `ceil(4 × fortified / max(intact, fortified))`, clamped to 1..4 when any cell is fortified, and 0 when none are (`fortificationTicksPerEdge` in `src/shared/fortificationTickGeometry.ts`): one tick at 1–25%, two at 26–50%, three at 51–75%, and four at 76–100%. Ticks sit at `k / (n + 1)` along the edge. A battle cell uses the owner in `tacticalFortificationOwnerByH3` and draws four ticks on every edge.
- **Fog of war:** Unexplored (never seen) vs. last-known (previously seen, currently out of sight) must be visually distinct—e.g., darker vs. dimmed, or different treatment (pattern/opacity). Explored and currently visible should look “normal” so the map reads quickly.
- **Minimap:** Implemented. A 280 × 200 px Leaflet overview with a viewport rectangle in an opaque `--chrome-border` line, and a 2 px `--chrome-bg` line on its inside edge, the same opaque color as the expand control, in a navy panel at the map's top-left, over a row of five map-mode tabs (Weather, Tech, Control, Production, Legend). The row is hidden when the app opens; a 32 px square toggle on the overview's lower-left corner, in the selection panel's expand-control style, shows and hides it, and its chevron points down while the row is hidden. The tabs are the console rail's tabs: 56 × 58 px, an 18 px icon above a 9 px label, in the rail's colors (`--chrome-tab-height`, `--chrome-tab-label-size`). A chosen mode gets the console's selected-tab mark: a lighter tab with a teal edge, here on the edge next to the overview. The terrain legend opens as a panel beside it, or under it when the map is too narrow. The + and − buttons are 30 px squares in `--chrome-bg`, the same dark slate as the expand control, at the map's bottom-right, and the scale and attribution sit to their left.

### 2.2 Units and Symbols

- **NATO APP-6–inspired symbols:** Live unit markers use white SVG glyphs under `static/units/` (infantry, armor, naval, air, missile, mixed) drawn on the player-colored circle. A mixed-side stack and the new-game unit tokens use the gray circle and draw that glyph dark. Differentiate unit types by symbol; use player color for ownership.
- **Strategic status icons (live):** Outside a battle and outside battle-detail zoom, status icons sit above each world hex. Weather shows while the Weather tab is on, in either view. Turning Tech on, or holding T, adds the tech icon. One icon is centered; a hex with both shows them side by side, tech on the left, 2 px apart. The files are the same tech and weather SVGs as the hex tooltip. Behavior is in [ux/map-surface.md](ux/map-surface.md).
- **Unit state:** Selection, movement-in-progress, and pending orders should be obvious (e.g., outline, halo, or icon badge). Strength or health (e.g., bars or numeric) should be readable at default zoom without cluttering the map.
- **Stacking:** When multiple units occupy one hex, show stack count and/or a compact summary (e.g., icon + number). Detail on click or in the unit panel.
- **Mercenary badge:** A token that still contains a mercenary draws `$` (`MERCENARY_BADGE_TEXT`) low and centered, in bold 11 px, with a 2 px white stroke and a black fill (`drawMercenaryBadge`).

### 2.3 Top Bar

- **Contents:** Turn number, phase (e.g., Planning / Resolving), and current player or “Your turn” indicator. Global resources (e.g., IPCs or equivalent) if applicable. Keep height minimal.
- **Live app:** A 44 px bar: the game menu button, one chip per side, the Production (`+⚒N`), Credits (`¤N`), Forces, Your home, and Enemy homes readouts (Cities instead of Enemy homes when the match has a turn limit), then the date and turn on two lines, and disabled Settings and Help buttons. Credits is hidden when that side has no treasury readout. It uses the short color when credits are below upkeep (`is-short`, `--chrome-error`). Hire fees are already subtracted from the balance. Captions hide below a 1360 px window. In a battle the bar is the battle header, and Exit Battle sits beside Settings. On the new-game screen the bar is the new-game bar. See [ux/top-bar.md](ux/top-bar.md).
- **Style:** Neutral background, clear labels, numeric values prominent. Use the same type scale as the rest of the UI. Optional: small icons next to resources or phase for quick scanning.

### 2.4 Bottom Bar (Orders and Actions)

- **Contents:** Primary actions for the current context: e.g., “Ready” / “End planning”, “Confirm orders”, “Next unit”, “Cancel”. Context-dependent actions (e.g., “Move”, “Attack”) when a unit is selected and a target is chosen.
- **Style:** Buttons should be clearly clickable (shape, padding, hover state). Primary action (e.g., “Ready”) can be slightly emphasized. Avoid more than a handful of actions at once; use secondary or overflow for less common actions.

### 2.5 Sidebar (Unit / Selection Details)

- **Collapsible:** Allow collapsing or pinning so the map can expand. Remember state (open/closed) per session if feasible.
- **Contents:** Selected unit(s): type, strength, position (hex/coords), movement range, current orders. For stacks: list or summary with expand/collapse. Links to relevant rules or tooltips where helpful.
- **Style:** Same typography and color system as the rest of the UI. Use sections or headings to separate identity, status, and orders. Keep lists scannable (e.g., one line per unit in a stack).
- **Live app:** The selection panel at the map's bottom-left, 440 px wide by default. It opens compact: a 50 px summary bar with an expand control, the hex code and count, a hint for the next map gesture, a reticle button that aims a ranged attack, an air strike, or a missile launch, and the close control. The expand and close controls take the bar's full height at its two ends, 32 px wide, each with a divider on its inner side. A click on the expand control slides the bar up, and the hex's caption and chips and one row per unit open under it; the state lasts for the session. While a ranged attack, an air strike, or a missile launch is aimed, the panel's border and the pressed reticle's face take the planning crimson (`--order-missile`). See [ux/selection-panel.md](ux/selection-panel.md).

### 2.6 Notifications and Alerts

- **Placement:** Non-blocking (e.g., corner or strip) so the map stays usable. Critical alerts (e.g., game-over, connection loss) may use a modal or prominent banner.
- **Content:** Short, actionable text. Use the accent system for severity (e.g., warning vs. error). Optional sound for important events (enemy spotted, turn resolved, unit lost).
- **Persistence:** Allow dismissing or auto-dismissing after a few seconds. Option to review a log or history for recent events.

### 2.7 Modals and Overlays

- **Use sparingly:** Prefer inline panels or bottom/top bars for routine flows (e.g., production, diplomacy). Reserve modals for: game start (scenario/setup), save/load, settings, and critical confirmations (e.g., quit, overwrite).
- **Structure:** Clear title, body content, and primary/secondary actions (e.g., Confirm / Cancel). Ensure focus management and Escape to cancel where appropriate.

### 2.8 Settings and Configuration

- **Grouping:** Logical groups (e.g., Display, Audio, AI/API, Gameplay). Use headings and optional short descriptions for non-obvious options.
- **API key and AI options:** Secure input for API keys; clear labels for model selection and difficulty. Link to documentation or tooltips for “bring your own AI” and cost implications.
- **Accessibility:** Support scaling or high-contrast options if feasible; document keyboard shortcuts and any screen-reader considerations.

### 2.9 Production / Build UI

- **Trigger:** Production is initiated from a production-capable hex (or from a dedicated build menu reachable from the map or top/sidebar). Prefer an inline panel or sidebar section over a full modal so the map stays visible.
- **Contents:** List of buildable units with cost and build time; current resources; optional build queue and ETA. Selection of placement hex when applicable (e.g. production hex). Keep the model simple (e.g. one resource, fixed menu) per Axis & Allies–style design.
- **Live app:** The queue also offers Fortification, one intact city cell per item, at `fortificationCostPerCell()`, and Credits, at `creditsItemCost()`, which adds `CREDITS_PER_ITEM` (20). Neither is a unit and neither has a cap. A hex that can build and hire uses Build and Hire tabs (`.build-popup-tab-bar`). A Hire-only marker uses the class `hire-entry-btn`: resting face `var(--button-border)`, resting border and label `var(--button-bg)`, and on hover the ordinary teal face, light border, and white label. The short-funds line is `.hire-funds-warning` in `var(--chrome-error)` at 11 px. The wide popup is `.build-popup.build-popup-wide` at a 210 px max width, and the plain `.build-popup` max width is 150 px.
- **Style:** Same typography and color system as the rest of the UI. Use the same accent for affordability vs. unaffordable. Clear primary action (e.g. “Build” or “Queue”) and cancel/close.

### 2.10 Replay Controls

**Not shipped.** Target: available when viewing a past turn. Allow stepping through the resolution sequence and, when enabled, viewing the AI’s tool log for that turn. Keep controls in a bar or strip so the map remains dominant.

### 2.11 Async Multiplayer (Turn File Exchange)

**Not shipped.** Target: export a turn file after Ready; import others’ files; show a waiting state. No server.

---

## 3. Application-Specific Guidelines

### 3.1 Wargame Audience

- **Audience:** Strategy and wargame players (e.g., HOI4, Strategic Command, Combat Mission). They expect dense information, clear rules visibility, and a serious tone. Avoid casual or arcade styling.
- **Depth and clarity:** Expose enough data to support analysis (terrain, combat odds, supply) without requiring the manual for every number. Tooltips and an in-app reference manual should fill the gap.
- **Pacing:** Turn-based and WEGO mean the UI can prioritize clarity over speed. Avoid flashing or auto-advancing unless the player opts in (e.g., auto-resolve animation speed).

### 3.2 Turn and Phase Clarity

- **WEGO structure:** Planning vs. resolution must be visually and textually obvious (e.g., “Planning” vs. “Resolving” in the top bar, optional phase-specific styling or icon).
- **Commit moment:** The action that ends planning (e.g., “Ready”) should be unmistakable. After commit, show that orders are locked (e.g., disabled editing, “Resolving…” state).
- **Resolution:** If resolution is animated (movement, combat), keep it readable: units move in a clear order, combat feedback (e.g., flashes, strength change) is visible. Option to speed up or step through for replay.

### 3.3 Fog of War and Uncertainty

- **Consistency:** The same fog rules apply to human and AI. The UI should never imply that the player sees “true” state in fogged areas—only “last known” or “unknown.”
- **Last-known state:** When showing last-known positions (e.g., enemy unit that moved), use a distinct treatment (e.g., faded, dashed, or “last seen” label) so players don’t confuse it with current intel.
- **Fortification ticks:** On an explored hex they follow the same fog rule as city and rubble. An unexplored hex does not draw them. In a battle both sides see the owner color.

### 3.4 AI and LLM Transparency

- **Optional by default:** The console's Commanders tab (Start or Stop, one card per commander, and the tool groups) is part of the console for the whole match. Both labels are 46 px tall, 16 px, weight 600, matching the console footer's Ready button (`#openrouter-run-btn` in `static/shellChrome.css`, `#ready-btn` in `static/frameChrome.css`). Each commander's API key is in that commander's popover. The tab is about the API session, not a full “observatory of the last briefing.” Viewing the last briefing/response as a first-class in-game observatory is still target (milestone 3.2). Debug dumps (`debug-last-*-prompt-N.txt` and `debug-last-openrouter-response-body-N.txt`) exist for developers. N is `aiIndexForSeatId` of the seat being consulted. Opponent 1 writes `debug-last-strategic-prompt-1.txt`.
- **Tone:** Present AI data as “what the AI requested and decided,” not as raw API dumps.

### 3.5 Multi-Resolution and Attention

- **Zoom levels (live):** Strategic H3 resolution 1 and tactical resolution 4 on the global map. A regional map uses that pack's strategic resolution, and tactical cells are three levels below it. Tactical mode clamps pan and zoom to the footprint. Entry is a map magnifier on contested hexes and/or a Fight/Ignore melee-intercept dialog. Exit restores the loaded map's bounds.
- **Attention/focus:** If the game later shows where the player or AI focused attention, use a restrained overlay that doesn’t obscure terrain or units.

### 3.6 Scenarios, Save/Load, and Onboarding

- **New game (live):** A setup panel floating 12 px in from the map's top-left corner, 432 px wide (`--new-game-panel-width`), as tall as its content up to the map, on the selection panel's chrome: a 1 px border, 6 px corners, and a shadow. Its header bar holds a chevron expand control, then the message, and, while a match waits under the screen, a close control; a grip on the top-right corner moves the panel. Collapsed, that bar shows the Start game or New game button in place of the message, and the footer is hidden. While the choices show, the body scrolls and the footer holds that button across its width. The styles are in `static/newGameChrome.css`. The body has three sections under small uppercase titles, divided by rules. Map: Global and Regional tabs. Regional adds a Region row: a label, a dropdown that fills the row, and a 30 px square randomize button. Sides lists two to four rows, each a label, a home dropdown, a randomize square, and, for an AI row, a remove square and a commander button with a centered label. Add another opponent is a full-width button, dashed only while it is disabled. Forces: the Advanced tech line for the map that is showing sits at the right of the title; then Game size and Starting month on one line, the two dropdowns the same width, the month's randomize square at the right; then one row of the five unit types, each the map glyph dark on a small gray disk, the cap in bold, a dot, and the price, such as 12 · ⚒20, following the selected tab and region; then a full-width outline button labeled "Game Options", with that label centered. That button opens a popover holding Victory and Rules. Victory holds the rule and the turn limit on both maps. Deathmatch disables that limit and shows Unlimited. Rules: the four bonus dropdowns (Off, Default, High, starting at Default) in two columns, Origin and Tech, then Terrain and Weather; then Fog of war and Auto-start AI on one row, Auto-start AI to the right, both checked when the overlay opens. Labels have no colons. Controls are 30 px tall, and the commander popover uses that same control height. The footer's Start game reads New game after a match ends. The choices are showing whenever the overlay opens. While they are hidden, the header bar shows that button in place of the message. Drag and the wheel pan and zoom the map beside the panel, and the + and − buttons zoom it, either way. The minimap panel and the terrain legend are hidden while it is open. The console is not on screen. The top bar becomes the new-game bar: the menu button, the title "New game", and Load game…, Settings, and Help. Load game… is enabled. Settings and Help are not. The map fills the rest of the window, beside the panel, and shows that tab's preview: Global is one zoom level closer than the world fit, and Regional frames the selected region. On Global, the preview draws the selected home regions and hides the strategic hex grid until T is held. Holding T draws that grid. A Regional preview always draws its strategic hex grid. Weather icons sit on every strategic hex, and tech icons sit beside them while that hold lasts. The live scenario id is `region_vs_region`. Details are in [new-game-dialog.md](ux/new-game-dialog.md).
- **Save/Load (live):** Save game… in the game menu writes the match to a file. Load game… on that menu and on the new-game bar opens one. A confirm asks before a load replaces a match still being played. The last five turn starts are kept in the app's automatic-save folder. Details are in [ux/save-and-load.md](ux/save-and-load.md) and [save-files.md](save-files.md).
- **End-game summary:** The same setup panel reports the winner and offers New game, with the same hide and show button; territory-over-time charts are still target.
- **Tutorial/onboarding:** Not shipped.

### 3.7 Diplomacy (When Supported)

**Not shipped.** Target: inline panel for relationships and proposals; same data-oriented tone as the rest of the UI.

### 3.8 Theming and Display

- **Light vs. dark:** The map is the light cartographic theme. Panels, popups, tooltips, and the message and update toasts are navy. There is no theme switch. If a second theme is added, test contrast for text and symbols on all terrain types.
- **Window size:** Layout should adapt to reasonable desktop sizes (e.g., 1280×720 minimum target). Panels collapse or reflow so the map remains usable; avoid fixed widths that break on small or ultrawide screens.

---

## 4. Summary Checklist

- [x] Map is the dominant frame; panels are secondary.
- [x] Terrain: muted, topographic palette; fog of war distinct (unexplored vs. last-known).
- [x] Units: APP-6-inspired SVG glyphs; player color; stack counts.
- [x] Minimap; WASD/arrow pan; wheel zoom; + and − buttons at the map's bottom-right.
- [x] Notifications: non-blocking toasts; dismissible.
- [x] WEGO commit action (Ready) is obvious; tactical Fight/Ignore on intercept.
- [x] Production/build UI: inline popup on production hexes.
- [ ] Typography documented as a single named family (live app uses system UI fonts).
- [ ] Full keyboard-shortcut overlay and in-app manual.
- [ ] AI observatory of last briefing (the console's Commanders tab shows Start, commander cards, and the activity log, not a briefing viewer).
- [ ] Replay strip.
- [ ] Async multiplayer turn files.
- [x] Save/load UI.
- [ ] Dark theme.

*This style guide should be updated when new UI patterns ship, so the product retains a consistent, professional wargame character.*
