# Side Combat Record: Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** Each commander sees, next to its stance toward every other side, a count the game computes from the loss record. The count gives how many of the commander's units that side destroyed and how many of that side's units the commander destroyed, split by who started the fight, with the latest turn the side destroyed one. It appears in the orders prompt's Messages section and in the talk prompt's Sides table. Weak models do not add up loss lines across ten turn blocks, so they keep friendly stances toward sides that are attacking them. The count puts the evidence where the stance decision is made.

Units destroyed whole in a tactical battle never reached the strategic loss notes, so the count would miss the hardest fights. This plan fixes that first.

**Shape:**

- Phase 0 records a baseline.
- Phases 1 to 3 carry battle losses into the strategic loss notes and print them.
- Phases 4 to 6 compute and word the record.
- Phase 7 shows it in both prompts.
- Phase 8 updates the documents.
- Phase 9 is the final verification.
- Phase 10 is optional and runs only when the user asks for it.

Each phase can be verified on its own, or together with the phases before it.

**Tech:** TypeScript (Electron main and shared code), better-sqlite3, test files run as plain `node <file>` after `npm run build:main`, ESLint with the local `orienting-comments` and `seat-id-literals` rules, `npm run naming:check`, and `scripts/check-circular-deps.cjs`.

---

## How to Use This Plan

- Run the phases in order, back to back. Do not pause between phases for review.
- **Stop only when a verification fails** and the phase's "If verification fails" steps do not fix it. Then revert that phase (see Backup and Revert), write the failure in the Completion Log, and stop. Tell the user which phase failed and why.
- Never commit, push, stash, or run `git checkout`, `git restore`, `git reset`, or `git clean`. The user reviews every change.
- Read the whole phase before you edit anything. Each phase lists the files it **Adds** and **Edits**. Do not edit other files, with two exceptions: removing an import that lint reports unused in a listed file, and fixing a test that fails only because of a change the phase names. Record any such file in the Completion Log.
- Find code by the quoted text, not by a line number. Line numbers here are hints from the tree on 2026-11-15 and may have moved.
- **Code blocks are sketches.** Write the real code from the file you just read. When a sketch and the file disagree, the file wins. Record the difference in the Completion Log. **Prompt strings, log message names, and exported names in this plan are not sketches.** Copy them exactly.
- **Tests come first.** Write the phase's tests, build, run them, and see them fail for the reason the phase names. A compile error because the new function does not exist yet counts as that failure. Then make the change and see them pass.
- Make no paid model calls. Do not set an OpenRouter key.
- **Another plan may run first.** `.spec/todo/v3.1.0/2026-11-15-history-1-match-statistics-execution-plan.md` also edits `src/main/openRouter/talk/talkPromptInput.ts`, `src/main/openRouter/talk/talkPrompt.ts`, and prompt documents. Neither plan depends on the other. Always re-read a file before you edit it. Never undo an edit another plan made. When this plan quotes text that has since changed, find the same place by meaning, and record the difference.

### Two Traps in This Repo

1. **Line endings.** The working tree uses CRLF (`core.autocrlf=true`). Keep every edited file's line endings as they were. Create new files with CRLF, like their neighbors. After each phase, check every added or edited file. The two numbers must be equal:

   ```bash
   f=src/main/gameDb/turnNotesHistory.ts; echo "$(tr -cd '\r' < $f | wc -c) $(wc -l < $f)"
   ```

   If an editing tool writes LF, convert the whole file to CRLF. Never leave a mixed file.
2. **Apostrophes in single-quoted strings.** The prompt strings in this plan contain words like `side's`. Inside a TypeScript single-quoted string the apostrophe must be written `\'`, or use a template literal. After writing a prompt string, open the file and check it. Shell tools may silently drop a backslash, so prefer the file editor for these lines.

### Backup and Revert

Nothing is committed. Before each phase, copy every file the phase **edits** into a backup folder outside the repo. Run this from the repo root in PowerShell. Set `$step` to the phase number and `$files` to that phase's **Edit** list.

