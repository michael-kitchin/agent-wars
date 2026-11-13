# Operations 3 of 6, Operation Menu: Execution Plan

## Where This Plan Sits

| Order | File | What it delivers |
|-------|------|------------------|
| 0 | `2026-11-13-logistics-commander-execution-plan.md` | Goals, tools, production priorities, mercenaries, missiles |
| 1 | `2026-11-13-operations-1-lift-foundations-execution-plan.md` | Embarked units stay aboard; shared lift rules and terrain helpers |
| 2 | `2026-11-13-operations-2-sea-operations-execution-plan.md` | Stored operations; the engine runs sea landings end to end |
| 3 | this file | The commander sees a menu and can launch and cancel |
| 4 | `2026-11-13-operations-4-air-operations-execution-plan.md` | Air landings; objectives the commander names itself |
| 5 | `2026-11-13-operations-5-land-campaign-execution-plan.md` | The land campaign shown and chosen as an operation |
| 6 | `2026-11-13-operations-6-posture-execution-plan.md` | A posture the commander declares, which shifts the engine's settings |

Plans 0, 1, and 2 must be complete, and plan 2's verification run must have shown at least one operation reach `assault`, before this plan starts. If that run failed, stop and report; do not build a menu over a sequence that does not execute.

## Why This Change

After plan 2 the engine launches sea operations by itself. The commander can pull units out but cannot choose the objective or call an operation off. The user's goal is the reverse split: the commander picks from a short list of achievable operations, each with its impact, cost, and risk, and the engine does the rest.

This plan adds that list to the briefing, two commands to the reply, a one-turn window for the commander to choose before the engine does, and a consult trigger so a commander on an event-driven policy is asked at the moments that matter.

## Requirements

| Id | Requirement |
|----|-------------|
| R1 | When a seat has a free operation slot and at least one candidate, the briefing prints an Operation Options table with up to five rows. Each row carries a letter, the objective, the method, a one-line plan, and impact, cost, and risk as plain numbers. |
| R2 | The reply may carry an `operations` array. `{"action":"launch","option":"B"}` launches that row. `{"action":"cancel","id":"<operation id>"}` calls an operation off. |
| R3 | A launch may pick any listed row, including one whose objective is defended. The engine's own launch still takes only a clear one. |
| R4 | The engine launches by itself only after the options have been offered for one full planning phase and the slot is still free. |
| R5 | A cancelled operation never strands cargo. In `muster` its units are freed. At sea it turns back. Ashore it simply ends. |
| R6 | A seat is consulted on the turn an operation of its own changes phase or ends, and on the turn options are first offered, whatever its consultation policy. |
| R7 | A command that cannot be carried out is dropped with a reason in the drop list, the way a bad `campaignTarget` is. It never fails the consult. |
| R8 | The tactical prompt and the tactical reply contract are unchanged. |
| R9 | Living docs match the builders in the same change. |

## Decisions Already Made

Do not reopen these.

- Option letters are positions in the candidate list at consult time. The same function builds the list for the briefing and for the launch, from the same state, so a letter means the same row in both.
- Factors are shown as counts and turns. There is no combined score. The rows are in the engine's order: clear objectives first, larger cities first.
- The commander does not choose units or a force size in this plan. The candidate already names them.
- The offer window is one planning phase. It is stored per seat as the turn number the options were first offered.
- A launch from the reply takes effect at once: the operation is stored and its first marches are assigned while the reply is applied. Those marches begin moving on the following turn, because standing-order moves for the current turn are generated before commands are applied.
- The consult trigger is a mandatory override, built the way `campaign_ready` is.
- Combat odds for the assault are not shown. The existing estimator works on units in place, not on a force that has not sailed.
- `operations` is omitted from the reply example. The contract paragraph and the system prompt describe it.

## Constants

| Name | File | Value | Status |
|------|------|-------|--------|
| `OPERATION_OPTION_LETTERS` | `src/main/operations/operationRules.ts` | `['A','B','C','D','E']` | new; its length must equal `OPERATION_MENU_SIZE` |
| `OPERATION_OFFERS_CONFIG_KEY` | `src/main/gameDb/operationMemory.ts` | `'operation_offers'` | new |
| `OPERATION_EVENTS_CONFIG_KEY` | `src/main/gameDb/operationMemory.ts` | `'operation_events'` | new |

## Rules for the Implementing Agent

Read these before Phase 1. They apply to every phase.

