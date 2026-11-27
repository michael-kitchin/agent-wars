# Truce-Aware Battles Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** Make truces between AI commanders readable, checkable, and endable, without making the game enforce any agreement. The version becomes **3.7.0**. Six changes:

1. **Loss lines say who fired first.** A unit lost to return fire or in melee is no longer read as an attack by the other side.
2. **A battle briefing shows the truce and the facts.** In a battle between two AI commanders, each one sees its own agreements with the other side (read-only) and the game's count of the shots each side fired last beat.
3. **A quiet battle ends.** Two exit flags end a battle on any beat, and three beats in a row with no fighting end it too.
4. **Pact partners are not walked into by accident.** The rules say that units in the same hex always fight, the briefing lists hexes shared with a pact partner, and the engine stops choosing a pact partner's city as a target on its own.
5. **Promises and orders are tied together.** The battle coaching says that orders which go against a message are a choice the other side will see.
6. **A viewer can tell a truce from a hang.** The battle header shows quiet beats, and a battle that ends by agreement or by quiet beats shows a "Disengaged" result.

**Shape:**
- Phase 0 records a baseline.
- Phase 1 rewords loss lines (change 1).
- Phase 2 changes how an AI-only battle ends and records what happened each beat (change 3, engine part).
- Phase 3 adds the truce text to the battle prompts (changes 2 and 5, and the prompt part of change 3).
- Phase 4 adds the strategic rule and the contact lines (change 4, commander part).
- Phase 5 stops the engine from targeting pact partners on its own (change 4, engine part).
- Phase 6 adds the header text and the "Disengaged" result (change 6).
- Phase 7 updates the docs, the release notes, and the version, runs the final checks, and hands off.

Phase 3 needs the beat record from Phase 2. Phase 6 needs the quiet streak and the end reason from Phase 2. Phases 1, 4, and 5 depend on no other phase. Each phase is verified by its own tests.

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
- **Code blocks are sketches** unless marked **Exact**.
  - Write the real code from the file you just read. When a sketch and the file disagree, the file wins; record the difference in the Completion Log.
  - Text marked **Exact** is copied character for character, including punctuation and spacing.
  - In Exact text, `${name}` means the value of that variable or constant, interpolated in a template literal.
  - Exact text is prompt or UI wording. Write it as a TypeScript string in the quoting style the file already uses, and escape an apostrophe the way the lines around it do.

### Backup and Revert

Nothing is committed. Before each phase, copy every file the phase **edits** into a backup folder outside the repo. Set `$step` to the phase number and `$files` to that phase's **Edits** list.

```powershell
$step = '1'
$files = @('src/main/briefing/recentTurnLossLines.ts', 'src/main/briefing/recentTurnLossLines.test.ts')
$backup = Join-Path $env:TEMP "aw-370-truce\step-$step"
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

Phases 2 and 6 edit files under `src/shared` or `src/renderer` and rebuild `static/renderer.js`. To revert one of them, restore its files, delete its added files, then run `npm run build:renderer` once more.

---

## Verification

### Native module

Tests that open a database load `better-sqlite3` under Node, and `npm install` builds it for Electron. Phase 0 runs `npm run rebuild:native:node`. Phase 7 runs `npm run rebuild:native:electron` last, so the app starts again.

- **Native module lock.** If a rebuild fails with `EBUSY` on `better_sqlite3.node`:
  1. close any running Electron app;
  2. rename `node_modules/better-sqlite3/build/Release/better_sqlite3.node` to `better_sqlite3.node.locked`;
  3. run the rebuild again;
  4. delete the `.locked` file.

### Phase Check

Every phase from 1 to 7 ends with the Phase Check, run from the repo root:

```powershell
npm run build:main
npm run lint
npm run check:circular
```

- **New files.** When the phase adds a file under `src`, also run `npm run naming:check`. Phases 2, 3, 4, and 5 need it. A name it rejects is fixed by renaming the new file or symbol, never by editing the naming rules.
- **Shared or renderer files.** When the phase edits or adds a file under `src/shared` or `src/renderer`, also run `npm run check:renderer-types` and then `npm run build:renderer`. Phases 2 and 6 need both.
- **Tests.** Then run every test file the phase lists under **Tests to run**, and no others. All must pass.
  - Run a test under `src/main` with `node dist/main/<path>.test.js`.
  - Run a test under `src/shared` with `node dist/shared/<path>.test.js`.
- `check:circular` must print **no** cycle.
- A static check or a named test that already failed in Phase 0 is not yours to fix. A **new** failure is.
- Never refresh `scripts/renderer-typecheck-baseline.json`, `scripts/circular-deps-baseline.json`, or any other baseline file to make a check pass.
- **No test may call a real model.** Do not start the app.
- Record each Phase Check result in the Completion Log.

---

## Evidence From the 3.6.1 Match

A four-commander Western Europe match ran 29 turns with 15 battles, every one between two AI commanders.

- **Truces were real, and they looked like a hang.** Three battles (turns 5, 7, and 8) ended with both sides holding fire, after 12, 8, and 17 beats. Notes read "Honor the a3 truce through turn 11: no movement, no fire". On turn 8 one side kept marching away, which reset the idle count on every beat.
- **One-sided restraint lost units.** On turn 11 one commander held a "one-beat freeze" for all seven beats and fired nothing, while the other shot all 16 of its sub-units and lost none. On turn 17 one commander gave no orders for nine beats, citing its pact, and lost both units.
- **Messages and orders disagreed.** On turn 17 a commander sent "All units holding position and fire" on the beat its order note read "Concentrate all 4 armor units on ranged fire". The talk step runs before the orders step, and the orders step already shows the message, so nothing is missing from the prompt except a sentence that connects the two.
- **Self-inflicted losses were read as attacks.** On turn 5 a commander fired on a retreating armor unit, lost infantry to return fire, then wrote "your armor hit my infantry after you said you were standing down". The loss line already carried the label `Return fire`, and the trust rule beside it said a side named after "by" destroyed your units "whatever its messages say".
- **Agreements rarely matched.** Each commander keeps its own record. In only 1 of the 15 battles did both sides have the pact as active.
- **The engine aimed at pact partners.** The engine chose a campaign target held by an active pact partner on 22 seat-turns. Fifteen move orders went into hexes held by a pact partner, most of them marches.
- **The exit did not fit a truce.** `exitBattle` needs both flags and five completed beats, and the coaching says to set it only with an overwhelming advantage or no legal order.

---

## Non-Goals

- **No enforcement.** The game never refuses, changes, or skips an order, a shot, a melee, or a battle because of an agreement. Keeping or breaking an agreement stays the commander's choice.
- **No shared agreement record.** Each commander still keeps its own record. Nothing compares two records.
- **No agreement is made or changed in a battle.** `parseTalkReply` keeps `allowAgreements` false in a battle, and `sideAgreementsEnabled('tactical')` stays false, so the battle orders envelope gains no field.
- **No change to human battles.** The header Exit Battle control, `endTacticalBattleSessionForTwoPartyVoluntaryExit`, and the human beat path are untouched. The quiet rule, the beat record, and the truce text apply only to a battle with a `leadPartyId`.
- **No change to combat.** Dice, hit thresholds, casualty order, melee, return fire, and the less-than-half rule that maps sub-units back are untouched.
- **No change to loss data.** `LossAttribution`, `LOSS_CAUSE_KEYS`, `LOSS_CAUSE_LABELS`, the turn-update toast, and the Reports tab are untouched. Only the prompt's loss lines and legend change.
- **No change to the combat record.** `COMBAT_RECORD_CATEGORY_BY_CAUSE` and `formatSideCombatRecord` already split losses into "when they attacked", "when you attacked", and "in close combat or battle". Leave them.
- **No pathfinding change.** `src/main/tools/pathfinding.ts` and the `avoidEnemies` option are untouched. The engine stops choosing a pact partner's city as a destination; it does not reroute a march.
- **No standing order is cancelled.** When the engine drops a campaign target, units already marching on it keep their standing orders until the commander changes them, exactly as when a target is dropped for any other reason today. Campaign Orders lists the units to re-order when a new target exists.
- **No save migration.** A battle snapshot saved before this change has no `quietBeatStreak` and no `lastBeatActivity`. Both read as absent. A stored end reason of `idle` still shows its sentence.
- **Files not to edit:**

  | File | Lines | Why |
  | --- | --- | --- |
  | `src/main/openRouter/requestOrdersFlow.ts` | 655 | Over 600; its call to `buildOrdersMessagesBlock` does not change |
  | `src/main/openRouter/consultPromptParts.ts` | 602 | Over 600; prompt assembly does not change |
  | `src/main/openRouter/promptSpec/gameRuleText.ts` | 718 | Over 600; no rule text in it changes |
  | `src/main/briefing/sideCombatRecord.ts`, `sideCombatRecordText.ts` | 331, 112 | The record already says who attacked |
  | `src/shared/lossSummary.ts` | 500 | The UI labels do not change |
  | `src/main/tools/pathfinding.ts` and its helpers | | Routing does not change |

- Do not edit anything under `.spec/completed/`, release notes of versions before 3.7.0, or the historical documents named in `AGENTS.md`.
- Do not "improve" code next to a phase's target. Make only the edits listed.

---

## Conventions

These come from `.cursor/rules/` and `AGENTS.md`.

- **Orienting comments (rule 04).** Every new or changed declaration has a JSDoc block:
  - a one-line summary;
  - `Purpose:` (or `Contract:` for types and fields);
  - `When to use:`, `Expected outcome:`, and `Exceptions:`.

  Update every comment whose behavior this plan changes. Afterwards, no comment may still say:
  - that three idle beats end a battle, or that a beat is idle when no order was applied;
  - that both exit flags need five completed beats;
  - that only the beat limit uses the timed notice;
  - that a battle prompt never shows an agreement.

  No generic filler.
- **Logging (rule 02).** A new exported function under `src/main` logs with `logDebug` when called, or `logTrace` when it only reads or formats. A caught exception logs with `logError`. A module under `src/shared` never imports the logger; the `src/main` caller logs.
- **No plan vocabulary (rule 12)** in code, comments, test names, or `doc/`. Do not write "Phase", "change 3", or "truce-aware plan" there.
- **Size limits (rule 09).**
  - Each edited or added source or test file must stay under 600 lines. Record every final line count in the Completion Log.
  - **A file already over 600 lines only shrinks.** Two such source files are edited, each on one existing line with no line added: `src/main/tacticalBattle/computeTacticalBattleSnapshot.ts` (690), where Phase 2 renames one property, and `src/renderer/chrome/controlTooltipText.ts` (663), where Phase 6 changes one comment.
  - **Tests over 600 lines.** `src/main/openRouter/promptContracts.test.ts` (809) and `src/main/openRouter/promptSpec/gameRuleText.test.ts` (626) are over 600 lines. If a test in either fails because of this plan, do not edit it in place. Delete that one test from the big file, add its corrected version to a new sibling test file with the same test name and the imports it needs, and record the move in the Completion Log.
  - **Long docs.** Phase 7 edits docs over 600 lines. Each edit there changes existing lines and adds no line, unless the step says otherwise.
- **Arguments (rule 10).** A function takes at most 6 parameters. Every new function in this plan takes one parameter object or at most three parameters.
- **Mutability (rule 13).** New fields are `readonly`. New collections are `readonly` arrays, `ReadonlySet`, or `ReadonlyMap`.
- **Names (rule 14).** New files and exported functions use camelCase. New types use PascalCase. Use the file and symbol names this plan gives.
- **Seat ids.** Production code never writes a seat id as a string literal. Tests take seat ids from `AI_SEAT_IDS`.
- **Reuse (rule 06).**
  - `readActivePactPartnerSeatIds` in `src/main/openRouter/campaignPactPartners.ts` stays the only "who do I have an active pact with" reader.
  - `computeGridDistancePure` in `src/shared/h3GridRangePure.ts` is the distance function for how far a sub-unit is from the enemy.
  - `formatSideAgreementLines` stays the only agreement formatter.
  - `QUIET_BEATS_TO_END` is the only place the number 3 for quiet beats is written.
- **Tests (rule 03).** Test contracts, not private helpers. Copy the structure of the test next to the one you add.
- **Docs.** Phase 7 updates `doc/`, `README.md`, and the release notes. Do not edit them earlier.

### Prompt Layout

| Text | Message | Where | Change |
| --- | --- | --- | --- |
| loss legend | Situation | Recent Turn Notes | two sentences added |
| loss lines | Situation | Recent Turn Notes | `Return fire` and `Melee attack` gain a note in parentheses |
| trust bullet | System (orders and talk) | Messages from other sides | last bullet reworded |
| battle truce bullets | System (battle orders) | Messages from other sides | three bullets added, AI-only battles with talk on |
| exit bullet | System (battle orders) | Callbacks and messages | reworded |
| battle truce bullets | System (battle talk) | new `Agreements and last beat:` block | two bullets added |
| battle truce text | Situation (battle orders) | Messages section | agreements with the opponent, then the last-beat line |
| battle truce text | Situation (battle talk) | new `## Agreements and last beat` | same text |
| same-hex bullet | System (strategic orders) | agreement bullets | one bullet added |
| contact lines | Situation (strategic orders) | Messages section, after `Your agreements:` | new, only when a hex is shared |
| campaign pact line | Situation (strategic orders) | Campaign Objective | new, only when the target's holder is a pact partner |
| campaign rule | System (strategic orders) | Campaign | two sentences added when agreements are on |
| operation rule | System (strategic orders) | Operations | one sentence added when agreements are on |

