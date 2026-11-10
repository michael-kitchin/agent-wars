# Turn Report Strike Lines and Longer Turn History: Implementation Plan

> **For agentic workers:** Work the phases in order and finish each phase's verification before starting the next. Steps use checkbox (`- [x]`) syntax. **Never commit or push** (`.cursor/rules/11-no-commit-or-push.mdc`). The user reviews every change first.

**Goal:** Replace the per-strike missile sentences and per-hex fortification sentences in the turn report with one combined sentence per side, add the same fortification sentence to battle beat reports, and send AI commanders ten prior turns of notes instead of three.

**Architecture:** Pure sentence builders in `src/shared/` take a missile record or fortification report plus an already-resolved hex code, group them by side, and return finished toast lines. The renderer resolves codes with the existing `orderTargetHexCode` and hands the lines to the unchanged toast assembler. Battles gain a fortification report list that follows the path already used by `infrastructureDestroyedEvents`: battle phase result, then beat outcome, then playback, then the toast slice.

**Tech stack:** TypeScript, `node:test`, SQLite through the existing `gameDb` facade. There are no new dependencies.

## Requirements

These come from the user's request and answers.

| # | Requirement |
| --- | --- |
| R1 | One missile sentence per side per turn: `Missile strike(s) in {codes} destroyed {counts}.` It totals every visible strike on hexes that side controlled. |
| R2 | Count phrases appear only when their total is above 0, in the order city cells, airports, seaports, fortifications. Each noun is singular for 1. The noun is "city cell", not "city hex". |
| R3 | When every count is 0, the sentence is `Missile strike(s) in {codes} destroyed nothing.` |
| R4 | Lost squadrons stay as a totaled clause: `; N squadron(s) lost`, shown only when the total is above 0. |
| R5 | One fortification sentence per side per turn: `Fortifications in {codes} absorbed N hit(s).`, shown only when N is above 0. |
| R6 | `{codes}` are hex codes, not place names: `AA` on the world map and `AA.B0` for a battle cell. Codes are de-duplicated, sorted alphabetically, and joined with a serial comma. |
| R7 | A battle beat report gets the R5 fortification sentence for cells that absorbed hits that beat. Battles have no missile launches, so they get no missile sentence. |
| R8 | Every AI commander prompt carries up to 10 prior turns of notes instead of 3. This applies to strategic turns and battle beats. |

### Sentences to Expect

| Input | Sentence |
| --- | --- |
| One strike on `AA`, 1 city cell destroyed | `Missile strike in AA destroyed 1 city cell.` |
| Strikes on `C2` (2 city cells, 1 airport, 2 squadrons) and `AA` (1 city cell, 2 fortifications) | `Missile strikes in AA and C2 destroyed 3 city cells, 1 airport, and 2 fortifications; 2 squadrons lost.` |
| Two strikes on `AA` that destroyed nothing | `Missile strikes in AA destroyed nothing.` |
| Fortification losses at `C2` (2) and `AA` (1) | `Fortifications in AA and C2 absorbed 3 hits.` |
| Battle cells `AA.B9` and `AA.B0`, 1 hit each | `Fortifications in AA.B0 and AA.B9 absorbed 2 hits.` |

## Decisions Already Made

Don't revisit these.

- **Grouping.** The toast already files each line by owner (`buildConsolidatedTurnUpdateToastMessage` in `src/shared/consolidatedTurnUpdateToast.ts`):
  - A missile line goes in that seat's loss section when `isSeatId(controllerId)`. Every other controller goes to Updates.
  - A fortification line goes in a seat's section or in Neutral Losses. A `null` owner goes to Updates.
  - The new builders group by that same key and emit one line per key, so the toast assembler needs no changes. Neutral and uncontrolled missile strikes share one Updates line.
