# Hold Automatic Fire Against Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** Let an AI commander hold automatic fire against the sides it names. Today a unit with a legal shot and no attack order fires at the nearest enemy, so a commander that promises to hold fire cannot keep the promise by ordering nothing. The orders reply gains one optional field, `holdAutomaticFireAgainst`: the commander's units do not fire on their own at a side in that list. The version becomes **3.7.1**.

The capability has five parts:

1. **A stored list per commander.** Each AI seat keeps a list of other sides. It lasts between consults, across turns and battles, and across a save and load.
2. **The engine obeys the list.** When the engine chooses a target on its own, it never chooses a unit of a listed side. Orders the commander gives, return fire, and melee are unchanged.
3. **The reply sets the list.** `holdAutomaticFireAgainst` is offered on every orders consult, on the world map and in a battle.
4. **The commander is told.** The orders contract explains automatic fire and the field. The briefing shows a list that is not empty and flags a listed side that attacked.
5. **Each change is recorded.** A change to a list writes one match event. There is no new screen.

**Shape:**
- Phase 0 records a baseline.
- Phase 1 makes room in three large files by moving code, with no behavior change.
- Phase 2 adds the stored list (part 1).
- Phase 3 makes the engine obey the list (part 2).
- Phase 4 adds the reply field, its parser, its apply step, and the event (parts 3 and 5, and the contract half of part 4).
- Phase 5 adds the briefing text and corrects two 3.7.0 sentences (the rest of part 4).
- Phase 6 updates the docs, the release notes, and the version, runs the final checks, and hands off.

Phase 1 depends on nothing. Phase 2 depends on nothing. Phase 3 needs Phases 1 and 2, and its tests set the list by calling the Phase 2 writer. Phase 4 needs Phases 1 to 3. Phase 5 needs Phases 2 and 4. Each phase is verified by its own tests.

**Tech:** TypeScript (Electron main, renderer, and shared modules), `better-sqlite3`, `node:test`, ESLint with the local `orienting-comments` and `seat-id-literals` rules, `scripts/check-circular-deps.cjs`.

**Shell:** Windows PowerShell. Working directory `F:\Projects\Personal\agent-wars-public`. Run one command at a time. Do not chain with `&&`. Search with `Get-ChildItem -Recurse src -Include *.ts | Select-String -Pattern '<text>' -SimpleMatch`.

---

## How to Use This Plan

- Run the phases in order, back to back. Do not pause between phases for review.
- **Targeted testing only.** Every phase ends with the Phase Check: static checks plus the tests that phase names. Never run `npm test`, `npm run ui:smoke`, or `npm run doc:shots`, and never run test files the phase does not name. The user runs the full test, review, and fix pass afterwards.
- **Stop only when a check fails** and you cannot fix it within the phase's rules. Then:
  1. revert that phase (see Backup and Revert);
  2. record the failure in the Defect Inventory;
  3. stop, and tell the user which phase failed and why.
- Never commit, push, stash, or run `git checkout`, `git restore`, `git reset`, `git mv`, `git rm`, or `git clean`. The user reviews every change.
- Read the whole phase before you edit anything. Each phase lists the files it **Edits** and the files it **Adds**.
  - Do not edit other files, with two exceptions: removing an import that lint reports unused in a listed file, and fixing a test that fails only because of a change the phase names.
  - Record every such file in the Completion Log.
- Find code by the quoted text or the symbol name, not by a line number.
- Keep each file's line endings as they are. The source files use CRLF.
- **Code blocks are sketches** unless marked **Exact**.
  - Write the real code from the file you just read. When a sketch and the file disagree, the file wins; record the difference in the Completion Log.
  - Text marked **Exact** is copied character for character, including punctuation and spacing.
  - In Exact text, `${name}` means the value of that variable or constant, interpolated in a template literal.
  - Exact text is prompt wording. Write it as a TypeScript string in the quoting style the file already uses, and escape an apostrophe or a double quote the way the lines around it do.

### Backup and Revert

Nothing is committed. Before each phase, copy every file the phase **edits** into a backup folder outside the repo. Set `$step` to the phase number and `$files` to that phase's **Edits** list.

```powershell
$step = '1'
$files = @('src/main/tools/standingOrdersGeneration.ts', 'src/main/tools/tempoRuleAttacks.ts')
$backup = Join-Path $env:TEMP "aw-371-hold-automatic-fire-against\step-$step"
foreach ($f in $files) {
  $dest = Join-Path $backup $f
  New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  Copy-Item $f $dest -Force
}
```

When a phase fixes a test file outside its list, copy that file into the same backup folder before you edit it, and add it to `$files`.

To revert a phase, copy the backups back, then delete every file the phase **added**:

```powershell
foreach ($f in $files) { Copy-Item (Join-Path $backup $f) $f -Force }
```

Phase 4 edits a file under `src/shared` and rebuilds `static/renderer.js`. To revert it, restore its files, delete its added files, then run `npm run build:renderer` once more.

---

## Verification

### Native module

Tests that open a database load `better-sqlite3` under Node, and `npm install` builds it for Electron. Phase 0 runs `npm run rebuild:native:node`. Phase 6 runs `npm run rebuild:native:electron` last, so the app starts again.

- **Native module lock.** If a rebuild fails with `EBUSY` on `better_sqlite3.node`:
  1. close any running Electron app;
  2. rename `node_modules/better-sqlite3/build/Release/better_sqlite3.node` to `better_sqlite3.node.locked`;
  3. run the rebuild again;
  4. delete the `.locked` file.

### Phase Check

Every phase from 1 to 6 ends with the Phase Check, run from the repo root:

```powershell
npm run build:main
npm run lint
npm run check:circular
```

- **New files.** When the phase adds a file under `src`, also run `npm run naming:check`. Phases 1 to 5 need it. A name it rejects is fixed by renaming the new file or symbol, never by editing the naming rules. Record a rename in the Completion Log and use the new name in every later phase.
- **Shared or renderer files.** When the phase edits or adds a file under `src/shared` or `src/renderer`, also run `npm run check:renderer-types` and then `npm run build:renderer`. Phase 4 needs both.
- **Tests.** Then run every test file the phase lists under **Tests to run**, and no others. All must pass.
  - Run a test under `src/main` with `node dist/main/<path>.test.js`.
  - Run a test under `src/shared` with `node dist/shared/<path>.test.js`.
- `check:circular` must print **no** cycle.
- A static check or a named test that already failed in Phase 0 is not yours to fix. A **new** failure is.
- Never refresh `scripts/renderer-typecheck-baseline.json`, `scripts/circular-deps-baseline.json`, or any other baseline file to make a check pass.
- **No test may call a real model.** Do not start the app.
- Record each Phase Check result in the Completion Log.

---

## Evidence From the Code

- **A unit fires without an order in three ways.**
  - A unit under a DEFEND standing order fires at the nearest enemy in range (`appendNearestLegalEngagement`, called from the `defend` branch of `generateOrdersForStandingOrders`).
  - A marching unit whose order has `engageEnRoute` fires at the nearest enemy in range (the `march` branch of the same function).
  - The tempo sweep gives one attack to every unit that can shoot and has none: `collectTempoRuleAttacks` on the world map and `collectTacticalTempoAttacks` in a battle.
- **The sweep runs twice.** `mergeCommanderAttackOrders` runs it when a reply is applied, so the stored plan already holds the automatic rows. `buildUnconsultedCommanderOrders` and `withTacticalTempoAttacks` run it again for a turn or beat with no consult.
- **The only switch today is `hold_fire`.** It is a standing order on one strategic unit, it cannot be given in a battle, and it stops that unit's fire at every side.
- **A commander is not consulted every turn or beat.** A flag in one reply would not cover the beats between consults, so the list is stored state, like the posture in `src/main/gameDb/postureMemory.ts`.
- **Version 3.7.0 counts shots but cannot tell them apart.** The battle briefing says "Attack shots are the ranged shots and air strikes a side ordered." Shots from the sweep are in the same count, so that sentence is wrong and a commander that orders nothing is still shown as firing.
- **A cut-short move is held when the unit can shoot.** `holdsShooterOnClampedMove` drops a shortened battle move so the sub-unit keeps its shot. With a listed opponent the sub-unit would then neither move nor fire.

---

## Non-Goals

- **No enforcement of agreements.** The list is the commander's own setting. The game does not read an agreement to fill it, and it never changes a list because of an agreement, a message, or an attack.
- **No change to ordered fire.** A `ranged_attack` row, an `airStrikes` row, a missile launch, and a `pursue` standing order fire at the target the commander named, listed side or not.
- **No change to answers.** Return fire, anti-air fire, and infrastructure counter-fire are unchanged.
- **No change to melee or battles.** Units of two sides in one hex or cell still fight, and a battle still starts the same way.
- **No change to `hold_fire`.** It still stops every automatic shot of one unit. It is checked before the list.
- **No change to the human player's units.** Only an AI seat has a list. A human's own standing orders read an empty list.
- **No change to Neutral.** Neutral cannot be listed and has no list.
- **No new screen, control, tooltip, or IPC channel.** Nothing under `src/renderer` is edited.
- **No split of the shot count.** The battle briefing still gives one count per side. Phase 5 corrects the sentence that describes it. Counting ordered and automatic shots apart would need a marker on every attack row of a stored plan, and that plan type crosses to the renderer.
- **No save migration.** A save from 3.7.0 or earlier has no stored list. A missing row reads as empty lists.
- **No new consult.** A change to a list does not trigger a consult and is not a callback event.
- **Files not to edit:**

  | File | Lines | Why |
  | --- | --- | --- |
  | `src/main/openRouter/requestOrdersFlow.ts` | 655 | Over 600; its call to `buildOrdersMessagesBlock` does not change |
  | `src/main/openRouter/consultPromptParts.ts` | 602 | Over 600; prompt assembly does not change |
  | `src/main/openRouter/promptSpec/gameRuleText.ts` | 718 | Over 600; `buildHoldFireRule` does not change |
  | `src/main/openRouter/promptSpec/coachingTextStrategic.ts`, `coachingTextTactical.ts` | | The coaching bullets do not change |
  | `src/main/openRouter/commanderReadyGather.ts` | 226 | `collectTempoRuleAttacks` reads the list itself |
  | `src/main/openRouter/tacticalBriefingAssessments.ts` | | The "can shoot" flag in the briefing stays a fact about range |
  | `src/main/tacticalBattle/aiOnlyTacticalBeat.ts`, `src/shared/tacticalQuietBeat.ts` | | The quiet rule and the beat record do not change |
  | `src/main/tools/standingOrders.test.ts` | 981 | Over 600; new standing-order tests go in a new file |

- Do not edit anything under `.spec/completed/`, release notes of versions before 3.7.1, or the historical documents named in `AGENTS.md`.
- Do not "improve" code next to a phase's target. Make only the edits listed.

---

## Conventions

These come from `.cursor/rules/` and `AGENTS.md`.

- **Orienting comments (rule 04).** Every new or changed declaration has a JSDoc block:
  - a one-line summary;
  - `Purpose:` (or `Contract:` for types and fields);
  - `When to use:`, `Expected outcome:`, and `Exceptions:`.

  Update every comment whose behavior this plan changes. Afterwards, no comment may still say:
  - that the tempo sweep or a DEFEND order fires at the nearest enemy without naming the list;
  - that `hold_fire` is the only thing that stops automatic fire;
  - that attack shots are the shots a side ordered.

  No generic filler.
- **Logging (rule 02).** A new exported function under `src/main` logs with `logDebug` when called, or `logTrace` when it only reads or formats. A caught exception logs with `logError`. A module under `src/shared` never imports the logger. Never log a message's text.
- **No plan vocabulary (rule 12)** in code, comments, test names, or `doc/`. Do not write "Phase", "part 3", or "hold automatic fire plan" there.
- **Size limits (rule 09).**
  - Each edited or added source or test file must stay under 600 lines. Record every final line count in the Completion Log.
  - **A file already over 600 lines only shrinks.** Two such source files are edited: `src/main/openRouter/orderResponseParsing.ts` (780) and `src/main/openRouter/requestOrdersApplyParsed.ts` (776). Phase 1 shrinks each one first. After Phase 4, each must be shorter than its Phase 0 count.
  - `src/main/tools/standingOrdersGeneration.ts` is at 599 lines. Phase 1 shrinks it before Phase 3 adds to it.
  - **Tests over 600 lines.** `src/main/openRouter/promptContracts.test.ts` (809), `src/main/openRouter/promptSpec/envelopeJsonSchema.test.ts` (669), `src/main/openRouter/requestOrdersSeats.test.ts` (901), and `src/main/tools/standingOrders.test.ts` (981) are over 600 lines. If a test in one of them fails because of this plan, do not edit it in place. Delete that one test from the big file, add its corrected version to a new sibling test file with the same test name and the imports it needs, and record the move in the Completion Log. `src/main/openRouter/orderResponseParsing.test.ts` is at 594 lines: add no test to it.
  - **Long docs.** Phase 6 edits docs over 600 lines. Each edit there changes existing lines and adds no line.
- **Arguments (rule 10).** A function takes at most 6 parameters. Every new function in this plan takes one parameter object or at most three parameters, except `withTacticalTempoAttacks`, which goes from four to five.
- **Mutability (rule 13).** New fields are `readonly`. New collections are `readonly` arrays, `ReadonlySet`, or `ReadonlyMap`.
- **Names (rule 14).** New files and exported functions use camelCase. New types use PascalCase. Use the file and symbol names this plan gives.
- **Seat ids.** Production code never writes a seat id as a string literal. A new test file takes seat ids from `AI_SEAT_IDS` and `HUMAN_SEAT_ID` in `src/shared/seatIds.ts`. A test added to an existing file writes seat ids the way that file already does.
- **Reuse (rule 06).**
  - `readHoldAutomaticFireAgainstSeatIds` is the only reader of the stored list. No other code parses the `game_config` row.
  - `seatIdForSideCode` in `src/main/openRouter/talk/talkSideCodes.ts` is the only side-code resolver.
  - `playerIdCodeFor` in `src/shared/unitIds.ts` is the only seat-to-code formatter.
  - **Two names that must not be mixed up.** `hold_fire` is the existing standing order, and `holdFireUnitIdsForPlayer` and `holdFireParentUnitIds` belong to it. Every new symbol for the list contains `HoldAutomaticFireAgainst` or `holdAutomaticFireAgainst` in full. Never shorten a new name to `holdFire` or `holdFireAgainst`.
  - `appendNearestLegalEngagement` stays the one "nearest legal target" picker on the world map, and `pickClosestEnemyTacticalRangedTargetForSubUnit` the one in a battle.