No heading is renamed or removed. The orders envelope and both reply shapes are unchanged.

---

## Locked Decisions

1. **Agreements in a battle are read-only.** A commander sees its own agreements with the side it is fighting. It cannot make or change one there. This applies only to a battle between two AI commanders, and only while the talk stage is on (`isTalkStageEnabled`).
2. **Quiet rule.** A beat is quiet when no attack shot was rolled, no melee was rolled, and no sub-unit moved closer to the enemy.
   - An attack shot is a dice roll of kind `ranged` or `airStrike`. Return fire, anti-air fire, and infrastructure counter-fire are answers, not attack shots.
   - A sub-unit moved closer when its cell changed during the beat and its distance to the nearest enemy sub-unit after the beat is smaller than its distance to the nearest enemy sub-unit before the beat. Distances come from `computeGridDistancePure`. "Before" is the snapshot the beat started from, and "after" is the snapshot after melee.
   - Only a sub-unit that moved is tested. A sub-unit that stood still while the enemy came toward it has not moved closer; the enemy sub-unit has.
   - A sub-unit whose distance cannot be measured, before or after, counts as not having moved closer.
   - This is per sub-unit on purpose. One screening sub-unit that holds still must not hide a main force that is advancing behind it, and a side that withdraws must not keep the battle going.
   - `QUIET_BEATS_TO_END` is 3. The third quiet beat in a row ends the battle with the new reason `quiet`.
   - The quiet rule replaces the idle rule. `applyAiOnlyTacticalBeat` no longer sets `idle`. The value stays in the type so an older save or recording still loads and shows its sentence.
3. **Exit flags.** Both commanders setting `exitBattle` ends the battle on any beat, with reason `exit`. One flag never ends it.
4. **Order of endings.** A wiped side, then the quiet rule, then the exit flags, then the beat limit.
5. **Beat record.** Each AI-only beat stores `lastBeatActivity` on the snapshot: the beat number, the attack shots each side rolled, and whether melee was rolled. The prompt and the header read it. A human battle never sets it.
6. **Loss wording.** In the prompt, a `Return fire` line reads `Return fire (the destroyed units fired first)`, and a `Melee attack` line reads `Melee attack (units of both sides were in the same hex or cell)`. Other causes are unchanged. Melee never names a side that "moved in", because `LossAttribution` does not record it.
7. **Engine targets.** The engine never picks a campaign target held by an active pact partner, and it drops a target it picked itself when that city's holder becomes one. A target the commander named stays. The engine never launches an operation on its own against a city held by an active pact partner. The commander may still name or launch either.
   - An active pact partner is a seat in the set `readActivePactPartnerSeatIds` returns: an active `non_aggression` or `ceasefire_in_place` agreement in the commander's own record.
8. **Contact lines.** The strategic orders prompt lists hexes where the commander's units and an active pact partner's units stand together. Units in the same hex are always visible to each other, so the line reveals nothing fog of war hides.
9. **Viewer text.** With the observe checkbox on, an `exit` or `quiet` ending shows the timed result notice the beat limit already uses, so the reason is on screen before the next turn starts.
10. **Release.** The version becomes 3.7.0. `doc/release-notes/v3.7.0.md` is new. Nothing is committed.

---

## Phase 0 — Baseline

### Steps

1. `npm run rebuild:native:node`
2. Run `npm run build:main`, `npm run lint`, `npm run check:circular`, and `npm run check:renderer-types`. Record each result.
3. Run each test file named under **Tests to run** in Phases 1 to 6 that already exists. Record any that fail now.
4. Confirm each anchor below appears exactly once in the file named:
   - `'Loss lines are game records, not claims by any side.` — `src/main/briefing/recentTurnLossLines.ts`
   - `'A "Battle" line lists units destroyed in a tactical battle fought that turn` — `src/main/briefing/recentTurnLossLines.ts`
   - `whatever its messages say.` — `src/main/openRouter/promptSpec/sideMessageRuleText.ts`
   - `else if (streak >= 3) aiOnlyEndReason = 'idle';` — `src/main/tacticalBattle/aiOnlyTacticalBeat.ts`
   - `nextTurn >= 6` — `src/main/tacticalBattle/aiOnlyTacticalBeat.ts`
   - `idleBeatStreak?: number;` — `src/shared/tacticalBattleTypes.ts`
   - `aiOnlyEndReason?: 'elimination' | 'mutual' | 'idle' | 'exit' | 'beat_limit';` — `src/shared/tacticalBattleTypes.ts`
   - `...(leadPartyId ? { leadPartyId, idleBeatStreak: 0 } : {}),` — `src/main/tacticalBattle/computeTacticalBattleSnapshot.ts`
   - `'- Set exitBattle to true when your side has an overwhelming numerical advantage` — `src/main/openRouter/promptSpec/coachingTextTactical.ts`
   - `const agreementViews = args.includeAgreements && !args.inBattle` — `src/main/openRouter/talk/ordersMessagesBlock.ts`
   - `agreements: args.battle ? null : readSideAgreementViews(args.seatId, args.turnNumber),` — `src/main/openRouter/talk/talkPromptInput.ts`
   - `export const SIDE_AGREEMENT_ORDERS_BULLETS = [` — `src/main/openRouter/promptSpec/diplomacyRuleText.ts`
   - `const choices = args.cities.filter((city) => city.h3Index !== args.skip?.targetH3);` — `src/main/openRouter/campaignObjectiveResolution.ts`
   - `const engineMayLaunch = (candidate: OperationCandidate): boolean =>` — `src/main/operations/operationTurnFlow.ts`
   - `? buildCampaignObjectiveSection({ state: args.state, plan: campaignPlan, format: formatCampaignHex })` — `src/main/openRouter/requestOrdersInjection.ts`
   - `buildCampaignRuleBlock(gates.operationsEnabled === true)` — `src/main/openRouter/promptSpec/coachingTextStrategic.ts`
   - `It never launches a land row.` — `src/main/openRouter/promptSpec/operationRuleText.ts`
   - `return reason === 'beat_limit' ? 'timed_dialog' : 'leave_now';` — `src/shared/aiOnlyBeatLimit.ts`
   - `return args.autoAdvance && (!args.resultDialogOpen || args.endReason === 'beat_limit');` — `src/shared/aiOnlyBeatLimit.ts`
   - `if (snap.aiOnlyEndReason === 'exit') return 'The commanders left the battle.';` — `src/renderer/tactical/tacticalExitFlow.ts`
   - `"version": "3.6.1",` — `package.json`
5. Confirm `finishingExemptSeatIds` appears in exactly these five files and no others under `src`: `src/main/openRouter/campaignObjectiveFlow.ts`, `src/main/openRouter/campaignTargetSelection.ts`, `src/main/openRouter/campaignTargetSelection.test.ts`, `src/main/openRouter/campaignRules.test.ts`, `src/main/operations/seaOperationCandidates.ts`.
6. Confirm `idleBeatStreak` appears in exactly these five files under `src`: `src/shared/tacticalBattleTypes.ts`, `src/main/tacticalBattle/aiOnlyTacticalBeat.ts`, `src/main/tacticalBattle/aiOnlyTacticalBeat.test.ts`, `src/main/tacticalBattle/computeTacticalBattleSnapshot.ts`, `src/main/tacticalBattle/computeTacticalBattleSnapshotDb.test.ts`.
7. Confirm that none of the files this plan **adds** exists yet.
8. Record the line count of every file this plan edits.

### Verification

Every result, anchor, and count is recorded in the Phase 0 Inventory. If an anchor is missing or appears more than once, or a list in step 5 or 6 differs, stop and record it.

---

## Phase 1 — Loss Lines Say Who Fired First

**Edits:**
- `src/main/briefing/recentTurnLossLines.ts`
- `src/main/briefing/recentTurnLossLines.test.ts`
- `src/main/openRouter/promptSpec/sideMessageRuleText.ts`
- `src/main/openRouter/promptSpec/sideMessageRuleText.test.ts`

**Adds:** none.

A loss line today reads `  - by a3 (SEGAS), Return fire at IH: ...`. The cause label is right, but nothing says that return fire answers a shot the destroyed unit made. The same file's legend and the trust rule both tell the commander that a side named after "by" destroyed its units. This phase adds the missing meaning in three places.

### Steps

1. **`recentTurnLossLines.ts`: the cause notes.** Add an exported constant above `lineFor`, with its orienting comment:

   ```ts
   export const LOSS_CAUSE_PROMPT_NOTES: Readonly<Partial<Record<keyof PlayerLossSummary, string>>> = {
     returnFire: 'the destroyed units fired first',
     melee: 'units of both sides were in the same hex or cell',
   };
   ```

   The two strings are **Exact**. The comment says that the note tells a commander which losses were not an attack by the side named, and that a cause with no entry prints its label alone.
2. **`recentTurnLossLines.ts`: `lineFor`.** Replace the one line that sets `cause` with code that:
   - takes the label exactly as today (`LOSS_CAUSE_LABELS[group.causeIndex]`, or `BATTLE_LOSS_CAUSE_LABEL` for a battle group);
   - looks up the note with `LOSS_CAUSE_KEYS[group.causeIndex]`, only when `group.causeIndex < LOSS_CAUSE_KEYS.length`;
   - prints `${label} (${note})` when there is a note, and the label alone otherwise.

   The rest of the returned line is unchanged. A battle group has no note.
3. **`recentTurnLossLines.ts`: the legend.** Append these two sentences to the end of `RECENT_TURN_LOSS_LEGEND`, after one space. **Exact:**

   ```text
   A "Return fire" line means the destroyed units fired first and were hit by the answering fire, so it is not an attack by the side named. A "Melee attack" line means units of both sides were in the same hex or cell, where they fight every turn or beat whichever side moved there.
   ```

4. **`recentTurnLossLines.ts`: the battle sentence.** Append this sentence to the end of `BATTLE_LOSS_LEGEND_SENTENCE`, after one space. **Exact:**

   ```text
   A battle starts on its own when units of two sides are in the same hex, and the line does not say which side fired first.
   ```

5. Update the orienting comments of `RECENT_TURN_LOSS_LEGEND`, `BATTLE_LOSS_LEGEND_SENTENCE`, and `lineFor` to name the new sentences and the note.
6. **`sideMessageRuleText.ts`: the trust bullet.** Replace the last entry of `SIDE_MESSAGE_TRUST_BULLETS` with this text. **Exact:**

   ```text
   A loss line in Recent Turn Notes is a fact reported by the game. A line under "Your Losses" that names a side after "by" is the game's record that this side's units destroyed yours, whatever its messages say. Read the cause before you call it an attack: "Return fire" means your units fired first, and "Melee attack" means both sides had units in the same hex or cell.
   ```

   Update the constant's orienting comment to say the bullet now explains the two causes.

### Tests

- **`recentTurnLossLines.test.ts`.**
  - Three existing assertions pin `Melee attack at RB:` or `Melee attack:`. Change each expected string so the note follows the label, for example `'  - by a2, Melee attack (units of both sides were in the same hex or cell) at RB: a1-i4, a1-i5, a1-i6 (by 1 Armored, 2 Infantry)'`.
  - Add one test: a return-fire loss prints `Return fire (the destroyed units fired first)`, and a ranged loss in the same input prints `Ranged attack` with no parentheses after the label.
  - Add one test: `RECENT_TURN_LOSS_LEGEND` contains `not an attack by the side named`, and `BATTLE_LOSS_LEGEND_SENTENCE` contains `does not say which side fired first`.
- **`sideMessageRuleText.test.ts`.** Add one assertion that `sideMessageRuleBlock({ talkStageEnabled: true })` contains `Read the cause before you call it an attack`.

### Tests to run

- `node dist/main/briefing/recentTurnLossLines.test.js`
- `node dist/main/openRouter/promptSpec/sideMessageRuleText.test.js`
- `node dist/main/openRouter/talk/talkPrompt.test.js`
- `node dist/main/openRouter/talk/ordersMessagesBlock.test.js`
- `node dist/main/openRouter/promptSpec/coachingText.test.js`
- `node dist/main/openRouter/promptContracts.test.js`
- `node dist/main/openRouter/systemPromptStability.test.js`
- `node dist/main/openRouter/promptText.test.js`

A test in this list that fails only because it pins one of the four texts above is fixed by updating the expected text. Follow the over-600 rule for `promptContracts.test.ts`.

### Verification

- The Phase Check passes.
- `LOSS_CAUSE_LABELS` in `src/shared/lossSummary.ts` is unchanged.
- The phrase `whatever its messages say` still appears exactly once in `sideMessageRuleText.ts`.

---

## Phase 2 — A Quiet Battle Ends, and Each Beat Is Recorded

**Edits:**
- `src/shared/tacticalBattleTypes.ts`
- `src/main/tacticalBattle/aiOnlyTacticalBeat.ts`
- `src/main/tacticalBattle/aiOnlyTacticalBeat.test.ts`
- `src/main/tacticalBattle/computeTacticalBattleSnapshot.ts`
- `src/main/tacticalBattle/computeTacticalBattleSnapshotDb.test.ts`

**Adds:**
- `src/shared/tacticalQuietBeat.ts`
- `src/shared/tacticalQuietBeat.test.ts`

This phase changes only the engine and the snapshot type. The renderer still builds. Until Phase 6 it has no sentence for the new `quiet` reason and would show the wrong one, which does not matter because the app is not started before the hand-off.

### Steps