- **Visibility.** The existing filters `missileLaunchVisibleToViewer` and `fortificationReportVisibleToViewer` still run first, unchanged. Only visible records are combined.
- **Hex codes.** Use `orderTargetHexCode(h3Index, battle)` in `src/shared/orderTargetHexCode.ts`. Pass `null` on the world map and the battle snapshot in a battle. It is synchronous, so the current `getHexNamingTooltipLine` lookups for these two sentences are removed.
- **Unresolved code.** When the code is `null`, the list uses the words `an unidentified hex` once, after the sorted codes.
- **Sort.** Use ordinal string order: `(a, b) => (a < b ? -1 : a > b ? 1 : 0)`. For these codes that puts `AA` before `AA.B0` before `C2`.
- **"Strike" vs "strikes"** follows the number of launches, not the number of hexes.
- **Battle fortification report.** Each absorbing cell yields `{ h3Index: cell, ownerId: hex controller, lost: absorbs on that cell, remaining: 0 }`. Absorbing clears the cell's flag, so 0 is true for that cell. The sentence does not read `remaining`. Do not add `absorbedReports` to `FortificationCombatHooks`. Strategic ledger hooks stay as they are. A missile that strips fortifications still records both the missile counts and the fortification tally. Leave that dual reporting alone.
- **Turn history.** The limit is one exported constant, `RECENT_TURN_NOTES_LIMIT = 10`, in `src/main/gameDb/turnNotesHistory.ts`. That is the lowest layer that uses it. `gameDb.ts` already re-exports `getRecentTurnNotes` and does not re-export a limit constant, so add this constant to that list. Both `briefingFormatter.ts` and `formatTacticalBriefing.ts` call `buildRecentTurnNotesSection`, so replacing the one literal `3` covers strategic turns and battle beats. Prompts grow by up to seven more turn blocks. That is expected.
- **Build between the sentence phases.** After the missile formatter is removed, `npm run build:main` stays red until the renderer stops importing `formatMissileStrikeLine` and `MISSILE_STRIKE_UNNAMED_PLACE`. That renderer error is known. A later phase fails only on its own missing exports. `readyResolutionAnnouncements.ts` is about 589 lines. Removing the caption lookup should shrink it. If that file crosses 600 lines, stop and split the line helpers. Do not restructure a file already over 600, such as the tactical phase file, for a one-field addition.

## Global Constraints

- Never commit or push.
- Every new or changed function, field, and constant gets an orienting comment in the file's existing `Purpose / When to use / Expected outcome / Exceptions` style. Fix comments whose stated behavior changes, such as "three", "one per launch", or "place name".
- Never write "Phase" or "R1" style identifiers in code, comments, or `doc/`.
- Source files should stay under 600 lines, with a hard limit of 1000. Functions take at most 6 parameters.
- Tests cover contracts only. Add only the tests listed here, and delete tests for functions this plan removes.
- Update the `doc/` text named in each phase as part of that phase. Don't touch historical documents or `doc/release-notes/`.
- Don't change the toast assembler's section rules, the visibility filters, or `fortificationLines` (the paused-queue sentences, which still use place names).

## Review Focus

1. **Same hex struck twice:** one code, summed counts. Missile tests in Phase 2.
2. **A hex with no code:** the fallback words appear once, last. Helper test in Phase 2.
3. **A neutral strike and an uncontrolled strike in one turn:** one combined Updates line. Grouping test in Phase 2.
4. **A kind present but not destroyed (airports before 2, destroyed 0):** no "0 airports" phrase. Missile test in Phase 2.
5. **An enemy viewer of a battle fortification:** battle cells count as explored, because a battle has no fog. Wiring in Phase 5, checked manually in Phase 6.

## Test Commands

```
npm run build:main
node dist/shared/FILE.test.js      (shared tests)
node dist/main/FILE.test.js        (main tests; adjust the path to the test's folder under dist/main)
```

A TypeScript error from `build:main` counts as a failed step. Run `npm run check:renderer-types` after any `src/renderer/` change.

---

## Phase 1: Ten Turns of History (R8)

**Files:** `src/main/gameDb/turnNotesHistory.ts`, `src/main/gameDb/aiStateAccess.ts`, `src/main/briefing/recentTurnNotesSection.ts`, `src/main/recentTurnNotesSection.test.ts`, and four prompt documents.

**Produces:** `export const RECENT_TURN_NOTES_LIMIT = 10` in `turnNotesHistory.ts`.

