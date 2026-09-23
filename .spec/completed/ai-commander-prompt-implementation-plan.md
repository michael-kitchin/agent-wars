# AI commander prompt specification — code implementation plan

> **For the implementing agent:** work one task at a time, in order. Each task ends with a working tree that builds, lints, and passes the whole test suite. Do not start a task before the previous one is green.

**Goal:** bring the prompt-generating code into conformance with the specification package at `doc/ai-commander-prompts/`, and leave behind a structure where every sentence the model reads has exactly one home in code and one assertion in a test.

**Architecture:** prompt prose moves out of the assembler and briefing builders into a new `src/main/openrouter/promptSpec/` family of modules that export named text constants and small pure builders. The existing builders keep their jobs — deciding what applies, gathering state, formatting tables — but stop holding prose. A new conformance test suite asserts the specification directly, one test module per contract area.

**Tech stack:** TypeScript 5.7 (`tsconfig.main.json`), Node `node:test` and `node:assert/strict`, ESLint 9. No new dependencies.

---

## How to work this plan

1. **Read the specification first.** Before each task, read the spec sections that task names. The spec is the authority for *what the text must say*; this plan is the authority for *where the code goes and how it is verified*. This plan deliberately does not restate spec prose, because two copies of a sentence is the exact failure mode the spec exists to end.
2. **The spec wins over existing prompt text.** A sentence in today's prompt is evidence that we say it, never evidence that it is correct.
3. **If the spec looks wrong, stop.** Do not edit the specification package under `doc/ai-commander-prompts/` or other documents under `.spec/`. Do not "fix" the spec to match the code. Leave the task's code unchanged, write down the file, section, and the conflict you found, and report it. Then move to the next task if it is independent, or stop if it is not.
4. **Never commit or push.** Leave every change uncommitted for review. Do not run `git commit`, `git add`, or `git push` at any point.
5. **Test first.** For every behaviour change: write the assertion, run it, watch it fail for the reason you expect, then implement, then run it again.

### Verification recipes

Fast loop for one test module (use this constantly):

```bash
npm run build:main
node dist/main/openrouter/promptSpec/envelopeContract.test.js
```

Full gate at the end of every task (must be clean before the task is done):

```bash
npm test
```

`npm test` rebuilds native modules for Node, compiles `src/`, runs ESLint over `src/`, then runs every compiled `*.test.js` under `dist/main` and `dist/shared`. New colocated `*.test.ts` files are discovered automatically; there is no manifest to update.

Lint only, when you just want the style gate:

```bash
npm run lint
```

Optional manual smoke check, useful after the content tasks: set `AGENT_WARS_LOG_FULL_PROMPTS=1`, run `npm start`, take one turn, and read `debug-last-strategic-prompt.txt` and `debug-last-tactical-prompt.txt`. These files are gitignored build artifacts; their contract lives in `.spec/prompt-debug-log-split.md`.

---

## Global constraints

Every task inherits these. They are not optional and they are not repeated per step.

- **Logging.** Every new or changed public function logs at debug level on entry with enough detail to troubleshoot (mode, gates, counts). Getter-style functions that do not mutate state log at trace level. Every caught exception logs at error level. Use the existing `logDebug` / `logTrace` / `logError` from `src/main/logger`. These APIs check level internally, so do not guard the call — except when you would build a large string inline, in which case guard it.
- **Orienting comments.** Every new or changed field, constant, and non-overriding function of any cardinality or access level gets an orienting comment explaining why it exists, when and how to use it, and what to expect including exceptions. For the text constants in `promptSpec/`, the comment states which spec section governs the text and why the model needs it — that comment is the thing that stops a future developer from "improving" a sentence that was chosen deliberately.
- **Mutability.** Mark intent: `const` for bindings that do not change, `readonly` on interface members and array/record types that must not be mutated, `as const` / `Object.freeze` for exported literal tables.
- **Modern patterns.** Prefer array methods and template literals over index loops and string concatenation chains. Prefer discriminated unions over boolean soup.
- **File size.** 600 lines desirable, 1000 hard. If a file you are editing would cross 600, split it by responsibility as part of that task, not later.
- **Function arguments.** Six named parameters desirable, ten hard. Every builder in this plan takes a single readonly parameter object instead of a positional list.
- **Reuse.** Numeric facts in prompt text are derived from the engine constant, never retyped as a literal. If the constant is module-private, export it in the same task that needs it.
- **Testing scope.** Test happy paths and essential failure cases. Test contracts, not implementation details. Do not test DTO constructors, accessors, or pass-through wrappers. Delete tests that the spec makes obsolete rather than leaving them failing or skipped.

### Naming rules (read twice)

- **No specification carrier identifiers in code.** The spec labels each required fact with an identifier such as `WEGO_PHASE_ORDER` or `LEGAL_DEST_OCCUPANCY`. Those identifiers must not appear in any source file, comment, test name, or configuration. Name code after the domain: `buildResolutionOrderRule`, `DESTINATION_OCCUPANCY_RULE`. The mapping between the two lives only in `doc/ai-commander-prompts/crosswalk.md`.
- **No plan identifiers in code.** The task numbers in this document, and words like "phase" used as a label, must not appear in source, comments, tests, or configuration.

---

## Target file structure

New modules, all under `src/main/openrouter/promptSpec/`:

| File | Responsibility |
| --- | --- |
| `sectionHeadings.ts` | Every briefing and status section title as one exported constant. Nothing else. |
| `envelopeContract.ts` | Response-envelope field order, per-mode legal actions, invalid-output rules, callback contract clause, memory write limits, repair-schema text. The single source for every surface that describes the JSON. |
| `gameRuleText.ts` | Engine-fact sentences both modes need: resolution order, casualty sort, destination occupancy, movement budgets, ranged reach, air employment, hold-fire, production income, intel staleness, combat stats line. |
| `coachingTextStrategic.ts` | The strategic coaching items. |
| `coachingTextTactical.ts` | The tactical coaching items. |
| `coachingText.ts` | Composes the mode's coaching bullets from the two above and the active gates. |
| `callbackVocabularyText.ts` | The callback events the prompt teaches, with their parameters. |
| `consultationText.ts` | The opening user message and the repair request message. |

