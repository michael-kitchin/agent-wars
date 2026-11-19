# Commander Agreements Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** AI commanders can record private agreements with other sides, see the game's record of losses both ways since each agreement began, and decide each turn whether to keep or break each one. Both diplomacy prompts state plainly that diplomacy is a way to win the war. Every agreement change and every keep-or-break decision is a recorder event. Every prompt also makes clear which side a code such as `a2` stands for, and talk prompts can be logged to disk like orders prompts. All of this is in the main process. Nothing in the renderer changes.

**Shape:** Phase 0 records a baseline. Phases 1 through 13 each add one piece that can be verified on its own or with earlier phases. Phases 1 to 4 build data and pure logic that nothing calls yet. Phases 5 to 8 change the talk stage. Phases 9 to 11 change the orders stage. Phase 12 makes side codes easier to read in every prompt: a Sides table in battle orders prompts, a clearer column name, and home regions in loss lines. Phase 13 writes talk prompts to the prompt logs. Phase 14 updates the docs, runs the final verification, and hands the user a manual checklist.

**Tech:** TypeScript (Electron main), `better-sqlite3`, OpenRouter chat completions, `node:test`, ESLint with the local `orienting-comments` and `seat-id-literals` rules, `scripts/check-circular-deps.cjs`.

**Builds on:** The talk stage (`src/main/openRouter/talk/`), stances with trust and threat (`side_stances`), the side combat record (`src/main/briefing/sideCombatRecord*.ts`), and the match recorder. All of them are already in the tree.

---

## How to Use This Plan

- Run the phases in order, back to back. Do not pause between phases for review.
- The user chose to run the full Verification Bar only in Phase 0 and Phase 14. Every other phase ends with the shorter Phase Check, which is not optional.
- **Stop only when a verification fails** and the phase's "If verification fails" steps (where present) do not fix it. Then revert that phase (see Backup and Revert), record the failure in the Defect Inventory, and stop. Tell the user which phase failed and why.
- Never commit, push, stash, or run `git checkout`, `git restore`, `git reset`, or `git clean`. The user reviews every change.
- Read the whole phase before you edit anything. Each phase lists the files it **Adds** and **Edits**. Do not edit other files, except to remove an import that lint reports unused in a listed file, or to fix a test that fails only because of a change the phase names. Record every such file in the Completion Log.
- Find code by the quoted text, not by a line number. Line numbers in this plan are approximate.
- **Code blocks are sketches.** Write the real code from the file you just read. When a sketch and the file disagree, the file wins. Record the difference in the Completion Log.
- **Prompt text in this plan is not a sketch.** Copy every string in a "Prompt text" block exactly, including punctuation and capitalization.
- **Tests come first.** Write a new module's test with the module, and run it before any existing code calls the module. A phase that changes existing code runs that code's existing tests before and after the change.

### Backup and Revert

Nothing is committed. Before each phase, copy every file the phase **edits** into a backup folder outside the repo. Run this from the repo root. Set `$step` to the phase number and `$files` to that phase's **Edit** list.

```powershell
$step = '1'
$files = @('src/main/gameDb/schema.ts')
$backup = Join-Path $env:TEMP "aw-side-agreements\step-$step"
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

Every phase from 1 to 13 ends with the Phase Check, run from the repo root:

```powershell
npm run build:main
npm run lint
npm run check:circular
```

Then run, with `node dist/main/<path>.test.js` (or `dist/shared/...`), every test file the phase adds and every existing test file of a file the phase edits. All must pass.

- The Phase Check is required. Do not skip it, and do not replace it with a partial build.
- `check:circular` must print **exactly** the cycles recorded in Phase 0. A new cycle fails the phase.
- Record each Phase Check result in the Completion Log.

### Verification Bar

The full Verification Bar runs twice: once in Phase 0, to record the baseline, and once in Phase 14, after all edits. Run these from the repo root:

```powershell
npm test
npm run build:renderer
npm run check:circular
```

- When the final Verification Bar fails, find the phase whose change caused the failure (the Completion Log lists each phase's files), fix it within that phase's file lists, record the defect in the Defect Inventory, and run the full bar again.
- `npm test` runs the native rebuild, `build:main`, `lint`, `naming:check`, `check:renderer-types`, every compiled `dist/main/**/*.test.js` and `dist/shared/**/*.test.js`, and `notices:check`. It takes about 20 minutes. New `*.test.ts` files under `src/main` or `src/shared` are discovered automatically.
- `npm run check:circular` passes when it prints **exactly** the cycles recorded in Phase 0 and no others. Type-only imports are erased and cannot cause a cycle.
- Never refresh `scripts/renderer-typecheck-baseline.json`, `scripts/circular-deps-baseline.json`, or any other baseline file to make a gate pass.
- **Quick loop while you work:** `npm run build:main`, then `node dist/main/<path>.test.js` (or `dist/shared/...`). This is a shortcut only. The full bar decides pass or fail.
- **Native module lock.** If `npm test` fails in `rebuild:native:node` with `EBUSY` on `better_sqlite3.node`, close any running Electron app, rename `node_modules/better-sqlite3/build/Release/better_sqlite3.node` to `better_sqlite3.node.locked`, rerun `npm test`, then delete the `.locked` file.
- **No test may call a real model.** Every test that reaches the chat transport installs a fake with `setChatTransportOverrideForTests` (in `src/main/openRouter/openRouterChatTransport.ts`) or a fake runner, and removes it in a `finally`.
- `npm run build:renderer` may rewrite `static/renderer.js` because the renderer imports shared constants. That is expected. No file under `src/renderer` may change.

---

## Non-Goals

- No renderer change, no new IPC channel, and no change to any shared IPC type. Agreements are not shown to the human player anywhere.
- The human player keeps no agreement record. An AI commander may record an agreement **with** the human seat, like any other side.
- The game never enforces an agreement. No order is blocked, warned about, or changed because of an agreement.
- No shared or global record of agreements, and no reputation score. Each commander's record is its own.
- No agreements in battles. Battle talk and battle orders do not show, create, change, or decide agreements.
- No territory evidence. Evidence is losses only.
- No doctrine-specific agreement guidance. Every doctrine gets the same text.
- No charts and no relationship-graph changes.
- No change to `README.md`.
- Do not edit anything under `.spec/completed/`.
- Do not "improve" code next to a phase's target. Make only the edits listed.

---

## Conventions

These come from `.cursor/rules/` and `AGENTS.md`. Lint enforces some of them.

- **Orienting comments.** Every new or updated declaration needs a JSDoc block: functions (exported or private), constants, types, interfaces, every field of an interface or parameter-object type, and every declaration whose signature or behavior this plan changes (for example `parseTalkReply`, `buildTalkSystemText`, and `sideMessageRuleBlock`). Each block has a one-line summary, then `Purpose:` (or `Contract:` for types and interfaces), `When to use:`, `Expected outcome:`, and `Exceptions:`. **Do not copy generic filler.** Write what the code does, when to call it, what it returns, and what it throws.
- **Logging in `src/main`.** A new **exported** function that changes state logs `logDebug` on entry. A new exported getter or pure builder logs `logTrace`. Log context carries ids, keys, and counts only. **Never log agreement terms, a reason, message text, a prompt body, or an API key.** Log lengths and counts instead. New **private** helpers add no log lines. Every caught error logs `logError` with the error and the ids involved.
- **No logging in `src/shared` or `src/renderer`.**
- **Names.** camelCase files, directories, and functions, PascalCase types, UPPER_SNAKE constants. Follow `doc/naming-conventions-contract-v1.md`: the only role suffixes are `Handler`, `Helpers`, `Guards`, `Adapter`, `Pipeline`, `Core`, and `Types`, and `Utils`, `Impl`, `Manager`, `Service`, `Processor`, and `Controller` are banned. Use the file names this plan gives. `npm test` runs `naming:check`.
- **No plan vocabulary in version control.** Words such as "phase", "step 3", or "execution plan" must never appear in code, comments, test names, or `doc/`. Describe what the code does instead.
- **Vocabulary.** In code the new thing is a **side agreement** (`SideAgreement…`, `side_agreements`), following `SideMessage…` and `SideStance…`. The commander-facing word is **agreement**. A **decision** is a keep-or-break choice made in the orders reply. The **standing** of an agreement is what it is right now (`active`, `expired`, and so on), worked out from its stored status, its end turn, and whether the other side is still in the match. The **ledger** is the list of one commander's agreements as the prompts show them.
- **Seat ids.** Production code uses `HUMAN_SEAT_ID`, `AI_SEAT_IDS`, and the guards in `src/shared/seatIds.ts`, never string literals. Tests may use literals.
- **Size limits.** Files should stay under 600 lines and must stay under 1000. Functions take 6 or fewer named parameters. Use a parameter object for more.
- **Large files.** `orderResponseParsing.ts` (764 lines), `requestOrdersApplyParsed.ts` (763), `requestOrdersFlow.ts` (649), and `consultPromptParts.ts` (609) are already past the 600-line target. This plan adds only a few call lines and fields to them. All logic goes in new files. None may pass 1000 lines.
- **`readonly`.** Mark parameter arrays and object fields `readonly` where they are not reassigned.
- **Tests.** Test happy paths and essential failures only. A new test file copies the imports and structure of the nearest sibling test file named in its phase.
- **Docs.** `AGENTS.md` requires `doc/` to change in the same change as the code. Each phase names the documents it touches. Your final message names every document you updated.
- **Cached prompt text.** System prompts are cached between turns. Nothing this plan adds to a system prompt may contain a turn number, a count that changes during a match, an agreement, a message, or any other fact that changes during a match. Constants such as `SIDE_AGREEMENT_MAX_TURNS` are allowed. Whether a system prompt includes agreement text depends only on the theater and on `isTalkStageEnabled()`, both of which are fixed for a consult. The one accepted exception is the Sides table's status column, which changes only when a side leaves the match. Strategic prompts already carry it, and battle prompts gain it in Phase 12.

---

## Locked Decisions

The user made these. Do not revisit them.

1. **Agreements are subjective.** Each AI commander keeps its own private record of what it believes it has agreed with one other side. The two sides' records may differ. No commander sees another's record. There is no shared record and no reputation score.
2. **The game never enforces an agreement.** A commander may keep or betray any agreement. This is war, and only one side wins.
3. **AI commanders only.** The human player records nothing. An AI commander may record an agreement with the human seat.
4. **World map only.** Agreements are created and changed in strategic talk, and decided in strategic orders. Battles ignore them.
5. **Five kinds:** `non_aggression`, `ceasefire_in_place`, `no_entry_zone`, `joint_action`, `information_sharing`.
6. **No handshake.** The commander sets the status itself. A new agreement is `proposed` or `active`. A commander ends one by setting `ended`, `broken_by_them`, or `broken_by_me`.
7. **Limits.** Every agreement has an end turn. An agreement covers at most 10 turns, counted from the turn it is recorded. A commander holds at most 3 open (proposed or active) agreements with any one side.
8. **Evidence is losses only.** For each open agreement, the commander sees the game's record of losses both ways since the agreement began, built from the stored loss notes that the side combat record already uses.
9. **Decisions are optional and unchecked.** The strategic orders reply may include a keep-or-break decision, with a reason, for any active agreement. No warning is given when an order hits a side the commander has an agreement with.
10. **Same guidance for every doctrine.**
11. **Recorder only.** Agreement changes and decisions are recorder events. No UI shows them.
12. **The purpose of diplomacy is stated.** The talk system prompt (both theaters) says diplomacy is a way to win the war. The strategic orders system prompt says to plan with stances and agreements in mind.
13. **Hex codes for zones.** A `no_entry_zone` agreement names briefing hex codes. The store keeps their H3 indexes, and prompts print the codes.
14. **Defaults.** With `AGENT_WARS_DISABLE_TALK` set, no agreement is recorded, shown, or decided. An agreement with a side that is out of the match has lapsed. A save from before this change loads with no agreements.
15. **Every orders prompt has a Sides table,** battles included. Its code column is named `Code (unit id prefix)`.
16. **Loss lines name the home region** after a side's code wherever they say `by`, in every prompt that prints loss lines.
17. **Talk prompts are logged like orders prompts** when `AGENT_WARS_LOG_FULL_PROMPTS` is on, and never previewed in the debug log when it is off.

---

## Design

### Data

```sql
CREATE TABLE IF NOT EXISTS side_agreements (
  agreement_id INTEGER PRIMARY KEY AUTOINCREMENT,
  seat_id TEXT NOT NULL,
  counterpart_seat_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('non_aggression', 'ceasefire_in_place', 'no_entry_zone', 'joint_action', 'information_sharing')),
  terms TEXT NOT NULL,
  zone_h3_json TEXT NOT NULL DEFAULT '[]',
  against_seat_id TEXT,
  start_turn INTEGER NOT NULL,
  end_turn INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed', 'active', 'ended', 'broken_by_them', 'broken_by_me')),
  intent TEXT NOT NULL CHECK (intent IN ('keep', 'opportunistic', 'plan_to_break')),
  reason TEXT NOT NULL,
  updated_turn INTEGER NOT NULL,
  decision TEXT CHECK (decision IS NULL OR decision IN ('keep', 'break')),
  decision_reason TEXT,
  decision_turn INTEGER,
  CHECK (seat_id <> counterpart_seat_id),
  CHECK (end_turn >= start_turn)
);
CREATE INDEX IF NOT EXISTS side_agreements_by_seat ON side_agreements (seat_id, counterpart_seat_id);
```

- `seat_id` owns the record. Only that commander ever sees it.
- `zone_h3_json` is a JSON array of strategic H3 indexes. It is `[]` unless `kind` is `no_entry_zone`.
- `against_seat_id` is the third side of a `joint_action` agreement, and null otherwise.
- `start_turn` is the strategic turn the agreement was first recorded. It never changes.
- `decision`, `decision_reason`, and `decision_turn` hold the most recent keep-or-break decision. A later decision replaces them. The history is in the recorder.
- The table is created on open, like `side_stances`. `EXPECTED_USER_VERSION` does not change.

### Standing

The standing is worked out on read and is never stored. Order matters:

| Stored status | Other side out of the match | `end_turn` < current turn | Standing |
| --- | --- | --- | --- |
| `ended`, `broken_by_them`, `broken_by_me` | any | any | the stored status |
| `proposed` or `active` | yes | any | `lapsed` |
| `proposed` or `active` | no | yes | `expired` |
| `proposed` or `active` | no | no | the stored status |

An agreement is **open** when its standing is `proposed` or `active`. Only open agreements count toward the per-side limit, can be changed, and get evidence. Only an `active` standing accepts a decision.

### The talk reply

The strategic talk reply gains a third list. Battle talk replies do not have it.

```json
{"messages":[],
 "stances":[],
 "agreements":[{"id":0,"with":"a3","kind":"non_aggression","terms":"No strikes or crossings on the Alpine frontier.","zone":[],"against":"none","endTurn":8,"status":"active","intent":"opportunistic","reason":"Frees my eastern armor for the north."}]}
