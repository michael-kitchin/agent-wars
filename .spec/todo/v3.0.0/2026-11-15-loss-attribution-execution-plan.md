# Loss Attribution in Recent Turn Notes: Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** Every loss line a commander reads in `## Recent Turn Notes` says who was responsible. Losses are grouped by the side that lost them, then by the responsible side, the cause, and the hex. Each line keeps the specifics: victim ids or type counts, the hex code, and the types of the units that did the killing. This applies to the newest turn and to every older turn in the section, in the strategic prompt, the tactical prompt, and the talk prompt. It gives each commander's trust judgments evidence from the game itself, not only from what other sides claim.

**Shape:** Phase 0 records a baseline. Phases 1 through 3 change how loss notes are stored and printed, and old rows still print. Phase 4 adds the carrier data the capture step needs, with no behavior change. Phases 5 through 7 work out who was responsible and store it. Phase 8 updates the documents. Phase 9 runs the final verification and hands the user a manual checklist. Each phase can be verified on its own, or together with the phases before it.

**Tech:** TypeScript (Electron main and shared code), better-sqlite3, `node:test`-style files run as plain `node <file>`, ESLint with the local `orienting-comments` and `seat-id-literals` rules, and `scripts/check-circular-deps.cjs`.

---

## How to Use This Plan

- Run the phases in order, back to back. Do not pause between phases for review.
- **Stop only when a verification fails** and the phase's "If verification fails" steps do not fix it. Then revert that phase (see Backup and Revert), write the failure in the Completion Log, and stop. Tell the user which phase failed and why.
- Never commit, push, stash, or run `git checkout`, `git restore`, `git reset`, or `git clean`. The user reviews every change.
- Read the whole phase before you edit anything. Each phase lists the files it **Adds** and **Edits**. Do not edit other files, except to remove an import that lint reports unused in a listed file, or to fix a test that fails only because of a change the phase names. Record any such file in the Completion Log.
- Find code by the quoted text, not by a line number. Line numbers here are hints from the tree on 2026-11-15 and may have moved.
- **Code blocks are sketches.** Write the real code from the file you just read. When a sketch and the file disagree, the file wins. Record the difference in the Completion Log. **Prompt strings and log message names in this plan are not sketches.** Copy them exactly.
- **Tests come first.** Write the phase's tests, run them, and see them fail for the reason the phase names. Then make the change and see them pass. When a test cannot fail before the change (a pure addition), say so in the Completion Log.
- Make no paid model calls. Do not set an OpenRouter key.
- **Another plan may run first.** `.spec/todo/v3.1.0/2026-11-15-history-1-match-statistics-execution-plan.md` also edits `src/main/openRouter/talk/talkPromptInput.ts`, `src/main/openRouter/talk/talkPrompt.ts`, and the prompt documents. Neither plan depends on the other. Always re-read a file before you edit it. Never undo an edit that history-1 made. When this plan quotes text that history-1 has since changed, find the same place by meaning, and record the difference.

### Backup and Revert

Nothing is committed. Before each phase, copy every file the phase **edits** into a backup folder outside the repo. Run this from the repo root in PowerShell. Set `$step` to the phase number and `$files` to that phase's **Edit** list.