- **Tests (rule 03).** Test contracts, not private helpers. Copy the structure of the test next to the one you add.
- **Docs.** Phase 6 updates `doc/`, `README.md`, and the release notes. Do not edit them earlier.

### Words Used in This Plan

| Word | Meaning |
| --- | --- |
| automatic fire | An attack the engine adds for a unit and aims itself: DEFEND fire, `engageEnRoute` fire, and the tempo sweep |
| the list, the automatic-fire list | One AI seat's stored set of other seats it holds fire against: its units do not fire at them automatically |
| listed side, spared side | A seat in the list. Engine code uses the name `sparedOwnerIds` for the set |
| `hold_fire` | The existing standing order on one unit. It is a different thing from `holdAutomaticFireAgainst` and is not changed |
| side code | The unit id prefix a prompt shows for a seat, such as the value `playerIdCodeFor` returns |

### Prompt Layout

| Text | Message | Where | Change |
| --- | --- | --- | --- |
| submit header | System (orders) | final JSON contract | gains `"holdAutomaticFireAgainst": [...]` as the last slot |
| field list | Situation (orders) | closing instruction, after `Then submit JSON with` | gains `"holdAutomaticFireAgainst"` as the last name, with no code change |
| field paragraph | System (orders) | final JSON contract, after the `agreementDecisions` paragraph | new, on every orders consult |
| JSON schema | request | `response_format` | gains one optional array of strings |
| battle truce bullets | System (battle orders) | Messages from other sides | one sentence replaced, one sentence added |
| battle truce bullets | System (battle talk) | `Agreements and last beat:` block | one sentence replaced |
| hold-automatic-fire bullet | System (talk, both theaters) | last bullet of the `Agreements:` or `Agreements and last beat:` block | new |
| hold-automatic-fire text | Situation (orders, both theaters) | Messages section, before its last sentence | new, only when the list is not empty |
| hold-automatic-fire text | Situation (talk, both theaters) | new `## Holding automatic fire`, before `## Your last plan` | new, only when the list is not empty |

No heading is renamed or removed. The example block and the repair schema do not show the new field. With an empty list, the only situation text that changes is the one field name in the closing instruction.

---

## Locked Decisions

1. **Field.** The orders reply may carry `holdAutomaticFireAgainst`, an array of strings. It is offered on every orders consult in both theaters, it is never required, and no gate turns it off.
   - **What the name means.** The field stops automatic fire at a side and nothing else. The word "automatic" is in the name so that no commander reads it as a ban on fire it orders: an attack the commander orders against a listed side still fires. Every text that explains the field says both halves.
2. **What a reply does to the list.**
   - A list of one or more side codes **replaces** the stored list.
   - `["none"]` **clears** the stored list.
   - A missing field, `null`, or an empty array **keeps** the stored list.
   - The empty array keeps the list on purpose. A model that follows a schema often sends an empty array for every optional list, and clearing on `[]` would then end a truce no commander chose to end. To make `[]` clear the list instead, change the one branch in `parseHoldAutomaticFireAgainstChoice` that Phase 4 marks, and the sentence in the field paragraph.
3. **Who can be listed.** Any other seat still in the match, human or AI. Neutral, the commander's own side, a side that is out, and an unknown code cannot be listed.
   - A code that cannot be listed is left out and reported as a drop reason. The other codes still apply.
   - When no code in the reply can be listed, the stored list is kept and one drop reason says so.
4. **What the list stops.** While side X is in a seat's list, the engine never picks a unit of X as the target of:
   - a DEFEND standing order's fire;
   - a march's `engageEnRoute` fire;
   - the tempo sweep on the world map;
   - the tempo sweep in a battle.

   A target hex that holds a unit of a side that is not listed can still be picked, even when a listed side's unit stands in the same hex.
5. **What the list does not stop.** Every order the commander gives, a `pursue` standing order's fire at its named unit, return fire, anti-air fire, counter-fire, melee, and the start of a battle.
6. **One list, both theaters.** The same stored list applies on the world map and in every battle. A battle reply and a strategic reply change the same list.
7. **The reply governs itself.** A list in a reply is stored before that reply's own attacks are merged, so the reply's own sweep already obeys it.
8. **Nothing removes a side but the commander and a knockout.** A listed side that attacks stays listed. The briefing flags it. A seat that is knocked out loses its own list and is removed from every other seat's list. A new match clears every list.
9. **A cut-short battle move.** `holdsShooterOnClampedMove` no longer holds a sub-unit whose only legal targets belong to listed sides, so a withdrawal that the engine shortens still moves.
10. **Briefing.** A list that is not empty is shown in the orders Messages section and in the talk situation. An empty list shows nothing.
    - With the talk stage off, a commander that has a list still gets a Messages section. It then holds the section's two standing sentences and the hold-automatic-fire text.
    - On the world map, a listed side is flagged when the commander's combat record has a `latestTurnAttackedYou` for it.
    - In a battle between two AI commanders, a listed opponent is flagged when `lastBeatActivity` counts one or more attack shots for it.
11. **Event.** A change to a list writes one `hold_automatic_fire_against_changed` match event, visible to that commander only, with no display text. A reply that leaves the list as it was writes nothing.
12. **Failure is quiet and safe.** A stored value that cannot be read is an empty list, which is today's behavior. A write that fails is a drop reason and never fails the consult.
13. **Release.** The version becomes 3.7.1. `doc/release-notes/v3.7.1.md` is new. Nothing is committed.

---

## Phase 0 — Baseline

### Steps

1. `npm run rebuild:native:node`
2. Run `npm run build:main`, `npm run lint`, `npm run check:circular`, `npm run naming:check`, and `npm run check:renderer-types`. Record each result.
3. Run each test file named under **Tests to run** in Phases 1 to 5 that already exists. Record any that fail now.
4. Confirm each anchor below appears exactly once in the file named:
   - `export function appendNearestLegalEngagement(` — `src/main/tools/standingOrdersGeneration.ts`
   - `appendNearestLegalEngagement(unit, playerId, row.unit_id, state, rangedAttacks, airStrikes);` — `src/main/tools/standingOrdersGeneration.ts`
   - `export type GenerateStandingOrdersOptions = {` — `src/main/tools/standingOrdersGeneration.ts`
   - `if (params.engageEnRoute === true && marchWeaponRange >= 1) {` — `src/main/tools/standingOrdersGeneration.ts`
   - `appendNearestLegalEngagement(unit, playerId, unit.id, state, rangedAttacks, airStrikes);` — `src/main/tools/tempoRuleAttacks.ts`
   - `holdFireParentUnitIds: holdFireUnitIdsForPlayer(args.seatId),` — `src/main/tools/tempoRuleAttacks.ts`
   - `const target = pickClosestEnemyTacticalRangedTargetForSubUnit(battle, sub.id);` — `src/main/tacticalBattle/tacticalRangedTargetResolve.ts`
   - `pickClosestEnemyTacticalRangedTargetForSubUnit(args.battle, args.subUnitId) !== undefined;` — `src/main/tacticalBattle/tacticalClampedMoveGuards.ts`
   - `withTacticalTempoAttacks(preBattle, taken, holdFireUnitIdsForPlayer(seatId), seatId),` — `src/main/gameActions/humanTacticalDraftCommit.ts`
   - `withTacticalTempoAttacks(preBattle, suppliedDraft, holdFireUnitIdsForPlayer(party), party)` — `src/main/gameActions/humanTacticalDraftCommit.ts`
   - `const dropReasons: string[] = [...(parsed.dropReasons ?? [])];` — `src/main/openRouter/requestOrdersApplyParsed.ts`
   - `if (!tacticalBattle && ordersEnabled && parsed.postureChoice) {` — `src/main/openRouter/requestOrdersApplyParsed.ts`
   - `logDebug('requestOrdersApplyParsed posture omitted'` — `src/main/openRouter/requestOrdersApplyParsed.ts`
   - `if (holdsShooterOnClampedMove({` — `src/main/openRouter/requestOrdersApplyParsed.ts`
   - `export type ParsedRequestOrders = NonNullable<ReturnType<typeof parseOrdersResponse>>;` — `src/main/openRouter/requestOrdersApplyParsed.ts`
   - `export function parseOrdersResponse(` — `src/main/openRouter/orderResponseParsing.ts`
   - `} | null {` — `src/main/openRouter/orderResponseParsing.ts`
   - `const rawPosture = obj.posture;` — `src/main/openRouter/orderResponseParsing.ts`
   - `const ALWAYS_PRESENT_FIELDS: ReadonlySet<string> = new Set(['strategy', 'orders', 'callbacks']);` — `src/main/openRouter/promptSpec/envelopeContract.ts`
   - `case 'agreementDecisions':` — `src/main/openRouter/promptSpec/envelopeJsonSchema.ts`
   - `agreementDecisions: '"agreementDecisions": [...]',` — `src/main/openRouter/promptContracts.ts`
   - `const agreementDecisionsParagraph = gates.includeAgreementDecisions === true ? SIDE_AGREEMENT_DECISIONS_PARAGRAPH : '';` — `src/main/openRouter/promptContracts.ts`
   - `'agreement_decision',` — `src/shared/matchRecording.ts`
   - `agreement_decision: 1,` — `src/shared/matchRecording.ts`
   - `deleteGameConfigRow({ run }, POSTURES_CONFIG_KEY);` — `src/main/gameDb/resetGame.ts`
   - `writePosture({ getOne: dbGetOne, run: dbRun }, seatId, null);` — `src/main/gameActions/knockoutConsequences.ts`
   - `holding fire while the other side keeps shooting loses your units.` — `src/main/openRouter/promptSpec/diplomacyRuleText.ts`
   - `if (nothingStored && contactText === null && truceText === null) return { text: null, shownMessageIds: [] };` — `src/main/openRouter/talk/ordersMessagesBlock.ts`
   - `if (truceText !== null) parts.push(truceText);` — `src/main/openRouter/talk/ordersMessagesBlock.ts`
   - `## Your last plan` — `src/main/openRouter/talk/talkPrompt.ts`
   - `const battleTruceBullets = BATTLE_TRUCE_TALK_BULLETS.map((line) => ` — `src/main/openRouter/talk/talkPrompt.ts`
   - `agreements: args.battle ? null : readSideAgreementViews(args.seatId, args.turnNumber),` — `src/main/openRouter/talk/talkPromptInput.ts`
   - `"version": "3.7.0",` — `package.json`
5. Confirm `Attack shots are the ranged shots and air strikes a side ordered.` appears exactly **twice** in `src/main/openRouter/promptSpec/diplomacyRuleText.ts`.
6. Confirm `StandingOrderGeneratedAirStrike` appears in exactly these two files under `src`: `src/main/tools/standingOrdersGeneration.ts` and `src/main/tools/tempoRuleAttacks.ts`. If another file imports it, that file keeps working through the re-export Phase 1 leaves behind; record it.
7. Confirm `'agreementDecisions',` is the last entry of `ENVELOPE_FIELD_ORDER` in `src/main/openRouter/promptSpec/envelopeContract.ts`.
8. Confirm that none of the files this plan **adds** exists yet, and that no file under `src` contains `holdAutomaticFireAgainst`, `HoldAutomaticFireAgainst`, `HOLD_AUTOMATIC_FIRE_AGAINST`, or `hold_automatic_fire_against`.
9. Record the line count of every file this plan edits.

### Verification

Every result, anchor, and count is recorded in the Phase 0 Inventory. If an anchor is missing or appears more than once, or a list in step 5, 6, or 7 differs, stop and record it.

---

## Phase 1 — Make Room in Three Large Files

Three moves. None changes behavior. Every test that passed in Phase 0 passes unchanged.

**Edits:**
- `src/main/tools/standingOrdersGeneration.ts`
- `src/main/tools/tempoRuleAttacks.ts`
- `src/main/openRouter/orderResponseParsing.ts`
- `src/main/operations/postureChoice.ts`
- `src/main/operations/postureChoice.test.ts`
- `src/main/openRouter/requestOrdersApplyParsed.ts`

**Adds:**
- `src/main/tools/nearestLegalEngagement.ts`
- `src/main/openRouter/orderResponseTypes.ts`

### Steps

1. **Move the target picker out of `standingOrdersGeneration.ts`.**
   - Create `src/main/tools/nearestLegalEngagement.ts`. Begin it with a file comment: the one place the engine picks "the nearest enemy this unit may legally shoot" on the world map, used by DEFEND fire and the tempo sweep.
   - Move two declarations into it, unchanged: the type `StandingOrderGeneratedAirStrike`, and the function `appendNearestLegalEngagement` together with the JSDoc block directly above the function. Keep the function's six positional parameters in this phase.
   - Give the moved type its own orienting comment: one air strike row the engine generated, with the striking unit, the target hex, and the target type.
   - Give the new file the imports those two declarations need. They are already at the top of `standingOrdersGeneration.ts`: `computeGridDistanceWithPathFallbackPure`, `GameStateSnapshot`, `AirStrikeTargetType`, `getRange`, `validateAirStrikeOrder`, and `isWithinAirStrikeGridRange`. Copy the import paths exactly. The new file must import nothing from `./standingOrdersGeneration`.
   - **The comment above the type today is in the wrong place.** In `standingOrdersGeneration.ts`, the JSDoc block whose first line starts with `Options for` and ends with `so tactical resolution can preview routes without advancing DB state.` sits above `StandingOrderGeneratedAirStrike`, but it describes `GenerateStandingOrdersOptions`. Leave that block where it is. Delete everything between its closing `*/` and the line `export type GenerateStandingOrdersOptions = {`. After the deletion the block sits directly above the type it describes.
   - In `standingOrdersGeneration.ts`, add:

     ```ts
     import { appendNearestLegalEngagement, type StandingOrderGeneratedAirStrike } from './nearestLegalEngagement';
     export type { StandingOrderGeneratedAirStrike } from './nearestLegalEngagement';
     ```

   - Remove every import that lint now reports unused in `standingOrdersGeneration.ts`. `getRange` and `computeGridDistanceWithPathFallbackPure` are still used there; do not remove them.
   - In `tempoRuleAttacks.ts`, import `appendNearestLegalEngagement` and `StandingOrderGeneratedAirStrike` from `./nearestLegalEngagement`, and keep importing `holdFireUnitIdsForPlayer` from `./standingOrdersGeneration`.