1. **`tacticalBattleTypes.ts`: the beat record type.** Add an exported interface above `TacticalBattleSnapshot`, with orienting comments on the type and on every field:

   ```ts
   export interface TacticalBeatActivity {
     readonly beatNumber: number;
     readonly leadShots: number;
     readonly opposingShots: number;
     readonly meleeFought: boolean;
   }
   ```

   - `beatNumber` is the beat that produced the counts: `tacticalTurnNumber` before that beat's increment.
   - `leadShots` and `opposingShots` count attack shots: dice rolls of kind `ranged` or `airStrike` by that side.
   - `meleeFought` is true when the beat rolled any melee dice.
2. **`tacticalBattleTypes.ts`: the snapshot fields.**
   - Rename `idleBeatStreak?: number;` to `quietBeatStreak?: number;`. Rewrite its comment: how many completed beats in a row were quiet; absent or 0 means the streak has not started; a beat with a shot, a melee, or a sub-unit moving closer to the enemy sets it back to 0; used to end an AI-only battle and to show the header text; a loaded snapshot that lacks it is treated as 0.
   - Add `lastBeatActivity?: TacticalBeatActivity;` directly below it. Its comment: set by every AI-only beat; absent before the first beat, on a human battle, and on a snapshot saved before this field existed; read by the battle prompts.
   - Change the end-reason type to `aiOnlyEndReason?: 'elimination' | 'mutual' | 'idle' | 'quiet' | 'exit' | 'beat_limit';`. Rewrite its comment: `quiet` is `QUIET_BEATS_TO_END` beats in a row with no fighting; `exit` is both commanders leaving, on any beat; `idle` is no longer set and stays so an older save or recording still loads.
3. **Add `src/shared/tacticalQuietBeat.ts`.** It imports only types from `./tacticalBattleTypes` and `./ipc/combatDiceTypes`, and `computeGridDistancePure` from `./h3GridRangePure`. It imports no logger. It exports:

   ```ts
   export const QUIET_BEATS_TO_END = 3;

   export function countAttackShots(rolls: readonly CombatDiceRoll[], player: string): number;

   export type TacticalSubUnitPosition = Pick<TacticalSubUnitSnapshot, 'id' | 'player' | 'h3Index'>;

   export function anySubUnitMovedCloser(args: {
     readonly before: readonly TacticalSubUnitPosition[];
     readonly after: readonly TacticalSubUnitPosition[];
     readonly leadPartyId: string;
     readonly opposingPartyId: string;
   }): boolean;

   export function isQuietBeat(args: {
     readonly activity: TacticalBeatActivity;
     readonly movedCloser: boolean;
   }): boolean;
   ```

   - `countAttackShots` counts the rolls whose `player` equals `player` and whose `kind` is `'ranged'` or `'airStrike'`.
   - `anySubUnitMovedCloser` looks only at sub-units whose `player` is one of the two party ids. For each sub-unit in `after` that has an entry with the same `id` in `before` and a different `h3Index`:
     1. its enemies are the sub-units of the other party;
     2. `distanceBefore` is the smallest `computeGridDistancePure` from its `before` cell to an enemy cell in `before`;
     3. `distanceAfter` is the smallest `computeGridDistancePure` from its `after` cell to an enemy cell in `after`;
     4. a `null` distance to one enemy is skipped; when no enemy has a distance, that side of the comparison is `null`.

     The function returns true as soon as one sub-unit has two numbers with `distanceAfter < distanceBefore`. It returns false when no sub-unit does, including when a side has no sub-unit.
   - `isQuietBeat` returns true only when `leadShots` is 0, `opposingShots` is 0, `meleeFought` is false, and `movedCloser` is false.
   - Each declaration has an orienting comment. The comment of `anySubUnitMovedCloser` says why the test is per sub-unit: a withdrawing side does not keep the battle going, and a holding screen does not hide an advance.
4. **`aiOnlyTacticalBeat.ts`: `keptOrdersForSeat`.** The quiet rule no longer needs the count of applied orders.
   - Remove `applied` from the return type and the returned object.
   - Remove the `owns` helper and the `named` sum, which only fed `applied`.
   - The function now returns `{ movement }`. Update its orienting comment.
5. **`aiOnlyTacticalBeat.ts`: the streak and the end reason.** In `applyAiOnlyTacticalBeat`, replace the two lines that compute `applied` and `streak`, and the end-reason chain, with this shape:

   ```ts
   const attackRolls = [...airAndRanged.airStrikeDiceRolls, ...airAndRanged.rangedDiceRolls];
   const activity: TacticalBeatActivity = {
     beatNumber: current.tacticalTurnNumber,
     leadShots: countAttackShots(attackRolls, lead),
     opposingShots: countAttackShots(attackRolls, opposing),
     meleeFought: melee.meleeDiceRolls.length > 0,
   };
   const quiet = isQuietBeat({
     activity,
     movedCloser: anySubUnitMovedCloser({
       before: current.subUnits,
       after: melee.battle.subUnits,
       leadPartyId: lead,
       opposingPartyId: opposing,
     }),
   });
   const streak = quiet ? (current.quietBeatStreak ?? 0) + 1 : 0;
   ```

   The end-reason chain becomes, in this order:
   - `wiped === 'mutual'` → `'mutual'`;
   - `wiped != null` → `'elimination'`;
   - `streak >= QUIET_BEATS_TO_END` → `'quiet'`;
   - both drafts have `exitBattle === true` → `'exit'`, with no beat-number test;
   - the existing beat-limit test → `'beat_limit'`.
6. **`aiOnlyTacticalBeat.ts`: the stored snapshot.** In the object passed to `withFortificationOwnersFromGameDb`, replace `idleBeatStreak: streak` with `quietBeatStreak: streak`, and add `lastBeatActivity: activity`. In the `logDebug('applyAiOnlyTacticalBeat stored', ...)` call, replace `idleBeatStreak: streak` and `applied` with `quietBeatStreak: streak`, `quiet`, and `activity`.
7. **`aiOnlyTacticalBeat.ts`: comments.** Rewrite the orienting comment of `applyAiOnlyTacticalBeat` so it lists the endings in the new order and names `QUIET_BEATS_TO_END`. Remove every mention of idle beats and of five completed beats from this file.
8. **`computeTacticalBattleSnapshot.ts`.** On the one line found in Phase 0, replace `idleBeatStreak: 0` with `quietBeatStreak: 0`. Change nothing else in this file. Its line count must not change.
9. **`computeTacticalBattleSnapshotDb.test.ts`.** Change the one assertion on `idleBeatStreak` to `quietBeatStreak`.

### Tests

- **Add `src/shared/tacticalQuietBeat.test.ts`.** Use real cells: `latLngToCell(48.85, 2.35, 6)` from `h3-js` as the first cell, and `gridDisk` or `gridRingUnsafe` for cells one, two, and three steps away. Cover:
  - `countAttackShots` counts `ranged` and `airStrike` rolls of the named player, and ignores `returnFire`, `antiAir`, `infrastructureCounterFire`, `meleeAttack`, `meleeDefense`, and the other player's rolls;
  - `anySubUnitMovedCloser` is false when nothing moved; true when one sub-unit steps toward the enemy; false when a sub-unit steps away; false when one side stands still and the other side's only mover steps away; true when a rear sub-unit advances while a nearer sub-unit of its own side stands still; false when one side has no sub-unit; false for a sub-unit that is new in `after`;
  - `isQuietBeat` is true with no shots, no melee, and `movedCloser` false; false with `movedCloser` true; false with one shot; false with melee.
- **`aiOnlyTacticalBeat.test.ts`.** Replace `idleBeatStreak` with `quietBeatStreak` everywhere in the file. Then:
  - Rename `three idle beats set idle and leave the session active` to `three quiet beats set quiet and leave the session active`. It expects `aiOnlyEndReason` `'quiet'` and `quietBeatStreak` 3.
  - Replace `both exit flags on completed beat 4 do not end the battle` with `both exit flags end the battle on any beat`: start from `tacticalTurnNumber: 1`, send two exit flags, and expect `'exit'`.
  - Keep `one exit flag on beat 5 does not end the battle` and `both exit flags on completed beat 5 end the battle`.
  - Rename `idle wins on the limit beat` to `quiet wins on the limit beat`. It starts from `quietBeatStreak: 2` and expects `'quiet'`.
  - Keep `commander exit wins on the limit beat`.
  - Add `a beat stores what each side fired`: after one beat with two empty plans, `lastBeatActivity` equals `{ beatNumber: <the beat number before the call>, leadShots: 0, opposingShots: 0, meleeFought: false }`.
  - In `a contested cell returns melee results and dice`, add one assertion that `lastBeatActivity.meleeFought` is true and `quietBeatStreak` is 0.
  - Add `a step toward the enemy resets the quiet streak`: start from `quietBeatStreak: 2`. Find a lead sub-unit and a legal one-cell move for it that lowers its `computeGridDistancePure` distance to the nearest opposing sub-unit, by trying its `gridDisk(cell, 1)` neighbors with `tacticalComputeMovementOrderOutcomeForPlayer` the way `legalStep` in `twoAiBattleFixture.ts` does. Send that move with an empty opposing plan, and expect no end reason and `quietBeatStreak` 0. If no such move exists in the fixture, leave this test out and record that in the Completion Log; the shared tests cover the rule.
- If the three-quiet-beats test ends by a wipe or rolls melee, the fixture has placed the two sides in one cell. Do not change the rule. Record it in the Defect Inventory and stop.

### Tests to run

- `node dist/shared/tacticalQuietBeat.test.js`
- `node dist/main/tacticalBattle/aiOnlyTacticalBeat.test.js`
- `node dist/main/tacticalBattle/computeTacticalBattleSnapshotDb.test.js`
- `node dist/main/tacticalPrefetchRestartContract.test.js`
- `node dist/main/openRouter/afterResolutionTacticalBeat.test.js`
- `node dist/shared/aiOnlyBeatLimit.test.js`

### Verification

- The Phase Check passes, with `naming:check`, `check:renderer-types`, and `build:renderer`.
- `idleBeatStreak` appears nowhere under `src`.
- `'idle'` is still a member of the `aiOnlyEndReason` type, and no code under `src/main` assigns it.
- `computeTacticalBattleSnapshot.ts` has the line count Phase 0 recorded.

---

## Phase 3 — The Battle Prompt Shows the Truce and the Facts

**Edits:**
- `src/main/openRouter/sideAgreementGate.ts`
- `src/main/openRouter/sideAgreementGate.test.ts`
- `src/main/openRouter/promptSpec/diplomacyRuleText.ts`
- `src/main/openRouter/promptSpec/sideMessageRuleText.ts`
- `src/main/openRouter/promptSpec/sideMessageRuleText.test.ts`
- `src/main/openRouter/promptSpec/coachingTextTactical.ts`
- `src/main/openRouter/promptSpec/coachingText.test.ts`
- `src/main/openRouter/talk/talkPrompt.ts`
- `src/main/openRouter/talk/talkPrompt.test.ts`
- `src/main/openRouter/talk/talkPromptInput.ts`
- `src/main/openRouter/talk/ordersMessagesBlock.ts`

**Adds:**
- `src/main/openRouter/talk/battleTruceText.ts`
- `src/main/openRouter/talk/battleTruceText.test.ts`

Everything in this phase applies only when the battle is between two AI commanders (`leadPartyId` is set) and the talk stage is on.

### Steps

1. **`sideAgreementGate.ts`.** Add a second exported function. Do not change `sideAgreementsEnabled`.

   ```ts
   export function sideAgreementsShownInBattle(): boolean;
   ```

   It returns `isTalkStageEnabled()` and logs with `logTrace`. Its comment says: a battle prompt shows the commander's agreements with the side it is fighting, read-only; it does not add the agreement decisions field, which `sideAgreementsEnabled` still gates. Update the file header comment and the comment of `sideAgreementsEnabled`, which says a battle ignores agreements: a battle still makes and decides none, but it now shows them.
2. **`diplomacyRuleText.ts`: two bullet lists.** Add two exported constants with orienting comments. Each entry is **Exact**.

   `BATTLE_TRUCE_ORDERS_BULLETS`:

   ```text
   In a battle between two commanders, the Messages section lists your own agreements with the side you are fighting. They are your private record, the game does not enforce them, and you cannot make or change one during a battle. Hex codes inside an agreement are world-map codes.
   ```

   ```text
   The Messages section also gives the game's count of the shots each side fired last beat and whether there was melee. That count is a fact. Check it against what the other side told you: holding fire while the other side keeps shooting loses your units.
   ```

   ```text
   What you told the other side this beat is in the Messages section. Orders that go against it are your choice, and the other side will see what your units did in its own loss lines and shot count.
   ```

   `BATTLE_TRUCE_TALK_BULLETS`:

   ```text
   The Agreements and last beat section lists your own agreements with the side you are fighting. They are your private record, the game does not enforce them, and you cannot make or change one during a battle. Hex codes inside an agreement are world-map codes.
   ```

   ```text
   The same section gives the game's count of the shots each side fired last beat and whether there was melee. That count is a fact, and the other side sees its own copy. A promise to hold fire is checked against that count on the next beat.
   ```

