# UI Style Guide

*March 2026 target aesthetic; implementation-status note October 2026*

---

This document defines UI aesthetics, control patterns, and application-specific guidelines for the grand strategy wargame. Use it for all UI and map chrome so the product reads as a coherent, serious strategy wargame.

**Implementation status (2.5.0):** The live app is a map-first Electron window: Leaflet world map + canvas overlay, minimap, hex tooltips, control tips, stack callout, build-queue popup, OpenRouter side panel, a lower-right update toast and an upper-right message toast, WASD/arrow pan, wheel zoom, NATO-inspired SVG unit glyphs, and tactical-entry magnifiers on contested hexes. The map stays the light cartographic theme (no dark-mode switch). Panels, popups, tooltips, and the message and update toasts use navy chrome `#1b2838` with off-white text so flags and weather icons separate from the pale terrain. Every button, including the map buttons, uses the Ready button's teal; text fields and dropdowns use a lighter teal so they read as editable. Player colors are teal human `#115e59` and rose opponent `#9d174d` on map background `#e0dcd4`. Unbuilt in this guide: save/load UI, replay strip, async turn-file exchange, diplomacy panel, in-app reference manual, and a documented full keyboard-shortcut overlay.

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

**Implemented palette (2.5.0). Map colors live in `src/renderer/core/constants.ts`, except the combat bolt and the casualty mark, which take their colors from the SVGs named below. Panel chrome tokens, and the shared button and field rules, are the `:root` variables in `static/shellChrome.css`. Map overlays and popups are in `static/overlayChrome.css`. Toasts and the new-game box are in `static/feedbackChrome.css`. The dual-theme rows below are a reference. Chrome is already the navy in the live table; those terrain rows are not a second map theme:**

| Role | Live app | Notes |
|------|----------|--------|
| Map canvas bg | `#e0dcd4` | `BACKGROUND_COLOR` |
| Panel, popup, tooltip, and toast bg | `#1b2838` | Sidebar, legend, hex tooltip, control tips, stack callout, build popup, new-game box, tactical-battles dialog, lower-right update toast, and upper-right message toast |
| Chrome text / muted | `#f4f6f8` / `#b7c4d4` | Off-white body; blue-gray for secondary lines |
| Chrome error text | `#f0a8a8` | On the navy surfaces only |
| Button face / border / hover | `#115e59` / `#7dcec8` / `#3a6a8f` | Every button, styled like Ready, with white text. The Randomize AI home region button keeps the opponent rose. The home-region and starting-month randomize buttons match their dropdowns' height. The model-list refresh button matches the Run and New buttons beside it |
| Button off / disabled | `#3b5654` / `#6b8a87` border | Dimmed teal with `#b5c9c7` text for disabled buttons, toggles that are off, and unselected tabs. A disabled Tools-tab toggle also fades |
| Text field, dropdown, and checkbox | `#d4efec` / `#0f766e` border | Shared light teal with `#0b3b37` text, distinctly lighter than the button face. Placeholder text is `#456864`. A checkbox uses that same box, with a dark check. Disabled fields and checkboxes are `#9fb8b5` with `#243e3c` text |
| Player 1 (human) | `#115e59` | Unit fill |
| Player 2 (opponent) | `#9d174d` | Distinct from human |
| Selection / slower / warning | `#a06020` | Range perimeter (ranged) |
| Air-strike perimeter | `#7a3db5` | Distinct from ground ranged |
| Combat lightning | `#F5C400` | Resolution overlay. The bolt is `resolution/lightning_bolt.svg`, with a `#8A6D00` outline. It is drawn smaller than a unit token |
| Casualty X | `#E53935` | Removal overlay. The mark is `resolution/x_destroyed.svg`, with an `#8E1C1A` outline. It is drawn a little larger than the bolt |
| Dice chip bg / border | `#1b2838` at 92% / `#5a7090` | Resolution dice chips, with the chrome text and muted colors for text and tags. Mini-token outlines are `#7dcec8` (human) and `#f0b4c8` (opponent). See `src/renderer/rendering/combatDiceChipDrawing.ts` |
| Dice hit / miss | `#86efac` / `#8aa0b8` | Die faces on resolution dice chips |
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
- **Fog of war:** Unexplored (never seen) vs. last-known (previously seen, currently out of sight) must be visually distinct—e.g., darker vs. dimmed, or different treatment (pattern/opacity). Explored and currently visible should look “normal” so the map reads quickly.
- **Minimap:** Implemented. Small Leaflet overview with a viewport rectangle. Same terrain coloring at low detail. Corner placement.

### 2.2 Units and Symbols

- **NATO APP-6–inspired symbols:** Live unit markers use white SVG glyphs under `static/units/` (infantry, armor, naval, air, mixed) drawn on the player-colored circle. A mixed-side stack and the new-game cap tokens use the gray circle and draw that glyph dark. Differentiate unit types by symbol; use player color for ownership.
- **Strategic status icons (live):** Outside a battle and outside battle-detail zoom, one icon sits above each world hex. Weather shows while T is not held. Tech replaces it while T is held. The files are the same tech and weather SVGs as the hex tooltip. Behavior is in [ux/map-surface.md](ux/map-surface.md).
- **Unit state:** Selection, movement-in-progress, and pending orders should be obvious (e.g., outline, halo, or icon badge). Strength or health (e.g., bars or numeric) should be readable at default zoom without cluttering the map.
- **Stacking:** When multiple units occupy one hex, show stack count and/or a compact summary (e.g., icon + number). Detail on click or in the unit panel.

### 2.3 Top Bar

