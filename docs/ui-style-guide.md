# UI Style Guide

*March 2026 target aesthetic; implementation-status note August 2026*

---

This document defines UI aesthetics, control patterns, and application-specific guidelines for the grand strategy wargame. Use it for all UI and map chrome so the product reads as a coherent, serious strategy wargame.

**Implementation status (2.4.0):** The live app is a map-first Electron window: Leaflet world map + canvas overlay, minimap, hex tooltips, stack callout, build-queue popup, OpenRouter side panel, lower-left toasts, WASD/arrow pan, wheel zoom, NATO-inspired SVG unit glyphs, and tactical-entry magnifiers on contested hexes. There is a single light cartographic theme (no dark-mode switch). Player colors are teal human `#115e59` and rose opponent `#9d174d` on background `#e0dcd4`. Unbuilt in this guide: save/load UI, replay strip, async turn-file exchange, diplomacy panel, in-app reference manual, and a documented full keyboard-shortcut overlay.

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
- **UI chrome:** Neutrals (greys, off-whites or dark greys depending on theme). Backgrounds should recede; borders and dividers subtle.
- **Accents:** Restrained. Use a limited set of accent colors for:
  - **Player identification** (e.g., faction color for unit outlines, control shading, minimap).
  - **State and alerts** (e.g., selected unit, pending order, combat, notification).
  - **Semantic states** (e.g., success/warning/error only where needed).
- Avoid saturated primaries everywhere; accents should read clearly without dominating the map or panels.

**Implemented palette (2.4.0, `src/renderer/core/constants.ts`). Suggested dual-theme rows below remain a target, not a second shipped theme:**

| Role | Live app | Notes |
|------|----------|--------|
| UI / map chrome bg | `#e0dcd4` | `BACKGROUND_COLOR` |
| Player 1 (human) | `#115e59` | Unit fill |
| Player 2 (opponent) | `#9d174d` | Distinct from human |
| Selection / slower / warning | `#a06020` | Range perimeter (ranged) |
| Air-strike perimeter | `#7a3db5` | Distinct from ground ranged |
| Combat lightning | `#f0d000` | Resolution overlay |
| Casualty X | `#c03030` | Removal overlay |
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
| UI chrome bg | `#f0eeea` | `#2a2a2a` | Recedes from map |
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

- **NATO APP-6–inspired symbols:** Live unit markers use SVG glyphs under `symbols/` (infantry, armor, naval, air) tinted with player color. Differentiate unit types by symbol; use player color for ownership.
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

**Not shipped (milestone 2.5).** Target: available when viewing a past turn. Allow stepping through the resolution sequence and, when enabled, viewing the AI’s tool log for that turn. Keep controls in a bar or strip so the map remains dominant.

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

- **Zoom levels (live):** Strategic res1 and tactical res4. Tactical mode clamps pan/zoom to the footprint. Entry is a map magnifier on contested hexes and/or a Fight/Ignore melee-intercept dialog. Exit restores world bounds.
- **Attention/focus:** If the game later shows where the player or AI focused attention, use a restrained overlay that doesn’t obscure terrain or units.

### 3.6 Scenarios, Save/Load, and Onboarding

- **New game (live):** Overlay with human/AI home-region selectors, Game size dropdown and cap badges, fog-of-war checkbox, and New game. The live scenario id is `region_vs_region`.
- **Save/Load:** **Not shipped.** Target: named saves, overwrite confirmation, auto-save visibility.
- **End-game summary:** Live overlay reports winner and offers New game; territory-over-time charts are still target.
- **Tutorial/onboarding:** Not shipped.

### 3.7 Diplomacy (When Supported)

**Not shipped.** Target: inline panel for relationships and proposals; same data-oriented tone as the rest of the UI.

### 3.8 Theming and Display

- **Light vs. dark:** Only the light cartographic theme is shipped. If a dark theme is added, test contrast for text and symbols on all terrain types.
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
