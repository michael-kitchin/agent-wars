# Agreement Timeline Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** The charts dialog gains an "Agreements over time" strip directly below the "Stance over time" strip, with the same layout, zoom, and pan. Each row is an AI commander. Each cell shows how many active agreements that commander held that turn, filtered by two dropdowns: Kind and With. Cell marks show proposals, breaches, and agreements the other side does not record. Hovering a cell lists every matching agreement in readable text.

**Shape:** Phase 0 records a baseline and checks the prerequisites. Phases 1 to 3 add shared, pure logic with tests. Phase 4 adds the main-process reader and puts its result in the charts snapshot. Phases 5 to 7 change the renderer: a behavior-preserving extraction of the strip's shared machinery, the agreement strip itself, and its block in the dialog. Phase 8 updates the docs, runs the final verification, and hands the user a manual checklist.

**Tech:** TypeScript (Electron main, sandboxed renderer bundled with esbuild, shared modules), `better-sqlite3`, canvas 2D, `node:test`, ESLint with the local `orienting-comments` and `seat-id-literals` rules, `scripts/check-circular-deps.cjs`.

**Order:** This plan runs third in the release. `2026-11-19-diplomacy-release-meta-plan.md` explains the order. It needs the agreements plan (`2026-11-18-side-agreements-execution-plan.md`) and the display-names plan (`2026-11-18-side-code-display-names-execution-plan.md`) finished first.

---

## How to Use This Plan

- Run the phases in order, back to back. Do not pause between phases for review.
- The full Verification Bar runs only in Phase 0 and Phase 8. Every other phase ends with the shorter Phase Check, which is not optional.
- **Stop only when a verification fails** and you cannot fix it within the phase's file lists. Then revert that phase (see Backup and Revert), record the failure in the Defect Inventory, and stop. Tell the user which phase failed and why.
- Never commit, push, stash, or run `git checkout`, `git restore`, `git reset`, or `git clean`. The user reviews every change.
- Read the whole phase before you edit anything. Each phase lists the files it **Adds** and **Edits**. Do not edit other files, except to remove an import that lint reports unused in a listed file, or to fix a test that fails only because of a change the phase names. Record every such file in the Completion Log.
- Find code by the quoted text, not by a line number. Line numbers in this plan are approximate.
- **Code blocks are sketches.** Write the real code from the file you just read. When a sketch and the file disagree, the file wins. Record the difference in the Completion Log. Text in a block marked **Exact** is not a sketch: copy it exactly.
- **Tests come first.** Write a new module's test with the module, and run it before any existing code calls the module.

### Backup and Revert

Nothing is committed. Before each phase, copy every file the phase **edits** into a backup folder outside the repo. Run this from the repo root. Set `$step` to the phase number and `$files` to that phase's **Edit** list.

```powershell
$step = '1'
$files = @('src/shared/sideAgreements.ts')
$backup = Join-Path $env:TEMP "aw-agreement-timeline\step-$step"
foreach ($f in $files) {
  $dest = Join-Path $backup $f
  New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  Copy-Item $f $dest -Force
}
```

To revert a phase:

```powershell
foreach ($f in $files) { Copy-Item (Join-Path $backup $f) $f -Force }
# Then delete every file the phase added (its "Add" list).
```

---

## Verification

### Phase Check

Every phase from 1 to 7 ends with the Phase Check, run from the repo root:

```powershell
npm run build:main
npm run lint
npm run build:renderer
npm run check:renderer-types
npm run check:circular
```

Then run, with `node dist/main/<path>.test.js` or `node dist/shared/<path>.test.js`, every test file the phase adds and every existing test file of a file the phase edits. All must pass.

- `check:circular` must print **exactly** the cycles recorded in Phase 0. A new cycle fails the phase.
- `npm run build:renderer` rewrites `static/renderer.js`. That is expected.
- No script runs tests under `src/renderer`. Every rule that can be tested lives in `src/shared` or `src/main`, and the renderer only draws what those rules return. Renderer phases are checked by the build, lint, the renderer type check, and the manual checklist in Phase 8.
- Record each Phase Check result in the Completion Log.

### Verification Bar

```powershell
npm test
npm run build:renderer
npm run check:circular
```

- `npm test` runs the native rebuild, `build:main`, `lint`, `naming:check`, `check:renderer-types`, every compiled `dist/main/**/*.test.js` and `dist/shared/**/*.test.js`, and `notices:check`. It takes about 20 minutes.
- When the final Verification Bar fails, find the phase whose change caused the failure, fix it within that phase's file lists, record the defect, and run the full bar again.
- Never refresh `scripts/renderer-typecheck-baseline.json`, `scripts/circular-deps-baseline.json`, or any other baseline file to make a gate pass.
- **Native module lock.** If `npm test` fails in `rebuild:native:node` with `EBUSY` on `better_sqlite3.node`, close any running Electron app, rename `node_modules/better-sqlite3/build/Release/better_sqlite3.node` to `better_sqlite3.node.locked`, rerun `npm test`, then delete the `.locked` file.
- **No test may call a real model.**

---

## Non-Goals

- No new stored data, no new recorder event, no new table, and no change to statistics recording. The strip is rebuilt from events the recorder already keeps.
- No change to any prompt.
- No new IPC channel. The existing charts snapshot gains optional fields.
- No filtering by viewer. The charts dialog is an exploration tool and shows every commander's agreements, intents, and decisions.
- No row for the human seat. The human keeps no agreements.
- No battle data in the strip. Agreements are strategic, and battle losses do not count as breaches.
- No change to how the Stance over time strip looks or behaves. Phase 5 moves its machinery into a shared module without changing its output.
- Do not edit anything under `.spec/completed/`.
- Do not "improve" code next to a phase's target. Make only the edits listed.

---

## Conventions

These come from `.cursor/rules/` and `AGENTS.md`. Lint enforces some of them.

