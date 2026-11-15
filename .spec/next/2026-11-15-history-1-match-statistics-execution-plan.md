# Match Statistics Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** The main process knows, for every strategic turn, each side's unit counts, hexes, production, credits, upkeep, losses, and model cost, and how each AI commander privately regards every other side. It records those numbers every turn and serves them to the renderer for the human player's charts. Each commander also reports trust and threat with its stance. Commanders are told nothing new about other sides. There is no new screen.

**Shape:** Phase 0 records a baseline. Phases 1 through 5 each add one piece that can be verified on its own or with earlier phases. Phase 6 runs the final verification, the doc check, and hands the user a short manual checklist.

**Tech:** TypeScript (Electron main, sandboxed preload), `better-sqlite3`, `node:test`, ESLint with the local `orienting-comments` and `seat-id-literals` rules, `scripts/check-circular-deps.cjs`.

**Order:** This is the first of four plans. `2026-11-15-history-0-meta-plan.md` explains the order.

---

## How to Use This Plan

- Run the phases in order, back to back. Do not pause between phases for review.
- **Stop only when a verification fails** and the phase's "If verification fails" steps do not fix it. Then revert that phase (see Backup and Revert), record the failure in the Defect Inventory, and stop. Tell the user which phase failed and why.
- Never commit, push, stash, or run `git checkout`, `git restore`, `git reset`, or `git clean`. The user reviews every change.
- Read the whole phase before you edit anything. Each phase lists the files it **Adds** and **Edits**. Do not edit other files, except to remove an import that lint reports unused in a listed file, or to fix a test that fails only because of a change the phase names (record that file in the Completion Log).
- Find code by the quoted text, not by a line number. Line numbers in this plan are approximate.
- **Code blocks are sketches.** Write the real code from the file you just read. When a sketch and the file disagree, the file wins. Record the difference in the Completion Log. **User-facing strings and prompt text in this plan are not sketches.** Copy them exactly.
- **Tests come first.** Tests under `src/renderer` are not run by `npm test`. So every rule that can be wrong lives in a pure function under `src/shared` (or a main-process module), with a test, written and run before anything calls it. Renderer files only read the DOM and state, call those functions, and write the DOM.

### Backup and Revert

Nothing is committed. Before each phase, copy every file the phase **edits** into a backup folder outside the repo. Run this from the repo root. Set `$step` to the phase number and `$files` to that phase's **Edit** list.