3. **`sideMessageRuleText.ts`.** Give `sideMessageRuleBlock` one more optional argument, `readonly battleTruce?: boolean`. When it is true, append the `BATTLE_TRUCE_ORDERS_BULLETS` lines in the same way `agreementLines` are appended today, after them. When it is absent or false the returned text is byte-for-byte what it is now. Update the function's orienting comment.
4. **`coachingTextTactical.ts`.**
   - In `buildTacticalContextCoaching`, pass `battleTruce: gates.includeExitBattle === true && sideAgreementsShownInBattle()` to `sideMessageRuleBlock`. Import `sideAgreementsShownInBattle` from `../sideAgreementGate`, as `coachingTextStrategic.ts` imports its sibling.
   - Import `QUIET_BEATS_TO_END` from `../../../shared/tacticalQuietBeat`.
   - Replace `EXIT_BATTLE_BULLET` with a template literal. **Exact:**

     ```text
     - Set exitBattle to true when you and the other commander have agreed to stop fighting, when your side has an overwhelming numerical advantage, or when you have no order you can legally give. Set it to false otherwise. The battle ends after a beat in which both commanders set it. It also ends on its own after ${QUIET_BEATS_TO_END} beats in a row with no shots, no melee, and no unit moving closer to the enemy. A battle that ends in either way leaves both sides' units in the same world-map hex, where they fight again next turn unless one side moves out. Orders in this reply still resolve for this beat.
     ```

   - Update the comment above `EXIT_BATTLE_BULLET`.
5. **Add `battleTruceText.ts`.** One pure exported function and its argument type:

   ```ts
   export function buildBattleTruceText(args: {
     readonly opponentLabel: string;
     readonly opponentCode: string;
     readonly agreementViews: readonly SideAgreementView[] | null;
     readonly activity: TacticalBeatActivity | null;
     readonly ownIsLead: boolean;
   }): string | null;
   ```

   - It logs with `logTrace`.
   - It returns `null` when `agreementViews` is `null` and `activity` is `null`.
   - **Agreements part**, only when `agreementViews` is not `null`:
     - with at least one view, three parts joined by a newline. The first and last are **Exact**:

       ```text
       Your agreements with ${opponentLabel} (${opponentCode}), shown for reference:
       ```

       then `formatSideAgreementLines(agreementViews)`, then

       ```text
       These are your own records. You cannot make or change an agreement during a battle, and hex codes inside an agreement are world-map codes, not codes of this battle.
       ```

     - with no view, one line. **Exact:**

       ```text
       You have no agreement on record with ${opponentLabel} (${opponentCode}).
       ```

   - **Last-beat part**, only when `activity` is not `null`. `theirs` is the opponent's count and `yours` is the commander's: when `ownIsLead` is true, `yours` is `leadShots` and `theirs` is `opposingShots`; otherwise the reverse. Write a count as `1 shot` or `${n} shots`. **Exact:**

     ```text
     Last beat, counted by the game: ${opponentCode} fired ${theirs}, and you fired ${yours}. ${melee}
     ```

     where `${melee}` is `Units of both sides fought in melee.` when `meleeFought` is true and `There was no melee.` otherwise.
   - When both parts exist, join them with one blank line, agreements first.
6. **`talkPromptInput.ts`.**
   - Export the existing private function `battleOpponentSeatId`. Do not change its body.
   - Leave the `agreements:` line found in Phase 0 unchanged. A battle still passes `null` there.
   - Add a `truceText` field to the `battle` object built just above that line.
   - Do not import `sideAgreementGate` here. This function runs only inside the talk stage, so the talk stage is on, and that import would close an import cycle through `commanderPoolRounds`.
   - `truceText` is `null` unless `args.battle.leadPartyId != null` and `opponent` is found. Otherwise it is `buildBattleTruceText` with:
     - `opponentLabel`: `opponent.homeRegion`;
     - `opponentCode`: `playerIdCodeFor(opponent.seatId)`;
     - `agreementViews`: `readSideAgreementViews(args.seatId, args.turnNumber)` filtered to `view.counterpartSeatId === opponent.seatId`;
     - `activity`: `args.battle.lastBeatActivity ?? null`;
     - `ownIsLead`: `args.battle.leadPartyId === args.seatId`.
   - `args.turnNumber` is the strategic turn, which is what `readSideAgreementViews` needs.
7. **`talkPrompt.ts`.**
   - In `TalkPromptInput`, add `readonly truceText?: string | null` to the `battle` object type, with its orienting comment. It is optional so existing test inputs still compile.
   - In `buildTalkSituationText`, when `input.battle?.truceText` is a non-empty string, push `## Agreements and last beat\n${input.battle.truceText}` directly after the `## Sides` block.
   - In `buildTalkSystemText`, for the tactical scope only, set `agreementsBlock` to `\nAgreements and last beat:\n` followed by the `BATTLE_TRUCE_TALK_BULLETS` as `- ` lines and a newline, in the same shape the strategic block has. The strategic text is unchanged.
   - Update both functions' orienting comments.
8. **`ordersMessagesBlock.ts`.**
   - Keep the `agreementViews` line as it is. A battle still shows no `Your agreements:` block from it.
   - After it, compute `truceText: string | null`. It is `null` unless `args.inBattle` is true and `sideAgreementsShownInBattle()` is true. Otherwise read the active snapshot with `getActiveTacticalBattleSnapshotRef()` from `../../tacticalBattle/activeTacticalBattleRef`. When the snapshot is `null`, has no `leadPartyId`, or `battleOpponentSeatId(args.seatId, snapshot)` is `null`, `truceText` is `null`. Otherwise call `buildBattleTruceText` with the same five values as step 6. Take the opponent's label and code from the `sides` list already read in this function: the entry whose `code` equals `playerIdCodeFor(opponentSeatId)`.
   - Add `truceText === null` to the condition that returns `{ text: null, shownMessageIds: [] }`, so the section is printed when only the truce text exists.
   - Push `truceText`, when not `null`, as its own part directly before the final caution sentence (`Each message is its sender's claim...`).
   - Add `hasTruceText` to the `logTrace` call.
   - Update the function's orienting comment.

### Tests

- **Add `battleTruceText.test.ts`.** Build `SideAgreementView` values the way `sideAgreementPromptLines.test.ts` does. Cover:
  - both inputs `null` returns `null`;
  - an empty view list prints `You have no agreement on record with`;
  - one view prints the heading line, the agreement line, and the closing sentence, in that order;
  - `ownIsLead` true and false swap the two counts;
  - `1 shot` is singular, `0 shots` and `2 shots` are plural;
  - the melee sentence follows `meleeFought`.
- **`sideAgreementGate.test.ts`.** Add a test that `sideAgreementsShownInBattle()` follows the talk-stage switch, copying how the existing test sets and restores `AGENT_WARS_DISABLE_TALK`.
- **`sideMessageRuleText.test.ts`.** Add a test: with `battleTruce: true` the block contains `holding fire while the other side keeps shooting loses your units`; without it the block does not.
- **`coachingText.test.ts`.** The test near `Set exitBattle to true when` pins the old sentence. Change the pinned sentence to the new one, built with `QUIET_BEATS_TO_END`.
- **`talkPrompt.test.ts`.** Add two tests:
  - a battle input with `truceText: 'TRUCE-TEXT'` prints `## Agreements and last beat` followed by that text, after `## Sides` and before `## Your last plan`;
  - `buildTalkSystemText(label, 'tactical')` contains `Agreements and last beat:` and `buildTalkSystemText(label, 'strategic')` does not.

### Tests to run

- `node dist/main/openRouter/talk/battleTruceText.test.js`
- `node dist/main/openRouter/sideAgreementGate.test.js`
- `node dist/main/openRouter/promptSpec/sideMessageRuleText.test.js`
- `node dist/main/openRouter/promptSpec/coachingText.test.js`
- `node dist/main/openRouter/talk/talkPrompt.test.js`
- `node dist/main/openRouter/talk/ordersMessagesBlock.test.js`
- `node dist/main/openRouter/talk/requestTalk.test.js`
- `node dist/main/openRouter/talk/talkRound.test.js`
- `node dist/main/openRouter/promptContracts.test.js`
- `node dist/main/openRouter/systemPromptStability.test.js`
- `node dist/main/openRouter/tacticalPromptSectionParity.test.js`
- `node dist/main/openRouter/promptOutline.test.js`

A test in this list that fails only because it pins the exit sentence or the tactical talk system text is fixed by updating the expected text. Follow the over-600 rule for `promptContracts.test.ts`.

### Verification

- The Phase Check passes, with `naming:check`.
- `sideAgreementsEnabled('tactical')` still returns false, and its existing test still passes unchanged.
- With `battleTruce` absent, `sideMessageRuleBlock` returns the same text as before this phase. The existing tests of that function pass without edits to their expected text, apart from the Phase 1 bullet.
- `ordersMessagesBlock.test.js` passes with no edit to its existing cases.

---

## Phase 4 — The Strategic Prompt Warns About Shared Hexes

**Edits:**
- `src/main/openRouter/promptSpec/diplomacyRuleText.ts`
- `src/main/openRouter/promptSpec/diplomacyRuleText.test.ts`
- `src/main/openRouter/talk/ordersMessagesBlock.ts`
- `src/main/openRouter/briefingSectionsCampaign.ts`
- `src/main/openRouter/briefingSectionsCampaign.test.ts`
- `src/main/openRouter/requestOrdersInjection.ts`

**Adds:**
- `src/main/sideAgreements/pactContactLines.ts`
- `src/main/sideAgreements/pactContactLines.test.ts`

A commander cannot be warned about an order before it writes the order. So the warning has three parts: a rule in the system text, a list of hexes it already shares with a pact partner, and a line on a campaign target that a pact partner holds.

### Steps

1. **`diplomacyRuleText.ts`: the same-hex bullet.** Add a third entry to `SIDE_AGREEMENT_ORDERS_BULLETS`. **Exact:**

   ```text
   Units of two sides that end a turn in the same hex fight there, in melee or in a battle, whatever the two sides have agreed, and they fight again every turn until one side leaves or is destroyed. To keep an agreement, do not order units into a hex that side's units hold, and move your units out of a hex you share with them.
   ```

   Update the constant's orienting comment.
2. **Add `pactContactLines.ts`.** Three exports, each with an orienting comment.

   ```ts
   export const PACT_CONTACT_MAX_HEXES_PER_SIDE = 6;

   export function sharedHexesWithPactPartners(args: {
     readonly ownSeatId: string;
     readonly partnerSeatIds: ReadonlySet<string>;
     readonly units: readonly { readonly player: string; readonly h3Index: string; readonly embarkedOnCarrierUnitId?: string | null }[];
   }): ReadonlyMap<string, readonly string[]>;

   export function formatPactContactLines(args: {
     readonly sharedByPartner: ReadonlyMap<string, readonly string[]>;
     readonly sideName: (seatId: string) => string;
     readonly hexCode: (h3Index: string) => string | null;
   }): string | null;

   export function readPactContactLines(args: {
     readonly seatId: AiSeatId;
     readonly sideName: (seatId: string) => string;
   }): string | null;
   ```

   - `sharedHexesWithPactPartners` is pure and logs with `logTrace`. It ignores a unit whose `embarkedOnCarrierUnitId` is set. For each partner it returns the hexes that hold at least one unit of `ownSeatId` and at least one unit of that partner, sorted as strings. A partner with no shared hex has no entry.
   - `formatPactContactLines` is pure and logs with `logTrace`. It returns `null` when no partner has a hex with a code. Otherwise it returns the heading and one line per partner, partners in the map's order. A hex whose `hexCode` is `null` is left out. At most `PACT_CONTACT_MAX_HEXES_PER_SIDE` codes are listed, joined with `, `; when more exist, ` and ${n} more` follows the last one. **Exact** heading and line:

     ```text
     Contact with sides you have an active agreement with:
     ```

     ```text
     - ${name}: your units and theirs are both in ${codes}. Units in the same hex fight at the end of every turn until one side leaves.
     ```

   - `readPactContactLines` logs with `logDebug`. Inside one `try`, it:
     1. reads the turn with `readTurnNumberOrFirst(gameDbOps.getOne)`;
     2. reads the roster with `readSeatRoster(gameDbOps)` and keeps the ids of seats that pass `isSeatActive`, other than `args.seatId`;
     3. calls `readActivePactPartnerSeatIds` from `../openRouter/campaignPactPartners`;
     4. returns `null` when that set is empty;
     5. reads units with `listUnitsForSnapshot()` from `../gameDb`;
     6. returns `formatPactContactLines` with `hexCode` set to `STRATEGIC_ZONE_CODE_TRANSLATOR.h3ToCode` from `./sideAgreementZoneCodes`.

     In the `catch`, it logs with `logError` and returns `null`, so a failed read never stops a prompt.
   - Its comment says why reading every unit is safe: only hexes that hold the commander's own units are reported, and a unit always sees what stands in its own hex.
3. **`ordersMessagesBlock.ts`.**
   - Compute `contactText: string | null`. It is `null` when `args.inBattle` is true or `args.includeAgreements` is false. Otherwise it is `readPactContactLines({ seatId: args.seatId, sideName })`, where `sideName` returns `${side.label} (${side.code})` for the entry of `sides` whose `code` equals `playerIdCodeFor(seatId)`, and the code alone when no entry matches.
   - Add `contactText === null` to the condition that returns the empty block.
   - Push `contactText`, when not `null`, as its own part directly after the `Your agreements:` part, or where that part would be when there are no agreement views.
   - Add `hasContactText` to the `logTrace` call.
4. **`briefingSectionsCampaign.ts`.**
   - Give `buildCampaignObjectiveSection` one more optional argument, `readonly pactPartnerSeatIds?: ReadonlySet<string>`.
   - After the `- Target:` line is built, when `owner` is not `null` and `campaignTargetHolderSeatId(state, objective.targetH3)` is a member of `pactPartnerSeatIds`, add this line directly after the `- Target:` line. **Exact:**

     ```text
     - Agreement: you have an active pact with ${owner}, which holds ${target}. Marching on ${target} breaks that pact.
     ```

   - With the argument absent the section is byte-for-byte what it is now.