2. **Move the parser's return type out of `orderResponseParsing.ts`.**
   - `parseOrdersResponse` declares its return type inline. It starts at the `{` after `context: CoordinateContext` and `):`, and ends at the line `} | null {` found in Phase 0.
   - Create `src/main/openRouter/orderResponseTypes.ts` with a file comment and one exported type, `ParsedOrdersResponse`, whose body is that inline object type, moved with every field comment unchanged. Give the type an orienting comment: the normalized orders reply, the shape a non-null `parseOrdersResponse` call returns.
   - The function's signature becomes `): ParsedOrdersResponse | null {`.
   - Give the new file the type imports the fields need. Use `import type` only. `MemoryUpdateItem` stays where it is and is imported with `import type { MemoryUpdateItem } from './orderResponseParsing';`. A type-only import is erased at build time, so this does not create a cycle that `check:circular` counts.
   - In `orderResponseParsing.ts`, add `import type { ParsedOrdersResponse } from './orderResponseTypes';` and remove every import lint now reports unused.
   - Change nothing else. `ParsedRequestOrders` in `requestOrdersApplyParsed.ts` is derived from the function and needs no edit.
3. **Move the posture step out of `requestOrdersApplyParsed.ts`.**
   - In `src/main/operations/postureChoice.ts`, add one exported function below `applyPostureChoice`:

     ```ts
     export function applyReplyPosture(args: {
       readonly seatId: string;
       readonly posture: Posture | undefined;
       readonly turnNumber: number;
       readonly priorDropReasons: readonly string[];
     }): string[] {
       logTrace('postureChoice applyReplyPosture', { seatId: args.seatId, named: args.posture !== undefined });
       if (args.posture !== undefined) {
         return applyPostureChoice({ seatId: args.seatId, posture: args.posture, turnNumber: args.turnNumber }).dropReasons;
       }
       if (!args.priorDropReasons.some((reason) => reason.startsWith('posture dropped:'))) {
         logDebug('requestOrdersApplyParsed posture omitted', { seatId: args.seatId, turnNumber: args.turnNumber });
       }
       return [];
     }
     ```

     Keep the `posture omitted` log message text as it is, and import `logTrace` beside `logDebug`. Its orienting comment says: applies the posture a strategic reply named, or logs that the reply named none; returns the drop reasons to add; never throws.
   - In `requestOrdersApplyParsed.ts`, replace the whole `if (!tacticalBattle && ordersEnabled && parsed.postureChoice) { ... } else if ( ... ) { ... }` statement with:

     ```ts
     if (!tacticalBattle && ordersEnabled) {
       dropReasons.push(...applyReplyPosture({ seatId, posture: parsed.postureChoice, turnNumber: planState.turnNumber, priorDropReasons: dropReasons }));
     }
     ```

   - Change the import of `applyPostureChoice` in that file to `applyReplyPosture`.
   - The statement that follows, `if (!tacticalBattle && ordersEnabled) { writeOperationRefusal(...) }`, stays as it is and stays after the new statement.

### Tests

- **`postureChoice.test.ts`.** Add two tests of `applyReplyPosture`, built the way the file's existing tests are:
  - with a posture, it returns what `applyPostureChoice` returns for the same input, and the posture is stored;
  - with `posture: undefined`, it returns an empty array and stores nothing.
- No other test changes.

### Tests to run

- `node dist/main/tools/tempoRuleAttacks.test.js`
- `node dist/main/tools/standingOrders.test.js`
- `node dist/main/tools/standingOrdersDefendPost.test.js`
- `node dist/main/openRouter/commanderReadyGather.test.js`
- `node dist/main/openRouter/orderResponseParsing.test.js`
- `node dist/main/openRouter/applyParsedMemoryUpdates.test.js`
- `node dist/main/openRouter/assignOrderHexParams.test.js`
- `node dist/main/openRouter/missileLaunchOrderParsing.test.js`
- `node dist/main/openRouter/promptSpec/envelopeContract.test.js`
- `node dist/main/operations/postureChoice.test.js`
- `node dist/main/openRouter/requestOrdersSeats.test.js`

### Verification

- The Phase Check passes, with `naming:check`.
- `standingOrdersGeneration.ts` is at least 50 lines shorter than in Phase 0.
- `orderResponseParsing.ts` is at least 80 lines shorter than in Phase 0.
- `requestOrdersApplyParsed.ts` is at least 8 lines shorter than in Phase 0.
- `appendNearestLegalEngagement` is declared only in `nearestLegalEngagement.ts`.
- No test file other than `postureChoice.test.ts` was edited.

---

## Phase 2 — The Stored List

**Edits:**
- `src/main/gameDb/resetGame.ts`
- `src/main/gameActions/knockoutConsequences.ts`

**Adds:**
- `src/main/gameDb/holdAutomaticFireAgainstMemory.ts`
- `src/main/gameDb/holdAutomaticFireAgainstMemory.test.ts`

### Steps

1. **Add `holdAutomaticFireAgainstMemory.ts`.** Model it on `src/main/gameDb/postureMemory.ts`: one `game_config` row holds a JSON object from seat id to that seat's list. Read that file first and copy its structure, its comments' level of detail, and its error handling.

   ```ts
   export const HOLD_AUTOMATIC_FIRE_AGAINST_CONFIG_KEY = 'hold_automatic_fire_against';

   export function readHoldAutomaticFireAgainstSeatIds(
     seatId: string,
     ops: Pick<GameConfigKvDbOps, 'getOne'> = gameDbOps,
   ): ReadonlySet<string>;

   export function writeHoldAutomaticFireAgainstSeatIds(
     ops: Pick<GameConfigKvDbOps, 'getOne' | 'run'>,
     seatId: string,
     sparedSeatIds: readonly string[],
   ): void;

   export function removeSeatFromHoldAutomaticFireAgainst(
     ops: Pick<GameConfigKvDbOps, 'getOne' | 'run'>,
     seatId: string,
   ): void;
   ```

   - **Stored shape.** `{ "<seat id>": ["<seat id>", ...] }`. Keys are written in sorted order. Each list is written sorted, with no duplicate and without the owning seat's own id. A seat with an empty list has no key.
   - **A private reader of the whole row**, like `readPostures`: a missing row is an empty map; a value that is not JSON, or not an object, is logged with `logError` and is an empty map; an entry whose value is not an array is dropped with `logDebug`; an element that is not a non-empty string is dropped.
   - **`readHoldAutomaticFireAgainstSeatIds`** returns the seat's list as a set, or an empty set when the seat has no key. It accepts any owner id, so a call for the human or for Neutral returns an empty set. It **never throws**: it wraps its body in `try`/`catch`, logs with `logError`, and returns an empty set. The engine calls it while it builds orders, and an empty set is today's behavior. It logs with `logTrace`.
   - **`writeHoldAutomaticFireAgainstSeatIds`** replaces one seat's list and keeps the others. An empty `sparedSeatIds` removes the seat's key. It logs with `logDebug` (the seat and the count, never more) and lets a database error propagate.
   - **`removeSeatFromHoldAutomaticFireAgainst`** removes the seat's own key and removes the seat's id from every other seat's list, in one write. A list that becomes empty loses its key. When nothing changes it writes nothing.
   - **Imports.** `gameDbOps` from `./dbConnection`, `selectGameConfigValue` and `upsertGameConfigValue` from `./gameConfigRows`, the `GameConfigKvDbOps` type from `./gameConfigKv`, and the logger. Do not import `../gameDb`: `resetGame.ts` imports this module, and the barrel imports `resetGame.ts`.
   - If `gameDbOps` does not fit the parameter type, use `{ getOne: gameDbOps.getOne }` as the default. If that does not compile either, copy the `dbGetOneLazy` helper from `postureMemory.ts` with its comment, and record it in the Completion Log.
2. **`resetGame.ts`.** Import `HOLD_AUTOMATIC_FIRE_AGAINST_CONFIG_KEY` beside the import of `POSTURES_CONFIG_KEY`. Directly after the anchor line `deleteGameConfigRow({ run }, POSTURES_CONFIG_KEY);`, add `deleteGameConfigRow({ run }, HOLD_AUTOMATIC_FIRE_AGAINST_CONFIG_KEY);`. The file is at 578 lines; these are the only two lines added.
3. **`knockoutConsequences.ts`.** Import `removeSeatFromHoldAutomaticFireAgainst`. Directly after the anchor line `writePosture({ getOne: dbGetOne, run: dbRun }, seatId, null);`, add `removeSeatFromHoldAutomaticFireAgainst({ getOne: dbGetOne, run: dbRun }, seatId);`. In the orienting comment of the function that contains the line, add that the seat's list is removed and the seat is taken off every other seat's list.

### Tests

**Add `holdAutomaticFireAgainstMemory.test.ts`.** Copy the layout of `src/main/gameDb/postureMemory.test.ts`, including its `threeGroupMap` helper, its use of `withTempGameDb` and `withSeatedTempGameDb`, and the seat ids it uses for the knockout case. Tests:

- a list round-trips: write two seats, read each back as a set; the stored JSON has sorted keys and sorted lists;
- a write that contains the owning seat's own id and a duplicate stores neither;
- writing an empty list removes the key and leaves the other seat;
- a bad entry leaves the other seat: store `{ seatA: "x", seatB: [seatA] }` directly with `upsertGameConfigValue`; `seatA` reads empty and `seatB` reads `{seatA}`;
- a value that is not JSON reads as an empty set for every seat;
- a missing row reads as an empty set, and so does a reader whose `getOne` throws;
- `removeSeatFromHoldAutomaticFireAgainst` removes the seat's own list and takes the seat off another seat's list, and leaves a third seat's unrelated entry;
- a new match deletes the row (`resetGameForNewMatch`, as the posture test does);
- knocking a seat out (`applyKnockout`, as the posture test does) removes its list and takes it off the other seat's list.

### Tests to run

- `node dist/main/gameDb/holdAutomaticFireAgainstMemory.test.js`
- `node dist/main/gameDb/postureMemory.test.js`
- `node dist/main/gameActions/knockoutConsequences.test.js`
- `node dist/main/gameDb.test.js`
- `node dist/main/saveGame/saveLoadPipeline.test.js`

### Verification

- The Phase Check passes, with `naming:check`. `check:circular` prints no cycle.
- `HOLD_AUTOMATIC_FIRE_AGAINST_CONFIG_KEY` is written as a string in exactly one place.
- Nothing calls `readHoldAutomaticFireAgainstSeatIds` yet outside the new test, so no behavior has changed.

---

## Phase 3 — The Engine Obeys the List

After this phase a list changes what the engine fires at. No reply can set a list yet, so only a test can.

**Edits:**
- `src/main/tools/nearestLegalEngagement.ts`
- `src/main/tools/standingOrdersGeneration.ts`
- `src/main/tools/tempoRuleAttacks.ts`
- `src/main/tools/tempoRuleAttacks.test.ts`
- `src/main/tacticalBattle/tacticalRangedTargetResolve.ts`
- `src/main/tacticalBattle/tacticalRangedTargetResolve.test.ts`
- `src/main/tacticalBattle/tacticalClampedMoveGuards.ts`
- `src/main/tacticalBattle/tacticalClampedMoveGuards.test.ts`
- `src/main/gameActions/humanTacticalDraftCommit.ts`
- `src/main/openRouter/requestOrdersApplyParsed.ts`

**Adds:**
- `src/main/tools/standingOrdersHoldAutomaticFireAgainst.test.ts`

The name for the set is `sparedOwnerIds` everywhere. It is always the result of `readHoldAutomaticFireAgainstSeatIds(<the firing side's id>)`.

### Steps

1. **`nearestLegalEngagement.ts`: one parameter object, with the set.** The function would have seven values, so it takes one object.

   ```ts
   export type NearestLegalEngagementArgs = {
     readonly unit: GameStateSnapshot['units'][number];
     readonly playerId: string;
     readonly unitId: string;
     readonly state: GameStateSnapshot;
     readonly sparedOwnerIds: ReadonlySet<string>;
     readonly rangedAttacks: { unitId: string; targetH3Index: string }[];
     readonly airStrikes: StandingOrderGeneratedAirStrike[];
   };

   export function appendNearestLegalEngagement(args: NearestLegalEngagementArgs): void;
   ```

   - The one behavior change is the first line of the body:

     ```ts
     const enemies = state.units.filter((u) => u.player !== playerId && !sparedOwnerIds.has(u.player));
     ```

   - Everything after that line is unchanged. A hex that holds a unit of a side that is not spared is still a candidate.
   - Give every field of the type a comment. `sparedOwnerIds`: owners whose units are never chosen as a target here; pass the result of `readHoldAutomaticFireAgainstSeatIds`. `rangedAttacks` and `airStrikes`: the arrays this call appends to.
   - Update the function's orienting comment: units of a spared owner are never chosen, and a unit with only spared owners in range produces nothing.
2. **`standingOrdersGeneration.ts`.**
   - Import `readHoldAutomaticFireAgainstSeatIds` from `../gameDb/holdAutomaticFireAgainstMemory`.
   - In `generateOrdersForStandingOrders`, directly after the three lines that declare `movementOrders`, `rangedAttacks`, and `airStrikes`, add `const sparedOwnerIds = readHoldAutomaticFireAgainstSeatIds(playerId);`.
   - Change the DEFEND call (the anchor line from Phase 0) to the object form: `appendNearestLegalEngagement({ unit, playerId, unitId: row.unit_id, state, sparedOwnerIds, rangedAttacks, airStrikes });`.
   - In the `engageEnRoute` loop, directly after `if (e.player === playerId) continue;`, add `if (sparedOwnerIds.has(e.player)) continue;`.
   - Do not touch the `pursue` branch: it fires at the unit the commander named. Do not touch the `patrol` branch: it only marks contact.
   - In the function's orienting comment, add one sentence: DEFEND fire and `engageEnRoute` fire never choose a unit of a side in the owner's `holdAutomaticFireAgainst` list.
3. **`tempoRuleAttacks.ts`.**
   - Import `readHoldAutomaticFireAgainstSeatIds`.
   - In `collectTempoRuleAttacks`, read `const sparedOwnerIds = readHoldAutomaticFireAgainstSeatIds(playerId);` beside `holdFireUnitIds`, and change the call to the object form: `appendNearestLegalEngagement({ unit, playerId, unitId: unit.id, state, sparedOwnerIds, rangedAttacks, airStrikes });`. Add `sparedOwnerCount: sparedOwnerIds.size` to the result log.
   - In `mergeCommanderAttackOrders`, add `sparedOwnerIds: readHoldAutomaticFireAgainstSeatIds(args.seatId),` to the `collectTacticalTempoAttacks` call, after the `holdFireParentUnitIds` anchor line.
   - Update three comments: the file comment, `collectTempoRuleAttacks`, and `mergeCommanderAttackOrders`. Each says the sweep never chooses a unit of a side in the seat's `holdAutomaticFireAgainst` list, and that an attack the model ordered against such a side is kept.