- **Contents:** Turn number, phase (e.g., Planning / Resolving), and current player or “Your turn” indicator. Global resources (e.g., IPCs or equivalent) if applicable. Keep height minimal.
- **Style:** Neutral background, clear labels, numeric values prominent. Use the same type scale as the rest of the UI. Optional: small icons next to resources or phase for quick scanning.

### 2.4 Bottom Bar (Orders and Actions)

- **Contents:** Primary actions for the current context: e.g., “Ready” / “End planning”, “Confirm orders”, “Next unit”, “Cancel”. Context-dependent actions (e.g., “Move”, “Attack”) when a unit is selected and a target is chosen.
- **Style:** Buttons should be clearly clickable (shape, padding, hover state). Primary action (e.g., “Ready”) can be slightly emphasized. Avoid more than a handful of actions at once; use secondary or overflow for less common actions.

### 2.5 Sidebar (Unit / Selection Details)

- **Collapsible:** Allow collapsing or pinning so the map can expand. Remember state (open/closed) per session if feasible.
- **Contents:** Selected unit(s): type, strength, position (hex/coords), movement range, current orders. For stacks: list or summary with expand/collapse. Links to relevant rules or tooltips where helpful.
- **Style:** Same typography and color system as the rest of the UI. Use sections or headings to separate identity, status, and orders. Keep lists scannable (e.g., one line per unit in a stack).

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
- **Style:** Same typography and color system as the rest of the UI. Use the same accent for affordability vs. unaffordable. Clear primary action (e.g. “Build” or “Queue”) and cancel/close.

### 2.10 Replay Controls

**Not shipped (milestone 2.6).** Target: available when viewing a past turn. Allow stepping through the resolution sequence and, when enabled, viewing the AI’s tool log for that turn. Keep controls in a bar or strip so the map remains dominant.

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

### 3.4 AI and LLM Transparency

- **Optional by default:** The OpenRouter panel (model, key, status, tool-count) is always in the layout but is about *your* API session, not a full “observatory of the last briefing.” Viewing the last briefing/response as a first-class in-game observatory is still target (milestone 3.2). Debug dumps (`debug-last-*-prompt.txt`) exist for developers.
- **Tone:** Present AI data as “what the AI requested and decided,” not as raw API dumps.

### 3.5 Multi-Resolution and Attention

- **Zoom levels (live):** Strategic H3 resolution 1 and tactical resolution 4 on the global map. A regional map uses that pack's strategic resolution, and tactical cells are three levels below it. Tactical mode clamps pan and zoom to the footprint. Entry is a map magnifier on contested hexes and/or a Fight/Ignore melee-intercept dialog. Exit restores the loaded map's bounds.
- **Attention/focus:** If the game later shows where the player or AI focused attention, use a restrained overlay that doesn’t obscure terrain or units.

### 3.6 Scenarios, Save/Load, and Onboarding

- **New game (live):** Overlay with Global and Regional tabs. Global has human/AI home-region selectors, each with a randomize button. Regional has one centered region selector with the same teal square randomize button, and human/AI side-group selectors, each with a randomize button. The two home-region dropdowns, the region dropdown, and the two side-group dropdowns share one closed width, wide enough for the longest name in the home-region lists and the region list. A longer side name does not widen a side dropdown. After each unit type, its price in parentheses, such as Infantry ($20), follows the selected tab and region. The game size dropdown sits above an Advanced tech line for the map that is showing, and the cap badges draw the map glyphs dark on gray disks. Two option lines (Origin bonus / Tech bonus, then Terrain bonus / Weather bonus) of dropdowns (Off, Low, High, default Low) whose labels end in colons sit outside the tabs, then a row with Fog of war, a slash separator, and a "Starting month:" dropdown only as wide as its longest month, and a square randomize button matching the human home-region button, and New game. The overlay has no dark veil. Its upper-left corner is the minimap's usual corner, and a teal square there, the same size as a randomize button, hides the form or shows it again. The form is showing whenever the overlay opens. While the form is hidden, only that square remains, and drag and the wheel pan and zoom the map behind it. The minimap, the terrain legend, and the map's + and − zoom control are hidden while it is open. The right panel is not on screen, and the map fills the window. The map behind it shows that tab's preview: Global is one zoom level closer than the world fit, and Regional frames the selected region. On Global, the preview draws the selected home regions and hides the strategic hex grid until T is held. Holding T draws that grid. A Regional preview always draws its strategic hex grid. Weather icons sit on every strategic hex until that hold, and tech icons replace them while it lasts. The live scenario id is `region_vs_region`. Details are in [new-game-dialog.md](ux/new-game-dialog.md).
- **Save/Load:** **Not shipped.** Target: named saves, overwrite confirmation, auto-save visibility.
- **End-game summary:** The same overlay reports the winner and offers New game, in that same corner, with the same hide and show button; territory-over-time charts are still target.
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
- [x] Minimap; WASD/arrow pan; wheel zoom.
- [x] Notifications: non-blocking toasts; dismissible.
- [x] WEGO commit action (Ready) is obvious; tactical Fight/Ignore on intercept.
- [x] Production/build UI: inline popup on production hexes.
- [ ] Typography documented as a single named family (live app uses system UI fonts).
- [ ] Full keyboard-shortcut overlay and in-app manual.
- [ ] AI observatory of last briefing (OpenRouter panel is session/status, not a briefing viewer).
- [ ] Replay strip.
- [ ] Async multiplayer turn files.
- [ ] Save/load UI.
- [ ] Dark theme.

*This style guide should be updated when new UI patterns ship, so the product retains a consistent, professional wargame character.*