New test modules, colocated in the same directory:

| File | Asserts |
| --- | --- |
| `sectionHeadings.test.ts` | Heading strings, and that assembled prompts use them. |
| `envelopeContract.test.ts` | Field order, gating, legal actions, repair-schema agreement. |
| `gameRuleText.test.ts` | Required facts present, numbers derived from engine constants. |
| `coachingText.test.ts` | Required coaching items present per mode and gate; prohibited claims absent. |
| `consultationContract.test.ts` | Opening message is submit-only; repair request contract. |
| `variantConformance.test.ts` | The variant matrix: fog, tool groups, roster, scenarios, game size, consultation policy. |

Existing files split by responsibility during this work:

| File | Now | Becomes |
| --- | --- | --- |
| `src/main/openrouter/briefingSections.ts` | 632 lines, three unrelated sections | production only, plus `briefingSectionsAirOps.ts` and `briefingSectionsSealift.ts` |
| `src/main/briefingFormatter.ts` | 590 lines | loses the callbacks section to `src/main/briefing/activeCallbacksSection.ts` |
| `src/main/openrouter/requestOrdersFlow.ts` | 1017 lines, over the hard limit | loses the tool loop to `requestOrdersToolLoop.ts` and the repair exchange to `requestOrdersRepairExchange.ts` |

---

## Task 1: Section titles become constants

**Why first:** it is the only task with a provable zero-byte change to prompt output, so it establishes the pattern, the module location, and the test style with no risk. Every later task copies its shape.

**Spec authority:** `assembly-contract.md` section 3 (the include and omit matrix names every heading), `strategic-prompt.md` section 1, `tactical-prompt.md` section 2.

**Files:**
- Create: `src/main/openrouter/promptSpec/sectionHeadings.ts`
- Create: `src/main/openrouter/promptSpec/sectionHeadings.test.ts`
- Modify: `src/main/briefingFormatter.ts`, `src/main/openrouter/formatTacticalBriefing.ts`, `src/main/openrouter/briefingSections.ts`, `src/main/briefing/map/briefing-map-section.ts`, `src/main/briefing/map/briefing-tables.ts`, `src/main/briefing/recentTurnNotesSection.ts`, `src/main/openrouter/openRouterBuildSystemPrompt.ts`, `src/main/openrouter/scenarioGoals.ts`, `src/main/tools/tool4Memory.ts`, `src/main/tools/tool5StandingOrdersCore.ts`

**Interfaces produced:** exported `const` title strings, consumed by every later task.

- [ ] **Step 1: write the failing test.** Create `sectionHeadings.test.ts` asserting each exported title equals its exact current string. Take the strings from the code, not from memory. The titles to cover, with their current emitted form:

| Constant | Emitted heading |
| --- | --- |
| `SECTION_TITLE_COMMANDERS_BRIEFING` | `# Commander's Briefing` |
| `SECTION_TITLE_UNIT_STATUS_AND_THREATS` | `## Unit Status and Threats` |
| `SECTION_TITLE_ATTENTION_FLAGS` | `## Attention Flags` |
| `SECTION_TITLE_OPERATIONAL_MAP` | `# Operational Map` |
| `SECTION_TITLE_BEST_OPTIONS_THIS_TURN` | `### Best Options This Turn` |
| `SECTION_TITLE_SUPPLEMENTAL_HEX_INTELLIGENCE` | `## Supplemental Hex Intelligence` |
| `SECTION_TITLE_RECENT_TURN_NOTES` | `## Recent Turn Notes` |
| `SECTION_TITLE_PRODUCTION_STATUS` | `# Production Status` |
| `SECTION_TITLE_CONTROLLED_HEX_QUEUES` | `## Controlled Hex Queues` |
| `SECTION_TITLE_STRATEGIC_MEMORY` | `# Your Strategic Memory` |
| `SECTION_TITLE_STANDING_ORDER_STATUS` | `# Standing Order Status` |
| `SECTION_TITLE_ACTIVE_CALLBACKS` | `## Active Callbacks` |
| `SECTION_TITLE_AIR_OPERATIONS_STATUS` | `# Air Operations Status` |
| `SECTION_TITLE_NAVAL_TRANSPORT_STATUS` | `# Naval Transport Status` |
| `SECTION_TITLE_AVAILABLE_TOOLS` | `# Available Tools` |
| `SECTION_TITLE_SCENARIO_OBJECTIVE` | `# Scenario Objective (Required)` |

Export each constant holding the **title text without the leading hashes** (for example `"Commander's Briefing"`), plus two helpers so the hash level stays in one place:

```ts
export function topLevelHeading(title: string): string {
  return `# ${title}`;
}

export function subHeading(title: string): string {
  return `## ${title}`;
}
```

The reason for titles-without-hashes is that `briefingFormatter.ts` already has `markdownHeading1` / `markdownHeading2` helpers that take a bare title and add spacing; passing them a string that already begins with `#` would double the hashes.

- [ ] **Step 2: run it and watch it fail.** `npm run build:main` then `node dist/main/openrouter/promptSpec/sectionHeadings.test.js`. Expected: fails to load, module not found.
- [ ] **Step 3: create the module** with the constants and the two helpers, each with an orienting comment naming the section it titles and the spec section that requires it.
- [ ] **Step 4: run the test.** Expected: pass.
- [ ] **Step 5: replace the literals.** In each file listed above, import the constant and pass it to the existing heading helper, or interpolate it into the existing template. Where `markdownHeading1` / `markdownHeading2` are module-private in `briefingFormatter.ts`, export them so the tactical formatter can use them too instead of hand-rolling `'# ...\n\n'`. Change no spacing, no newlines, no wording.
- [ ] **Step 6: prove nothing moved.** Run the full gate. Every existing prompt test — `openRouter.matrix.test.ts`, `briefingFormatter.test.ts`, `tacticalPromptSectionParity.test.ts`, `briefingSections.test.ts`, `briefing-map-section.test.ts`, `recentTurnNotesSection.test.ts`, `tool5StandingOrders.test.ts` — must pass **unchanged**. If one fails, you changed output. Revert that edit and redo it.