4. **`tacticalRangedTargetResolve.ts`.**
   - `pickClosestEnemyTacticalRangedTargetForSubUnit` gains an optional third parameter, `sparedOwnerIds?: ReadonlySet<string>`. The `enemyHexes` filter becomes:

     ```ts
     battle.subUnits.some((s) => s.h3Index === h3 && s.player !== attacker.player && sparedOwnerIds?.has(s.player) !== true)
     ```

     With the parameter omitted the function behaves exactly as today. `resolveTacticalRangedTargetForSubUnit` and `tacticalBriefingAssessments.ts` keep calling it with two arguments.
   - `TacticalTempoAttackArgs` gains a **required** field `sparedOwnerIds: ReadonlySet<string>`, with a comment like the one on `holdFireParentUnitIds`. `collectTacticalTempoAttacks` passes it as the third argument at the anchor line and adds `sparedOwnerCount` to its first log line.
   - `withTacticalTempoAttacks` gains a **required** fifth parameter `sparedOwnerIds: ReadonlySet<string>` and passes it on.
   - Update the orienting comments of all three functions and of the args type.
5. **`tacticalClampedMoveGuards.ts`.** `holdsShooterOnClampedMove` gains an optional argument `sparedOwnerIds?: ReadonlySet<string>` and passes it as the third argument of `pickClosestEnemyTacticalRangedTargetForSubUnit`. Update its comment: a sub-unit whose only legal targets belong to spared owners is not held, because the engine will not fire it at them.
6. **`humanTacticalDraftCommit.ts`.** Import `readHoldAutomaticFireAgainstSeatIds`. At the two anchor lines, add the fifth argument: `readHoldAutomaticFireAgainstSeatIds(seatId)` in `sanitizedAiSeatDraft`, and `readHoldAutomaticFireAgainstSeatIds(party)` in the other call. `party` may be Neutral there, and the reader returns an empty set for it.
7. **`requestOrdersApplyParsed.ts`.** Import `readHoldAutomaticFireAgainstSeatIds`. In the `holdsShooterOnClampedMove({ ... })` call, add one property line: `sparedOwnerIds: readHoldAutomaticFireAgainstSeatIds(seatId),`. These are the only two lines added to this file in this phase.
8. Build. The compiler now reports every caller that does not pass a required value. Each one must be in the list above or in a test file this phase edits. If any other production file fails to compile, stop and record it.

### Tests

Set a list in a test by calling `writeHoldAutomaticFireAgainstSeatIds({ getOne: dbGetOne, run: dbRun }, <firing seat>, [<spared seat>])` inside the open temp database.

- **`tempoRuleAttacks.test.ts`.** Use the file's `stageAdjacentEnemy('armor')` helper, which plants a human unit beside an AI armor unit. Add two cases and call them from `run()`:
  - with the human's seat in the armor owner's list, `collectTempoRuleAttacks` returns no attack for the shooter; after writing an empty list, it returns one;
  - with the human's seat in the list, `mergeCommanderAttackOrders` with a `modelRanged` row for the shooter at the planted hex keeps exactly that one row.
- **Add `standingOrdersHoldAutomaticFireAgainst.test.ts`.** It uses `node:test`. Do not edit `standingOrders.test.ts`; copy setup from it.
  - DEFEND: copy the setup of the test there that inserts a `'defend'` standing order for a unit with an enemy in range. Call `generateOrdersForStandingOrders` with `{ mutateProgress: false }`. With the enemy's owner in the list there is no ranged attack and no air strike for the unit; with an empty list there is one.
  - `engageEnRoute`: copy the setup of the test there whose comment says a naval unit marching with `engageEnRoute` fires on an enemy two hexes away. With the enemy's owner in the list the march produces no ranged attack and still produces its movement order; with an empty list it fires.
  - Skip a case, with the same skip message style, when the seed cannot supply the units.
- **`tacticalRangedTargetResolve.test.ts`.**
  - Add `sparedOwnerIds: new Set<string>()` to the two existing `collectTacticalTempoAttacks` calls and a fifth argument `new Set<string>()` to the two existing `withTacticalTempoAttacks` calls. Their assertions do not change.
  - Add one test with the battle of the existing test `collectTacticalTempoAttacks emits ranged for non-air and air strike for air`: with the enemy's owner in `sparedOwnerIds`, `collectTacticalTempoAttacks` returns no row, `withTacticalTempoAttacks` returns the draft it was given (and `undefined` when given none), and `pickClosestEnemyTacticalRangedTargetForSubUnit` with that set returns `undefined` while the two-argument call still returns the enemy cell.
- **`tacticalClampedMoveGuards.test.ts`.** Add one test from the setup of the existing test in which the guard holds: with the enemy's owner in `sparedOwnerIds` the function returns false.

### Tests to run

- `node dist/main/tools/tempoRuleAttacks.test.js`
- `node dist/main/tools/standingOrdersHoldAutomaticFireAgainst.test.js`
- `node dist/main/tools/standingOrders.test.js`
- `node dist/main/tools/standingOrdersDefendPost.test.js`
- `node dist/main/tacticalBattle/tacticalRangedTargetResolve.test.js`
- `node dist/main/tacticalBattle/tacticalClampedMoveGuards.test.js`
- `node dist/main/tacticalBattle/tacticalPartiesSeats.test.js`
- `node dist/main/openRouter/commanderReadyGather.test.js`
- `node dist/main/openRouter/requestOrdersSeats.test.js`
- `node dist/main/openRouter/tacticalPromptSectionParity.test.js`
- `node dist/main/gameDb/holdAutomaticFireAgainstMemory.test.js`

### Verification

- The Phase Check passes, with `naming:check`. `check:circular` prints no cycle.
- With no stored list, every test that passed in Phase 0 passes with unchanged assertions.
- `readHoldAutomaticFireAgainstSeatIds` is called in exactly four production files: `standingOrdersGeneration.ts`, `tempoRuleAttacks.ts`, `humanTacticalDraftCommit.ts`, and `requestOrdersApplyParsed.ts`.
- `standingOrdersGeneration.ts` is under 600 lines.

---

## Phase 4 — The Reply Field

**Edits:**
- `src/main/openRouter/promptSpec/envelopeContract.ts`
- `src/main/openRouter/promptSpec/envelopeContract.test.ts`
- `src/main/openRouter/promptSpec/envelopeJsonSchema.ts`
- `src/main/openRouter/promptContracts.ts`
- `src/main/openRouter/orderResponseTypes.ts`
- `src/main/openRouter/orderResponseParsing.ts`
- `src/main/openRouter/requestOrdersApplyParsed.ts`
- `src/shared/matchRecording.ts`

**Adds:**
- `src/main/openRouter/promptSpec/holdAutomaticFireAgainstRuleText.ts`
- `src/main/openRouter/promptSpec/holdAutomaticFireAgainstRuleText.test.ts`
- `src/main/openRouter/holdAutomaticFireAgainstParsing.ts`
- `src/main/openRouter/holdAutomaticFireAgainstParsing.test.ts`
- `src/main/openRouter/holdAutomaticFireAgainstApply.ts`
- `src/main/openRouter/holdAutomaticFireAgainstApply.test.ts`
- `src/main/recorder/holdAutomaticFireAgainstRecordingEvents.ts`
- `src/main/openRouter/orderResponseHoldAutomaticFireAgainst.test.ts`
- `src/main/openRouter/promptContractsHoldAutomaticFireAgainst.test.ts`
- `src/main/openRouter/promptSpec/envelopeJsonSchemaHoldAutomaticFireAgainst.test.ts`

### Steps

1. **`holdAutomaticFireAgainstRuleText.ts`: the field paragraph.** One exported function. It only formats, so it logs with `logTrace`.

   ```ts
   export function buildHoldAutomaticFireAgainstParagraph(periodNoun: 'turn' | 'beat'): string;
   ```

   **Exact** (one paragraph, one line):

   ```text
   Optional "holdAutomaticFireAgainst": a list of side codes from the Sides table. Your units hold automatic fire against every side in this list. Automatic fire is this: a unit of yours that has a legal shot and no attack order from you fires on its own at the nearest enemy, also on a ${periodNoun} you are not consulted for. Against a listed side it does not. Only automatic fire stops: your units still return fire, they still fight units in the same hex or cell, and an attack you order against a listed side still fires. Against every other side, the nearest enemy is not always the best target, so keep ordering your own attacks. The list is stored and holds on the world map and in battles until you change it. A list of codes replaces the stored list. Send ["none"] to stop holding automatic fire against every side. Omit the field or send an empty list to keep the stored list. The Messages section shows the stored list when it is not empty. You cannot list Neutral or your own side.
   ```

2. **`envelopeContract.ts`.**
   - Add `'holdAutomaticFireAgainst',` as the last entry of `ENVELOPE_FIELD_ORDER`, after `'agreementDecisions',`.
   - Add `'holdAutomaticFireAgainst'` to the `ALWAYS_PRESENT_FIELDS` set, and add to its comment that the field is offered on every consult so a commander can set the list in either theater.
   - Do not add a gate to `EnvelopeGates`. Do not change `envelopeFieldsForGates` or `buildRepairSchemaText`: the first already returns always-present fields, and the second already leaves out a field it has no example for.
3. **`envelopeJsonSchema.ts`.** In `envelopeFieldSchema`, add a case before `default:`:

   ```ts
   case 'holdAutomaticFireAgainst':
     return { ...STRING_ARRAY_SCHEMA };
   ```

   Do not add the field to `required` in `buildOrdersEnvelopeResponseFormat`.
4. **`promptContracts.ts`**, in `buildFinalJsonContractInstruction`.
   - Add to `headerSlots`, after the `agreementDecisions` anchor line: `holdAutomaticFireAgainst: '"holdAutomaticFireAgainst": [...]',`.
   - After the `agreementDecisionsParagraph` anchor line, add `const holdAutomaticFireAgainstParagraph = buildHoldAutomaticFireAgainstParagraph(periodNoun);`. `periodNoun` is already declared above it in that function.
   - In the `paragraphs` array, add `holdAutomaticFireAgainstParagraph,` directly after `agreementDecisionsParagraph,`.
   - Do not change `getFinalJsonOrdersExampleBlock`. It has no value for the field, so the example does not show it.
5. **`holdAutomaticFireAgainstParsing.ts`: a pure parser.** It reads no database and resolves no code. It logs with `logTrace`.

   ```ts
   export type HoldAutomaticFireAgainstChoice =
     | { readonly kind: 'replace'; readonly sideCodes: readonly string[] }
     | { readonly kind: 'clear' };

   export const HOLD_AUTOMATIC_FIRE_AGAINST_CLEAR_TOKEN = 'none';

   export function parseHoldAutomaticFireAgainstChoice(raw: unknown): {
     readonly choice: HoldAutomaticFireAgainstChoice | undefined;
     readonly dropReasons: string[];
   };
   ```

   Rules, checked in this order:

   | Input | `choice` | Drop reason |
   | --- | --- | --- |
   | `undefined` or `null` | `undefined` | none |
   | not an array | `undefined` | `holdAutomaticFireAgainst dropped: expected a list of side codes.` |
   | an empty array | `undefined` | none |
   | an array with an entry that is not a string, or is empty after trimming | `undefined` | `holdAutomaticFireAgainst dropped: expected a list of side codes.` |
   | every entry, trimmed and lower-cased, is `none` | `{ kind: 'clear' }` | none |
   | `none` together with another entry | `undefined` | `holdAutomaticFireAgainst dropped: "none" cannot be combined with side codes.` |
   | anything else | `{ kind: 'replace', sideCodes }` | none |

   - `sideCodes` holds each entry trimmed and lower-cased, in first-seen order, with duplicates removed.
   - The row for an empty array is the branch Locked Decision 2 names. Put a comment on it that says why an empty array keeps the list.
   - The two drop-reason strings are **Exact**.
6. **`holdAutomaticFireAgainstRecordingEvents.ts`.** Model it on `recordSideAgreementDecision` in `src/main/recorder/sideAgreementRecordingEvents.ts`.

   ```ts
   export function recordHoldAutomaticFireAgainstChanged(args: {
     readonly step: StepKey;
     readonly seatId: string;
     readonly sparedSeatIds: readonly string[];
     readonly previousSeatIds: readonly string[];
   }): void;
   ```

   It calls `recordMatchEvent` with `type: 'hold_automatic_fire_against_changed'`, `step: args.step`, `visibility: { seats: [args.seatId] }`, and the payload `{ seatId, sparedSeatIds, previousSeatIds }`. It sets no display text. It logs the step, the seat, and the two counts with `logDebug`.
7. **`src/shared/matchRecording.ts`.**
   - Add `'hold_automatic_fire_against_changed',` as the last entry of `MATCH_EVENT_TYPES`, after `'agreement_decision',`.
   - Add `hold_automatic_fire_against_changed: 1,` as the last entry of `MATCH_EVENT_FORMAT_VERSIONS`.
   - The two comments there that say `sixteen` say `seventeen`.
   - Add no other line to this file.
8. **`holdAutomaticFireAgainstApply.ts`: store the choice.**

   ```ts
   export function applyHoldAutomaticFireAgainstChoice(args: {
     readonly seatId: AiSeatId;
     readonly choice: HoldAutomaticFireAgainstChoice | undefined;
     readonly turnNumber: number;
     readonly battle: TacticalBattleSnapshot | null;
   }): { readonly dropReasons: string[] };
   ```

   In order:
   1. `choice` is `undefined`: return no drop reason and write nothing.
   2. Read the stored list: `readHoldAutomaticFireAgainstSeatIds(args.seatId)`.
   3. For `clear`, the new list is empty.
   4. For `replace`:
      - the seats that can be listed are the roster seats (`readSeatRoster(gameDbOps)`, kept when `isSeatId(seat.seatId)`) that are not `args.seatId` and have `outTurn == null`;
      - resolve each code with `seatIdForSideCode(code, thoseSeats)`;
      - a code that resolves to `null` adds the drop reason `holdAutomaticFireAgainst: "${code}" is not an active side other than your own, and was left out.`;
      - when no code resolves, add `holdAutomaticFireAgainst dropped: no listed code names an active side other than your own.`, write nothing, and return;
      - otherwise the new list is the resolved seats.
   5. When the new list holds the same seats as the stored list, write nothing and record nothing.
   6. Otherwise call `writeHoldAutomaticFireAgainstSeatIds({ getOne: gameDbOps.getOne, run: gameDbOps.run }, args.seatId, newList)`, then `recordHoldAutomaticFireAgainstChanged` with `step: stepForConsult(args.turnNumber, args.battle)`, the new list sorted, and the stored list sorted.
   7. Wrap steps 2 to 6 in `try`/`catch`. On a throw, log with `logError` and return the one drop reason `holdAutomaticFireAgainst dropped: the engine could not store it.`

   - The three drop-reason strings are **Exact**. A code is at most a few characters the model sent; cut it to 12 characters before it goes into the string.
   - Log with `logDebug`: the seat, the choice kind, the old and new counts, and whether anything was written.
   - Imports: `seatIdForSideCode` from `./talk/talkSideCodes`, `readSeatRoster` from `../gameDb/seatRosterStore`, `gameDbOps` from `../gameDb/dbConnection`, `stepForConsult` from `../recorder/matchRecordingEvents`. Read how `ordersMessagesBlock.ts` and `talkPromptInput.ts` call the first three, and match it.