```

- `id` is 0 for a new agreement, or the id of one of this commander's open agreements to change it.
- `with` and `against` are side codes from `playerIdCodeFor` (`h1`, `a1`…`a4`). `against` is `none` unless `kind` is `joint_action`.
- `zone` is a list of strategic hex codes, and is empty unless `kind` is `no_entry_zone`.
- A change must repeat the stored `with` and `kind`. It may change `terms`, `zone`, `endTurn`, `status`, `intent`, and `reason`.

### The orders reply

The strategic orders reply gains an optional field. Battle replies do not have it.

```json
"agreementDecisions":[{"id":7,"decision":"break","reason":"Their southern front is empty."}]
```

### Recorder additions

- `agreement_recorded`: written when an agreement is created, or when a change alters any stored field. Payload: `agreementId`, `seatId`, `counterpartSeatId`, `kind`, `terms`, `zoneH3`, `againstSeatId`, `startTurn`, `endTurn`, `status`, `intent`, `reason`, `previousStatus` (null for a new one). Visibility `seats:{seatId}`. No display text.
- `agreement_decision`: written for each accepted decision. Payload: `agreementId`, `seatId`, `counterpartSeatId`, `decision`, `reason`. Visibility `seats:{seatId}`. No display text.
- Both have format version 1.
- Table policy: `side_agreements` is a `frame` table.

### Module map

| File | Holds |
| --- | --- |
| `src/shared/sideAgreements.ts` | Kinds, statuses, intents, decisions, limits, guards, end-turn and standing rules. No logging |
| `src/main/gameDb/sideAgreementTable.ts` | The DDL and `ensureSideAgreementTable` |
| `src/main/gameDb/sideAgreementStore.ts` | All SQL for `side_agreements` |
| `src/main/recorder/sideAgreementRecordingEvents.ts` | The two recorder events |
| `src/main/sideAgreements/sideAgreementZoneCodes.ts` | Hex codes to H3 and back for zones |
| `src/main/sideAgreements/sideAgreementEvidence.ts` | The losses-both-ways text for one agreement. Pure |
| `src/main/sideAgreements/sideAgreementLedger.ts` | One commander's agreements as prompt views |
| `src/main/sideAgreements/sideAgreementTalkPersistence.ts` | Stores the agreements from one talk reply |
| `src/main/sideAgreements/sideAgreementDecisionApply.ts` | Stores the decisions from one orders reply |
| `src/main/openRouter/promptSpec/diplomacyRuleText.ts` | The fixed prompt sentences this plan adds |
| `src/main/openRouter/talk/sideAgreementPromptLines.ts` | Prints ledger lines for both prompts. Pure |
| `src/main/openRouter/talk/talkSideCodes.ts` | Side code to seat id, shared by both talk parsers |
| `src/main/openRouter/talk/sideAgreementReply.ts` | Parses the agreements list of a talk reply. Pure |
| `src/main/openRouter/sideAgreementGate.ts` | The one switch that says whether a consult uses agreements |
| `src/main/openRouter/sideAgreementDecisionParsing.ts` | Parses `agreementDecisions`. Pure |

**Import rule, to keep `check:circular` clean:**
- Files under `src/main/sideAgreements/` may import from `src/shared/`, the logger, leaf files under `src/main/gameDb/` (database access is `gameDbOps` from `gameDb/dbConnection`), `src/main/recorder/`, and `src/main/briefing/`. They import nothing from `src/main/openRouter/` and not the barrel `src/main/gameDb.ts`.
- `sideAgreementGate.ts` imports `isTalkStageEnabled` from `./commanderPoolRounds` and nothing else from the pool. Talk files under `src/main/openRouter/talk/` do **not** import the gate. The talk stage runs only when talk is enabled, so talk code decides by theater alone.

---

## Phase 0 — Baseline and Prerequisites

**Add:** nothing. **Edit:** nothing.

1. Run `git status --short` and record the output in the Phase 0 Inventory. Uncommitted work already in the tree is the baseline.
2. Run the Verification Bar. Record pass or fail for each command, and the exact cycle list `check:circular` prints.
3. Record the value of `EXPECTED_USER_VERSION` in `src/main/gameDb.ts`. This plan does not change it.
4. Confirm each of these exists, and record any that do not. **If any is missing, stop and tell the user.**
   - `src/main/gameDb/sideMessageTables.ts`: `SIDE_MESSAGE_TABLES_DDL`, `ensureSideMessageTables`.
   - `src/main/gameDb/additiveMigrations.ts`: `applyAdditiveSchemaMigrations`.
   - `src/main/gameDb/schema.ts`: `getFullDdl` containing `${SIDE_MESSAGE_TABLES_DDL}`.
   - `src/main/gameDb/resetGame.ts`: the text `run('DELETE FROM side_stances');`.
   - `src/main/recorder/matchFramePolicy.ts`: `side_stances: { mode: 'frame' }`.
   - `src/shared/matchRecording.ts`: `MATCH_EVENT_TYPES`, `MATCH_EVENT_FORMAT_VERSIONS`, `strategicStep`.
   - `src/main/recorder/matchRecordingEvents.ts`: `recordSideStanceDeclared` (the model for the new events).
   - `src/shared/sideMessages.ts`: `cleanSideMessageText`, `SIDE_STANCE_REASON_MAX_CHARS`.
   - `src/main/briefing/sideCombatRecord.ts`: `buildSideCombatRecords`, `CombatRecordTurn`. `src/main/briefing/sideCombatRecordRead.ts`: `readSideCombatRecords`. `src/main/briefing/sideCombatRecordText.ts`: `formatSideCombatRecord`.
   - `src/main/briefing/map/hexCoordinates.ts`: `ensureStrategicCoordinateRegistryInitialized`, `getH3IndexForCode`, `getHexCodeForContext`.
   - `src/main/openRouter/talk/`: `talkReply.ts` (`parseTalkReply`, private `seatIdForSideCode`), `talkReplySchema.ts` (`buildTalkReplyResponseFormat`), `talkPrompt.ts` (`buildTalkSystemText`, `buildTalkSituationText`, `TalkPromptInput`), `talkPromptInput.ts` (`readTalkPromptInput`), `requestTalk.ts` (`requestTalk`), `talkRoundPersistence.ts` (`persistTalkRound`), `ordersMessagesBlock.ts` (`buildOrdersMessagesBlock`).
   - `src/main/openRouter/commanderPoolRounds.ts`: `isTalkStageEnabled`.
   - `src/main/openRouter/promptSpec/sideMessageRuleText.ts`: `sideMessageRuleBlock`.
   - `src/main/openRouter/promptSpec/coachingTextStrategic.ts`: the text `sideMessageRuleBlock({ talkStageEnabled: isTalkStageEnabled() })`.
   - `src/main/openRouter/promptSpec/envelopeContract.ts`: `EnvelopeGates` with `includePosture`, `ENVELOPE_FIELD_ORDER`, `envelopeFieldsForGates`, `buildRepairSchemaText`.
   - `src/main/openRouter/promptSpec/envelopeJsonSchema.ts`: `case 'posture':`.
   - `src/main/openRouter/promptContracts.ts`: `buildFinalJsonContractInstruction` with `postureParagraph`.
   - `src/main/openRouter/consultPromptParts.ts`: the text `includePosture: coachingGates.operationsEnabled === true,`.
   - `src/main/openRouter/requestOrdersFlow.ts`: `const envelopeGates: EnvelopeGates = {` and `buildOrdersMessagesBlock({ seatId, inBattle: Boolean(tacticalBattle) })`.
   - `src/main/openRouter/orderResponseParsing.ts`: `postureChoice?: Posture;` and `const rawPosture = obj.posture;`.
   - `src/main/openRouter/requestOrdersApplyParsed.ts`: `writeOperationRefusal(`.
   - `src/main/openRouter/promptSpec/sidesBlock.ts`: the text `'| Side | Unit id prefix | Home region | Status |'`.
   - `src/main/openRouter/consultPromptParts.ts`: the text `const sidesBlock = coordinateContext.mode === 'tactical'`.
   - `src/main/briefing/recentTurnLossLines.ts`: `RECENT_TURN_LOSS_LEGEND`, private `sideLabel` and `responsibleText`. `src/main/briefing/recentTurnNotesSection.ts`: the text `const seatOrder = sortSeatsByOrder(getSeatRoster())`.
   - `src/shared/shortSideName.ts`: `sideHomeNameKey`.
   - `src/main/openRouter/requestOrdersFlowSupport.ts`: `PromptLogArtifactKind`, `resolveFullPromptLogFileName`, `logPromptPreview`. `src/shared/seatIds.ts`: `aiIndexForSeatId`.
5. Confirm `src/main/testSupport/withSeatedTempGameDb.ts` exports `withSeatedTempGameDb` and `src/main/gameDb/additiveMigrations.test.ts` has `MIGRATED_TABLES`.

**Stop if** the bar fails before any edit.

---

## Phase 1 — Shared Rules

The vocabulary and the pure rules exist. Nothing uses them yet.

**Add:** `src/shared/sideAgreements.ts`, `src/shared/sideAgreements.test.ts`
**Edit:** nothing.

### Steps

1. Write `src/shared/sideAgreements.ts` (no logging, no imports from `src/main`):

   ```ts
   export const SIDE_AGREEMENT_KINDS = ['non_aggression', 'ceasefire_in_place', 'no_entry_zone', 'joint_action', 'information_sharing'] as const;
   export type SideAgreementKind = (typeof SIDE_AGREEMENT_KINDS)[number];
   export const SIDE_AGREEMENT_STATUSES = ['proposed', 'active', 'ended', 'broken_by_them', 'broken_by_me'] as const;
   export type SideAgreementStatus = (typeof SIDE_AGREEMENT_STATUSES)[number];
   export const SIDE_AGREEMENT_NEW_STATUSES = ['proposed', 'active'] as const;          // what a new agreement may start as
   export const SIDE_AGREEMENT_INTENTS = ['keep', 'opportunistic', 'plan_to_break'] as const;
   export type SideAgreementIntent = (typeof SIDE_AGREEMENT_INTENTS)[number];
   export const SIDE_AGREEMENT_DECISIONS = ['keep', 'break'] as const;
   export type SideAgreementDecision = (typeof SIDE_AGREEMENT_DECISIONS)[number];
   export type SideAgreementStanding = SideAgreementStatus | 'expired' | 'lapsed';

   export const SIDE_AGREEMENT_MAX_TURNS = 10;
   export const SIDE_AGREEMENT_MAX_OPEN_PER_SIDE = 3;
   export const SIDE_AGREEMENT_TERMS_MAX_CHARS = 160;
   export const SIDE_AGREEMENT_ZONE_MAX_HEXES = 6;
   export const SIDE_AGREEMENT_MAX_DECISIONS = 12;        // most decisions read from one orders reply
   export const SIDE_AGREEMENT_RECENTLY_CLOSED_TURNS = 2; // how long a closed agreement stays in the ledger
   export const SIDE_AGREEMENT_NO_THIRD_SIDE = 'none';    // the reply's "against" value when there is no third side

   export function isSideAgreementKind(value: unknown): value is SideAgreementKind
   export function isSideAgreementStatus(value: unknown): value is SideAgreementStatus
   export function isSideAgreementIntent(value: unknown): value is SideAgreementIntent
   export function isSideAgreementDecision(value: unknown): value is SideAgreementDecision

   export function resolveSideAgreementEndTurn(args: {
     readonly startTurn: number;
     readonly currentTurn: number;
     readonly requestedEndTurn: unknown;
   }): number | null

   export function sideAgreementStanding(args: {
     readonly status: SideAgreementStatus;
     readonly endTurn: number;
     readonly currentTurn: number;
     readonly counterpartActive: boolean;
   }): SideAgreementStanding

   export function isOpenSideAgreementStanding(standing: SideAgreementStanding): boolean
   ```

2. `resolveSideAgreementEndTurn`:
   - Returns null when `requestedEndTurn` is not an integer (`Number.isInteger`), or is less than `currentTurn`.
   - Otherwise returns `Math.min(requestedEndTurn, startTurn + SIDE_AGREEMENT_MAX_TURNS - 1)`.
   - Returns null when that result is less than `currentTurn` (an old agreement whose ten turns are already over).
3. `sideAgreementStanding` follows the Standing table in the Design section exactly.
4. `isOpenSideAgreementStanding` is true for `proposed` and `active`, and false for every other standing.

### Tests

`sideAgreements.test.ts` (copy the structure of `src/shared/sideMessages.test.ts`):
- Each guard accepts every member of its list and rejects `'allied'`, `''`, and `3`.
- `resolveSideAgreementEndTurn` with start 5, current 5: requested 8 gives 8; requested 20 gives 14; requested 4 gives null; requested `'8'` gives null; requested 8.5 gives null. With start 5, current 15: requested 15 gives null.
- `sideAgreementStanding`, as a table covering every row of the Standing table, including `active` with the other side out (gives `lapsed`), `proposed` past its end turn (gives `expired`), and `broken_by_me` past its end turn (gives `broken_by_me`).
- `isOpenSideAgreementStanding` is true only for `proposed` and `active`.

### Verification

Run the Phase Check.

---

## Phase 2 — The Table and the Store

Agreements can be stored and read. Nothing in the game calls this yet.

**Add:** `src/main/gameDb/sideAgreementTable.ts`, `src/main/gameDb/sideAgreementStore.ts`, `src/main/gameDb/sideAgreementStore.test.ts`
**Edit:** `src/main/gameDb/schema.ts`, `src/main/gameDb/additiveMigrations.ts`, `src/main/gameDb.ts`, `src/main/gameDb/resetGame.ts`, `src/main/recorder/matchFramePolicy.ts`, `src/main/gameDb/additiveMigrations.test.ts`, `doc/save-files.md`

### Steps

1. `sideAgreementTable.ts`: export `SIDE_AGREEMENT_TABLE_DDL` (the `CREATE TABLE` and `CREATE INDEX` statements from the Design section as one string) and `ensureSideAgreementTable(exec: (sql: string) => void): void`, which runs each statement separately. Model both on `sideMessageTables.ts`: build the `CHECK` lists for `kind`, `status`, `intent`, and `decision` from the constants in `src/shared/sideAgreements.ts`, the way that file builds the trust column from `RELATIONSHIP_SCALE_MAX`. Split on `;` and skip empty pieces. `gameDbOps.run` rejects more than one statement, so one call with the whole string fails.
2. `schema.ts`: add `${SIDE_AGREEMENT_TABLE_DDL}` to `getFullDdl`, directly after `${SIDE_MESSAGE_TABLES_DDL}`.
3. `additiveMigrations.ts`: call `ensureSideAgreementTable((sql) => ops.run(sql));` as the last line of `applyAdditiveSchemaMigrations`.
4. `gameDb.ts`: in the comment on `EXPECTED_USER_VERSION`, after the clause about the `trust` and `threat` columns, add `, or the side_agreements table that ensureSideAgreementTable creates on open` (with backticks around the table and function names, matching the comment's style). **Do not change the number, and do not add the table to `GAME_DB_REQUIRED_TABLES`.**
5. `resetGame.ts`: directly after `run('DELETE FROM side_stances');`, add `run('DELETE FROM side_agreements');`.
6. `matchFramePolicy.ts`: add `side_agreements: { mode: 'frame' },` directly after the `side_stances` entry.
7. `additiveMigrations.test.ts`: add `'side_agreements'` to the end of `MIGRATED_TABLES`, so the existing migration test covers the new table.
8. `sideAgreementStore.ts`. Every function takes `ops: BasicDbOps` first (import the type from `./dbOps`). Row type:

   ```ts
   export interface SideAgreementRow {
     readonly agreementId: number;
     readonly seatId: string;
     readonly counterpartSeatId: string;
     readonly kind: SideAgreementKind;
     readonly terms: string;
     readonly zoneH3: readonly string[];
     readonly againstSeatId: string | null;
     readonly startTurn: number;
     readonly endTurn: number;
     readonly status: SideAgreementStatus;
     readonly intent: SideAgreementIntent;
     readonly reason: string;
     readonly updatedTurn: number;
     readonly decision: SideAgreementDecision | null;
     readonly decisionReason: string | null;
     readonly decisionTurn: number | null;
   }
   ```

   | Function | Does |
   | --- | --- |
   | `insertSideAgreement(ops, input): SideAgreementRow` | `input` has every row field except `agreementId`, `updatedTurn`, and the three decision fields. Inserts with `updated_turn = start_turn` and null decision fields, then returns the stored row (read `last_insert_rowid()` with `getOne`, then `getSideAgreement`) |
   | `updateSideAgreement(ops, { agreementId, terms, zoneH3, endTurn, status, intent, reason, turnNumber }): { changed: boolean; previousStatus: SideAgreementStatus; row: SideAgreementRow } \| null` | Returns null when no row has that id. Otherwise compares the six fields with the stored row. When none differ, writes nothing and returns `changed: false`. When any differ, writes them and `updated_turn = turnNumber`, and returns `changed: true` and the new row |
   | `setSideAgreementDecision(ops, { agreementId, decision, reason, turnNumber }): boolean` | Writes the three decision fields. Returns false when no row has that id |
   | `getSideAgreement(ops, agreementId): SideAgreementRow \| null` | One row |
   | `listSideAgreementsForSeat(ops, seatId): SideAgreementRow[]` | Every row that seat owns, by `agreement_id` |

   - Store `zoneH3` as `JSON.stringify` of the array. When reading, parse it inside `try`/`catch`. A value that does not parse, or is not an array of strings, reads as `[]`. Do not log the value.
   - Compare `zoneH3` arrays element by element in order.
   - Each exported function logs with ids and counts only.
9. `doc/save-files.md`: add `ensureSideAgreementTable` to the sentence that lists what is added on open, and add `side_agreements` to the sentence that lists the side tables a match file includes.

### Tests

`sideAgreementStore.test.ts` (copy the structure of `src/main/gameDb/sideMessageStore.test.ts`), on a seated temp match:
- `insertSideAgreement` returns a row with a positive id, `updatedTurn` equal to `startTurn`, null decision fields, and the zone array it was given.
- `updateSideAgreement` with identical fields returns `changed: false` and leaves `updatedTurn` alone. With a new status it returns `changed: true`, the old status as `previousStatus`, and the new `updatedTurn`. With an unknown id it returns null.
- `setSideAgreementDecision` stores the decision, and a second call replaces it. An unknown id returns false.
- `listSideAgreementsForSeat` returns only that seat's rows, in id order.
- A row whose `zone_h3_json` was set to `'not json'` with raw SQL reads back with `zoneH3: []`.
- A row with the same seat and counterpart fails the `CHECK`. A row with `end_turn` less than `start_turn` fails the `CHECK`.
- After `resetGameForNewMatch`, the table is empty.
- After `DROP TABLE side_agreements`, `ensureSideAgreementTable` creates it again.

### Verification

Run the Phase Check. `matchFramePolicy.test.ts` must pass, which proves the table is classified. The existing save, load, and validation tests must pass without edits.

---

## Phase 3 — Recorder Events

The two recorder events exist and can be written. Nothing calls them yet.

**Add:** `src/main/recorder/sideAgreementRecordingEvents.ts`, `src/main/recorder/sideAgreementRecordingEvents.test.ts`
**Edit:** `src/shared/matchRecording.ts`, `doc/match-recording.md`

### Steps

1. `src/shared/matchRecording.ts`: append `'agreement_recorded'` and `'agreement_decision'` to the end of `MATCH_EVENT_TYPES`, and add both to `MATCH_EVENT_FORMAT_VERSIONS` with value 1. Update any comment in that file that states how many event types there are. `src/shared/matchRecording.test.ts` already checks that every type except `stance_declared` has version 1, and must pass unchanged.
2. If `npm run build:main` then reports a `Record<MatchEventType, …>` elsewhere that lacks the two new keys, add them there following the entries for `stance_declared`, and record the file in the Completion Log.
3. `sideAgreementRecordingEvents.ts`, modeled on `recordSideStanceDeclared` in `matchRecordingEvents.ts`:

   ```ts
   export function recordSideAgreementRecorded(args: {
     readonly step: StepKey;
     readonly row: SideAgreementRow;
     readonly previousStatus: SideAgreementStatus | null;
   }): void

   export function recordSideAgreementDecision(args: {
     readonly step: StepKey;
     readonly agreementId: number;
     readonly seatId: string;
     readonly counterpartSeatId: string;
     readonly decision: SideAgreementDecision;
     readonly reason: string;
   }): void
   ```

   Each calls `recordMatchEvent` with the type, visibility `{ seats: [seatId] }`, no display text, and the payload from the Design section. Each logs `logDebug` with the step text, the ids, and the status or decision, never the terms or the reason.
4. `doc/match-recording.md`: add both event types to the event table with their payload and visibility, and add `side_agreements` to the frame tables.

### Tests

`sideAgreementRecordingEvents.test.ts` (copy the structure of the recorder test in `src/main/openRouter/talk/talkRoundPersistence.test.ts`, which decodes payloads with `decodeRecordPayload`), on a seated temp match:
- `recordSideAgreementRecorded` writes one `agreement_recorded` row with visibility `seats:<seat>`, format version 1, and a payload holding the row's fields and `previousStatus`.
- `recordSideAgreementDecision` writes one `agreement_decision` row with the given decision and reason.

### Verification

Run the Phase Check.

---

## Phase 4 — Zones, Evidence, and the Ledger

One commander's agreements can be read as views with their standing, zone codes, and evidence. Nothing in the prompts uses them yet.

**Add:** `src/main/sideAgreements/sideAgreementZoneCodes.ts`, `src/main/sideAgreements/sideAgreementZoneCodes.test.ts`, `src/main/sideAgreements/sideAgreementEvidence.ts`, `src/main/sideAgreements/sideAgreementEvidence.test.ts`, `src/main/sideAgreements/sideAgreementLedger.ts`, `src/main/sideAgreements/sideAgreementLedger.test.ts`
**Edit:** `src/main/briefing/sideCombatRecordRead.ts`

### Steps

1. `sideCombatRecordRead.ts`: move the lines inside `readSideCombatRecords` that read the stored notes and map them to `CombatRecordTurn[]` (the `getRecentTurnNotes` call, `readStrategicBattleLossesByTurn`, and the `rows.map(...)`) into a new exported function:

   ```ts
   export function readCombatRecordTurns(seatId: AiSeatId, currentTurnNumber: number): CombatRecordTurn[]
   ```

   `readSideCombatRecords` calls it. Keep the comment about the "human" column with the moved lines. Behavior does not change. Run `node dist/main/briefing/sideCombatRecordRead.test.js` and the talk prompt tests before and after this edit. `readCombatRecordTurns` logs `logTrace` with the seat, the turn, and the row count.
2. `sideAgreementZoneCodes.ts`:

   ```ts
   export interface ZoneCodeTranslator {
     readonly codeToH3: (code: string) => string | null;
     readonly h3ToCode: (h3Index: string) => string | null;
   }
   export const STRATEGIC_ZONE_CODE_TRANSLATOR: ZoneCodeTranslator;
   export function zoneCodesToH3(codes: readonly unknown[], translator?: ZoneCodeTranslator): { readonly h3: string[]; readonly droppedCount: number }
   export function zoneH3ToCodes(h3Indexes: readonly string[], translator?: ZoneCodeTranslator): string[]
   ```

   - `STRATEGIC_ZONE_CODE_TRANSLATOR` uses `ensureStrategicCoordinateRegistryInitialized`, `getH3IndexForCode`, and `getHexCodeForContext` from `src/main/briefing/map/hexCoordinates.ts`, with the context `{ mode: 'strategic' }`. Do **not** use `codeToH3` or `h3ToCode` from `hexCodeTranslator.ts`: they throw and log an error for every unknown code, which a model reply will often contain.
   - Each direction first calls `ensureStrategicCoordinateRegistryInitialized()`. The registry is built lazily, and the talk stage can run before any briefing has built it in a freshly loaded match. Wrap each direction in `try`/`catch`. On an error, log it with `logError` (the code or index only) and return null.
   - Codes are two uppercase letters or digits (`HEX_CODE_PATTERN` in `src/main/briefing/map/coordinateContext.ts`). `codeToH3` trims the code and converts it to uppercase before the lookup, so `do` and `DO` are the same hex. An unknown code returns null. `h3ToCode` returns null when the lookup returns `undefined`.
   - `zoneCodesToH3` trims each string and converts it to uppercase before translating it, skips non-strings and codes that translate to null, removes duplicate H3 indexes, keeps the first `SIDE_AGREEMENT_ZONE_MAX_HEXES`, and counts everything it skipped or cut in `droppedCount`. The `translator` parameter defaults to `STRATEGIC_ZONE_CODE_TRANSLATOR`.
   - `zoneH3ToCodes` skips indexes that translate to null.
3. `sideAgreementEvidence.ts` (pure, `logTrace` only):

   ```ts
   export function formatSideAgreementEvidence(args: {
     readonly seatId: string;
     readonly counterpartSeatId: string;
     readonly startTurn: number;
     readonly turns: readonly CombatRecordTurn[];
   }): string
   ```

   - Keep only turns with `turnNumber >= startTurn`.
   - When none are left, or `buildSideCombatRecords` returns null, return exactly: `No turn has resolved since this agreement began.`
   - Otherwise call `buildSideCombatRecords({ ownSeatId: seatId, sideIds: [counterpartSeatId], turns })`, take the record for `counterpartSeatId`, and return `formatSideCombatRecord({ record, sideCode: playerIdCodeFor(counterpartSeatId), firstTurn: set.firstTurn, lastTurn: set.lastTurn })`. This reuses the wording commanders already see in the Record column, so the two never disagree.
4. `sideAgreementLedger.ts`:

   ```ts
   export interface SideAgreementView {
     readonly agreementId: number;
     readonly counterpartSeatId: string;
     readonly counterpartCode: string;
     readonly counterpartLabel: string;
     readonly kind: SideAgreementKind;
     readonly terms: string;
     readonly zoneCodes: readonly string[];
     readonly againstCode: string | null;
     readonly againstLabel: string | null;
     readonly startTurn: number;
     readonly endTurn: number;
     readonly standing: SideAgreementStanding;
     readonly intent: SideAgreementIntent;
     readonly decision: { readonly turnNumber: number; readonly decision: SideAgreementDecision; readonly reason: string } | null;
     readonly evidence: string | null;
   }

   export function buildSideAgreementViews(args: {
     readonly currentTurn: number;
     readonly rows: readonly SideAgreementRow[];
     readonly roster: readonly SeatRecord[];
     readonly turns: readonly CombatRecordTurn[];
     readonly zoneToCodes: (h3Indexes: readonly string[]) => string[];
   }): SideAgreementView[]

   export function readSideAgreementViews(seatId: AiSeatId, currentTurn: number): SideAgreementView[]
   ```

   `buildSideAgreementViews` is pure (`logTrace` only):
   - The standing comes from `sideAgreementStanding`, with `counterpartActive` taken from the roster with `isSeatActive`. A counterpart missing from the roster counts as not active.
   - Keep an agreement when its standing is open, or when it closed recently: `Math.max(row.updatedTurn, row.endTurn) >= currentTurn - SIDE_AGREEMENT_RECENTLY_CLOSED_TURNS`.
   - `counterpartLabel` and `againstLabel` are the seat's `homeRegion`. Codes come from `playerIdCodeFor`.
   - `evidence` is `formatSideAgreementEvidence(...)` for an open agreement, and null otherwise.
   - `decision` is set only when all three decision fields are present.
   - Sort by the counterpart's seat order (use `sortSeatsByOrder` on the roster), then by `agreementId`.

   `readSideAgreementViews` reads `listSideAgreementsForSeat`, `readSeatRoster(gameDbOps)`, and `readCombatRecordTurns(seatId, currentTurn)`, then calls `buildSideAgreementViews` with `zoneH3ToCodes`. It catches every error, logs it with `logError` (seat and turn only), and returns `[]`. It logs `logDebug` with the seat, the turn, and the view count.

### Tests

- `sideAgreementZoneCodes.test.ts`, with a fake translator that knows `DO` and `D4` only: `['DO', ' D4 ', 'ZZ', 7, 'DO']` gives two H3 indexes and `droppedCount: 3`. On a seated temp match, `STRATEGIC_ZONE_CODE_TRANSLATOR.codeToH3('!!')` returns null without throwing, and `h3ToCode('not-a-cell')` returns null without throwing. Seven valid distinct codes keep six and count one dropped. `zoneH3ToCodes` skips an unknown index.
- `sideAgreementEvidence.test.ts`, with hand-built `CombatRecordTurn` values (copy the fixtures from the side combat record tests): no turns at or after the start turn gives the exact "No turn has resolved" sentence. One turn after the start in which the counterpart destroyed one of yours when it attacked gives text starting with `Record, turn` that contains `destroyed 1 of your units`. Turns before the start turn are not counted.
- `sideAgreementLedger.test.ts`, on `buildSideAgreementViews` only (pure, no database):
  - An `active` row with an active counterpart shows as `active` with evidence.
  - The same row with the counterpart out shows as `lapsed` with null evidence.
  - A `proposed` row past its end turn shows as `expired`.
  - A `broken_by_me` row updated three turns ago is not shown. One updated last turn is shown.
  - Two counterparts come out in seat order.

### Verification

Run the Phase Check. The existing side combat record tests and talk prompt tests must pass without edits.

---

## Phase 5 — Prompt Text and Ledger Lines

The fixed sentences and the ledger printer exist. No prompt uses them yet.

**Add:** `src/main/openRouter/promptSpec/diplomacyRuleText.ts`, `src/main/openRouter/promptSpec/diplomacyRuleText.test.ts`, `src/main/openRouter/talk/sideAgreementPromptLines.ts`, `src/main/openRouter/talk/sideAgreementPromptLines.test.ts`
**Edit:** nothing.

### Steps

1. `diplomacyRuleText.ts`. No turn numbers and no facts that change during a match. Export these exactly.

   **Prompt text:**

   ```ts
   export const DIPLOMACY_PURPOSE_BULLETS = [
     'Only one side can win this war. Diplomacy is one of your ways to be that side, alongside your orders.',
     'Use diplomacy to serve your war plan. Keep a front quiet so you can mass your forces elsewhere. Turn rivals against each other. Discourage sides from joining against you. Learn what others intend. Buy time.',
     'Other commanders judge you by what you do as well as by what you say. A broken promise makes your later promises worth less to that side, and to any side it warns.',
   ] as const;

   export function sideAgreementTalkBullets(): readonly string[] {
     return [
       'An agreement is your private record of what you believe you and one other side have agreed to. That side keeps its own record, which may differ from yours. No other commander sees your record, and the game does not enforce any agreement.',
       "The kinds are: non_aggression (neither side strikes the other or moves into the other's hexes), ceasefire_in_place (neither side strikes the other, and both hold their current lines), no_entry_zone (neither side moves into the hexes listed in zone), joint_action (both sides act against the side named in against), and information_sharing (both sides tell each other what they see).",
       'Record an agreement when you propose one, or when you believe one has been made. Use status proposed until you believe the other side has accepted, then active. When an agreement ends early, set its status to ended, broken_by_them, or broken_by_me.',
       `An agreement covers the turns from the turn you record it through its endTurn, at most ${SIDE_AGREEMENT_MAX_TURNS} turns. After its endTurn it has expired. To continue it, record a new one.`,
       `You may hold at most ${SIDE_AGREEMENT_MAX_OPEN_PER_SIDE} proposed or active agreements with any one side.`,
       'intent is your private plan for an agreement: keep, opportunistic (keep it only while it serves you), or plan_to_break.',
       'Keeping an agreement lets you hold that front with fewer units and makes that side predictable. Breaking one can catch a thinly held front by surprise, and pays most when the gain is decisive. It can also bring retaliation, a reinforced front, warnings to other sides, and distrust of your later offers. Whether to keep or break an agreement is your decision.',
       'The section titled Your agreements shows each open agreement with the losses both ways since it began. That record comes from the game, not from either side.',
       'To change an agreement, send it again with its id and every field, changed or not. Use id 0 for a new agreement. You cannot change who an agreement is with, its kind, or the turn it began.',
     ];
   }

   export const SIDE_AGREEMENT_ORDERS_BULLETS = [
     'Diplomacy is part of how you win. Plan with your stances and agreements in mind: a front covered by an agreement you mean to keep needs fewer units, and a side you rate as a high threat needs more.',
     'Each agreement listed in the Messages section is your own private record. The game does not enforce it, and keeping or breaking it is your decision. Weigh what you gain this turn against retaliation and lost trust.',
   ] as const;

   export function sideAgreementReplyShape(): string {
     return `"agreements":[{"id":<agreement id, or 0 for a new one>,"with":"<side code>","kind":"<${SIDE_AGREEMENT_KINDS.join('|')}>","terms":"<one sentence>","zone":["<hex code>"],"against":"<side code, or ${SIDE_AGREEMENT_NO_THIRD_SIDE}>","endTurn":<turn number>,"status":"<${SIDE_AGREEMENT_STATUSES.join('|')}>","intent":"<${SIDE_AGREEMENT_INTENTS.join('|')}>","reason":"<one sentence>"}]`;
   }

   export const SIDE_AGREEMENT_REPLY_RULES =
     'Use the side codes from the Sides table and hex codes from your orders briefing. Any list may be empty. Leave zone empty unless kind is no_entry_zone. Set against to none unless kind is joint_action.';

   export const SIDE_AGREEMENT_DECISIONS_PARAGRAPH =
     'Optional "agreementDecisions": for an agreement listed as active in the Messages section, add {"id":<agreement id>,"decision":"keep" or "break","reason":"<one sentence>"} to record whether you keep or break it this turn. Your next diplomacy step shows your decision. A decision does not change the agreement itself: to end it, change its status in your next diplomacy step. Omit the array to record nothing.';
   ```

   Give each export a full orienting comment. Import the constants from `src/shared/sideAgreements.ts`.
2. `sideAgreementPromptLines.ts` (pure, `logTrace` only):

   ```ts
   export function formatSideAgreementLines(views: readonly SideAgreementView[]): string
   ```

   - No views: return exactly `- None.`
   - Otherwise one bullet per view, joined with `\n`. Replace every `"` in terms and reasons with `'`. A bullet joins these parts, in this order, with one space between parts. Each part's text is exact. Braces mark values.

   **Prompt text:**

   | Part | Text | Included |
   | --- | --- | --- |
   | Head | `- Agreement {id} with {counterpartLabel} ({counterpartCode}): {kind}, turns {startTurn} to {endTurn}, {standingText}.` | Always |
   | Intent | `Your intent: {intent}.` | Always |
   | Terms | `Terms: "{terms}"` | Always |
   | Zone | `Zone: {zoneCodes joined with ", "}.` | Only when `zoneCodes` is not empty |
   | Against | `Against: {againstLabel} ({againstCode}).` | Only when `againstCode` is not null |
   | Decision | `Your decision on turn {turnNumber}: {decision}, "{reason}"` | Only when `decision` is not null and its reason is not empty |
   | Decision without a reason | `Your decision on turn {turnNumber}: {decision}.` | Only when `decision` is not null and its reason is empty |

   When `evidence` is not null, add a second line: two spaces, then the evidence text.

   `standingText` by standing:

   | Standing | Text |
   | --- | --- |
   | `proposed` | `proposed` |
   | `active` | `active` |
   | `expired` | `expired after turn {endTurn}` |
   | `lapsed` | `lapsed because {counterpartCode} is out of the match` |
   | `ended` | `ended` |
   | `broken_by_them` | `broken by {counterpartCode}` |
   | `broken_by_me` | `broken by you` |

   Example for one active agreement (the second line is the evidence):

   ```text
   - Agreement 7 with Southern France (a4): non_aggression, turns 3 to 8, active. Your intent: opportunistic. Terms: "No strikes or crossings on the Alpine frontier." Your decision on turn 5: keep, "Still useful."
     Record, turns 3 to 5: no losses either way.
   ```

### Tests

- `diplomacyRuleText.test.ts`: no bullet in `DIPLOMACY_PURPOSE_BULLETS`, `sideAgreementTalkBullets()`, or `SIDE_AGREEMENT_ORDERS_BULLETS` contains the word `turn ` followed by a digit. `sideAgreementTalkBullets()` names every kind in `SIDE_AGREEMENT_KINDS`. `sideAgreementReplyShape()` contains every status and every intent.
- `sideAgreementPromptLines.test.ts`: an empty list gives `- None.`. The example above is reproduced exactly from a hand-built view. Each standing in the table gives its text. A zone and an against side print in that order. A double quote in terms prints as a single quote. A view with null evidence prints one line.

### Verification

Run the Phase Check.

---

## Phase 6 — The Talk Reply

A strategic talk reply's `agreements` list becomes validated entries. Battle replies ignore it. Nothing is stored yet.

**Add:** `src/main/openRouter/talk/talkSideCodes.ts`, `src/main/openRouter/talk/sideAgreementReply.ts`, `src/main/openRouter/talk/sideAgreementReply.test.ts`
**Edit:** `src/main/openRouter/talk/talkReply.ts`, `src/main/openRouter/talk/talkReplySchema.ts`, `src/main/openRouter/talk/requestTalk.ts`, `src/main/openRouter/talk/talkReply.test.ts` (it also holds the schema tests), and these tests that build a `ParsedTalkReply` by hand: `src/main/openRouter/afterResolutionTalk.test.ts`, `src/main/openRouter/commanderPool.test.ts`, `src/main/openRouter/talk/talkRound.test.ts`, `src/main/openRouter/talk/talkRoundPersistence.test.ts`, `src/main/openRouter/talk/requestTalk.test.ts`

### Steps

1. Run the existing tests in the Edit list and record that they pass.
2. `talkSideCodes.ts`: move the private `seatIdForSideCode` out of `talkReply.ts` into this file, unchanged, and export it with a full orienting comment. `talkReply.ts` imports it. This keeps `talkReply.ts` and `sideAgreementReply.ts` from importing each other.
3. `sideAgreementReply.ts` (pure, `logTrace` only):

   ```ts
   export interface TalkReplyAgreement {
     readonly agreementId: number;            // 0 for a new agreement
     readonly withSeatId: SeatId;
     readonly kind: SideAgreementKind;
     readonly terms: string;
     readonly zoneCodes: readonly string[];   // raw codes; translated when stored
     readonly againstSeatId: SeatId | null;
     readonly endTurn: number;                 // as sent; checked against the start turn when stored
     readonly status: SideAgreementStatus;
     readonly intent: SideAgreementIntent;
     readonly reason: string;
   }

   export function parseSideAgreementEntries(args: {
     readonly raw: unknown;
     readonly ownSeatId: SeatId;
     readonly addressableSeatIds: readonly SeatId[];
   }): { readonly agreements: readonly TalkReplyAgreement[]; readonly droppedCount: number }
   ```

   A non-array `raw` gives no entries and no drops. Each entry is dropped (and counted) when any rule fails:
   - It is not an object.
   - `id` is present and is not an integer of 0 or more. A missing `id` means 0.
   - `with` does not resolve with `seatIdForSideCode`, or resolves to `ownSeatId`.
   - `kind`, `status`, or `intent` fails its guard.
   - `terms` is empty after `cleanSideMessageText(…, SIDE_AGREEMENT_TERMS_MAX_CHARS)`.
   - `endTurn` is not an integer.
   - The id is above 0 and an earlier entry in this reply already used it.
   - `kind` is `joint_action` and `against` does not resolve with `seatIdForSideCode`, or resolves to `ownSeatId` or to `withSeatId`.
   - `kind` is `no_entry_zone` and `zone` has no non-empty string after trimming.

   For a kept entry: `reason` is `cleanSideMessageText(…, SIDE_STANCE_REASON_MAX_CHARS)`. `zoneCodes` holds the trimmed non-empty strings of `zone` for `no_entry_zone`, and is `[]` for every other kind. `againstSeatId` is set only for `joint_action`.
4. `talkReply.ts`:
   - `ParsedTalkReply` gains `readonly agreements: readonly TalkReplyAgreement[];` with an orienting comment.
   - `parseTalkReply`'s argument gains `readonly allowAgreements: boolean`. When true, call `parseSideAgreementEntries` with `record.agreements` and add its `droppedCount` to the reply's. When false, `agreements` is `[]`, and an `agreements` key in the reply is ignored without counting a drop.
   - The `logTrace` line gains `agreementCount`.
5. `talkReplySchema.ts`: change the signature to `buildTalkReplyResponseFormat(sideCodes: readonly string[], options: { readonly includeAgreements: boolean })`. When `includeAgreements` is true, add a required `agreements` array property whose item is a closed object with these required properties:

   | Property | Schema |
   | --- | --- |
   | `id` | `{ type: 'integer' }` |
   | `with` | string, `enum: sideCodes` |
   | `kind` | string, `enum: SIDE_AGREEMENT_KINDS` |
   | `terms` | string |
   | `zone` | array of string |
   | `against` | string, `enum: [...sideCodes, SIDE_AGREEMENT_NO_THIRD_SIDE]` |
   | `endTurn` | `{ type: 'integer' }` |
   | `status` | string, `enum: SIDE_AGREEMENT_STATUSES` |
   | `intent` | string, `enum: SIDE_AGREEMENT_INTENTS` |
   | `reason` | string |

   When false, the schema is exactly what it is today.
6. Every test in the Edit list that builds a reply object by hand (search for `stances: [` and `droppedCount:`) gains `agreements: []`. Add nothing else to those tests.
7. `requestTalk.ts`: pass `{ includeAgreements: args.battle === null }` to `buildTalkReplyResponseFormat`, and `allowAgreements: args.battle === null` to `parseTalkReply`. Make no other change in this phase.

### Tests

- `sideAgreementReply.test.ts`, with seats `a1` (own), `a2`, `a3`:
  - A full valid new entry is kept with `agreementId: 0`.
  - Each rule above drops its entry and counts it. Cover at least: unknown `with`, `with` equal to own seat, bad kind, empty terms after cleaning, non-integer `endTurn`, a repeated positive id, `joint_action` against the `with` side, and `no_entry_zone` with an empty zone.
  - A `non_aggression` entry with a zone and an against side keeps `zoneCodes: []` and `againstSeatId: null`.
  - A non-array `raw` gives no entries and no drops.
- `talkReply` tests: with `allowAgreements: false`, an `agreements` key is ignored and `droppedCount` is unchanged. With `allowAgreements: true`, a valid entry appears in `agreements`.
- Schema tests, in `talkReply.test.ts` beside the existing ones: the two existing schema tests pass with `{ includeAgreements: false }` added and no other change, and that format has no `agreements` property. With `true`, `agreements` is required and its item lists the ten properties as required.

### Verification

Run the Phase Check. Every existing talk test must pass, edited only where its call site gained the new argument. Record those files.

---

## Phase 7 — The Talk Prompt

The talk prompt explains why diplomacy matters in both theaters. On the world map it also explains agreements and shows the commander its ledger.

**Add:** nothing.
**Edit:** `src/main/openRouter/talk/talkPrompt.ts`, `src/main/openRouter/talk/talkPromptInput.ts`, `src/main/openRouter/talk/requestTalk.ts`, the existing tests of those files, `doc/ai-commander-prompts/talk-prompt.md`

### Steps

1. Run the existing `talkPrompt`, `talkPromptInput`, and `requestTalk` tests and record that they pass.
2. `talkPrompt.ts`:
   - `TalkPromptInput` gains `readonly agreements: readonly SideAgreementView[] | null;` with an orienting comment: null in a battle, otherwise the ledger (possibly empty).
   - `buildTalkSystemText` gains a second parameter: `buildTalkSystemText(ownSideLabel: string, scope: 'strategic' | 'tactical')`. The text depends only on these two values.
   - `buildTalkSituationText`: when `input.agreements !== null`, add the block `## Your agreements\n${formatSideAgreementLines(input.agreements)}` directly after the Sides block and before `## Your last plan`.
3. The system text. Keep every existing line. Make exactly these changes:
   - In the first paragraph, when `scope` is `'strategic'`, the last sentence becomes `…and that step will show you the same messages and your agreements.` In a battle it stays as it is.
   - Directly after the first paragraph, and before `Where messages come from:`, insert a blank line, then `Why diplomacy matters:`, then each item of `DIPLOMACY_PURPOSE_BULLETS` as a `- ` bullet. This block appears in both theaters.
   - When `scope` is `'strategic'`, after the `What you may do in this step:` bullets and before `Reply with one JSON object and nothing else:`, insert a blank line, then `Agreements:`, then each item of `sideAgreementTalkBullets()` as a `- ` bullet.
   - When `scope` is `'strategic'`, the JSON line gains `,${sideAgreementReplyShape()}` before its final `}`, and the line after it becomes `SIDE_AGREEMENT_REPLY_RULES`. In a battle both lines stay exactly as they are.
4. `talkPromptInput.ts`: in `readTalkPromptInput`, set `agreements` to `args.battle ? null : readSideAgreementViews(args.seatId, args.turnNumber)`.
5. `requestTalk.ts`: call `buildTalkSystemText(prepared.input.ownSideLabel, args.battle ? 'tactical' : 'strategic')`.
6. `doc/ai-commander-prompts/talk-prompt.md`: describe the new system text blocks, the `Your agreements` section, the `agreements` reply list, and that battles show none of it. Search `doc/ai-commander-prompts/` for `buildTalkSystemText` and update every other place that describes the talk system text.

### Tests

- `talkPrompt.test.ts` has a test that allows only the digit runs `280`, `0`, and `4` in the system text. Run that test on `buildTalkSystemText('Iberia', 'tactical')` unchanged. Add the same check for `'strategic'`, allowing also `String(SIDE_AGREEMENT_MAX_TURNS)` and `String(SIDE_AGREEMENT_MAX_OPEN_PER_SIDE)`. Do not weaken the existing assertions.
- The strategic system text contains `Why diplomacy matters:`, every purpose bullet, `Agreements:`, every agreement bullet, `"agreements":[`, and `SIDE_AGREEMENT_REPLY_RULES`. It contains no digit that follows the word `turn `.
- The battle system text contains `Why diplomacy matters:` and every purpose bullet, and contains none of `Agreements:`, `"agreements"`, or `no_entry_zone`. Apart from the purpose block, it equals the text from before this phase (capture it in the test from the old code path, or assert the old lines one by one).
- `buildTalkSituationText` with `agreements: []` prints `## Your agreements\n- None.` between the Sides block and `## Your last plan`. With `agreements: null` it prints no such heading.
- A `requestTalk` test with a fake transport, on the world map, sends a system message containing `Agreements:` and a response format with an `agreements` property. In a battle it sends neither.

### Verification

Run the Phase Check.

---

## Phase 8 — Storing Agreements from Talk

A closed strategic talk round stores each commander's agreements, in the same transaction as its messages and stances, and records them.

**Add:** `src/main/sideAgreements/sideAgreementTalkPersistence.ts`, `src/main/sideAgreements/sideAgreementTalkPersistence.test.ts`
**Edit:** `src/main/openRouter/talk/talkRoundPersistence.ts`, `src/main/openRouter/talk/talkRoundPersistence.test.ts`, `doc/commander-messages.md`

### Steps

1. `sideAgreementTalkPersistence.ts`:

   ```ts
   export function persistTalkAgreements(args: {
     readonly seatId: AiSeatId;
     readonly step: StepKey;
     readonly agreements: readonly TalkReplyAgreement[];
     readonly activeSeatIds: ReadonlySet<string>;
     readonly zoneTranslator?: ZoneCodeTranslator;
   }): { readonly storedCount: number; readonly droppedCount: number }
   ```

   `TalkReplyAgreement` is a type import from `src/main/openRouter/talk/sideAgreementReply.ts`. Type-only imports are erased, so this does not break the import rule. Use `import type`.

   The caller owns the transaction. Do not open one here. Use `gameDbOps`. The current turn is `args.step.turnNumber`. Do nothing and return zeros unless `args.step.scope === 'strategic'`. For each entry, in order, drop it (count it, store nothing) when any rule fails, otherwise store it:

   **A new agreement (`agreementId === 0`):**
   - `withSeatId` is not in `activeSeatIds`, or `againstSeatId` is set and not in `activeSeatIds`.
   - `status` is not in `SIDE_AGREEMENT_NEW_STATUSES`.
   - The seat already has `SIDE_AGREEMENT_MAX_OPEN_PER_SIDE` open agreements with `withSeatId`. Count with `sideAgreementStanding` over `listSideAgreementsForSeat`, and include agreements stored earlier in this same call.
   - `resolveSideAgreementEndTurn({ startTurn: currentTurn, currentTurn, requestedEndTurn: endTurn })` is null.
   - The kind is `no_entry_zone` and `zoneCodesToH3` returns no H3 index.

   Store with `insertSideAgreement` (start turn is the current turn), then `recordSideAgreementRecorded({ step, row, previousStatus: null })`.

   **A change (`agreementId > 0`):**
   - `getSideAgreement` returns null, or the row's `seatId` is not this seat, or its `counterpartSeatId` or `kind` differs from the entry's.
   - The row's standing (with `counterpartActive` from `activeSeatIds`) is not open.
   - `resolveSideAgreementEndTurn({ startTurn: row.startTurn, currentTurn, requestedEndTurn: endTurn })` is null.
   - The kind is `no_entry_zone` and `zoneCodesToH3` returns no H3 index.

   Store with `updateSideAgreement` (`zoneH3` is `[]` unless the kind is `no_entry_zone`, `turnNumber` is the current turn). When it returns `changed: true`, call `recordSideAgreementRecorded({ step, row, previousStatus })`. An unchanged entry counts as stored.

   Log `logDebug` on entry with the seat, the turn, and the entry count, and once at the end with the stored and dropped counts. Never log terms or reasons.
2. `talkRoundPersistence.ts`: inside the per-seat loop, after the stance loop and before `if (messages.length > 0) …`, add:

   ```ts
   if (step.scope === 'strategic' && result.reply.agreements.length > 0) {
     persistTalkAgreements({ seatId, step, agreements: result.reply.agreements, activeSeatIds: active });
   }
   ```

   `active` is the existing active-seat set. If its type is `Set<string>`, pass it as is. An error thrown inside rolls back the whole round, exactly as a failed message insert does today.
3. `doc/commander-messages.md`: add a section titled `Agreements` that covers: what an agreement is (a commander's private, subjective record); the five kinds; the statuses and the standing table; the limits; how a talk reply creates and changes an agreement and every reason one is dropped; the evidence line; the `side_agreements` table; and the two recorder events. Say plainly that the game never enforces an agreement and that the human player keeps none. Name the engine symbols.

### Tests

- `sideAgreementTalkPersistence.test.ts`, on a seated temp match with a fake zone translator:
  - A new `active` agreement is stored with the step's turn as its start, and one `agreement_recorded` event is written with `previousStatus: null`.
  - A new agreement with status `ended` is dropped.
  - A fourth new agreement with the same side is dropped when three are open. Two in one call plus two stored earlier: the fourth in total is dropped.
  - A requested end turn 30 turns away is stored as start plus 9.
  - A change to an open agreement's status stores it and writes an event whose `previousStatus` is the old status. The same change sent again writes no new event.
  - A change naming a different `with`, a different `kind`, another seat's agreement, or an `ended` agreement is dropped.
  - A tactical step stores nothing.
- `talkRoundPersistence.test.ts`: a spoken strategic reply with one agreement stores the agreement and its event alongside the messages and stances. A forced failure during the agreement insert (for example, drop the `side_agreements` table first) rolls back the round's messages too.

### Verification

Run the Phase Check.

### If verification fails

- If `check:circular` reports a new cycle that runs through `src/main/briefing/map/`, make `zoneTranslator` a required parameter of `persistTalkAgreements`, import `STRATEGIC_ZONE_CODE_TRANSLATOR` in `talkRoundPersistence.ts` instead, and pass it from there. Run the Phase Check again.
- Any other failure: revert the phase and stop.

---

## Phase 9 — The Orders Prompt

The strategic orders system prompt says to plan with stances and agreements in mind. The Messages section of the strategic orders prompt shows the ledger.

**Add:** `src/main/openRouter/sideAgreementGate.ts`, `src/main/openRouter/sideAgreementGate.test.ts`
**Edit:** `src/main/openRouter/promptSpec/sideMessageRuleText.ts`, `src/main/openRouter/promptSpec/coachingTextStrategic.ts`, `src/main/openRouter/talk/ordersMessagesBlock.ts`, `src/main/openRouter/requestOrdersFlow.ts`, the existing tests of those files, `doc/ai-commander-prompts/strategic-prompt.md`, `doc/ai-commander-prompts/assembly-contract.md`, `doc/ai-commander-prompts/example-strategic-prompt.md`

### Steps

1. Run the existing tests of every file in the Edit list and record that they pass.
2. `sideAgreementGate.ts`:

   ```ts
   export function sideAgreementsEnabled(mode: 'strategic' | 'tactical'): boolean
   ```

   True only when `mode === 'strategic'` and `isTalkStageEnabled()`. Logs `logTrace` with the mode and the result. This is the only place that decides whether an orders consult uses agreements.
3. `sideMessageRuleText.ts`: `sideMessageRuleBlock`'s argument gains `readonly includeAgreements?: boolean` (default false). When true, add each item of `SIDE_AGREEMENT_ORDERS_BULLETS` as a `    - ` bullet (four spaces, a hyphen, a space) after the trust bullets and before the closing line. When false, the output is exactly what it is today.
4. `coachingTextStrategic.ts`: change the call to `sideMessageRuleBlock({ talkStageEnabled: isTalkStageEnabled(), includeAgreements: sideAgreementsEnabled('strategic') })`. Do **not** change `coachingTextTactical.ts`.
5. `ordersMessagesBlock.ts`:
   - The argument gains `readonly includeAgreements: boolean`.
   - When `includeAgreements` is true and `!args.inBattle`, read `readSideAgreementViews(args.seatId, readTurnNumberOrFirst(gameDbOps.getOne))`. Import `readTurnNumberOrFirst` from `../../gameDb/turnStateReads`, as `talkPromptInput.ts` does.
   - When that list is not empty, add the part `Your agreements:\n${formatSideAgreementLines(views)}` after the stances part and before the caution line.
   - The block returns `text: null` only when there are no threads, no stances, no records, **and** no agreement views.
   - The `logTrace` line gains `agreementCount`.
6. `requestOrdersFlow.ts`: change the call to `buildOrdersMessagesBlock({ seatId, inBattle: Boolean(tacticalBattle), includeAgreements: sideAgreementsEnabled(tacticalBattle ? 'tactical' : 'strategic') })`. Add only the import and this argument.
7. `doc/ai-commander-prompts/strategic-prompt.md` and `assembly-contract.md`: describe the two new message-rule bullets (strategic only, and only when talk is enabled) and the `Your agreements` part of the Messages section. Search `doc/ai-commander-prompts/` for `sideMessageRuleBlock` and update every place that lists its contents, including `crosswalk.md` and `source-inventory.md` if they name it. In `example-strategic-prompt.md`, add the two bullets to the `Messages from other sides:` block, before its closing diplomacy sentence. That example is maintained by hand.

### Tests

- `sideAgreementGate.test.ts`: `tactical` is always false. `strategic` is true by default and false while `AGENT_WARS_DISABLE_TALK` is set to `1` (set and restore the variable in a `finally`).
- `sideMessageRuleBlock({ talkStageEnabled: true })` is unchanged from before this phase. With `includeAgreements: true` it contains both orders bullets, each starting with four spaces and `- `, still ends with the closing diplomacy sentence, and still contains no digit (the existing no-digit assertions in `sideMessageRuleText.test.ts` and `consultPromptParts.test.ts` must keep passing).
- The strategic coaching text contains the first orders bullet. The tactical coaching text does not.
- `ordersMessagesBlock` tests, on a seated temp match with one stored active agreement: with `includeAgreements: true` and `inBattle: false` the text contains `Your agreements:` and `Agreement 1 with`. With `inBattle: true`, or with `includeAgreements: false`, it does not. A commander with no threads, stances, or records but one agreement gets a non-null text.

### Verification

Run the Phase Check.

---

## Phase 10 — The Decisions Field in the Orders Envelope

The strategic orders contract and schema offer `agreementDecisions`. Nothing reads it yet.

**Add:** nothing.
**Edit:** `src/main/openRouter/promptSpec/envelopeContract.ts`, `src/main/openRouter/promptSpec/envelopeJsonSchema.ts`, `src/main/openRouter/promptContracts.ts`, `src/main/openRouter/consultPromptParts.ts`, `src/main/openRouter/requestOrdersFlow.ts`, the existing tests of those files, `doc/ai-commander-prompts/strategic-prompt.md`, `doc/ai-commander-prompts/assembly-contract.md`, `doc/ai-commander-prompts/example-strategic-prompt.md`

### Steps

Follow `posture` everywhere. It is the model for an optional strategic-only field.

1. Run the existing tests of every file in the Edit list and record that they pass.
2. `envelopeContract.ts`:
   - `EnvelopeGates` gains `readonly includeAgreementDecisions?: boolean;` with an orienting comment that says it is last in the field list and never in a tactical consult.
   - Append `'agreementDecisions'` to `ENVELOPE_FIELD_ORDER`, after `'posture'`.
   - In `envelopeFieldsForGates`, add `if (field === 'agreementDecisions') return gates.coordinateMode !== 'tactical' && gates.includeAgreementDecisions === true;`.
   - In `buildRepairSchemaText`, add a branch `else if (field === 'agreementDecisions') { example.agreementDecisions = []; }`, so a copied example decides nothing.
3. `envelopeJsonSchema.ts`: add `case 'agreementDecisions':` returning an array schema of a closed object with properties `id: { type: 'integer' }`, `decision: { type: 'string', enum: [...SIDE_AGREEMENT_DECISIONS] }`, and `reason: STRING_SCHEMA`, with `id` and `decision` required. Use the same helpers the `operations` case uses (`arraySchema`, `closedObjectSchema`). The field is not added to the top-level `required` list.
4. `promptContracts.ts`:
   - `buildFinalJsonContractInstruction`'s argument gains `includeAgreementDecisions?: boolean` (default false). Add it to the `logDebug` context and to `gates` as `includeAgreementDecisions: coordinateMode !== 'tactical' && includeAgreementDecisions`.
   - `headerSlots` gains `agreementDecisions: '"agreementDecisions": [...]'`.
   - Add `const agreementDecisionsParagraph = gates.includeAgreementDecisions === true ? SIDE_AGREEMENT_DECISIONS_PARAGRAPH : '';` and put it in `paragraphs` directly after `postureParagraph`.
   - Do not change the example block.
5. `consultPromptParts.ts`: in the `buildFinalJsonContractInstruction({ … })` call, add `includeAgreementDecisions: sideAgreementsEnabled(coordinateContext.mode),` directly after `includePosture: …`.
6. `requestOrdersFlow.ts`: in `const envelopeGates: EnvelopeGates = { … }`, add `includeAgreementDecisions: sideAgreementsEnabled(coordinateContext.mode),` directly after `includePosture: …`. The contract text (step 5) and the schema use the same switch, so they cannot disagree.
7. Docs: in `strategic-prompt.md` and `assembly-contract.md`, add `agreementDecisions` wherever the envelope fields and their optional paragraphs are listed. In `example-strategic-prompt.md`, add `SIDE_AGREEMENT_DECISIONS_PARAGRAPH` after the posture paragraph and add the field to the field list, if the example shows them.

### Tests

- `envelopeFieldsForGates` with `includeAgreementDecisions: true` on the world map ends with `posture` then `agreementDecisions` when both gates are on. In a battle it never includes it.
- The schema with the gate on has an `agreementDecisions` property that is not required. With the gate off it has none.
- `buildFinalJsonContractInstruction({ …, includeAgreementDecisions: true })` contains `SIDE_AGREEMENT_DECISIONS_PARAGRAPH`. With the gate off, or in a battle, it does not, and the text equals what it was before this phase.
- `buildRepairSchemaText` with the gate on contains `"agreementDecisions":[]`.

### Verification

Run the Phase Check.

---

## Phase 11 — Reading and Storing Decisions

A strategic orders reply's `agreementDecisions` are validated, stored, and recorded. The next talk prompt shows each one.

**Add:** `src/main/openRouter/sideAgreementDecisionParsing.ts`, `src/main/openRouter/sideAgreementDecisionParsing.test.ts`, `src/main/sideAgreements/sideAgreementDecisionApply.ts`, `src/main/sideAgreements/sideAgreementDecisionApply.test.ts`
**Edit:** `src/main/openRouter/orderResponseParsing.ts`, `src/main/openRouter/requestOrdersApplyParsed.ts`, the existing tests of those files, `doc/commander-messages.md`

### Steps

1. Run the existing `orderResponseParsing` and `requestOrdersApplyParsed` tests and record that they pass.
2. `sideAgreementDecisionParsing.ts` (pure, `logTrace` only):

   ```ts
   export interface ParsedAgreementDecision {
     readonly agreementId: number;
     readonly decision: SideAgreementDecision;
     readonly reason: string;
   }
   export function normalizeAgreementDecisions(raw: unknown): {
     readonly decisions: readonly ParsedAgreementDecision[];
     readonly dropReasons: readonly string[];
   }
   ```

   - `undefined` gives no decisions and no drop reasons.
   - A non-array gives the drop reason `agreementDecisions dropped: expected an array.`
   - An entry is dropped with the reason `agreementDecisions entry dropped: expected a positive integer id and a decision of keep or break.` when it is not an object, its `id` is not an integer above 0, or its `decision` fails `isSideAgreementDecision`.
   - A repeated id is dropped with the reason `agreementDecisions entry dropped: agreement {id} appears more than once.`
   - Entries after the first `SIDE_AGREEMENT_MAX_DECISIONS` kept ones are dropped with one reason: `agreementDecisions dropped: at most ${SIDE_AGREEMENT_MAX_DECISIONS} decisions are read.`
   - `reason` is `cleanSideMessageText(entry.reason, SIDE_STANCE_REASON_MAX_CHARS)`.
3. `orderResponseParsing.ts`:
   - The parsed result interface gains `agreementDecisions?: readonly ParsedAgreementDecision[];` with an orienting comment modeled on `postureChoice`: absent in a battle, for an omitted field, and when nothing was kept.
   - Directly after the posture lines, add:

     ```ts
     const agreementDecisionResult = context.mode !== 'tactical'
       ? normalizeAgreementDecisions(obj.agreementDecisions)
       : { decisions: [], dropReasons: [] };
     dropReasons.push(...agreementDecisionResult.dropReasons);
     ```

   - In the returned object, after `postureChoice,`, add `agreementDecisions: agreementDecisionResult.decisions.length > 0 ? agreementDecisionResult.decisions : undefined,`.
4. `sideAgreementDecisionApply.ts`:

   ```ts
   export function applySideAgreementDecisions(args: {
     readonly seatId: AiSeatId;
     readonly decisions: readonly ParsedAgreementDecision[];
     readonly turnNumber: number;
   }): { readonly appliedCount: number; readonly dropReasons: readonly string[] }
   ```

   `ParsedAgreementDecision` is a type import from `src/main/openRouter/sideAgreementDecisionParsing.ts`. Use `import type`.

   For each decision: read the row with `getSideAgreement`. Work out its standing with `sideAgreementStanding`, using the current roster (`readSeatRoster(gameDbOps)` with `isSeatActive`) for `counterpartActive`. When the row is missing, belongs to another seat, or its standing is not `active`, add the drop reason `agreementDecisions entry dropped: agreement {id} is not one of your active agreements.` Otherwise call `setSideAgreementDecision` and `recordSideAgreementDecision({ step: strategicStep(turnNumber), … })`. Catch every error, log it with `logError` (seat and turn only), and return what was applied so far. Log `logDebug` on entry with the seat, the turn, and the decision count.
5. `requestOrdersApplyParsed.ts`: directly **after** the `writeOperationRefusal(…)` block, so agreement drop reasons never appear in an operation refusal, add:

   ```ts
   if (!tacticalBattle && parsed.agreementDecisions) {
     const agreementResult = applySideAgreementDecisions({ seatId, decisions: parsed.agreementDecisions, turnNumber: planState.turnNumber });
     dropReasons.push(...agreementResult.dropReasons);
   }
   ```

6. `doc/commander-messages.md`: in the Agreements section, describe `agreementDecisions`: strategic only; only for an active agreement; never checked against the orders; stored on the agreement and recorded as `agreement_decision`; shown in the next talk prompt.

### Tests

- `sideAgreementDecisionParsing.test.ts`: `undefined` gives nothing. A string gives the array drop reason. A valid entry is kept with its reason cleaned. An id of 0, an id of `'7'`, and a decision of `'betray'` are dropped. A repeated id is dropped once. Thirteen valid entries keep twelve.
- `orderResponseParsing` tests: a strategic reply with one valid decision has `agreementDecisions` with one entry. A tactical reply with the same key has none and no drop reason from it.
- `sideAgreementDecisionApply.test.ts`, on a seated temp match: a decision on an active agreement is stored and writes one `agreement_decision` event. A decision on another seat's agreement, on a `proposed` one, on an expired one, and on an unknown id each add the drop reason and store nothing.
- End to end without a model: store an active agreement, apply a `break` decision on turn 5, then build the strategic talk situation text for turn 6 with `readTalkPromptInput`. It contains `Your decision on turn 5: break`.

### Verification

Run the Phase Check.

---

## Phase 12 — Side Labels in the Orders Prompts and Loss Lines

Every orders prompt, battles included, has a Sides table whose code column is named the way the loss legend names it. Each `by` in a loss line names the side's home region next to its code.

**Add:** nothing.
**Edit:** `src/main/openRouter/promptSpec/sidesBlock.ts`, `src/main/openRouter/promptSpec/sidesBlock.test.ts`, `src/main/openRouter/consultPromptParts.ts`, `src/main/openRouter/consultPromptParts.test.ts`, `src/main/briefing/recentTurnLossLines.ts`, `src/main/briefing/recentTurnLossLines.test.ts`, `src/main/briefing/recentTurnNotesSection.ts`, `src/main/recentTurnNotesSection.test.ts`, `doc/ai-commander-prompts/strategic-prompt.md`, `doc/ai-commander-prompts/tactical-prompt.md`, `doc/ai-commander-prompts/example-strategic-prompt.md`, `doc/ai-commander-prompts/example-tactical-prompt.md`

### Steps

1. Run the existing tests of every source file in the Edit list and `node dist/main/openRouter/promptOutline.test.js`, and record that they pass.
2. `sidesBlock.ts`: change the header row to exactly:

   **Prompt text:**

   ```text
   | Side | Code (unit id prefix) | Home region | Status |
   ```

   Update the orienting comment of `buildSidesPromptBlock` to name the new column. Change nothing else in the table.
3. `consultPromptParts.ts`: build the Sides block in both theaters. Replace `const sidesBlock = coordinateContext.mode === 'tactical' ? '' : buildSidesPromptBlock({ … });` with `const sidesBlock = buildSidesPromptBlock({ … });`, keeping the same arguments. The block stays in the system message at the same place. A side's status changes only when it leaves the match, as it already does in strategic prompts, so this is the same caching behavior.
4. `recentTurnLossLines.ts`:
   - `RecentTurnLossLinesInput` gains `readonly homeRegionBySeatId?: ReadonlyMap<string, string>;` with an orienting comment. When it is absent, every line prints exactly as it does today.
   - Add a private function `responsibleSideName(ownerId, input)`. It returns what `sideLabel` returns, except that for a seat other than the reading seat whose home region is in the map, it returns `{code} ({home region})`. Pass the home region through `sideHomeNameKey` from `src/shared/shortSideName.ts`, which drops a trailing abbreviation such as ` (SEGAS)`, so no parentheses nest. For example: `a3 (Southern & eastern Germany, Austria, Switzerland)`.
   - In `responsibleText`, use `responsibleSideName` instead of `sideLabel`. When any name it prints includes a home region, join every name with ` and ` (for example `by a2 (Northern France & Belgium) and a3 (Southern France)`), because home regions contain commas. Otherwise keep today's joins. Update its orienting comment.
   - The `Losses of …:` header keeps `sideLabel`, so it stays short.
   - Replace `RECENT_TURN_LOSS_LEGEND` with exactly:

   **Prompt text:**

   ```ts
   export const RECENT_TURN_LOSS_LEGEND =
     'Loss lines are game records, not claims by any side. "by" names the side whose units or actions destroyed the units listed, and the closing "(by ...)" counts the units that fought them. "you" is your own side, "Neutral" is the Neutral side, and every other side is named by its code, which is the Code column of the Sides table and the prefix of its unit ids, followed by its home region in parentheses. "no side responsible" means no other side caused the loss. "by unknown side" means the game could not tell, or the loss was recorded before the game kept that detail.';
   ```

5. `recentTurnNotesSection.ts`: where it builds `seatOrder` from `sortSeatsByOrder(getSeatRoster())`, also build `homeRegionBySeatId` (seat id to `homeRegion`) from the same roster. Add the field to the context type that carries `seatOrder` (with an orienting comment), and pass it to `buildRecentTurnLossLines`. This one builder serves the strategic orders prompt, the battle orders prompt, and the talk prompt, so all three change together.
6. Docs:
   - `strategic-prompt.md`: in the Sides section, rename the column to `Code (unit id prefix)` and change "**Omit** in a battle" to say the table is in every orders prompt. Update the sentence that names "the Unit id prefix column".
   - `tactical-prompt.md`: add a Sides entry in the same style as the strategic one, and remove "the Sides table" from the list of what the battle prompt must not contain.
   - Both example prompts: rename the column. Add the Sides table to `example-tactical-prompt.md` after the win-condition text, using the same two sides it already describes.
   - Wherever these documents quote a loss line or the loss legend, update it to the new format.

### Tests

- `sidesBlock.test.ts`: the header row is the new text exactly. Update the existing header assertion, and change nothing else.
- `consultPromptParts.test.ts`: a tactical consult's system text contains `## Sides`, the header row, and the opposing side's code. Its headings still nest (use the existing `assertHeadingsNest` helper).
- `recentTurnLossLines.test.ts`: without `homeRegionBySeatId`, every existing case passes unchanged. With a map, a single responsible side prints `by a2 (Northern France & Belgium)`. Two sides print `by a2 (Northern France & Belgium) and a3 (Southern France)`. A home region ending in ` (SEGAS)` prints without that part. `you`, `Neutral`, `no side responsible`, and `by unknown side` are unchanged. A `Losses of a2:` header has no region.
- `recentTurnNotesSection.test.ts`: on its existing seated match, a loss line names the side's home region after its code. The existing legend assertions pass with the new constant.

### Verification

Run the Phase Check, including `promptOutline.test.js`.

---

## Phase 13 — Logging the Talk Prompts

With `AGENT_WARS_LOG_FULL_PROMPTS` on, each talk call writes its system and situation text to disk beside the orders prompt logs. With it off, a talk call logs only lengths.

**Add:** nothing.
**Edit:** `src/main/openRouter/requestOrdersFlowSupport.ts`, `src/main/openRouter/requestOrdersFlowSupport.test.ts`, `src/main/openRouter/talk/requestTalk.ts`, `src/main/openRouter/talk/requestTalk.test.ts`, `doc/ai-commander-prompts/README.md`, `doc/commander-messages.md`

### Steps

1. Run the existing tests of the source files in the Edit list and record that they pass.
2. `requestOrdersFlowSupport.ts`:
   - `PromptLogArtifactKind` becomes `'user' | CoordinateContextMode | 'talk-system' | 'talk-user'`. Update its orienting comment.
   - `resolveFullPromptLogFileName` maps `'talk-system'` to the stem `debug-last-talk-system-prompt` and `'talk-user'` to `debug-last-talk-user-prompt`, so the files are `debug-last-talk-system-prompt-{N}.txt` and `debug-last-talk-user-prompt-{N}.txt`. Keep the exhaustive check.
   - `LogPromptPreviewOptions` gains `previewWhenDisabled?: boolean`, with an orienting comment. When it is false and full prompt logging is off, `logPromptPreview` logs `logDebug(label, { chars: content.length })` and nothing else, so no prompt text reaches the debug log. When it is absent or true, behavior is unchanged.
3. `requestTalk.ts`: build the system text and the situation text once, into two constants, and use those constants in the request body. After that, and before the request is sent, call `logPromptPreview('requestTalk: system prompt', systemText, { artifactKind: 'talk-system', aiIndex, previewWhenDisabled: false })` and the same for the situation text with `'talk-user'` and the label `'requestTalk: user message'`. `aiIndex` is `aiIndexForSeatId(args.seatId) ?? 1` (`aiIndexForSeatId` is in `src/shared/seatIds.ts`), as `requestOrdersFlow.ts` does. A battle talk call overwrites the same two files. Only the latest talk call per commander is kept, as with the orders logs.
4. `doc/ai-commander-prompts/README.md`: in the item that lists the `debug-last-*` files, add the two talk files and say that they hold the latest talk call per commander, world map or battle. `doc/commander-messages.md`: one sentence saying the talk prompts are written to those files when `AGENT_WARS_LOG_FULL_PROMPTS` is on.

### Tests

- `resolveFullPromptLogFileName('talk-system', 2)` is `debug-last-talk-system-prompt-2.txt`, and `'talk-user'` gives `debug-last-talk-user-prompt-2.txt`.
- `logPromptPreview` with `previewWhenDisabled: false` and the flag off writes no file. (Set and restore `AGENT_WARS_LOG_FULL_PROMPTS` in a `finally`, and use a temporary working directory with `process.chdir`, restored in the `finally`.) With the flag on, it writes the file with the full content.
- `requestTalk.test.ts`, with the flag on, a temporary working directory, and a fake transport: one talk call writes both files, and the system file's text equals the system message the fake transport received.

### Verification

Run the Phase Check.

---

## Phase 14 — Docs, Final Verification, and Hand-Off

**Add:** nothing.
**Edit:** `doc/README.md`, `doc/hybrid-ai.md`, and any document under `doc/` that the search in step 2 finds out of date

### Steps

1. `doc/hybrid-ai.md`: in the talk stage section, add two sentences: commanders may keep private agreements, and the details are in `doc/commander-messages.md`.
2. Search `doc/` for `side_stances`, `sideMessageRuleBlock`, `buildTalkSystemText`, `posture`, `ENVELOPE_FIELD_ORDER`, `Unit id prefix`, `RECENT_TURN_LOSS_LEGEND`, and `debug-last-`. Wherever a document lists the side tables, the talk system text, the message rules, the envelope fields, the Sides table, the loss legend or loss-line format, or the prompt log files, make sure it now includes this plan's changes.
3. `doc/README.md`:
   - In the overview paragraph, change the sentence `Alliances and async multiplayer remain unbuilt.` to `Commanders may also keep private agreements, which the game never enforces. Binding alliances and async multiplayer remain unbuilt.`
   - In the index row for `commander-messages.md`, add `private agreements` to the role, and add `SIDE_AGREEMENT_MAX_TURNS` and `sideAgreementsEnabled` to the symbols its status line says it matches.
4. Search the whole diff for plan vocabulary and remove it: `git diff -- src doc | Select-String -Pattern 'Phase \d|side-agreements-execution|execution plan|locked decision' -CaseSensitive:$false`. Nothing under `src/` or `doc/` may match.
5. Search new and edited source for logged text: `git diff -- src | Select-String -Pattern 'log(Debug|Trace|Error)\(.*(terms|reason|text)\b'`. Each match must log a length or a count, not the value. Fix any that log the value.
6. Run the full Verification Bar. This is its only run after Phase 0.
7. Fill in the Completion Log, including the final line counts of `orderResponseParsing.ts`, `requestOrdersApplyParsed.ts`, `requestOrdersFlow.ts`, and `consultPromptParts.ts`.
8. In your final message, name every document you updated, as `AGENTS.md` requires.

### Manual checklist for the user

Give the user this list in your final message:

1. Start an Observe match on a regional map with four AI sides, at least two of them on capable models. After five turns, save, and run `SELECT seat_id, counterpart_seat_id, kind, start_turn, end_turn, status, intent, decision, decision_turn FROM side_agreements ORDER BY agreement_id;` on the save (for example, in DB Browser for SQLite). Expect some agreements, each with an end turn no more than nine turns after its start.
2. Run `SELECT record_type, turn_number, display_text FROM match_records WHERE record_type IN ('agreement_recorded', 'agreement_decision') ORDER BY record_id;`. Expect one `agreement_recorded` row per new or changed agreement, and one `agreement_decision` row per decision. `display_text` is empty.
3. Compare two sides' records of the same pair. They may differ. That is intended.
4. With `AGENT_WARS_LOG_FULL_PROMPTS` set, open the strategic prompt log for one commander. Expect the two agreement bullets in the message rules and a `Your agreements:` part in the Messages section once that commander has an agreement. A tactical prompt log shows neither.
5. Set `AGENT_WARS_DISABLE_TALK=1`, start a match, play two turns, and expect no rows in `side_agreements` and no `agreementDecisions` text in the strategic prompt log.
6. Load a save made before this change. It loads, and `side_agreements` exists and is empty.
7. With `AGENT_WARS_LOG_FULL_PROMPTS` set, play one turn. Expect `debug-last-talk-system-prompt-N.txt` and `debug-last-talk-user-prompt-N.txt` beside the other prompt logs, and a loss line such as `by a2 (Northern France & Belgium)` in a user prompt log once losses exist. After a battle, expect a `## Sides` table in `debug-last-tactical-prompt-N.txt`.

---

## Reliability Checklist

Check each item before you mark a phase complete:

- [ ] The phase's files were backed up before the first edit.
- [ ] The Phase Check ran and passed at the end of the phase, including every added test and every existing test of an edited file.
- [ ] New modules were tested before any existing code called them.
- [ ] No test called a real model.
- [ ] `EXPECTED_USER_VERSION` and `GAME_DB_REQUIRED_TABLES` are unchanged.
- [ ] No log line carries agreement terms, a reason, message text, or a prompt body.
- [ ] Nothing added to a system prompt changes during a match. Whether agreement text appears depends only on the theater and `isTalkStageEnabled()`.
- [ ] Battle talk prompts, battle talk schemas, battle orders prompts, and battle orders schemas contain no agreement text and no agreement field.
- [ ] The orders contract text and the orders schema both decide `agreementDecisions` with `sideAgreementsEnabled`.
- [ ] No file under `src/main/sideAgreements/` imports from `src/main/openRouter/` except with `import type`.
- [ ] No file under `src/main/openRouter/talk/` imports `sideAgreementGate.ts`, `openRouter.ts`, or a `commanderPool*` file.
- [ ] Every new function, type, interface, field, and constant has a full orienting comment that describes behavior and is not generic filler.
- [ ] `npm run check:circular` shows only the Phase 0 cycles.
- [ ] No baseline file was edited.
- [ ] No commit, push, stash, checkout, restore, reset, or clean was run.
- [ ] No plan vocabulary appears in `src/` or `doc/`.
- [ ] No file under `src/renderer` changed, and no shared IPC type changed.
- [ ] Loss lines built without `homeRegionBySeatId` are unchanged, and every existing loss-line test passes without edits.
- [ ] With full prompt logging off, no talk prompt text reaches the debug log.

## Success Definition

- `side_agreements` exists in new and in existing databases, `EXPECTED_USER_VERSION` is unchanged, saves from the previous build load, and a new match clears the table.
- On the world map, a talk reply can create and change agreements within the limits, and every rejected entry is dropped without affecting the rest of the reply. A battle talk reply cannot.
- The talk system prompt explains why diplomacy matters in both theaters, and explains agreements on the world map only.
- Each commander sees only its own agreements: in the strategic talk prompt and in the Messages section of the strategic orders prompt, each open one with the game's record of losses both ways since it began.
- The strategic orders reply may decide keep or break for active agreements. Decisions are stored, recorded, and shown in the next talk prompt. Nothing checks them against the orders.
- Every agreement change and every decision is a recorder event visible only to its commander.
- With `AGENT_WARS_DISABLE_TALK` set, nothing about agreements appears in any prompt and nothing is stored.
- Every orders prompt, battles included, has a Sides table with a `Code (unit id prefix)` column, and every loss line's `by` names the side's home region after its code.
- With `AGENT_WARS_LOG_FULL_PROMPTS` on, each commander's latest talk system and situation texts are on disk.
- The Verification Bar passes.

---

## Phase 0 Inventory

| Item | Value |
|------|-------|
| `git status --short` | |
| `npm test` | |
| `npm run build:renderer` | |
| `check:circular` cycle list | |
| `EXPECTED_USER_VERSION` (must not change) | |
| Missing symbols | |

## Defect Inventory

| Phase | Command | First error | Action taken |
|-------|---------|-------------|--------------|

## Completion Log

| Phase | Result | Sketch differences | Test files changed outside the Add/Edit lists | Docs updated |
|-------|--------|--------------------|-----------------------------------------------|--------------|