- [x] **Step 1: Update the window test.** In `src/main/recentTurnNotesSection.test.ts`, rename `testThreeEntryWindow` to `testTenEntryWindow` and change its call site to match.
  - Seed turns 1 to 11. Build with `currentTurnNumber: 12`.
  - Assert that `Turn 2:` through `Turn 11:` appear, that `Turn 1:` does not (message: `turn 1 falls outside ten-entry window`), and that `Turn 12:` does not.
  - Update its comment. Leave `src/main/turnNotesHistory.test.ts` as it is: it passes an explicit limit of 3.
- [x] **Step 2: Run it and confirm it fails.** Build, then run the test. Expected: it fails because `Turn 2:` through `Turn 8:` are missing.
- [x] **Step 3: Implement.**
  - Add the constant with a comment.
  - Make it the default `limit` of `getRecentTurnNotes` in `turnNotesHistory.ts` and of the facade in `aiStateAccess.ts`, imported from `./turnNotesHistory`.
  - In `buildRecentTurnNotesSection`, pass `RECENT_TURN_NOTES_LIMIT` in place of the literal `3`. Add the constant to the `gameDb.ts` re-export list and import it from `../gameDb`.
  - Update every comment in these three files that says "three", "3", or "three-entry".
- [x] **Step 4: Verify.** Run both `recentTurnNotesSection` and `turnNotesHistory` tests. Expected: pass.
- [x] **Step 5: Update the prompt documents.**
  - `doc/ai-commander-prompts/assembly-contract.md` line 67: `previous three periods` becomes `previous ten periods`.
  - `doc/ai-commander-prompts/information-decision-model.md` line 169: `up to three` becomes `up to ten`.
  - `doc/ai-commander-prompts/source-inventory.md` line 57: `previous 3 turns` becomes `previous 10 turns`.
  - `doc/ai-commander-prompts/strategic-prompt.md` line 130: `up to three prior turns` becomes `up to ten prior turns`. Where the text names the source, name `RECENT_TURN_NOTES_LIMIT`.
  - Then search `doc/ai-commander-prompts/` for any other statement of a three-turn notes window and fix it. Change only sentences that state the notes window. Do not edit "three neighboring rings" in the tactical prompt docs.

---

## Phase 2: Hex List and Missile Sentence (R1 to R4, R6)

Pure code only. Nothing user-visible changes yet.

**Files:**
- Create `src/shared/turnReportHexCodes.ts` and `src/shared/turnReportHexCodes.test.ts`.
- Modify `src/shared/missileStrikeReport.ts` and `src/shared/missileStrikeReport.test.ts`.

**Produces:**

```ts
// turnReportHexCodes.ts
export const TURN_REPORT_UNKNOWN_HEX = 'an unidentified hex';
export function formatTurnReportHexList(codes: readonly (string | null)[]): string;

// missileStrikeReport.ts
export interface MissileStrikeEntry { readonly record: MissileLaunchRecord; readonly hexCode: string | null }
export function formatMissileStrikeSummaryLine(entries: readonly MissileStrikeEntry[]): string | null;
export function buildMissileStrikeToastLines(entries: readonly MissileStrikeEntry[]): MissileStrikeToastLine[];
```

- [x] **Step 1: Write the hex-list tests** in `turnReportHexCodes.test.ts`:
  - `['AA']` gives `AA`.
  - `['C2', 'AA']` gives `AA and C2`.
  - `['C2', 'AA', null, 'AA', 'AA.B9', '  ']` gives `AA, AA.B9, C2, and an unidentified hex`.
