# UI Style Guide

*March 2026*

---

This document defines UI aesthetics, control patterns, and application-specific guidelines for the grand strategy wargame. It aligns with the vision (map-dominated desktop app, fog of war, WEGO, LLM opponents) and the development plan’s art direction (Milestone 2.1). Use it for all UI and map chrome so the product reads as a coherent, serious strategy wargame.

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

**Suggested palette reference (implementation may use hex, CSS variables, or equivalents):**

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
- **Keyboard accelerators:** Provide shortcuts for frequent actions (e.g., next unit, end turn, zoom, confirm orders) so experienced players can work quickly. Document them in-app and in the reference manual.
- **Feedback:** Every meaningful action (order placed, turn committed, unit selected) should have immediate visual (and later, optional audio) feedback so the player never doubts that input was registered.

---

## 2. Controls and Components

### 2.1 Map View

- **Canvas:** The hex map is the main interactive surface. Support pan (e.g., drag or edge-scroll) and zoom (e.g., wheel or pinch) with smooth, predictable behavior. Keep map rendering performant (culling, LOD if applicable).
- **Hex affordance:** Selected hex and hovered hex should be visually distinct (e.g., highlight or outline) without obscuring terrain. Movement range and valid targets (e.g., for an order) should use clear, consistent highlighting (e.g., fill or border).
- **Fog of war:** Unexplored (never seen) vs. last-known (previously seen, currently out of sight) must be visually distinct—e.g., darker vs. dimmed, or different treatment (pattern/opacity). Explored and currently visible should look “normal” so the map reads quickly.
- **Minimap:** Small overview for orientation. Use the same terrain and faction colors at low detail. Indicate viewport and, if applicable, attention/focus regions. Keep it unobtrusive (e.g., corner).

### 2.2 Units and Symbols

- **NATO APP-6–style symbols:** Use standard military unit symbols (APP-6 or equivalent) for land, air, naval (and later space) so the audience can read force composition at a glance. Differentiate unit types by symbol shape; use player color for ownership.
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

- **When:** Available when viewing a past turn (e.g. from save/load or a post-turn replay mode). Allow stepping through the resolution sequence of that turn and, when enabled, viewing the AI’s MCP call log for that turn.
- **Placement:** Controls (e.g. previous/next step, play/pause, turn selector) in the bottom bar or a small collapsible strip so the map remains dominant. Avoid covering the map with replay chrome.
- **Feedback:** Current step or phase within the resolution should be visible (e.g. in the top bar or a compact label). Replay is for review and context, not core play—keep controls discoverable but secondary.

### 2.11 Async Multiplayer (Turn File Exchange)

- **Export:** After committing orders, the player can export a turn file. Provide a clear action (e.g. “Export turn file”) and feedback (e.g. path or “Copied to clipboard”). No server; file is shared by the player (e.g. email, cloud drive).
- **Import / combine:** Support loading one or more turn files from other players and running resolution. Flow: load or add files, then “Resolve turn” (or equivalent). Show which players’ files are present and whether resolution can run.
- **Waiting state:** When the game is awaiting other players’ turn files, show an unambiguous state (e.g. “Waiting for turn files” in the top bar or a small banner) and what’s missing, if known. Allow saving and closing; on reopen, same waiting state until files are added and resolution is run.

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

- **Optional by default:** AI observatory and reasoning views are opt-in or gated by a setting so they don’t clutter the default experience.
- **AI observatory panel:** When enabled, show MCP/tool calls and high-level reasoning in a dedicated panel (e.g., collapsible sidebar or bottom drawer). Use monospace or structured formatting for logs; timestamps and turn context help.
- **Tone:** Present AI data as “what the AI requested and decided,” not as raw API dumps. Summaries and filters (e.g., by turn, by type of call) improve usefulness for debugging and curiosity.

### 3.5 Multi-Resolution and Attention (Future)

- **Zoom levels:** When theatre/divisional/brigade zoom exists, the current zoom level should be visible (e.g., in the top bar or a small indicator). Transitions should feel intentional (e.g., smooth zoom or clear “entering divisional view”).
- **Attention/focus:** If the game shows where the player or AI focused attention, use a restrained overlay (e.g., soft tint or outline) that doesn’t obscure terrain or units. Legend or tooltip should explain the visualization.

### 3.6 Scenarios, Save/Load, and Onboarding

- **Scenario selection:** List scenarios with name, short description, and key parameters (map, sides, victory conditions). Single primary action: “Start game.” Optional “Back” or “Settings.”
- **Save/Load:** Clear list of saves (name, date, scenario, turn). Overwrite and delete only with confirmation. Auto-save should be visible (e.g., “Auto-saved at start of turn N”).
- **End-game summary:** After victory or defeat, show a summary (e.g. progression of territory control over the game, key events). Keep it scannable; optional “View replay” or “New game” as primary next actions.
- **Tutorial/onboarding:** If present, keep steps focused and skippable. Use the same UI components and map so the tutorial matches the real game. Avoid long blocks of text; prefer one concept per step with in-context highlighting.

### 3.7 Diplomacy (When Supported)

- **Placement:** Prefer an inline panel or dedicated sidebar section for diplomacy (relationships, proposals, treaties) so the map stays visible. Reserve modals only for critical confirmations (e.g. declaring war, accepting/breaking an alliance).
- **Content:** Show relationship state per player (e.g. ally, neutral, at war); list of proposals or pending offers; clear actions (propose alliance, declare war, negotiate peace). AI-driven diplomacy should be visible in the AI observatory when that panel is enabled.
- **Tone:** Same serious, data-oriented style as the rest of the UI. Treat alliances and betrayals as strategic information, not narrative flair.

### 3.8 Theming and Display

- **Light vs. dark:** If both are supported, ensure terrain and accents work in both. Test contrast for text and symbols on all terrain types.
- **Window size:** Layout should adapt to reasonable desktop sizes (e.g., 1280×720 minimum target). Panels collapse or reflow so the map remains usable; avoid fixed widths that break on small or ultrawide screens.

---

## 4. Summary Checklist

- [ ] Map is the dominant frame; panels are secondary and collapsible.
- [ ] Typography: single sans-serif for UI/data; monospace only for coordinates/IDs/logs.
- [ ] Terrain: muted, topographic palette; fog of war clearly distinct (unexplored vs. last-known).
- [ ] Units: NATO-style symbols; player color; clear selection and order state.
- [ ] Top bar: turn, phase, resources; bottom bar: primary actions (Ready, Confirm, etc.).
- [ ] Sidebar: selection details, collapsible; same visual system as rest of UI.
- [ ] Notifications: non-blocking; optional sound; dismissible.
- [ ] WEGO phase (Planning / Resolving) and commit action are obvious.
- [ ] AI observatory optional; clear, structured presentation of tool calls and reasoning.
- [ ] Keyboard shortcuts for common actions; documented in-app and in manual.
- [ ] Restraint in color and decoration; readability and scannability over flair.
- [ ] Production/build UI: inline panel, cost/queue/ETA, same visual system.
- [ ] Replay: step-through controls in bar or strip; turn/step indicator visible.
- [ ] Async multiplayer: export/import turn files; clear “waiting for turn files” state.
- [ ] End-game summary consistent with style.

---

*This style guide should be updated when new UI patterns (e.g., multi-resolution, diplomacy, replay) are introduced, so the product retains a consistent, professional wargame character.*