- Never commit or push.
- Source files under `src/` use CRLF line endings. Keep CRLF. `.spec` files may stay LF.
- Do not put plan words in code, comments, test names, or docs: no "Phase", "Step", "R1", "Operations 3", and so on. The game's own words `phase`, `muster`, `transit`, `assault`, and `return` are product terms and are allowed.
- Every new or changed function, constant, and interface field needs an orienting comment block with at least 5 non-empty lines: a summary line, then `Purpose:` (or `Contract:` on interface fields), `When to use:`, `Expected outcome:`, `Exceptions:`.
- Logging: every new exported function logs its call. Use `logDebug` when it changes state or makes a per-turn or per-consult decision, `logTrace` when it only reads and returns, and `logError` for every caught exception. Use the existing `../logger` import of each file.
- Documentation follows `AGENTS.md`. In the documentation phase, also read `doc/README.md`: add every new exported constant this plan introduces to the engine-constants section there, beside the campaign constants, naming its file. Search `doc/` for any sentence the change makes wrong. End your final summary with the list of documents you updated.
- Mark every new binding `const` and every new interface field `readonly`.
- No function takes more than 6 named arguments. Use one `args` object.
- `orderResponseParsing.ts` (753 lines) and `requestOrdersApplyParsed.ts` (728 lines) are over the 600-line target. Add only the lines this plan names to them. New logic goes in the new files.
- Tests cover happy paths and essential failure cases only. Never delete a content assertion. Never replace an assertion with `assert.ok(true)`.
- PowerShell does not support `&&`. Chain commands with `; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`.
- When a step says "replace", replace exactly the quoted text. If it is not found, stop and report.
- When a step says "read first", open the named function before editing. If it does not do what this plan says, stop and report.
- Sort unit ids and hex ids with `<` on the strings.
- Numbers in prompt text come from the named constant or helper.

## Phase 1: One Candidate Function and the Offer Window

Goal: R4, and the shared function R1 and R2 both need.

### Step 1: Share the candidate inputs

Read `advanceOperationsForSeat` in `src/main/operations/operationTurnFlow.ts` first. Its launch step builds `landMass`, `terrain`, `protectedUnitIds`, and `hasCampaignPlan`, then calls `listSeaOperationCandidates`.

- [ ] Move that into an exported function in a new file `src/main/operations/operationCandidates.ts`:

```ts
export function operationCandidatesForSeat(args: {
  readonly state: GameStateSnapshot;
  readonly seatId: string;
  readonly active: readonly Operation[];
}): OperationCandidate[]
```

  It returns `[]` when `loadCampaignLandMass` returns `null`, and `[]` when the active operations already fill every slot. On a thrown error it logs with `logError` and returns `[]`. Also export `operationSlotsForState(state): number` from this file; it holds the `OPERATION_MAX_SEA_PER_SIZE × GAME_SIZE_MULTIPLIER` expression.
- [ ] `advanceOperationsForSeat` calls the new function. Its tests must pass unchanged.

### Step 2: Offer and event storage

In `src/main/gameDb/operationMemory.ts`. Both values are JSON objects keyed by seat id, holding one integer each.

- [ ] `readOperationOfferTurn(ops, seatId): number | null` and `writeOperationOfferTurn(ops, seatId, turn: number | null)`. `null` removes the seat's entry.
- [ ] `readOperationEventTurn(ops, seatId): number | null` and `writeOperationEventTurn(ops, seatId, turn: number)`.
- [ ] Share one private reader and one private writer between the four; do not copy the JSON handling.
- [ ] Clear both keys where plan 2 cleared `OPERATIONS_CONFIG_KEY`: in `resetGame.ts`, and for the seat in `deleteSeatPrivateRows`.

### Step 3: The launch rule

In `advanceOperationsForSeat`, replace the launch step with:

- [ ] `candidates = operationCandidatesForSeat({ state, seatId, active: kept })`. `clear = candidates.find((candidate) => candidate.clear)`.
- [ ] No candidate at all: `writeOperationOfferTurn(..., null)`. Stop.
- [ ] `offered = readOperationOfferTurn(...)`.
  - `offered === null`: `writeOperationOfferTurn(..., state.turnNumber)`, `writeOperationEventTurn(..., state.turnNumber)`. Do not launch. Stop.
  - `offered < state.turnNumber` and `clear` exists: launch `clear` as plan 2 does, then `writeOperationOfferTurn(..., null)`. Then repeat this step for the next slot.
  - Otherwise: stop.