- **Orienting comments.** Every new or updated declaration needs a JSDoc block, including private functions, constants, types, and every field of an interface or parameter-object type. Each block has a one-line summary, then `Purpose:` (or `Contract:` for types and interfaces), `When to use:`, `Expected outcome:`, and `Exceptions:`. Update the comment of every existing declaration whose behavior this plan changes. **Do not copy generic filler.**
- **Logging.** Only `src/main` logs. A new exported function there logs `logDebug` on entry, a getter or pure builder logs `logTrace`, and every caught error logs `logError` with the error. Log ids and counts, **never agreement terms, reasons, or message text.** `src/shared` and `src/renderer` never import the main-process logger.
- **Names.** camelCase files and functions, PascalCase types, UPPER_SNAKE constants. Follow `doc/naming-conventions-contract-v1.md`. Allowed role suffixes are `Handler`, `Helpers`, `Guards`, `Adapter`, `Pipeline`, `Core`, and `Types`. Use the file names this plan gives. `npm test` runs `naming:check`.
- **No plan vocabulary in version control.** Words such as "phase" or "execution plan" must never appear in code, comments, test names, or `doc/`.
- **Seat ids.** Production code uses `HUMAN_SEAT_ID`, `AI_SEAT_IDS`, and the guards in `src/shared/seatIds.ts`, never string literals. Tests may use literals.
- **Size limits.** Files should stay under 600 lines and must stay under 1000. `chartsDialog.ts` is 573 lines and `relationshipTimeline.ts` is 544. This plan keeps logic in new files, so `chartsDialog.ts` grows only by a few call lines and stays under 600.
- **Safe text.** Renderer text is set with `textContent` or text nodes, never `innerHTML`.
- **`readonly`.** Mark parameter arrays and object fields `readonly` where they are not reassigned.
- **Tests.** Test happy paths and essential failures only. Copy the imports and structure of the nearest sibling test file named in each phase.
- **Docs.** `AGENTS.md` requires `doc/` to change in the same change as the code, including each UX document's Code Entry Points. Your final message names every document you updated.

---

## Locked Decisions

The user made these. Do not revisit them.

1. **Placement and layout.** A new block titled "Agreements over time" sits directly below "Stance over time". It has the same label column, row height rule, turn axis, opening window, wheel zoom, drag pan, and double-click zoom-out, and it is held to the same quarter-height rule.
2. **Two dropdowns.** "Kind" offers All and the five kinds. "With" offers All sides and each side in the match. Both start on All.
3. **Rows.** One row per AI commander in side order, the commander being the side that keeps the agreements. The side chosen in "With" has no row. The human seat never has a row.
4. **What a cell counts.** The number of that commander's agreements that are **active** at that turn and match both dropdowns. Proposed agreements are shown separately, never counted in the main number. Expired, lapsed, ended, and broken agreements are not shown.
5. **Turn timing.** Each turn's state is rebuilt from the `agreement_recorded` and `agreement_decision` events up to and including that turn, with the shared standing rules. Agreements made in a turn's talk appear in that turn.
6. **Breach.** An active agreement is breached in a turn when, that turn, its keeper's ranged, air, or missile attacks destroyed units of the other side on the world map, or its keeper recorded a "break" decision for it. Melee and battle losses do not count, because the game cannot tell who started them.
7. **Mismatch.** For an agreement with another AI commander, the other side "records a matching agreement" when, that turn, it has a proposed or active agreement of the same kind with this side. Only an **active** agreement with no match marks the cell. A proposal with no match is normal, so it only gets the tooltip line. An agreement with the human seat is never a mismatch.
8. **With filter.** "With" matches the agreement's other side only, not the third side of a joint action. The tooltip still names that third side.
9. **Tooltip.** Hovering a cell lists **every** matching agreement, active first and then proposed, in readable text with display names. There is no cap.
10. **Everything is shown,** including intents and decisions.
11. **Zoom is independent.** The agreement strip zooms and pans on its own, like every other chart in the dialog. Both strips open on the same 12-turn window, so they line up until the player zooms one.

---

## Design

### Data flow

```
main: agreement_recorded + agreement_decision + losses_attributed events
      -> readAgreementHistory()              (src/main/matchStatistics/agreementHistoryRead.ts)
      -> MatchChartsSnapshot.agreementHistory (optional field, existing charts IPC)
shared: agreementStrip(snapshot, filter)      (src/shared/agreementStrip.ts)       -> rows and cells
        agreementCellLabel / agreementCellTooltip (src/shared/agreementStripText.ts) -> text
renderer: createAgreementTimeline()           (src/renderer/charts/agreementTimeline.ts) -> draws cells
          createAgreementStripBlock()         (src/renderer/charts/agreementStripBlock.ts) -> dropdowns, legend, strip
```

### Snapshot additions (`src/shared/agreementHistoryTypes.ts`)

```ts
export interface AgreementVersion {          // one recorded state of an agreement
  readonly turnNumber: number;               // the step turn of the agreement_recorded event
  readonly status: SideAgreementStatus;
  readonly endTurn: number;
  readonly terms: string;
  readonly zoneCodes: readonly string[];      // hex codes, already translated in main
  readonly intent: SideAgreementIntent;
  readonly reason: string;
}
export interface AgreementDecisionRecord {
  readonly turnNumber: number;
  readonly decision: SideAgreementDecision;
  readonly reason: string;
}
export interface AgreementHistoryEntry {
  readonly agreementId: number;
  readonly seatId: string;                    // the keeper
  readonly counterpartSeatId: string;
  readonly kind: SideAgreementKind;
  readonly againstSeatId: string | null;
  readonly startTurn: number;
  readonly versions: readonly AgreementVersion[];        // ascending turn, at most one per turn (the last one recorded that turn)
  readonly decisions: readonly AgreementDecisionRecord[]; // ascending turn, at most one per turn (the last one)
}
export interface AttackLossRecord {           // units of fromSeatId destroyed by bySeatId's own attacks on one turn
  readonly turnNumber: number;
  readonly bySeatId: string;
  readonly fromSeatId: string;
  readonly units: number;
}
export interface AgreementHistory {
  readonly agreements: readonly AgreementHistoryEntry[];
  readonly attacks: readonly AttackLossRecord[];
}
export const EMPTY_AGREEMENT_HISTORY: AgreementHistory;  // { agreements: [], attacks: [] }
```

`MatchChartsSnapshot` gains `readonly agreementHistory?: AgreementHistory;` and `MatchChartsSeat` gains `readonly outTurn?: number | null;`. Both are optional, so every existing snapshot and test fixture stays valid. A missing value means no agreements and a side still in the match.

### Strip model (`src/shared/agreementStrip.ts`)