```powershell
$step = '1'
$files = @('src/shared/lossSummary.ts', 'src/main/briefing/recentTurnNotesSection.ts')
$backup = Join-Path $env:TEMP "aw-loss-attribution\step-$step"
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

Every phase runs its targeted tests as it goes. At the end of each phase run, from the repo root:

1. `npm test` passes. It builds main, runs lint, the naming check, the renderer type check, every `dist/main` and `dist/shared` test, and the notices check.
2. `npm run build:renderer` passes. The renderer bundles `src/shared/lossSummary.ts`, so a shared change must still bundle.
3. `npm run check:circular` prints exactly the cycles Phase 0 recorded, and no others. A new cycle fails the phase. Do not edit `scripts/circular-deps-baseline.json`.

How to run a single compiled test: `npm run build:main`, then `node dist/main/<path>.test.js` or `node dist/shared/<path>.test.js`. `scripts/run-main-node-tests.cjs` finds every `*.test.js` under `dist/main` and `dist/shared`, so a new test file needs no registration.

---

## Locked Decisions

The user made these decisions. Do not reopen them.

1. **Full record.** Loss notes keep today's policy of no fog filter. A seat's notes list every unit any owner lost that turn. That includes fights between two other sides, each with its victim side, responsible side, types, and hex. Recent Turn Notes is an existing no-fog channel, so this is not a breach of history-1's Locked Decision 1. The history meta-plan already carries a note that says so.
2. **Responsible side plus killer types.** Each grouped line names the responsible side, the cause, and the hex. It lists the victims by id when the list is short, and otherwise as type counts, exactly as today. It ends with the type counts of the units that did the killing.
3. **Trace indirect losses when the data shows the cause.** Cargo lost with its carrier gets the carrier's attribution. A unit lost to an invalid air base is credited to whoever took the hex or destroyed the airport. A striker or drop carrier lost to anti-air fire is credited to the defenders on the target hex. When the data shows no other side caused a loss, the line says `no side responsible`.
4. **Old rows print as unknown.** The stored JSON gains one optional field. There is no schema change and no change to `EXPECTED_USER_VERSION` (26). A row written before this plan prints `by unknown side` and no hex.
5. **Missing losses: strategic air drops only.** Strategic air-drop losses are already reported to the renderer, but never reach the note writer. This plan passes them on. Silent removals that reach no list (see Known Gaps) stay out of scope, and the engine and the popup do not change for them.
6. **Strategic air strikes are matched on the target hex.** Strategic air-strike resolution records no striker for each victim. A victim is credited to every striker of another side that targeted its hex that turn. Combat resolution code does not change.
7. **Cap older turns at 12 grouped lines.** The newest turn block lists every group. Each older block lists at most `RECENT_TURN_LOSS_GROUP_LINES_MAX` (12) groups. Groups where this seat lost units, or this seat was responsible, are chosen first. A block that drops groups ends with one line giving the number not listed.
8. **No ordering with the history plans.** See How to Use This Plan.

## Design Rules the Implementer Must Keep

- **The popup does not change.** The map toast, the turn-update popup, and the Reports copy share `src/shared/lossSummary.ts` and `buildTurnLossSummary`. Their output must stay byte for byte the same. `buildTurnLossSummary` and `formatPlayerLossLinesMultiline` keep their behavior. Attribution is added by a separate step, after `buildTurnLossSummary`, in `src/main` only.
- **Owner, not id prefix.** A rehired mercenary and a Neutral unit keep the id prefix of the side that created them (`MERCENARY_ID_PREFIX_NOTE`). The responsible side always comes from an owner field (`player`), never from an id.
- **Fight-time owner.** The strategic owner of a killer comes from `combatUnitsBefore`, `combatUnitsAfter`, the striker moves, the missile launches, and the removed-unit snapshots. It never comes from `listUnitsForSnapshot()` in the finalize step, which runs after mercenaries and knockouts change owners.
- **A killer of the victim's own owner is ignored.** Every killer list is filtered to units whose owner is not the victim's owner, and whose owner and type are known.
- **No seat-id string literals in production code.** Use `HUMAN_SEAT_ID`, `AI_SEAT_IDS`, and `NEUTRAL_OWNER_ID` from `src/shared/seatIds.ts`. Tests may use the literal values, as existing tests do (`'opponent'`).
- **Logging.** Each exported function under `src/main` logs `logDebug` on entry with ids and counts. A getter logs `logTrace` instead. `src/shared` never imports the logger. Every caught exception logs `logError` with the error. Never log a prompt body.
- **File size.** Stay under 600 lines where a file already is. No file may pass 1000. `src/main/briefingFormatter.ts` (966 lines) and `src/main/gameActions/sealift.ts` (937 lines) must not grow. `src/main/gameActions/meleeInterceptReadyFinalize.ts` (575) and `src/main/gameActions/readyStrategicResolutionPipeline.ts` (589) must stay at or under 600. The phases say where the new code goes so that they do.
- **Parameters.** A function takes at most 6 parameters. Use one object parameter past 3, with an orienting comment on the type and on every field.
- **Comments.** Every new or changed declaration has the orienting JSDoc block: a one-line summary, then `Purpose:` (or `Contract:` on interface members), `When to use:`, `Expected outcome:`, and `Exceptions:`. Write specific text, in the voice of the file. Lint rejects the wrong layout.
- **Mutability.** Use `const`, `readonly` fields, and `readonly` array types for anything not modified.
- **Plan vocabulary stays out of the product.** No phase numbers, "plan", "locked decision", or "known gap" in `src/`, `scripts/`, or `doc/`.
- **Names.** New files and directories under `src/` are camelCase. Use only the allowed suffixes (`Types`, `Helpers`, `Core`, and so on). `npm run naming:check` enforces the contract.

## Non-Goals

- No change to the map toast, the turn-update popup, the Reports tab, or anything under `src/renderer`.
- No change to combat math, dice, or which units are removed.
- No schema change, no new table or column, no `EXPECTED_USER_VERSION` change, and no change to the match recorder. `turn_notes_history` is excluded from frames (`MATCH_TABLE_RECORDING_POLICY`).
- No change to the cached system prompt text. The one new sentence is printed inside the Recent Turn Notes section, which is situation text.
- No change to `addAiLossEventsSinceConsultation`, callbacks, or `unit_destroyed` subscriptions.
- No fix for the silent removals listed under Known Gaps.
- No edit to the historical documents listed in `AGENTS.md`.

## Known Gaps

These are accepted limits. Do not fix them. Phase 8 records each one in the prompt documents, in product words.

1. **Silent removals reach no list.** Cargo of based air destroyed by a missile or an infrastructure strike (`destroyBasedAirUnitsAtHex`, `src/main/gameActions/airStrikeResolution.ts`), a stranded ferry air unit and its cargo (`src/main/gameActions/airFerryResolution.ts`), and a stranded Neutral transport and its cargo (`neutralTurn.ts`). They do not appear in the notes or the popup.
2. **Strategic air-strike victims are matched by hex.** When strikers of two sides hit the same hex in one turn, both sides are named for every victim on that hex.
3. **Strategic anti-air shooters are not recorded.** A strategic striker or drop carrier lost to anti-air fire is credited to the other sides' units on the target hex, or else to that hex's controller before control changed. Its line has no `(by ...)` counts.
4. **Melee and ranged killer lists are side-level.** The engine lists every unit of the side that fought the victim, not the unit that landed the hit. The `(by ...)` counts are the units that fought, which the legend says.
5. **Strategic strikes that were shot down still count.** A striker that targeted the hex is counted in `(by ...)` even if it was shot down before it hit.

---

## Phase 0 — Baseline

**Adds:** none. **Edits:** none.

1. Run `npm test`, `npm run build:renderer`, and `npm run check:circular`. Write in the Completion Log whether each passed, and copy the full list of cycles that `check:circular` prints. `check:circular` exits 1 on the current baseline. That exit is expected.
2. Run `git status --short` and copy the output into the Completion Log, so the user can tell your changes from earlier work.
3. Check whether history-1 has run: search `src/main/gameDb/sideMessageStore.ts` for `trust`. Write `history-1 present` or `history-1 absent` in the Completion Log. Nothing else depends on the answer.
4. Read these files in full before Phase 1. Every later phase depends on them:
   - `src/shared/lossSummary.ts`
   - `src/shared/lossSummaryFromResolution.ts`
   - `src/main/gameActions/captureTurnLossNote.ts`
   - `src/main/briefing/recentTurnNotesSection.ts`
   - `src/main/gameDb/turnNotesHistory.ts`
   - `src/main/recentTurnNotesSection.test.ts`
   - `src/main/lossSummary.test.ts`

**If verification fails:** stop. Report the failing baseline check to the user. Do not start Phase 1 on a red baseline.

---

## Phase 1 — Stored Attribution and Its JSON

Each stored loss can carry who lost it, where, who was responsible, and which units did the killing. Old rows still read.

**Adds:**
- `src/shared/lossAttributionTypes.ts`
- `src/shared/lossSummaryJson.ts`
- `src/shared/lossSummaryJson.test.ts`

**Edits:**
- `src/shared/lossSummary.ts`
- `src/main/briefing/recentTurnNotesSection.ts` (import path only)
- `src/main/gameActions/captureTurnLossNote.ts` (import path only)
- every other file that imports `parsePlayerLossSummaryJson` or `serializePlayerLossSummary`. Find them with a search, and include tests.

### Steps

1. **`src/shared/lossAttributionTypes.ts`.** Import `BuildUnitType` from `./ipc/productionTypes`. Do not import from `./lossSummary`, because `lossSummary.ts` will import this file and the reverse import would be a cycle.

   ```ts
   /** One unit that fought and destroyed a victim. */
   export interface LossKillerUnit {
     readonly unitId: string;        // snapshot id, the same id prompts use
     readonly unitType: BuildUnitType;
   }

   /** Who lost a unit, where, and who was responsible. */
   export interface LossAttribution {
     readonly ownerId: string;                            // the victim's owner at the time of the loss
     readonly lossH3Index: string | null;                 // where it was lost; null when not known
     readonly responsibleOwnerIds: readonly string[] | null; // [] = no side responsible; null = unknown
     readonly killerUnits: readonly LossKillerUnit[];     // distinct ids; [] when none are known
   }
   ```

   Give each field the full orienting comment. The `responsibleOwnerIds` comment must state all three meanings: a non-empty list names the sides, `[]` means the data shows no other side caused the loss, and `null` means the game could not tell.

2. **`LostUnit`** in `src/shared/lossSummary.ts` gains one field:

   ```ts
   readonly attribution?: LossAttribution;
   ```

   Its comment says the field is absent on rows written before attribution existed and on every popup row, and that popup formatters never read it.

3. **Export two prompt helpers** that are private today, without changing what they do:
   - `formatLossEntriesForPrompt`.
   - `formatGroupedTypeTotals`. Widen its parameter to `readonly { readonly unitType: LostUnitType }[]`. Every current call still compiles.

   Update both comments. `When to use:` now names `buildRecentTurnLossLines` (Phase 2).

4. **Move `parsePlayerLossSummaryJson` and `serializePlayerLossSummary`** out of `lossSummary.ts` into `src/shared/lossSummaryJson.ts`. Update every importer to the new path. Do not leave a re-export in `lossSummary.ts`.

   `parsePlayerLossSummaryJson` keeps its current rules: invalid JSON gives empty buckets, and a row needs a string `displayName` and a string `unitType`. In addition, it reads `attribution` with a new non-exported `parseLossAttribution(raw: unknown): LossAttribution | undefined`:
   - It returns undefined unless `raw` is an object and `ownerId` is a non-empty string.
   - `lossH3Index` is the string when it is a non-empty string, and otherwise null.
   - `responsibleOwnerIds` is null when the field is null or missing, or is not an array. When it is an array, it keeps the string entries only.
   - `killerUnits` keeps entries whose `unitId` is a non-empty string and whose `unitType` passes `isBuildUnitType`. It is `[]` when the field is not an array.
   - A unit whose attribution is invalid keeps every other field and simply has no `attribution`.

5. `serializePlayerLossSummary` stays `JSON.stringify(summary)`. Fix its comment: there are six bucket keys, not five.

### Tests (`src/shared/lossSummaryJson.test.ts`)

Follow the layout of `src/shared/turnLossSections.test.ts`.

- **Round trip.** A summary with one ranged unit `{ unitType: 'armor', displayName: 'IV Armored', unitId: 'a1-a2', attribution: { ownerId: 'opponent', lossH3Index: 'h3-x', responsibleOwnerIds: ['human'], killerUnits: [{ unitId: 'h1-a4', unitType: 'armor' }] } }` serializes and parses back to a deep-equal summary.
- **Old row.** `'{"ranged":[{"unitType":"armor","displayName":"A","unitId":"a1-a2"}],"melee":[],"returnFire":[],"airStrike":[],"other":[]}'` parses with one ranged unit, no `attribution` key, and an empty `missileStrike`.
- **The three responsible meanings.** `responsibleOwnerIds: []` parses as `[]`. `null` parses as `null`. A missing field parses as `null`.
- **Bad attribution.** `ownerId: 7` drops the attribution and keeps the unit with its id and name.
- **Popup unchanged.** `formatPlayerLossLinesMultiline` gives the same lines for the round-trip summary as for a copy with `attribution` deleted from every unit. Fill a bucket with four infantry, so the collapsed-type branch runs too.

This phase is a pure addition plus a move. The new tests fail before the change only because the module does not exist. Say so in the Completion Log.

### Verification

The Verification Bar. `npm run check:circular` shows no new cycle between `lossSummary.ts` and `lossAttributionTypes.ts`.

**If verification fails:** a cycle means `lossAttributionTypes.ts` imports `lossSummary.ts`. Import `BuildUnitType` instead. A renderer type error means a renderer file imported the moved parser. That should not happen, because only `src/main` uses it, but if it does, update that import too and record the file.

---

## Phase 2 — The Loss-Line Formatter

A pure function turns one turn's stored losses into grouped, attributed lines. Nothing calls it yet.

**Adds:**
- `src/main/briefing/recentTurnLossLines.ts`
- `src/main/briefing/recentTurnLossLines.test.ts`

**Edits:** none.

### Contract

```ts
export const RECENT_TURN_LOSS_GROUP_LINES_MAX = 12;