9. **`orderResponseTypes.ts`.** Add one optional field to `ParsedOrdersResponse`, after `agreementDecisions`:

   ```ts
   holdAutomaticFireAgainstChoice?: HoldAutomaticFireAgainstChoice;
   ```

   Its comment: what the reply asked for the list; undefined when the field was missing, empty, or dropped; read in both theaters.
10. **`orderResponseParsing.ts`.** Directly before the line that begins `const agreementDecisionResult =`, add:

    ```ts
    const holdAutomaticFireAgainst = parseHoldAutomaticFireAgainstChoice(obj.holdAutomaticFireAgainst);
    dropReasons.push(...holdAutomaticFireAgainst.dropReasons);
    ```

    In the returned object, add `holdAutomaticFireAgainstChoice: holdAutomaticFireAgainst.choice,` after the line that begins `agreementDecisions: agreementDecisionResult`. Add the import. Do not test `context.mode`: the field is read in both theaters. These are the only four lines added to this file.
11. **`requestOrdersApplyParsed.ts`.** Directly after the anchor line `const dropReasons: string[] = [...(parsed.dropReasons ?? [])];`, add:

    ```ts
    dropReasons.push(...applyHoldAutomaticFireAgainstChoice({ seatId, choice: parsed.holdAutomaticFireAgainstChoice, turnNumber: planState.turnNumber, battle: tacticalBattle ?? null }).dropReasons);
    ```

    Add the import. These are the only two lines added to this file in this phase.
    - The line must stay above `generateOrdersForStandingOrders(` and above `mergeCommanderAttackOrders({` in that function, so the reply's own DEFEND fire and sweep already use the new list.
    - It is not inside any `if`. It runs for a strategic reply and for a battle reply, whatever `ordersEnabled` is.

### Tests

- **Add `holdAutomaticFireAgainstRuleText.test.ts`.** The paragraph names the field, contains `["none"]`, says `turn` for `'turn'` and `beat` for `'beat'`, and is one line.
- **Add `holdAutomaticFireAgainstParsing.test.ts`.** One assertion per row of the table in step 5, plus: codes are trimmed, lower-cased, and deduplicated in first-seen order; `[" NONE "]` clears.
- **Add `holdAutomaticFireAgainstApply.test.ts`.** Use a seated match with the human and two AI seats, built as `holdAutomaticFireAgainstMemory.test.ts` builds its knockout case. Count events the way `src/main/sideAgreements/sideAgreementDecisionApply.test.ts` counts `agreement_decision` rows, with `record_type = 'hold_automatic_fire_against_changed'`. Get side codes with `playerIdCodeFor`. Tests:
  - `undefined` writes nothing, records nothing, and returns no drop reason;
  - a `replace` with the other AI seat's code stores that seat and records one event;
  - the same `replace` again records no second event;
  - a `replace` with the human's code stores the human seat;
  - a `replace` with a valid code and the commander's own code stores the valid seat and returns one drop reason that names the own code;
  - a `replace` with only an unknown code keeps the stored list and returns the "no listed code" drop reason;
  - a `replace` with a seat id instead of a code resolves, as `seatIdForSideCode` allows;
  - a `replace` that names a seat with `outTurn` set leaves it out with a drop reason (set `outTurn` with `writeSeatKnockout` from `src/main/gameDb/seatRosterStore.ts`; read its signature first);
  - `clear` empties a stored list and records one event; `clear` on an empty list records none;
  - with a `battle` argument the event's step is a tactical step (read the stored `step_key` or `scope` column, as the recorder tests do).
- **`envelopeContract.test.ts`.** Update each assertion that pins the field order so that `holdAutomaticFireAgainst` is last, including the one that compares the last entries with `['posture', 'agreementDecisions']`. Add one test: `envelopeFieldsForGates` ends with `holdAutomaticFireAgainst` for a strategic gate set and for a tactical gate set, and `buildRepairSchemaText` does not contain the field name.
- **Add `envelopeJsonSchemaHoldAutomaticFireAgainst.test.ts`.** Build a strategic and a tactical response format the way `envelopeJsonSchema.test.ts` builds them. In both, the property `holdAutomaticFireAgainst` is `{ type: 'array', items: { type: 'string' } }` and is not in `required`.
- **Add `promptContractsHoldAutomaticFireAgainst.test.ts`.** Call `buildFinalJsonContractInstruction` and `getFinalJsonOrdersExampleBlock` the way `promptContracts.test.ts` calls them. Assert:
  - the strategic instruction contains the paragraph for `'turn'`, and the tactical one the paragraph for `'beat'`;
  - the submit header contains `"holdAutomaticFireAgainst": [...]` as its last slot;
  - with structured outputs on, the paragraph is still present;
  - the example block does not contain `holdAutomaticFireAgainst`.
- **Add `orderResponseHoldAutomaticFireAgainst.test.ts`.** Build the parser inputs the way `orderResponseParsing.test.ts` does. Assert:
  - a strategic reply with `"holdAutomaticFireAgainst":["a2"]` parses with `holdAutomaticFireAgainstChoice` equal to `{ kind: 'replace', sideCodes: ['a2'] }`;
  - a tactical reply with the same field parses the same way;
  - `["none"]` parses as `{ kind: 'clear' }`;
  - a reply without the field, and one with `[]`, have `holdAutomaticFireAgainstChoice` undefined and no drop reason that names the field;
  - a reply with `"holdAutomaticFireAgainst":"a2"` keeps its orders, has the choice undefined, and has the "expected a list" drop reason.

### Tests to run

- `node dist/main/openRouter/promptSpec/holdAutomaticFireAgainstRuleText.test.js`
- `node dist/main/openRouter/holdAutomaticFireAgainstParsing.test.js`
- `node dist/main/openRouter/holdAutomaticFireAgainstApply.test.js`
- `node dist/main/openRouter/orderResponseHoldAutomaticFireAgainst.test.js`
- `node dist/main/openRouter/promptContractsHoldAutomaticFireAgainst.test.js`
- `node dist/main/openRouter/promptSpec/envelopeJsonSchemaHoldAutomaticFireAgainst.test.js`
- `node dist/main/openRouter/promptSpec/envelopeContract.test.js`
- `node dist/main/openRouter/promptSpec/envelopeJsonSchema.test.js`
- `node dist/main/openRouter/promptSpec/consultationContract.test.js`
- `node dist/main/openRouter/promptSpec/variantConformance.test.js`
- `node dist/main/openRouter/promptSpec/coachingText.test.js`
- `node dist/main/openRouter/promptContracts.test.js`
- `node dist/main/openRouter/orderResponseParsing.test.js`
- `node dist/main/openRouter/requestOrdersFinalOrdersRound.test.js`
- `node dist/main/openRouter/requestOrdersRoundCap.test.js`
- `node dist/main/openRouter/requestOrdersSeats.test.js`
- `node dist/main/openRouter/systemPromptStability.test.js`
- `node dist/main/openRouter/promptOutline.test.js`
- `node dist/main/openRouter/tacticalPromptSectionParity.test.js`
- `node dist/main/recorder/sideAgreementRecordingEvents.test.js`
- `node dist/main/recorder/matchRecorder.test.js`
- `node dist/shared/matchRecording.test.js`

A test in this list that fails only because it pins the envelope field list, the submit header, the contract text, or the schema's property names is fixed by updating the expected value. For a test file over 600 lines, follow the rule in Conventions.

### Verification

- The Phase Check passes, with `naming:check`, `check:renderer-types`, and `build:renderer`. `check:circular` prints no cycle.
- `orderResponseParsing.ts` and `requestOrdersApplyParsed.ts` are each shorter than their Phase 0 counts.
- In `applyParsedRequestOrders`, the `applyHoldAutomaticFireAgainstChoice` call is above both `generateOrdersForStandingOrders(` and `mergeCommanderAttackOrders({`.
- `EnvelopeGates` has no new field, and no file in the "Files not to edit" table changed.

---

## Phase 5 — The Briefing Shows the List

**Edits:**
- `src/main/openRouter/promptSpec/holdAutomaticFireAgainstRuleText.ts`
- `src/main/openRouter/promptSpec/holdAutomaticFireAgainstRuleText.test.ts`
- `src/main/openRouter/promptSpec/diplomacyRuleText.ts`
- `src/main/openRouter/promptSpec/diplomacyRuleText.test.ts`
- `src/main/openRouter/talk/talkPromptInput.ts`
- `src/main/openRouter/talk/talkPrompt.ts`
- `src/main/openRouter/talk/talkPrompt.test.ts`
- `src/main/openRouter/talk/ordersMessagesBlock.ts`
- `src/main/openRouter/talk/ordersMessagesBlock.test.ts`

**Adds:**
- `src/main/openRouter/talk/holdAutomaticFireAgainstText.ts`
- `src/main/openRouter/talk/holdAutomaticFireAgainstText.test.ts`

### Steps

1. **`holdAutomaticFireAgainstText.ts`: a pure builder.** It reads nothing. It logs with `logTrace`.

   ```ts
   export interface HoldAutomaticFireAgainstSide {
     readonly label: string;
     readonly code: string;
     readonly attackedYouTurn: number | null;
     readonly shotsLastBeat: number | null;
   }

   export function buildHoldAutomaticFireAgainstText(spared: readonly HoldAutomaticFireAgainstSide[]): string | null;
   ```

   - It returns `null` for an empty array.
   - Otherwise it returns these lines joined with `\n`. `${name}` is `${label} (${code})`, and `${names}` is every side's name joined with `, ` in the order given.
   - First line, always. **Exact:**

     ```text
     Holding automatic fire: your units do not fire on their own at ${names}. They still return fire, and an attack you order against a listed side still fires. Change the list with "holdAutomaticFireAgainst" in your orders reply.
     ```

   - Then, for each side whose `shotsLastBeat` is a number above 0, one line. **Exact:**

     ```text
     ${name} is on this list. Attack shots the game counted from it last beat: ${shotsLastBeat}.
     ```

   - Then, for each side whose `attackedYouTurn` is not `null`, one line. **Exact:**

     ```text
     ${name} is on this list, and the game's record shows it last destroyed units of yours on turn ${attackedYouTurn}.
     ```

   - Field comments: `attackedYouTurn` is `latestTurnAttackedYou` from the commander's combat record, and is `null` in a battle; `shotsLastBeat` is the opponent's count from `lastBeatActivity`, and is `null` outside a battle between two AI commanders and for a side that is not the opponent.
2. **`talkPromptInput.ts`: the reader.** Add one exported function beside `readBattleTruceText`. It logs with `logTrace`.

   ```ts
   export function readHoldAutomaticFireAgainstText(args: {
     readonly seatId: AiSeatId;
     readonly sides: readonly TalkPromptSide[];
     readonly turnNumber: number;
     readonly battle: TacticalBattleSnapshot | null;
   }): string | null;
   ```

   - Read `const spared = readHoldAutomaticFireAgainstSeatIds(args.seatId)`. When it is empty, return `null` before any other read.
   - Build one `HoldAutomaticFireAgainstSide` for each row of `args.sides` that is not `isOwn` and whose `code` equals `playerIdCodeFor(seat)` for a seat in `spared` (test each stored id with `isSeatId` first). Keep the order of `args.sides`. A stored seat with no row is skipped.
   - **On the world map** (`args.battle` is `null`): `attackedYouTurn` is `readSideCombatRecords(args.seatId, args.turnNumber).get(seat)?.latestTurnAttackedYou ?? null`. Call `readSideCombatRecords` once, not once per side. `shotsLastBeat` is `null`.
   - **In a battle:** `attackedYouTurn` is `null`. `shotsLastBeat` is a number only when all of these hold: `args.battle.leadPartyId != null`, `args.battle.lastBeatActivity` is set, and the seat is `battleOpponentSeatId(args.seatId, args.battle)`. Then it is `opposingShots` when `args.battle.leadPartyId === args.seatId`, and `leadShots` otherwise. This is the same choice `lastBeatPart` in `battleTruceText.ts` makes for the opponent's count.
   - Return `buildHoldAutomaticFireAgainstText(...)`.
   - This function stays in `talkPromptInput.ts` because it needs `battleOpponentSeatId` from that file. `holdAutomaticFireAgainstText.ts` must not import `talkPromptInput.ts`.
3. **`talkPromptInput.ts`: the talk input.** In `readTalkPromptInput`, add one property to the returned `input`, after the `agreements:` anchor line:

   ```ts
   holdAutomaticFireAgainstText: readHoldAutomaticFireAgainstText({ seatId: args.seatId, sides, turnNumber: args.turnNumber, battle: args.battle }),
   ```