**Done when:** `npm test` is clean and no existing test file was modified.

---

## Task 2: One source for the response envelope

**Why here:** three surfaces describe the JSON today and they already disagree with each other. Every later content task adds to one of those surfaces, so the single source has to exist first.

**Spec authority:** `assembly-contract.md` section 5 (field order, gating, tools versus envelope writes), `strategic-prompt.md` sections 3.1–3.4, `tactical-prompt.md` sections 3.1–3.4, `consultation-flow.md` section 5.1.

**The defect this closes:** the submit header in `buildFinalJsonContractInstruction` lists the air tails before `callbacks`; the illustrative object in `getFinalJsonOrdersExampleBlock` is built with `callbacks` before the air tails; `buildJsonAssistantRepairSchema` takes only `includeProductionOrders`, so a tactical repair advertises `memoryUpdates` and shows `assign_order` examples that are illegal in a beat. The spec fixes one order and one gating rule for all three.

**Files:**
- Create: `src/main/openrouter/promptSpec/envelopeContract.ts`
- Create: `src/main/openrouter/promptSpec/envelopeContract.test.ts`
- Modify: `src/main/openrouter/promptContracts.ts`, `src/main/openrouter/orderResponseParsing.ts`, `src/main/openrouter/requestOrdersFlow.ts`
- Modify: `src/main/openrouter/promptContracts.test.ts`, `src/main/openrouter/orderResponseParsing.test.ts`

**Interfaces produced** (later tasks consume these exact names):

```ts
export type PromptCoordinateMode = 'strategic' | 'tactical';

export interface EnvelopeGates {
  readonly coordinateMode: PromptCoordinateMode;
  readonly includeAirActions: boolean;
  readonly includeMemoryUpdates: boolean;
  readonly includeProductionOrders: boolean;
}

export const ENVELOPE_FIELD_ORDER: readonly string[];
export function envelopeFieldsForGates(gates: EnvelopeGates): readonly string[];
export function legalOrderActionsForMode(mode: PromptCoordinateMode): readonly string[];
export function buildInvalidOutputRulesClause(gates: EnvelopeGates): string;
export function buildCallbackContractClause(mode: PromptCoordinateMode): string;
export function buildMemoryWriteLimitsClause(): string;
export function buildRepairSchemaText(gates: EnvelopeGates): string;
```

- [ ] **Step 1: write the failing test.** In `envelopeContract.test.ts` assert, at minimum:
  - `ENVELOPE_FIELD_ORDER` is exactly `['message','strategy','orders','airStrikes','ferryOrders','callbacks','memoryUpdates','productionOrders']`.
  - `envelopeFieldsForGates` drops the air tails when `includeAirActions` is false, drops `memoryUpdates` unless `includeMemoryUpdates`, drops `productionOrders` unless `includeProductionOrders`, and **always** drops both `memoryUpdates` and `productionOrders` when the mode is tactical regardless of the flags.
  - For every gate combination, the returned fields are a subsequence of `ENVELOPE_FIELD_ORDER`, so no surface can reorder them.
  - `legalOrderActionsForMode('tactical')` contains neither `assign_order` nor `cancel_order`.
  - `buildRepairSchemaText` for tactical gates contains no `assign_order`, no `cancel_order`, no `memoryUpdates`, and no `productionOrders`; for strategic gates with memory and production on it contains all four.
  - `buildRepairSchemaText` mentions the fields in the same relative order as `envelopeFieldsForGates` returns them, and retains the existing legacy-array prohibition (the only rule the repair message is allowed to restate).
- [ ] **Step 2: run it, watch it fail.**
- [ ] **Step 3: implement the module.** Write the invalid-output rules from `strategic-prompt.md` 3.4 and `tactical-prompt.md` 3.4, the callback contract from `assembly-contract.md` 5.1 item 3 (the response replaces the whole subscription list, and omitting the array clears it — the strategic clause says neither today), and the memory write limits by importing them rather than retyping: export `KEY_MAX_LENGTH`, `CONTENT_MAX_LENGTH`, and the key pattern from `src/main/tools/tool4Memory.ts` and build the sentence from them.
- [ ] **Step 4: run the test.** Expected: pass.
- [ ] **Step 5: rewire the three surfaces.**
  - `buildFinalJsonContractInstruction`: build the submit header from `envelopeFieldsForGates`, take the orders clause action list from `legalOrderActionsForMode`, append `buildInvalidOutputRulesClause`, and replace the two hand-written callback clauses with `buildCallbackContractClause`. Keep the existing parameters; they map onto `EnvelopeGates` one for one.
  - `getFinalJsonOrdersExampleBlock`: build the example object by inserting keys in `ENVELOPE_FIELD_ORDER` sequence so the serialised JSON matches the header. This is the field-order fix: `callbacks` moves after `ferryOrders`.
  - `buildJsonAssistantRepairSchema`: delete it from `orderResponseParsing.ts` and call `buildRepairSchemaText` from the repair site in `requestOrdersFlow.ts`, passing the same gates the system prompt used. Move its test coverage into `envelopeContract.test.ts` and delete the obsolete assertions from `orderResponseParsing.test.ts`.
- [ ] **Step 6: update the two existing test files** for the new field order and the new clauses. `promptContracts.test.ts` currently asserts the old example ordering; correct it rather than deleting it.
- [ ] **Step 7: full gate.**