```powershell
$step = '1'
$files = @('src/main/gameDb.ts')
$backup = Join-Path $env:TEMP "aw-match-statistics\step-$step"
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

## Verification Bar

Every phase ends with all three commands, run from the repo root:

```powershell
npm test
npm run build:renderer
npm run check:circular
```

- `npm test` runs the native rebuild, `build:main`, `lint`, `naming:check`, `check:renderer-types`, every compiled `dist/main/**/*.test.js` and `dist/shared/**/*.test.js`, and `notices:check`. It takes about 20 minutes. New `*.test.ts` files under `src/main` or `src/shared` are discovered automatically. Tests under `src/renderer` are **not** run.
- `npm run check:circular` passes when it prints **exactly** the cycles recorded in Phase 0 and no others. Type-only imports are erased and cannot cause a cycle.
- `npm run check:renderer-types` compares renderer type errors with a baseline. A **new** error fails. Never refresh `scripts/renderer-typecheck-baseline.json`, `scripts/circular-deps-baseline.json`, or any other baseline file to make a gate pass.
- **Quick loop while you work:** `npm run build:main`, then `node dist/main/<path>.test.js` (or `dist/shared/...`). This is a shortcut only. The full bar decides pass or fail.
- **Native module lock.** If `npm test` fails in `rebuild:native:node` with `EBUSY` on `better_sqlite3.node`, close any running Electron app, rename `node_modules/better-sqlite3/build/Release/better_sqlite3.node` to `better_sqlite3.node.locked`, rerun `npm test`, then delete the `.locked` file.
- **No test may call a real model.**

---

## Conventions

These come from `.cursor/rules/` and `AGENTS.md`. Lint enforces some of them.

- **Orienting comments.** Every new function, constant, type, interface, and field needs a JSDoc block with a one-line summary, then `Purpose:` (or `Contract:` for types and interfaces), `When to use:`, `Expected outcome:`, and `Exceptions:`. **Do not copy the generic filler** that many existing blocks contain. Write what the code does, when to call it, what it returns, and what it throws.
- **Logging in `src/main`.** A new **exported** function that changes state logs `logDebug` on entry. A new exported getter or pure builder logs `logTrace`. Log context carries ids, keys, and counts only. Never log message text, a prompt body, a payload body, or an API key. New **private** helpers add no log lines. A caught exception logs `logError`.
- **No logging in `src/shared` or `src/renderer`** (the renderer may use `console.error` in a `catch`, as `commanderPoolClient.ts` does).
- **Names.** camelCase files, directories, and functions, PascalCase types, UPPER_SNAKE constants. Follow `doc/naming-conventions-contract-v1.md`: the only role suffixes are `Handler`, `Helpers`, `Guards`, `Adapter`, `Pipeline`, `Core`, and `Types`, and `Utils`, `Impl`, `Manager`, `Service`, `Processor`, and `Controller` are banned. Use the file names this plan gives. Names from this plan (phase numbers, plan file names) must never appear in code, comments, test names, or `doc/`.
- **Seat ids.** Production code uses `HUMAN_SEAT_ID`, `AI_SEAT_IDS`, and the guards in `src/shared/seatIds.ts`, never string literals. Tests may use literals.
- **Size limits.** Files should stay under 600 lines and must stay under 1000. Functions take 6 or fewer named parameters. Use a parameter object for more. Files already past 600 lines get call lines only. Put logic in new files.
- **`readonly`.** Mark parameter arrays and object fields `readonly` where they are not reassigned. Use `const` unless a value is reassigned.
- **Tests.** Test happy paths and essential failures only. A new test file copies the imports and structure of the nearest sibling test file.
- **Database access in the main process.** Modules under `src/main/recorder/` and `src/main/matchStatistics/` use `gameDbOps` and `hasDbHandle` from `src/main/gameDb/dbConnection.ts` and leaf files under `src/main/gameDb/`. They never import the barrel `src/main/gameDb.ts`. IPC handlers may import the barrel.
- **Save format.** `EXPECTED_USER_VERSION` and `GAME_DB_REQUIRED_TABLES` do not change. A new column is added on open, the way `ensureSeatAddedColumns` does it.
- **Side names, flags, and colors.** A side's name on screen is `sideDisplayName` (`src/shared/sideNicknames.ts`). Its flag is `createSideNumberFlag` (`src/renderer/chrome/toastInlineMarks.ts`). Its color is the color the top bar and the unit tokens already use for that side. Find it before drawing anything (read `src/renderer/chrome/topBar.ts` and `src/shared/topBarSides.ts`) and reuse it. Do not invent side colors.
- **Text reaches the DOM through `textContent`.** Never build HTML from match text.
- **Docs.** `AGENTS.md` requires `doc/` to change in the same change as the code, and the UX suite is normative. Before changing a surface, read its `doc/ux/` document and the cross-cutting documents `doc/ux-specification.md` routes it through. A new element document uses the fixed heading set (copy the headings of `doc/ux/selection-panel.md` exactly), gets a row in the routing table of `doc/ux-specification.md`, and lists its Code Entry Points. A phase that changes what a model is told updates `doc/ai-commander-prompts/` in that phase. Your final message names every document you updated.

---

## Non-Goals

- No screen. The charts dialog is the next plan. No renderer file changes.
- No statistics below the strategic level. Tactical sub-units are not counted.
- No change to combat, movement, production, or what a turn does.
- No change to `README.md`.
- Do not edit anything under `.spec/completed/`.
- Do not "improve" code next to a phase's target. Make only the edits listed.

---

## Locked Decisions

The user made these. Do not revisit them.

1. **The charts are for the human player only.** The player sees every chart value, whatever fog of war is set to. Commanders are told nothing new. No prompt gains another side's statistics, or another commander's stance, trust, or threat, whether fog of war is on or off. A commander sees only what is already visible to it, plus its own trust and threat.
2. **Relationship metrics are four:** stance (five levels, already stored), trust (0 to 4), threat (0 to 4), and hexes taken (how many of the subject's hexes the reporting side captured in the last five turns). The first three are asked of the model in the talk stage and stay private to that commander, as stances are today. The fourth is computed by the engine.
3. **Missing data is shown as missing.** A value a commander never reported is null. Every reported value carries the turn it was reported.
4. **Statistics are strategic.** One set of values per side per strategic turn.
5. **Charts exist from the first turn that has statistics.** A match that began in an earlier build has none before the turn it is loaded on.

### Decisions this plan makes

Tell the user about these in your final message.

- **Statistics are recorded, not re-derived.** An earlier design note said charts would be extracted from frames. Upkeep and production come from engine functions that read the live match, so the reliable way to get them right is to compute them at each turn boundary with those functions and store the result as one small event. Frames stay as they are for anything added later.
- **A commander sees its own trust and threat** beside its own stance, in the Sides table of the talk prompt and the stance list of the orders prompt. They are its own reports, as the stance is.
- **The talk prompt keeps calling a stance private** and says no other commander is told it, trust, or threat. It does not mention that the player's charts show them.
- **The statistics event is engine-only.** It holds every side's numbers without fog and every commander's private scores, so its visibility is `engine`, like a frame. The charts channel still serves it to the player, which is decision 1.
- **"City cells held" is not a separate chart.** A side's production per turn is the sum of the city cells in the hexes it controls (`processProductionAfterControlResolution` adds `urbanHexCount` per controlled hex that is not on the neutral border). The two numbers are the same, so the production chart covers both.
- **Losses and captures are null for the first turn after a load.** Both are differences from the previous turn, and the previous turn's detail is kept in memory, not in the save.

---

## Design

### What is recorded

A new event type, `side_statistics`, written once per strategic step, directly after that step's frame. Payload:

```ts
// src/shared/matchStatistics.ts
export const STATISTIC_UNIT_TYPES = ['infantry', 'armor', 'naval', 'air', 'missile'] as const;
export const STATISTIC_MERCENARY_TYPES = ['infantry', 'armor', 'naval', 'air'] as const;
export const RELATIONSHIP_SCALE_MAX = 4;
export const HEXES_TAKEN_WINDOW_TURNS = 5;