4. **`talkPrompt.ts`.**
   - Add to `TalkPromptInput`, after `agreements`: `readonly holdAutomaticFireAgainstText?: string | null;`. Its comment: the commander's list of sides its units do not fire at on their own, from `readHoldAutomaticFireAgainstText`; null or absent when the list is empty.
   - In `buildTalkSituationText`, directly before the line that pushes `## Your last plan`, add:

     ```ts
     if (input.holdAutomaticFireAgainstText) blocks.push(`## Holding automatic fire\n${input.holdAutomaticFireAgainstText}`);
     ```

   - In `buildTalkSystemText`, add the new bullet as the last bullet of the agreements block in **both** scopes. After the `battleTruceBullets` anchor line, declare the bullet, then change the two branches of `agreementsBlock` so each ends with the new bullet on its own line:

     ```ts
     const holdAutomaticFireAgainstBullet = `- ${HOLD_AUTOMATIC_FIRE_AGAINST_TALK_BULLET}`;
     const agreementsBlock = strategic
       ? `\nAgreements:\n${agreementBullets}\n${holdAutomaticFireAgainstBullet}\n`
       : `\nAgreements and last beat:\n${battleTruceBullets}\n${holdAutomaticFireAgainstBullet}\n`;
     ```

   - Update the orienting comments of both functions.
5. **`holdAutomaticFireAgainstRuleText.ts`: the talk bullet.** Add one exported constant, without the leading hyphen. **Exact:**

   ```text
   Your units fire on their own at the nearest enemy in range when you give them no attack order. A promise to hold fire is kept only when your orders give no attack against that side and list it in "holdAutomaticFireAgainst". You set that list in your orders step, not here. The Holding automatic fire section, when present, shows the sides you hold automatic fire against.
   ```

   Name it `HOLD_AUTOMATIC_FIRE_AGAINST_TALK_BULLET`.
6. **`ordersMessagesBlock.ts`**, in `buildOrdersMessagesBlock`.
   - After the line that sets `contactText`, add:

     ```ts
     const holdAutomaticFireAgainstText = readHoldAutomaticFireAgainstText({
       seatId: args.seatId,
       sides,
       turnNumber: readTurnNumberOrFirst(gameDbOps.getOne),
       battle: args.inBattle ? getActiveTacticalBattleSnapshotRef() : null,
     });
     ```

   - The early return (the Phase 0 anchor) gains one condition: `&& holdAutomaticFireAgainstText === null`.
   - Directly after the anchor line `if (truceText !== null) parts.push(truceText);`, add `if (holdAutomaticFireAgainstText !== null) parts.push(holdAutomaticFireAgainstText);`.
   - Add `hasHoldAutomaticFireAgainstText: holdAutomaticFireAgainstText !== null` to the `logTrace` call.
   - Update the comments of the function, of the `text` field of `OrdersMessagesBlock`, and of the file: the section also shows the hold-automatic-fire text when the list is not empty, and is no longer null when that is all there is.
7. **`diplomacyRuleText.ts`.**
   - In both `BATTLE_TRUCE_ORDERS_BULLETS` and `BATTLE_TRUCE_TALK_BULLETS`, replace the sentence `Attack shots are the ranged shots and air strikes a side ordered.` with this one. **Exact:**

     ```text
     Attack shots are the ranged shots and air strikes a side's units fired, whether its commander ordered them or the units fired on their own.
     ```

   - In `BATTLE_TRUCE_ORDERS_BULLETS` only, directly after the sentence that ends `holding fire while the other side keeps shooting loses your units.`, add one space and this sentence. **Exact:**

     ```text
     To hold fire yourself, give no attack order against that side and list it in "holdAutomaticFireAgainst".
     ```

   - Update the two constants' comments: the count includes shots fired on a unit's own. Neither bullet list gains or loses a bullet, and neither contains a digit.

### Tests

- **Add `holdAutomaticFireAgainstText.test.ts`.** Copy the layout of `battleTruceText.test.ts`.
  - an empty array returns `null`;
  - one side with both values `null` returns the first line only, with `Label (code)`;
  - two sides are joined with `, ` in the order given;
  - a side with `shotsLastBeat: 3` adds the shots line; `shotsLastBeat: 0` adds none;
  - a side with `attackedYouTurn: 7` adds the turn line;
  - the result never ends with a newline.
- **`holdAutomaticFireAgainstRuleText.test.ts`.** Add: `HOLD_AUTOMATIC_FIRE_AGAINST_TALK_BULLET` names the field, does not start with a hyphen, and is one line.
- **`diplomacyRuleText.test.ts`.** Add or update: neither bullet list contains `a side ordered`; both contain `fired on their own`; the orders list contains `list it in "holdAutomaticFireAgainst"`; each list has the same number of bullets as before.
- **`talkPrompt.test.ts`.**
  - `buildTalkSystemText` contains `HOLD_AUTOMATIC_FIRE_AGAINST_TALK_BULLET` for `'strategic'` and for `'tactical'`, after the last agreement bullet of that scope.
  - `buildTalkSituationText` with `holdAutomaticFireAgainstText` set contains `## Holding automatic fire` directly before `## Your last plan`; with it `null` or absent the output is byte-for-byte what it is without the field.
- **`ordersMessagesBlock.test.ts`.** Build the match the way the file's existing tests do. Add:
  - with an empty list, `buildOrdersMessagesBlock` returns exactly what it returned before for the same setup (compare the two results of one setup, before and after writing and then clearing a list);
  - with a stored list and nothing else stored, `text` is not null, contains the `Holding automatic fire:` line with the listed side's label and code, and ends with the sentence that begins `Each message is its sender's claim.`;
  - with a stored list and a stored message thread, the `Holding automatic fire:` line comes after the thread and before that last sentence.

### Tests to run

- `node dist/main/openRouter/talk/holdAutomaticFireAgainstText.test.js`
- `node dist/main/openRouter/talk/ordersMessagesBlock.test.js`
- `node dist/main/openRouter/talk/talkPrompt.test.js`
- `node dist/main/openRouter/talk/battleTruceText.test.js`
- `node dist/main/openRouter/talk/requestTalk.test.js`
- `node dist/main/openRouter/talk/talkRound.test.js`
- `node dist/main/openRouter/promptSpec/holdAutomaticFireAgainstRuleText.test.js`
- `node dist/main/openRouter/promptSpec/diplomacyRuleText.test.js`
- `node dist/main/openRouter/promptSpec/sideMessageRuleText.test.js`
- `node dist/main/openRouter/promptSpec/coachingText.test.js`
- `node dist/main/openRouter/promptContracts.test.js`
- `node dist/main/sideAgreements/sideAgreementDecisionApply.test.js`
- `node dist/main/openRouter/systemPromptStability.test.js`
- `node dist/main/openRouter/tacticalPromptSectionParity.test.js`

A test in this list that fails only because it pins one of the two reworded sentences or the talk system text is fixed by updating the expected text. For a test file over 600 lines, follow the rule in Conventions.

### Verification

- The Phase Check passes, with `naming:check`. `check:circular` prints no cycle; `holdAutomaticFireAgainstText.ts` imports neither `talkPromptInput.ts` nor `ordersMessagesBlock.ts`.
- `Attack shots are the ranged shots and air strikes a side ordered.` appears nowhere under `src`.
- With an empty list, the orders Messages section and the talk situation text are unchanged.

---

## Phase 6 — Docs, Release Notes, Version, Final Checks, and Hand-Off

**Edits:**
- `doc/combat-rules-v3.md`
- `doc/ai-tools.md`
- `doc/hybrid-ai.md`
- `doc/commander-messages.md`
- `doc/match-recording.md`
- `doc/save-files.md`
- `doc/ai-commander-prompts/assembly-contract.md`
- `doc/ai-commander-prompts/consultation-flow.md`
- `doc/ai-commander-prompts/crosswalk.md`
- `doc/ai-commander-prompts/source-inventory.md`
- `doc/ai-commander-prompts/information-decision-model.md`
- `doc/ai-commander-prompts/strategic-prompt.md`
- `doc/ai-commander-prompts/tactical-prompt.md`
- `doc/ai-commander-prompts/talk-prompt.md`
- `doc/ai-commander-prompts/variants.md`
- `doc/ai-commander-prompts/example-strategic-prompt.md`
- `doc/ai-commander-prompts/example-tactical-prompt.md`
- `doc/README.md`
- `README.md`
- `package.json`
- `package-lock.json`
- `.github/ISSUE_TEMPLATE/bug_report.yml`

**Adds:**
- `doc/release-notes/v3.7.1.md`

Match the voice and layout of each document. Name the symbol behind every rule. Use no plan vocabulary. A document over 600 lines must not gain a line: change words in place. `doc/combat-rules-v3.md` (776) and `doc/ai-commander-prompts/example-strategic-prompt.md` (669) are over 600.

**The sweep is now described to the model.** Until now the prompt never told a commander that unordered units fire (the docs call this `TEMPO_SWEEP_SILENCE`). The field paragraph ends that for one fact: a unit with a legal shot and no attack order fires at the nearest enemy. Steps 7 to 9 update every document that states the old rule. Keep the label `TEMPO_SWEEP_SILENCE` so links and tables still resolve, and change what each entry says.

### Steps

1. **`doc/combat-rules-v3.md`.** Add sentences to existing lines; add no line.
   - In the paragraph that begins `**DEFEND standing orders (strategic):**`, add: a DEFEND unit never chooses a unit of a side in its owner's `holdAutomaticFireAgainst` list (`readHoldAutomaticFireAgainstSeatIds`, `appendNearestLegalEngagement` in `src/main/tools/nearestLegalEngagement.ts`), and the same holds for `engageEnRoute` fire on a march.
   - In the paragraph that begins `**Tempo sweep:**`, add: the sweep never chooses a unit of a side in that list, on the world map or in a battle; an attack the commander ordered against such a side is kept; return fire and melee are unchanged. Replace the sentence `The sweep is engine behavior, not a player-facing order.` with: the sweep is engine behavior, and an AI commander is told about it only in the paragraph that explains `holdAutomaticFireAgainst`.
   - In the bullet that begins `- **hold_fire:**`, add: `hold_fire` silences one unit against every side, and `holdAutomaticFireAgainst` silences every unit of a commander against the listed sides.
   - In the section on AI commander battles, where `holdsShooterOnClampedMove` or the shortened move is described, add that a sub-unit whose only legal targets belong to listed sides is not held. If the document does not mention that rule, skip this item and record that in the Completion Log.
2. **`doc/ai-tools.md`.** After the bullet whose label is `hold_fire` (its text begins `Suppresses DEFEND auto-engagement`), add one bullet for `holdAutomaticFireAgainst`: an optional orders-reply field in both theaters; a list of side codes replaces the stored list, `["none"]` clears it, and a missing field or an empty list keeps it; it stops DEFEND fire, `engageEnRoute` fire, and the tempo sweep against the listed sides, and nothing else. Name `parseHoldAutomaticFireAgainstChoice` and `applyHoldAutomaticFireAgainstChoice`.
3. **`doc/hybrid-ai.md`.**
   - In list item 4 (`**Standing-order execution**`), add that DEFEND fire and `engageEnRoute` fire skip sides in the seat's list.
   - In list item 5 (`**Tempo sweep**`), add that the sweep skips sides in the seat's list, and replace `Not described to the model on purpose.` with: described to the model only in the `holdAutomaticFireAgainst` paragraph of the orders contract (`buildHoldAutomaticFireAgainstParagraph`).
   - After the `## Posture` section's first paragraph block, or in the nearest section that lists stored commander state, add a short paragraph: each AI seat's list is stored in the `game_config` row `hold_automatic_fire_against` (`HOLD_AUTOMATIC_FIRE_AGAINST_CONFIG_KEY`, `src/main/gameDb/holdAutomaticFireAgainstMemory.ts`); it applies between consults, on the world map and in battles; `resetGameForNewMatch` deletes the row and `applyKnockout` removes a seat from every list.
4. **`doc/commander-messages.md`.** In the Agreements section, after the paragraph about `agreementDecisions`, add a paragraph: the game still enforces no agreement; a commander that wants its units to hold fire toward a side lists it in `holdAutomaticFireAgainst`, which is its own setting and is not tied to any agreement; the orders Messages section and the talk situation show a list that is not empty (`buildHoldAutomaticFireAgainstText`, `readHoldAutomaticFireAgainstText`), and flag a listed side that attacked.
5. **`doc/match-recording.md`.**
   - The word `sixteen` in the paragraph near the top becomes `seventeen`.
   - Add one table row after the `agreement_decision` row: `hold_automatic_fire_against_changed` — a commander's orders reply changed its `holdAutomaticFireAgainst` list (`recordHoldAutomaticFireAgainstChanged`, `src/main/recorder/holdAutomaticFireAgainstRecordingEvents.ts`). The payload has `seatId`, `sparedSeatIds`, and `previousSeatIds`. A reply that leaves the list as it was writes nothing. Visibility is that commander. It has no display text.
6. **`doc/save-files.md`.** After the sentence about `ai_only_beat_limit`, add: the match row `hold_automatic_fire_against` stays in the file; a missing row, as in every save made before 3.7.1, reads as empty lists.
7. **`doc/ai-commander-prompts/assembly-contract.md`.**
   - Add a table row after the `agreementDecisions` row: `holdAutomaticFireAgainst` | array | always offered, last, in both theaters | Optional side codes the commander's units do not fire at on their own. A list replaces the stored list, `["none"]` clears it, and a missing field or an empty list keeps it.
   - The bullet that contains `The engine sweep is not described` becomes: the engine sweep is described only by `buildHoldAutomaticFireAgainstParagraph`, which says an unordered unit with a legal shot fires at the nearest enemy; no other text may mention it.
8. **`consultation-flow.md`, `crosswalk.md`, `source-inventory.md`, `information-decision-model.md`, `strategic-prompt.md`, `tactical-prompt.md`, `variants.md`.** Search each for `TEMPO_SWEEP_SILENCE`, `sweep`, `unfired`, and `agreementDecisions`, and update each sentence this plan makes untrue:
   - every `TEMPO_SWEEP_SILENCE` entry says what step 7 says, in that document's own form (a table cell stays one cell);
   - in `tactical-prompt.md`, the "must not contain" item `Any suggestion that unfired shots will be taken anyway` becomes: any such suggestion outside the `holdAutomaticFireAgainst` paragraph;
   - in `consultation-flow.md`, the sentence that says nothing moves in a battle with no orders gains: sub-units with a legal shot still fire unless the opponent is in the list;
   - wherever the envelope's fields are listed in order, add `holdAutomaticFireAgainst` last, and say it is in both theaters;
   - in `source-inventory.md`, add `buildHoldAutomaticFireAgainstParagraph` to the contract sources, add the hold-automatic-fire text and its builder to the `# Messages` row, and in the row for `collectTempoRuleAttacks` / `collectTacticalTempoAttacks` replace **absent-by-design** with: present only in the `holdAutomaticFireAgainst` paragraph;
   - in `strategic-prompt.md` and `tactical-prompt.md`, describe the new paragraph where the contract paragraphs are listed, and the hold-automatic-fire text where the Messages section is described;
   - in `information-decision-model.md`, in the row for `HOLD_FIRE_SEMANTICS`, add that `holdAutomaticFireAgainst` is the per-side counterpart.
9. **`doc/ai-commander-prompts/talk-prompt.md`.** Add that the agreements block of both scopes ends with `HOLD_AUTOMATIC_FIRE_AGAINST_TALK_BULLET`, and that the situation has a `## Holding automatic fire` block before `## Your last plan` when the list is not empty (`readHoldAutomaticFireAgainstText`).
10. **The two example prompts.** Replace old text with new text in place. Do not regenerate the files.
    - The examples were captured with structured outputs on, so they have no submit header line. If one does have a line that begins `Submit your final JSON only`, add `, "holdAutomaticFireAgainst": [...]` before its closing brace.
    - Wherever an example quotes the envelope's field names in order (the last line of `example-strategic-prompt.md` does, after `Then submit JSON with`), add `, "holdAutomaticFireAgainst"` as the last name, on the same line.
    - In `example-tactical-prompt.md`, replace the sentence `Attack shots are the ranged shots and air strikes a side ordered.` with the new sentence, add the new "To hold fire yourself" sentence to the same bullet, and add the field paragraph for `beat` as a new paragraph after the last contract paragraph.
    - In `example-strategic-prompt.md`, which must not gain a line, add the field paragraph for `turn` to the end of the line that holds the `Optional "agreementDecisions"` paragraph, after one space, and record that in the Completion Log.