5. **`requestOrdersInjection.ts`.** At the call found in Phase 0, pass `pactPartnerSeatIds`. Compute it only when that call is made:

   ```ts
   readActivePactPartnerSeatIds({
     seatId,
     turnNumber: args.state.turnNumber,
     activeSeatIds: new Set(
       (args.state.seats ?? []).filter((seat) => seat.seatId !== seatId && seat.outTurn == null).map((seat) => seat.seatId)
     ),
   })
   ```

   Import `readActivePactPartnerSeatIds` from `./campaignPactPartners`.

### Tests

- **Add `pactContactLines.test.ts`.** Use plain strings for hexes and seat ids from `AI_SEAT_IDS`. Cover:
  - a hex with one own unit and one partner unit is reported for that partner;
  - a hex shared with a side that is not a partner is not reported;
  - an embarked unit does not make a hex shared;
  - `formatPactContactLines` returns `null` for an empty map, prints the heading and one line for one partner, leaves out a hex with no code, and writes ` and 2 more` when a partner has eight coded hexes.
- **`diplomacyRuleText.test.ts`.** Add an assertion that `SIDE_AGREEMENT_ORDERS_BULLETS` has three entries and that one contains `whatever the two sides have agreed`.
- **`briefingSectionsCampaign.test.ts`.** Add one test, copying the nearest existing call: with the target's holder in `pactPartnerSeatIds` the section contains `- Agreement: you have an active pact with`; with an empty set it does not.

### Tests to run

- `node dist/main/sideAgreements/pactContactLines.test.js`
- `node dist/main/openRouter/promptSpec/diplomacyRuleText.test.js`
- `node dist/main/openRouter/promptSpec/sideMessageRuleText.test.js`
- `node dist/main/openRouter/briefingSectionsCampaign.test.js`
- `node dist/main/openRouter/talk/ordersMessagesBlock.test.js`
- `node dist/main/openRouter/campaignPactPartners.test.js`
- `node dist/main/openRouter/promptContracts.test.js`
- `node dist/main/openRouter/systemPromptStability.test.js`
- `node dist/main/openRouter/promptOutline.test.js`

A test in this list that fails only because it counts or pins the agreement bullets is fixed by updating the expected count or text.

### Verification

- The Phase Check passes, with `naming:check`.
- `check:circular` prints no cycle. If it reports one that runs through the `../gameDb` import in `pactContactLines.ts`, read the units with `listUnitsForSnapshotWithGetAll(gameDbOps.getAll)` from `../gameDb/unitSnapshotRead` instead, run the check again, and record the change in the Completion Log. If a cycle remains, record it in the Defect Inventory and stop.
- `ordersMessagesBlock.test.js` passes with no edit to its existing cases.
- `readActivePactPartnerSeatIds` is still defined once, in `campaignPactPartners.ts`.

---

## Phase 5 — The Engine Does Not Target a Pact Partner on Its Own

**Edits:**
- `src/main/openRouter/campaignTargetSelection.ts`
- `src/main/openRouter/campaignTargetSelection.test.ts`
- `src/main/openRouter/campaignObjectiveFlow.ts`
- `src/main/openRouter/campaignRules.test.ts`
- `src/main/operations/seaOperationCandidates.ts`
- `src/main/openRouter/campaignObjectiveResolution.ts`
- `src/main/openRouter/campaignObjectiveResolution.test.ts`
- `src/main/operations/operationTurnFlow.ts`
- `src/main/operations/operationRules.ts`
- `src/main/openRouter/promptSpec/campaignRuleText.ts`
- `src/main/openRouter/promptSpec/operationRuleText.ts`
- `src/main/openRouter/promptSpec/operationRuleText.test.ts`
- `src/main/openRouter/promptSpec/coachingTextStrategic.ts`

**Adds:**
- `src/main/operations/operationRules.test.ts`

### Steps

1. **Rename `finishingExemptSeatIds` to `pactPartnerSeatIds`** in the five files Phase 0 listed. This is a rename only. In `seaOperationCandidates.ts` it changes one property name on one line and nothing else.
2. **`campaignTargetSelection.ts`: mark the cities.**
   - Add `readonly heldByPactPartner?: boolean;` to `CampaignCity`. Its comment: true when the viewer has an active pact with the city's holder; absent means false; the engine never chooses such a city on its own.
   - In `knownCampaignCities`, set `heldByPactPartner: args.pactPartnerSeatIds.has(city.ownerSeatId)` in the same `map` that sets `ownerNearKnockout`.
   - Rewrite the comment of the `pactPartnerSeatIds` argument: the viewer's active pact partners; their cities get no finishing weight and are marked `heldByPactPartner`.
   - Do not change `chooseCampaignTarget`, `campaignCityWeight`, or the scoring.
3. **`campaignObjectiveResolution.ts`: skip and drop.** In `resolveCampaignObjective`:
   - Add a local helper before the `if`:

     ```ts
     const heldByPactPartner = (h3Index: string): boolean =>
       args.cities.some((city) => city.h3Index === h3Index && city.heldByPactPartner === true);
     ```

   - Add one more condition to the `if` that decides to choose a new target: `(stored.source === 'engine' && heldByPactPartner(stored.targetH3))`. Put it after the `!candidateH3s.has(stored.targetH3)` test, joined with `||`.
   - Change the `choices` line found in Phase 0 so it also leaves out pact partners' cities:

     ```ts
     const choices = args.cities.filter((city) => city.h3Index !== args.skip?.targetH3 && city.heldByPactPartner !== true);
     ```

   - Leave the `else` branch unchanged. A target with `source: 'commander'` is kept even when its holder is a pact partner.
   - When no other city can be chosen, the function already returns `null`. Keep that.
   - Update the function's orienting comment to state both rules.
4. **`operationRules.ts`: the engine's launch rule.** This file holds the operation limits and has no function yet. Add one pure exported function at the end of it, with the imports it needs (`logTrace` from `../logger`, and the `OperationCandidate` type from `../../shared/operationTypes`):

   ```ts
   export function engineMayLaunchOperation(args: {
     readonly candidate: Pick<OperationCandidate, 'clear' | 'defenders'>;
     readonly maxDefenders: number;
     readonly objectiveHolderSeatId: string | null;
     readonly pactPartnerSeatIds: ReadonlySet<string>;
   }): boolean;
   ```

   - It returns false when `objectiveHolderSeatId` is not `null` and is in `pactPartnerSeatIds`.
   - Otherwise it returns `candidate.clear || candidate.defenders <= maxDefenders`, the rule `operationTurnFlow.ts` has today.
   - It logs with `logTrace`.
5. **`operationTurnFlow.ts`.** In `advanceOperationsForSeat`, directly before the `engineMayLaunch` line found in Phase 0:
   - build `controllerByH3`, a `Map` from `state.strategicControl ?? []` of `h3Index` to `controllerPlayerId`;
   - read `pactPartnerSeatIds` with `readActivePactPartnerSeatIds`, using `seatId`, `state.turnNumber`, and the ids of the seats in `state.seats ?? []` that are not `seatId` and have `outTurn == null`.

   Then make `engineMayLaunch` call `engineMayLaunchOperation`, imported from `./operationRules`, with `maxDefenders: settings.engineLaunchMaxDefenders` and `objectiveHolderSeatId: controllerByH3.get(candidate.objectiveH3) ?? null`. Both existing uses of `engineMayLaunch` stay as they are. Import `readActivePactPartnerSeatIds` from `../openRouter/campaignPactPartners`.
6. **`campaignRuleText.ts`.** Give `buildCampaignRuleBlock` a second parameter, `agreementsEnabled = false`. When it is true, append these sentences, after one space, to the end of the last paragraph in both of its variants. **Exact:**

   ```text
   The engine never picks a city held by a side you have an active non_aggression or ceasefire_in_place agreement with, and it drops a target it picked itself once you record one with that city's holder. To attack such a side, name its city in "campaignTarget".
   ```

   With the parameter false the block is byte-for-byte what it is now. Add `agreementsEnabled` to the `logTrace` call and to the orienting comment.
7. **`operationRuleText.ts`.** Give `buildOperationRuleBlock` a third parameter, `agreementsEnabled = false`. When it is true, append this sentence, after one space, to the paragraph that ends `It never launches a land row.` **Exact:**

   ```text
   It never launches a row against a city held by a side you have an active non_aggression or ceasefire_in_place agreement with; launch that row yourself to attack that side.
   ```

   With the parameter false the block is byte-for-byte what it is now. Update the `logTrace` call and the orienting comment.
8. **`coachingTextStrategic.ts`.** In `buildStrategicContextCoaching`, pass `sideAgreementsEnabled('strategic')` as the new last argument of both `buildCampaignRuleBlock` and `buildOperationRuleBlock`. That function is already imported there.

### Tests

- **`campaignTargetSelection.test.ts`.** After the rename, add one test: a city whose owner is in `pactPartnerSeatIds` comes back with `heldByPactPartner` true, and another city with it false.
- **`campaignObjectiveResolution.test.ts`.** Build cities the way the file already does, and add three tests:
  - with no stored objective, the engine skips the best-scoring city when it is `heldByPactPartner` and chooses the next one;
  - a stored objective with `source: 'engine'` whose city becomes `heldByPactPartner` is replaced by another city, with `chosenTurn` set to the current turn;
  - a stored objective with `source: 'commander'` whose city is `heldByPactPartner` is kept.

  Add a fourth: when the only reachable city is `heldByPactPartner` and nothing is stored, the result is `null`.
- **Add `operationRules.test.ts`.** It tests `engineMayLaunchOperation` only. Cover: a clear candidate launches; a held candidate launches only at or under `maxDefenders`; a clear candidate whose objective holder is a pact partner does not launch; a `null` holder is treated as no pact.
- **`operationRuleText.test.ts`.** Add one test: the sentence is present with the third argument true and absent with it false.

### Tests to run

- `node dist/main/openRouter/campaignTargetSelection.test.js`
- `node dist/main/openRouter/campaignObjectiveResolution.test.js`
- `node dist/main/openRouter/campaignRules.test.js`
- `node dist/main/openRouter/campaignSeaRules.test.js`
- `node dist/main/openRouter/campaignObjectiveFlow.test.js`
- `node dist/main/openRouter/campaignPactPartners.test.js`
- `node dist/main/operations/operationRules.test.js`
- `node dist/main/operations/operationTurnFlow.test.js`
- `node dist/main/operations/operationCandidates.test.js`
- `node dist/main/openRouter/promptSpec/operationRuleText.test.js`
- `node dist/main/openRouter/promptSpec/coachingText.test.js`
- `node dist/main/openRouter/promptContracts.test.js`
- `node dist/main/openRouter/systemPromptStability.test.js`

A test in this list that fails only because it pins the campaign or operation rule text with agreements on is fixed by updating the expected text.

### Verification

- The Phase Check passes, with `naming:check`. `check:circular` prints no cycle; if the new import in `operationTurnFlow.ts` adds one, move nothing else: record it in the Defect Inventory and stop.
- `finishingExemptSeatIds` appears nowhere under `src`.
- `chooseCampaignTarget` is unchanged.

---

## Phase 6 — A Viewer Can Tell a Truce From a Hang

**Edits:**
- `src/shared/aiOnlyBeatLimit.ts`
- `src/shared/aiOnlyBeatLimit.test.ts`
- `src/shared/battleHeaderText.ts`
- `src/shared/battleHeaderText.test.ts`
- `src/renderer/chrome/battleHeader.ts`
- `src/renderer/tactical/tacticalExitFlow.ts`
- `src/renderer/tactical/aiOnlyResultAutoClose.ts`
- `src/renderer/chrome/controlTooltipText.ts`

**Adds:** none.

### Steps

1. **`aiOnlyBeatLimit.ts`: which endings use the timed notice.** Add one exported function, and use it in the two lines Phase 0 found.

   ```ts
   export function aiOnlyEndReasonUsesTimedNotice(reason: TacticalBattleSnapshot['aiOnlyEndReason']): boolean;
   ```

   - It returns true for `'beat_limit'`, `'exit'`, and `'quiet'`, and false for every other value and for `undefined`.
   - `aiOnlyBattleEndPresentation` returns `'timed_dialog'` when auto-advance is on and that function is true, and `'leave_now'` otherwise. With auto-advance off it still returns `'dialog_until_ok'`.
   - `aiOnlyLeaveStartsNextTurn` uses that function in place of the `=== 'beat_limit'` test.
   - Rewrite the orienting comments of `AiOnlyBattleEndPresentation`, `aiOnlyBattleEndPresentation`, `aiOnlyLeaveStartsNextTurn`, `aiOnlyTimedNoticeStillCloses`, and `AI_ONLY_BEAT_LIMIT_NOTICE_MS`, which all say only the beat limit uses the timed notice. Do not rename `AI_ONLY_BEAT_LIMIT_NOTICE_MS`.
2. **`aiOnlyBeatLimit.ts`: the two result sentences.** Add two exported functions beside `formatAiOnlyBeatLimitSentence`. **Exact** return values:

   ```ts
   export function formatAiOnlyExitSentence(): string;      // 'Disengaged: both commanders left the battle.'
   export function formatAiOnlyQuietSentence(beats: number): string;   // `Disengaged: ${beats} beats passed with no fighting.`
   ```