- [ ] Also call `writeOperationEventTurn(..., state.turnNumber)` when any stored operation's step had an `outcome` other than `'running'`, or a `next.phase` different from the phase it started the turn in, or when the engine launched one.

### Step 4: Tests

- [ ] `operationMemory.test.ts`: offer turn write, read, and clear; the two keys do not disturb each other or the operations key.
- [ ] `operationTurnFlow.test.ts`: change the plan 2 launch test. First call on turn 5: no operation, offer turn 5, event turn 5. Second call on turn 6: one operation in `muster`, offer cleared, event turn 6. A call with no candidate clears a stored offer.
- [ ] New `operationCandidates.test.ts`: full slots give `[]`; a missing land mass gives `[]`.

### Phase 1 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/gameDb/operationMemory.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/operationTurnFlow.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/operationCandidates.test.js`

## Phase 2: The Options Table

Goal: R1.

### Step 1: Heading

- [ ] `promptSpec/sectionHeadings.ts`: after `SECTION_TITLE_OPERATIONS`, add `export const SECTION_TITLE_OPERATION_OPTIONS = 'Operation Options' as const;`. Add it wherever `SECTION_TITLE_OPERATIONS` is registered (`rg -n "SECTION_TITLE_OPERATIONS" src`).

### Step 2: The table, in `src/main/openRouter/briefingSectionsOperations.ts`

- [ ] `export function buildOperationOptionsSection(args: { readonly state: GameStateSnapshot; readonly seatId: string; readonly candidates: readonly OperationCandidate[]; readonly format: (h3Index: string) => string }): string`
  - `''` when there is no candidate.
  - Otherwise `subHeading(SECTION_TITLE_OPERATION_OPTIONS)`, a blank line, and `buildPromptTableLines(['Option', 'Objective', 'Method', 'Plan', 'Impact', 'Cost', 'Risk'], rows)`.
  - Option: `OPERATION_OPTION_LETTERS[index]`.
  - Objective: `format(objectiveH3)`.
  - Method: `sea`.
  - Plan: `${units} ground units muster at ${muster}; ${ships} ships sail to ${landing}; assault ${objective}`.
  - Impact: `${urban} city cells`, plus `, in an enemy home region` when `inEnemyHome`.
  - Cost: `${units} of ${groundTotal} ground units, ${ships} of ${navalTotal} ships, about ${etaTurns} turns`. The totals count the seat's units in `state.units`.
  - Risk: `${defenders} enemy units within ${LIFT_OBJECTIVE_CLEAR_RADIUS} hexes; ${reinforcers} more can reach it in ${etaTurns} turns`, plus `; ${fortified} fortified cells` when `knownFortifiedCount > 0`.
  - Use the singular (`1 ground unit`, `1 ship`, `1 turn`, `1 enemy unit`, `1 city cell`, `1 fortified cell`) when a count is 1.
- [ ] `buildOperationsSection` (plan 2) gains an optional `readonly options?: string` in its `args`. When `options` is not empty, the section is the heading, the operation bullets when there are any, a blank line, and `options`. With no operation and no options it stays `''`.

### Step 3: Feed it

- [ ] `requestOrdersInjection.ts`, where `operationsText` is built: `candidates = operationCandidatesForSeat({ state: args.state, seatId, active })`, then pass `buildOperationOptionsSection(...)` as `options`. Add `readonly hasOperationOptions: boolean;` to `StatusInjectionTexts`, true when `candidates.length > 0`.
- [ ] `consultPromptParts.ts`: the `else` branch literal needs `hasOperationOptions: false`.

### Step 4: Tests in `briefingSectionsOperations.test.ts`

- [ ] Two candidates give rows `A` and `B` with the texts above.
- [ ] A candidate with one defender and one fortified cell uses the singular forms.
- [ ] No candidate and no operation gives `''`. Options with no operation gives the heading and the table.

### Phase 2 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/briefingSectionsOperations.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/briefingFormatter.test.js`

## Phase 3: Commands

Goal: R2, R3, R5, R7.

### Step 1: Cancel is a pure step, in `src/main/operations/seaOperationAdvance.ts`

- [ ] `export function cancelSeaOperation(operation: Operation, facts: OperationFacts): OperationStep`