11. **Stale-text searches.** Search `doc/` and `README.md` for each of these. No maintained document may still state the old behavior. Leave `doc/release-notes/` files before 3.7.1 and the historical documents in `AGENTS.md` as they are.
    - `Not described to the model on purpose`
    - `not a player-facing order`
    - `The engine sweep is not described`
    - `the prompt does not describe`
    - `absent-by-design`
    - `a side ordered`
    - `sixteen`
12. **`doc/README.md`, the engine constants section.** Add one sentence beside the save-file or AI-only battle entries: the per-seat automatic-fire list is `HOLD_AUTOMATIC_FIRE_AGAINST_CONFIG_KEY` and `readHoldAutomaticFireAgainstSeatIds` in `src/main/gameDb/holdAutomaticFireAgainstMemory.ts`, the reply field is parsed by `parseHoldAutomaticFireAgainstChoice` and stored by `applyHoldAutomaticFireAgainstChoice`, and the clear word is `HOLD_AUTOMATIC_FIRE_AGAINST_CLEAR_TOKEN`.
13. **Version.**
    - `package.json`: `"version": "3.7.1"`.
    - `package-lock.json`: the two `"version": "3.7.0"` entries that belong to this package, at the top of the file and in the `""` package entry, become `3.7.1`. Change no other line.
    - `.github/ISSUE_TEMPLATE/bug_report.yml`: the placeholder becomes `3.7.1`.
    - `README.md`: the two `Agent Wars v3.7.0` file names and the `**Version:** 3.7.0` line become 3.7.1. Add a `- **3.7.1** ...` line above the `- **3.7.0** ...` line, one sentence in the same style, from the bullets in step 14.
    - `doc/README.md`: `Shipping version as of this writing: **3.7.1**`. Add a `Release **3.7.1** ...` sentence above the `Release **3.7.0** ...` sentence, in the same style.
    - Do not change `doc/save-files.md` beyond step 6, or any other "3.7.0" mention that describes that release.
14. **Add `doc/release-notes/v3.7.1.md`.** Copy `doc/release-notes/v3.7.0.md`, then:
    - replace `3.7.0` with `3.7.1` in the Downloads table, the run instructions, and the heading `## What's in 3.7.0`;
    - in the Saves bullet, a save "from 2.12.0 through 3.6.1" becomes "from 2.12.0 through 3.7.0", and "will not load in 3.7.0" becomes "will not load in 3.7.1";
    - replace the bullets under `## What's in 3.7.1` with the bullets below;
    - under `## Earlier 3.x releases`, add a new `<details>` block for **3.7.0** above the **3.6.1** block, in the same shape, holding the bullets that were under "What's in 3.7.0".

    The bullets, to be written in the file's voice:
    - **Commanders can hold automatic fire against a side.** An AI commander's units fire on their own at the nearest enemy when it gives them no attack order. A commander can now list the sides its units must not fire at on their own, with `holdAutomaticFireAgainst` in its orders. Its units still return fire, and an attack it orders still fires.
    - **The list lasts.** It holds on the world map and in battles, on turns and beats the commander is not consulted for, and across a save and load. A side that is knocked out drops off every list.
    - **Commanders are told how their units fire.** The orders contract now says that unordered units fire on their own, and the battle briefing no longer says every counted shot was ordered.
    - **A listed side that attacks is flagged.** The briefing shows a commander its list and marks a listed side that destroyed its units or fired last beat. Nothing is removed for it: keeping or dropping the side is the commander's choice.
    - **A shortened withdrawal still moves.** In a battle, a move the engine cuts short is no longer cancelled to keep a shot the unit will not take.
15. Run `node scripts/check-doc-links.cjs` on every document this phase edited or added. Fix any broken link you added.
16. Run the full Phase Check with `naming:check`, `check:renderer-types`, and `build:renderer`, then every test any phase named, once more.
17. `npm run rebuild:native:electron`

### Manual checklist for the user

Run `npm test` and `npm run ui:smoke`, then in the app:

1. Start a four-commander regional match with the observe checkbox on and the talk stage on.
2. In `debug.log` or the Commander tab, open any orders prompt. The final JSON contract has the paragraph that begins `Optional "holdAutomaticFireAgainst"`, on the world map and in a battle.
3. Wait for a commander that agrees a truce to send `holdAutomaticFireAgainst` with a side code. Its next orders prompt has an `Holding automatic fire:` line in the Messages section naming that side.
4. Watch a battle between that commander and the listed side on a beat it gives no attack order. The battle briefing's last-beat line counts 0 attack shots for it, and the header counts a quiet beat when the other side also holds.
5. In the same battle, check a beat in which it orders a ranged attack on the listed side. The shot is fired.
6. Save, load, and open the next orders prompt of that commander. The `Holding automatic fire:` line is still there.
7. Load a save made in 3.7.0. It opens, and no commander has a list.
8. Play a match against one AI commander with the talk stage off. Its units fire at yours as before.
9. Across the match, check that no commander lists a side it is plainly at war with and has no truce with. The field is named in every prompt, so a model may fill it without cause. If one does, the field paragraph needs firmer wording before release.

### Verification

- Every Phase Check and named test passes.
- The searches in step 11 find nothing stale in maintained documents.
- No file under `scripts/` or `src/renderer` was edited.
- `package.json`, `package-lock.json`, `README.md`, `doc/README.md`, and the new release notes all say 3.7.1.

---

## Reliability Checklist

Before the hand-off, confirm each line and record it in the Completion Log.

- [ ] No file this plan edited or added is over 600 lines, except `orderResponseParsing.ts` and `requestOrdersApplyParsed.ts`, and each of those is shorter than in Phase 0.
- [ ] Every new or changed declaration has a full orienting comment, and no comment says the sweep or DEFEND fires at the nearest enemy without naming the list.
- [ ] No seat id is written as a string literal in production code.
- [ ] No plan vocabulary appears in `src`, `doc`, `README.md`, or a test name.
- [ ] With no stored list, the engine builds exactly the attacks it built before: every Phase 0 test passes with unchanged assertions, apart from the added `sparedOwnerIds` arguments.
- [ ] With no stored list, the talk situation text is unchanged, and the orders situation text changes only by the one field name in its closing instruction.
- [ ] The orders system text gains one paragraph and one header slot on every consult, and nothing else on the world map.
- [ ] An attack the model ordered against a listed side is never removed, and return fire, melee, and battle starts are untouched.
- [ ] `readHoldAutomaticFireAgainstSeatIds` cannot throw, and `applyHoldAutomaticFireAgainstChoice` cannot throw.
- [ ] In `applyParsedRequestOrders`, the list is stored before standing orders are generated and before attacks are merged.
- [ ] `EnvelopeGates` has no new field, and no file in the "Files not to edit" table changed.
- [ ] `check:circular` prints no cycle, and `naming:check` passes.
- [ ] Nothing was committed.

---

## Success Definition

- A commander that sends `"holdAutomaticFireAgainst": ["<code>"]` and gives no attack order against that side fires no attack shot at it, on that turn or beat and on every later one, consulted or not, until it changes the list.
- The same commander still fires every attack it orders, still returns fire, and still fights in melee.
- A commander that sends nothing fires exactly as it did in 3.7.0.
- The list survives a save and load, is cleared by a new match, and loses a side that is knocked out.
- Every orders prompt explains automatic fire and the field, and a commander with a list sees it in its orders and talk prompts.
- Each change to a list is one `hold_automatic_fire_against_changed` event in the match recording.
- Saves and recordings from 3.7.0 still load and replay.

---

## Phase 0 Inventory

Record here: each static check result, each named test that failed before any edit, each anchor count, the lists from steps 5 to 8, and the line count of every file this plan edits.

Recorded 2026-11-27, before any edit, on branch `feature/v3.7.1-hold-fire-against` (created from `146c510`).

- **Native module.** `npm run rebuild:native:node` succeeded.
- **Static checks.** `build:main`, `lint`, `check:circular` ("no circular dependencies"), `naming:check`, and `check:renderer-types` all exit 0.
- **Named tests.** 39 existing named test files pass. None failed. The 9 listed files that did not exist yet are the 9 test files the plan adds.
- **Anchors (step 4).** All 32 appear exactly once in the named file.
- **Step 5.** The sentence appears exactly twice.
- **Step 6.** `StandingOrderGeneratedAirStrike` is in exactly `standingOrdersGeneration.ts` and `tempoRuleAttacks.ts`.
- **Step 7.** `'agreementDecisions',` is the last entry of `ENVELOPE_FIELD_ORDER`.
- **Step 8.** None of the added files exists. No file under `src` contains any of the four new-name forms.
- **Step 9, line counts.** `standingOrdersGeneration.ts` 599, `tempoRuleAttacks.ts` 221, `orderResponseParsing.ts` 780, `postureChoice.ts` 55, `postureChoice.test.ts` 75 (51 CRLF and 24 LF lines), `requestOrdersApplyParsed.ts` 776, `resetGame.ts` 578, `knockoutConsequences.ts` 128, `tempoRuleAttacks.test.ts` 228, `tacticalRangedTargetResolve.ts` 201, `tacticalRangedTargetResolve.test.ts` 299, `tacticalClampedMoveGuards.ts` 39, `tacticalClampedMoveGuards.test.ts` 194, `humanTacticalDraftCommit.ts` 508, `envelopeContract.ts` 457, `envelopeContract.test.ts` 497, `envelopeJsonSchema.ts` 501, `promptContracts.ts` 459, `matchRecording.ts` 543, `diplomacyRuleText.ts` 133, `diplomacyRuleText.test.ts` 35, `talkPromptInput.ts` 245, `talkPrompt.ts` 456, `talkPrompt.test.ts` 185, `ordersMessagesBlock.ts` 174, `ordersMessagesBlock.test.ts` 225, `combat-rules-v3.md` 776, `ai-tools.md` 98, `hybrid-ai.md` 216, `commander-messages.md` 83, `match-recording.md` 97, `save-files.md` 81, `assembly-contract.md` 240, `consultation-flow.md` 142, `crosswalk.md` 286, `source-inventory.md` 308, `information-decision-model.md` 257, `strategic-prompt.md` 499, `tactical-prompt.md` 274, `talk-prompt.md` 42, `variants.md` 333, `example-strategic-prompt.md` 669, `example-tactical-prompt.md` 204, `doc/README.md` 151, `README.md` 347, `package.json` 114, `package-lock.json` 7459, `bug_report.yml` 135.

---

## Defect Inventory

Record here: the phase, the failing check or test, what was tried, and whether the phase was reverted.

---

## Completion Log

Record here, per phase: the Phase Check results, the tests run, every file edited or added with its final line count, every file edited outside the phase's list and why, and every place a sketch and the real file disagreed.

### Run-wide decisions

- **Branch.** The user asked for a feature branch before editing, so `git switch -c feature/v3.7.1-hold-fire-against` was run once. Nothing is committed.
- **Mismatches.** The user asked that small plan-and-code mismatches be fixed and logged here; a mismatch that would change a Locked Decision or behavior still stops the run.
- **Order inside a phase.** Tests are written and watched failing before the production change they cover.
- **Review.** The user asked for one fresh-context review after Phase 6, with confirmed serious defects fixed.

### Phase 1 — complete

- **Test first.** The two `applyReplyPosture` tests failed the build (`has no exported member 'applyReplyPosture'`) before the function existed.
- **Phase Check.** `build:main`, `lint`, `check:circular` (no cycle), `naming:check`: pass.
- **Tests run (11):** all pass; `postureChoice.test.js` 7/7.
- **Line counts.** `standingOrdersGeneration.ts` 599 → 539, `orderResponseParsing.ts` 780 → 683, `requestOrdersApplyParsed.ts` 776 → 765, `tempoRuleAttacks.ts` 218, `postureChoice.ts` 80, `postureChoice.test.ts` 96, `nearestLegalEngagement.ts` 82 (new), `orderResponseTypes.ts` 123 (new).
- **Files outside the list:** none.
- **Sketch differences:** none. `appendNearestLegalEngagement` is declared only in `nearestLegalEngagement.ts`.

### Phase 2 — complete

- **Test first.** The new test failed the build (`Cannot find module './holdAutomaticFireAgainstMemory'`) before the module existed.
- **Phase Check.** `build:main`, `lint`, `check:circular` (no cycle), `naming:check`: pass.
- **Tests run (5):** all pass; the new file 9/9.
- **Line counts.** `resetGame.ts` 580, `knockoutConsequences.ts` 131, `holdAutomaticFireAgainstMemory.ts` 149 (new), `holdAutomaticFireAgainstMemory.test.ts` 183 (new).
- **Files outside the list:** none.
- **Sketch differences:** `gameDbOps` fits the parameter type, so no lazy helper was needed. The test file also checks that a removal that changes nothing writes nothing, and that an element that is not a non-empty string is dropped; both are behavior the step states.
- **Verification:** the key string appears once; nothing outside the new test calls the reader.

### Phase 3 — complete