```ts
export const AGREEMENT_FILTER_ALL = 'all';
export interface AgreementStripFilter {
  readonly kind: SideAgreementKind | typeof AGREEMENT_FILTER_ALL;
  readonly withSeatId: string;               // a seat id, or AGREEMENT_FILTER_ALL
}
export interface AgreementCellItem {
  readonly agreementId: number;
  readonly counterpartSeatId: string;
  readonly againstSeatId: string | null;
  readonly kind: SideAgreementKind;
  readonly startTurn: number;
  readonly endTurn: number;
  readonly standing: 'active' | 'proposed';
  readonly intent: SideAgreementIntent;
  readonly terms: string;
  readonly zoneCodes: readonly string[];
  readonly latestDecision: AgreementDecisionRecord | null;    // the newest decision at or before this turn
  readonly unitsDestroyedByAttack: number;                     // this turn, keeper's attacks on the counterpart; 0 for a proposal
  readonly decidedBreakThisTurn: boolean;
  readonly breached: boolean;                                   // active, and units destroyed by attack > 0 or decided break this turn
  readonly counterpartRecord: CounterpartRecord;
}
export type CounterpartRecord =
  | { readonly kind: 'not_applicable' }                         // the other side is the human seat, or not an AI seat
  | { readonly kind: 'none' }                                   // an AI side with no matching agreement
  | { readonly kind: 'match'; readonly agreementId: number; readonly standing: 'active' | 'proposed' };
export interface AgreementCell {
  readonly activeCount: number;
  readonly proposedCount: number;
  readonly breached: boolean;               // any item breached
  readonly mismatched: boolean;             // any active item whose counterpartRecord.kind is 'none'
  readonly items: readonly AgreementCellItem[];  // active first, then proposed; each group by agreementId
}
export interface AgreementStripRow { readonly seatId: string; readonly cells: readonly AgreementCell[] }
export interface AgreementStrip { readonly turns: readonly number[]; readonly rows: readonly AgreementStripRow[] }
export function agreementStrip(snapshot: MatchChartsSnapshot, filter: AgreementStripFilter): AgreementStrip
```

Rules for `agreementStrip`, in order:

1. `turns` is `snapshot.turns.map((turn) => turn.turnNumber)`, the same turns the stance strip uses, so the two axes line up.
2. Rows are the snapshot's seats with `kind === 'ai'`, sorted by `seatOrder`, without the seat equal to `filter.withSeatId`.
3. The state of an agreement at turn N is its last version with `turnNumber <= N`. An agreement with no such version does not exist yet at N.
4. Its standing at N is `sideAgreementStanding({ status, endTurn, currentTurn: N, counterpartActive })`. `counterpartActive` is true when the counterpart seat's `outTurn` is null or undefined, or `N <= outTurn`. A side is knocked out at the end of the turn it lost, and the roster stores that turn as `outTurn` (`endOfTurnOutcome.ts`), so the side still played turn `outTurn`. A counterpart missing from the seats counts as not active.
5. An agreement belongs in the cell (row seat, turn N) when its `seatId` is the row seat, its standing at N is `active` or `proposed`, `filter.kind` is All or equals its kind, and `filter.withSeatId` is All or equals its `counterpartSeatId`.
6. `unitsDestroyedByAttack` is the `units` of the attack record with turn N, `bySeatId` = row seat, `fromSeatId` = counterpart, or 0. It is 0 for a proposal.
7. `decidedBreakThisTurn` is true when the agreement has a decision with turn N and decision `break`.
8. `breached` is true only for an `active` item with `unitsDestroyedByAttack > 0` or `decidedBreakThisTurn`.
9. `counterpartRecord`: `not_applicable` when the counterpart seat is not an AI seat in the snapshot. Otherwise `match` with the lowest `agreementId` among the counterpart's agreements whose counterpart is the row seat, whose kind is the same, and whose standing at N is `active` or `proposed`. Otherwise `none`. The match ignores the dropdowns.

### Cell text (`src/shared/agreementStripText.ts`)

Kind and intent labels live in `src/shared/sideAgreements.ts`:

**Exact:**

```ts
export const SIDE_AGREEMENT_KIND_LABELS: Readonly<Record<SideAgreementKind, string>> = {
  non_aggression: 'Non-aggression',
  ceasefire_in_place: 'Ceasefire in place',
  no_entry_zone: 'No-entry zone',
  joint_action: 'Joint action',
  information_sharing: 'Information sharing',
};
export const SIDE_AGREEMENT_INTENT_LABELS: Readonly<Record<SideAgreementIntent, string>> = {
  keep: 'keep',
  opportunistic: 'opportunistic',
  plan_to_break: 'plan to break',
};
```

**The cell label** (`agreementCellLabel(cell): string`):

| Cell | Label |
| --- | --- |
| No active and no proposed agreement | `''` |
| Active only | `{activeCount}` |
| Proposed present | `{activeCount}+{proposedCount}` |
| Breached | the label above, then `!` |

**The short label** (`agreementCellShortLabel(cell): string`): `{activeCount}` plus `!` when breached, or `''` for an empty cell. The renderer uses it when the full label does not fit.