| Phase | Result |
|-------|--------|
| `muster` | `next: null`, `outcome: 'abandoned'`, a `cancelOrder` for every unit and ship |
| `transit` | the result of plan 2's private `turnBack(operation, facts)`: `phase: 'return'`, the return port chosen, a `march` there for every ship; `outcome: 'running'` |
| `assault` | `next: null`, `outcome: 'abandoned'`, no action |
| `return` | `next: operation`, no action, `outcome: 'running'`, `reason: 'already returning'` |

- [ ] One test per row in `seaOperationAdvance.test.ts`.

### Step 2: Parse, new file `src/main/openRouter/operationCommandParsing.ts`

- [ ] Types and function:

```ts
export type OperationCommand =
  | { readonly action: 'launch'; readonly option: string }
  | { readonly action: 'cancel'; readonly id: string };

export function normalizeOperationCommands(raw: unknown): {
  readonly commands: readonly OperationCommand[];
  readonly dropReasons: readonly string[];
}
```

  - `undefined` gives no command and no reason.
  - Anything that is not an array gives the reason `operations dropped: expected an array.`
  - A `launch` entry needs `option`, a string that after `trim()` and `toUpperCase()` is in `OPERATION_OPTION_LETTERS`.
  - A `cancel` entry needs `id`, a non-empty string after `trim()`.
  - Any other entry gives `operations entry dropped: expected {"action":"launch","option":"<letter>"} or {"action":"cancel","id":"<operation id>"}.`
  - Keep at most the first `launch` and every `cancel`. A second `launch` gives `operations entry dropped: one launch per turn.`
- [ ] Tests in `operationCommandParsing.test.ts`: each bullet above.

### Step 3: Carry it through the parser

Read the `campaignTarget` handling in `src/main/openRouter/orderResponseParsing.ts` first.

- [ ] Beside `campaignTargetCode?: string;` in the parsed-orders type, add `operationCommands?: readonly OperationCommand[];` with an orienting block.
- [ ] Beside `const rawCampaignTarget = obj.campaignTarget;` add `const operationCommands = context.mode !== 'tactical' ? normalizeOperationCommands(obj.operations) : { commands: [], dropReasons: [] };`.
- [ ] Add `...operationCommands.dropReasons` to the `dropReasons` array, and `operationCommands: operationCommands.commands.length > 0 ? operationCommands.commands : undefined` to the returned object beside `campaignTargetCode`.

### Step 4: Apply, new file `src/main/operations/operationCommands.ts`

- [ ] Function:

```ts
export function applyOperationCommands(args: {
  readonly state: GameStateSnapshot;
  readonly seatId: string;
  readonly commands: readonly OperationCommand[];
  readonly coordinates: KnockoutCoordinates;
}): { readonly appliedCount: number; readonly dropReasons: string[] }
```

  - Read the seat's stored operations once. Before anything is changed, build `listed = operationCandidatesForSeat({ state, seatId, active })`. This is the list the briefing printed, so a letter means the row the commander saw.
  - Apply every `cancel` first, then the `launch`.
  - `cancel`: no stored operation with that id gives `operations cancel dropped: ${id} is not one of your operations.` Otherwise run `cancelSeaOperation`, `applyOperationActions`, and keep `step.next` in place of the operation.
  - `launch`: take the candidate from `listed` by the letter's index. An index beyond the list gives `operations launch dropped: option ${letter} is not listed this turn.` Otherwise create the `Operation` exactly as the engine launch does, with `source: 'commander'`; run `advanceSeaOperation` once and apply its actions; keep it. Then `writeOperationOfferTurn(..., null)`. `listed` is empty whenever every slot was full when the briefing was built, so a cancel and a launch by letter cannot both succeed in one reply; that is intended.
  - Build the `OperationFacts` for that one advance with the same function `advanceOperationsForSeat` uses. Export that fact builder from `operationTurnFlow.ts` as `buildOperationFacts`; do not copy it.
  - `writeOperationsForSeat` once at the end. `writeOperationEventTurn(..., state.turnNumber)` when anything was applied.
  - Log each launch with `logDebug('operationCommands launched', { seatId, id, option, objectiveH3 })` and each cancel with `logDebug('operationCommands cancelled', { seatId, id, phase })`.
  - The whole body is inside a `try`/`catch`. A throw is logged with `logError` and returns `{ appliedCount: 0, dropReasons: ['operations dropped: the engine could not apply them.'] }`.
- [ ] Tests in `operationCommands.test.ts`, against the database of `operationTurnFlow.test.ts`: launching `A` stores a `commander` operation in `muster` and clears the offer; launching `C` with two candidates is dropped with the reason; cancelling an operation in `muster` removes it and cancels its marches; cancelling an unknown id is dropped; with the slot full, a reply that cancels and launches `A` applies the cancel and drops the launch with the not-listed reason.