```powershell
$step = '1'
$files = @('src/main/gameDb/turnNotesHistory.ts')
$backup = Join-Path $env:TEMP "aw-side-combat-record\step-$step"
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

The full `npm test` run takes a long time, so it runs only twice: in Phase 0 and in Phase 9. Every other phase uses this bar, run from the repo root:

1. `npm run build:main` exits 0.
2. Every test file the phase names passes: `node dist/main/<path>.test.js`. Read the summary lines (`ℹ pass`, `ℹ fail`). A few older files print their own `ok` line instead; for those, check that the exit code is 0.
3. `npx eslint <every .ts file the phase added or edited>` exits 0.
4. `npm run check:circular` prints exactly the cycles Phase 0 recorded, and no others. Do not edit `scripts/circular-deps-baseline.json`.
5. When the phase adds a file: `npm run naming:check` exits 0.
6. The line-ending check above passes for every added or edited file.

When `npm test` runs (Phases 0 and 9), run it in the background with output to a log file outside the repo, and read the tail:

```bash
npm test > "$TEMP/aw-side-combat-record-test.log" 2>&1; echo "exit $?" >> "$TEMP/aw-side-combat-record-test.log"
```

If that run is stopped early, check that no `node scripts/run-main-node-tests.cjs` or `node dist/main/...test.js` process is left running. Kill any that are.

---

## Locked Decisions

The user made these decisions. Do not reopen them.

1. **Fix the battle gap first.** Units a tactical battle destroys go into the strategic loss notes, and show in Recent Turn Notes under a `Battle` cause, before the record is built. The record then counts them.
2. **Split each count by who started the fight.** A plain total would count a commander's own failed attacks as the other side's aggression.
3. **Battle prompts show the world-map record.** The talk and orders prompts during a battle show the same strategic record as on the world map. They do not show a battle-only count.
4. **The conflict flag is optional.** Phase 10 is planned in full but runs only when the user asks for it after testing the record alone.

These are defaults chosen with the plan:

5. **Window.** The record covers the same turns as Recent Turn Notes: the `RECENT_TURN_NOTES_LIMIT` (10) newest strategic note rows before the current turn. Every unit in those rows counts, including groups an older block leaves out under its 12-group cap.
6. **Joint credit.** A unit whose responsible sides are `a3` and `a4` counts for each of them.
7. **Not counted:** `by unknown side` (`responsibleOwnerIds: null`), `no side responsible` (`[]`), and rows written before attribution existed.
8. **No Neutral row.** A commander cannot message Neutral or set a stance toward it. Neutral losses stay in the loss lines.
9. **Every active side gets a record line**, including a side with no stance yet.

---

## Background the Implementer Needs

These facts were checked against the code and a live debug log on 2026-11-15.

- **Every battle deletion goes through one function.** `recordDestroyedBattleParents` in `src/main/tacticalBattle/destroyedBattleParents.ts` is called from three places:
  - `syncStrategicUnitsDbWhenTacticalParentsEliminated` in `tacticalStrategicOrderPhases.ts`, when a parent loses its last sub-unit during a beat.
  - The direct delete in `tacticalBattleSession.ts`.
  - The exit threshold, `applyHumanVoluntaryBailoutStrategicParentElimination`, which runs inside `endTacticalBattleSessionCore` while the battle snapshot is still active.

  It receives the units the delete actually removed, including cargo lost with a transport, and skips ids it already recorded.
- **That list lives in memory and feeds the popup.** It is handed out once by `takeDestroyedBattleParents` at battle end. Autosaves are written at every tactical turn, so a battle can be saved and loaded mid-way, and the in-memory list does not survive a load. Battle losses must therefore be written to the database **when each parent is recorded**, not at battle end.
- **The active battle can be read without a cycle.** `getActiveTacticalBattleSnapshotRef` is in `src/main/tacticalBattle/activeTacticalBattleRef.ts`, which imports only a type and `tacticalLogging`. The snapshot (`TacticalBattleSnapshot` in `src/shared/tacticalBattleTypes.ts`) has `battleId`, `strategicTurnNumber`, `leadPartyId?`, and `opposingPartyId?`.
- **A battle has exactly two owners.** `tacticalBattlePartiesForOwners` (`tacticalBattleParties.ts`) accepts either a human plus one other owner, or two non-Neutral owners. On a human battle `leadPartyId` is absent and the human (`HUMAN_SEAT_ID`) is the other party. So the side responsible for a destroyed parent is always the other party.
- **Timing.** A battle runs during strategic turn N, after turn N's orders and before turn N is resolved. `snapshot.strategicTurnNumber` is N. Turn N's own loss capture (`captureStrategicTurnLossNote`) runs later, and its upsert **replaces** the loss columns of the `(seat, 'strategic', '', N)` row.
- **The battle id keeps the rows apart.** The primary key of `turn_notes_history` is `(seat_id, scope, battle_id, turn_number)`. A row with scope `strategic` and `battle_id` set to the battle id never conflicts with the turn's own row (`battle_id = ''`), so neither write overwrites the other. Today nothing writes strategic rows with a battle id. `getRecentTurnNotes` filters on `battle_id`, so those rows are invisible until this plan reads them. Other uses of the table:
  - `clearTacticalTurnNotes` deletes only `scope = 'tactical'`.
  - `resetGameForNewMatch` clears the table.
  - The match recorder excludes the table (`MATCH_TABLE_RECORDING_POLICY`).
- **Melee losses do not say who started.** The `melee` bucket holds both sides' deaths. In one game, `by you, Melee attack at C8: a2-t5` was an attacker's loss. Ranged, air-strike, and missile losses were started by the responsible side. Return-fire losses (including anti-air) were started by the victim's side. Cargo and air-base losses (`other`) have no clear starter.
- **Turn notes are written for active AI seats only**, through `activeAiSeatIds(getSeatRoster())`, as in `captureTurnLossNoteFromResolution` (`src/main/gameActions/captureTurnLossNote.ts`).
- **Both prompts read sides from one place.** `readTalkSides` (`src/main/openRouter/talk/talkPromptInput.ts`) feeds the talk Sides table and `buildOrdersMessagesBlock` (`ordersMessagesBlock.ts`). The orders block today lists only sides with a stored stance, and returns no block when there are no threads and no stances.

---

## Design Rules the Implementer Must Keep

- **The popup does not change.** The map toast, the turn-update popup, and the Reports copy share `src/shared/lossSummary.ts`. Phase 2 adds one new pure function to that file, `lostUnitIdsOf`. Do not change anything else in it. Do not edit `buildTurnLossSummary`, `takeDestroyedBattleParents`, or anything under `src/renderer`.
- **No schema change.** No new table or column, and no change to `EXPECTED_USER_VERSION` (26). Battle losses use existing columns.
- **Owner, not id prefix.** The victim's side comes from `DestroyedBattleParent.ownerId` or `attribution.ownerId`, never from a unit id.
- **No seat-id string literals in production code.** Use `HUMAN_SEAT_ID`, `NEUTRAL_OWNER_ID`, and the helpers in `src/shared/seatIds.ts`. Tests may use literal values such as `'opponent'`, as existing tests do.
- **Logging.**
  - An exported function under `src/main` that changes state logs `logDebug` on entry with ids and counts.
  - A pure per-unit helper or a read logs `logTrace` instead.
  - Every caught exception logs `logError` with the error.
  - Never log a prompt body.
  - `src/shared` never imports the logger.
- **A battle-loss write never throws.** It runs inside unit deletion. A failure logs and returns, so the deletion and the battle continue.
- **File size.** No file may pass 1000 lines. Keep new files under 400.
- **Parameters.** A function takes at most 6 parameters (rule 10). Use the signatures this plan gives. An object parameter needs an orienting comment on its type and on every field.
- **A prompt read never breaks a prompt.** The new reads in Phases 3 and 6 catch their own errors, log `logError`, and return an empty result. The prompt is then built as it was before this change.
- **Tests.** Test the contract and the essential failure cases only (rule 03). The cases each phase lists are that set. Do not add tests for private helpers.
- **Comments.** Every new or changed declaration has the orienting JSDoc block: a one-line summary, then `Purpose:` (or `Contract:` on interface members), `When to use:`, `Expected outcome:`, and `Exceptions:`. Write specific text in the voice of the file. Lint rejects the wrong layout.
- **Mutability.** Use `const`, `readonly` fields, and `readonly` arrays for anything not modified.
- **Plan vocabulary stays out of the product.** No phase numbers, "plan", "locked decision", or "known gap" in `src/`, `scripts/`, or `doc/` (rule 12).
- **Names.** New files under `src/` are camelCase and use no banned suffix (`doc/naming-conventions-contract-v1.md`). The names below were chosen to pass `npm run naming:check`.

---

## Non-Goals

- No change to the popup, the toast, the Reports tab, or `src/renderer`.
- No change to combat, dice, battle rules, or which units are removed.
- No killer type counts on battle losses. A battle line ends without `(by ...)`.
- No change to tactical-scope notes or the tactical Recent Turn Notes section.
- No change to the cached orders system text (`sideMessageRuleText.ts`). The talk system text changes one sentence in Phase 7.
- No edit to the historical documents listed in `AGENTS.md`.

## Known Gaps

These are accepted limits. Do not fix them. Phase 8 records each one in the prompt documents, in product words.

1. **Close combat has no starter.** Melee and battle losses are counted as "in close combat or battle", not as one side's attack.
2. **Side-level credit.** Joint credit and hex-matched strategic air strikes count a side that took part but did not land the kill.
3. **Battles before this change.** A battle fought before the update wrote no battle rows, so its losses are not counted.
4. **Silent removals** that never reach any loss list stay missing, as the strategic prompt document already states.

---

## Phase 0 — Baseline

**Adds:** nothing. **Edits:** nothing.

1. Run `git status --short` and record the output in the Completion Log. Expect no source changes.
2. Run `npm run check:circular` and record the cycle list exactly.
3. Run `npm test` in the background (see Verification Bar) and record the exit code and the last 20 lines.
4. Run `npm run naming:check` and record the exit code.

**Verification:** `npm test` and `naming:check` exit 0. If either fails before any change, stop and tell the user. The plan needs a green baseline.

---

## Phase 1 — Battle-Loss Rows in the Notes Table

Adds two reads to the notes table: one row's loss columns, and a turn list's battle-loss rows. Nothing calls them yet.

**Adds:** nothing. **Edits:** `src/main/gameDb/turnNotesHistory.ts`, `src/main/turnNotesHistory.test.ts`.

### Steps

1. Read `src/main/gameDb/turnNotesHistory.ts` in full. Note `TurnNotesDbOps`, `TurnNotesScope`, `upsertTurnLossNote`, and `getRecentTurnNotes`.
2. Add this key type and getter:

   ```ts
   export interface TurnNoteKey {
     readonly seatId: AiSeatId;
     readonly scope: TurnNotesScope;
     readonly battleId: string;
     readonly turnNumber: number;
   }

   export interface TurnLossNoteColumns {
     readonly ownLossJson: string | null;
     readonly otherLossJson: string | null;
   }

   export function getTurnLossNoteColumns(ops: TurnNotesDbOps, key: TurnNoteKey): TurnLossNoteColumns | null
   ```

   - Log `logTrace('turnNotesHistory getTurnLossNoteColumns', { ...key })`.
   - Return `null` when `!ops.hasDb()` or the row does not exist.
   - Read with `SELECT own_loss_json, enemy_loss_json FROM turn_notes_history WHERE seat_id = ? AND scope = ? AND battle_id = ? AND turn_number = ?`. Use `ops.getOne` (`GuardedDbOps` has it).
   - Map `own_loss_json` to `ownLossJson` and `enemy_loss_json` to `otherLossJson`.
3. Add the battle-row reader:

   ```ts
   export interface StrategicBattleLossRow {
     readonly turnNumber: number;
     readonly battleId: string;
     readonly ownLossJson: string | null;
     readonly otherLossJson: string | null;
   }

   export function listStrategicBattleLossRows(
     ops: TurnNotesDbOps,
     seatId: AiSeatId,
     turnNumbers: readonly number[]
   ): StrategicBattleLossRow[]
   ```

   - Log `logTrace('turnNotesHistory listStrategicBattleLossRows', { seatId, turnCount: turnNumbers.length })`.
   - Return `[]` without a query when `!ops.hasDb()` or `turnNumbers` is empty.
   - Query: `SELECT turn_number, battle_id, own_loss_json, enemy_loss_json FROM turn_notes_history WHERE seat_id = ? AND scope = 'strategic' AND battle_id <> '' AND turn_number IN (?, ?, ...) ORDER BY turn_number ASC, battle_id ASC`. Build one `?` per turn number, and pass the numbers as parameters. Never interpolate a value into the SQL.
4. Write the orienting comment on each new declaration. The getter's `When to use:` names the battle-loss writer. The reader's names the strategic loss window.

### Tests (`src/main/turnNotesHistory.test.ts`)

This file already tests the table. It does not use `node:test`: each case is an `async function` that opens a temp database, and `run()` calls each case in turn and prints `turnNotesHistory.test.ts passed`. Add the cases below in that style. Give each one the orienting comment the existing cases have, and call each from `run()`.

- Open the database as the existing cases do, with `openGameDatabaseAtPathForTests` and `closeGameDatabaseForTests`.
- Write rows with the facade, `gameDb.upsertTurnLossNote(seatId, scope, battleId, turnNumber, ownJson, otherJson)`.
- Import the new reads with `await import('./gameDb/turnNotesHistory')`, and `gameDbOps` with `await import('./gameDb/dbConnection')`.
- Use `'opponent'` and `'opponent2'` as seat ids, as the file does.

1. `getTurnLossNoteColumns` returns `null` for a key with no row.
2. After `upsertTurnLossNote` with own `'{"a":1}'` and other `'{"b":2}'`, it returns exactly those strings.
3. `listStrategicBattleLossRows` returns only matching rows. Seed:
   - one strategic row with `battle_id ''` for turn 3
   - strategic battle rows `tb-x` at turn 3 and `tb-y` at turns 3 and 5
   - a tactical row `tb-x` at turn 3
   - a strategic battle row for another seat at turn 3

   For turns `[3, 4]` it returns the `tb-x` and `tb-y` rows of turn 3 only, in that order.
4. `listStrategicBattleLossRows` with `[]` returns `[]`.

### Verification

The Verification Bar, with `node dist/main/turnNotesHistory.test.js`. It passes when it prints `turnNotesHistory.test.ts passed` and exits 0. Also run `node dist/main/gameActions/captureTurnLossNote.test.js` and `node dist/main/recentTurnNotesSection.test.js`, which must still pass.

**If verification fails:** check the placeholder count against the parameter array first.

---

## Phase 2 — Write Battle Losses When a Battle Destroys a Parent

Each time a battle destroys parents, every active AI seat's battle row for that battle and turn gains them. Nothing prints them yet.

**Adds:** `src/main/tacticalBattle/battleParentLossNotes.ts`, `src/main/tacticalBattle/battleParentLossNotes.test.ts`. **Edits:** `src/shared/lossSummary.ts` (one new function), `src/main/tacticalBattle/destroyedBattleParents.ts`, `src/main/tacticalBattle/tacticalBattleSession.test.ts`.

### The Unit-Id Helper (`src/shared/lossSummary.ts`)

Phases 2 and 3 both skip a unit whose id is already in a loss summary. Both use this one function. Add it after `playerHasAnyLoss`:

```ts
export function lostUnitIdsOf(summaries: readonly PlayerLossSummary[]): Set<string>
```

It returns the `unitId` of every unit in every bucket of every summary, skipping units with no id or an empty one. It is pure and does not log, because `src/shared` never imports the logger. Its orienting comment names both callers. It needs no test of its own: the de-duplication tests in Phases 2 and 3 cover it.

### Contract (`battleParentLossNotes.ts`)

```ts
/** What a battle-loss write needs to know about the battle. */
export interface BattleLossContext {
  readonly battleId: string;
  readonly strategicTurnNumber: number;
  readonly leadPartyId?: OwnerId;
  readonly opposingPartyId?: OwnerId;
}