- [x] **Step 2: Replace the missile tests.** In `missileStrikeReport.test.ts`, delete the four `formatMissileStrikeLine` tests and keep the visibility test. Add a helper `record(partial)` that returns a `MissileLaunchRecord` with every count 0, `destroyedAirUnitIds: []`, and `targetControllerId: HUMAN_SEAT_ID`. Reuse a helper if the file already has one. Then add one test per row:

  | Test | Entries (record fields → hexCode) | Expected |
  | --- | --- | --- |
  | one strike names one city cell | `{urbanBefore:3, urbanDestroyed:1}` → `AA` | `Missile strike in AA destroyed 1 city cell.` |
  | strikes total their counts and sort their hexes | `{urbanBefore:4, urbanDestroyed:2, airportsBefore:1, airportsDestroyed:1, destroyedAirUnitIds:['a1','a2']}` → `C2`; `{urbanBefore:2, urbanDestroyed:1, fortificationsBefore:2, fortificationsDestroyed:2}` → `AA` | `Missile strikes in AA and C2 destroyed 3 city cells, 1 airport, and 2 fortifications; 2 squadrons lost.` |
  | a kind that was present but survived is not named | `{airportsBefore:2, airportsDestroyed:0, seaportsBefore:1, seaportsDestroyed:1}` → `AA` | `Missile strike in AA destroyed 1 seaport.` |
  | strikes that destroyed nothing say so | two all-zero records → `AA` and `AA` | `Missile strikes in AA destroyed nothing.` |
  | the same hex struck twice sums | `{urbanDestroyed:1, urbanBefore:1}` → `AA`; `{urbanDestroyed:2, urbanBefore:2}` → `AA` | `Missile strikes in AA destroyed 3 city cells.` |
  | flags that were present and all survived say nothing was destroyed | `{airportsBefore:2, airportsDestroyed:0}` → `AA` | `Missile strike in AA destroyed nothing.` |
  | two missing codes are named once and both counts still add | `{urbanDestroyed:1, urbanBefore:1, destroyedAirUnitIds:['a1']}` → `null`; `{seaportsDestroyed:1, seaportsBefore:1, destroyedAirUnitIds:['a2']}` → `null` | `Missile strikes in an unidentified hex destroyed 1 city cell and 1 seaport; 2 squadrons lost.` |
  | no strikes give no sentence | `[]` | `null` |

  Then add a grouping test for `buildMissileStrikeToastLines`. The entries are 1-city-cell records in this order:
  - human `AA`, AI seat `AI_SEAT_IDS[0]` `C2`, human `E5`, `NEUTRAL_OWNER_ID` `G1`, `null` `H2`

  Expected, in this order:

  ```ts
  [
    { controllerId: HUMAN_SEAT_ID, line: 'Missile strikes in AA and E5 destroyed 2 city cells.' },
    { controllerId: AI_SEAT_IDS[0], line: 'Missile strike in C2 destroyed 1 city cell.' },
    { controllerId: null, line: 'Missile strikes in G1 and H2 destroyed 2 city cells.' },
  ]
  ```

- [x] **Step 3: Run the tests and confirm they fail.** Expected: compile errors for the missing exports.
- [x] **Step 4: Implement `turnReportHexCodes.ts`.**
  - Trim each code, and treat `null` or a blank code as unknown.
  - De-duplicate the known codes and sort them in ordinal order.
  - Append `TURN_REPORT_UNKNOWN_HEX` once if any code was unknown.
  - Join with `joinWithSerialComma` from `./consolidatedTurnUpdateToast`.
- [x] **Step 5: Implement in `missileStrikeReport.ts`.**
  - Delete `formatMissileStrikeLine`, `flagPhrase`, and, if nothing else uses it (check with grep), `MISSILE_STRIKE_UNNAMED_PLACE`.
  - Add a private `countPhrase(count, singular, plural): string | null` that returns `null` when `count <= 0`.
  - `formatMissileStrikeSummaryLine`:
    1. Return `null` for an empty list.
    2. Sum `urbanDestroyed`, `airportsDestroyed`, `seaportsDestroyed`, and `fortificationsDestroyed`, plus `destroyedAirUnitIds.length`.
    3. Write `strike` or `strikes` from `entries.length`, then `in ${formatTurnReportHexList(codes)}`.
    4. Write `destroyed` followed by the joined phrases, or `destroyed nothing`.
    5. Add `; N squadron(s) lost` when that total is above 0. End with `.`.
  - `buildMissileStrikeToastLines`:
    1. Group the entries by `isSeatId(record.targetControllerId) ? record.targetControllerId : null`, keeping the order in which each key first appears.
    2. Emit one `{ controllerId: key, line }` per group.
  - Import the type `MissileStrikeToastLine` from `./consolidatedTurnUpdateToast`.
  - Update the module header comment.