3. **`battleHeaderText.ts`.** Give `formatBattleHeaderStatusParts` and `formatBattleHeaderStatus` one more optional input, `readonly quietBeats?: number`, with its orienting comment. In `formatBattleHeaderStatusParts`, when `quietBeats` is a number of 1 or more, append this part to `afterBeatsLeft` directly after the phase text and before the date. **Exact:**

   ```text
    · Holding fire (${quietBeats} of ${QUIET_BEATS_TO_END} quiet beats)
   ```

   The part starts with a space, the middle dot the other parts use, and a space. Import `QUIET_BEATS_TO_END` from `./tacticalQuietBeat`. With `quietBeats` absent or 0 the status is byte-for-byte what it is now.
4. **`battleHeader.ts`.** In `renderBattleHeader`, pass `quietBeats` to `formatBattleHeaderStatusParts`: `battle.quietBeatStreak ?? 0` when `battle.leadPartyId != null` and `battle.aiOnlyEndReason == null`, and `0` otherwise.
5. **`tacticalExitFlow.ts`: `aiOnlyResultSentence`.**
   - The `'exit'` line returns `formatAiOnlyExitSentence()`.
   - Add a line for `'quiet'` that returns `formatAiOnlyQuietSentence(QUIET_BEATS_TO_END)`.
   - Import the two sentence functions from `../../shared/aiOnlyBeatLimit`, beside the imports already taken from it, and `QUIET_BEATS_TO_END` from `../../shared/tacticalQuietBeat`.
   - Keep the `'idle'` line and its sentence, for older saves and recordings.
   - Update the comments in this file that say only the beat-limit notice closes itself.
6. **`aiOnlyResultAutoClose.ts`.** Change only comments: the timer closes the timed result notice, which a beat limit, a commander exit, and a quiet ending all use.
7. **`controlTooltipText.ts`.** In the comment above `aiOnlyTimedResultOkTooltipText`, change `while the beat-limit notice is counting down` to `while a timed result notice is counting down`. Change nothing else. This file is over 600 lines; its line count must not change.

### Tests

- **`aiOnlyBeatLimit.test.ts`.**
  - In `aiOnlyBattleEndPresentation times only a beat limit while auto-advancing`, rename the test to say which endings are timed, and add: `'exit'` and `'quiet'` with auto-advance on are `'timed_dialog'`; with it off they are `'dialog_until_ok'`. The `'idle'` and `'elimination'` lines stay.
  - In the `aiOnlyLeaveStartsNextTurn` test, add: an open dialog with `'exit'` or `'quiet'` and auto-advance on returns true.
  - Add a test for the two sentences.
- **`battleHeaderText.test.ts`.** Add a test: `quietBeats: 2` puts `Holding fire (2 of 3 quiet beats)` in the status after `Tactical planning` and before the date; `quietBeats: 0` and an absent value leave the status unchanged.

### Tests to run

- `node dist/shared/aiOnlyBeatLimit.test.js`
- `node dist/shared/battleHeaderText.test.js`
- `node dist/shared/tacticalQuietBeat.test.js`

### Verification

- The Phase Check passes, with `check:renderer-types` and `build:renderer`.
- `controlTooltipText.ts` has the line count Phase 0 recorded.
- Search `src` for `The commanders left the battle.` The text appears nowhere.

---

## Phase 7 — Docs, Release Notes, Version, Final Checks, and Hand-Off

**Edits:**
- `doc/combat-rules-v3.md`
- `doc/hybrid-ai.md`
- `doc/how-to-play.md`
- `doc/commander-messages.md`
- `doc/ux/tactical-battle-controls.md`
- `doc/ux/control-tooltips.md`
- `doc/ux/modes-and-transitions.md`
- `doc/ux/top-bar.md`
- `doc/ai-commander-prompts/source-inventory.md`
- `doc/ai-commander-prompts/tactical-prompt.md`
- `doc/ai-commander-prompts/talk-prompt.md`
- `doc/ai-commander-prompts/strategic-prompt.md`
- `doc/ai-commander-prompts/assembly-contract.md`
- `doc/ai-commander-prompts/variants.md`
- `doc/ai-commander-prompts/example-strategic-prompt.md`
- `doc/ai-commander-prompts/example-tactical-prompt.md`
- `doc/README.md`
- `README.md`
- `package.json`
- `package-lock.json`
- `.github/ISSUE_TEMPLATE/bug_report.yml`

**Adds:**
- `doc/release-notes/v3.7.0.md`

Match the voice and layout of each document. Name the symbol behind every rule and number. Use no plan vocabulary. A document over 600 lines must not grow: change words in place.

### Steps

1. **`doc/combat-rules-v3.md`, the list "A tactical battle ends in one of these ways" and the paragraph after it.**
   - Rewrite item 4 as the quiet rule: the heading becomes **Quiet beats**; state the three conditions (no attack shot, no melee, no sub-unit moving closer to the enemy), name `quietBeatStreak`, `QUIET_BEATS_TO_END`, `isQuietBeat`, and `anySubUnitMovedCloser` in `src/shared/tacticalQuietBeat.ts`; say both sides map back with the same rule as before.
   - Rewrite item 5: both flags end the battle on any beat. Remove the sentences about `tacticalTurnNumber` being at least 6.
   - In the paragraph that begins `` `applyAiOnlyTacticalBeat` checks these in order``, give the new order: a wiped side, then the quiet streak, then the flags, then the beat limit.
   - In the next section, where the two-party pass lists the endings it covers, replace "the idle ending" with "the quiet ending".
2. **`doc/hybrid-ai.md`.**
   - In the tactical bullet that mentions idle beats, replace the idle wording with the quiet rule in one clause. Add that an AI-only beat stores `lastBeatActivity` for the battle prompts.
   - In the paragraph that begins `Candidate cities are hexes with`, add that a city whose holder is an active pact partner is marked `heldByPactPartner`, that `resolveCampaignObjective` never chooses one and drops one it chose itself, and that a target the commander named is kept.
   - In the paragraph that begins `The engine launches only when`, add that the engine never launches against a city held by an active pact partner (`engineMayLaunchOperation` in `src/main/operations/operationRules.ts`).
3. **`doc/commander-messages.md`, the Agreements section.** Its first paragraph says no order is "blocked, warned about, or changed" because of an agreement, that agreements exist on the world map only, and that a battle shows none. Rewrite those sentences in place:
   - no order is blocked or changed because of an agreement, and the briefing now tells a commander when its units share a hex with an active pact partner (`readPactContactLines`) and when its campaign target is held by one;
   - the engine's own choices avoid active pact partners: the campaign target and the operations it launches itself;
   - a battle between two AI commanders shows each one its own agreements with the other side, read-only (`buildBattleTruceText`, `sideAgreementsShownInBattle`); a battle still creates, changes, and decides none, and a battle talk reply still has no `agreements` list.
4. **`doc/ux/tactical-battle-controls.md`.**
   - Where the AI-only result sentences are listed, replace "The commanders left the battle." with "Disengaged: both commanders left the battle." and add "Disengaged: 3 beats passed with no fighting." Keep the no-orders sentence and say it shows only for a battle saved before 3.7.0.
   - Every sentence that says only the beat-limit notice closes itself or starts the next turn now names three endings: the beat limit, a commander exit, and a quiet ending (`aiOnlyEndReasonUsesTimedNotice`).
   - Add `src/shared/tacticalQuietBeat.ts` to the code entry points.
5. **`doc/ux/control-tooltips.md` and `doc/ux/modes-and-transitions.md`.** Each mentions the beat-limit notice. Where a sentence says that notice alone closes itself or starts the next turn, name the three endings, as above. Change nothing else in them.
6. **`doc/ux/top-bar.md`.** Where the battle header's status line is described, add that an AI-only battle shows "Holding fire (N of 3 quiet beats)" after the phase while `quietBeatStreak` is 1 or more (`formatBattleHeaderStatusParts`).
7. **`doc/ai-commander-prompts/tactical-prompt.md`.**
   - Replace the quoted exit sentence in the coaching list with the new one.
   - In the part that describes the Messages section of a battle, add the truce text: the commander's agreements with the opponent and the last-beat line, built by `buildBattleTruceText`, shown only in a battle between two AI commanders while the talk stage is on (`sideAgreementsShownInBattle`).
   - Add the three `BATTLE_TRUCE_ORDERS_BULLETS` to the description of the messages rule block. The sentence there that ends `A battle prompt has no agreement text.` becomes: a battle between two AI commanders adds those three bullets while `sideAgreementsShownInBattle()` is true, and no other battle prompt has agreement text.
8. **`doc/ai-commander-prompts/source-inventory.md`.** In the `# Messages` row, add the battle truce text and the contact lines with their builders. Where the strategic context contents are listed, add the third agreement bullet and the campaign and operation sentences.
9. **`doc/ai-commander-prompts/talk-prompt.md`.**
   - The sentence "A battle prompt has no `Agreements:` block" becomes: a battle prompt has an `Agreements and last beat:` block with the `BATTLE_TRUCE_TALK_BULLETS`.
   - In the situation list, add the block `## Agreements and last beat` after `## Sides`, in a battle only, and say `readTalkPromptInput` fills it from `buildBattleTruceText`.
   - Update the quoted trust bullet and the description of the loss legend.
   - State that the reply shape in a battle is unchanged and `allowAgreements` is still false there.
10. **`doc/ai-commander-prompts/strategic-prompt.md`.**
   - Update the quoted loss legend and the trust bullet.
   - Add the third agreement bullet.
   - Describe the contact lines (`readPactContactLines`), where they sit in the Messages section, and `PACT_CONTACT_MAX_HEXES_PER_SIDE`.
   - Describe the `- Agreement:` line of the Campaign Objective section.
   - Add the campaign and operation sentences, and say they appear only when `sideAgreementsEnabled('strategic')` is true.
11. **`doc/ai-commander-prompts/assembly-contract.md` and `variants.md`.** Update every sentence that quotes or describes a text this plan changed: the trust bullet, the exit bullet, the `exitBattle` row ("True asks to leave after this beat's orders resolve" stays; add that two flags end the battle on any beat), and the agreement blocks.
12. **The two example prompts.** In `example-strategic-prompt.md` and `example-tactical-prompt.md`, replace each old sentence with its new text in place: the trust bullet in both, the exit bullet in the tactical one, and the agreement bullets in the strategic one. Do not regenerate the files and do not add lines to `example-strategic-prompt.md`, which is over 600 lines. If a new bullet cannot be added without a new line there, add it to the end of the neighboring bullet's line and record that in the Completion Log.
13. **`doc/how-to-play.md`.** Find the paragraph on leaving a battle (`You win a battle by destroying the other side's units`). Change words in place so it also says that a battle between two AI commanders ends on its own when both leave or when three beats pass with no fighting, and the result reads "Disengaged". Add no line.
14. **Stale-text searches.** Search `doc/` and `README.md` for each of these. No maintained document may still state the old behavior. Leave `doc/release-notes/` files before 3.7.0 and the historical documents in `AGENTS.md` as they are.
    - `idleBeatStreak`
    - `three idle`
    - `at least 6`
    - `The commanders left the battle`
    - `overwhelming numerical advantage, or when you have no order` (must now be preceded by the agreed-to-stop clause wherever the sentence is quoted)
    - `whatever its messages say` (each quote must match the new bullet)
    - `finishingExemptSeatIds`
    - `A battle prompt has no agreement text`
    - `A battle shows, creates, changes, and decides none`
    - `warned about`
    - `beat-limit notice` (each sentence that says it alone is timed must now name the three endings)
15. **`doc/README.md`, the engine constants section.**
    - In the `AI-only battles` row, add that a quiet beat is `isQuietBeat` and the streak that ends a battle is `QUIET_BEATS_TO_END`, both in `src/shared/tacticalQuietBeat.ts`, and that the endings that use the timed notice are `aiOnlyEndReasonUsesTimedNotice`.
    - In the paragraph that begins `The campaign objective uses`, add `heldByPactPartner` beside `CAMPAIGN_PACT_KINDS`, and `engineMayLaunchOperation` in `src/main/operations/operationRules.ts`.
    - Add `PACT_CONTACT_MAX_HEXES_PER_SIDE` in `src/main/sideAgreements/pactContactLines.ts` to the sentence in `doc/commander-messages.md` that lists the agreement limits.
16. **Version.**
    - `package.json`: `"version": "3.7.0"`.
    - `package-lock.json`: the two `"version": "3.6.1"` entries that belong to this package, at the top of the file and in the `""` package entry, become `3.7.0`. Change no other line.
    - `.github/ISSUE_TEMPLATE/bug_report.yml`: the placeholder becomes `3.7.0`.
    - `README.md`: the two `Agent Wars v3.6.1` file names and the `**Version:** 3.6.1` line become 3.7.0. Add a `- **3.7.0** ...` line above the `- **3.6.1** ...` line, one sentence in the same style, from the summary in step 17.
    - `doc/README.md`: `Shipping version as of this writing: **3.7.0**`. Add a `Release **3.7.0** ...` sentence above the `Release **3.6.1** ...` sentence, in the same style.
    - Do not change `doc/save-files.md` or `doc/region-summary-1.md`, whose "3.6.1" mentions describe that release.
