# Multi-commander games, stage 4: interface

Audience: a **lower-quality coding agent**. Read [multi-commander-execution-plan.md](multi-commander-execution-plan.md) first. Its working rules, verification bar, decisions, and glossary apply here. Stages 1 to 3 must be complete.

Goal of this stage: every screen in the mockups. Each phase names its expected image (`multi-commander-4-expected-*.png`, next to this file). The images show the target layout, wording, colors, and states; this text wins where they differ (see [Expected images](multi-commander-execution-plan.md#expected-images)).

Before you start any phase here, read [doc/ux-specification.md](../doc/ux-specification.md) (its routing table and cross-cutting documents) and [doc/ui-style-guide.md](../doc/ui-style-guide.md). Each phase names the UX documents to read before coding and to update afterwards.

**How renderer logic is tested.** `src/renderer` has no unit tests. Put every piece of logic that decides *what* to show (labels, ordering, filters, which rows exist, which control is enabled) in a pure function under `src/shared/` with a `*.test.ts` next to it. Keep the renderer code to wiring and DOM. Every phase below lists those shared functions.

**Every phase in this stage** also runs `npm run build:renderer` and ends with a manual check against its expected image. To create multi-seat matches before phase 4.3 exists, the manual checks start in phase 4.3.

## Phases

| Phase | Title | Expected image |
| --- | --- | --- |
| 4.1 | Seat palette on the map | `seat-colors` |
| 4.2 | Names, tooltips, and the selection panel | `reports-knockout` (tooltip) |
| 4.3 | New game: Sides, Observe, Victory, turn limit | `new-game`, `new-game-global`, `new-game-observe` |
| 4.4 | Commander popover | `new-game` (popover) |
| 4.5 | Top bar for several sides | `commanders-tab` (top bar), `top-bar-turn-limit` |
| 4.6 | Commanders tab and footer | `commanders-tab`, `commander-states` |
| 4.7 | Reports, messages, and notices | `reports-knockout` |
| 4.8 | Turn reports for several sides | `reports-knockout` (T8 turn report) |
| 4.9 | Tactical battles list and battle header | `battles-list`, `battle-header`, `battle-header-neutral` |
| 4.10 | Game over standings and the knocked-out dialog | `game-over` |
| 4.11 | Observe mode | `observer` |
| 4.12 | UI smoke for several sides | none |

---

## Phase 4.1: Seat palette on the map

**Goal.** Colors come from seat order ([D3](multi-commander-execution-plan.md#setup)), not from two fixed players. Neutral draws black. A two-sided match looks exactly as before (seat 1 teal, seat 2 rose are today's colors).

**Read first.** `PLAYER_COLORS`, `ORDER_LINE_COLOR`, `AI_ORDER_LINE_COLOR`, `MULTI_PLAYER_FILL` in `src/renderer/core/constants.ts`; `src/renderer/rendering/unitDrawing.ts`; `src/renderer/rendering/terrainRendering.ts`; `src/renderer/rendering/pathDrawing.ts`; `src/renderer/rendering/combatDiceChipDrawing.ts`; `resolveOwnershipBorderStyle`, `resolveHomeRegionOwnerIdentity`, `HomeRegionOwnerIdentity`, `classifyHomeRegionOutlineState` in `src/shared/homeRegionRules.ts`; the `:root` tokens in `static/shellChrome.css`; `doc/ui-style-guide.md` palette table; `doc/ux/map-surface.md`, `doc/ux/map-overlays.md`.

**Change.**

1. Create `src/shared/seatPalette.ts` (new):

   ```ts
   export interface OwnerPalette { readonly map: string; readonly forceBar: string; readonly text: string; }
   export const SEAT_PALETTES: readonly OwnerPalette[];          // index 0 = seat order 1, values from D3
   export const NEUTRAL_PALETTE: OwnerPalette & { readonly heldHexOutline: string };
   export function paletteForOwner(ownerId: string | null, seats: readonly Pick<SeatSnapshot, 'seatId' | 'seatOrder'>[]): OwnerPalette | null;
   ```

   `paletteForOwner` returns the seat's palette by its `seatOrder`, `NEUTRAL_PALETTE` for `'neutral'`, and null for `null` or an unknown id.
2. Replace every use of `PLAYER_COLORS`, `ORDER_LINE_COLOR`, and `AI_ORDER_LINE_COLOR` with `paletteForOwner(owner, S.gameState?.seats ?? [])`. Delete the three constants when nothing uses them.
3. Unit tokens (`unitDrawing.ts`): a hex holding one owner fills with that owner's `map` color; a hex holding several owners keeps `MULTI_PLAYER_FILL`. A Neutral token is `NEUTRAL_PALETTE.map` (`#141414`) with a ring and glyph in `NEUTRAL_PALETTE.text` (`#D9D9D9`); see the Neutral card in the expected image. Glyphs flip for every owner that is not the human seat (today they flip for `'opponent'`). Stale-intel ghosts use the palette of the owner the intel recorded.
4. Hex borders and home outlines (`terrainRendering.ts`, `homeRegionRules.ts`):
   - `OwnershipBorderStyle` stops naming two players. Make it `{ kind: 'none' } | { kind: 'normal' | 'outlined'; ownerId: string } | { kind: 'outlinedNeutral' }`, and draw with `paletteForOwner(ownerId).map`.
   - A hex whose controller is `'neutral'` draws `NEUTRAL_PALETTE.heldHexOutline`. A hex with a `null` controller draws as today.
   - `HomeRegionOwnerIdentity` becomes `{ kind: 'single'; seatId: string } | { kind: 'shared' } | null`; the dashed inner ring uses the single home owner's color, or `MULTI_PLAYER_STROKE` when shared.
   - The selected-hex outline uses the human seat's color (seat 1 teal in a two-sided match, as today).
5. Order lines (`pathDrawing.ts`) and dice chips (`combatDiceChipDrawing.ts`): the moving or rolling owner's `map` and `text` colors.
6. CSS: add `--seat-1-map` to `--seat-4-map`, `--seat-1-bar` to `--seat-4-bar`, `--seat-1-text` to `--seat-4-text`, and `--neutral-map`, `--neutral-outline`, `--neutral-bar`, `--neutral-text` to `:root` in `static/shellChrome.css`. Keep `--player-human` and `--player-opponent` only where they still mean seat 1 and seat 2 in markup that later phases replace; note each remaining use in your report.

**Shared tests.** `src/shared/seatPalette.test.ts` (new): seat orders 1 to 4 give D3's values; `'neutral'` gives the Neutral palette; `null` gives null. `src/main/homeRegionRules.test.ts`: the new `OwnershipBorderStyle` and `HomeRegionOwnerIdentity` shapes for a three-home case.

**Docs.** `doc/ui-style-guide.md`: replace the "Player 1 (human)" and "Player 2 (opponent)" rows with the four seat rows and the Neutral row; keep the "already in use, kept off the seat list" colors listed (ranged order `#A06020`, air strike `#7A3DB5`, selection `#F2C14E`, casualty `#E53935`, mixed stack `#B0B0B0`). `doc/ux/map-surface.md` and `doc/ux/map-overlays.md`: border and token colors by seat, Neutral outline.

**Manual check.** Two-sided regression only: start a two-sided match; tokens, borders, order lines, and dice chips look exactly as before.

---

## Phase 4.2: Names, tooltips, and the selection panel

**Goal.** Every place that names a side, a unit, or a hex owner uses the roster. "Neutral" and "Unknown" follow [D16](multi-commander-execution-plan.md#knockout-and-neutral).

**Read first.** `getTooltipControlLabel` in `src/renderer/map/terrainTooltipHtml.ts`; `formatHomeRegionAssignmentControlSuffix` in `src/shared/homeRegionRules.ts`; `buildSelectionPanelChips` and `summarizeSelectionPanel` in `src/shared/selectionPanelSummary.ts`; `buildUnitDisplayNameLookup` and `buildKillLabelUnitRoster` in `src/shared/unitDisplayNames.ts`; `src/renderer/map/stackCallout.ts`; `doc/ux/hex-tooltips.md`, `doc/ux/selection-panel.md`, `doc/ux/stack-callout.md`, `doc/ux/control-tooltips.md`.

**Change.**

1. Create `src/shared/sideLabels.ts` (new):

   ```ts
   /** "Control:" text for a world hex the viewer can see. */
   export function formatHexControlLabel(args: {
     readonly controllerId: string | null;
     readonly homeSeatIds: readonly string[];          // seats whose home contains the hex
     readonly viewerSeatId: string | null;             // null in Observe mode
     readonly seats: readonly SeatSnapshot[];
   }): string;
   /** A unit's name as a given viewer should read it. */
   export function formatUnitNameForViewer(args: {
     readonly baseName: string;                        // from buildUnitDisplayNameLookup, e.g. "XI Armored"
     readonly ownerId: string;
     readonly viewerSeatId: string | null;
     readonly seats: readonly SeatSnapshot[];
   }): string;
   ```

   `formatHexControlLabel`:
   - Controller is a seat: its full display name, which is `seat.homeRegion` ("Western Turkey"; the viewer's own seat reads "You"). The short name is `shortSideName` of that.
   - Controller is `'neutral'` or `null`: "Neutral".
   - Then a suffix from the home: in the viewer's own home, " (your home)"; in one other active seat's home, " ({full name} home)"; in a knocked-out seat's home, " (was {full name})"; in two or more homes, " ({A} & {B} homes)". No home, no suffix.
   - The caller still decides visibility and passes nothing for a hidden hex, which shows "Unknown" as today.

   `formatUnitNameForViewer`: when the owner is the viewer's seat, or the match has two seats, return `baseName`. When the owner is Neutral, return "Neutral · {baseName}". Otherwise return "{short name} · {baseName}".
2. Use `formatHexControlLabel` in `getTooltipControlLabel`. Delete `formatHomeRegionAssignmentControlSuffix` when nothing uses it.
3. Use `formatUnitNameForViewer` wherever the renderer shows another owner's unit name: the stack callout rows (when the header already names the side, as in the expected `commanders-tab` image, the rows may use `baseName`), hover and tooltip names, kill labels in reports and toasts, the selection panel.
4. Selection panel chips: "Home" for the viewer's own home; "{short name} home" for another seat's home; "Neutral" for Neutral land. `summarizeSelectionPanel` counts the viewer's units (human seat), as today.

**Shared tests.** `src/shared/sideLabels.test.ts` (new): every branch of both functions, including a two-seat match with no prefix, a three-seat match with a prefix, Neutral, a knocked-out home, a shared home, and Observe mode (viewer null). Update `selectionPanelSummary.test.ts` for the chip labels.

**Docs.** `doc/ux/hex-tooltips.md` (Control line), `doc/ux/selection-panel.md` (chips), `doc/ux/stack-callout.md` (names), `doc/ux/control-tooltips.md` Source Anchors if a symbol moved.

**Manual check.** Two-sided regression: the tooltip reads "Control: Iraq & Kuwait (your home)" style text instead of "Human (Human Home Region)". Confirm with the human that this wording change is visible and expected.

---

## Phase 4.3: New game: Sides, Observe, Victory, turn limit

**Goal.** The new-game panel sets up two to four sides on both tabs, with or without a human, and sends `seats` and `turnLimit`. Expected images: `new-game` (regional, four sides), `new-game-global` (three sides, the region list open), `new-game-observe` (Observe only ticked).

**Read first.** `static/index.html` (`#game-over-overlay` and everything in it); `src/renderer/gameplay/newGame.ts` (`registerNewGameButton`); `newGameMapUi.ts`; `newGameRegionUi.ts`; `newGameMapPreviewUi.ts`; `src/renderer/map/newGameMapPreviewRendering.ts`; `src/shared/newGameMapPreviewTypes.ts`; `src/main/gameMap/newGameMapPreview.ts`; `doc/ux/new-game-dialog.md`.

**Layout** (match the images):

- **Map** section: the Global and Regional tabs. On Regional, the Region row with its randomize button, as today.
- **Sides** section (new), on both tabs:
  - A caption: "{n} of {max} sides in play" (with a human) or "{n} of {max} sides, all AI" (Observe), where `max` is `min(MAX_SEATS, available homes)`.
  - A checkbox "Observe only: an AI commander plays every side".
  - One row per side. With a human, the first row is "You" with a home select and a randomize button; then "Opponent 1", "Opponent 2", … each with a home select, a randomize button, a remove button (×), and a commander summary button below. In Observe mode the rows are "Side 1" to "Side n", each with all four controls.
  - A row-adding button: "Add another opponent" (or "Add another side" in Observe mode), disabled with a hint when no home is free ("No free side on this map") or when four sides are in play ("Up to 4 sides").
  - Home selects: regional rows list the map's side groups; global rows list UN subregions. Homes another row already took are disabled and labeled "{name} · {row name}" (for example "Southern Asia · Opponent 1"; the image shows the row name right-aligned).
- **Victory** section (new): a select with one option, "Last side standing" on Regional and "Most city hexes at turn limit" on Global. On Global only, a "Turn limit" select with `TURN_LIMIT_OPTIONS` ("20 turns" … "50 turns", default 30).
- **Forces** and **Rules** sections stay as they are.
- Delete the old "Human"/"AI" rows on the Global tab, the "Your side"/"Opponent" rows on the Regional tab, and the disabled "Add another opponent" placeholder.

**Change.**

1. Create `src/shared/newGameSides.ts` (new), the pure model behind the section:

   ```ts
   export interface NewGameSideRow { readonly kind: 'human' | 'ai'; readonly homeKey: string | null; readonly commander: NewGameSeatInput['commander'] | null; }
   export interface NewGameSidesState { readonly mapKind: 'global' | 'regional'; readonly observeOnly: boolean; readonly rows: readonly NewGameSideRow[]; }
   export function initialSidesState(args: { mapKind; homes: readonly HomeOption[]; defaultCommander; rowCount?: number }): NewGameSidesState; // default two rows: You + Opponent 1, distinct homes; rowCount keeps the count when the map or tab changes and enough homes remain
   export function setObserveOnly(state, on: boolean, defaultCommander): NewGameSidesState;     // "You" becomes "Side 1" with a commander, and back
   export function addSideRow(state, homes, defaultCommander): NewGameSidesState;               // first free home
   export function removeSideRow(state, index: number): NewGameSidesState;                      // never below MIN_SEATS
   export function setRowHome(state, index: number, homeKey: string): NewGameSidesState;         // refuses a taken home
   export function randomizeRowHome(state, index: number, homes, random: () => number): NewGameSidesState;
   export function rowLabel(state, index: number): string;                                      // "You", "Opponent 1", "Side 2"
   export function homeOptionsForRow(state, index: number, homes): readonly { key; label; disabled: boolean; takenBy: string | null }[];
   export function sidesCaption(state, homes): string;
   export function addRowBlockedReason(state, homes): string | null;                            // "No free side on this map", "Up to 4 sides", or null
   export function startBlockedReason(state): string | null;                                    // fewer than two rows, a duplicate home, or a missing home
   export function buildSeatsPayload(state): readonly NewGameSeatInput[];
   ```

   `HomeOption` is `{ key, label }`: a side group id and display name (regional) or a region name twice (global). Changing the map or tab calls `initialSidesState` with `rowCount` set to the current count, capped by the homes that remain and by `MAX_SEATS`.
2. Create `src/renderer/gameplay/newGameSidesUi.ts` (new): renders the section from the state and wires the controls to the model functions. The commander summary button shows `formatCommanderSummary` (phase 4.4 adds it; until then show the model label or "No model"). The default commander for new AI rows is the app-wide saved model and reasoning effort with doctrine Balanced.
3. Map preview: `NewGameMapPreviewRequest` sends the rows' homes in row order (both scopes); `buildNewGameMapPreview` returns `homeRegionHexesBySeatOrder: string[][]`; `newGameMapPreviewRendering.ts` outlines each home in its seat color (seat 1 teal, and so on; in Observe mode side 1 is teal).
4. Start: `window.gameApi.newGame({ …options, seats: buildSeatsPayload(state), turnLimit })`. Delete `readNewGameMapChoice`'s side ids and `getSelectedScenarioRegions`. Leave `humanHomeRegion`, `aiHomeRegion`, `humanSideGroupId`, and `aiSideGroupId` on `NewGameIpcPayload`, `ResetGameForNewMatchOptions`, and `NewGameMapPreviewRequest` until stage 5. The new screen stops sending them. The reset's two-seat translation of those fields stays for tests until stage 5.
5. Banner text: "Start a new regional game when ready." and "Start a new global game when ready." stay as today.

**Shared tests.** `src/shared/newGameSides.test.ts` (new): every function above, including: a three-group map caps at three rows; Observe on and off keeps homes and turns "You" into "Side 1"; a taken home is disabled and labeled with the taking row's name; removing a row frees its home; `startBlockedReason` for a duplicate home; `buildSeatsPayload` order and kinds.

**Docs.** `doc/ux/new-game-dialog.md`: Sides, Observe, Victory, Turn limit (requirements, inputs, the hints). `doc/how-to-play.md`: setup paragraph.

**Manual check.** Against `new-game`, `new-game-global`, `new-game-observe`:

1. Regional, Western Asia North: add opponents up to four sides; the add button disables with "No free side on this map"; remove one; randomize one; start. The match has four sides on the map in four colors.
2. Global: three sides; in Opponent 2's list, the regions of You and Opponent 1 are disabled and labeled; start with turn limit 30.
3. Observe only: four AI sides; start; nobody is "You" (the interface for observing comes in phase 4.11; the match must start and resolve a turn with Ready).

---

## Phase 4.4: Commander popover

**Goal.** One popover sets an AI seat's model, reasoning effort, and doctrine, from the new-game rows and (in phase 4.6) from the Commanders tab cards. Expected image: `new-game` (the open popover).

**Read first.** The Opponent tab's model select and reasoning select in `src/renderer/openRouter/openRouterControls.ts` (`initOpenRouterUI`), `src/renderer/openRouter/reasoningEffortSelect.ts` (`attachReasoningEffortSelect`), `formatModelOptionLabel` and `modelNameFromOptionLabel` (`src/shared/openRouterModelDisplay.ts`, `src/shared/opponentPlanningStatus.ts`), `doc/ux/opponent-tab-commander.md`.

**Change.**

1. `src/shared/commanderSummary.ts` (new): `formatCommanderSummary({ modelLabel: string | null; reasoningEffort: string | null; doctrineChoice: DoctrineChoice; revealedDoctrine?: Doctrine | null }): string`.
   - No model: "No model · standing orders only".
   - Otherwise "{model name without the provider prefix}", then " · {reasoning effort label}" only when an effort is set, then " · {doctrine label}". A random doctrine reads "Random", or "Random, drew {Doctrine}" when `revealedDoctrine` is given.
   - Examples from the images: "Gemini 3.5 Flash · Minimal · Aggressive", "Nova Lite 1.0 · Cautious", "Claude Haiku 5.5 · Low · Random".
2. `src/renderer/openRouter/commanderPopover.ts` (new): a popover anchored to the summary button, titled "{row name} commander", with:
   - Model: the same model list the Opponent tab uses, including "— Select model —" for no model.
   - Reasoning: the same reasoning select, hidden when the model has none.
   - Doctrine: Aggressive, Balanced, Cautious, Random, with the selected choice's description from `DOCTRINE_CHOICE_DESCRIPTIONS` below it.
   - A "Use for every opponent" button (in Observe mode: "Use for every side") that copies the three settings to every AI row.
   - A close button; Escape and an outside click close it.
3. In the new-game panel, the popover edits the row's commander in `NewGameSidesState`. Choosing a model also saves it as the app-wide default (today's `setSelectedModel`), so the next new game starts from it.
4. The popover is a component with an `onChange(commander)` callback, so phase 4.6 reuses it with `gameApi.setSeatCommander`.

**Shared tests.** `src/shared/commanderSummary.test.ts` (new): the three image examples, no model, and a revealed random draw.

**Docs.** `doc/ux/opponent-tab-commander.md` (rename or extend to a commander popover document; register it in `doc/ux-specification.md`'s routing table if you create a new file).

**Manual check.** Against the `new-game` image: open Opponent 1's commander, change each setting, see the summary update, press "Use for every opponent", and start a match; the Commanders data in the snapshot (`seats`) matches what was chosen.

---

## Phase 4.5: Top bar for several sides

**Goal.** The top bar shows every side, each enemy's planning status, knocked-out sides, the home readouts for several enemies, and the Cities readout in turn-limit matches. Expected images: the top bar of `commanders-tab` and of `reports-knockout`, and `top-bar-turn-limit`.

**Read first.** `src/renderer/chrome/topBar.ts`; `computeTopBarStats`, `formatTopBarStatParts` in `src/shared/topBarStats.ts`; `#app-topbar` in `static/index.html`; `.topbar-side-mark-*` in `static/frameChrome.css`; `doc/ux/top-bar.md`.

**Change.**

1. Sides block, with a human seat: the human's full name with its seat dot, "vs", then one chip per other seat in seat order: seat dot, short name, and a status icon from the pool (`game:readCommanderPool`):
   - planning: an arc glyph in the seat's `text` color, `aria-label="Planning"`;
   - ready: a check in `#86EFAC`, `aria-label="Orders ready"`;
   - no model or timed out: no icon;
   - knocked out: a dimmed dot, the name struck through, and "out T{N}" in muted text.

   In Observe mode the block is "Observing" with an eye icon and one chip per seat; phase 4.11 adds View as.
2. `computeTopBarStats` takes the viewer's seat id instead of hard-coding `'human'`. The viewer is the active human seat. When that seat is absent, pass null: omit Your home and Enemy homes, and do not throw. Phase 4.11 passes the View-as seat when the human is watching as one seat, and null when View as is all sides.
   - Your home: the viewer's own home, as today. Omitted when the viewer is null.
   - Enemy homes (renamed from Enemy home): hexes of every **active** enemy seat's home that the viewer controls, over the total hexes of those homes. Omitted when the viewer is null.
   - In a turn-limit match: a Cities readout, "{n} · {place} of {seats}", where `place` comes from `rankSeatsByCityHexes` over active seats. Move that function from `endOfTurnOutcomeRules.ts` to `src/shared/victoryRules.ts`, and update every importer, including the engine and its tests. Do not leave a second copy. The tooltip lists every active seat's city hexes, highest first, with "(you)" after the viewer when there is one, under the caption "City hexes held. Most at the end of turn {L} wins. A tie leaves no single winner." In a turn-limit match, Enemy homes is not shown (see the image). A null viewer still gets the Cities readout, with no "(you)".
3. Date block: "Turn {n} of {L} · {phase}" in a turn-limit match; unchanged otherwise.
4. Narrow windows: today's rules (captions hide below 1360 px, names shorten below 1100 px) apply to every chip.

**Shared tests.** `src/shared/topBarStats.test.ts`: Enemy homes over two active enemies; a knocked-out enemy's home leaves the total; the Cities readout and place with a tie; a null viewer omits Your home and Enemy homes and still shows Cities, with no "(you)". Add `src/shared/topBarSides.test.ts` (new) for a pure `buildTopBarSideChips(seats, statuses, viewerSeatId)` you create in `src/shared/topBarSides.ts` (new).

**Docs.** `doc/ux/top-bar.md`.

**Manual check.** Four-sided match: chips show planning and ready icons as commanders work ("No model" commanders show none); knock a side out (play until it happens, or ask the human to accept a test database prepared with SQL) and see the struck-through chip. Global three-sided match with a turn limit: the Cities readout and its tooltip.

---

## Phase 4.6: Commanders tab and footer

**Goal.** The Opponent tab becomes the Commanders tab: one card per AI seat with its status, time, cost, and commander summary. The footer reports how many commanders are ready. Expected images: `commanders-tab`, `commander-states`, and the footer of `observer`.

**Read first.** `CONSOLE_TABS` and `refreshConsoleHeader` in `src/renderer/chrome/consoleFrame.ts`; `#console-panel-opponent` and `#console-tab-opponent` in `static/index.html`; `initOpenRouterUI` in `src/renderer/openRouter/openRouterControls.ts`; `renderOpponentStatus`, `updateReadyButtonState`, `setReadyButtonLabelAiWait` in `src/renderer/openRouter/openRouterUiHelpers.ts`; `appendOpenRouterLog`; `src/shared/opponentPlanningStatus.ts`; `doc/ux/console.md`, `doc/ux/opponent-tab-commander.md`, `doc/ux/opponent-tab-tool-groups.md`, `doc/ux/ai-activity-log.md`, `doc/ux/console-command-bar.md`.

**Change.**

1. Rail tab label "Command" (the existing tab element; keep its id or rename it to `#console-tab-commanders` and update every reference). Panel title "Commanders"; subtitle "{n} opponents" with a human, "{n} sides, observing" in Observe mode.
2. Panel content, top to bottom (see the image):
   - The Run toggle and a sentence: "Planning is on for all {n} commanders." / "Planning is off."
   - The API key row and the model-list refresh button, as today. Delete the old model and reasoning selects from this tab.
   - A list titled "Commanders" with "cost this match" on the right. One card per AI seat in seat order: seat dot and full name; a status chip; the seat's cost; the commander summary button (opens the phase 4.4 popover; changes go to `gameApi.setSeatCommander`). Status chips, from `src/shared/commanderCardState.ts` (new, pure):
     - planning: "Planning {m:ss}";
     - ready: "Ready";
     - no model: "Standing orders" (summary reads "No model · standing orders only");
     - timed out: "Timed out", plus a line under the name: "No reply in {m:ss of AI_CONSULTATION_WALL_CLOCK_MS} on turn {N}. Its standing orders ran instead.";
     - out: "Out, turn {N}"; the card is dimmed and its summary button is disabled.
   - Tool groups, as today; caption "uses since last Ready, all".
   - Activity log, with a filter select: "All commanders", then each AI seat. Each log line starts with the turn tag and the seat's short name, as in the image. Main's log lines for a consult must carry the seat id; add it where main forwards consult logs.
3. Delete the stage-3 compatibility that copied the app-wide model into the `'opponent'` seat during a match (phase 3.4, step 5, second half): the Opponent tab's model select no longer exists.
4. Footer status line (`#opponent-status-line`): "Commanders planning · {ready} of {active} ready" while any is planning, "Commanders ready" when all are, and the total cost on the right. Ready button while waiting: "AI: {m:ss} · {k} planning". Keep the `data-status` values off, on, and planning. In Observe mode the line reads "Planning · {ready} of {active} ready".

**Shared tests.** `src/shared/commanderCardState.test.ts` (new): each state's chip text and extra line; `src/shared/opponentPlanningStatus.test.ts`: the new footer strings.

**Docs.** `doc/ux/console.md` (tab name), `doc/ux/opponent-tab-commander.md` (Commanders panel; rename the file if you like, and fix the routing table), `doc/ux/ai-activity-log.md` (filter, seat prefix), `doc/ux/console-command-bar.md` (footer).

**Manual check.** Against `commanders-tab` and `commander-states`, in a four-sided match with "No model" commanders, then (only if the human chooses to spend) one cheap model for one seat to see Planning and Ready.

---

## Phase 4.7: Reports, messages, and notices

**Goal.** Reports know who sent each message, can be filtered by sender, show knockouts as notices, and hide strategies when a human plays ([E6](multi-commander-execution-plan.md#engineering-decisions-frozen-unless-the-owner-overrides)). Expected image: `reports-knockout`.

**Read first.** `recordConsoleReport` in `src/renderer/chrome/consoleReports.ts`; `src/shared/consoleReportLog.ts`; `showAiStrategyToast` and `showMapToast` in `src/renderer/openRouter/openRouterUiHelpers.ts`; `src/shared/aiStrategyToastContent.ts`; `doc/ux/reports-tab.md`, `doc/ux/notifications-and-feedback.md`.

**Change.**

1. `recordConsoleReport(kind, tag, body, meta?)` with `meta: { senderSeatId?: string; modelLabel?: string }`. A message entry's head shows the tag, "Message", and the model label on the right; its body shows the sender's dot and full name, then the message in quotes. In Observe mode only, a muted "Strategy: …" line follows.
2. A "Show reports from" select in the Reports header: "Everyone", then every seat by full name. It filters message entries by sender. Turn reports and notices always show.
3. Dispatches from the pool (phase 3.9's poll) become one toast titled "Messages ({n})" listing each sender and message, and one Reports entry per message. Replace the use of `showAiStrategyToast` for dispatches.
4. Knockout notices: for each `ReadyResult.knockouts` entry, one "Notice" toast and one Reports entry. `formatKnockoutNotice` in `src/shared/knockoutNotice.ts` (new) takes the whole `reasons` array and joins the matching sentences in [D12](multi-commander-execution-plan.md#knockout-and-neutral) order:
   - Open with "{Victim} is out of the match." When the victim is the human seat, "You are out of the match." Phase 4.10's dialog still takes over for the human.
   - `home_control`: "{OutBy} holds {share} of its home's cities." `share` is the map's `controlWinMinUrbanShare` written as a percent (regional maps use 0.75, which reads "75%"). On the global map the sentence is "{OutBy} holds all of its home."
   - `no_city_hexes`: "It holds no city hexes."
   - `home_cities_destroyed`: "Its home has no cities left."
   - Then, once: "Its land is now neutral and its cities stop building." When units remain: "Its last {n} units hold their hexes as neutral garrisons and fire on any unit in range." Drop that sentence when none remain.
   - A seat that meets two reasons gets both reason sentences in the same notice, not two toasts.
5. The toast band stacks the Notice toast above the Messages toast, as in the image.

**Shared tests.** `src/shared/knockoutNotice.test.ts` (new): each reason alone, `home_control` together with `no_city_hexes` in one notice, the global wording, zero units, the human as victim. `src/shared/consoleReportLog.test.ts`: the sender filter.

**Docs.** `doc/ux/reports-tab.md`, `doc/ux/notifications-and-feedback.md`.

**Manual check.** Against `reports-knockout`: a four-sided match where one side is knocked out (prepared by the human or by a test database), the Notice, the filter, and a neutral hex tooltip.

---

## Phase 4.8: Turn reports for several sides

**Goal.** The turn report says who did what to whom, in sentences, instead of "Human Losses" and "AI Losses". Expected image: `reports-knockout`, the T8 turn report.

**Read first.** `buildConsolidatedTurnUpdateToastMessage` in `src/shared/consolidatedTurnUpdateToast.ts`; `src/shared/lossSummary.ts` and `src/shared/lossSummaryFromResolution.ts` (`bucketForPlayer`); `announceResolutionTurnUpdate` and `deriveCombatVisibilityClassification` in `src/renderer/gameplay/readyResolutionAnnouncements.ts`; how `finalizeReadyTurnAfterMelee` collects control transitions.

**Change.**

1. Engine: add `controlTransitions: readonly { h3Index: string; from: string | null; to: string | null }[]` to `ReadyResult`, copied from the transitions `resolveStrategicControlAfterCombatAndMovement` already returns, and mirror it over IPC.
2. `TurnLossSummary` becomes per owner: `{ byOwner: Record<string, LossBucket> }`, where `bucketForPlayer` files a loss under the victim's owner. Keep the visibility rule: the viewer always sees its own losses; other losses only where visible.
3. A new `buildTurnReportLines(input)` in `src/shared/turnReportLines.ts` (new) produces, in this order:
   - "You took {n} hex(es) from {Side}." per enemy owner, from transitions to the viewer.
   - "{Side} took {n} of your hexes." per owner, from transitions away from the viewer.
   - "You lost {count and type list} to {Side} at ({hex})." per killer owner and hex.
   - "You destroyed {count and type list} of {Side} at ({hex})." per victim owner and hex.
   - "Seen: {A} and {B} fought at ({hex}). {A} lost {list}; {B} lost {list}." for a visible fight that did not involve the viewer; "Each lost {list}." when both lists are equal; three parties read "{A}, {B}, and {C} fought at …".
   - Then today's other lines (deployments, caps, and so on), unchanged.
   Use short names. A transition whose other owner is Neutral uses the name "Neutral". A `null` controller is unowned land, not a side, and does not get one of these sentences. The function takes `viewerSeatId`. A seat writes the "You" lines from that seat. Null writes only "Seen:" lines, for every fight. Phase 4.11 passes the View-as seat, or null when View as is all sides. Until then, the renderer passes the active human seat, or null when the match has none.
4. Replace the "Human Losses" and "AI Losses" sections in the toast and the Reports turn entry with these lines.
5. `deriveCombatVisibilityClassification`: delete the assumption that every battle involves the human (its comment says so); classify by the viewer's visibility.

**Shared tests.** `src/shared/turnReportLines.test.ts` (new): the image's T8 lines ("You took 2 hexes from E. Turkey.", "You lost 1 infantry to W. Turkey at (H7).", "Seen: W. Turkey and E. Turkey fought at (C6). Each lost 1 armored unit."), a three-party fight, a null viewer that writes only "Seen:" lines. Update `consolidatedTurnUpdateToast.test.ts` and `lossSummary*.test.ts` to the new shapes.

**Docs.** `doc/ux/notifications-and-feedback.md`, `doc/ux/reports-tab.md`, `doc/how-to-play.md` (reading turn reports).

**Manual check.** Two-sided and four-sided: the turn report reads as sentences with side names.

---

## Phase 4.9: Tactical battles list and battle header

**Goal.** The battles list shows each eligible battle's enemy (a side or Neutral) and lists the contested hexes that resolve on the world map. The battle header names the enemy and colors the force bar by seat. Expected images: `battles-list`, `battle-header`, `battle-header-neutral`.

**Read first.** `openMeleeInterceptModal` in `src/renderer/gameplay/meleeInterceptModal.ts`; `MeleeCandidateRow` in `src/shared/ipc/meleeInterceptTypes.ts`; `listMeleeCandidateHexes` and the row builder in `src/main/gameActions/meleeInterceptCandidates.ts`; `renderBattleHeader` and `renderBattleForceBar` in `src/renderer/chrome/battleHeader.ts`; `countBattleForces` in `src/shared/battleForceCounts.ts`; `formatBattleHeaderStatus` in `src/shared/battleHeaderText.ts`; `src/renderer/map/tacticalEntryLayer.ts`; `doc/ux/tactical-battles-list.md`, `doc/ux/top-bar.md` (battle header), `doc/ux/tactical-entry-markers.md`.

**Change.**

1. Engine: `MeleeCandidateRow` becomes:

   ```ts
   export interface MeleeCandidateRow {
     readonly h3Index: string;
     readonly parties: readonly { readonly ownerId: string; readonly unitSummary: string }[]; // human first, then seat order, Neutral last
     readonly tacticalEligible: boolean;
   }
   ```

   The candidate list includes every contested hex the human can see (fog), eligible or not. The pause still happens only when at least one row is eligible. In Observe mode there is never a pause.
2. Modal (see `battles-list`): title "Tactical Battles ({eligible count})"; the sentence "Choose one battle to fight. The others resolve on the world map."; columns Hex, Yours, Enemy. The Enemy cell shows the party's dot and short name (or "Neutral" with the Neutral dot) and its unit summary below; for Neutral, the summary ends ", defends in place". The hex cell shows the hex line and a muted line "Control: {formatHexControlLabel with short names} · Terrain: {…} · Weather: {…}". Below the eligible rows, a section "Resolve on the world map this turn" lists the other rows: the hex, then "Three sides: you, {A}, {B}" or "{A} vs {B}" with dots. Fight and Ignore as today.
3. Battle header (see `battle-header` and `battle-header-neutral`): the right side of the force readout shows the opposing party's dot, short name (or "Neutral"), and sub-unit count; the force bar's two colors are the human seat's and the opposing party's `forceBar` colors. Against Neutral, the status line ends "· The garrison defends in place".
4. `countBattleForces` takes the opposing party id and counts human versus that party.
5. Magnifier (`tacticalEntryLayer.ts`): a hex is contested when it holds the human seat and exactly one other owner.

**Shared tests.** `src/shared/battleForceCounts.test.ts`, `src/shared/battleHeaderText.test.ts` for the new inputs. Engine test in `src/main/gameActions/meleeInterceptCandidates.test.ts`: a three-party hex is listed and not eligible; a human-and-Neutral hex is eligible; a fight between two AI seats that the human can see is listed and not eligible.

**Docs.** `doc/ux/tactical-battles-list.md`, `doc/ux/top-bar.md`, `doc/ux/tactical-entry-markers.md`, `doc/ux/tactical-battle-controls.md` if the header controls changed.

**Manual check.** Against the three images: a turn with a battle against an AI seat, one against a neutral garrison, and a three-sided hex.

---

## Phase 4.10: Game over standings and the knocked-out dialog

**Goal.** The game-over panel shows standings ([D19](multi-commander-execution-plan.md#victory)); a knocked-out human chooses to watch or end ([D17](multi-commander-execution-plan.md#knockout-and-neutral)). Expected image: `game-over`.

**Read first.** `updateGameOverUI` and `showGameOverBanner` in `src/renderer/core/uiState.ts`; the `#game-over-overlay` panel; `src/renderer/tactical/tacticalAnnihilationDialog.ts` (a dialog to imitate); `endMatchByHuman` (phase 2.3); `doc/ux/new-game-dialog.md` (the panel doubles as game over), `doc/ux/modes-and-transitions.md`.

**Change.**

1. `src/shared/standings.ts` (new): `buildStandings({ seats, viewerSeatId, gameEndReason, turnNumber, dateLabel, modelLabels })` returns the heading, the result line, the rows, and the total cost:
   - Heading: "You placed {ordinal} of {n}." with a human seat; "{Winner} wins." in Observe mode; "No side won." when no single winner.
   - Result line ([E13](multi-commander-execution-plan.md#engineering-decisions-frozen-unless-the-owner-overrides)): last side standing: "{Winner} is the last side standing. It knocked out {Side} on turn {N}." (the seat that `outBy` names the winner with the latest `outTurn`; omit the second sentence if none); turn limit: "{Winner} holds the most city hexes at the end of turn {L}."; mutual elimination: "{Winner} holds the most city hexes."; ended by the human: "You ended the match on turn {N}." When several seats share first, under either the turn limit or mutual elimination, name every one of them in seat order. Two names: "{A} and {B} share first place with {n} city hexes each." Three or more: "{A}, {B}, and {C} share first place with {n} city hexes each."
   - Rows in place order (ties by seat order): place, full name with " (you)", status ("Winner", "Out, turn {N}", or "{n} city hexes" for active seats at a turn limit, a mutual elimination, or an early end), the commander summary with the revealed doctrine, "{n} consultations", the cost, and "Knocked out by {Side}" / "Knocked out by you" when `outBy` is set. Active seats in a mutual elimination show "{n} city hexes", not "Out".
   - Total: "Model cost this match ${sum}".
2. Render the standings at the top of the game-over panel (the panel keeps its setup sections below, as in the image) and replace the "You win!" / "You lose." banner.
3. Knocked-out dialog: when a `ReadyResult.knockouts` entry names the human seat and the match goes on, show a modal titled "You're out" with "{OutBy} knocked you out on turn {N}." (or the reason's wording when `outBy` is null) and "You placed {ordinal} of {n}.", and two buttons:
   - "Watch the rest": switch to Observe mode (phase 4.11) with auto-advance on.
   - "End game": call a new IPC `game:endMatch` (wraps `endMatchByHuman`), then show the standings.
4. The current two-sided "You win!" path becomes standings too ("You placed 1st of 2.").

**Shared tests.** `src/shared/standings.test.ts` (new): the image's standings (four seats, places 1 to 4, a random doctrine revealed, costs), the shared-first sentence for two names and for three names (used by both the turn limit and mutual elimination), a mutual elimination with one winner, Observe mode, the human ending early.

**Docs.** `doc/ux/new-game-dialog.md` (game-over state), `doc/ux/modes-and-transitions.md` (knocked-out dialog), `doc/how-to-play.md` (winning, including a mutual wipe and a tie that names every side that shares first, and being knocked out).

**Manual check.** Against `game-over`: a match played or prepared to its end; a match in which the human is knocked out (both buttons).

---

## Phase 4.11: Observe mode

**Goal.** A match with no active human seat is watched, not played: the human chooses whose view to see, and turns can advance on their own ([D20](multi-commander-execution-plan.md#observe-mode)). Expected image: `observer`.

**Read first.** `getGameStateForPlayer` and the `game:getState` handler (`src/main/main.ts`); how the renderer installs a snapshot (`S.gameState`); `src/renderer/core/selection.ts`; `src/renderer/map/mainMapInteractions.ts`; `handleReadyButtonClick`; `doc/ux/modes-and-transitions.md`, `doc/ux/input-map.md`, `doc/ux/resolution-playback.md`.

**Change.**

1. Main: `game:getState` takes `viewAs?: string`. `'all'` returns the omniscient snapshot with every hex visible and `playerPerspective` set to `'all'`; a seat id returns `getGameStateForPlayer(seatId)`. When the human seat is active, ignore `viewAs` and log an error, and an absent `viewAs` means that human seat. When the human seat is absent or knocked out, an absent `viewAs` means `'all'`, because that seat's fog rows were deleted at knockout.
2. Renderer state `S.viewAs: 'all' | SeatId` (default `'all'`), used for every snapshot request while observing. Map drawing accepts `playerPerspective === 'all'` as "every ownership visible".
3. Top bar: "Observing", one chip per seat, then "View as" with a select: "All sides, no fog", then each seat's full name (knocked-out seats are listed and disabled). When View as is a seat, that seat is the viewer for the top-bar home and Cities readouts and for turn-report lines. When it is all sides, those readouts keep the null-viewer behavior from phase 4.5, and turn reports are "Seen:" lines only.
4. While observing: the Orders tab and the Build and Forces placeholders are disabled; units cannot be selected; the selection panel shows the hex only; the magnifier never shows.
5. Footer: a checkbox "Start the next turn when every commander is ready" (auto-advance). When on, the renderer presses Ready itself once the pool reports no seat planning and resolution playback has finished. When Ready returns `success: false`, stop auto-advance and log the reason. When off, the Ready button starts the next turn by hand. The Ready button label while waiting is "AI: {m:ss} · {k} planning".
6. Reports in Observe mode show strategies under messages (phase 4.7).

**Shared tests.** Put the "which controls are enabled while observing" decision in `src/shared/observeModeControls.ts` (new) with tests: no human seat; human seat knocked out; human seat active.

**Docs.** `doc/ux/modes-and-transitions.md` (Observe mode as a mode), `doc/ux/input-map.md` (disabled inputs), `doc/ux/resolution-playback.md` (auto-advance), `doc/how-to-play.md` (watching AI matches).

**Manual check.** Against `observer`: start an Observe match with four "No model" commanders; switch View as between all sides and one side with fog on; turn auto-advance on and watch three turns pass; turn it off and advance by hand. Then a match where the human is knocked out and chooses "Watch the rest".

---

## Phase 4.12: UI smoke for several sides

**Goal.** `npm run ui:smoke` covers the new screens and no longer assumes two sides.

**Read first.** `scripts/ui-smoke/ui-smoke.cjs` and every `ui-smoke-*.cjs` file, especially `ui-smoke-new-game.cjs`, `ui-smoke-session.cjs`, `ui-smoke-scenes.cjs`, and the checks that read `#topbar-human-side`, `#topbar-opponent-side`, `#battle-force-human-count`, and `#battle-force-opponent-count`.

**Change.**

1. Update every check that assumes two sides to read the new elements.
2. Add scenes: the new-game panel with four regional sides and the commander popover open; the Global tab with three sides and the region list open; a four-sided match at turn 1 (Commanders tab); a three-sided match where one side was knocked out by a prepared database (Reports and a neutral token); the standings of a finished four-sided match (prepared database); an Observe match with View as open.
3. Keep every scene model-free.

**Verification.** `npm run ui:smoke -- --label multi-commander` passes; compare the new PNGs in `.test/ui-smoke/multi-commander/` with the expected images and list visible differences in your report.

**Docs.** None beyond the smoke script's own README if it lists scenes.