- [x] **Step 6: Verify.** Run `turnReportHexCodes` and `missileStrikeReport`. Expected: pass. `npm run build:main` stays red because `readyResolutionAnnouncements.ts` still imports `formatMissileStrikeLine` and `MISSILE_STRIKE_UNNAMED_PLACE`. That is the known renderer error until the strategic-report phase. Run `npm run check:renderer-types` and confirm those removed imports are the only new errors.

---

## Phase 3: Fortification Sentence (R5, R6)

Pure code only.

**Files:** Modify `src/shared/fortificationReport.ts`, `src/shared/fortificationReport.test.ts`, and `src/shared/fortificationRules.ts`.

**Produces:**

```ts
export interface FortificationReportEntry { readonly report: FortificationReport; readonly hexCode: string | null }
export function formatFortificationSummaryLine(entries: readonly FortificationReportEntry[]): string | null;
export function buildFortificationToastLines(entries: readonly FortificationReportEntry[]): FortificationToastLine[];
```

- [x] **Step 1: Replace the sentence test.** In `fortificationReport.test.ts`, delete `a fortification sentence names the hits and not what remains` and keep the visibility test. Use a helper `report(h3Index, ownerId, lost)` with `remaining: 0`.

  | Test | Entries (lost → hexCode) | Expected |
  | --- | --- | --- |
  | one hit is singular | 1 → `AA` | `Fortifications in AA absorbed 1 hit.` |
  | hits total across sorted hexes | 2 → `C2`, 1 → `AA` | `Fortifications in AA and C2 absorbed 3 hits.` |
  | battle cells use their codes | 1 → `AA.B9`, 1 → `AA.B0` | `Fortifications in AA.B0 and AA.B9 absorbed 2 hits.` |
  | no hits give no sentence | `[]`, and separately one entry with lost 0 | `null` both times |
  | two missing codes are named once and both hits still add | 1 → `null`, 1 → `null` | `Fortifications in an unidentified hex absorbed 2 hits.` |

  Grouping test for `buildFortificationToastLines`. The entries, each with lost 1, are: human `AA`, `NEUTRAL_OWNER_ID` `C2`, `null` `E5`, human `G1`. Expected:

  ```ts
  [
    { ownerId: HUMAN_SEAT_ID, line: 'Fortifications in AA and G1 absorbed 2 hits.' },
    { ownerId: NEUTRAL_OWNER_ID, line: 'Fortifications in C2 absorbed 1 hit.' },
    { ownerId: null, line: 'Fortifications in E5 absorbed 1 hit.' },
  ]
  ```

- [x] **Step 2: Run the tests and confirm they fail.** `npm run build:main` is still red from the known renderer import of `formatMissileStrikeLine`. That error is not this step's failure. This step fails on the missing fortification exports.
- [x] **Step 3: Implement.**
  - Only entries with `report.lost > 0` count, toward both the codes and the total.
  - `formatFortificationSummaryLine` returns `null` when the total is 0. Otherwise it returns `Fortifications in ${formatTurnReportHexList(codes)} absorbed ${n} ${n === 1 ? 'hit' : 'hits'}.`
  - `buildFortificationToastLines` groups by `report.ownerId` as is, keeping the order of first appearance, and drops groups whose line is `null`.
  - Delete `formatFortificationReportLine` from `fortificationRules.ts`. Keep `FORTIFICATION_UNNAMED_PLACE`, because the paused-queue sentence still uses it.
  - Update the header comment of `fortificationReport.ts`. It now covers strategic and battle losses.
- [x] **Step 4: Verify.** Run `fortificationReport`. Expected: pass.

---

## Phase 4: Strategic Turn Report Uses the New Sentences

**Files:** Modify `src/renderer/gameplay/readyResolutionAnnouncements.ts`, `src/renderer/gameplay/fortificationUpdateLines.ts`, `src/shared/consolidatedTurnUpdateToast.ts` (comments only), `doc/ux/notifications-and-feedback.md`, and `doc/ux/reports-tab.md`.