17. **Add `doc/release-notes/v3.7.0.md`.** Copy `doc/release-notes/v3.6.1.md`, then:
    - replace `3.6.1` with `3.7.0` in the Downloads table, the run instructions, and the heading `## What's in 3.6.1`;
    - in the Saves bullet, a save "from 2.12.0 through 3.6.0" becomes "from 2.12.0 through 3.6.1", and "will not load in 3.6.1" becomes "will not load in 3.7.0";
    - replace the bullets under `## What's in 3.7.0` with the bullets below;
    - under `## Earlier 3.x releases`, add a new `<details>` block for **3.6.1** above the **3.6.0** block, in the same shape, holding the four bullets that were under "What's in 3.6.1".

    The bullets, to be written in the file's voice:
    - **Truces show in battle.** In a battle between two AI commanders, each one sees its own agreements with the other side and the game's count of the shots each side fired last beat.
    - **Quiet battles end.** A battle between two AI commanders ends when both leave, on any beat, or after three beats with no shots, no melee, and no unit moving closer to the enemy. The result reads "Disengaged", and the header counts the quiet beats.
    - **Loss reports say who fired first.** A commander's loss lines now say that return fire answers its own shot, and that melee happens whenever two sides share a hex.
    - **Pact partners are not targeted by accident.** The engine no longer picks a pact partner's city for the campaign or launches an operation against one on its own. A commander can still name either. The briefing lists hexes a commander shares with a pact partner.
    - **Regional knockout threshold.** On a regional map a side is knocked out for home control at 90% of its home's city cells (`REGIONAL_HOME_CONTROL_WIN_MIN_URBAN_SHARE`); the global map stays at 80%. This was already in the code before these changes; confirm the two constants in `src/shared/victoryRules.ts` and state the values they hold.
18. Run `node scripts/check-doc-links.cjs` on every document this phase edited or added. Fix any broken link you added.
19. Run the full Phase Check with `naming:check`, `check:renderer-types`, and `build:renderer`, then every test any phase named, once more.
20. `npm run rebuild:native:electron`

### Manual checklist for the user

Run `npm test` and `npm run ui:smoke`, then in the app:

1. Start a four-commander Western Europe match with the observe checkbox on and the talk stage on.
2. Watch for a battle in which both commanders talk about holding fire. The header shows "Holding fire (1 of 3 quiet beats)", then 2. After the third quiet beat a notice reads "Disengaged: 3 beats passed with no fighting.", closes after 3 seconds, and the next turn starts.
3. Watch a battle in which one side advances for several beats before the first shot. It does not end early: the header shows no "Holding fire" text while a unit is closing.
4. In `debug.log` or the Commander tab, open a battle orders prompt. The Messages section holds "Your agreements with ..." or "You have no agreement on record with ...", and from beat 2 a line "Last beat, counted by the game: ...".
5. In the same prompt, a return-fire loss line reads "Return fire (the destroyed units fired first)".
6. In a strategic orders prompt of a commander with an active pact, the Campaign Objective target is not a city of that pact partner unless the line says "You chose it".
7. Load a save made in 3.6.1 during a battle. The battle continues and ends normally.
8. Open a recording made in 3.6.1 in replay. A battle that ended idle still shows "The battle ended with no orders left to carry out."

### Verification

- Every Phase Check and named test passes.
- The searches in step 14 find nothing stale in maintained documents.
- `scripts/ui-smoke/ui-smoke-beat-limit.cjs` was not edited. Its scene runs one beat with no orders at the limit, which is one quiet beat and still ends by the beat limit.
- `package.json`, `package-lock.json`, `README.md`, `doc/README.md`, and the new release notes all say 3.7.0.

---

## Reliability Checklist

Before the hand-off, confirm each line and record it in the Completion Log.

- [ ] No file this plan edited or added is over 600 lines, except the two that were already over and did not grow.
- [ ] Every new or changed declaration has a full orienting comment, and no comment describes the idle rule, the five-beat minimum, or a beat-limit-only timed notice.
- [ ] No seat id is written as a string literal in production code.
- [ ] No plan vocabulary appears in `src`, `doc`, `README.md`, or a test name.
- [ ] With the talk stage off, the battle orders system text and situation text are unchanged from before this plan, apart from the exit bullet and the loss wording.
- [ ] With no agreement on record, the strategic orders prompt gains only the one same-hex bullet and the two rule sentences.
- [ ] A human battle's snapshot never has `quietBeatStreak` above 0 or a `lastBeatActivity`.
- [ ] `sideAgreementsEnabled('tactical')` is still false, and the battle envelope has no new field.
- [ ] No order, shot, melee, or battle is refused or skipped because of an agreement.
- [ ] `check:circular` prints no cycle, and `naming:check` passes.
- [ ] No file under `scripts/` was edited.
- [ ] Nothing was committed.

---

## Success Definition

- A battle in which neither side shoots, fights in melee, or closes ends after three beats with the reason `quiet`, and two exit flags end one on any beat.
- A commander in an AI-only battle can read its own agreements with the opponent and the game's count of last beat's shots, in both the talk step and the orders step.
- A loss to return fire or melee is worded so it cannot be read as an attack by the other side.
- The engine picks no campaign target and launches no operation against an active pact partner on its own, and a commander can still do both.
- A viewer sees quiet beats counted in the header and a "Disengaged" result.
- Saves and recordings from 3.6.1 still load and replay.

---

## Phase 0 Inventory

Record here: each static check result, each named test that failed before any edit, each anchor count, the two file lists, and the line count of every file this plan edits.

**Recorded 2026-11-26.** `rebuild:native:node` succeeded with no running Electron app.

| Check | Result |
| --- | --- |
| `build:main` | pass |
| `lint` | pass |
| `check:circular` | pass, no cycle |
| `check:renderer-types` | pass (it reports 5 resolved baseline entries; the baseline is not refreshed) |
| `naming:check` | pass |

- **Named tests:** every test file named in Phases 1 to 6 that exists passed, as did `campaignLiftLaunch`, `campaignTargetOverride`, and `campaignSeaFlow`. No failure to carry.
- **Anchors:** all 21 anchors appear exactly once in the file named.
- **File lists:** `finishingExemptSeatIds` and `idleBeatStreak` each appear in exactly the five files listed.
- **Added files:** none exists yet.
- **Line counts before editing:**

| File | Lines | File | Lines |
| --- | --- | --- | --- |
| `recentTurnLossLines.ts` | 506 | `recentTurnLossLines.test.ts` | 210 |
| `sideMessageRuleText.ts` | 61 | `sideMessageRuleText.test.ts` | 37 |
| `tacticalBattleTypes.ts` | 492 | `aiOnlyTacticalBeat.ts` | 256 |
| `aiOnlyTacticalBeat.test.ts` | 211 | `computeTacticalBattleSnapshot.ts` | 690 |
| `computeTacticalBattleSnapshotDb.test.ts` | 404 | `sideAgreementGate.ts` | 25 |
| `sideAgreementGate.test.ts` | 27 | `diplomacyRuleText.ts` | 105 |
| `diplomacyRuleText.test.ts` | 30 | `coachingTextTactical.ts` | 189 |
| `coachingText.test.ts` | 421 | `talkPrompt.ts` | 435 |
| `talkPrompt.test.ts` | 165 | `talkPromptInput.ts` | 216 |
| `ordersMessagesBlock.ts` | 114 | `briefingSectionsCampaign.ts` | 135 |
| `briefingSectionsCampaign.test.ts` | 182 | `requestOrdersInjection.ts` | 407 |
| `campaignTargetSelection.ts` | 308 | `campaignTargetSelection.test.ts` | 117 |
| `campaignObjectiveFlow.ts` | 340 | `campaignRules.test.ts` | 461 |
| `seaOperationCandidates.ts` | 508 | `campaignObjectiveResolution.ts` | 171 |
| `campaignObjectiveResolution.test.ts` | 212 | `operationTurnFlow.ts` | 368 |
| `operationRules.ts` | 168 | `campaignRuleText.ts` | 53 |
| `operationRuleText.ts` | 65 | `operationRuleText.test.ts` | 36 |
| `coachingTextStrategic.ts` | 449 | `aiOnlyBeatLimit.ts` | 261 |
| `aiOnlyBeatLimit.test.ts` | 100 | `battleHeaderText.ts` | 97 |
| `battleHeaderText.test.ts` | 47 | `battleHeader.ts` | 185 |
| `tacticalExitFlow.ts` | 249 | `aiOnlyResultAutoClose.ts` | 52 |
| `controlTooltipText.ts` | 663 | `combat-rules-v3.md` | 776 |
| `hybrid-ai.md` | 212 | `how-to-play.md` | 683 |
| `commander-messages.md` | 83 | `tactical-battle-controls.md` | 85 |
| `control-tooltips.md` | 262 | `modes-and-transitions.md` | 201 |
| `top-bar.md` | 128 | `source-inventory.md` | 308 |
| `tactical-prompt.md` | 274 | `talk-prompt.md` | 41 |
| `strategic-prompt.md` | 493 | `assembly-contract.md` | 239 |
| `variants.md` | 333 | `example-strategic-prompt.md` | 669 |
| `example-tactical-prompt.md` | 201 | `doc/README.md` | 149 |
| `README.md` | 346 | `package.json` | 114 |
| `package-lock.json` | 7459 | `bug_report.yml` | 135 |
| `campaignLiftLaunch.ts` | 268 | `campaignLiftLaunch.test.ts` | 498 |
| `campaignTargetOverride.ts` | 134 | `campaignTargetOverride.test.ts` | 306 |
| `campaignSeaRules.ts` | 521 | `campaignSeaRules.test.ts` | 135 |

All edited files use CRLF line endings.

---

## Defect Inventory

Record here: the phase, the failing check or test, what was tried, and whether the phase was reverted.

---

## Completion Log

Record here, per phase: the Phase Check results, the tests run, every file edited or added with its final line count, every file edited outside the phase's list and why, and every place a sketch and the real file disagreed.

### Decisions Before Phase 1

A pre-flight read found three gaps between the plan's steps and its Locked Decisions. The user chose these on 2026-11-26, and all three are added to Phase 5:

1. **Campaign sea lift.** `campaignLiftForSeat` launches no new lift when the engine chose the stored target and its holder is an active pact partner. A commander-named target still gets its lift. Running lifts continue.
2. **Naming the current target.** When `campaignTarget` names the stored target, the engine chose it, and its holder is an active pact partner, the objective is stored as commander-named. Every other echo still changes nothing.
3. **Sea route test cap.** Pact partner cities do not take `CAMPAIGN_SEA_CITY_TEST_LIMIT` slots. The stored or commander-named city is still always tested.

The user also asked for one fresh-context review of the whole diff after Phase 7, with serious findings fixed test-first.

### Phase 1

- **Phase Check:** `build:main`, `lint`, `check:circular` pass.
- **Tests run (new assertions seen failing first):** all eight named files pass.
- **Edited (lines):** `recentTurnLossLines.ts` 521, `recentTurnLossLines.test.ts` 229, `sideMessageRuleText.ts` 61, `sideMessageRuleText.test.ts` 38.
- **Outside the list:** `src/main/recentTurnNotesSection.test.ts` (435). Two assertions pin the old melee line. Updated to the new line. Not run, because no phase names it.
- `LOSS_CAUSE_LABELS` is unchanged, and `whatever its messages say` appears once in `sideMessageRuleText.ts`.

### Phase 2

- **Phase Check:** `build:main`, `lint`, `check:circular`, `naming:check`, `check:renderer-types`, `build:renderer` pass. `static/renderer.js` did not change.
- **Tests run:** all six named files pass. The new shared and beat tests failed first, against a placeholder rule module and the old end-reason chain.
- **Edited or added (lines):** `tacticalQuietBeat.ts` 155, `tacticalQuietBeat.test.ts` 121, `tacticalBattleTypes.ts` 548, `aiOnlyTacticalBeat.ts` 269, `aiOnlyTacticalBeat.test.ts` 268, `computeTacticalBattleSnapshot.ts` 690 (unchanged count), `computeTacticalBattleSnapshotDb.test.ts` 404.
- **Outside the list:** `testSupport/twoAiBattleFixture.ts` (109). One comment said "Idle and exit cases"; it now says "Quiet and exit cases".
- The step-toward-the-enemy test found a legal closing step in the fixture, so it is included.
- `idleBeatStreak` appears nowhere under `src`, and no code under `src/main` assigns `'idle'`.

### Phase 3

- **Phase Check:** `build:main`, `lint`, `check:circular`, `naming:check` pass.
- **Tests run (new assertions seen failing first):** all twelve named files pass.
- **Edited or added (lines):** `sideAgreementGate.ts` 39, `sideAgreementGate.test.ts` 40, `diplomacyRuleText.ts` 132, `sideMessageRuleText.ts` 63, `sideMessageRuleText.test.ts` 49, `coachingTextTactical.ts` 194, `coachingText.test.ts` 439, `talkPrompt.ts` 453, `talkPrompt.test.ts` 183, `talkPromptInput.ts` 244, `ordersMessagesBlock.ts` 149, `battleTruceText.ts` 136, `battleTruceText.test.ts` 111.
- **Differences from the sketches:** the argument type is the exported `BattleTruceTextArgs`. Each builder computes its truce text in a private helper (`battleTalkTruceText`, `battleOrdersTruceText`). `battleOpponentSeatId` gained a `logTrace` call, because it is now exported.
- **Added test:** `coachingText.test.ts` also checks that only a battle between two commanders with talk on gets the three truce bullets.
- **Wiring check:** no named test covers the two builders end to end, so a throwaway script outside the repo ran a two-commander battle and confirmed both prompts print the truce text, the last-beat line from beat 2, and nothing with talk off.
- `sideAgreementsEnabled('tactical')` is still false, and `ordersMessagesBlock.test.ts` is unchanged.

### Phase 4