**Done when:** `npm test` is clean, no source file except `envelopeContract.ts` contains a hard-coded envelope field list, and searching the repository for `buildJsonAssistantRepairSchema` returns nothing.

---

## Task 3: Delete the claims that are false

**Why before the additions:** these are four small, independent deletions with visible test fallout. Doing them alone means that when a matrix test breaks you know exactly why.

**Spec authority:** `strategic-prompt.md` section 4 closing list ("Claims that must not appear"), `assembly-contract.md` section 6, `variants.md` section 4.2, `source-inventory.md` section 8 rows for the tempo claim and the unconditional opening.

**Files:**
- Modify: `src/main/openrouter/promptText.ts` (`buildTempoRuleLine`, `AIR_REPOSITIONING_LINE`)
- Modify: `src/main/openrouter/openRouterBuildSystemPrompt.ts` (`STRATEGIC_CONTEXT_OPENING`)
- Modify: `src/main/openrouter/scenarioGoals.ts` (`buildWinConditionReminderClause`)
- Modify: `src/main/openrouter/openRouter.matrix.test.ts`, `src/main/openrouter/promptContracts.test.ts` as needed

- [ ] **Step 1: write the failing assertions** in `openRouter.matrix.test.ts`, which already assembles full prompts across tool-flag combinations. A later task moves the prohibited-claim assertions into `promptSpec/coachingText.test.ts`; do not create that file here. Assert that an assembled strategic prompt contains none of:
  - the substring `damage given up for free`;
  - the substring `is actively searching for your forces`.
  And that a strategic prompt built from a state whose `scenarioId` is `undefined` does **not** contain `WIN_CONDITION_REMINDER_FIRST_SENTENCE`, while one built with `scenarioId === 'region_vs_region'` does.
- [ ] **Step 2: run, watch all four fail.**
- [ ] **Step 3: fix the tempo line.** In `buildTempoRuleLine`, drop the final clause. The replacement content is `strategic-prompt.md` section 4 item 3 and `tactical-prompt.md` section 4 item 1: a shot resolves from period-start position and does not consume the move, so declining one is a deliberate choice. Say nothing about what the engine does for unordered units — the spec's closing list forbids it, and the orienting comment on the function already explains why. Keep that comment.
- [ ] **Step 4: remove the unconditional opening.** Delete `STRATEGIC_CONTEXT_OPENING` and its line from `strategicContextBlock`. The scouting directive already covers the no-observed-enemy case, and the enemy-intent sentence is emitted even when the observed roster is empty.
- [ ] **Step 5: add the generic goal statement.** In `scenarioGoals.ts`, give `buildWinConditionReminderClause` a parameter object carrying the scenario id, and return the home-region wording only for `region_vs_region`. For an absent or unrecognised id, return the generic objective from `strategic-prompt.md` section 1.2: destroy the enemy force or take enemy territory, with no home-region or urban-production language. Update the one caller.
- [ ] **Step 6: qualify the air repositioning line.** `AIR_REPOSITIONING_LINE` tells the model to ferry any air unit with no strike listed. Per `strategic-prompt.md` section 2 item 11 and section 4 item 10, a unit whose base is not intact or not controlled cannot ferry from it, and the coaching must not tell it to. Add that qualification, pointing at the two columns of the air operations table that carry the answer.
- [ ] **Step 7: full gate,** fixing the matrix-test assertions that legitimately asserted the removed strings.

**Done when:** `npm test` is clean and repository-wide searches for `damage given up for free` and `actively searching for your forces` return nothing outside `.spec/` and `doc/` (tests that assert the phrases are absent are allowed).

---

## Task 4: State the rules the prompt never stated

**Spec authority:** `information-decision-model.md` section 4 (the gap list), `assembly-contract.md` section 6, `strategic-prompt.md` sections 1.5 and 4, `tactical-prompt.md` sections 1 and 2.5.

**Files:**
- Create: `src/main/openrouter/promptSpec/gameRuleText.ts`
- Create: `src/main/openrouter/promptSpec/gameRuleText.test.ts`
- Modify: `src/main/openrouter/openRouterBuildSystemPrompt.ts`
- Modify: `src/main/game-db/fogState.ts` (export `STALE_INTEL_TURNS`)
- Modify: `src/main/openrouter/briefingSections.ts` (production income sentence)

**Interfaces produced:**

```ts
export interface GameRuleTextGates {
  readonly coordinateMode: PromptCoordinateMode;
  readonly hasAirUnits: boolean;
  readonly hasNavalUnits: boolean;
  readonly ordersEnabled: boolean;
}

export function buildCombatStatsLine(mode: PromptCoordinateMode): string;
export function buildResolutionOrderRule(mode: PromptCoordinateMode): string;
export function buildCasualtySortRule(): string;
export function buildDestinationOccupancyRule(): string;
export function buildMovementBudgetRule(mode: PromptCoordinateMode): string;
export function buildRangedReachRule(mode: PromptCoordinateMode): string;
export function buildAirEmploymentRule(gates: GameRuleTextGates): string;
export function buildHoldFireRule(): string;
export function buildProductionIncomeRule(): string;
export function buildIntelStalenessRule(): string;
export function buildCombatRulesParagraph(gates: GameRuleTextGates): string;
```

`buildCombatRulesParagraph` composes the others and replaces the long inline `Combat: ...` template currently in `buildSystemPromptForTools`.

**Derive every number from its engine constant. Do not retype any of these values:**

| Fact | Import from |
| --- | --- |
| attack, defense, strategic range | `getAttack`, `getDefense`, `getRange` — `src/main/combatConstants.ts` |
| strategic movement budget | `getMovementBudget` — `src/main/combatConstants.ts` |
| casualty sort order | `CASUALTY_PRIORITY_ORDER` — `src/main/combatConstants.ts` |
| tactical movement points | `MOVEMENT_RANGE_BY_UNIT_TYPE` — `src/shared/tacticalRanges.ts` |
| tactical ranged reach | `RANGED_RANGE_BY_UNIT_TYPE` — `src/shared/tacticalRanges.ts` |
| strike and ferry radius | `AIR_STRIKE_RANGE_HEXES`, `AIR_FERRY_RANGE_HEXES` — `src/shared/tacticalRanges.ts` |
| unit costs | `UNIT_COST_BY_TYPE` — `src/shared/productionConfig.ts` |
| stale intel window | `STALE_INTEL_TURNS` — `src/main/game-db/fogState.ts`, currently module-private; export it |