- [x] **Step 1: Update `fortificationUpdateLines.ts`.** Rewrite `fortificationReportLinesFor` as a synchronous function:

  ```ts
  fortificationReportLinesFor(readySlice: ReadyResult, viewer: {...unchanged}, hexCodeBattle: OrderHexCodeBattle | null): FortificationToastLine[]
  ```

  It keeps the visibility filter, sets each entry's `hexCode` to `orderTargetHexCode(report.h3Index, hexCodeBattle)`, and returns `buildFortificationToastLines(entries)`. Remove its caption lookup and its now-unused imports. Update its comment.
- [x] **Step 2: Update `readyResolutionAnnouncements.ts`.**
  - Add an optional `hexCodeBattle?: OrderHexCodeBattle | null` to the `announceResolutionTurnUpdate` args, with an orienting comment: "The battle whose cells the report's hex codes name. Omitted or null names world-map hexes."
  - Rewrite `missileStrikeLinesFor` as synchronous: build entries with `orderTargetHexCode(record.targetH3Index, null)` and return `buildMissileStrikeToastLines(entries)`. Missiles only exist on the world map.
  - Call both helpers without `await`, passing `args.hexCodeBattle ?? null` to the fortification helper.
  - Remove the unused imports.
- [x] **Step 3: Update the comments in `consolidatedTurnUpdateToast.ts`** for `missileStrikeLines`, `fortificationReportLines`, `MissileStrikeToastLine.line`, and `FortificationToastLine.line`. They now describe one entry per side and name the new builders. Don't change any code there.
- [x] **Step 4: Verify.** Run `npm run build:main`, `npm run check:renderer-types`, and `node dist/shared/consolidatedTurnUpdateToast.test.js`. Expected: all pass. That test feeds literal strings, so it needs no change.
- [x] **Step 5: Update `doc/ux/notifications-and-feedback.md`, line 30.**
  - Replace the sentence that begins `Every missile strike sentence for a hex that side controls` with:

    > ``One missile sentence follows the battle line, or the cause lines when that side has no battle line. It totals every visible strike on hexes that side controlled: `Missile strike in AA destroyed 1 city cell.` or `Missile strikes in AA and C2 destroyed 3 city cells, 1 airport, and 2 fortifications; 2 squadrons lost.` Only kinds with a destroyed total above 0 are named, in city cell, airport, seaport, fortification order. When every total is 0 it ends `destroyed nothing.` (`buildMissileStrikeToastLines` in `src/shared/missileStrikeReport.ts`). Strikes on neutral or uncontrolled hexes share one such sentence in Updates, after deployments or the combat-activity fallback, and before the unknown-battle line.``

  - Replace the fortification sentences, from `A fortification sentence (` through `It does not say how many remain.`, with:

    > ``One fortification sentence (`buildFortificationToastLines` in `src/shared/fortificationReport.ts`) follows that side's missile sentence and comes before its hex sentences: `Fortifications in AA and C2 absorbed 3 hits.`, or `hit.` for one. It does not say how many remain.``

  - Add after them:

    > ``Both sentences name hexes by code, as the hex tooltip does (`orderTargetHexCode`): `AA` on the world map and `AA.B0` for a battle cell. Codes are listed once each, sorted alphabetically, and a hex without a code is named `an unidentified hex`, last (`formatTurnReportHexList` in `src/shared/turnReportHexCodes.ts`).``

  - Keep the `Neutral Losses` sentence. Read the whole paragraph before editing. It is one long line.
  - In the Code Entry Points list, name `buildMissileStrikeToastLines` (`src/shared/missileStrikeReport.ts`), `formatTurnReportHexList` (`src/shared/turnReportHexCodes.ts`), and `buildFortificationToastLines` (`src/shared/fortificationReport.ts`).
- [x] **Step 6: Update `doc/ux/reports-tab.md`.** The turn-report paragraph restates `Fortifications at {place}`. Replace that sentence with the same combined fortification sentence, and say the missile sentence is the combined one from the toast. In the source list, replace `formatFortificationReportLine` with `buildFortificationToastLines` and keep `formatFortificationQueuePausedLine`. Read the whole paragraph before editing.