### Step 5: Call it when the reply is applied

Read the `applyCampaignTargetOverride` call in `src/main/openRouter/requestOrdersApplyParsed.ts` first.

- [ ] Directly after that block add:

```ts
  if (!tacticalBattle && ordersEnabled && parsed.operationCommands) {
    const operationResult = applyOperationCommands({
      state: planState,
      seatId,
      commands: parsed.operationCommands,
      coordinates: { latLngByH3, resolveToH3 },
    });
    dropReasons.push(...operationResult.dropReasons);
  }
```

  If `latLngByH3` in that function is not a `Map<string, LatLng>`, wrap it with `new Map(latLngByH3)`.

### Step 6: The reply contract

Read every `campaignTarget` hit from `rg -n "campaignTarget|includeCampaignTarget" src/main/openRouter --glob "!*.test.ts"` first. Add `operations` beside each, with a gate named `includeOperations`.

- [ ] `promptSpec/envelopeContract.ts`: add `'operations'` to `ENVELOPE_FIELD_ORDER` after `'campaignTarget'`; add `readonly includeOperations?: boolean;` to `EnvelopeGates`; in the field filter add `if (field === 'operations') return gates.coordinateMode !== 'tactical' && gates.includeOperations === true;`.
- [ ] `promptSpec/envelopeJsonSchema.ts`: add a `case 'operations':` that returns an array schema whose items are `anyOf` two object schemas: `action` const `launch` with `option` an enum of `OPERATION_OPTION_LETTERS`; `action` const `cancel` with `id` a string. Build them the way `productionOrderRowSchema` builds its rows. Read it first. Wherever the schema builder treats `campaignTarget` as optional (left out of a `required` list, or allowed to be absent under structured outputs), treat `operations` the same way.
- [ ] `promptContracts.ts`: add `operations: '"operations": [...]'` to `headerSlots`; add `includeOperations` beside `includeCampaignTarget` in the three places it appears; add a paragraph after `campaignParagraph`, printed when `gates.includeOperations === true`:

```text
Optional "operations": launch or cancel an operation. To launch a row of Operation Options, add {"action":"launch","option":"<letter>"}. To call one off, add {"action":"cancel","id":"<operation id>"} with an id from the Active Operations section. At most one launch per turn. Omit the array to change nothing.
```

- [ ] `consultPromptParts.ts`: pass `includeOperations: coachingGates.operationsEnabled === true` beside `includeCampaignTarget`.
- [ ] `requestOrdersFlow.ts`: pass `includeOperations: !tacticalBattle && flags.ordersEnabled` beside `includeCampaignTarget`.

### Step 7: Tests

- [ ] `promptSpec/envelopeContract.test.ts` and `envelopeJsonSchema.test.ts`: `operations` is present for strategic gates with `includeOperations: true`, absent otherwise, and absent for every tactical gate set. The schema accepts a launch and a cancel and rejects an entry with neither.
- [ ] `orderResponseParsing.test.ts`: a strategic reply with `operations` yields `operationCommands`; a tactical reply with the same field yields none and no reason.
- [ ] `promptContracts.test.ts`: the paragraph prints with the gate and not without.

### Phase 3 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/seaOperationAdvance.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/operationCommandParsing.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/operationCommands.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/orderResponseParsing.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/envelopeContract.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/envelopeJsonSchema.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptContracts.test.js`
- [ ] `npm run check:circular` reports no new cycle.

## Phase 4: Consult Trigger

Goal: R6.

Read `campaignReadyOverride` in `src/main/openRouter/afterResolution.ts` and the `MandatoryOverrideResult` union in `src/main/callbackEvaluation.ts` first.

- [ ] In the union, after the `campaign_ready` member, add `| { type: 'operation_update' }`.
- [ ] In `afterResolution.ts` add, beside `campaignReadyOverride`:

```ts
export function operationUpdateOverride(
  state: GameStateSnapshot,
  seatId: AiSeatId,
  ordersEnabled: boolean
): Extract<MandatoryOverrideResult, { type: 'operation_update' }> | null
```

  It returns `{ type: 'operation_update' }` when `ordersEnabled` and `readOperationEventTurn({ getOne: dbGetOne }, seatId) === state.turnNumber`, otherwise `null`. Log the result with `logDebug`.