- [ ] **Step 1: write the failing test.** In `gameRuleText.test.ts` assert:
  - `buildResolutionOrderRule('strategic')` names all six resolution stages in the order `assembly-contract.md` section 6.2 gives them, and the strategic and tactical forms differ only where the spec says they do.
  - `buildCasualtySortRule()` mentions lowest defence first and lists the type order in `CASUALTY_PRIORITY_ORDER` sequence — assert against the imported constant, not a literal list, so a future engine change fails the test rather than silently diverging from the prompt.
  - `buildMovementBudgetRule('strategic')` contains `String(getMovementBudget('armor'))` and states that air never marches.
  - `buildMovementBudgetRule('tactical')` contains `String(MOVEMENT_RANGE_BY_UNIT_TYPE.armor)`.
  - `buildRangedReachRule('tactical')` contains `String(RANGED_RANGE_BY_UNIT_TYPE.infantry)` and `buildRangedReachRule('strategic')` states infantry is melee-only.
  - `buildDestinationOccupancyRule()` states that an occupied cell is not a legal destination and that contact is made by attacking from an adjacent cell.
  - `buildHoldFireRule()` states that the order suppresses automatic engagement until replaced, and that leaving a unit without an attack is not the same thing.
  - `buildIntelStalenessRule()` contains `String(STALE_INTEL_TURNS)`.
  - `buildCombatRulesParagraph` for tactical gates contains no strategic strike radius, and for strategic gates contains no tactical movement-point wording.
- [ ] **Step 2: run, watch it fail.**
- [ ] **Step 3: implement the module.** Move the existing combat-stats sentence, the ranged-attack constraints, and the infantry-range scope out of `buildSystemPromptForTools` into `buildCombatStatsLine` / `buildRangedReachRule` verbatim first, so you can prove the move is inert, then add the new rules.
- [ ] **Step 4: run the test.** Expected: pass.
- [ ] **Step 5: wire it in.** Replace the inline `Combat: ...` template in `buildSystemPromptForTools` with `buildCombatRulesParagraph`. Gate the hold-fire rule on `flags.ordersEnabled`, per `information-decision-model.md` section 3: it is issued only through a standing order, so a prompt with the standing-order group disabled must not teach it.
- [ ] **Step 6: place the two conditional rules.** The production income sentence belongs in the production status block in `briefingSections.ts`, next to the caps and costs it explains. The intel staleness sentence belongs with the fog wording, emitted only when fog is on — see `variants.md` section 1.1.
- [ ] **Step 7: full gate.**

**Done when:** `npm test` is clean and `buildSystemPromptForTools` contains no combat-rule prose.

---

## Task 5: Coaching becomes an enumerated, tested list

**Why it is one task:** the coaching items are a set with a stated membership. Splitting them across tasks means no single point where "all of them are present" can be asserted.

**Spec authority:** `strategic-prompt.md` section 4 (nineteen numbered items plus the four prohibited claims), `tactical-prompt.md` section 4 (eleven items), `assembly-contract.md` section 6 (the shared principles), `variants.md` sections 2 and 3 for the gates.

**Files:**
- Create: `src/main/openrouter/promptSpec/coachingTextStrategic.ts`
- Create: `src/main/openrouter/promptSpec/coachingTextTactical.ts`
- Create: `src/main/openrouter/promptSpec/coachingText.ts`
- Create: `src/main/openrouter/promptSpec/coachingText.test.ts`
- Modify: `src/main/openrouter/promptText.ts` (`buildToolUsageGuidance`, `buildAvailableToolsIntro`)
- Modify: `src/main/openrouter/openRouterBuildSystemPrompt.ts` (the context blocks)

**Interfaces produced:**

```ts
export interface CoachingGates {
  readonly coordinateMode: PromptCoordinateMode;
  readonly planningEnabled: boolean;
  readonly ordersEnabled: boolean;
  readonly memoryEnabled: boolean;
  readonly productionEnabled: boolean;
  readonly hasAirUnits: boolean;
  readonly hasNavalUnits: boolean;
  readonly hasBestOptionsTable: boolean;
  readonly homeRegionsOverlap: boolean;
}

export function buildCoachingBullets(gates: CoachingGates): readonly string[];
```

The two mode modules each export one function returning their bullets for a given gate set; `coachingText.ts` picks the mode and concatenates. Split this way because nineteen items with orienting comments will not fit one file under 600 lines.

- [ ] **Step 1: write the failing test.** For each spec item, assert one distinctive phrase appears in `buildCoachingBullets` output for the gates that should carry it, and does not appear for the gates that should not. Specifically assert the conditional items are absent when their gate is off: the hold-fire item without `ordersEnabled`, the production items without `productionEnabled`, the memory items without `memoryEnabled`, the air items without `hasAirUnits`, the sealift items without `hasNavalUnits`, the shared-home-cells item without `homeRegionsOverlap`, and the option-copy items without `hasBestOptionsTable`. Assert the four prohibited claims from `strategic-prompt.md` section 4 appear in no gate combination.
- [ ] **Step 2: run, watch it fail.**
- [ ] **Step 3: implement the two mode modules.** Start by moving the bullets that already exist in `buildToolUsageGuidance` across unchanged, then add the missing items and correct the ones the spec rewords. Each bullet is one exported constant or one small builder with an orienting comment naming why the model needs it.
- [ ] **Step 4: run the test.** Expected: pass.
- [ ] **Step 5: rewire.** `buildToolUsageGuidance` keeps the `HOW TO USE THESE TOOLS EFFECTIVELY:` header and the tool-specific mechanics, and takes its rule bullets from `buildCoachingBullets`. The goals, strategy, and message blocks in `openRouterBuildSystemPrompt.ts` move into `coachingTextStrategic.ts` and `coachingTextTactical.ts`; the assembler keeps only the computed progress lines and the home-region bullets, which are state, not coaching.
- [ ] **Step 6: handle the missing-options case.** Per `variants.md` section 3.4, when there is no options table the copy-the-row coaching must be replaced by an instruction to use the routing tool, not merely omitted. `hasBestOptionsTable` is what selects between them.
- [ ] **Step 7: full gate,** updating `openRouter.matrix.test.ts` where it asserted the old bullet wording.