---

## Phase 5: Battle Fortification Sentence (R7)

**Files, main process:**
- `src/main/tacticalBattle/tacticalFortificationSoak.ts` and its `.test.ts`
- `src/main/tacticalBattle/tacticalStrategicOrderPhases.ts`
- `src/main/tacticalBattle/tacticalBeatOutcome.ts`
- `src/main/tacticalBattle/tacticalBattleSession.ts`
- `src/main/tacticalBattle/aiOnlyTacticalBeat.ts`
- `src/main/gameActions/tacticalBeatPlayback.ts`
- `src/shared/ipc/tacticalPlaybackTypes.ts`

**Files, renderer:** `src/renderer/gameplay/readyResolutionAnnouncements.ts` and `src/renderer/gameplay/readyTacticalCommit.ts`.

**Docs:** `doc/ux/notifications-and-feedback.md` and `doc/combat-rules-v3.md`.

**Produces:** `export interface TacticalFortificationHooks extends FortificationCombatHooks { absorbedReports(): FortificationReport[] }`, returned by `createTacticalFortificationHooks`. Do not add `absorbedReports` to `FortificationCombatHooks`.

- [x] **Step 1: Extend the soak test** in `tacticalFortificationSoak.test.ts`:
  - Immediately after creating `hooks`, assert `assert.deepEqual(hooks.absorbedReports(), [])`.
  - The existing test absorbs once, then calls `absorbHit` again and expects false. After that second call, assert `assert.deepEqual(hooks.absorbedReports(), [{ h3Index: fortified, ownerId: HUMAN_SEAT_ID, lost: 1, remaining: 0 }])`.
  - Update the test's comment.
- [x] **Step 2: Run it and confirm it fails.**
- [x] **Step 3: Implement the hooks.** Keep a `Map<string, number>` of absorbs per cell inside the closure. Increment it only on the `true` path. `absorbedReports()` returns one report per cell in insertion order, using the `controller` the hooks already read and `remaining: 0`. Log that call at trace with the report count, using the logger already imported in the file. Change the return type and comments. Do not change `FortificationCombatHooks`.
- [x] **Step 4: Run the test and confirm it passes.**
- [x] **Step 5: Carry the reports to the beat outcome.**
  - In `tacticalStrategicOrderPhases.ts`:
    - Add `fortificationReports: FortificationReport[]` to `TacticalAirRangedPhaseAccum`, with an orienting comment.
    - In the object `applyTacticalAirStrikeThenRangedPhaseOnBattle` returns (near `infrastructureDestroyedEvents,`), set `fortificationReports: fortificationHooks.absorbedReports()`.
  - In `tacticalBeatOutcome.ts`, add `readonly fortificationReports: readonly FortificationReport[]` next to `infrastructureDestroyedEvents`, with a comment like that field's.
  - Run `npm run build:main`. The two success returns of `TacticalBeatOutcome` fail to compile: `applyHumanTacticalDraftBeatInStrategicOrder` in `tacticalBattleSession.ts`, filled from `acc.fortificationReports`, and `applyAiOnlyTacticalBeat` in `aiOnlyTacticalBeat.ts`, filled from `airAndRanged.fortificationReports`. Don't add the field to `TacticalHumanSupportProjectionResult`, `projectTacticalSnapshotAfterValidatedHumanSupportOrders`, or `applyValidatedHumanTacticalSupportOrders`. Those returns are not a beat outcome. The air-and-ranged function may ignore `acc.fortificationReports` there.
  - In `src/shared/ipc/fortificationTypes.ts`, update the `FortificationReport` comments. A beat report may store a tactical cell in `h3Index`. Its `remaining: 0` means the sentence does not read the field. A strategic report still stores the fortified count left on that hex.