export interface RecentTurnLossLinesInput {
  readonly ownSeatId: string;                       // the commander reading the notes
  readonly ownLosses: PlayerLossSummary;            // parsed own_loss_json
  readonly otherLosses: PlayerLossSummary;          // parsed enemy_loss_json (every other owner, merged)
  readonly seatOrder: readonly string[];            // every roster seat id, in seatOrder
  readonly hexCodeFor: (h3Index: string) => string | undefined;
  readonly maxGroupLines: number | null;            // null = no cap (the newest turn)
}

export function buildRecentTurnLossLines(input: RecentTurnLossLinesInput): string[];
```

It logs `logDebug('recentTurnLossLines buildRecentTurnLossLines', { ownSeatId, maxGroupLines, groupCount, listedCount })`. It returns `[]` when both summaries are empty.

### Rules

Apply these exactly.

1. **Victim owner of a unit.**
   - A unit in `ownLosses` belongs to `ownSeatId`.
   - A unit in `otherLosses` belongs to `attribution.ownerId` when the attribution is present, and otherwise to the unknown owner. Use a module constant, `UNKNOWN_OWNER_KEY`, that cannot equal a real owner id.

2. **Responsibility of a unit.**
   - `unknown` when `attribution` is absent or `responsibleOwnerIds` is null.
   - `none` when it is `[]`.
   - Otherwise, the list of ids, de-duplicated and sorted by side rank (rule 4).

3. **Group key.** A unit joins the group with the same victim owner, responsibility, cause bucket, and printed hex code. The printed hex code is `hexCodeFor(attribution.lossH3Index)` when `lossH3Index` is non-null and the call returns a non-empty string, and otherwise empty. Victims keep their bucket order inside a group.

4. **Side label and rank.**

   | Owner id | Label | Rank |
   | --- | --- | --- |
   | `ownSeatId` | `you` | its index in `seatOrder` |
   | `NEUTRAL_OWNER_ID` | `Neutral` | `seatOrder.length` |
   | any id that passes `isSeatId` | `playerIdCodeFor(id)` | its index in `seatOrder` |
   | anything else | the id itself | `seatOrder.length + 1`; ties by `localeCompare(…, 'en')` |

   A seat id missing from `seatOrder` ranks `seatOrder.length - 0.5`, so it sorts after every listed seat and before Neutral. `playerIdCodeFor` throws for a non-seat id, so call it only after `isSeatId` passes.

5. **Responsible text.**
   - `unknown` prints `by unknown side`.
   - `none` prints `no side responsible`.
   - One side prints `by X`.
   - Two sides print `by X and Y`.
   - Three or more print `by X, Y, and Z`, with sides in rank order.

6. **Killer text.** Collect the distinct `killerUnits` (by `unitId`) across every victim in the group, and format them with `formatGroupedTypeTotals`. When the list is empty, the line has no `(by …)` part.

7. **Group line.** Two spaces, a dash, and a space, then:

   ```
   {responsible text}, {cause label}{ at HEX when the code is non-empty}: {formatLossEntriesForPrompt(victims)}{ (by {killer text}) when non-empty}
   ```

   The cause labels are the existing `LOSS_CAUSE_LABELS`, matched to bucket keys through `LOSS_CAUSE_KEYS`. Index the two arrays together; do not restate the strings.

8. **Section header.** A section lists the groups of one victim owner.

   | Victim owner | Header |
   | --- | --- |
   | `ownSeatId` | `- Your Losses:` |
   | the unknown owner | `- Losses of other sides:` |
   | anyone else | `- Losses of {side label}:`, which is `- Losses of Neutral:` for Neutral |

   A section with no listed group is not printed.

9. **Canonical order.**
   - Sections: own first, then other owners by rank, then the unknown owner.
   - Groups inside a section, by responsibility: side groups first, then `none`, then `unknown`. Side groups are ordered by the rank of their first side, then by the number of sides, then by the joined label text.
   - Within the same responsibility: by cause in `LOSS_CAUSE_KEYS` order, then by hex code ascending (`localeCompare(…, 'en')`), with an empty code last.

10. **Cap.** When `maxGroupLines` is not null and there are more groups than that:
    - A group is **involved** when its victim owner is `ownSeatId`, or its responsibility lists `ownSeatId`.
    - Choose involved groups in canonical order, then the others in canonical order, until `maxGroupLines` are chosen.
    - Print the chosen groups in canonical order.
    - Then print one line: `- 1 more loss group on this turn is not listed.` when one was dropped, or `- {n} more loss groups on this turn are not listed.` when more were.

### Tests (`src/main/briefing/recentTurnLossLines.test.ts`)

Use own seat `'opponent'` (code `a1`), seat order `['human', 'opponent', 'opponent2']`, and a `hexCodeFor` backed by `new Map([['hA', 'QX'], ['hB', 'RB'], ['hC', 'TT']])`. Build attributions with a small local helper.

- **The preview case, exactly.**
  - Own ranged victims `a1-i3` (infantry) and `a1-a2` (armor), both at `hA`, responsible `['human']`, killers `h1-a4` and `h1-a5` (both armor).
  - Own melee victims `a1-i4`, `a1-i5`, `a1-i6` (infantry) at `hB`, responsible `['opponent2']`. Every victim lists killers `a2-a1` (armor) and `a2-i2`, `a2-i7` (infantry).
  - One other-loss air-strike victim `h1-n1` (naval, owner `'human'`) at `hC`, responsible `['opponent']`, killer `a1-r1` (air).
  - Expect exactly:

    ```
    - Your Losses:
      - by h1, Ranged attack at QX: a1-i3, a1-a2 (by 2 Armored)
      - by a2, Melee attack at RB: a1-i4, a1-i5, a1-i6 (by 1 Armored, 2 Infantry)
    - Losses of h1:
      - by you, Air strike at TT: h1-n1 (by 1 Air)
    ```

- **Old rows.**
  - An own ranged `a1-i3` with no attribution gives `- Your Losses:` then `  - by unknown side, Ranged attack: a1-i3`.
  - An other melee `h1-i1` with no attribution gives `- Losses of other sides:` then `  - by unknown side, Melee attack: h1-i1`.
- **No side, no hex.** An own `other` victim `a1-t1` with responsible `[]` and `lossH3Index: 'hZ'` (not in the map) gives `  - no side responsible, Other losses: a1-t1`.
- **Several sides.**
  - Responsible `['opponent2', 'human']` prints `by h1 and a2`.
  - `['neutral', 'opponent2', 'human']` prints `by h1, a2, and Neutral`.
  - A victim owned by `'neutral'` gets the header `- Losses of Neutral:`.
- **Split by hex and side.** Two own ranged victims by `human`, one at `hA` and one at `hB`, give two lines. The `QX` line comes first.
- **Long list.** Six own infantry in one group print `6 Infantry`, as `formatLossEntriesForPrompt` does today.
- **Cap.**
  - Add 12 more entries to the `hexCodeFor` map (`h1` → `A1` through `h12` → `A12`). Build 14 groups: 12 `otherLosses` groups with victim owner `opponent2`, responsible `['human']`, one at each of those hexes, plus 2 own groups.
  - With `maxGroupLines: 12`, both own groups are listed, 10 of the others are listed, and the last line is `- 2 more loss groups on this turn are not listed.`.
  - With `13`, the last line is `- 1 more loss group on this turn is not listed.`.
  - With `null`, all 14 are listed and there is no count line.
- **Empty.** Two empty summaries give `[]`.

### Verification

The Verification Bar.

**If verification fails:** compare the failing line with rules 5 through 7. Most mistakes are rank ties or a missing space before `(by`.

---

## Phase 3 — Print the Attributed Lines in Every Prompt

Recent Turn Notes uses the formatter in the strategic, tactical, and talk prompts. Rows written before Phase 6 print as `by unknown side`.

**Adds:** none.

**Edits:**
- `src/main/briefing/recentTurnNotesSection.ts`
- `src/main/briefing/map/hexCoordinates.ts`
- `src/main/openRouter/formatTacticalBriefing.ts`
- `src/main/openRouter/talk/talkPromptInput.ts`
- `src/shared/lossSummary.ts` (delete `formatPlayerLossInline`)
- `src/main/lossSummary.test.ts`
- `src/main/recentTurnNotesSection.test.ts`

### Steps

1. **`hexCoordinates.ts`.** Add `export function hasTacticalCoordinateRegistry(battleId: string): boolean`, which returns `tacticalRegistries.has(battleId)` and logs `logTrace`.

2. **`BuildRecentTurnNotesSectionArgs`** gains one field:

   ```ts
   readonly tacticalEnclosingH3Index?: string;
   ```

   Its comment says that tactical callers pass `TacticalBattleSnapshot.enclosingStrategicH3Index`, so the battle's hex codes can be printed even when no orders consult has built them yet (the talk stage). Strategic callers omit it. `src/main/briefingFormatter.ts` does not change.

3. **A lazy hex resolver.** Add a non-exported `lossHexCodeResolver(args): (h3Index: string) => string | undefined`. It does no work until its first call, so a turn with no stored hex never builds a registry. On the first call it initializes once and then caches:
   - **Strategic:** call `ensureStrategicCoordinateRegistryInitialized()`, then use `getHexCodeForContext(h3, { mode: 'strategic' })`.
   - **Tactical:** when `tacticalEnclosingH3Index` is set and `hasTacticalCoordinateRegistry(battleId)` is false, call `initTacticalCoordinateRegistry(battleId, tacticalEnclosingH3Index)`. Then use `getHexCodeForContext(h3, { mode: 'tactical', battleId })`.
   - When initialization throws, `logError('recentTurnNotesSection hex code registry failed', { scope, battleId, err })`, and return undefined from then on. A loss line then prints without a hex. It never fails the prompt.

4. **`formatTurnBlock`** takes one object parameter: the row, the resolver, the own seat id, the seat order, and `maxGroupLines`. It prints `Turn N:`, then `- Strategy: …` exactly as today, then the lines from `buildRecentTurnLossLines`. Delete the `- Enemy Losses:` and `- Your Losses:` inline lines.

5. **`buildRecentTurnNotesSection`:**
   - Own seat: `args.seatId ?? AI_SEAT_IDS[0]`, as today.
   - Seat order: `sortSeatsByOrder(getSeatRoster()).map((seat) => seat.seatId)`. Use the same `getSeatRoster` from `../gameDb` that `captureTurnLossNote.ts` uses.
   - The newest row (the last after filtering) gets `maxGroupLines: null`. Every other row gets `RECENT_TURN_LOSS_GROUP_LINES_MAX`.
   - When any block printed a loss line, put this paragraph between the heading and the first block, followed by a blank line. It is exact text:

     ```
     Loss lines are game records, not claims by any side. "by" names the side whose units or actions destroyed the units listed, and the closing "(by ...)" counts the units that fought them. "no side responsible" means no other side caused the loss. "by unknown side" means the game could not tell, or the loss was recorded before the game kept that detail.
     ```

     Define it as an exported constant, `RECENT_TURN_LOSS_LEGEND`, in `recentTurnLossLines.ts`.
   - `rowHasPromptContent` keeps its meaning.

6. **Tactical callers pass the enclosing hex.**
   - `formatTacticalBriefing.ts` passes `tacticalEnclosingH3Index: tacticalBattle.enclosingStrategicH3Index`.
   - `talkPromptInput.ts` passes `tacticalEnclosingH3Index: args.battle?.enclosingStrategicH3Index`.

7. **Delete dead code.** `formatPlayerLossInline` has no caller left. Delete it and its test cases in `src/main/lossSummary.test.ts`. Fix the comments in `lossSummary.ts` that name it (`LostUnit.unitId`, `formatLossEntriesForPrompt`). Search `src/` for `formatPlayerLossInline` and expect no match.

### Tests

- **`src/main/recentTurnNotesSection.test.ts`:**
  - Change the existing assertions. `Enemy Losses: Ranged attack: human-inf-1` becomes `- Losses of other sides:` followed by `  - by unknown side, Ranged attack: human-inf-1`, because that row has no attribution. The "empty own-loss line suppressed" check now asserts that `- Your Losses:` is absent.
  - Add: the section contains `RECENT_TURN_LOSS_LEGEND` exactly once when a row has losses.
  - Add: the legend is absent when every row only has a strategy.
  - Add: write a row whose own JSON has an attributed ranged unit (`responsibleOwnerIds: ['human']`, `lossH3Index: null`, one armor killer). The section contains `  - by h1, Ranged attack: ` and `(by 1 Armored)`. `lossH3Index` is null so the test builds no hex registry.
  - Add: write 13 attributed `otherLosses` groups on turn 1 and one loss on turn 2, both before current turn 3. Keep `lossH3Index` null and make the groups distinct by cause and side. Every victim is owned by `opponent2`. Each of the six causes appears once with responsible `['human']` and once with `['opponent3']`, which is 12 groups. One more `other` victim has responsible `[]`. Turn 1's block ends with `- 1 more loss group on this turn is not listed.` Turn 2's block has no such line.
  - Seat the temp database the way the existing test does. If `getSeatRoster()` is empty there, the seat order is `[]`, and side labels still come from `playerIdCodeFor`.
- **Talk and tactical callers:** no new test. They only pass one field.

### Verification

The Verification Bar. Also search `src/` for `Enemy Losses`, and expect no match.

**If verification fails:** when a talk or prompt-outline test asserts the old inline text, update that assertion to the new shape. Its file is then a file "a test fails only because of a change the phase names", so record it. When a prompt-stability test fails, check that you added nothing to system text. The legend belongs inside the section.

---

## Phase 4 — Carrier Data for Cargo Losses

The resolution code reports which carrier each lost cargo unit was aboard. Nothing reads this yet, and no behavior changes.

**Adds:**
- `src/main/gameActions/transportCargoLoss.ts`

**Edits:**
- `src/main/gameActions/sealift.ts`
- `src/main/gameActions/airDropResolution.ts`
- `src/main/gameActions/readyStrategicResolutionPipeline.ts`
- `src/main/gameActions/meleeInterceptPendingState.ts`
- `src/main/gameActions/meleeInterceptStrategicResolve.ts`
- `src/main/gameActions/meleeInterceptReadyFinalize.ts`
- `src/main/gameActions/sealift.test.ts`
- `src/main/gameActions/airDropResolution.test.ts`
- any other file that builds an `AirDropPhaseResult` or a `MeleeInterceptReadyPauseSnapshot` object literal. Fix each compile error and record the file.

### Steps

1. **`transportCargoLoss.ts`:**

   ```ts
   export interface TransportCargoLoss {
     readonly cargo: CombatUnit[];                              // same rows the old function returned
     readonly carrierIdByCargoId: ReadonlyMap<string, string>;  // cargo id → the carrier it was aboard
   }
   export function applyTransportLossForRemovedCarriers(removedUnits: CombatUnit[]): TransportCargoLoss;
   ```

   - Move the body of `applyTransportLossForRemovedNavalUnits` from `sealift.ts` here, unchanged. The new code only records `carrierIdByCargoId.set(land.id, naval.id)` beside each `removedCargo.push`.
   - Copy only the imports the body uses. Do not import `sealift.ts`, or there is a cycle.
   - The function logs `logDebug('transportCargoLoss applyTransportLossForRemovedCarriers', { carrierCount, cargoCount })`.

2. **`sealift.ts`:**
   - `applyTransportLossForRemovedNavalUnits` becomes `return applyTransportLossForRemovedCarriers(removedUnits).cargo;` with its comment rewritten in specific text. Its five callers are unchanged.
   - `applyTransportOutcomeForRemovedStrategicUnits` now returns `TransportCargoLoss`. It calls `applyTransportLossForRemovedCarriers` and deletes assignments exactly as before. Rewrite its comment.
   - The file shrinks.

3. **Update the callers of `applyTransportOutcomeForRemovedStrategicUnits`:**
   - The parent delete in `sealift.ts` ignores the return value. Leave it.
   - `readyStrategicResolutionPipeline.ts`, two calls. `airStrikeTransportLosses` and `rangedTransportLosses` take `.cargo`. Build one `transportCarrierIdByCargoId: ReadonlyMap<string, string>` from both maps. Keep the net growth of this file to 8 lines or fewer. If it would pass 600 lines, add an exported helper `mergeCarrierMaps(...maps: ReadonlyMap<string, string>[]): ReadonlyMap<string, string>` to `transportCargoLoss.ts` and use it.
   - `meleeInterceptReadyFinalize.ts`, one call. `meleeTransportLosses` takes `.cargo`. Keep its map for Phase 6.

4. **Thread the map through to finalize.**
   - `FinalizeReadyAfterMeleeArgs` gains `readonly transportCarrierIdByCargoId: ReadonlyMap<string, string>`, with a full comment.
   - `MeleeInterceptReadyPauseSnapshot` gains the same field. The snapshot is held in memory (`let pendingMeleeIntercept`), so a `Map` is safe.
   - The pipeline sets the field in the snapshot it passes to `setMeleeInterceptPendingSnapshot`, and in its direct `finalizeReadyTurnAfterMelee({…})` call.
   - `meleeInterceptStrategicResolve.ts` passes `pending.transportCarrierIdByCargoId`.
   - Search for `finalizeReadyTurnAfterMelee(` and expect exactly these two callers.

5. **`airDropResolution.ts`:**
   - Replace the shot-down call to `applyTransportLossForRemovedNavalUnits` with `applyTransportLossForRemovedCarriers`.
   - Copy its entries into a local `Map` named `carrierIdByCargoId`.
   - `AirDropPhaseResult` gains `readonly carrierIdByCargoId: ReadonlyMap<string, string>`, with a full comment. Return it.
   - Search for `AirDropPhaseResult` and for every object literal of that type, such as empty results and test fixtures, and add `carrierIdByCargoId: new Map()`.

### Tests

- **`src/main/gameActions/sealift.test.ts`.** Find the existing case that sinks a loaded carrier through `applyTransportLossForRemovedNavalUnits` or `applyTransportOutcomeForRemovedStrategicUnits`. Add a sibling case: `applyTransportLossForRemovedCarriers` on the same setup returns the same cargo ids, and `carrierIdByCargoId.get(cargoId)` is the carrier id. If no such case exists, build the setup the way the nearest transport test in that file seeds `unit_transport_assignments`.
- **`src/main/gameActions/airDropResolution.test.ts`.** Find the case where the carrier is shot down. Assert that `carrierIdByCargoId` maps the dropped infantry's id to the carrier id. If no case shoots the carrier down, add one with the file's existing dice stub, forcing the anti-air hit.

### Verification

The Verification Bar. Every existing sealift, air-drop, and ready-turn test passes unchanged. Confirm with `wc -l` that `sealift.ts` did not grow and that `readyStrategicResolutionPipeline.ts` and `meleeInterceptReadyFinalize.ts` are at or under 600 lines.

**If verification fails:**
- A cycle means `transportCargoLoss.ts` imports `sealift.ts`. Move the shared import to where `sealift.ts` gets it.
- A deep-equal failure in a ready-turn test means a cargo row gained a field. Cargo rows must keep exactly the old fields.

---

## Phase 5 — Attribution Core

A pure step that adds attribution to a built `TurnLossSummary` from a context. Nothing calls it yet.

**Adds:**
- `src/main/lossAttribution/lossAttributionCore.ts`
- `src/main/lossAttribution/lossAttributionCore.test.ts`

**Edits:** none.

### Contract

```ts
export interface LossUnitFact { readonly ownerId: string; readonly unitType: string }

export interface LossAttributionFallback {
  readonly responsibleOwnerIds: readonly string[] | null;
  readonly killerIds: readonly string[];
}

export interface LossAttributionContext {
  readonly unitFacts: ReadonlyMap<string, LossUnitFact>;              // fight-time owner and type of any unit id
  readonly killerIdsByCause: Readonly<Partial<Record<keyof PlayerLossSummary, ReadonlyMap<string, readonly string[]>>>>;
  readonly lossH3ByVictimId: ReadonlyMap<string, string>;
  readonly carrierIdByCargoId: ReadonlyMap<string, string>;
  readonly fallbackByVictimId: ReadonlyMap<string, LossAttributionFallback>;
}

export function attributeTurnLosses(summary: TurnLossSummary, context: LossAttributionContext): TurnLossSummary;
export function killerIdsByVictim(edges: readonly { victimId: string; killerIds?: readonly string[] }[] | undefined): ReadonlyMap<string, readonly string[]>;
```

- `attributeTurnLosses` logs `logDebug('lossAttributionCore attributeTurnLosses', { ownerCount, unitCount, attributedCount })`. It returns a new summary. It never mutates the input.
- `killerIdsByVictim` is shared by both mode builders. It keeps the first edge seen for each victim. It logs `logTrace`.

### Rules

Put them in this order inside a non-exported `attributionFor(victimId, ownerId, cause)`.

1. **Edge killers.** `context.killerIdsByCause[cause]?.get(victimId)`, filtered to ids whose `unitFacts` entry exists, whose owner is not `ownerId`, and whose type passes `isBuildUnitType`. When at least one remains:
   - `responsibleOwnerIds` is their distinct owners, in first-seen order. The formatter sorts them.
   - `killerUnits` is the remaining ids with their types.
2. **Cargo.** Otherwise, when `carrierIdByCargoId` has the victim, find the carrier's owner and cause in the summary. Build a `victim id → { ownerId, cause }` index once at the start. Compute the carrier's attribution with these same rules, then copy its `responsibleOwnerIds` and `killerUnits`. Use the carrier's `lossH3Index` when the carrier's is non-null. Guard against a loop with a visited set. A carrier that is not in the summary falls through to rule 3.
3. **Fallback.** Otherwise, when `fallbackByVictimId` has the victim:
   - `responsibleOwnerIds` is the fallback's value, with `ownerId` removed. An empty result stays `[]`, and null stays null.
   - `killerUnits` is the fallback's `killerIds`, filtered as in rule 1.
4. **Nothing known.** Otherwise `responsibleOwnerIds` is `[]` when `cause === 'other'` and `null` for every other cause, and `killerUnits` is `[]`.

Every attribution has `ownerId` (the bucket key) and `lossH3Index` (`lossH3ByVictimId.get(victimId) ?? null`, unless rule 2 replaced it). A unit with no `unitId` (an old row) is copied without attribution. `killerUnits` is de-duplicated by `unitId`.

### Tests (`lossAttributionCore.test.ts`)

Build summaries by hand.

- **Edge killers.** A ranged victim `a1-i1` (owner `opponent`) has killers `h1-a1` (human armor) and `a1-a9` (opponent's own unit). `responsibleOwnerIds` is `['human']`, and `killerUnits` has only `h1-a1`.
- **Mixed owners.** A return-fire victim has killers of `human` and `opponent2`, and both owners are listed.
- **Cargo.** An `other` victim `a1-i2`, mapped to carrier `a1-n1`, which is a ranged victim killed by `h1-a1`. The cargo gets `['human']`, the carrier's killer, and the carrier's hex.
- **Fallback.** A fallback with `null` gives `null`. A fallback `['opponent', 'human']` for an `opponent` victim gives `['human']`.
- **Nothing known.** `other` with no data gives `[]`. `melee` with no data gives `null`.
- **Unknown killer.** A killer id missing from `unitFacts` is dropped, and the rule falls through to fallback.
- **Purity.** The input summary deep-equals a copy taken before the call.
- **Old row.** A unit without `unitId` has no `attribution`.

### Verification

The Verification Bar.

---

## Phase 6 — Strategic Attribution

A strategic turn's notes store who was responsible. Strategic air-drop losses reach the notes.

**Adds:**
- `src/main/lossAttribution/strategicLossAttribution.ts`
- `src/main/lossAttribution/strategicLossAttribution.test.ts`
- `src/main/gameActions/strategicLossNoteCapture.ts`
- `src/main/gameActions/captureTurnLossNote.test.ts`

**Edits:**
- `src/main/gameActions/captureTurnLossNote.ts`
- `src/main/gameActions/meleeInterceptReadyFinalize.ts`

### Steps

1. **`captureTurnLossNote.ts`.** `CaptureTurnLossNoteArgs` gains an optional field, `readonly attribution?: LossAttributionContext`. Its comment says that when it is set, each seat's summary goes through `attributeTurnLosses` before it is split and serialized, and that without it rows are stored as before. In the per-seat loop:

   ```ts
   const built = buildTurnLossSummary({ ...lossArgs, perspectivePlayerId: seatId });
   const summary = args.attribution ? attributeTurnLosses(built, args.attribution) : built;
   ```

   Add `attributed: args.attribution !== undefined` to the existing `logDebug`.

2. **`strategicLossAttribution.ts`** exports `buildStrategicLossAttributionContext(input: StrategicLossAttributionInput): LossAttributionContext`. It is pure: no database access. It logs `logDebug` with counts.

   The input object has these fields, each with a full comment:
   - `kills`, `killsByDirectFire`, `killsByReturnFire`.
   - `removedUnits`: every snapshot passed to capture.
   - `combatUnitsBefore` and `combatUnitsAfter`: `CombatUnit[]` as finalize holds them.
   - `airStrikeMoves`: `airStrikeResult.strikeMoves`.
   - `airStrikeVictimIds`: the ids in `airStrikeResult.removedUnits`.
   - `airDropMoves`: `airDropResult.moves`.
   - `missileLaunches`: `missileLaunchResult.launches`.
   - `airStrikeInfrastructureEvents` and `missileInfrastructureEvents`.
   - `controlTransitions`.
   - `baseLossUnitIds`: the ids in `baseLossRemoved`.
   - `controllerBeforeControlByHex: ReadonlyMap<string, string | null>`.
   - `carrierIdByCargoId`.

   Read the real field names from `AirStrikeAnimationMove`, `AirDropAnimationMove`, `MissileLaunchRecord` (`src/shared/ipc/missileTypes.ts`), `InfrastructureDestroyedEvent` (`h3Index`, `targetType`), and the type `resolveStrategicControlAfterCombatAndMovement` returns (`h3Index`, `fromControllerPlayerId`, `toControllerPlayerId`).

   Build the context like this:
   - **`unitFacts`.** Insert in this order, with later entries overwriting earlier ones:
     1. `combatUnitsBefore`
     2. `combatUnitsAfter`
     3. each strike move (`unitId` → `{ ownerId: player, unitType }`)
     4. each drop move (`unitId` → `{ ownerId: player, unitType: 'air' }`)
     5. each launch (`unitId` → `{ ownerId: player, unitType: 'missile' }`)
     6. `removedUnits`
   - **`killerIdsByCause`.**
     - `ranged`: `killerIdsByVictim(killsByDirectFire)`.
     - `returnFire`: `killerIdsByVictim(killsByReturnFire)`.
     - `melee`: `killerIdsByVictim(kills)`.
     - No `airStrike` entry, because strategic resolution records no strike edges.
   - **`lossH3ByVictimId`.** Each removed snapshot's `h3Index`. Then each drop move with `returnsToBase === false` sets its `unitId` to its `targetH3Index`.
   - **`carrierIdByCargoId`.** The input map.
   - **`fallbackByVictimId`.** The first rule that matches wins, in this order:
     1. **Missile.** For each launch, each id in `destroyedAirUnitIds` gets `{ responsibleOwnerIds: [launch.player], killerIds: [launch.unitId] }`.
     2. **Lost striker or drop carrier.** Each strike move and each drop move with `returnsToBase === false` gets `hexDefenders(move.targetH3Index, ownerOf(move.unitId))`, with `killerIds: []`.
     3. **Air-strike victim.** Each id in `airStrikeVictimIds` gets the strike moves whose `targetH3Index` equals the victim's loss hex and whose `player` is not the victim's owner. `responsibleOwnerIds` is their distinct players, and `killerIds` is their `unitId`s. When no move matches, it gets `responsibleOwnerIds: null`.
     4. **Invalid base.** Each id in `baseLossUnitIds` gets `baseLossCause(hex, owner)`.

   **`hexDefenders(hex, victimOwner)`:**
   - First, the distinct owners of `combatUnitsBefore` units on `hex` that are not `victimOwner`.
   - When there are none, `[controller]` when `controllerBeforeControlByHex.get(hex)` is non-null and not `victimOwner`.
   - Otherwise `null`.

   **`baseLossCause(hex, victimOwner)`:**
   - A transition on `hex` whose `toControllerPlayerId` is non-null and not `victimOwner` gives `[toControllerPlayerId]`, with no killers.
   - Otherwise, collect the strike moves targeting `hex` when an airport event on `hex` is in `airStrikeInfrastructureEvents`, and the launches whose `targetH3Index` is `hex` when an airport event on `hex` is in `missileInfrastructureEvents`. Keep only those whose player is not `victimOwner`. `responsibleOwnerIds` is their players, and `killerIds` is their ids.
   - When nothing matches, `[]`: no side caused it.

3. **`strategicLossNoteCapture.ts`** exports two functions.
   - **`readLossHexControllers(args: { airStrikeMoves; airDropMoves }): ReadonlyMap<string, string | null>`.** It reads `getHexController` for each distinct target hex. Find the import path that other `src/main/gameActions` files use. It logs `logTrace`.
   - **`captureStrategicTurnLossNote(args: StrategicTurnLossNoteArgs): void`.** It logs `logDebug`. It takes one object with the finalize values it needs: `turnNumber`, `allKills`, `rangedResult`, `allRemovedUnits`, `missileLaunchResult`, `airStrikeResult`, `airDropResult`, `killLabelUnits`, `combatUnitsBefore`, `combatUnitsAfter`, `controlTransitions`, `baseLossRemoved`, `controllerBeforeControlByHex`, and `transportCarrierIdByCargoId`. Each field gets a comment. Then:
     - `dropCarrierIds` is the ids of `airDropResult.moves` with `returnsToBase === false`.
     - Split `airDropResult.removedUnits` into `dropCarriers` (ids in that set) and `dropCargo` (the rest).
     - Merge `transportCarrierIdByCargoId` with `airDropResult.carrierIdByCargoId`.
     - Call `captureTurnLossNoteFromResolution` with:
       - `scope: 'strategic'` and `battleId: ''`.
       - `kills: allKills`, `killsByDirectFire`, and `killsByReturnFire`, as today.
       - `removedUnits: [...allRemovedUnits, ...dropCargo]`.
       - `missileStrikeRemovedUnits: missileLaunchResult.removedUnits`.
       - `airStrikeRemovedUnits: [...airStrikeResult.removedUnits, ...dropCarriers]`.
       - `labelUnits: killLabelUnits`.
       - `airStrikeMoves: [...airStrikeResult.strikeMoves, ...airDropResult.moves]`.
       - `attribution: buildStrategicLossAttributionContext({ … })`.

     This files a shot-down drop carrier as `Return fire`, through the existing attacker-loss rule, and its cargo as `Other losses`, credited through the carrier.

4. **`meleeInterceptReadyFinalize.ts`:**
   - Directly before `const controlTransitions = resolveStrategicControlAfterCombatAndMovement(`, add:

     ```ts
     const controllerBeforeControlByHex = readLossHexControllers({ airStrikeMoves: airStrikeResult.strikeMoves, airDropMoves: airDropResult.moves });
     ```

   - Replace the `captureTurnLossNoteFromResolution({ … })` call with `captureStrategicTurnLossNote({ … })`. Pass `transportCarrierIdByCargoId`, merged with the melee map from Phase 4. Use `mergeCarrierMaps` when it exists.
   - Remove the now-unused import.
   - Keep the file at or under 600 lines.

### Tests

- **`strategicLossAttribution.test.ts`.** Pure. Build inputs by hand. For each case, run `attributeTurnLosses` on a hand-built summary and assert the resulting attribution.
  - **Melee killer that survived.** A `melee` victim `a1-i1` whose `kills` edge names `h1-a1`. `h1-a1` is only in `combatUnitsBefore`, and was later moved or converted. It is credited to `human` with one armor killer.
  - **Missile.** An air unit destroyed by an `opponent2` launch is credited to `opponent2`, with one `missile` killer.
  - **Two strikers on one hex.**
    - Strikers of `human` and `opponent2` both target hex `X`, and an `opponent` victim at `X` gets both.
    - A striker of the victim's own side on `X` is not counted.
    - With no matching move, the victim gets `null`.
  - **Lost striker.**
    - An `opponent` striker lost (`returnsToBase: false`) over `Y` gets the other owners of units on `Y`.
    - When no units are on `Y` and the controller before control was `human`, it gets `['human']`.
    - When the controller was the striker's own side, it gets `null`.
  - **Drop carrier.** A drop carrier is handled like a lost striker. Its cargo, through the carrier map, gets the same sides and the target hex.
  - **Invalid base.**
    - A base-loss victim on a hex that `human` took gets `['human']`.
    - On a hex whose airport an `opponent2` strike destroyed, it gets `['opponent2']` with one air killer.
    - With neither, it gets `[]`.
- **`captureTurnLossNote.test.ts`.** Use `withSeatedTempGameDb`, or whichever helper in `src/main/testSupport` seats at least one AI seat.
  - Capture a strategic ranged loss: victim `a1-i1` (owner `opponent`), a `killsByDirectFire` edge from `h1-a1`, and an `attribution` context from `buildStrategicLossAttributionContext`. Read the row with `getRecentTurnNotes`, parse its `own_loss_json`, and assert `responsibleOwnerIds` is `['human']`.
  - The same capture with no `attribution` stores a unit without an `attribution` key.

### Verification

The Verification Bar. Every existing ready-turn, melee-intercept, and air-drop test passes unchanged. Popup tests (`turnUpdateSummary.test.ts`, `consolidatedTurnUpdateToast.test.ts`, `turnLossSections.test.ts`) pass unchanged.

**If verification fails:**
- When a ready-turn test now sees more removed units, check that the drop losses were added only inside `captureStrategicTurnLossNote`, and never to `allRemovedUnits` or the ready result.
- When `meleeInterceptReadyFinalize.ts` passes 600 lines, move the controller read into the capture module's argument building, and record it.

---

## Phase 7 — Tactical Attribution

A battle beat's notes store who was responsible. A lost striker or drop carrier is placed at its target cell. A unit lost on a failed ferry is no longer filed as an air strike.

**Adds:**
- `src/main/lossAttribution/tacticalLossAttribution.ts`
- `src/main/lossAttribution/tacticalLossAttribution.test.ts`

**Edits:**
- `src/main/gameActions/tacticalBeatPlayback.ts`
- `src/main/gameActions/captureTurnLossNote.ts` (make `attribution` required)
- `src/main/gameActions/captureTurnLossNote.test.ts`

### Steps

1. **`tacticalLossAttribution.ts`** exports three functions.

   **`buildTacticalLossAttributionContext(input: TacticalLossAttributionInput): LossAttributionContext`.** It is pure and logs `logDebug`. Its input fields:
   - `killsByDirectFire`, `killsByReturnFire`, `killsByMelee`, `killsByAirStrike`.
   - `removedUnits`: the merged list capture receives.
   - `subUnitsBeforeFerry`: `outcome.battleAfterMovementBeforeFerry.subUnits`.
   - `subUnitsAfter`: `outcome.battle.subUnits`.
   - `airStrikeMoves`: `outcome.airStrikePlaybackMoves`.
   - `airDropMoves`: `outcome.airDropPlaybackMoves ?? []`.

   Build the context like this:
   - **`unitFacts`.** `subUnitsBeforeFerry`, then `subUnitsAfter`, then `removedUnits`, keyed by `id`, from `player` and `unitType`.
   - **`killerIdsByCause`.** `ranged`, `returnFire`, `melee`, and `airStrike` from the four edge lists, through `killerIdsByVictim`.
   - **`lossH3ByVictimId`.** Each removed unit's `h3Index`. Then each strike move and each drop move with `returnsToBase === false` sets its `unitId` to its `targetH3Index`, so a striker or carrier is placed where it was lost.
   - **`carrierIdByCargoId`.** Each sub-unit in `subUnitsBeforeFerry` whose `embarkedOnSubUnitId` is non-null and whose id is in `removedUnits` maps to that carrier.
   - **`fallbackByVictimId`.** Each strike move with `returnsToBase === false` whose unit has no edge in any of the four lists gets `{ responsibleOwnerIds: battleOpponents(ownerOf(unitId)), killerIds: [] }`. This covers infrastructure counter-fire. `battleOpponents(owner)` is the distinct owners in `unitFacts` other than `owner`, or `null` when there are none.

   A ferry-destroyed air unit and its cargo match no rule. The core's rule 4 gives them `[]` (no side responsible), because their cause is `other` after step 2.

   **`lossNoteAirStrikeRemovedUnits(args): RemovedUnitSnapshot[]`.** It replaces the inline filter in `captureTacticalBeatLossNote`. A unit is included when its id is in `killsByAirStrike`, or when it is a lost striker (an id of a strike move with `returnsToBase === false`) that is not a ranged victim. It logs `logTrace`.

   This removes the old rule that included every human air unit that was not a ranged victim. That rule filed a human air unit lost on a failed ferry under `Air strike`, and filed an AI striker lost to infrastructure counter-fire under `Other losses`. Both now follow the same rule for every owner.

2. **`tacticalBeatPlayback.ts`:**
   - Build `airStrikeRemovedUnits` with `lossNoteAirStrikeRemovedUnits`.
   - Pass `attribution: buildTacticalLossAttributionContext({ … })` to `captureTurnLossNoteFromResolution`.
   - Remove the `HUMAN_SEAT_ID` import if it is now unused.

3. **`captureTurnLossNote.ts`.** Make `attribution` required, and update its comment. Update the "no attribution" test from Phase 6. It now passes a context with every map empty and asserts that a ranged victim gets `responsibleOwnerIds: null`.

### Tests (`tacticalLossAttribution.test.ts`)

All pure.

- **Striker lost to anti-air.** A striker lost with a `killsByReturnFire` edge from defender `h1-t1-s1` is credited to `human`, and its `lossH3Index` is the move's `targetH3Index`, not its base cell.
- **Infrastructure counter-fire.** A striker lost with no edge, in a battle between `opponent` and `human`, gets `['human']`.
- **Failed ferry.** A human air unit lost on a failed ferry (not a strike move, no edge) is not returned by `lossNoteAirStrikeRemovedUnits`. After `buildTurnLossSummary` and `attributeTurnLosses`, it is in `other` with `[]`.
- **AI striker lost to counter-fire.** It is returned by `lossNoteAirStrikeRemovedUnits`, and the summary files it under `returnFire`.
- **Cargo.** Cargo with `embarkedOnSubUnitId` set to a carrier killed by ranged fire gets the carrier's killers. When the cargo also has its own copied edge, the edge wins, with the same result.
- **Shot-down drop carrier.** Its `lossH3Index` is the drop target.

### Verification

The Verification Bar. Tactical playback and beat tests pass unchanged, except for assertions about the note's air-strike classification of a ferry loss. Update any such assertion and record it.

---

## Phase 8 — Documents

**Adds:** none.

**Edits:**
- `doc/ai-commander-prompts/strategic-prompt.md`
- `doc/ai-commander-prompts/tactical-prompt.md`
- `doc/ai-commander-prompts/talk-prompt.md`
- `doc/ai-commander-prompts/information-decision-model.md`
- `doc/ai-commander-prompts/source-inventory.md`
- `doc/save-files.md`
- `doc/README.md`, only as its constants-table instructions require

### Steps

1. **`strategic-prompt.md`, under `#### \`## Recent Turn Notes\`` → Shape.**
   - Replace the loss sentence with a description of the legend paragraph (`RECENT_TURN_LOSS_LEGEND`).
   - Describe the sections: `Your Losses`, `Losses of {side code}`, `Losses of Neutral`, and `Losses of other sides` for rows recorded before attribution.
   - Give the group line shape and how groups are keyed.
   - Give the order rules and the cap: the newest turn in full, older turns at most `RECENT_TURN_LOSS_GROUP_LINES_MAX` (12) groups with this seat's own groups first, and the count line.
   - Keep "Loss lines name units by snapshot id, never by display name" and the five-entry rule (`LOSS_ENTRY_LIST_MAX`).
   - Name `buildRecentTurnLossLines`.
   - Add the limits from Known Gaps in product words: hex matching for strategic strikes, side-level killer lists, unrecorded anti-air shooters, and the removals that never reach the notes.
2. **`tactical-prompt.md`, `#### \`## Recent Turn Notes\`` paragraph.** The blocks now have the attributed loss lines described in the strategic document. Say that hex codes are the battle's own codes, and that a lost striker or drop carrier is placed at its target cell.
3. **`talk-prompt.md`, item 4.** Say that the recent-turns section includes the legend and the attributed loss lines, and that in a battle the builder registers the battle's hex codes itself (`tacticalEnclosingH3Index`).
4. **`information-decision-model.md`, the `RECENT_TURN_NOTES` row.** Its visibility cell says `own-side plus own losses`, but the builder has never filtered losses. The prompt builders are the authority, so fix the document. Change the description to strategies, plus losses on every side, with the responsible side, cause, hex, and killer types. Change the visibility cell to `full record (no fog filter)`.
5. **`source-inventory.md`, both `## Recent Turn Notes` rows.** Name `buildRecentTurnLossLines` beside `buildRecentTurnNotesSection` if the table names helpers. Otherwise leave the rows.
6. **`save-files.md`.** After the sentence about `turn_notes_history.message_text`, add one sentence. The loss JSON in `own_loss_json` and `enemy_loss_json` may carry an optional `attribution` object on each unit (`LossAttribution` in `src/shared/lossAttributionTypes.ts`). A row without it still loads and prints as unknown. It does not change `EXPECTED_USER_VERSION`.
7. **`doc/README.md`.** If its engine constants table lists `RECENT_TURN_NOTES_LIMIT` or `LOSS_ENTRY_LIST_MAX`, add `RECENT_TURN_LOSS_GROUP_LINES_MAX` following the instructions around that table. If it lists neither, do not edit the file, and say so in the Completion Log.
8. Search `doc/` for `Enemy Losses`, `formatPlayerLossInline`, `parsePlayerLossSummaryJson`, and `own-side plus own losses`. Update every hit outside the historical documents.
9. Search both example prompt documents (`example-strategic-prompt.md`, `example-tactical-prompt.md`) for a Recent Turn Notes block. If one exists, rewrite its loss lines in the new shape. If none exists, leave both files alone.

### Verification

`npm test` still passes, since documents do not affect it. Reread each edited section against the code, and confirm every symbol named exists.

---

## Phase 9 — Final Verification and Hand-Off

1. Run the Verification Bar one last time.
2. Search `src/` for `Enemy Losses`, `formatPlayerLossInline`, and `HUMAN_SEAT_ID && unit.unitType === 'air'`, and expect no match.
3. Run `wc -l` on every file this plan edited or added. List any file over 600 lines in the Completion Log. Any file over 1000 lines fails the plan.
4. Fill in the Completion Log.
5. Give the user this manual checklist:
   - [ ] Start a match with fog on and two AI seats. Run three turns with fighting, with `AGENT_WARS_LOG_FULL_PROMPTS=1`. An orders prompt's Recent Turn Notes shows the legend, `- Your Losses:` lines with `by h1` or `by a2`, hex codes, and `(by …)` counts.
   - [ ] A fight between two other sides shows under `- Losses of {code}:` in a third seat's notes.
   - [ ] A turn older than the newest with many fights ends in a `more loss groups` line, and the newest turn does not.
   - [ ] Enter a battle. The tactical prompt and the talk prompt show the attributed lines with battle hex codes.
   - [ ] Load a save made before this change. Older turns print `by unknown side` with no hex, and the match plays on.
   - [ ] The turn-update popup and the Reports tab look the same as before.

---

## Completion Log

Fill this in as you go.

| Phase | Result | Files outside the lists | Sketch differences | Notes |
| --- | --- | --- | --- | --- |
| 0 | | | | |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |
| 8 | | | | |
| 9 | | | | |