- **Test first.** Before any production change, the two standing-order tests failed (1 attack where 0 expected) and the new sweep case failed (`a listed side must not be swept`); the tactical tests then failed the build on the new argument and field.
- **Phase Check.** `build:main`, `lint`, `check:circular` (no cycle), `naming:check`: pass.
- **Tests run (11):** all pass, none skipped.
- **Line counts.** `nearestLegalEngagement.ts` 153, `standingOrdersGeneration.ts` 544, `tempoRuleAttacks.ts` 227, `tempoRuleAttacks.test.ts` 293, `tacticalRangedTargetResolve.ts` 211, `tacticalRangedTargetResolve.test.ts` 373, `tacticalClampedMoveGuards.ts` 41, `tacticalClampedMoveGuards.test.ts` 215, `humanTacticalDraftCommit.ts` 509, `requestOrdersApplyParsed.ts` 767, `standingOrdersHoldAutomaticFireAgainst.test.ts` 145 (new).
- **File outside the list:** `src/main/tools/tempoRuleAirFerry.ts` (comment only). Its header said the attack sweep guarantees every legal shot, which the plan's comment convention forbids once the list exists.
- **Sketch differences:** the new standing-order tests use an AI seat as the firing owner and the human as the listed side (the copied setups fire the human's own units, which production never gives a list).
- **Verification:** the reader is called in exactly the four named production files.

### Phase 4 — complete

- **Test first.** The new tests first failed the build on the missing modules and member. With the new modules in place and nothing wired, the parser, contract, schema, and field-order tests failed on assertions (4 files); the wiring made them pass.
- **Phase Check.** `build:main`, `lint`, `check:circular` (no cycle), `naming:check`, `check:renderer-types` (exit 0), `build:renderer` (`static/renderer.js` is byte-identical to the committed file): pass.
- **Tests run (22 listed, plus 1 new sibling):** all pass.
- **Moved tests.** `testCampaignTargetSchemaFollowsTheGate`, `testOperationsSchemaFollowsTheGate`, and `testPostureSchemaFollowsTheGate` pinned the last schema property. `envelopeJsonSchema.test.ts` is over 600 lines, so they moved, with the same names and corrected assertions, to the new `promptSpec/envelopeJsonSchemaFieldGates.test.ts`. `envelopeJsonSchema.test.ts` was not in the phase's list; it was backed up first.
- **Renamed test.** In `envelopeContract.test.ts`, the test named "agreementDecisions comes last…" now says it follows posture, and the repair-schema field loop skips `holdAutomaticFireAgainst`, which has no repair example.
- **Line counts.** `orderResponseParsing.ts` 687, `requestOrdersApplyParsed.ts` 769, `orderResponseTypes.ts` 133, `promptContracts.ts` 463, `envelopeContract.ts` 459, `envelopeContract.test.ts` 511, `envelopeJsonSchema.ts` 503, `envelopeJsonSchema.test.ts` 583, `envelopeJsonSchemaFieldGates.test.ts` 169 (new), `envelopeJsonSchemaHoldAutomaticFireAgainst.test.ts` 29 (new), `matchRecording.ts` 545, `holdAutomaticFireAgainstRuleText.ts` 23 (new), `holdAutomaticFireAgainstRuleText.test.ts` 22 (new), `holdAutomaticFireAgainstParsing.ts` 64 (new), `holdAutomaticFireAgainstParsing.test.ts` 47 (new), `holdAutomaticFireAgainstApply.ts` 101 (new), `holdAutomaticFireAgainstApply.test.ts` 182 (new), `holdAutomaticFireAgainstRecordingEvents.ts` 41 (new), `orderResponseHoldAutomaticFireAgainst.test.ts` 74 (new), `promptContractsHoldAutomaticFireAgainst.test.ts` 51 (new).
- **Verification:** the apply call (line 299) is above `generateOrdersForStandingOrders(` and `mergeCommanderAttackOrders({`; `EnvelopeGates` is unchanged.

### Phase 5 — complete

- **Test first.** The new tests first failed the build on the missing module, constant, and member. With those in place and nothing wired, the orders block, talk prompt, and bullet tests failed on assertions (3 files); the wiring made them pass.
- **Phase Check.** `build:main`, `lint`, `check:circular` (no cycle), `naming:check`: pass.
- **Tests run (14):** all pass.
- **Added cases beyond the list.** In `ordersMessagesBlock.test.ts`: a listed side that destroyed units is named with the turn in both world-map prompts, and a battle between two AI commanders counts the listed opponent's shots in both prompts with the talk step off. They cover the two flag paths of `readHoldAutomaticFireAgainstText`, which the listed tests do not reach.
- **Line counts.** `holdAutomaticFireAgainstText.ts` 83 (new), `holdAutomaticFireAgainstText.test.ts` 60 (new), `talkPromptInput.ts` 286, `talkPrompt.ts` 468, `talkPrompt.test.ts` 203, `ordersMessagesBlock.ts` 190, `ordersMessagesBlock.test.ts` 295, `holdAutomaticFireAgainstRuleText.ts` 34, `holdAutomaticFireAgainstRuleText.test.ts` 28, `diplomacyRuleText.ts` 133, `diplomacyRuleText.test.ts` 51.
- **Verification:** `holdAutomaticFireAgainstText.ts` imports only the logger; the old "a side ordered" sentence is gone from `src`; with an empty list both prompts are unchanged (tested).

### Phase 6 — complete except the closing native rebuild, which runs after the review

- **Phase Check.** `build:main`, `lint`, `check:circular` (no cycle), `naming:check`, `check:renderer-types`, `build:renderer`: pass. `static/renderer.js` hashes the same as the committed file. `check:renderer-types` lists 5 baseline entries as resolved; no renderer source changed, and the baseline was not refreshed.
- **Tests run (every named file, 48):** all pass, plus `envelopeJsonSchemaFieldGates.test.js`.
- **Doc links.** `check-doc-links.cjs` on every edited or added document: pass.
- **Stale-text searches.** Nothing stale is left. The one remaining `sixteen` is the coding-rule count in `README.md`.
- **Line counts.** `combat-rules-v3.md` 776, `example-strategic-prompt.md` 669 (neither gained a line), `example-tactical-prompt.md` 206, `ai-tools.md` 99, `hybrid-ai.md` 218, `commander-messages.md` 85, `match-recording.md` 98, `save-files.md` 81, `assembly-contract.md` 241, `consultation-flow.md` 142, `crosswalk.md` 286, `source-inventory.md` 308, `information-decision-model.md` 257, `strategic-prompt.md` 501, `tactical-prompt.md` 274, `talk-prompt.md` 43, `variants.md` 333, `ai-commander-prompts/README.md` 83, `doc/README.md` 153, `README.md` 348, `package.json` 114, `package-lock.json` 7459, `bug_report.yml` 135, `v3.7.1.md` 323 (new).
- **Step 1, battle rule.** `combat-rules-v3.md` describes the shortened move, so the sentence was added to that line.
- **Step 10.** Neither example has a submit header line. The `turn` paragraph is on the end of the `agreementDecisions` line; the `beat` paragraph is a new paragraph after the callbacks events paragraph.
- **Ruling: wording of the sweep rule.** The plan says the sweep is described only in the field paragraph. The talk bullet, the Messages text, and the shot-count bullets also speak of automatic fire, so the documents say the `holdAutomaticFireAgainst` texts, chiefly the paragraph.
- **Ruling: file outside the list.** `doc/ai-commander-prompts/README.md` matched the stale-text search and was edited. Its backup was written from `HEAD` after the edit; the file had no other change.
- **Ruling: earlier doc error.** The `DEFEND standing orders (tactical)` paragraph said standing orders generate battle attacks. Battle beats generate none, and the sweep fires for those sub-units (`collectTacticalTempoAttacks`). The paragraph now says that.
- **Also changed.** `consultation-flow.md` names the field in the battle opening message and says the inlined repair schema has no example for it. The `absent-by-design` legend entry left `source-inventory.md` because no row uses it. The `talk-prompt.md` section list is renumbered.

### Reliability Checklist results

- Line limit: only `orderResponseParsing.ts` (687, was 780) and `requestOrdersApplyParsed.ts` (769, was 776) among source files are over 600. The two documents over 600 gained no line, and `package-lock.json` changed only its version lines.
- Orienting comments: present; the remaining nearest-enemy comments either name the list or describe the retargeting of an ordered shot, which ignores it.
- No seat id literal, no plan vocabulary, and no shortened form of the new name in added lines. `doc/README.md` already named product milestones "Phase".
- No stored list: the named tests pass; test edits are added arguments, the new always-present field, and the moved schema tests.
- Prompt text with no list, ordered attacks kept, return fire and melee untouched: covered by the named tests and the diff.
- `readHoldAutomaticFireAgainstSeatIds` and `applyHoldAutomaticFireAgainstChoice` catch their own errors.
- `applyParsedRequestOrders` stores the list before it generates standing orders.
- `EnvelopeGates` unchanged; no file in "Files not to edit", `scripts/`, or `src/renderer` changed.
- `check:circular` and `naming:check` pass. Nothing is committed or staged.

### Review

One fresh-context review ran after Phase 6.

- **Fixed (serious): a plan stored before the list changed still fired at a listed side.** A world-map plan holds its automatic rows, and nothing re-checked them at Ready, so a list set during a battle did not reach the next turn. Reproduced with a throwaway script, then covered by `holdAutomaticFireAgainstStoredPlan.test.ts` (3 of 5 first cases failed before the fix; a sixth case for a swept shot of a unit holding `pursue` failed before its correction). All 6 pass.
- **Design (not in the plan).** `mergeCommanderAttackOrders` records which rows the engine chose, in the new `game_config` row `hold_automatic_fire_against_plan_picks` (`gameDb/holdAutomaticFireAgainstPlanPicks.ts`). A list change runs `repickStoredPlanAttacks` (`openRouter/holdAutomaticFireAgainstStoredPlan.ts`): engine-chosen rows whose hex now holds only listed enemies are removed, and the sweep may re-aim those units. Ordered attacks and `pursue` shots stay. `commanderReadyGather.ts`, `requestOrdersApplyParsed.ts`, and the order row types are unchanged. A failure is logged and leaves the stored plan as it was.
- **Limit.** A plan stored by 3.7.0 and still pending in a loaded save has no recorded choices, so it plays as stored for that one turn.
- **Other files edited:** `holdAutomaticFireAgainstApply.ts`, `tempoRuleAttacks.ts` (232 lines), `resetGame.ts` (582), `hybrid-ai.md`, `combat-rules-v3.md` (776), `save-files.md`, `doc/README.md`, `v3.7.1.md`. Backups are in `step-7`.
- **Checks after the fix:** `build:main`, `lint`, `check:circular`, `naming:check`, the 48 named tests, and the sibling schema test pass. `afterResolutionTalk.test.js`, which no phase names, was also run once and passed.
- **Minor, left for the user:** (1) a hex that holds a listed and an unlisted side can be picked, so listed units there still take automatic hits (Locked Decision 4), and the field paragraph does not say so; (2) a repair reply that omits the field loses the first reply's list, with no drop reason; (3) the briefing flag counts losses from before a side was listed and close-combat losses (Locked Decision 10); (4) no test drives the list through `applyParsedRequestOrders`, `holdsShooterOnClampedMove`'s caller, the two `withTacticalTempoAttacks` calls, or `buildUnconsultedCommanderOrders`, and the kept-model-order sweep test would pass without the list.
- **Native module.** `npm run rebuild:native:electron` ran last, after the review fix, and succeeded.

### Second review — complete except the closing native rebuild

The user asked for a second pass and chose: fix the missing coverage, the repair reply that lost the list, and the misleading attack flag; state the shared-hex exception in the prompt; keep and harden the stored-plan fix; no review agent; targeted tests only. The user then asked for every uncommitted file to be reviewed and `doc/` brought up to date. The items under "Minor, left for the user" above are closed by this pass.

- **Repair reply (changes behavior).** A repaired reply with no usable `holdAutomaticFireAgainst` keeps the first reply's value (`keepEarlierHoldAutomaticFireAgainstChoice`). `requestOrdersFlow.ts`, listed in "Files not to edit", changed by two lines with the user's approval and did not grow.
- **Attack flag (changes Locked Decision 10, with the user's approval).** The world-map flag now needs ranged, air, or missile losses (`SideCombatRecord.latestTurnStruckYou`) on or after the turn the side was listed; a battle listing counts from the next turn. The list row now stores `{owner: {listed: turn}}`. A match saved by an earlier build of this branch, with the array form, reads as an empty list; no release wrote that form. Melee and battle losses no longer flag a side.
- **Shared hex.** The field paragraph says a world-map hex that also holds an unlisted side can still be picked, and that hits can fall on listed units there. Engine behavior is unchanged.
- **Stored-plan fix, hardened.** The engine's picks were saved at merge time, so a discarded reply left them out of step with the stored plan, and a later listing could leave an automatic shot in or remove an ordered one. Both cases failed first. A merge now stages the picks (`stagePlanAttackPicks`), and `storeConsultedPlan` saves them with the plan.
- **Coverage.** New `holdAutomaticFireAgainstConsult.test.ts` and `tacticalBattleHoldAutomaticFireAgainst.test.ts`; added cases for both plan-store paths and for a turn with no stored plan; the kept-model-order sweep test now fails without the list. Each firing-path wiring was broken in the built output, one at a time, and a test failed every time.
- **Rule fixes.** Orienting comments on new fields and nested declarations; call logging on `applyReplyPosture`, the picks functions, and `repickStoredPlanAttacks`.
- **Documents.** `how-to-play.md`, `hybrid-ai.md`, `commander-messages.md`, `combat-rules-v3.md` (776, no new line), `ai-tools.md`, `save-files.md`, `doc/README.md`, `release-notes/v3.7.1.md`, `ai-commander-prompts/` `consultation-flow.md`, `strategic-prompt.md`, `talk-prompt.md`, `information-decision-model.md`, and both example prompts (`example-strategic-prompt.md` 669, no new line).
- **Checks.** `build:main`, `lint`, `check:circular`, `naming:check`, `check:renderer-types`, `build:renderer` pass; `static/renderer.js` matches the committed file. 88 targeted test files (the plan's named tests, changed test files, and tests that import a changed module): all pass, 482 `node:test` cases, none skipped. Doc links pass on the 22 changed documents. The full suite, `ui:smoke`, and the app were not run.
- **Limit.** Staged picks are held one per seat, so two live consults for one seat that both stored would pair a plan with the wrong picks. The pool does not start a consult for a seat that is already planning (`canLaunch`), and the flow checks for a cancel directly before it applies a reply. No path with two live consults was found, and none is tested.
- **Backups.** `step-8` holds every changed file as it stood when this pass started.

### Third review — field wording, full suite, and smoke test

A ten-turn live match showed one commander listing every other side on turn 2 with no agreement, which left it with no automatic fire for the rest of the run. The user chose firmer wording, tied to an agreement or a promise, which still lets a commander list a side when the talk step is off.

- **Field paragraph.** `buildHoldAutomaticFireAgainstParagraph` now says to list a side only to keep an agreement or a promise to hold fire toward it, that a listed side can still fire on its own, so listing a side being fought, or every side, gives up shots and protects nothing, and to take a side off when the agreement ends or the side attacks. The new test failed first. Both example prompts, `strategic-prompt.md`, and the release notes match. `example-strategic-prompt.md` stays at 669 lines.
- **Logging.** `appendNearestLegalEngagement`, moved to `nearestLegalEngagement.ts`, logs its call.
- **Checked and left alone.** A battle always has exactly two parties, so the shared-hex exception applies to world-map hexes only, as the paragraph says. Every stored plan follows its own merge (the pool stores only finished consults), so the in-memory staged picks cannot pair a plan with another reply's picks.
- **Checks.** `npm test`: 688 files, 2972 tests, all pass, none skipped. After the logging edit, `build:main`, `lint`, and the affected test files pass again. Doc links pass.