**Done when:** `npm test` is clean, and every numbered item in both spec coaching sections has an assertion in `coachingText.test.ts`.

---

## Task 6: Teach the callback vocabulary and fix the detail cells

**Spec authority:** `assembly-contract.md` section 5.1 item 3 and section 7, `strategic-prompt.md` section 1.6 (the `Details` column contract), `crosswalk.md` section 6 rows for the vocabulary and the detail cell.

**Decision already taken:** `territory_changed` is accepted by the parser but its evaluator is a no-op, so a model that subscribes to it is never re-consulted. It is **excluded from the taught vocabulary**. The parser stays tolerant of it and the engine is not changed.

**Files:**
- Create: `src/main/openrouter/promptSpec/callbackVocabularyText.ts`
- Create: `src/main/briefing/activeCallbacksSection.ts`
- Modify: `src/main/briefingFormatter.ts` (move the callbacks section out; it is at 590 lines and this work would push it over 600)
- Modify: `src/main/openrouter/promptSpec/envelopeContract.ts` (callback clause consumes the vocabulary)
- Modify: `src/main/openrouter/orderResponseParsing.ts` (export `CALLBACK_EVENT_VOCAB`)
- Modify: `src/main/openrouter/formatTacticalBriefing.ts` (import from the new module)
- Modify: `src/main/briefingFormatter.test.ts` (split out the callbacks assertions)

**Interfaces produced:**

```ts
export interface TaughtCallbackEvent {
  readonly event: string;
  readonly parameters: string;
  readonly meaning: string;
}

export const TAUGHT_CALLBACK_EVENTS: readonly TaughtCallbackEvent[];
export function buildCallbackVocabularyClause(mode: PromptCoordinateMode): string;
```

- [ ] **Step 1: write the failing test.** In `envelopeContract.test.ts` (the callback clause already lives there) assert:
  - every `event` in `TAUGHT_CALLBACK_EVENTS` is a member of the exported `CALLBACK_EVENT_VOCAB`, so the prompt can never teach an event the parser rejects;
  - `territory_changed` is in `CALLBACK_EVENT_VOCAB` but not in `TAUGHT_CALLBACK_EVENTS`;
  - `buildCallbackVocabularyClause` names every taught event and its parameters;
  - the strategic callback contract clause states that the response replaces the whole subscription list.
- [ ] **Step 2:** add a test for the detail cell: a subscription for `infrastructure_destroyed` carrying `targetType` and `h3Index` renders a cell naming both, not the bare event name twice. Put it in a new `src/main/briefing/activeCallbacksSection.test.ts`.
- [ ] **Step 3: run both, watch them fail.**
- [ ] **Step 4: implement the vocabulary module** and wire it into `buildCallbackContractClause`.
- [ ] **Step 5: move the callbacks section.** Move `buildActiveCallbacksSection` and `formatCallbackLine` from `briefingFormatter.ts` into `activeCallbacksSection.ts` unchanged first; run the gate to prove the move is inert; then fix `formatCallbackLine` so every event renders its parameters. Update the two importers and move the existing assertions into the new test file.
- [ ] **Step 6: full gate.** Confirm `briefingFormatter.ts` is now comfortably under 600 lines.

**Done when:** `npm test` is clean, and the prompt teaches exactly the events the engine can actually fire.

---

## Task 7: Split the briefing status sections (no output change)

**Why separate:** `briefingSections.ts` is already 632 lines and holds three unrelated sections. Task 8 changes two of them. Splitting first means Task 8's diff is only the behaviour change.

**Files:**
- Create: `src/main/openrouter/briefingSectionsAirOps.ts` — `buildAirOperationsBriefingBlock` and its private helpers including `countStrikeableEnemyInfrastructure`
- Create: `src/main/openrouter/briefingSectionsSealift.ts` — `buildSealiftBriefingBlock` and `findNearestOpponentEmbarkHex`
- Modify: `src/main/openrouter/briefingSections.ts` — production only
- Modify: `src/main/openrouter/openRouterBuildSystemPrompt.ts` — import from the new paths
- Modify: `src/main/openrouter/briefingSections.test.ts` — split to match, or import from the new paths

- [ ] **Step 1: move the code** with no edits other than imports. Do not add a re-export shim in `briefingSections.ts`; update the importers instead, so there is one path per symbol.
- [ ] **Step 2: split the test file** along the same boundary.
- [ ] **Step 3: full gate.** Every assertion must pass with its original expected strings. A failure here means you edited output during a move.
- [ ] **Step 4: check sizes.** All three files under 600 lines.

**Done when:** `npm test` is clean with no changed expectations.

---

## Task 8: Omit the air and naval sections when the roster is empty

**Spec authority:** `assembly-contract.md` section 3 (the include and omit matrix), `variants.md` sections 3.1 and 3.2.

**What changes:** in strategic mode both blocks currently emit a heading, an explanatory sentence, and a table containing a single row of em dashes when the opponent has no air or no naval units. The spec requires omitting the whole section, exactly as tactical mode already does, and omitting the matching envelope tails. The air tails are already gated on `hasAir` in the assembler, so the envelope side is mostly in place; verify it rather than assume it.