export function battleLossResponsibleOwnerIds(context: BattleLossContext, victimOwnerId: string): readonly string[] | null;
export function battleParentLostUnit(parent: DestroyedBattleParent, context: BattleLossContext): LostUnit | null;
export function writeBattleParentLossNotes(parents: readonly DestroyedBattleParent[], context: BattleLossContext): void;
```

Give every field of `BattleLossContext` its own orienting comment. It mirrors the same-named fields of `TacticalBattleSnapshot`.

### Rules

1. **`battleLossResponsibleOwnerIds`** (pure; log `logTrace('battleParentLossNotes battleLossResponsibleOwnerIds', { battleId, victimOwnerId })`):
   - Return `null` when `context.opposingPartyId` is missing.
   - Let `otherParty` be `context.leadPartyId ?? HUMAN_SEAT_ID`. On a human battle there is no lead, and the human is the other party.
   - Victim equals `opposingPartyId`: return `[otherParty]`.
   - Victim equals `otherParty`: return `[context.opposingPartyId]`.
   - Any other victim: return `null`.
2. **`battleParentLostUnit`** (pure; `logTrace`):
   - Return `null` when `isBuildUnitType(parent.unitType)` is false. Import it from `src/shared/ipc/productionTypes`, as `src/shared/lossSummaryJson.ts` does.
   - Otherwise return:

     ```ts
     {
       displayName: parent.displayName,
       unitType: parent.unitType,
       unitId: parent.id,
       attribution: {
         ownerId: parent.ownerId,
         lossH3Index: parent.h3Index.length > 0 ? parent.h3Index : null,
         responsibleOwnerIds: battleLossResponsibleOwnerIds(context, parent.ownerId),
         killerUnits: [],
       },
     }
     ```
3. **`writeBattleParentLossNotes`**:
   - Log `logDebug('battleParentLossNotes writeBattleParentLossNotes', { battleId, turnNumber, parentCount })`.
   - Wrap the whole body in `try { ... } catch (err) { logError('battleParentLossNotes writeBattleParentLossNotes failed', { battleId, turnNumber, err }); }`. Never rethrow.
   - Map the parents with `battleParentLostUnit` and drop nulls. Return when none are left.
   - For each `seatId` of `activeAiSeatIds(getSeatRoster())`, import `activeAiSeatIds` from `src/shared/seatRoster` and `getSeatRoster` and `upsertTurnLossNote` from `src/main/gameDb`, exactly as `captureTurnLossNote.ts` does. Then:
     1. `own` is the units whose `attribution.ownerId === seatId`, and `others` is the rest.
     2. Read the existing row with `getTurnLossNoteColumns(gameDbOps, { seatId, scope: 'strategic', battleId, turnNumber: strategicTurnNumber })`.
     3. Parse both columns with `parsePlayerLossSummaryJson` (a missing row parses to empty buckets).
     4. Append each new unit to the `other` bucket of the matching summary. Skip a unit whose `unitId` is in `lostUnitIdsOf([summary])`, and add each appended id to that set, so a repeated parent in one call is skipped too.
     5. Write both summaries back with `upsertTurnLossNote(seatId, 'strategic', battleId, strategicTurnNumber, serializePlayerLossSummary(own), serializePlayerLossSummary(others))`.
   - The `'strategic'` scope literal must type-check as `TurnNotesScope`.
4. **The hook.** In `recordDestroyedBattleParents`, collect the units the loop actually added (`addedUnits`, in order). After the existing `logDebug`, read `getActiveTacticalBattleSnapshotRef()` (from `./activeTacticalBattleRef`). When it is not null and `addedUnits` is not empty, call:

   ```ts
   writeBattleParentLossNotes(addedUnits, {
     battleId: battle.battleId,
     strategicTurnNumber: battle.strategicTurnNumber,
     leadPartyId: battle.leadPartyId,
     opposingPartyId: battle.opposingPartyId,
   });
   ```

   Update the function's orienting comment. It now also writes the added units into every commander's strategic loss notes for the battle's turn. Do not change `takeDestroyedBattleParents` or `clearDestroyedBattleParents`.

### Tests

**`battleParentLossNotes.test.ts`:**

1. AI-only battle (`leadPartyId: 'opponent'`, `opposingPartyId: 'opponent2'`):
   - victim `'opponent'` gives `['opponent2']`
   - victim `'opponent2'` gives `['opponent']`
   - victim `'opponent3'` gives `null`
2. Human battle (`opposingPartyId: 'opponent'`, no lead): victim `'human'` gives `['opponent']`, and victim `'opponent'` gives `['human']`.
3. A context without `opposingPartyId` gives `null`.
4. `battleParentLostUnit`:
   - unit type `'fortification'` returns `null`
   - an `'armor'` parent returns the fields above
   - an empty `h3Index` gives `lossH3Index: null`
5. With a temp seated database, call `writeBattleParentLossNotes` with two parents, one per party. Import `withSeatedTempGameDb` from `src/main/testSupport/withSeatedTempGameDb`, and seat it as `src/main/gameActions/captureTurnLossNote.test.ts` does. Assert first that `activeAiSeatIds(getSeatRoster())` is not empty, so the checks below cannot pass on no seats. Then check each active AI seat:
   - the battle row exists
   - its own JSON holds only that seat's parent, in `other`
   - its other JSON holds the rest
6. A second call with one new parent and one repeated parent adds only the new one. No unit id appears twice.
7. Writing to turn N leaves an existing `(seat, 'strategic', '', N)` row's columns unchanged.
8. An empty parent list writes no row.

**Append to `tacticalBattleSession.test.ts`**, modeled on the existing `eliminating every sub-unit records that parent...` and `two-party exit removes a parent...` tests:

9. After `syncStrategicUnitsDbWhenTacticalParentsEliminated` removes a human parent in a human battle, every active AI seat has a strategic row for `snap.battleId` at `snap.strategicTurnNumber`. That row lists the parent, with `responsibleOwnerIds` equal to `[snap.opposingPartyId]`.
10. After `endTacticalBattleSessionForTwoPartyVoluntaryExit` removes a lead-party parent under half, the same row lists it with `responsibleOwnerIds` equal to `[snap.opposingPartyId]`.

Read the rows back with `getTurnLossNoteColumns` and `parsePlayerLossSummaryJson`. In both tests, assert first that `activeAiSeatIds(getSeatRoster())` is not empty.

### Verification

The Verification Bar, with `dist/main/tacticalBattle/battleParentLossNotes.test.js` and `dist/main/tacticalBattle/tacticalBattleSession.test.js`. Also run these tests of `src/shared/lossSummary.ts` and its users. They must pass unchanged:

- `dist/main/lossSummary.test.js`
- `dist/main/turnUpdateSummary.test.js`
- `dist/main/lossAttribution/lossAttributionCore.test.js`
- `dist/main/lossAttribution/strategicLossAttribution.test.js` Also run `node dist/main/tacticalBattle/computeTacticalBattleSnapshotDb.test.js` and `node dist/main/saveGame/matchMemoryReset.test.js`, which start battles. `check:circular` must show no new cycle. If one appears, the import chain from `destroyedBattleParents.ts` is the cause: move the hook's imports so that neither `battleParentLossNotes.ts` nor anything it imports imports `tacticalBattleSession.ts`.

---

## Phase 3 — Print Battle Losses in Recent Turn Notes

Strategic Recent Turn Notes show battle losses inside their turn's block, as `by {side}, Battle at {code}: {units}`.

**Adds:** `src/main/briefing/strategicLossWindow.ts`, `src/main/briefing/strategicLossWindow.test.ts`. **Edits:** `src/main/briefing/recentTurnLossLines.ts`, `src/main/briefing/recentTurnLossLines.test.ts`, `src/main/briefing/recentTurnNotesSection.ts`, `src/main/recentTurnNotesSection.test.ts`.

### Steps

1. **The line builder** (`recentTurnLossLines.ts`):
   - Add an exported constant:

     ```ts
     export const BATTLE_LOSS_CAUSE_LABEL = 'Battle';
     ```

   - Add an optional input field `readonly battleLosses?: readonly LostUnit[]`, with an orienting comment ("Omitted means none"). These are units of any owner destroyed in a tactical battle that turn. Each has `attribution.ownerId`.
   - In `groupLosses`, after the existing `LOSS_CAUSE_KEYS.forEach`, add each battle unit:
     - Use `causeIndex = LOSS_CAUSE_KEYS.length`.
     - The victim owner is `input.ownSeatId` when `attribution.ownerId === input.ownSeatId`, else `attribution.ownerId ?? UNKNOWN_OWNER_KEY`.
   - In `lineFor`, read the label as `group.causeIndex < LOSS_CAUSE_LABELS.length ? LOSS_CAUSE_LABELS[group.causeIndex] : BATTLE_LOSS_CAUSE_LABEL`. Use the explicit bounds check, not `??`: the project does not enable `noUncheckedIndexedAccess`, so lint may reject `??` on a value typed `string`.
   - Battle groups sort after the six standard causes for the same side, because their index is larger.
   - Update the orienting comment on the group's `causeIndex` field. It now reads as an index into `LOSS_CAUSE_KEYS` and `LOSS_CAUSE_LABELS`, or `LOSS_CAUSE_KEYS.length` for a battle loss.
   - Add an exported constant, used in step 3:

     ```ts
     export const BATTLE_LOSS_LEGEND_SENTENCE = 'A "Battle" line lists units destroyed in a tactical battle fought that turn, credited to the other side in that battle. It has no closing count.';
     ```

     The legend says the closing `(by ...)` counts the units that fought, and a battle line has none. This sentence explains why.
2. **The window helper** (`strategicLossWindow.ts`, a read, so log with `logTrace`):

   ```ts
   export function readStrategicBattleLossesByTurn(
     seatId: AiSeatId,
     rows: readonly TurnNoteRow[]
   ): ReadonlyMap<number, readonly LostUnit[]>
   ```

   1. Call `listStrategicBattleLossRows(gameDbOps, seatId, rows.map((row) => row.turnNumber))`.
   2. For each battle row, parse both columns with `parsePlayerLossSummaryJson` and take the units of every bucket.
   3. Drop a unit that has no `unitId`. Drop a unit whose `unitId` is in `lostUnitIdsOf` of the same turn's strategic row (`row.aiLossJson` and `row.humanLossJson`, parsed), or earlier in this turn's list. The strategic record wins, so no unit prints twice.
   4. Return a map from turn number to the remaining units. Turns with none are left out of the map.
   5. Wrap the body in `try`/`catch`. On an error, log `logError('strategicLossWindow readStrategicBattleLossesByTurn failed', { seatId, err })` and return an empty map.
3. **The section** (`recentTurnNotesSection.ts`, `buildRecentTurnNotesSection`):
   - When `args.scope === 'strategic'`, call `readStrategicBattleLossesByTurn(ownSeatId, allRows)` on the rows before the `rowHasPromptContent` filter. For tactical scope, use an empty map.
   - Keep a row when `rowHasPromptContent(row)` is true, or when the map has units for its turn.
   - Give `formatTurnBlock` a third parameter, `battleLosses: readonly LostUnit[]`, and pass it to `buildRecentTurnLossLines` as `battleLosses`. Call it with `battleByTurn.get(row.turnNumber) ?? []`. Do not put battle losses in `TurnBlockContext`, which holds what is the same for every block.
   - When any printed row has battle losses, the legend is `${RECENT_TURN_LOSS_LEGEND} ${BATTLE_LOSS_LEGEND_SENTENCE}`. Otherwise it is unchanged.
   - Update the orienting comments of the functions you changed.

   The talk prompt's recent-turns section is built by this same function, so it shows battle lines too. That is intended.

### Tests

**`recentTurnLossLines.test.ts`:**

1. One own battle loss credited to `opponent2` prints `- Your Losses:` and then `  - by a2, Battle at {code}: {id}`, with no `(by`.
2. A battle loss and a ranged loss by the same side at the same hex print as two lines, ranged first.
3. Another side's battle loss prints under `- Losses of {code}:`.
4. With `maxGroupLines: 1` and two groups, the drop line counts the battle group.

The existing cases, which omit `battleLosses`, must pass unchanged. That shows the old output is kept.

**`strategicLossWindow.test.ts`** (temp database):

5. A battle row's units come back under their turn.
6. A unit also in that turn's strategic row is dropped.
7. Turns not passed in are not read.

**`recentTurnNotesSection.test.ts`:**

8. A turn with a strategic row and a battle row prints both kinds of line in one `Turn N:` block, and the legend ends with `BATTLE_LOSS_LEGEND_SENTENCE`.
9. A turn whose strategic row has no strategy and no losses, but has a battle row, still prints its block.
10. A tactical-scope section ignores strategic battle rows, and its legend has no battle sentence.

### Verification

The Verification Bar, with the three test files. Also run `node dist/main/openRouter/tacticalPromptSectionParity.test.js` and `node dist/main/openRouter/talk/talkPrompt.test.js`.

---

## Phase 4 — The Combat Record Calculation

A pure function turns a window of turns into one record per other side.

**Adds:** `src/main/briefing/sideCombatRecord.ts`, `src/main/briefing/sideCombatRecord.test.ts`. **Edits:** nothing.

### Contract

```ts
export type CombatRecordCategory = 'responsibleAttacked' | 'victimAttacked' | 'closeCombat' | 'other';

export const COMBAT_RECORD_CATEGORY_BY_CAUSE: Readonly<Record<keyof PlayerLossSummary, CombatRecordCategory>> = {
  ranged: 'responsibleAttacked',
  melee: 'closeCombat',
  returnFire: 'victimAttacked',
  airStrike: 'responsibleAttacked',
  missileStrike: 'responsibleAttacked',
  other: 'other',
};

export interface CombatLossCounts {
  readonly total: number;
  readonly responsibleAttacked: number;
  readonly victimAttacked: number;
  readonly closeCombat: number;
  readonly other: number;
}

export interface CombatRecordTurn {
  readonly turnNumber: number;
  readonly ownLosses: PlayerLossSummary;
  readonly otherLosses: PlayerLossSummary;
  readonly battleLosses: readonly LostUnit[];
}

export interface SideCombatRecord {
  readonly sideId: string;
  readonly destroyedOfYours: CombatLossCounts;
  readonly destroyedOfTheirs: CombatLossCounts;
  readonly latestTurnDestroyedYours: number | null;
  readonly latestTurnAttackedYou: number | null;
}

export interface SideCombatRecordSet {
  readonly firstTurn: number;
  readonly lastTurn: number;
  readonly records: readonly SideCombatRecord[];
}

export function buildSideCombatRecords(args: {
  readonly ownSeatId: string;
  readonly sideIds: readonly string[];
  readonly turns: readonly CombatRecordTurn[];
}): SideCombatRecordSet | null;
```

Comment every type, field, and the category table. The table's comment must explain the melee rule: a melee loss can be either side's attacker or defender.

### Rules

1. Log `logDebug('sideCombatRecord buildSideCombatRecords', { ownSeatId, sideCount, turnCount })` once.
2. Return `null` when `turns` is empty. Otherwise `firstTurn` and `lastTurn` are the smallest and largest `turnNumber`.
3. `records` has one entry per `sideIds` entry, in the same order.
4. A unit is **credited to side S** when `attribution?.responsibleOwnerIds` is an array that includes S. `null`, `[]`, and a missing attribution credit no one.
5. **`destroyedOfYours` for S:**
   - Each unit in each bucket of `ownLosses` credited to S, counted under `COMBAT_RECORD_CATEGORY_BY_CAUSE[bucket]`.
   - Plus each `battleLosses` unit with `attribution.ownerId === ownSeatId` credited to S, counted under `closeCombat`.
6. **`destroyedOfTheirs` for S:**
   - Each unit in each bucket of `otherLosses` with `attribution.ownerId === S` that is credited to `ownSeatId`, under the bucket's category.
   - Plus each `battleLosses` unit with `attribution.ownerId === S` credited to `ownSeatId`, under `closeCombat`.
7. `total` is the sum of the four category counts.
8. `latestTurnDestroyedYours` is the largest turn with any unit in `destroyedOfYours`, or `null`. `latestTurnAttackedYou` is the same, counting only `responsibleAttacked` and `closeCombat` units.
9. A unit of a third side never counts for S, even when S is credited.

### Tests

Build each case's input with small helpers. Spread `emptyPlayerLossSummary()` and add one bucket. Make units with an attribution literal. The cases:

1. Each bucket maps to its category: one own unit per bucket, all credited to S.
2. A unit credited to `[S, T]` counts once for S and once for T.
3. `null`, `[]`, and missing attribution count for no one.
4. `destroyedOfTheirs` counts S's units credited to you, and ignores S's units credited to a third side.
5. Battle units count under `closeCombat` on both sides.
6. `latestTurnDestroyedYours` and `latestTurnAttackedYou` differ when the newest loss was return fire.
7. Empty `turns` gives `null`. A side with nothing gets zero counts and two nulls.
8. `firstTurn` and `lastTurn` come from turns given out of order.

### Verification

The Verification Bar, with `sideCombatRecord.test.js`.

---

## Phase 5 — The Record Text

A pure function words one record. These strings are exact.

**Adds:** `src/main/briefing/sideCombatRecordText.ts`, `src/main/briefing/sideCombatRecordText.test.ts`. **Edits:** nothing.

### Contract

```ts
export function formatSideCombatRecord(args: {
  readonly record: SideCombatRecord;
  readonly sideCode: string;
  readonly firstTurn: number;
  readonly lastTurn: number;
}): string;
```

Log with `logTrace('sideCombatRecordText formatSideCombatRecord', { sideId, total })`.

### Wording

Let `{c}` be `sideCode`.

- **Prefix:** `Record, turns {firstTurn} to {lastTurn}:`. When `firstTurn === lastTurn`, write `Record, turn {firstTurn}:`.
- **Both totals zero:** `{prefix} no losses either way.`
- **Otherwise:** `{prefix} {theirPart} {yourPart}`.
- **theirPart:**
  - When `destroyedOfYours.total` is 0: `{c} destroyed none of your units.`
  - Otherwise: `{c} destroyed {total} of your units (latest turn {latestTurnDestroyedYours}): {parts}.`
  - `{parts}` joins with `, ` the non-zero items, in this order: `{n} when {c} attacked` (responsibleAttacked), `{n} when you attacked` (victimAttacked), `{n} in close combat or battle` (closeCombat), `{n} in other ways` (other).
- **yourPart:**
  - When `destroyedOfTheirs.total` is 0: `You destroyed none of theirs.`
  - Otherwise: `You destroyed {total} of theirs: {parts}.`
  - `{parts}` joins with `, ` the non-zero items, in this order: `{n} when you attacked` (responsibleAttacked), `{n} when {c} attacked` (victimAttacked), `{n} in close combat or battle` (closeCombat), `{n} in other ways` (other).

Counts are bare numbers. `1 of your units` is correct; do not add a singular form.

### Tests (exact string equality)

1. All zero, turns 2 to 11: `Record, turns 2 to 11: no losses either way.`
2. One-turn window: `Record, turn 3: no losses either way.`
3. A record for `a1` with:
   - `destroyedOfYours`: total 6, responsibleAttacked 3, victimAttacked 1, closeCombat 2, latest turn 11
   - `destroyedOfTheirs`: total 4, responsibleAttacked 3, victimAttacked 1

   It reads: `Record, turns 2 to 11: a1 destroyed 6 of your units (latest turn 11): 3 when a1 attacked, 1 when you attacked, 2 in close combat or battle. You destroyed 4 of theirs: 3 when you attacked, 1 when a1 attacked.`
4. Theirs only: `Record, turns 2 to 11: a4 destroyed 3 of your units (latest turn 9): 3 when a4 attacked. You destroyed none of theirs.`
5. Yours only: `Record, turns 2 to 11: a2 destroyed none of your units. You destroyed 1 of theirs: 1 in other ways.`

### Verification

The Verification Bar, with `sideCombatRecordText.test.js`.

---

## Phase 6 — Read the Record for a Commander

Reads one commander's window from the database and returns the text per side.

**Adds:** `src/main/briefing/sideCombatRecordRead.ts`, `src/main/briefing/sideCombatRecordRead.test.ts`. **Edits:** nothing.

### Contract

```ts
export interface SideCombatRecordView {
  readonly text: string;
  readonly latestTurnAttackedYou: number | null;
}

export function readSideCombatRecords(
  seatId: AiSeatId,
  currentTurnNumber: number
): ReadonlyMap<string, SideCombatRecordView>;
```

### Rules

1. Read `rows = getRecentTurnNotes(gameDbOps, seatId, 'strategic', '', currentTurnNumber)` with the module version from `../gameDb/turnNotesHistory`, as `talkPromptInput.ts` does, and the default limit.
2. `battleByTurn = readStrategicBattleLossesByTurn(seatId, rows)`.
3. Build one `CombatRecordTurn` per row:
   - `ownLosses: parsePlayerLossSummaryJson(row.aiLossJson)`
   - `otherLosses: parsePlayerLossSummaryJson(row.humanLossJson)`
   - `battleLosses: battleByTurn.get(row.turnNumber) ?? []`

   The column names are from the human's point of view. Keep the comment that `formatTurnBlock` has about this.
4. `sideIds` are the roster seats, sorted with `sortSeatsByOrder` from a `readSeatRoster(gameDbOps)` read, that pass `isSeatId`, are `isSeatActive`, and are not `seatId`. The human seat is included when it is in the roster.
5. Call `buildSideCombatRecords`. On `null`, return an empty map.
6. For each record, set `text` to `formatSideCombatRecord({ record, sideCode: playerIdCodeFor(record.sideId), firstTurn, lastTurn })`, and copy `latestTurnAttackedYou` from the record.
7. Log `logDebug('sideCombatRecordRead readSideCombatRecords', { seatId, currentTurnNumber, rowCount, sideCount })`.
8. Wrap the body in `try`/`catch`. On an error, log `logError('sideCombatRecordRead readSideCombatRecords failed', { seatId, currentTurnNumber, err })` and return an empty map. Both prompts then fall back to their output from before this change.

### Tests (temp seated database)

1. No rows gives an empty map.
2. Seed two turns for one seat: an own ranged loss credited to a second seat, and a battle row with that seat's own unit credited to the same side. The text for that side begins with `Record, turns ` and contains `destroyed 2 of your units`.
3. Rows at or after `currentTurnNumber` are not counted.
4. The seat itself has no entry.

### Verification

The Verification Bar, with `sideCombatRecordRead.test.js`.

---

## Phase 7 — Show the Record in the Talk and Orders Prompts

**Adds:** nothing. **Edits:**
- `src/main/openRouter/talk/talkPrompt.ts`
- `src/main/openRouter/talk/talkPromptInput.ts`
- `src/main/openRouter/talk/ordersMessagesBlock.ts`
- `src/main/openRouter/talk/talkPrompt.test.ts`
- `src/main/openRouter/talk/ordersMessagesBlock.test.ts`
- any other test file that builds a `TalkPromptSide` literal (the build errors list them)

### Steps

1. **`TalkPromptSide`** (`talkPrompt.ts`): add `readonly record: string | null;` with an orienting comment. It holds this commander's combat record with the side, or null for the commander's own row, a side that is out, or when there is no window yet.
2. **`readTalkSides`** (`talkPromptInput.ts`):
   - Read the turn with `readTurnNumberOrFirst(gameDbOps.getOne)` (from `src/main/gameDb/turnStateReads.ts`). The file already imports `gameDbOps`.
   - Read `readSideCombatRecords(seatId, turn)`.
   - Pass the map into `sideFromRoster` as a fourth parameter. The own row gets `record: null`. Every other row gets `records.get(seat.seatId)?.text ?? null`. A side that is out gets null, because `readSideCombatRecords` covers active sides only.
   - Update the orienting comments of both functions.

   The stored turn is the strategic turn, during a battle too, so battle prompts get the world-map record. That record does not yet hold the battle in progress, because its window ends before the current turn. The battle's own losses are in the tactical Recent Turn Notes.
3. **The talk Sides table** (`sidesTable` in `talkPrompt.ts`):
   - When any side has a non-null `record`, the header is `| Side | Code | Status | Your stance | Record |` and the separator gains a fifth `--- |` cell. Each row ends with `{record} |`, or `- |` when the record is null.
   - Otherwise the table is unchanged.
4. **The talk stance sentence** (`buildTalkSystemText`): replace this text exactly,

   `Base a stance on what a side has done to you, as the loss lines in Recent Turn Notes record, more than on what it says.`

   with:

   `Base a stance on what a side has done to you, as the loss lines in Recent Turn Notes and the Record column show, more than on what it says.`
5. **The orders block** (`buildOrdersMessagesBlock`):
   - Let `recordSides` be the non-own sides with a non-null `record`.
   - The early return now needs `threads`, `stances`, and `recordSides` all empty.
   - When `recordSides` is not empty, replace the stance part with:
     - The heading `Your stances and records:`.
     - One line per non-own side that has a `record` or a `stance`, in `sides` order. A side with a stance uses the existing line text, `- ${side.label} (${side.code}): ${side.stance}. ${side.stanceReason ?? ''}`. A side without one uses `- ${side.label} (${side.code}): no stance set.` When the side has a record, add a second line of two spaces plus the record text.
     - After that list, a part with this sentence: `Each record is counted by the game from the loss lines in Recent Turn Notes. It is not a claim by any side.`
   - When `recordSides` is empty, keep today's `Your stances:` part exactly as it is.
   - Add `recordCount: recordSides.length` to the function's `logTrace` fields.
   - Update the function's orienting comment, and the `Contract:` and `Expected outcome:` lines on `OrdersMessagesBlock.text`. The text is now null only when no thread has a line, no stance is stored, and no side has a record.

### Tests

1. **`talkPrompt.test.ts`:**
   - Add `record: null` to the existing side literals. The existing table assertions must still pass unchanged.
   - Add a case where one side has a record. The header has the `Record` column, that row ends with the record text, and a side without one ends with `- |`.
   - Update the stance-sentence assertion to the new text.
2. **`ordersMessagesBlock.test.ts`:**
   - Add a case that seeds one strategic loss row for the commander at turn 1, with an own ranged unit credited to another seat. Then set the stored turn to 2 with `dbRun('UPDATE turn_state SET turn_number = 2 WHERE id = 1')`, as other tests change `turn_state`, so the row falls inside the window. The block contains `Your stances and records:` and `no stance set.` for a side without a stance. The record line starts with two spaces and `Record, turn`. The block also contains the record sentence.
   - The existing cases with no loss rows still produce `Your stances:` and no record line.

### Verification

The Verification Bar, with `talkPrompt.test.js` and `ordersMessagesBlock.test.js`. Also run each of these, which build these prompts or depend on them:

- `requestTalk.test.js`, `talkRound.test.js`, `talkReply.test.js`, and `talkRoundPersistence.test.js` (all in `dist/main/openRouter/talk/`)
- `dist/main/openRouter/consultPromptParts.test.js`
- `dist/main/openRouter/promptOutline.test.js`
- `dist/main/openRouter/promptContracts.test.js`
- `dist/main/openRouter/openRouterMatrix.test.js`
- `dist/main/openRouter/tacticalPromptSectionParity.test.js`

---

## Phase 8 — Documents

**Adds:** nothing. **Edits:** the documents below. Match each document's voice, heading style, and table layout. Name the symbol each fact comes from. Keep plan vocabulary out (rule 12).

1. `doc/ai-commander-prompts/strategic-prompt.md`:
   - **Recent Turn Notes:** a unit destroyed in a tactical battle is listed in the block of the turn the battle was fought, under the cause `Battle` (`BATTLE_LOSS_CAUSE_LABEL`). It is credited to the other party in the battle. The line has no killer counts. It is stored as a strategic row keyed by the battle id (`writeBattleParentLossNotes`), and a unit already in the turn's own record is printed once. When a battle line is printed, the legend adds `BATTLE_LOSS_LEGEND_SENTENCE`. Quote that sentence.
   - **Limits:** add the close-combat and battles-before-this-change limits from Known Gaps.
   - **`# Messages`:** when the commander has at least one prior strategic note row, `Your stances and records:` lists every other active side and every side with a stance. A side with no stance reads `no stance set.` The record line uses `formatSideCombatRecord`, over the `RECENT_TURN_NOTES_LIMIT` window, split by `COMBAT_RECORD_CATEGORY_BY_CAUSE`. Copy the exact templates from Phase 5 and the record sentence from Phase 7. Without a prior row, the section is as before.
2. `doc/ai-commander-prompts/talk-prompt.md`:
   - The `## Sides` item, which today lists the columns Side, Code, Status, and Your stance, gains the `Record` column when any side has a record. A side without one shows `-`.
   - Update the stance sentence.
   - The recent-turns section can now hold `Battle` lines.
3. `doc/ai-commander-prompts/tactical-prompt.md`: where it describes the Messages section in a battle orders prompt, say that the record is the world-map record.
4. `doc/commander-messages.md`: the orders section shows each side's record next to its stance, and the talk Sides table has the Record column.
5. These docs state when `# Messages` is included. Add "or a combat record" to that condition, and name `readSideCombatRecords` where they name builders:
   - `doc/ai-commander-prompts/assembly-contract.md`
   - `doc/ai-commander-prompts/crosswalk.md`
   - `doc/ai-commander-prompts/source-inventory.md`
6. `doc/ai-commander-prompts/information-decision-model.md`:
   - In the table under `### 3.8 Memory, callbacks, and history`, add a row right after the `RECENT_TURN_NOTES` row. The table has seven columns:

     ```text
     | `SIDE_COMBAT_RECORD` | For each other active side, how many of your units it destroyed and how many of its units you destroyed over the Recent Turn Notes window, split by who attacked, with the latest turn it destroyed one of yours | `readSideCombatRecords` | full record (no fog filter) | 1 | both | conditional — at least one prior strategic period |
     ```

   - Add `SIDE_COMBAT_RECORD` to the "Needs" list of job 1, "Judge win progress", in the list near the top of the file.
   - Leave the "Messages from other sides" row in section 3.10 as it is. It describes a rule, not information.
7. `doc/save-files.md`: one sentence. Strategic `turn_notes_history` rows with a non-empty `battle_id` hold units destroyed in that battle. The save version is unchanged.
8. Search `doc/` for `buildOrdersMessagesBlock`, `Your stances`, `Sides table`, `recordDestroyedBattleParents`, and `RECENT_TURN_LOSS_LEGEND`. Fix any other statement these changes made wrong. Leave the historical documents alone.
9. Leave `example-strategic-prompt.md` and `example-tactical-prompt.md` as they are. The strategic example copies a turn-1 prompt, and turn 1 has no prior note row, so it has no record and no battle line. The tactical example copies only the system message, and this change does not touch the orders system text.

**Verification:** read each edited paragraph once against the code. Check the line endings of every edited document. Grep `doc/` for `Phase`, `plan`, and `Known Gap` in the lines you added; there must be none.

---

## Phase 9 — Final Verification and Hand-Off

1. Run `npm test` in the background (see Verification Bar). It must exit 0.
2. Run `npm run build:renderer`. It must exit 0.
3. `npm run check:circular` must print exactly the Phase 0 list.
4. Run `npm run naming:check`.
5. Run `git status --short` and list every added and edited file in the Completion Log.
6. Give the user this manual checklist for one AI-only game (all seats with models and keys). Do not run it yourself:
   - After a battle that destroyed a unit, the next strategic prompt (`debug-last-user-prompt-*.txt`) shows `by {code}, Battle at {hex}:` in that turn's block.
   - From turn 2 on, the Messages section shows `Your stances and records:` with a `Record, turns` line for every other side.
   - Seats whose stance is cordial or friendly toward a side whose record shows recent attacks are worth noting. They tell whether Phase 10 is needed.
7. Do not run Phase 10 unless the user asks for it.

---

## Phase 10 (Optional) — Conflict Flag

Run only when the user asks for it.

**Adds:** nothing. **Edits:** `src/main/briefing/sideCombatRecordText.ts`, its test, `src/main/openRouter/talk/talkPromptInput.ts`, `src/main/openRouter/talk/ordersMessagesBlock.test.ts`, and the two prompt documents from Phase 8 (strategic-prompt.md `# Messages`, talk-prompt.md).

1. Add to `sideCombatRecordText.ts`:

   ```ts
   export function formatStanceConflict(args: {
     readonly sideCode: string;
     readonly stance: SideStance;
     readonly latestTurnAttackedYou: number | null;
     readonly currentTurnNumber: number;
   }): string | null;
   ```

   It returns `null` unless all of these hold: `stance` is `'cordial'` or `'friendly'`, `latestTurnAttackedYou` is not null, and `latestTurnAttackedYou >= currentTurnNumber - 2`. Then it returns exactly:

   `Your stance toward {c} is {stance}, but {c} attacked your units on turn {latestTurnAttackedYou}.`
2. In `readTalkSides`, when a side has both a stance and a record view, and `formatStanceConflict` returns text, set that side's `record` to `${view.text} ${conflict}`. Both prompts then show it with no further change.
3. Tests:
   - each condition alone returning `null`
   - the exact string for `friendly` with a turn-11 attack at current turn 12
   - an orders-block case whose record line ends with the conflict sentence
4. Update the two prompt documents with the rule and the exact sentence.

**Verification:** the Verification Bar with the edited tests, then `npm test` in the background.

---

## Completion Log

| Phase | Result | Notes (sketch differences, extra files, test that could not fail first) |
| --- | --- | --- |
| 0 | Done | Baseline: 3 import cycles, naming check ok, only the plan folder untracked. The full suite was not run, at the user request. |
| 1 | Done | Tests went in `src/main/turnNotesHistory.test.ts`. Passed. |
| 2 | Done | Added `lostUnitIdsOf` to `src/shared/lossSummary.ts`. Both battle-hook tests passed. |
| 3 | Done | Added `BATTLE_LOSS_LEGEND_SENTENCE`. `formatTurnBlock` takes `battleLosses` as a third parameter. |
| 4 | Done | 8 tests pass. |
| 5 | Done | 4 tests pass. Tests and code were written together, so the red step was not observed. |
| 6 | Done | 3 tests pass. |
| 7 | Done | The 11 related prompt test files pass. |
| 8 | Done | Docs edited as listed. `SIDE_COMBAT_RECORD` is listed under job 1 of the decision model, as the plan said. |
| 9 | Done | Targeted checks only: all 28 related test files, both builds, check:circular (3 baseline cycles), naming:check. The full suite was not run, at the user request. |
| 10 | Done | The sentence says "destroyed" instead of "attacked", because close-combat and battle losses have no starter, and the attack field counts them. The `readTalkSides` change landed in `sideFromRoster`, which takes `currentTurnNumber`. |