- **Phase Check:** `build:main`, `lint`, `check:circular` (no cycle), `naming:check` pass. The `../gameDb` import in `pactContactLines.ts` needed no replacement.
- **Tests run (new assertions seen failing first):** all nine named files pass. `ordersMessagesBlock.test.ts` and `sideMessageRuleText.ts` are unchanged by this phase.
- **Edited or added (lines):** `diplomacyRuleText.ts` 133, `diplomacyRuleText.test.ts` 35, `ordersMessagesBlock.ts` 177, `briefingSectionsCampaign.ts` 140, `briefingSectionsCampaign.test.ts` 198, `requestOrdersInjection.ts` 419, `pactContactLines.ts` 125, `pactContactLines.test.ts` 90.
- **Differences from the sketches:** the contact text is computed in a private helper (`strategicContactText`). Its `sideName` returns the id itself for text that is not a seat id, because `playerIdCodeFor` accepts only seat ids.
- **Wiring check:** a throwaway script outside the repo confirmed that a strategic Messages section names the shared hex after the agreements, and shows no contact lines in a battle or without agreements.
- `readActivePactPartnerSeatIds` is still defined once.

### Phase 5

- **Phase Check:** `build:main`, `lint`, `check:circular` (no cycle), `naming:check` pass.
- **Tests run (new assertions seen failing first):** the thirteen named files pass, and so do `campaignLiftLaunch`, `campaignTargetOverride`, and `campaignSeaFlow`.
- **Edited or added (lines):** `campaignTargetSelection.ts` 318, `campaignTargetSelection.test.ts` 123, `campaignObjectiveFlow.ts` 340, `campaignRules.test.ts` 461, `seaOperationCandidates.ts` 508 (one property name), `campaignObjectiveResolution.ts` 182, `campaignObjectiveResolution.test.ts` 251, `operationTurnFlow.ts` 382, `operationRules.ts` 195, `operationRules.test.ts` 50, `campaignRuleText.ts` 57, `operationRuleText.ts` 68, `operationRuleText.test.ts` 45, `coachingTextStrategic.ts` 449.
- **Expected-text fix:** `campaignRules.test.ts` pins the whole city rows, so its two rows now carry `heldByPactPartner: false`.
- **Approved additions outside the list:**
  - `campaignLiftLaunch.ts` 294 and its test 520: no new campaign lift when the engine picked the target and a pact partner controls it. A commander target still gets a lift, and running lifts continue.
  - `campaignTargetOverride.ts` 163 and its test 331: naming the current target records `source: 'commander'` when the engine picked it and a pact partner holds it.
  - `campaignSeaRules.ts` 521 and its test 142: pact partner cities take none of the `CAMPAIGN_SEA_CITY_TEST_LIMIT` slots. `mustTestH3` is still always tested.
- **Correction to the question asked before Phase 1:** the lift gap is not "the turn a pact is recorded". Talk is saved before the orders consult, and the consult resolves the objective, so an engine target held by a new partner is dropped that same turn. The lift block matters when a partner takes the target during resolution, or when a consult stops before it resolves the objective. For the same reason the commander promotion has no normal path that reaches it. It is defensive only.
- **Note:** the campaign rule text still says "Sending the current target changes nothing", which the promotion makes inexact in that one case.
- `finishingExemptSeatIds` appears nowhere under `src`, and `chooseCampaignTarget` is unchanged.

### Phase 6

- **Phase Check:** `build:main`, `lint`, `check:circular` (no cycle), `naming:check`, `check:renderer-types`, `build:renderer` pass. The renderer build regenerated the tracked bundle `static/renderer.js`.
- **Tests run (new assertions seen failing first):** the three named files pass.
- **Edited (lines):** `aiOnlyBeatLimit.ts` 297, `aiOnlyBeatLimit.test.ts` 113, `battleHeaderText.ts` 119, `battleHeaderText.test.ts` 58, `battleHeader.ts` 187, `tacticalExitFlow.ts` 256, `aiOnlyResultAutoClose.ts` 52, `controlTooltipText.ts` 663 (unchanged count).
- **Outside the list (comments only):** `renderer.ts` (850, unchanged count) and `tacticalAnnihilationDialog.ts` (102) each had one comment saying only the beat limit uses the timed notice, which the Reliability Checklist forbids.
- "The commanders left the battle." appears nowhere under `src`.

### Phase 7

- **Phase Check:** `build:main`, `lint`, `check:circular` (no cycle), `naming:check`, `check:renderer-types` (the same 5 resolved baseline entries as Phase 0; not refreshed), and `build:renderer` pass.
- **Tests run again:** all 37 named and approved test files pass.
- **Docs:** every file in the edit list is updated and `doc/release-notes/v3.7.0.md` is added. Documents over 600 lines did not grow (`combat-rules-v3.md` 776, `how-to-play.md` 683, `example-strategic-prompt.md` 669). `check-doc-links.cjs` passes on every edited or added document.
- **Stale-text searches:** no maintained document states the old behavior. The only remaining hits are unrelated uses of "at least 6" and earlier-release summaries inside the release notes.
- **Outside the list:** `doc/ai-commander-prompts/information-decision-model.md` (its operation and loss rules would have been incomplete).
- **Beyond the steps, in the example prompts:** `example-strategic-prompt.md` also gained the campaign and operation sentences, appended to existing lines with the third agreement bullet. `example-tactical-prompt.md`, which shows a battle between two commanders, gained the three battle truce bullets.
- **Line endings:** `campaignRules.test.ts` had been rewritten with LF during Phase 5; it is CRLF again.
- **Ruling:** `rebuild:native:electron` runs after the final review, because review fixes need the Node build. Cost if wrong: none once it has run.

### Reliability Checklist

- Confirmed: no edited or added file over 600 lines grew; the changed declarations carry orienting comments, and the one comment still naming an idle ending describes older saves and recordings.
- Confirmed: no seat id literal in changed production code; no plan vocabulary in `src`, `doc`, `README.md`, or a test name.
- Confirmed: the battle truce bullets and text are gated on the talk stage; contact lines and the campaign Agreement line need an active pact partner.
- Confirmed: only `applyAiOnlyTacticalBeat` raises `quietBeatStreak` or sets `lastBeatActivity`; a human battle's snapshot gets neither.
- Confirmed: `sideAgreementsEnabled('tactical')` is still false, the battle envelope has no new field, and nothing refuses an order because of an agreement.
- Confirmed: `check:circular` and `naming:check` pass, no file under `scripts/` was edited, and nothing was committed.

### Final Review

One fresh reviewer read the whole diff: no Critical finding, two Important, four Minor.

- **Refuted:** "battles against a human describe a truce section that is never printed". `battleOpponentSeatId` returns null in a battle with no `leadPartyId`, so that battle has no recipient and `requestTalk` returns before it builds the system text. This is unchanged from 3.6.1. No code change; one sentence in `talk-prompt.md` now says such a battle makes no talk call.
- **Fixed (test failing first):** a drop shot down by anti-air could be a quiet beat. `isQuietBeat` now takes `antiAirFired`, and any anti-air die keeps a beat from being quiet. Test: "an air drop shot down by anti-air is not a quiet beat". **Ruling:** this adds a condition to the plan's quiet rule; the attack shot count is unchanged. Cost if wrong: a battle with fire on a drop runs a few beats longer.
- **Fixed (test failing first):** the loss legend now says that, in a battle, a shot-down drop is also listed as "Return fire" although the units lost fired no shot. **Ruling:** the Exact line note and trust bullet are unchanged, so for that one case they still say the units fired first. Cost if wrong: a commander misreads who started that exchange.
- **Also fixed:** the stale header comments in `campaignPactPartners.ts`, and the regional share in the release notes' Saves sentence about 3.5.0 matches.
- **Deferred minor:** with talk turned off, pacts already stored still steer the engine and print the campaign Agreement line, while the rule sentences and agreement list are hidden.
- **Deferred minor:** campaign lifts and operations read the hex controller, while campaign target choice reads the fog-aware holder. The active seat id expression is repeated in four files.
- **Deferred minor:** the Exact exit bullet mentions agreeing to stop even with talk off, and "Sending the current target changes nothing" is inexact in the promotion case.
- **Rulings on items the reviewer did not judge:** the replay leave path is unchanged by this work; ending on beat 1 is the plan's decision; the same-hex bullet matches the melee rule (any hex with two sides, air units included); battles launch no missiles.
- **Checks after the fix:** the full Phase Check and all 37 named and approved test files pass.

### Second Review Pass

The user asked for a completeness and reliability review with targeted testing only. Choices: run the named tests and their direct dependents, reword the drop wording so it is true, fix the three deferred minors, and use no extra reviewer. This section supersedes the deferred minors above.

- **Fixed:** loss lines, the legend, and the trust bullet say "attacked first". The legend says that, in a battle, this includes an air drop that anti-air shoots down. This replaces the exact "fired first" wording, including the text manual checklist item 5 quotes.
- **Fixed:** with the talk stage off, `readActivePactPartnerSeatIds` returns no partners, so stored pacts steer nothing and print no `Agreement:` line.
- **Fixed:** the engine target, campaign lifts, engine operations, sea route slots, and the prompt lines judge a pact partner's city the same fog-aware way (`cityHeldByPactPartner`). The active seat id expression is `activeOtherSeatIds`; `postureFit.ts` and `productionExposure.ts` were not otherwise edited and keep their inline copies.
- **Fixed:** the exit bullet mentions agreeing to stop only while the talk stage is on, and "changes nothing" became "does not restart its phase".
- **Cleanup:** the talk and orders prompts share `readBattleTruceText`; `quietBeatStreak` and `lastBeatActivity` are readonly; the `sideAgreementGate.ts` comment names the engine's pact read.
- **Tests:** new assertions in `recentTurnLossLines`, `sideMessageRuleText`, `coachingText`, `campaignPactPartners`, `campaignLiftLaunch`, and `operationTurnFlow` were seen failing first. The `ordersMessagesBlock` battle truce test covers existing behavior.
- **Ruling:** the talk-off gate also changes behavior from before this work: the finishing-weight exemption and the posture "(active pact)" mark now see no pacts with talk off. Cost if wrong: a run with talk off that relied on stored pacts treats those partners as ordinary enemies.
- **Ruling:** `cityHeldByPactPartner` expects the seat's own snapshot; every caller passes one. Cost if wrong: a later caller with an unfiltered snapshot would let the engine judge a holder the commander cannot see.
- **Checks:** `build:main`, `lint`, `check:circular`, `naming:check`, `check:renderer-types`, and `build:renderer` pass. The 37 named test files and 58 direct dependents pass (95 files, 623 tests, 0 failed). `npm test` and `ui:smoke` were not run.
- **Documentation pass:** the information model, crosswalk, assembly contract, source inventory, `doc/README.md`, `combat-rules-v3.md`, `save-files.md`, `commander-messages.md`, and `how-to-play.md` gained the remaining statements. Documents over 600 lines did not grow, and the link check passes on those edited.
- **Outside the list:** `promptContracts.ts`, `campaignPactPartners.test.ts`, `operationTurnFlow.test.ts`, and `crosswalk.md`. `save-files.md` gained a paragraph on battles saved before 3.7.0; the version step's instruction to leave its "3.6.1" mentions alone still holds.
- **Open:** `save-files.md` says a change to the shape of `game_config` JSON needs a new versioned key or a save version bump. The battle snapshot changed under its `_v1` key, as the plan's no-migration decision allows. The rule's wording is unchanged.

### Live Run and Prompt Formatting

The user watched a live match with four AI commanders and asked for three formatting faults found in the captured prompts to be fixed. All three were older than this work.

- **Fixed:** the displaced-features footnote under the operational map ended with a newline that the callers' blank line doubled (`renderDisplacedFeaturesLine`).
- **Fixed:** the mercenary id-prefix note sat directly under the Sides table; it is now its own paragraph (`buildSidesPromptBlock`).
- **Fixed:** battle Recent Turn Notes blocks read `Beat N:` instead of `Turn N:` (`periodLabel`). **Ruling:** this reverses an earlier test that asserted Turn labels in battle. Cost if wrong: a model trained on the old label reads one prompt line differently.
- **Tests (seen failing first):** `briefingMapSection`, `sidesBlock`, and `recentTurnNotesSection`; the tests that import the changed files and the tests that mention the changed strings pass. `build:main`, `lint`, `naming:check`, and `check:circular` pass. The native module is back on the Electron build.
- **Docs:** `tactical-prompt.md` and `talk-prompt.md` state the battle label. `strategic-prompt.md` and `hybrid-ai.md` had two long paragraphs split, with the wording unchanged.

### Battle Prompt Follow-Ups

After the live run, the user asked for three prompt changes.

- **Count wording:** the last-beat line reads `{n} attack shots` (`shotCount` in `battleTruceText.ts`). Both truce bullet lists say attack shots are ranged shots and air strikes, and that return fire and anti-air are not counted, so a zero count can sit beside a loss.
- **Exit warning:** `exitBattleBullet` adds that either ending still destroys every world-map unit with fewer than half its sub-units left, on both sides. No rule changed.
- **Heading:** a battle's notes section is `## Recent Beat Notes` (`SECTION_TITLE_RECENT_BEAT_NOTES`, kept in `recentTurnNotesSection.ts` because `sectionHeadings.ts` is over 600 lines). The shared trust bullet names both headings. The battle talk system text names the beat heading.
- **Ruling:** the trust bullet is shared between world-map and battle prompts, so it names both headings instead of taking a scope argument. Cost if wrong: one clause on the world map mentions a heading that only appears in battle.
- **Tests (seen failing first):** `battleTruceText`, `ordersMessagesBlock`, `coachingText`, `recentTurnNotesSection`, `sectionHeadings`, `sideMessageRuleText`, `talkPrompt`. All 28 tests under `promptSpec/` and `talk/`, plus the briefing assemblers, pass; so do the 13 tests that import the changed files. `build:main`, `lint`, `naming:check`, `check:circular` pass.