**Files:**
- Modify: `src/main/openrouter/briefingSectionsAirOps.ts`, `src/main/openrouter/briefingSectionsSealift.ts`
- Modify: `src/main/openrouter/openRouterBuildSystemPrompt.ts`
- Modify: `src/main/openrouter/briefingSectionsAirOps.test.ts`, `src/main/openrouter/briefingSectionsSealift.test.ts`
- Modify: `src/main/openrouter/openRouter.matrix.test.ts`

- [ ] **Step 1: write the failing assertions.** For a strategic state with no opponent air unit, the assembled system prompt contains neither the air operations title nor `airStrikes`. For a strategic state with no opponent naval unit, it contains neither the naval transport title nor sealift order actions. For states that do have them, both sections appear with their tables. The matrix test already asserts both titles are present; that assertion becomes roster-conditional.
- [ ] **Step 2: run, watch it fail.**
- [ ] **Step 3: implement.** Return an empty string from the strategic branch when the relevant roster is empty, mirroring the existing tactical early return, and delete the em-dash row construction. Update each function's orienting comment: the current one explicitly promises "Strategic always returns a section", which will now be wrong.
- [ ] **Step 4: check the assembler.** `airOpsBlock` and `sealiftBlock` already collapse when the builder returns an empty string, so no assembler change should be needed. Confirm the envelope gates and the coaching gates agree: with no air units there must be no air tails, no air coaching, and no air section — `variants.md` section 3.1 lists all three surfaces.
- [ ] **Step 5: fix the production section's gate.** `formatBriefing` currently omits the production section whenever the production text comes back empty, which conflates "the tool group is off" with "there is nothing to report". Per the include and omit matrix in `assembly-contract.md` section 3, the gate is the tool flag: with production tools enabled the section appears, and an empty roster of controlled build cells gets the section's defined empty form rather than silence. Assert both cases.
- [ ] **Step 6: full gate.**

**Done when:** `npm test` is clean and no prompt contains a table whose only row is em dashes.

---

## Task 9: Split the consultation flow (no output change)

**Why:** `requestOrdersFlow.ts` is 1017 lines, past the hard limit, and Task 10 edits it. It also holds the second of two places that compute the same injection text, and one of two independent copies of the tool-round limit.

**Files:**
- Create: `src/main/openrouter/requestOrdersToolLoop.ts`
- Create: `src/main/openrouter/requestOrdersRepairExchange.ts`
- Modify: `src/main/openrouter/requestOrdersFlow.ts`
- Modify: `src/main/openrouter/requestOrdersFlowSupport.ts` — add the shared round limit next to the existing `REQUEST_ORDERS_MAX_WALL_CLOCK_MS`
- Modify: `src/main/openrouter/openRouterBuildSystemPrompt.ts` — the warning text quotes the limit

- [ ] **Step 1: introduce the shared limit.** Export `REQUEST_ORDERS_MAX_TOOL_ROUNDS = 50` from `requestOrdersFlowSupport.ts` with an orienting comment saying that the loop bound and the next-consultation warning must quote the same number. Replace the literal `50` in the `while (iteration < 50)` loop and interpolate the constant into the warning string in `buildSystemPromptForTools`, which currently hard-codes `(50 rounds)`. Add an assertion that the warning text contains `String(REQUEST_ORDERS_MAX_TOOL_ROUNDS)`.
- [ ] **Step 2: extract the tool loop.** Move the `while` block into `requestOrdersToolLoop.ts` as a function taking one readonly parameter object and returning a discriminated result — the model's final text, or the reason the loop ended without one. Do not change any behaviour, any log message, or any message ordering.
- [ ] **Step 3: extract the repair exchange.** Move the parse-repair block into `requestOrdersRepairExchange.ts`. It runs on a copy of the conversation with tools disabled, and neither the unparseable text nor the repair exchange rejoins the main message list — see `consultation-flow.md` section 1 invariant 4. Preserve that exactly.
- [ ] **Step 4: consolidate the duplicate injection.** Memory, standing-order, and production injection text is computed both in `buildSystemPromptForTools` (the no-briefing path) and on the `formatBriefing` path in the flow. Extract one exported helper and call it from both. Only one copy reaches the model today; the point is that two call sites drift.
- [ ] **Step 5: full gate.** `requestOrdersFlowSupport.test.ts`, `orderResponseParsing.test.ts`, `malformedCompletionRetry.test.ts`, and the matrix tests must pass with unchanged expectations apart from the warning-text assertion.
- [ ] **Step 6: check sizes.** `requestOrdersFlow.ts` under 600 lines.

**Done when:** `npm test` is clean and no file contains a bare `50` for the tool-round bound.

---

## Task 10: The messages after the system prompt become submit-only

**Spec authority:** `consultation-flow.md` sections 2.1, 2.2, and 2.3 (the table of rules to move and where each one now lives), section 4, section 5.

**The rule this enforces:** the system prompt owns every rule and heuristic. The opening message, the corrective message, and the repair request say what to do now and what shape to answer in, and nothing else. Today the opening message restates production doctrine, cap rules, queue policy, the memory instruction, the option-copy mapping, and the routing-tool restriction — all of which the system prompt already carries.

**One exception, and only one:** the tactical opening message keeps the prohibition on standing-order actions, worded identically to the envelope contract. It is the most common carry-over error.

**Files:**
- Create: `src/main/openrouter/promptSpec/consultationText.ts`
- Create: `src/main/openrouter/promptSpec/consultationContract.test.ts`
- Modify: `src/main/openrouter/promptText.ts` — `getInitialUserMessage` becomes a thin adapter or is deleted in favour of the new builder
- Modify: `src/main/openrouter/requestOrdersFlow.ts` / `requestOrdersRepairExchange.ts` — call sites
- Modify: `src/main/openrouter/promptContracts.test.ts` — it asserts the current opening-message content

**Interfaces produced:**