- [x] **Step 6: Carry the reports to playback.**
  - In `tacticalPlaybackTypes.ts`, add `fortificationReports?: FortificationReport[]` beside `infrastructureDestroyedEvents`, with a comment: "Battle cells whose fortification absorbed a hit this beat. Omitted when empty."
  - In `buildTacticalCombatPlaybackFields`, set `fortificationReports: outcome.fortificationReports.length > 0 ? [...outcome.fortificationReports] : undefined`. `buildAiOnlyTacticalBeatPlayback` already spreads that helper, so this one assignment covers a human beat and an AI-only beat.
  - If a test file for `tacticalBeatPlayback.ts` exists, add one case asserting that a non-empty outcome list is copied and an empty one is `undefined`. Don't create a new test file for it.
- [x] **Step 7: Show it in the beat report.**
  - In `buildTacticalCommitReadyResultForToast`, add `fortificationReports: playback.fortificationReports?.length ? playback.fortificationReports : undefined`.
  - In `readyTacticalCommit.ts`, where `announceResolutionTurnUpdate` is called for the beat:
    - Name the battle `const battleForReport = commitResult.tacticalBattle ?? S.tacticalBattleSnapshot`.
    - Pass `hexCodeBattle: battleForReport ?? null`.
    - Pass `exploredHexes: new Set([...getExploredHexSet(S.gameState), ...(battleForReport?.tacticalChildH3Indexes ?? [])])`. Add a comment that a battle has no fog, so an opponent's absorbed hits are visible. `visibleHexes` is a different argument and does not feed the fortification filter.
    - Import `getExploredHexSet` from where `readyResolutionAnnouncements.ts` imports it.
    - Do not add `fortificationReports` to `needsResolutionPlayback`. An absorb already comes with a ranged target or an air attempt, which is what shows the toast.
  - `readyTacticalCommit.ts` is the only beat caller of `announceResolutionTurnUpdate`. `readyHandler.ts` and `showHeldBattleTurnUpdate` stay on world-map codes and do not pass `hexCodeBattle`.
- [x] **Step 8: Verify.** Run `npm run build:main`, the soak test, and `npm run check:renderer-types`. Expected: all pass.
- [x] **Step 9: Update the docs.**
  - In `doc/ux/notifications-and-feedback.md`, after the Phase 4 hex-code sentence, add:

    > ``A battle beat report has the same fortification sentence for its cells that absorbed a hit that beat, filed under the hex controller, for example `Fortifications in AA.B0 and AA.B9 absorbed 2 hits.` (`absorbedReports` on `createTacticalFortificationHooks`). Every side sees it, because a battle has no fog. A battle has no missile sentence.``

  - In `doc/combat-rules-v3.md`, at the end of the bullet that begins `A fortified core cell absorbs one hit`, add: ``Each absorbed hit is listed in that beat's report.`` Leave §8.6 as it is. It does not claim one sentence per launch.

---

## Phase 6: Whole-Change Verification

- [x] **Step 1:** Run `npm test`. Expected: exit code 0.
- [ ] **Step 2:** Run `npm run ui:smoke`. Expected: no `FAIL` lines. Then run `npm run rebuild:native:node` before any further `npm test`.
- [x] **Step 3:** Search for leftovers:
  - Search `src/` and `doc/` (skipping historical documents and release notes) for `formatMissileStrikeLine`, `formatFortificationReportLine`, `Missile strike on`, `Fortifications at`, and `nothing there to destroy`. Expected: no results.
  - Search `src/main/` for a literal `3` passed as a turn-notes limit outside tests. Expected: none.
- [x] **Step 4:** Run `git status --short`. Expected: only the files named in this plan, plus `static/renderer.js` if a build rebuilt it.
- [x] **Step 5: Hand over for manual acceptance.** Report Steps 1 to 4. Then ask the user to run `npm start` and check:

  | Where | Check |
  | --- | --- |
  | A turn with 2 or more missile launches on one side | One `Missile strikes in …` line in that side's section, with sorted codes and totals |
  | A turn where fortifications absorb hits in two hexes | One `Fortifications in … absorbed N hits.` line |
  | A battle beat where an enemy hits a fortified cell | `Fortifications in AA.Bx … absorbed N hit(s).` in the beat report, for both the human and the AI side |
  | An AI prompt in the OpenRouter log after turn 11 | `## Recent Turn Notes` lists up to 10 prior turns |