- [ ] In `afterResolution`, directly after `if (campaignReady) mandatoryFired.push(campaignReady);`, push the result of `operationUpdateOverride` the same way.
- [ ] Run `rg -n "campaign_ready" src doc`. Wherever a switch, a label map, a test, or a doc lists the mandatory override types, add `operation_update` beside it.
- [ ] Test, in the file that tests `campaignReadyOverride` (`rg -l "campaignReadyOverride" src --glob "*.test.ts"`): a stored event turn equal to the state's turn fires; a different turn does not; `ordersEnabled: false` does not.

### Phase 4 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }` then run that test file and `node dist/main/callbackEvaluation.test.js`.

## Phase 5: Prompt Text

Goal: the commander knows the commands exist.

- [ ] `promptSpec/operationRuleText.ts`: `buildOperationRuleBlock` gains a parameter `commandsEnabled: boolean`. When true, insert this paragraph after the first paragraph:

```text
When you have room for another operation, Operation Options lists up to ${OPERATION_MENU_SIZE} you could launch, with what each would gain, what it would tie up, and what stands in its way. Launch one with "operations": [{"action":"launch","option":"<letter>"}]. If you launch none, the engine launches the first undefended one the next turn. Call an operation off with {"action":"cancel","id":"<operation id>"}: one that is still mustering frees its units, and one at sea turns back.
```

  The caller in `coachingTextStrategic.ts` passes `gates.operationsEnabled === true`.
- [ ] `promptSpec/consultationText.ts`: add `readonly hasOperationOptions?: boolean;` to `OpeningMessageGates`. In `buildOpeningActionClause`, after `campaignClause`, add `const operationClause = gates.ordersEnabled && gates.hasOperationOptions === true ? ' Launch an operation from Operation Options if one is worth its cost.' : '';` and append it to the returned string.
- [ ] Run `rg -n "hasCampaignOrders" src` and add `hasOperationOptions` beside every hit, fed from `injection.hasOperationOptions`.
- [ ] Tests: `promptSpec/coachingText.test.ts` for the paragraph; `promptSpec/consultationContract.test.ts` for the clause; tactical cases unchanged.

### Phase 5 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/coachingText.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/consultationContract.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/variantConformance.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/openRouterMatrix.test.js`

## Phase 6: Documentation and Final Verification

- [ ] `doc/hybrid-ai.md`: the offer window, the two commands, and the consult trigger, in the Operations section.
- [ ] `doc/ai-commander-prompts/strategic-prompt.md`, `assembly-contract.md`, `consultation-flow.md`, `information-decision-model.md`, `variants.md`, `source-inventory.md`, `crosswalk.md`: the Operation Options table, the `operations` field, the contract paragraph, the opening clause, and the new consult trigger.
- [ ] `doc/ai-commander-prompts/example-strategic-prompt.md`: an Operation Options table with two rows. `example-strategic-response.md`: one `launch`.
- [ ] `doc/ai-tools.md`: only if it lists reply fields.
- [ ] `node scripts/check-doc-links.cjs` passes.
- [ ] `npm test` passes. `npm run check:circular` reports no new cycle.
- [ ] `rg -n "Phase [0-9]|Step [0-9]|\bR[0-9]+\b" src doc` shows no hit introduced by this change.
- [ ] `orderResponseParsing.ts` grew by at most 8 lines and `requestOrdersApplyParsed.ts` by at most 10.

## Phase 7: Verification Run

This phase is for the user, not the implementing agent. The agent stops after the previous phase and reports. The run needs the game window and a model key.

- [ ] Set `AGENT_WARS_LOG_LEVEL=debug` and `AGENT_WARS_LOG_FULL_PROMPTS=1`. Run 40 turns on the global map with home regions on different continents, no fog, no tactical battles, balanced doctrine.
- [ ] From `debug.log`, per seat: count `operationCommands launched` lines (the commander) and `operationTurnFlow launched` lines (the engine); count `operations` drop reasons and list their texts; count cancels.
- [ ] Pass when at least one seat launched an operation itself, no reply was rejected because of the `operations` field, and operations still reach `assault`.
- [ ] If every launch is by the engine, read one `debug-last-openrouter-response-body-N.txt` per seat from a turn that offered options and report whether the reply mentioned them.

## Out of Scope

- Choosing units or a force size.
- Combat odds in the Risk column.
- Air operations and objectives the commander names. Plan 4.
- Any change to the game's interface.