```ts
export interface OpeningMessageGates {
  readonly coordinateMode: PromptCoordinateMode;
  readonly planningEnabled: boolean;
  readonly ordersEnabled: boolean;
  readonly memoryEnabled: boolean;
  readonly productionEnabled: boolean;
  readonly fallbackMovementEnabled: boolean;
  readonly hasBriefing: boolean;
  readonly hasAirUnits: boolean;
}

export function buildOpeningUserMessage(gates: OpeningMessageGates): string;
export function buildRepairRequestMessage(gates: EnvelopeGates): string;
```

- [ ] **Step 1: write the failing test.** For every gate combination, assert the opening message contains **none** of these, since each is a rule the system prompt owns: the production cap guidance string (`PRODUCTION_CAP_QUEUE_GUIDANCE`), the production requirement phrasing, `Prefer setting queues on every eligible`, the memory-write instruction, and the multi-sentence option-copy mapping. Assert it **does** name the envelope fields returned by `envelopeFieldsForGates` for those gates, including the air tails when `hasAirUnits` is true — which the current message never does. Assert the tactical message contains the standing-order prohibition and the strategic message does not.
- [ ] **Step 2: run, watch it fail.**
- [ ] **Step 3: implement `buildOpeningUserMessage`.** One branch per row of the `consultation-flow.md` section 2.2 table, including the row covering the combinations that are currently unreachable — the spec contracts them so that a later change to how `fallbackMovementEnabled` is derived cannot produce uncontracted text. Each branch does exactly the three things section 2.1 lists, in that order: name where the situation is, name the action in one clause, name the envelope fields.
- [ ] **Step 4: implement `buildRepairRequestMessage`** as the three clauses plus the two shape constraints from section 5, with the schema from `buildRepairSchemaText`. No game rules.
- [ ] **Step 5: verify the corrective message needs no change.** `buildMalformedCompletionCorrectiveMessage` already matches `consultation-flow.md` section 4: four clauses, appended only before the final retry, tools left enabled. Add assertions to `consultationContract.test.ts` locking those three properties in, and change nothing.
- [ ] **Step 6: rewire the call sites and delete the dead branches** of `getInitialUserMessage`.
- [ ] **Step 7: full gate.**

**Done when:** `npm test` is clean, and the only rule restated outside the system prompt is the tactical standing-order prohibition and the legacy-array note in the repair request.

---

## Task 11: The variant matrix, and the sweep

**Spec authority:** `variants.md` in full, `crosswalk.md` sections 2 and 3 (every existing section and its disposition).

**Files:**
- Create: `src/main/openrouter/promptSpec/variantConformance.test.ts`
- Modify: `src/main/openrouter/openRouter.matrix.test.ts` where it contradicts the spec

- [ ] **Step 1: write the variant tests,** one describe-block per `variants.md` section, asserting the changed surfaces that section names:
  - **Fog** (section 1): the hop-distance caveat appears only with fog off at strategic resolution; last-seen and intel-quality wording appears only with fog on; neither appears in a tactical prompt.
  - **Tool groups** (section 2): for each group disabled, its section, its coaching, and its envelope tail all disappear together. The existing 256-mask matrix test already walks these combinations — reuse its fixtures rather than building new ones.
  - **Roster** (section 3): no air, no naval, no observed enemy, no option rows, no orderless units. Each has a defined empty form or omission; assert the form, not merely the absence.
  - **Scenarios** (section 4): `region_vs_region` versus absent versus unrecognised id. The generic goal statement appears for the latter two and the scenario objective section for the first only.
  - **Game size** (section 5): the caps quoted in production text come from `getMaxUnitsPerType`, and the attention-flag caps hold at five bullets and twelve ids while the unit table stays uncapped.
  - **Consultation policy** (section 6): the tool-budget warning appears in the next system prompt after exhaustion and quotes the shared constant. Under event-driven consultation both modes state that the model is consulted only when a subscribed event fires, and that a period it is not consulted for is a period in which it issued nothing — today only the tactical callback clause says any of this.
- [ ] **Step 2: run, fix what fails.** Failures here are real: they are variant combinations no existing test covered.
- [ ] **Step 3: reconcile the matrix test.** Walk `crosswalk.md` sections 2 and 3 row by row. For every row marked as changed, confirm `openRouter.matrix.test.ts` no longer asserts the old behaviour. Delete assertions the spec made obsolete rather than weakening them.
- [ ] **Step 4: final acceptance sweep.** All of the following must hold:
  - `npm test` clean.
  - `npm run check:circular` clean — the new module family must not introduce a cycle.
  - No source file, comment, or test name contains a spec carrier identifier or a plan identifier.
  - Every file touched by this work is under 600 lines, and none is over 1000.
  - No prompt-building function holds prose that `promptSpec/` should own. Search `src/main/openrouter/` and `src/main/briefing*` for long single-quoted or template strings and confirm each remaining one is a table cell, a heading, a log message, or tool mechanics.
  - Every gap row in `crosswalk.md` section 6 is either closed in code or listed in your report with a reason.
  - Uncommitted. Nothing pushed.
- [ ] **Step 5: report.** Write down what changed in the prompt the model actually reads, which spec rows are closed, and anything you stopped on.

**Done when:** the acceptance sweep passes and the report is delivered.

---

## Out of scope

- Engine behaviour: turn resolution, combat, movement, production, visibility, and the callback evaluator. The one engine-adjacent decision already taken is that `territory_changed` stays unimplemented and untaught.
- Retiring the stale prompt-content claims in `doc/combat-rules-v3.md`. The spec package already records that document as non-authoritative on caps and tactical structure; correcting it is a separate documentation change.
- The `h3` face-crossing distance limitation. Hop counts can understate real routes and under fog no caveat is emitted at all. The spec accepts this as a known limitation; do not invent a second caveat.
- Order validation and parsing internals, beyond the envelope shape the prompt promises.
- Token budgeting, model selection, and transport retries.