export interface SideStatistics {
  readonly seatId: string;
  readonly out: boolean;
  readonly builtUnits: Readonly<Record<string, number>>;      // keyed by STATISTIC_UNIT_TYPES, mercenaries excluded
  readonly mercenaryUnits: Readonly<Record<string, number>>;  // keyed by STATISTIC_MERCENARY_TYPES
  readonly hexes: number;                 // strategic hexes controlled
  readonly productionPerTurn: number;     // city cells in controlled hexes, neutral-border hexes excluded
  readonly storedPoints: number;          // unspent production points in controlled hexes
  readonly treasury: number;              // credits
  readonly upkeepPerTurn: number;         // credits owed for mercenaries each turn
  readonly unitsLost: number | null;      // units this side had last turn and no longer has; null when unknown
  readonly costUsd: number;               // model cost so far; 0 for the human seat
}
export interface RelationshipReport {
  readonly seatId: string;                // the commander reporting
  readonly towardSeatId: string;          // the subject
  readonly stance: SideStance;
  readonly trust: number | null;          // 0..4
  readonly threat: number | null;         // 0..4
  readonly reportedTurn: number;
}
export interface HexesTaken {
  readonly bySeatId: string;
  readonly fromSeatId: string;
  readonly hexes: number;                 // this turn only
}
export interface TurnStatistics {
  readonly turnNumber: number;
  readonly sides: readonly SideStatistics[];              // every seat, in side order
  readonly relationships: readonly RelationshipReport[];  // every stored stance row
  readonly hexesTaken: readonly HexesTaken[] | null;      // null when unknown
}
```

- Visibility of the event is `engine`.
- The event's format version is 1.
- When a turn has more than one strategic frame (the state after a battle is its own frame), it has more than one `side_statistics` event. Readers use the last one for each turn.

### Module map

| File | Holds |
| --- | --- |
| `src/shared/matchStatistics.ts` | The types above, the constants, and pure helpers. No logging |
| `src/main/matchStatistics/sideStatisticsRead.ts` | Reads one turn's statistics from the open match |
| `src/main/matchStatistics/turnDifferences.ts` | Units lost and hexes taken, from the previous turn kept in memory |
| `src/main/matchStatistics/statisticsRecording.ts` | Writes the event at a strategic boundary |
| `src/main/matchStatistics/statisticsHistory.ts` | Reads the recorded series back, one entry per turn |
| `src/main/ipc/matchChartsIpcHandler.ts` | `game:readMatchCharts` |

---

## Phase 0 — Baseline and Prerequisites

**Add:** nothing. **Edit:** nothing.

1. Run `git status --short` and record the output in the Phase 0 Inventory. Uncommitted work already in the tree is the baseline.
2. Run the Verification Bar. Record pass or fail for each command, and the exact cycle list `check:circular` prints.
3. **Prerequisite.** The recorder and the talk stage must exist. Confirm: `src/main/recorder/matchRecorder.ts` (`recordStepBoundary`, `recordMatchEvent`), `src/main/recorder/matchRecordStore.ts` (`listMatchRecords`), `src/main/gameDb/mercenaryEconomyRead.ts` (`readMercenaryFunds`), `src/main/gameDb/seatRosterStore.ts` (`readSeatRoster`), `src/shared/matchRecording.ts` (`MATCH_EVENT_TYPES`, `MATCH_EVENT_FORMAT_VERSIONS`), `src/main/gameDb/sideMessageStore.ts` (`upsertSideStance`, `listSideStances`), `src/main/gameDb/sideMessageTables.ts` (`SIDE_MESSAGE_TABLES_DDL`, `ensureSideMessageTables`), `src/main/openRouter/talk/talkReply.ts` (`parseTalkReply`, `TalkReplyStance`), `src/main/openRouter/talk/talkReplySchema.ts`, `src/main/openRouter/talk/talkPrompt.ts` (the text `No other commander is told it`), `src/main/openRouter/talk/talkPromptInput.ts`, `src/main/openRouter/talk/ordersMessagesBlock.ts`, `src/main/openRouter/talk/talkRoundPersistence.ts`. **If any is missing, stop** and tell the user.
4. Read, and do not edit: `src/main/gameDb/seatRosterStore.ts` (`ensureSeatAddedColumns`), `src/main/gameDb/mercenaryEconomyRead.ts` (`readMercenaryFunds`, `withMercenaryEconomy`), `src/shared/topBarStats.ts` (`computeTopBarStats`, for how production capacity is counted), and `doc/match-recording.md`.
5. Record the value of `EXPECTED_USER_VERSION`. This plan does not change it.

**Stop if** the bar fails before any edit.

---

## Phase 1 — Trust and Threat in the Talk Reply

A commander reports trust and threat with each stance, and both are stored.

**Add:** nothing.
**Edit:** `src/shared/sideMessages.ts`, `src/shared/sideMessages.test.ts`, `src/main/gameDb/sideMessageTables.ts`, `src/main/gameDb.ts`, `src/main/gameDb/sideMessageStore.ts`, `src/main/gameDb/sideMessageStore.test.ts`, `src/main/openRouter/talk/talkReply.ts`, `src/main/openRouter/talk/talkReply.test.ts`, `src/main/openRouter/talk/talkRoundPersistence.ts`, `src/main/openRouter/talk/talkRoundPersistence.test.ts`, `src/main/recorder/matchRecordingEvents.ts`, `src/shared/matchRecording.ts`, `src/main/fixtures/` (one new fixture), `doc/save-files.md`, `doc/match-recording.md`, `doc/commander-messages.md`

### Steps

1. `src/shared/sideMessages.ts`: add `export function cleanRelationshipScore(raw: unknown): number | null`. It returns the integer when `raw` is a number (or a numeric string) that rounds to a whole number from 0 to 4, and null for anything else.
2. Columns. In `sideMessageTables.ts`, define each column once, as a constant holding its definition: `trust INTEGER CHECK (trust IS NULL OR trust BETWEEN 0 AND 4)` and the same for `threat`. Add both to the `side_stances` statement from those constants, after `updated_turn`. Add `export function ensureSideStanceScoreColumns(ops: BasicDbOps): void`, which runs `ALTER TABLE side_stances ADD COLUMN ` plus the same constant for each column that `PRAGMA table_info(side_stances)` does not list. A fresh table and an upgraded one then have the same columns. Model it on `ensureSeatAddedColumns`. In `gameDb.ts`, call `ensureSideStanceScoreColumns(gameDbOps)` directly after each of the three `ensureSideMessageTables(...)` calls, and name it in the comment on `EXPECTED_USER_VERSION`.
3. `sideMessageStore.ts`: `SideStanceRow` gains `trust: number | null` and `threat: number | null`. `upsertSideStance` takes both, stores both, and reports `changed: true` when stance, reason, trust, or threat differs from the stored row. `listSideStances` returns them. Add `listAllSideStances(ops): SideStanceRow[]`, every row, ordered by `seat_id` then `toward_seat_id`.
4. `talkReply.ts`: `TalkReplyStance` gains `trust: number | null` and `threat: number | null`, read from the entry's `trust` and `threat` with `cleanRelationshipScore`. A stance entry with a valid stance and a bad or missing score is **kept**, with that score null. It is not counted in `droppedCount`.
5. `talkRoundPersistence.ts`: pass trust and threat to `upsertSideStance`, and to `recordSideStanceDeclared`.
6. `matchRecordingEvents.ts`: `recordSideStanceDeclared` takes `trust` and `threat` and puts them in the payload. In `src/shared/matchRecording.ts`, raise `stance_declared` in `MATCH_EVENT_FORMAT_VERSIONS` to 2. Add a fixture beside `src/main/fixtures/recording-format-1.jsonl` holding one header line, one static line, and one `stance_declared` record with `formatVersion: 2` and both scores, and a test case in the existing recording-file test that parses it. Keep every existing fixture.
7. Docs: `doc/save-files.md` (the two columns are added on open, name the function), `doc/match-recording.md` (the payload and its version), `doc/commander-messages.md` (what trust and threat are, their range, and that a missing score is stored as null).

The reply schema and the prompt text that ask for the scores change together in Phase 5. The schema is strict, so a required field added here would make the model invent scores it was never asked for. Until Phase 5 the model does not send them, and every score is null. That is a valid state.

### Tests

- `sideMessages.test.ts`: `cleanRelationshipScore` returns 0 and 4 for those values, 3 for `'3'`, and null for `5`, `-1`, `2.5`, `'x'`, `null`, and `undefined`.
- `sideMessageStore.test.ts`: a stance stored with trust 1 and threat 3 reads back with both. Storing the same stance with a different trust reports `changed: true`. After `ALTER TABLE side_stances DROP COLUMN trust` and the same for threat (or on a table created from the old statement), `ensureSideStanceScoreColumns` adds both, and a second call does nothing. `listAllSideStances` returns rows from two seats in order.
- `talkReply.test.ts`: a stance with `"trust": 2, "threat": 4` parses with both. A stance with no scores parses with both null and `droppedCount` 0. A stance with `"trust": 9` parses with trust null.
- `talkRoundPersistence.test.ts`: the stored row and the `stance_declared` event both carry the scores.

### Verification

Run the Verification Bar. The existing save, load, and validation tests must pass without edits.

---

## Phase 2 — Reading One Turn's Statistics

One function returns every side's numbers for the current state of the open match.

**Add:** `src/shared/matchStatistics.ts`, `src/shared/matchStatistics.test.ts`, `src/main/matchStatistics/sideStatisticsRead.ts`, `src/main/matchStatistics/sideStatisticsRead.test.ts`
**Edit:** nothing.

### Steps

1. `src/shared/matchStatistics.ts`: the types and constants from the Design section, plus these pure helpers:
   - `totalUnits(counts: Readonly<Record<string, number>>): number`
   - `emptyUnitCounts(types: readonly string[]): Record<string, number>`, every type present with 0.
2. `sideStatisticsRead.ts`: `export function readSideStatistics(ops: BasicDbOps, seats: readonly { seatId: string; seatOrder: number; outTurn: number | null; costUsd: number }[]): SideStatistics[]`. It returns one entry per seat, in side order, with `unitsLost: null`. The caller fills that in. For each seat:
   - `builtUnits` and `mercenaryUnits`: `SELECT unit_type, is_mercenary, COUNT(*) FROM units WHERE player = ? GROUP BY unit_type, is_mercenary`. Every type in the constant lists is present, with 0 when there are none.
   - `hexes`: `SELECT COUNT(*) FROM res_s_control WHERE controller_player_id = ?`.
   - `productionPerTurn`: the sum of `res_s_infrastructure.urban_hex_count` over hexes this seat controls, leaving out hexes whose `hexes.map_role` is `'neutral_border'`. This is production **capacity**, the number the top bar shows as Production per turn (`computeTopBarStats` in `src/shared/topBarStats.ts`). Do not leave out a hex that has no build queue or cannot build this turn: `processProductionAfterControlResolution` skips those when it spends points, but they still count toward capacity.
   - `storedPoints`: the sum of `res_s_build_progress.stored_points` over hexes this seat controls.
   - `treasury` and `upkeepPerTurn`: `credits` and `upkeepPerTurn` from `readMercenaryFunds(ops, seatId)` in `src/main/gameDb/mercenaryEconomyRead.ts`. That is the function the top bar's credits readout is built from (through `withMercenaryEconomy` in the same file). Do not write a second upkeep formula.
   - `costUsd`: from the seat record. `out`: `outTurn != null`.
   The seat list is a parameter so this module does not import the barrel. Callers pass the roster.

### Tests

- `matchStatistics.test.ts`: `totalUnits` and `emptyUnitCounts`.
- `sideStatisticsRead.test.ts`, on a seated temp match (read the seat rows with `readSeatRoster` from `src/main/gameDb/seatRosterStore.ts`):
  - Every seat has an entry, in side order, with every unit type key present.
  - After inserting one mercenary infantry for a seat (copy an existing unit row and set `is_mercenary = 1` and a new id), that seat's `mercenaryUnits.infantry` is 1, its `builtUnits.infantry` is unchanged, and its `upkeepPerTurn` is above 0 and equal to `readMercenaryFunds(...).upkeepPerTurn`.
  - `hexes` equals a direct count from `res_s_control`.
  - After giving a controlled hex `urban_hex_count = 7` and `stored_points = 5`, `productionPerTurn` and `storedPoints` rise by those amounts. The same hex marked `neutral_border` does not count toward `productionPerTurn`. A controlled city hex with no build queue still counts.
  - `treasury` follows an update to `res_s_treasury`.

### Verification

Run the Verification Bar.

---

## Phase 3 — Losses, Captures, and Recording

Each strategic turn's statistics are stored as one event.

**Add:** `src/main/matchStatistics/turnDifferences.ts`, `src/main/matchStatistics/turnDifferences.test.ts`, `src/main/matchStatistics/statisticsRecording.ts`, `src/main/matchStatistics/statisticsRecording.test.ts`
**Edit:** `src/shared/matchRecording.ts`, `src/main/recorder/matchRecorder.ts`, `src/main/recorder/matchRecorder.test.ts`, `src/main/gameDb/resetGame.ts` (only if step 4 needs it), `doc/match-recording.md`

### Steps

1. `src/shared/matchRecording.ts`: add `'side_statistics'` to `MATCH_EVENT_TYPES`, with format version 1.
2. `turnDifferences.ts` keeps the previous turn in module memory:

   ```ts
   export interface TurnOwnership {
     readonly matchGeneration: number;
     readonly turnNumber: number;
     readonly unitOwnerById: ReadonlyMap<string, string>;
     readonly hexControllerById: ReadonlyMap<string, string>;   // controlled hexes only
   }
   export function readTurnOwnership(ops: BasicDbOps, turnNumber: number, matchGeneration: number): TurnOwnership
   export function unitsLostBySeat(previous: TurnOwnership | null, current: TurnOwnership, seatIds: readonly string[]): Map<string, number> | null
   export function hexesTakenBetween(previous: TurnOwnership | null, current: TurnOwnership, seatIds: readonly string[]): HexesTaken[] | null
   export function rememberTurnOwnership(next: TurnOwnership): void
   export function rememberedTurnOwnership(turnNumber: number, matchGeneration: number): TurnOwnership | null
   export function forgetTurnOwnershipForTests(): void
   ```

   - Memory holds at most two entries: the latest ownership for each of the last two turn numbers of one match generation. `rememberTurnOwnership` replaces the entry for `next.turnNumber`, drops every entry of another generation, and drops turns older than `next.turnNumber - 1`. `rememberedTurnOwnership` returns the entry for that turn and generation, or null.

   - Both difference functions return null when `previous` is null, when its `matchGeneration` differs, or when `current.turnNumber` is not exactly `previous.turnNumber + 1`.
   - A unit is lost by seat S when its id was owned by S in `previous` and is absent from `current`, or is owned there by anyone else (a mercenary that deserted counts as lost).
   - A hex is taken by seat A from seat B when B controlled it in `previous`, A controls it in `current`, and both are seats in `seatIds` and differ. Neutral is not a seat.
   - `hexesTakenBetween` returns one entry per ordered pair with a count above 0.
3. `statisticsRecording.ts`: `export function recordTurnStatistics(step: StepKey, seats: readonly SeatForStatistics[]): void`. It never throws: catch, `logError` with counts only, return.
   - It does nothing unless `step.scope` is `'strategic'`.
   - It reads `readSideStatistics`, `listAllSideStances` (mapped to `RelationshipReport`, with `reportedTurn` from the row's `updated_turn`), and `readTurnOwnership` with `getMatchGeneration()` from `src/main/matchGeneration.ts`.
   - `previous` is `rememberedTurnOwnership(step.turnNumber - 1, generation)`. It fills `unitsLost` from `unitsLostBySeat(previous, current, ...)` (null for every seat when the function returns null) and `hexesTaken` from `hexesTakenBetween`.
   - It calls `recordMatchEvent({ type: 'side_statistics', step, visibility: 'engine', payload })`.
   - It then calls `rememberTurnOwnership(current)`. A turn with a battle has two strategic frames and two events. Both compare against the turn before, and the next turn compares against the later one, after the battle. So no loss is counted twice or missed.
4. Hook. `matchRecorder.ts`, `recordStepBoundary`: directly after the code that writes a frame because the step changed, and also directly after the forced final frame at match end, call `recordTurnStatistics(step, readSeatRoster(gameDbOps))`. `readSeatRoster` is in `src/main/gameDb/seatRosterStore.ts`, a leaf file that does not import the barrel. `SeatForStatistics` is `Pick<SeatRecord, 'seatId' | 'seatOrder' | 'outTurn' | 'costUsd'>`. `recordStepBoundary` must stay unable to throw.
5. `doc/match-recording.md`: add the event to the event table, describe its payload by naming `TurnStatistics`, and say when `unitsLost` and `hexesTaken` are null.

### Tests

- `turnDifferences.test.ts`, with hand-built ownership values: a unit that disappears is lost by its old owner; a unit that changes owner is lost by its old owner; a hex that moves from seat B to seat A is one hex taken by A from B; a hex that moves to no controller, or from neutral, is not counted; a null previous, a different generation, and a gap of two turns each return null; `rememberTurnOwnership` keeps the later of two entries for one turn and forgets a turn two back.
- `statisticsRecording.test.ts`, on a seated temp match:
  - The first call writes one `side_statistics` event whose payload has every seat, `unitsLost: null` for each, and `hexesTaken: null`.
  - After deleting one unit and moving the turn to 2, the next call's payload has `unitsLost: 1` for that unit's owner and 0 for the others, and `hexesTaken` is an empty list.
  - After deleting a second unit and calling again for turn 2 (the state after a battle), the payload has `unitsLost: 2` for that owner. After moving to turn 3 with no change, the next call has 0 for every seat.
  - A tactical step writes nothing.
  - A stored stance row appears in `relationships` with its `reportedTurn`.
- `matchRecorder.test.ts`: after a boundary call that writes a frame, `match_records` has a `side_statistics` row directly after that frame.

### Verification

Run the Verification Bar. `check:circular` matters here: `src/main/matchStatistics/` must not import the barrel `src/main/gameDb.ts`.

---

## Phase 4 — Reading the Series Back

One function returns the whole match's statistics, one entry per turn, and an IPC channel serves it.

**Add:** `src/main/matchStatistics/statisticsHistory.ts`, `src/main/matchStatistics/statisticsHistory.test.ts`, `src/main/ipc/matchChartsIpcHandler.ts`, `src/main/ipc/matchChartsIpcHandler.test.ts`
**Edit:** `src/shared/matchStatistics.ts`, `src/main/recorder/matchRecordStore.ts`, `src/main/recorder/matchRecordStore.test.ts`, `src/shared/ipc/channels.ts`, `src/main/preload.ts`, `src/shared/ipc/gameApiTypes.ts`, `src/main/main.ts`

### Steps

1. `matchRecordStore.ts`: add `listMatchEventsOfType(ops, recordType: MatchEventType): MatchRecord[]`, in `record_id` order, payloads decoded. It selects only rows of that type, so reading statistics never decodes a frame.
2. `statisticsHistory.ts`: `export function readStatisticsHistory(ops: BasicDbOps): TurnStatistics[]`. It lists the `side_statistics` events, keeps the last one for each `turnNumber`, and returns them in turn order. A payload that is not an object with a numeric `turnNumber` and a `sides` array is skipped.
3. `src/shared/matchStatistics.ts`: add

   ```ts
   export interface MatchChartsSeat { readonly seatId: string; readonly seatOrder: number; readonly kind: 'human' | 'ai'; readonly name: string }
   export interface MatchChartsSnapshot {
     readonly seats: readonly MatchChartsSeat[];        // side order
     readonly turns: readonly TurnStatistics[];         // turn order, may be empty
     readonly currentTurnNumber: number;
   }
   ```

4. `matchChartsIpcHandler.ts`: `export function buildMatchChartsSnapshot(): MatchChartsSnapshot` and `export function registerMatchChartsIpcHandler(ipcMain: IpcMain): void` for the channel `game:readMatchCharts`. Seat names come from `sideDisplayName`. With no database, it returns empty lists and turn 1. **It applies no fog filter.** That is decision 1: the player sees every value. Nothing in `src/main/openRouter/` may call it.
5. Add `readMatchCharts: 'game:readMatchCharts'` to `IPC_GAME` in `channels.ts`, to the preload's own channel list and exposed API in `preload.ts`, and to `gameApiTypes.ts`, following `readSideMessages`. Register the handler in `main.ts` next to `registerSideMessageIpcHandler`.

### Tests

- `matchRecordStore.test.ts`: `listMatchEventsOfType` returns only that type, in order.
- `statisticsHistory.test.ts`: two events for turn 2 and one for turn 3 give two entries, the turn 2 entry being the later event; a broken payload is skipped.
- `matchChartsIpcHandler.test.ts`, on a seated temp match with fog of war on: after two recorded turns, the snapshot has every seat with its name, two turns, and the opponent's treasury in it.
- The channel parity tests (`src/main/preloadChannelParity.test.ts`, `src/main/preloadIpcChannelParity.test.ts`) pass.

### Verification

Run the Verification Bar.

---

## Phase 5 — Asking for Trust and Threat

The talk reply asks for trust and threat with each stance, and each commander sees its own scores. No prompt gains anything about another side.

**Add:** nothing.
**Edit:** `src/main/openRouter/talk/talkReplySchema.ts`, `src/main/openRouter/talk/talkReply.test.ts`, `src/main/openRouter/talk/talkPrompt.ts`, `src/main/openRouter/talk/talkPrompt.test.ts`, `src/main/openRouter/talk/talkPromptInput.ts`, `src/main/openRouter/talk/ordersMessagesBlock.ts`, `src/main/openRouter/talk/ordersMessagesBlock.test.ts`, and under `doc/ai-commander-prompts/`: `talk-prompt.md`, `strategic-prompt.md`, `tactical-prompt.md`, `example-strategic-prompt.md`, `example-tactical-prompt.md`, `crosswalk.md`, `source-inventory.md`; `doc/commander-messages.md`

### Steps

1. `talkReplySchema.ts`: the stance item gains `trust` and `threat`, each `{ type: 'integer', enum: [...] }` with the values 0 through `RELATIONSHIP_SCALE_MAX`, built from that constant in `src/shared/matchStatistics.ts`. Add both to the item's `required` list. The schema is `strict: true`, which needs every property listed in `required`. Use `enum`, not `minimum` and `maximum`. Strict structured output does not accept those on every provider.
2. `talkPrompt.ts`, `buildTalkSystemText`: replace the stance bullet. It currently reads (find it by `No other commander is told it`):

   > - Set how you regard each side. A stance is your private view of one side: ${stances}. No other commander is told it. Give a stance only for a side whose stance you want to set or change, with a reason of one short sentence.

   Replace it with exactly this, where `${max}` is `RELATIONSHIP_SCALE_MAX`:

   ```text
   - Set how you regard each side. A stance is your private view of one side: ${stances}. With each stance give trust, from 0 to ${max}, for how far you believe what that side tells you, and threat, from 0 to ${max}, for how dangerous that side is to you now. No other commander is told your stance, trust, or threat. Give a stance only for a side whose stance you want to set or change, with a reason of one short sentence.
   ```

   In the reply example in the same text, the stance entry becomes `{"toward":"<side code>","stance":"<${stanceEnum}>","trust":<0-${max}>,"threat":<0-${max}>,"reason":"<one sentence>"}`. This text is static, so the cached system prompt stays the same from turn to turn.
3. `talkPromptInput.ts`: `TalkPromptSide` (in `talkPrompt.ts`) gains `readonly trust: number | null` and `readonly threat: number | null`, with full orienting comments. `sideFromRoster` fills them from this commander's own `listSideStances` rows, and leaves them null on the own row and where no stance is stored. Nothing else is read.
4. `talkPrompt.ts`, `sidesTable`: a stored stance cell becomes `{stance} (trust {t}, threat {h}): {reason}`, with `not reported` in place of a null score. The header stays `Your stance`.
5. `ordersMessagesBlock.ts`: each line of `Your stances:` becomes `- {label} ({code}): {stance}, trust {t}, threat {h}. {reason}`, with `not reported` for a null score.
6. Docs: update the talk prompt document and the example prompts for the new bullet, the reply shape, and the stance cell. Update the strategic and tactical prompt documents, `crosswalk.md`, and `source-inventory.md` where they describe the stance list. In `doc/commander-messages.md`, describe trust and threat, their range, that they are private to the commander exactly as the stance is, and that the player's charts show them.

### Tests

- `talkReply.test.ts`: the response format's stance item requires `toward`, `stance`, `trust`, `threat`, and `reason`, and `trust` has the enum `[0, 1, 2, 3, 4]`.
- `talkPrompt.test.ts`: the system text contains `trust, from 0 to 4`, `threat, from 0 to 4`, and `No other commander is told your stance, trust, or threat`. Change the existing digit assertion, which expects exactly `['280']`: every digit run in the system text is now `280`, `0`, or `4`, and `280` appears once. A sides table with a stance of trust 3 and a null threat shows `trust 3, threat not reported`.
- `ordersMessagesBlock.test.ts`: an own stance with both scores prints them.
- **Privacy, with fog of war off.** On a seated temp match with three AI seats, store a stance from seat B toward seat C with the reason `b-private-reason`, trust 1, and threat 2. Build seat A's talk situation text and seat A's orders Messages block. Neither contains `b-private-reason`. Seat A's sides table shows only seat A's own stances.
- The existing `buildConsultPromptParts` tests pass: the orders system text is byte-identical to before this phase.

### Verification

Run the Verification Bar. If you can run the app with a key, run two turns of an Observe match and confirm `side_stances` rows gain trust and threat values. With `AGENT_WARS_LOG_FULL_PROMPTS=1`, an orders prompt shows the commander's own stances with scores.

---

## Phase 6 — Docs, Final Verification, and Hand-Off

**Add:** `doc/match-statistics.md`
**Edit:** `doc/README.md`

### Steps

1. Write `doc/match-statistics.md` in the voice of `doc/save-files.md`: what each number is and the symbol that computes it, when it is recorded, when a value is null, that no fog filter applies to the player's charts and why, that no commander is told any of it beyond its own stance, trust, and threat, the relationship metrics and their ranges, and `game:readMatchCharts`.
2. `doc/README.md`: add it to the index table with a role and a status.
3. Search the whole diff for plan vocabulary and remove it: `git diff | Select-String -Pattern 'Phase \d|history-1|execution plan|locked decision' -CaseSensitive:$false`. Nothing under `src/` or `doc/` may match.
4. Run the Verification Bar one last time.
5. Fill in the Completion Log.
6. In your final message, name every document you updated, and repeat the decisions listed under "Decisions this plan makes".

### Manual checklist for the user

1. Play three turns, save, and run `SELECT record_id, turn_number FROM match_records WHERE record_type = 'side_statistics';` on the save. Expect one row per strategic turn, more when a battle was fought.
2. In an Observe match with a key, after a few turns run `SELECT * FROM side_stances;`. Expect trust and threat values between 0 and 4.
3. With fog of war off and `AGENT_WARS_LOG_FULL_PROMPTS=1`, read one orders prompt. Expect the commander's own stances with trust and threat, and no other side's credits, stored points, stances, or scores.
4. Load a save from before this build and play a turn. Expect it to load, and statistics to begin at that turn.

---

## Reliability Checklist

- [ ] The phase's files were backed up before the first edit.
- [ ] New modules were tested before any existing code called them.
- [ ] `recordStepBoundary` and `recordTurnStatistics` cannot throw.
- [ ] The charts channel applies no fog filter, and nothing under `src/main/openRouter/` reads statistics or another commander's stance rows.
- [ ] The talk system text gained only static text. Nothing was added to a cached system prompt that changes during a match.
- [ ] `EXPECTED_USER_VERSION` and `GAME_DB_REQUIRED_TABLES` are unchanged.
- [ ] Nothing under `src/main/matchStatistics/` or `src/main/recorder/` imports the barrel `src/main/gameDb.ts`.
- [ ] Every new function, type, interface, field, and constant has a full orienting comment.
- [ ] `npm run check:circular` shows only the baseline cycles. No baseline file was edited.
- [ ] No commit, push, stash, checkout, restore, reset, or clean was run.
- [ ] No plan vocabulary appears in `src/` or `doc/`.

## Success Definition

- Every strategic turn records one `side_statistics` event with every side's built units, mercenaries, hexes, production per turn, stored points, credits, upkeep, losses, and model cost, every stored relationship report, and the hexes taken that turn.
- A commander's talk reply can carry trust and threat, both are stored, and a missing score is null.
- `game:readMatchCharts` returns the whole series with no fog filter.
- A commander's prompts show its own trust and threat beside its own stances, and nothing about other sides that they did not show before, whatever fog of war is set to.
- Saves from the previous build load. The Verification Bar passes. No renderer file changed.

---

## Phase 0 Inventory

| Item | Value |
|------|-------|
| `git status --short` | |
| `npm test` | |
| `npm run build:renderer` | |
| `check:circular` cycle list | |
| Prerequisites | |
| Missing symbols | |

## Defect Inventory

| Phase | Command | First error | Action taken |
|-------|---------|-------------|--------------|

## Completion Log

| Phase | Result | Sketch differences | Files changed outside the Add/Edit lists | Docs updated | What you saw in the running app |
|-------|--------|--------------------|-------------------------------------------|--------------|---------------------------------|