**The tooltip** (`agreementCellTooltip(args): AgreementTooltip`, a plain `{ heading, lines }` shape that the renderer's tooltip type matches, where `args` holds the row seat, the turn, the cell, `nameOf(seatId)`, and `displayText(text)`):

**Exact** line formats. `{…}` marks a value. `displayText` is applied to terms and reasons, so side codes print as display names.

```text
heading:                 {row name}, turn {turn}
empty cell:              No matching agreements.
item head (emphasis):    #{agreementId} {Kind label} with {counterpart name}, turns {startTurn} to {endTurn}, {standing}, intent {intent label}
item head, joint action: … then ", against {against name}" at the end of the head
terms:                   Terms: {displayText(terms)}
zone, when not empty:    Zone: {zoneCodes joined with ", "}
decision, when present:  Decision on turn {turnNumber}: {decision}            (then ": {displayText(reason)}" when the reason is not empty)
breach, when breached:   Breach this turn: {parts joined with " and "}
   part, attacks:        destroyed {units} {unit|units} of {counterpart name} by attack   ("unit" when units is 1)
   part, decision:       decided to break it
counterpart, match:      {counterpart name} records it as #{agreementId} ({standing})
counterpart, none:       {counterpart name} records no matching agreement
```

A `not_applicable` counterpart adds no line. Items come in the cell's order. The item head is the only emphasized line.

### Cell drawing

| Part | Rule |
| --- | --- |
| Fill | No fill when `activeCount` is 0. Otherwise `--agreement-1`, `--agreement-2`, or `--agreement-3` for 1, 2, or 3 or more |
| Empty cell | A 1 px outline in `--chrome-muted`, as the stance strip draws "no report" |
| Proposal | When `proposedCount > 0`, a 1 px dashed outline in `--chrome-accent-edge`, inset 2 px. A cell with proposals and no active agreement gets this outline instead of the muted one |
| Breach | Diagonal hatching at 45°, 1 px lines every 5 px in `--chrome-error`, clipped to the cell, then a 2 px outline in `--chrome-error` |
| Mismatch | When `mismatched`, a filled triangle in `--stance-wary` in the top-right corner, legs of 6 px, or a third of the cell width when that is smaller |
| Label | `agreementCellLabel` when its measured width plus 4 px fits in the cell, otherwise `agreementCellShortLabel` when that fits, otherwise none. Text is `--chrome-text` when `activeCount` is 0 or 1, and `#10161d` when it is 2 or more |

The three fill colors are one hue, light to dark against the dark chrome. They were checked with the data-visualization palette validator (ordinal ramp, dark surface `#1b2838`): monotone lightness, visible steps, a single hue, and a light end that clears the surface. Every mark has a second channel: the number, the `!`, the hatching, the tooltip, and a text legend under the strip.

**Exact** CSS variables, added to the `:root` block of `static/shellChrome.css` directly after `--stance-friendly`:

```css
  --agreement-1: #4f6f99;
  --agreement-2: #7d9cc4;
  --agreement-3: #b3c9e6;
```

**Exact** legend text, one paragraph under the strip:

```text
Number: active agreements. +N: proposed agreements. Dashed edge: at least one proposal. Red hatching and !: a breach that turn, an attack on the other side or a decision to break. Amber corner: the other side does not record an active agreement.
```

### Renderer modules

| File | Holds |
| --- | --- |
| `src/renderer/charts/stripTimelineCore.ts` | The strip machinery moved out of `relationshipTimeline.ts`: label column, canvas sizing, axis, zoom, pan, double-click, tooltip placement, and teardown. It draws each cell with a callback and asks a callback for the tooltip |
| `src/renderer/charts/relationshipTimeline.ts` | The stance strip, as a thin wrapper over the core. Same exports and same output as today |
| `src/renderer/charts/agreementTimeline.ts` | The agreement strip: the cell painter and the tooltip callback |
| `src/renderer/charts/agreementStripBlock.ts` | The block's two dropdowns, the strip, the legend, and its update, resize, and destroy |

---

## Phase 0 — Baseline and Prerequisites

**Add:** nothing. **Edit:** nothing.

1. Run `git status --short` and record the output in the Phase 0 Inventory.
2. Run the Verification Bar, unless the meta-plan says to reuse the previous plan's final run. Record pass or fail for each command, and the exact cycle list `check:circular` prints.
3. Record the line counts of `src/renderer/charts/chartsDialog.ts`, `src/renderer/charts/relationshipTimeline.ts`, and `src/renderer/charts/chartsDialogTypes.ts`.
4. **Prerequisites.** Confirm each of these exists. **If any is missing, stop and tell the user the earlier plans must be finished first.**
   - `src/shared/sideAgreements.ts`: `SIDE_AGREEMENT_KINDS`, `SIDE_AGREEMENT_STATUSES`, `SIDE_AGREEMENT_INTENTS`, `SIDE_AGREEMENT_DECISIONS`, `sideAgreementStanding`, and the guards.
   - `src/shared/matchRecording.ts`: `'agreement_recorded'` and `'agreement_decision'` in `MATCH_EVENT_TYPES`.
   - `src/main/recorder/sideAgreementRecordingEvents.ts`: `recordSideAgreementRecorded`, `recordSideAgreementDecision`.
   - `src/main/sideAgreements/sideAgreementZoneCodes.ts`: `zoneH3ToCodes`, `STRATEGIC_ZONE_CODE_TRANSLATOR`.
   - `src/shared/sideCodeDisplayText.ts`: `sideCodesToDisplayNames`.
5. Confirm these exist, and record any that do not:
   - `src/shared/matchStatistics.ts`: `MatchChartsSeat`, `MatchChartsSnapshot`.
   - `src/main/ipc/matchChartsIpcHandler.ts`: `buildMatchChartsSnapshot`, private `readChartSeats`, and `EMPTY_MATCH_CHARTS_SNAPSHOT`.
   - `src/main/recorder/matchRecordStore.ts`: `listReadableMatchEventsOfType`. `MatchRecord` in `src/shared/matchRecording.ts` has `turnNumber`, `scope`, `battleId`, and `payload`.
   - `src/main/briefing/sideCombatRecord.ts`: `COMBAT_RECORD_CATEGORY_BY_CAUSE`.
   - `src/shared/lossHistory.ts`: `isAttributedLossesRecord`. `src/main/recorder/matchRecordingEvents.ts`: `recordAttributedLosses`.
   - `src/shared/unitIds.ts`: `playerIdCodeFor`. `src/shared/seatIds.ts`: `isSeatId`.
   - `src/renderer/charts/relationshipTimeline.ts`: `createRelationshipTimeline`, `CreateRelationshipTimelineArgs`, `RelationshipTimelineHandle`.
   - `src/renderer/charts/chartsDialog.ts`: `appendBlock`, `buildBody`, `destroyView`, `resizeCharts`, `applySnapshot`, `innerBodyWidth`, `dialogHeight`, and the text `const stripBlock = appendBlock(body, 'Stance over time');`.
   - `src/renderer/charts/chartsDialogTypes.ts`: `ChartsView`.
   - `src/renderer/charts/chartSeatLookups.ts`: the lookups that give `nameOf` and `flagOf`.
   - `static/chartsChrome.css`: `.charts-tooltip`. `static/shellChrome.css`: `--stance-friendly`.

**Stop if** the bar fails before any edit.

---

## Phase 1 — Shared Types, Labels, and Names by Code

The snapshot types, the readable labels, and a name-by-code variant of the display-name rule exist. Nothing uses them yet.

**Add:** `src/shared/agreementHistoryTypes.ts`
**Edit:** `src/shared/sideAgreements.ts`, `src/shared/sideAgreements.test.ts`, `src/shared/matchStatistics.ts`, `src/shared/sideCodeDisplayText.ts`, `src/shared/sideCodeDisplayText.test.ts`

### Steps

1. `agreementHistoryTypes.ts`: write the types and `EMPTY_AGREEMENT_HISTORY` from the Design section, with full orienting comments on every interface and field.
2. `sideAgreements.ts`: add `SIDE_AGREEMENT_KIND_LABELS` and `SIDE_AGREEMENT_INTENT_LABELS` exactly as the Design section gives them.
3. `matchStatistics.ts`: add `readonly outTurn?: number | null;` to `MatchChartsSeat` and `readonly agreementHistory?: AgreementHistory;` to `MatchChartsSnapshot`, each with an orienting comment that says what a missing value means. Use `import type`.
4. `sideCodeDisplayText.ts`: split the existing rule in two without changing its behavior.
   - Add `export function sideCodesToNamesByCode(text: string, nameByCode: ReadonlyMap<string, string>): string`. It holds the pattern and the replacer. A code missing from the map stays as written.
   - `sideCodesToDisplayNames(text, seats)` builds the map from the seats as it does today, then calls `sideCodesToNamesByCode`.

### Tests

- `sideAgreements.test.ts`: every kind and every intent has a non-empty label.
- `sideCodeDisplayText.test.ts`: every existing case passes unchanged. `sideCodesToNamesByCode('a2 and a3-t2', new Map([['a2', 'DS 4.1 Flash']]))` gives `DS 4.1 Flash and a3-t2`.

### Verification

Run the Phase Check.

---

## Phase 2 — The Strip Model

Given a snapshot and a filter, the shared rule returns the rows and cells. Nothing uses it yet.

**Add:** `src/shared/agreementStrip.ts`, `src/shared/agreementStrip.test.ts`
**Edit:** nothing.

### Steps

1. Write `agreementStrip.ts` with the exports and the nine rules from the "Strip model" section. Keep it pure. No logging, no DOM, no imports from `src/main` or `src/renderer`.
2. Build lookups once per call (agreements by keeper seat, attacks by turn, keeper, and counterpart, seats by id) so a long match stays fast. Do not search the whole history for every cell.

### Tests

`agreementStrip.test.ts` (copy the structure of `src/shared/matchChartSeries.test.ts`). Build a snapshot by hand with seats `human` (kind `human`), `opponent` (a1), `opponent2` (a2), and `opponent3` (a3), turns 1 to 6, and agreements whose versions you control:
- An agreement recorded active on turn 2 with end turn 4 counts on turns 2, 3, and 4, and not on 1 or 5.
- A version on turn 3 that sets `broken_by_me` removes it from turn 3 on.
- A proposed agreement adds to `proposedCount`, not `activeCount`, and is never breached.
- An agreement whose counterpart has `outTurn: 4` still counts on turn 4 and is gone from turn 5 on (lapsed).
- An attack record on turn 3 from the keeper against the counterpart breaches the active agreement on turn 3 only. An attack on another side does not.
- A `break` decision on turn 3 breaches it on turn 3. A `keep` decision does not. `latestDecision` on turn 5 is the turn-3 decision.
- `filter.kind` limits the cell to that kind. `filter.withSeatId` limits it to that counterpart and removes that seat's row.
- The human seat never has a row.
- `counterpartRecord` is `match` when the counterpart has an open agreement of the same kind with the keeper that turn, `none` when it has none or only another kind, and `not_applicable` when the counterpart is the human.
- `mismatched` is true for a cell with an active item whose record is `none`, and false for a cell whose only unmatched item is a proposal.
- Items list active before proposed, each by id.
- A snapshot with no `agreementHistory` gives rows whose cells are all empty.

### Verification

Run the Phase Check.

---

## Phase 3 — Cell Text

The label, the short label, and the tooltip text for a cell exist. Nothing uses them yet.

**Add:** `src/shared/agreementStripText.ts`, `src/shared/agreementStripText.test.ts`
**Edit:** nothing.

### Steps

1. Write `agreementStripText.ts` with `agreementCellLabel`, `agreementCellShortLabel`, and `agreementCellTooltip`, following the "Cell text" section exactly. Use the label tables from `sideAgreements.ts`.
2. The tooltip returns plain data, not DOM:

   ```ts
   export interface AgreementTooltipLine { readonly text: string; readonly emphasis: boolean }
   export interface AgreementTooltip { readonly heading: string; readonly lines: readonly AgreementTooltipLine[] }
   ```

### Tests

`agreementStripText.test.ts`:
- Labels: empty gives `''`. Two active gives `2`. Two active and one proposed gives `2+1`. Breached gives `2+1!`. The short label of that cell is `2!`.
- Tooltip, with `nameOf` returning nicknames and `displayText` replacing `a3` with `GPT 6.2 Sol`:
  - The heading is `Sonnet 5.5, turn 7`.
  - An item head reads `#7 Non-aggression with GPT 6.2 Sol, turns 3 to 8, active, intent opportunistic` and is the only emphasized line.
  - Terms run through `displayText`.
  - A joint action ends its head with `, against DS 4.1 Flash`. A zone line lists its codes.
  - A decision line with and without a reason.
  - A breach line with both parts reads `Breach this turn: destroyed 2 units of GPT 6.2 Sol by attack and decided to break it`. With one unit it reads `destroyed 1 unit of GPT 6.2 Sol by attack`. Test both forms.
  - The match line and the no-match line. A `not_applicable` counterpart adds no line.
  - An empty cell gives the heading and `No matching agreements.`

### Verification

Run the Phase Check.

---

## Phase 4 — Reading the History into the Snapshot

The charts snapshot carries every agreement's history, the attack records, and each seat's out turn.

**Add:** `src/main/matchStatistics/agreementHistoryRead.ts`, `src/main/matchStatistics/agreementHistoryRead.test.ts`
**Edit:** `src/main/ipc/matchChartsIpcHandler.ts`, `doc/match-statistics.md`

### Steps

1. `agreementHistoryRead.ts`:

   ```ts
   export function readAgreementHistory(ops: BasicDbOps, zoneTranslator?: ZoneCodeTranslator): AgreementHistory
   ```

   - **Agreements.** Read `listReadableMatchEventsOfType(ops, 'agreement_recorded')`, in record order. Skip a record whose `scope` is not `'strategic'`. Check each payload with a private guard: `agreementId`, `startTurn`, and `endTurn` are integers; `seatId`, `counterpartSeatId`, `terms`, and `reason` are strings; `kind`, `status`, and `intent` pass their guards from `sideAgreements.ts`; `zoneH3` is an array of strings; `againstSeatId` is a string or null. Skip and count a payload that fails. The first record of an id creates the entry from its payload. Every record adds a version at `record.turnNumber`, replacing an earlier version of the same turn. `zoneCodes` is `zoneH3ToCodes(zoneH3, zoneTranslator)`.
   - **Decisions.** Read `'agreement_decision'` the same way. Check `agreementId` (integer), `decision` (guard), and `reason` (string). Add it to its entry at `record.turnNumber`, replacing an earlier decision of the same turn. Skip a decision whose agreement is unknown.
   - **Attacks.** Read `'losses_attributed'`. Keep a record only when `isAttributedLossesRecord(record.payload)` (`src/shared/lossHistory.ts`) is true, `payload.source === 'strategicTurn'`, and `record.scope === 'strategic'`. The `tacticalBeat` and `battleParents` sources are battle losses and are left out. Strategic losses are recorded at `strategicStep(N)` for the turn whose orders caused them (`strategicLossNoteCapture.ts`), the same step as that turn's decisions. For each victim owner in `payload.byOwner`, and each cause key whose `COMBAT_RECORD_CATEGORY_BY_CAUSE[cause]` is `'responsibleAttacked'` (`ranged`, `airStrike`, `missileStrike`), take the bucket only when it is an array. For each unit in it, read `unit.attribution?.responsibleOwnerIds`. When that is an array, count the unit once for each string id in it other than the victim owner. Sum by (turn, by, from). Skip anything else without throwing.
   - Sort agreements by id, and each entry's versions and decisions by turn. Sort attacks by turn, then by seat id, then by from seat id.
   - Catch every error. Log it with `logError` (counts only) and return `EMPTY_AGREEMENT_HISTORY`. Log `logDebug` on entry, and once at the end with the agreement, decision, attack, and skipped counts.
2. `matchChartsIpcHandler.ts`:
   - `readChartSeats` adds `outTurn: seat.outTurn`.
   - `buildMatchChartsSnapshot` adds `agreementHistory: readAgreementHistory(gameDbOps)`. The reader never throws, so a bad agreement record cannot break the charts.
   - `EMPTY_MATCH_CHARTS_SNAPSHOT` stays as it is. A missing field means no agreements.
3. `doc/match-statistics.md`: where it describes the charts snapshot and its channel, add `agreementHistory`, what it holds, that it is rebuilt from recorder events when the snapshot is read, and the seats' `outTurn`.

### Tests

`agreementHistoryRead.test.ts` (copy the structure of `src/main/recorder/sideAgreementRecordingEvents.test.ts`), on a seated temp match with a fake zone translator. Write events with `recordSideAgreementRecorded`, `recordSideAgreementDecision`, and `recordAttributedLosses` (`src/main/recorder/matchRecordingEvents.ts`; copy its `LostUnit` fixtures from `matchRecordingEvents.test.ts`):
- One agreement recorded on turn 2 and changed on turn 4 gives one entry with two versions, in order. Two changes on the same turn keep only the later one.
- A decision is attached to its agreement. A decision for an unknown id is skipped.
- A loss recorded at `strategicStep(3)` with source `strategicTurn`, in `byOwner.opponent2.ranged`, with `responsibleOwnerIds: ['opponent']`, gives one attack record (turn 3, by `opponent`, from `opponent2`, 1 unit). The same unit in `melee` or `returnFire` gives none. The same unit recorded with source `tacticalBeat` at a tactical step gives none. A unit with `responsibleOwnerIds: null` gives none.
- A payload with a bad `kind` is skipped and counted, and the rest still read.
- No events gives `EMPTY_AGREEMENT_HISTORY`.

Also confirm by running `node dist/main/ipc/matchChartsIpcHandler.test.js`, if that file exists, that existing snapshot tests still pass.

### Verification

Run the Phase Check.

---

## Phase 5 — The Shared Strip Machinery

The stance strip's machinery moves into a reusable core. The stance strip looks and behaves exactly as before.

**Add:** `src/renderer/charts/stripTimelineCore.ts`
**Edit:** `src/renderer/charts/relationshipTimeline.ts`

### Steps

1. Read all of `relationshipTimeline.ts` first. This phase moves code. It does not rewrite it.
2. `stripTimelineCore.ts` exports:

   ```ts
   export interface StripTimelineRow<Cell> { readonly seatId: string; readonly cells: readonly Cell[] }
   export interface StripTimelineData<Cell> { readonly turns: readonly number[]; readonly rows: readonly StripTimelineRow<Cell>[] }
   export interface StripCellRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
   export interface StripTooltipLine { readonly text: string; readonly emphasis: boolean }
   export interface StripTooltipContent { readonly heading: string; readonly lines: readonly StripTooltipLine[] }
   export interface CreateStripTimelineArgs<Cell> {
     readonly host: HTMLElement;
     readonly width: number;
     readonly height: number;
     readonly nameOf: (seatId: string) => string;
     readonly flagOf: (seatId: string) => HTMLElement | null;
     readonly emptyText: string;
     readonly paintCell: (context: CanvasRenderingContext2D, cell: Cell, rect: StripCellRect) => void;
     readonly tooltipAt: (turnIndex: number, rowIndex: number | null) => StripTooltipContent | null;
     readonly wrapTooltip?: boolean;        // when true, the tooltip wraps long lines and opens above the pointer when it would pass the bottom of the dialog body
   }
   export interface StripTimelineHandle<Cell> {
     update(data: StripTimelineData<Cell>): void;
     resize(width: number, height: number): void;
     destroy(): void;
   }
   export function createStripTimeline<Cell>(args: CreateStripTimelineArgs<Cell>): StripTimelineHandle<Cell>
   export function stripCssColor(name: string, fallback: string): string
   ```

   Move into the core, unchanged: the constants `ROW_HEIGHT_MAX`, `ROW_HEIGHT_MIN`, `AXIS_HEIGHT`, and `LABEL_WIDTH`; `cssColor` (exported as `stripCssColor`); `tickStep`; and from `createRelationshipTimeline`, everything except the empty-text string, the inner per-cell drawing, and the tooltip lines.
   - The draw loop calls `context.save()`, then `paintCell(context, cell, { x, y, width: cellWidth, height: rowPx })`, then `context.restore()`, for every visible cell. The core sets the font, alignment, and baseline before the loop, as today. The rect is the full cell. Each painter keeps the 1 px gap between rows itself, as today's code does with `rowPx - 1`.
   - The row label uses `row.seatId`.
   - The core keeps today's first test: the turn index is `strip.turns.indexOf(Math.round(turnAt(event.clientX)))`, and when it is below 0 the tooltip hides and `tooltipAt` is not called. Otherwise `tooltipAt` gets that index and the row index under the pointer: `Math.floor((event.clientY - canvas.getBoundingClientRect().top) / rowHeight())`, or null when that is below 0 or not below the row count (the axis). When `tooltipAt` returns null, hide the tooltip. Otherwise build the heading and one `div.charts-tooltip-line` per line, adding the class `charts-tooltip-emphasis` to emphasized lines.
   - With `wrapTooltip` true, add the class `charts-tooltip-wrap` to the tooltip. Place it as today. Then find the visible bottom: `args.host.closest('.charts-dialog-body')?.getBoundingClientRect().bottom ?? window.innerHeight`. The dialog body scrolls, so a tooltip past its bottom is cut off. If the tooltip's bottom edge (`tooltip.getBoundingClientRect().bottom`) would pass that line, set its top to `y - 12 - tooltip.offsetHeight`, but never above the body's visible top, in host coordinates. Without `wrapTooltip`, placement is exactly today's.
3. `relationshipTimeline.ts` keeps its exported names and argument types. `createRelationshipTimeline(args)` calls `createStripTimeline` with:
   - `emptyText: 'No AI commander reports on this side.'`
   - a `paintCell` holding today's per-cell drawing, with `rect.x`, `rect.y`, `rect.width`, and `rect.height` in place of `x`, `y`, `cellWidth`, and `rowPx`. It keeps every offset as it is: the empty outline at `x + 0.5, y + 0.5, max(0, width - 1), height - 1`, the stance fill at `x, y, width, height - 1` with alpha, and the first letter when the cell is at least `LETTER_MIN_CELL_WIDTH` wide. It reads the muted color with `stripCssColor`. `LETTER_MIN_CELL_WIDTH` stays in this file.
   - a `tooltipAt` that ignores the row index and returns today's heading and lines, none emphasized.
   - Its `update` maps each `RelationshipStrip` row (`reporterSeatId`) to `{ seatId, cells }`.
4. Compare the moved code with the original, line by line, before running the checks. Record anything that had to change in the Completion Log.

### Verification

Run the Phase Check. Then add to the Completion Log the line counts of both files, and a one-line statement that `createRelationshipTimeline` produces the same labels, cells, axis, tooltip, zoom, pan, and teardown as before. The manual checklist in Phase 8 confirms it on screen.

---

## Phase 6 — The Agreement Strip

A strip that draws agreement cells with their marks and shows the cell tooltip exists. The dialog does not use it yet.

**Add:** `src/renderer/charts/agreementTimeline.ts`
**Edit:** `static/shellChrome.css`, `static/chartsChrome.css`

### Steps

1. `static/shellChrome.css`: add the three `--agreement-N` variables exactly as the Design section gives them.
2. `static/chartsChrome.css`: add these rules after `.charts-tooltip-total`:

   **Exact:**

   ```css
   .charts-tooltip-wrap { white-space: normal; max-width: 32rem; }
   .charts-tooltip-emphasis { font-weight: 600; margin-top: 0.3rem; }
   .charts-agreement-legend { margin: 0.25rem 0 0; color: var(--chrome-muted); font-size: 11px; }
   .charts-block-controls { display: flex; flex-wrap: wrap; gap: 0.75rem; }
   ```

3. `agreementTimeline.ts`:

   ```ts
   export interface CreateAgreementTimelineArgs {
     readonly host: HTMLElement;
     readonly width: number;
     readonly height: number;
     readonly nameOf: (seatId: string) => string;
     readonly flagOf: (seatId: string) => HTMLElement | null;
   }
   export interface AgreementTimelineHandle {
     update(strip: AgreementStrip, displayText: (text: string) => string): void;
     resize(width: number, height: number): void;
     destroy(): void;
   }
   export function createAgreementTimeline(args: CreateAgreementTimelineArgs): AgreementTimelineHandle
   ```

   - It wraps `createStripTimeline<AgreementCell>` with `emptyText: 'No AI commander to show.'` and `wrapTooltip: true`.
   - `paintCell` keeps the stance strip's 1 px row gap: every fill, outline, and hatching stays inside `rect.height - 1`. It follows the "Cell drawing" table, in this order: fill, empty or proposal outline, breach hatching and outline, mismatch triangle, label. Read colors with `stripCssColor`. Measure labels with `context.measureText`. Clip the hatching with `context.rect` and `context.clip()` inside the core's `save`/`restore`.
   - `tooltipAt` returns null when the row index is null. Otherwise it returns `agreementCellTooltip` for that row, turn, and cell, with `nameOf` from the args and the `displayText` given to the last `update`.
   - `update` keeps the latest strip and `displayText`, then calls the core's `update`.

### Verification

Run the Phase Check.

---

## Phase 7 — The Block in the Dialog

The charts dialog shows "Agreements over time" with its two dropdowns, its strip, and its legend.

**Add:** `src/renderer/charts/agreementStripBlock.ts`
**Edit:** `src/renderer/charts/chartsDialog.ts`, `src/renderer/charts/chartsDialogTypes.ts`

### Steps

1. `agreementStripBlock.ts`:

   ```ts
   export interface AgreementStripBlockHandle {
     readonly titleRow: HTMLElement;
     update(snapshot: MatchChartsSnapshot): void;
     resize(width: number, height: number): void;
     destroy(): void;
   }
   export function createAgreementStripBlock(args: {
     readonly titleRow: HTMLElement;
     readonly plotHost: HTMLElement;
     readonly width: number;
     readonly plotHeightFor: (titleRowHeight: number) => number;
     readonly nameOf: (seatId: string) => string;
     readonly flagOf: (seatId: string) => HTMLElement | null;
     readonly snapshot: MatchChartsSnapshot;
   }): AgreementStripBlockHandle
   ```

   - **Order of building matters for the height.** First append the dropdowns to the title row and the legend after the plot host. Only then create the strip, with `height: plotHeightFor(titleRow.offsetHeight) - legend.offsetHeight` (never below 0). The title row and the legend both count toward the quarter-height rule, and the dropdowns can make the title row taller.
   - `resize(width, height)` gets the block's plot height from the dialog, and passes `Math.max(0, height - legend.offsetHeight)` to the strip.

   - **Kind dropdown**, in a `span.charts-block-controls` appended to the title row, built like the stance strip's `How they see` dropdown (class `charts-select`, inside a `label.charts-select-label`). The label text is `Kind `. The options are `All` (value `AGREEMENT_FILTER_ALL`), then each kind in `SIDE_AGREEMENT_KINDS` order with its label. Set `aria-label` to `Kind` and `dataset.controlTooltip` to the sentence in Phase 8.
   - **With dropdown**, after it in the same span, the same way. The label text is `With `. The options are `All sides` (value `AGREEMENT_FILTER_ALL`), then every snapshot seat in `seatOrder` with `nameOf(seatId)`. Rebuild these options on each `update` and keep the current choice when that seat still exists, otherwise go back to `All sides`.
   - **The strip**, from `createAgreementTimeline` in the plot host.
   - **The legend**, a `p.charts-agreement-legend` after the plot host (append it to the plot host's parent, directly after the plot host), with the exact legend text from the Design section.
   - `displayText` is `(text) => sideCodesToNamesByCode(text, nameByCode)`, where `nameByCode` maps `playerIdCodeFor(seat.seatId)` to `nameOf(seat.seatId)` for each snapshot seat whose id passes `isSeatId` (`playerIdCodeFor` is in `src/shared/unitIds.ts`, `isSeatId` in `src/shared/seatIds.ts`).
   - A dropdown `change` redraws the strip from the latest snapshot and keeps its zoom, as the stance strip's dropdown does.
   - `update(snapshot)` stores the snapshot, refreshes the With options, and calls the strip's `update` with `agreementStrip(snapshot, currentFilter)`.
   - `destroy` removes the dropdown listeners and destroys the strip.
2. `chartsDialogTypes.ts`: `ChartsView` gains `readonly agreements: AgreementStripBlockHandle;` with an orienting comment.
3. `chartsDialog.ts`. Add only these lines and the import:
   - In `buildBody`, directly after the stance strip's `strip.update(…)` line: `const agreementBlock = appendBlock(body, 'Agreements over time');`, then create the block with `createAgreementStripBlock({ ...agreementBlock, width: innerBodyWidth(body), plotHeightFor: (titleRowHeight) => chartPlotHeight(dialogHeight(), titleRowHeight), nameOf: lookups.nameOf, flagOf: lookups.flagOf, snapshot })`, and add `agreements` to the `view = { … }` object.
   - In `destroyView`, after `view.strip.destroy();`: `view.agreements.destroy();`.
   - In `resizeCharts`, after the stance strip's resize: `view.agreements.resize(width, chartPlotHeight(height, view.agreements.titleRow.offsetHeight));`.
   - In `applySnapshot`, after the stance strip's update: `view.agreements.update(snapshot);`.
   - Update the orienting comment of `buildBody` to name the new block in the dialog's order.
4. Confirm `chartsDialog.ts` is 600 lines or fewer.

### Verification

Run the Phase Check.

---

## Phase 8 — Docs, Final Verification, and Hand-Off

**Add:** nothing.
**Edit:** `doc/ux/charts-dialog.md`, `doc/ux/control-tooltips.md`, `doc/ui-style-guide.md`, `doc/commander-messages.md`

### Steps

1. `doc/ux/charts-dialog.md`:
   - In the opening sentence and the numbered list of what the body shows, add "Agreements over time" as the item after "Stance over time", and renumber the legend and the line charts.
   - Add the quarter-height rule for the new strip beside the stance strip's, counting its title row and legend.
   - Under States, the open state lists the agreement strip after the stance strip. Under Invariants, the quarter-height line names the agreement strip, the color line says an agreement cell carries a number, a `!`, hatching, a legend, and a tooltip, and the mark line says a proposal and a breach each look different from a plain active agreement.
   - In the Mouse list, every sentence that names "the strip" for wheel, drag, double-click, dropdown change, and the 12-turn opening window names both strips. Add that the agreement strip zooms on its own, and that its tooltip is for the cell under the pointer, not the whole turn.
   - Add a section "The agreement strip" after "The stance strip". Describe the rows, the two dropdowns, what a cell counts, the turn timing, the breach and mismatch rules, every mark in the "Cell drawing" table, the label rules, the legend, and the tooltip formats. Name the symbols: `agreementStrip`, `agreementCellLabel`, `agreementCellTooltip`, `readAgreementHistory`, and `SIDE_AGREEMENT_KIND_LABELS`.
   - Under Inputs and Responses, say that the wheel, drag, and double-click behave on the agreement strip as on the stance strip, that changing either dropdown redraws it and keeps its zoom, and that it opens on the same 12-turn window.
   - Add the four renderer files and the three shared files to Code Entry Points.
2. `doc/ux/control-tooltips.md`: under Sentences, after the "How they see" line, add these lines exactly:

   **Exact:**

   ```text
   - Kind dropdown, on the charts dialog: Choose which kind of agreement the agreement strip counts.
   - With dropdown, on the charts dialog: Choose the side whose agreements with each commander the strip counts, or all sides.
   ```

   Use the same two sentences, without the leading names, as the dropdowns' `dataset.controlTooltip` values in Phase 7. If you set them before this phase, confirm they match exactly.
3. `doc/ui-style-guide.md`: in the palette table, add a row for the agreement ramp: the three values, the variables in `static/shellChrome.css`, and that it fills agreement strip cells by count, with the number always printed.
4. `doc/commander-messages.md`: in the Agreements section, one sentence saying the charts dialog shows every commander's agreements over time, rebuilt from the recorder's agreement events.
5. Search for plan vocabulary in changed **and new** files (`git diff` does not show untracked files):

   ```powershell
   $pattern = 'Phase \d|agreement-timeline-execution|execution plan|locked decision'
   git diff -- src doc static | Select-String -Pattern $pattern
   git ls-files --others --exclude-standard -- src doc static | ForEach-Object { Select-String -Path $_ -Pattern $pattern }
   ```

   Nothing may match.
6. Search changed and new files under `src` the same way for `log(Debug|Trace|Error)\(.*(terms|reason|text)\b`. Each match must log a count, not the value.
7. Run the full Verification Bar.
8. Fill in the Completion Log, with the final line counts of `chartsDialog.ts`, `relationshipTimeline.ts`, and `stripTimelineCore.ts`.
9. In your final message, name every document you updated, as `AGENTS.md` requires.

### Manual checklist for the user

Give the user this list in your final message:

1. Open a match with stances and no agreements (any match from before this release). The Stance over time strip looks and behaves exactly as before: labels, colors, letters, the axis, the tooltip, wheel zoom, drag pan, and double-click. The new strip shows every cell empty.
2. Play or observe a few turns with capable models until agreements exist. Open the charts. The agreement strip's rows are the AI commanders, and its turns line up with the stance strip's.
3. Hover a filled cell. The tooltip lists every matching agreement with nicknames, kind, turns, standing, intent, terms, any decision, any breach, and whether the other side records it. Long tooltips wrap, and near the bottom of the dialog they open above the pointer.
4. Change Kind and With. The counts change, the With side's row disappears, and the zoom stays where it was.
5. Find a turn where a commander shelled a side it had an active agreement with. That cell is hatched in red with a `!`.
6. Zoom in and out. Labels shrink to the short form, then disappear, as cells narrow. Zooming the agreement strip leaves the stance strip where it was.
7. Resize the window. The agreement block, with its title row and legend, stays within a quarter of the dialog's height.

---

## Reliability Checklist

- [ ] Each phase's files were backed up before the first edit.
- [ ] The Phase Check ran and passed at the end of every phase from 1 to 7.
- [ ] Every rule that decides a count, a mark, or a tooltip line is in `src/shared` and tested.
- [ ] The stance strip's code moved without changing its output. `relationshipTimeline.ts` keeps its exported names.
- [ ] `chartsDialog.ts` is at or under 600 lines.
- [ ] No text is set with `innerHTML`.
- [ ] No log line carries terms, reasons, or message text.
- [ ] A bad agreement event cannot break the charts snapshot.
- [ ] Every new or updated declaration has a full orienting comment that is not generic filler.
- [ ] `npm run check:circular` shows only the Phase 0 cycles.
- [ ] No baseline file was edited.
- [ ] No commit, push, stash, checkout, restore, reset, or clean was run.
- [ ] No plan vocabulary appears in `src/`, `static/`, or `doc/`.

## Success Definition

- The charts dialog shows "Agreements over time" under "Stance over time", with Kind and With dropdowns, one row per AI commander, and turns that line up with the stance strip.
- Each cell's number is the count of matching active agreements that turn. Proposals, breaches, and mismatches are marked as designed, and the tooltip lists every matching agreement in readable text with display names.
- The stance strip is unchanged.
- Saves and recordings from before this release still open the charts, with an empty agreement strip.
- The Verification Bar passes.

---

## Phase 0 Inventory

| Item | Value |
|------|-------|
| `git status --short` | |
| `npm test` | |
| `npm run build:renderer` | |
| `check:circular` cycle list | |
| Line counts (charts dialog, stance strip, dialog types) | |
| Prerequisites present | |
| Missing symbols | |

## Defect Inventory

| Phase | Command | First error | Action taken |
|-------|---------|-------------|--------------|

## Completion Log

| Phase | Result | Sketch differences | Files changed outside the Add/Edit lists | Docs updated |
|-------|--------|--------------------|------------------------------------------|--------------|
