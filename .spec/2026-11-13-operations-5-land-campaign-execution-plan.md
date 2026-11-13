# Operations 5 of 6, Land Campaign as an Operation: Execution Plan

## Where This Plan Sits

| Order | File | What it delivers |
|-------|------|------------------|
| 0 | `2026-11-13-logistics-commander-execution-plan.md` | Goals, tools, production priorities, mercenaries, missiles |
| 1 | `2026-11-13-operations-1-lift-foundations-execution-plan.md` | Embarked units stay aboard; shared lift rules and terrain helpers |
| 2 | `2026-11-13-operations-2-sea-operations-execution-plan.md` | Stored operations; the engine runs sea landings end to end |
| 3 | `2026-11-13-operations-3-operation-menu-execution-plan.md` | The commander sees a menu and can launch and cancel |
| 4 | `2026-11-13-operations-4-air-operations-execution-plan.md` | Air landings; objectives the commander names itself |
| 5 | this file | The land campaign shown and chosen as an operation |
| 6 | `2026-11-13-operations-6-posture-execution-plan.md` | A posture the commander declares, which shifts the engine's settings |

Plans 0 through 4 must be complete before this plan starts.

## Why This Change

After plan 4 the commander has two ways to choose where its force goes. Sea and air objectives are picked from Operation Options with `operations`. The land objective is picked with a separate `campaignTarget` field, from no list at all, described in a separate part of the prompt. A commander weighing "march on the city next door" against "land on the undefended port across the strait" has to find those choices in two places and answer in two fields.

This plan puts the land choice in the same list and the same command. It does not rebuild the campaign. The campaign's target selection, staging, phases, home defenders, and Campaign Orders stay exactly as they are.

## Requirements

| Id | Requirement |
|----|-------------|
| R1 | Operation Options lists up to two land rows: enemy cities the campaign could turn to, other than its current target. Each row has the same columns as a sea or air row. |
| R2 | Launching a land row, or naming an objective with `"method":"land"`, sets the campaign target exactly as `campaignTarget` does today. |
| R3 | The Active Operations section lists the land campaign as its first bullet, with its target and phase. |
| R4 | `campaignTarget` keeps working, unchanged. |
| R5 | The engine never launches a land option by itself, and land rows never open the offer window or fire the operation consult trigger. The campaign already picks its own target. |
| R6 | The land campaign cannot be cancelled. A cancel that names it is refused with a reason. |
| R7 | No campaign behaviour changes: target scoring, staging, phase changes, defenders, Campaign Orders, and the Campaign Objective section are as before. |
| R8 | A match with no campaign (a scenario other than `region_vs_region`, or orders disabled) shows no land row and no campaign bullet. |
| R9 | The tactical prompt and the tactical reply contract are unchanged. |
| R10 | Living docs match the builders in the same change. |

## Decisions Already Made

Do not reopen these.

- The campaign is wrapped, not rebuilt. No stored `Operation` ever has the method `land`. The campaign objective store remains the record.
- The method of a candidate or a command may be `land`. The method of a stored operation may not. Two types keep that apart.
- Land rows come first in the menu, then sea, then air, because the land campaign uses most of the force.
- The menu still holds at most `OPERATION_MENU_SIZE` rows: up to `OPERATION_MENU_LAND_ROWS` land, up to `OPERATION_MENU_AIR_ROWS` air, and sea in what is left.
- The Campaign Objective section and the Campaign block of the system prompt stay. The Campaign block gains one sentence pointing at the menu.
- Force sharing does not change: units in a sea or air operation are already left out of the campaign (plan 2), and `liftGroundCap` already limits how many may be taken.

## Constants

| Name | File | Value | Status |
|------|------|-------|--------|
| `OPERATION_MENU_LAND_ROWS` | `src/main/operations/operationRules.ts` | 2 | new |
| `CAMPAIGN_OPERATION_ID` | `src/shared/operationTypes.ts` | `'campaign'` | new; the id shown for the land campaign |

Existing values used, never retyped: `CAMPAIGN_MAX_LAND_STEPS`, `CAMPAIGN_MASS_RADIUS`, `OPERATION_MENU_SIZE`, `OPERATION_MENU_AIR_ROWS`.

## Rules for the Implementing Agent

Read these before Phase 1. They apply to every phase.

- Never commit or push.
- Source files under `src/` use CRLF line endings. Keep CRLF. `.spec` files may stay LF.
- Do not put plan words in code, comments, test names, or docs: no "Phase", "Step", "R1", "Operations 5", and so on. The game's own words `phase`, `assemble`, and `assault` are product terms and are allowed.
- Every new or changed function, constant, and interface field needs an orienting comment block with at least 5 non-empty lines: a summary line, then `Purpose:` (or `Contract:` on interface fields), `When to use:`, `Expected outcome:`, `Exceptions:`.
- Logging: every new exported function logs its call. Use `logDebug` when it changes state or makes a per-turn or per-consult decision, `logTrace` when it only reads and returns, and `logError` for every caught exception. Use the existing `../logger` import of each file.
- Documentation follows `AGENTS.md`. In the documentation phase, also read `doc/README.md`: add every new exported constant this plan introduces to the engine-constants section there, beside the campaign constants, naming its file. Search `doc/` for any sentence the change makes wrong. End your final summary with the list of documents you updated.
- Mark every new binding `const` and every new interface field `readonly`.
- No function takes more than 6 named arguments. Use one `args` object.
- Do not edit `campaignRules.ts` or `campaignTargetSelection.ts`. If a step seems to need it, stop and report.
- Tests cover happy paths and essential failure cases only. Never delete a content assertion. Never replace an assertion with `assert.ok(true)`.
- PowerShell does not support `&&`. Chain commands with `; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`.
- When a step says "replace", replace exactly the quoted text. If it is not found, stop and report.
- When a step says "read first", open the named function before editing. If it does not do what this plan says, stop and report.
- Sort hex ids with `<` on the strings.
- Numbers in prompt text come from the named constant or helper.

## Phase 1: Set the Target by Hex

Goal: one function sets the campaign target, whether it was asked for by code or by menu.

Read `applyCampaignTargetOverride` in `src/main/openRouter/campaignTargetOverride.ts` first.

- [ ] Split it in two in the same file. `applyCampaignTargetH3(args: { readonly state: GameStateSnapshot; readonly targetH3: string; readonly label: string }): { readonly applied: boolean; readonly dropReasons: string[] }` holds everything from `const seatId = ...` to the end. `label` replaces `args.code` in every drop reason and log line. `applyCampaignTargetOverride` keeps the scenario check and the `codeToH3` step, then calls the new function with `label: args.code`.
- [ ] The scenario check moves into `applyCampaignTargetH3` as well, so both entries refuse a match with no campaign. Keep the text `this scenario has no campaign.`
- [ ] The drop reason prefix stays `campaignTarget dropped: ` for both. Phase 3 rewrites it for the menu path.
- [ ] `campaignTargetOverride.test.ts` must pass with no expected-string change. Add one test that `applyCampaignTargetH3` with a known reachable city stores it with `source: 'commander'`.

### Phase 1 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/campaignTargetOverride.test.js`

## Phase 2: Land Candidates

Goal: R1, R5, R8.

### Step 1: Types

In `src/shared/operationTypes.ts`:

- [ ] `export type OperationChoiceMethod = OperationMethod | 'land';` and `export const OPERATION_CHOICE_METHODS: readonly OperationChoiceMethod[] = ['land', 'sea', 'air'];`.
- [ ] `export const CAMPAIGN_OPERATION_ID = 'campaign';`.
- [ ] `OperationMethod` and `OPERATION_METHODS` do not change. The stored-operation parser in `operationMemory.ts` keeps rejecting `land`. Add a test for that.

In `src/shared/operationTypes.ts`:

- [ ] `OperationCandidate.method` becomes `OperationChoiceMethod`. Run `npm run build:main` and fix what the compiler names. Where a candidate becomes a stored `Operation`, add a guard that returns without launching when `candidate.method === 'land'`, with a `logError`; the launch paths in Phase 3 never reach it.

### Step 2: New file `src/main/operations/landOperationCandidates.ts`

- [ ] Function:

```ts
export function listLandOperationCandidates(args: {
  readonly state: GameStateSnapshot;
  readonly seatId: string;
  readonly landMass: LandMassByH3;
  readonly terrain: LiftTerrain;
  readonly onlyObjectiveH3?: string;
}): OperationCandidate[]
```

- [ ] Rules:
  1. `args.state.scenarioId !== 'region_vs_region'`: `[]`.
  2. `inputs = campaignInputsFromState(state, landMass)`. No ground unit: `[]`.
  3. `steps = campaignLandSteps(inputs, landMass, inputs.groundUnits.map((unit) => unit.h3Index))`.
  4. `current = readCampaignObjectives({ getOne: dbGetOne }).get(seatId)?.targetH3 ?? null`.
  5. Keep the cities of `inputs.cities` that are not `current`, whose step count exists and is at most `CAMPAIGN_MAX_LAND_STEPS`. When `onlyObjectiveH3` is given, keep only that city and do not exclude `current`.
  6. Sort by `scoreCampaignCity(city, steps)` descending, then hex id. Take the first `OPERATION_MENU_LAND_ROWS`.
  7. For each: `staging = chooseStagingHex({ ownControlledLandHexes: inputs.ownControlledLandHexes, landStepsFromTarget: campaignLandSteps(inputs, landMass, [city.h3Index]), landStepsFromForce: steps })`.
  8. Candidate: `method: 'land'`, `objectiveH3` the city, `musterH3` the staging hex or the city when staging is `null`, `landingH3` the city, `unitIds` every id in `inputs.groundUnits`, `carrierIds: []`, `etaTurns` the step count, `clear`, `defenders`, and `reinforcers` as the sea builder computes them, and the city's `urbanHexCount`, `inEnemyHome`, and `knownFortifiedCount`.
- [ ] Tests in `landOperationCandidates.test.ts`, built as `campaignObjectiveFlow.test.ts` builds its state: three reachable enemy cities with one of them the current target give two candidates, neither the current target; a city beyond `CAMPAIGN_MAX_LAND_STEPS` is not listed; a state with no `scenarioId` gives `[]`; `onlyObjectiveH3` returns that one city even when it is the current target.

### Step 3: Add land rows to the shared list

In `src/main/operations/operationCandidates.ts`:

- [ ] `operationCandidatesForSeat` gains `readonly includeLand?: boolean`. When it is true and `only` is absent, the result is: land candidates, then sea candidates cut to `OPERATION_MENU_SIZE - land.length - Math.min(OPERATION_MENU_AIR_ROWS, air.length)` and never below 0, then air candidates. When `only.method === 'land'`, it returns `listLandOperationCandidates` with `onlyObjectiveH3`.
- [ ] `only.method` becomes `OperationChoiceMethod`.
- [ ] The engine's own launch in `operationTurnFlow.ts`, and its offer-window test (`candidates` empty or not), must not pass `includeLand`. Confirm by reading it; do not change it.
- [ ] Tests in `operationCandidates.test.ts`: with `includeLand`, two land, two sea, and one air candidate come back in that order; without it, no land row; with two land, four sea, and two air, the result is two land, one sea, two air.

### Phase 2 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/landOperationCandidates.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/operationCandidates.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/operationTurnFlow.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/gameDb/operationMemory.test.js`
- [ ] `operationTurnFlow.test.js` passes with no change: the engine still launches only sea and air.

## Phase 3: Launch, Cancel, and Parse

Goal: R2, R4, R6.

### Step 1: Apply

In `src/main/operations/operationCommands.ts`:

- [ ] Both the briefing and this file must build the option list the same way. Change the option launch to call `operationCandidatesForSeat({ state, seatId, active, includeLand: true })`.
- [ ] When the chosen candidate's method is `land`: call `applyCampaignTargetH3({ state, targetH3: candidate.objectiveH3, label })`, where `label` is the objective's hex code from `h3ToCode(candidate.objectiveH3, { mode: 'strategic' })` in `../briefing/map/hexCodeTranslator`, inside a `try`/`catch` that falls back to `option ${letter}`. The campaign's reasons name the city, so they need its code. Rewrite each returned reason by replacing the prefix `campaignTarget dropped: ` with `operations launch dropped: `. Do not create a stored operation and do not touch the offer turn.
- [ ] A named launch with `method: 'land'`: after the hex-code and known-city checks, call `applyCampaignTargetH3` with `label` the hex code, and rewrite the reasons the same way. The slot check does not apply to `land`.
- [ ] A cancel whose id is `CAMPAIGN_OPERATION_ID`: `operations cancel dropped: the land campaign cannot be cancelled; launch a land option to give it a new target.`
- [ ] Tests in `operationCommands.test.ts`: launching a land row changes the stored campaign target and stores no operation; a named land launch against an unreachable city is refused with the campaign's own reason under the `operations launch dropped: ` prefix; cancelling `campaign` is refused.

### Step 2: Parse

In `src/main/openRouter/operationCommandParsing.ts`:

- [ ] The named launch accepts `method` in `OPERATION_CHOICE_METHODS`. Its type becomes `OperationChoiceMethod`. The dropped-entry reason lists `"method":"land"|"sea"|"air"`.
- [ ] One test for `land`.

### Step 3: Contract

- [ ] `promptSpec/envelopeJsonSchema.ts`: the named-launch alternative's `method` enum becomes `OPERATION_CHOICE_METHODS`.
- [ ] `promptContracts.ts`: in the `operations` paragraph, the named-launch sentence reads `"method":"land"`, `"sea"`, or `"air"`. After the paragraph's last sentence add: `A land launch gives your ground campaign a new target, the same as "campaignTarget".`
- [ ] Update `promptContracts.test.ts` and `envelopeJsonSchema.test.ts`.

### Phase 3 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/operationCommands.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/operationCommandParsing.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptContracts.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/envelopeJsonSchema.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/campaignTargetOverride.test.js`

## Phase 4: Briefing and Prompt Text

Goal: R1, R3, R8, R9.

### Step 1: Rows and the campaign bullet

In `src/main/openRouter/briefingSectionsOperations.ts`:

- [ ] `buildOperationOptionsSection`, for a land candidate: Method `land`. Plan: `the campaign turns to ${objective}; ground units assemble at ${muster} and march on it`, or `the campaign turns to ${objective}; ground units march on it directly` when `musterH3 === objectiveH3`. Cost: `your campaign units, about ${etaTurns} turns' march`. Impact and Risk are unchanged.
- [ ] `buildOperationsSection` gains an optional `readonly campaignPlan?: CampaignPlan | null`. When it is not null, the first bullet is:
  - `- ${CAMPAIGN_OPERATION_ID}: by land to ${target}, an enemy city with ${urban} city cells. Assembling at ${staging}: ${massed} of ${threshold} ground units are within ${CAMPAIGN_MASS_RADIUS} hexes.` in the `assemble` phase;
  - `- ${CAMPAIGN_OPERATION_ID}: by land to ${target}, an enemy city with ${urban} city cells. Assaulting.` in the `assault` phase or when there is no staging hex.
  Read `buildCampaignObjectiveSection` in `briefingSectionsCampaign.ts` first and take `massed`, `threshold`, and `urban` from the same fields it uses. A campaign bullet alone is enough to print the section.
- [ ] `requestOrdersInjection.ts`: pass `campaignPlan` to `buildOperationsSection`, and build the options with `includeLand: true`. `hasOperationOptions` stays true only when the list is not empty.
- [ ] Tests in `briefingSectionsOperations.test.ts`: one land option row in each Plan form; the campaign bullet in each phase; no campaign plan and no operation and no option gives `''`.

### Step 2: Prompt text

- [ ] `promptSpec/operationRuleText.ts`: `buildOperationRuleBlock` gains a parameter `campaignEnabled: boolean`. When true, add this as the block's second paragraph:

```text
Your land campaign is listed there too, as "campaign". It is described under Campaign. Operation Options may list land rows: other cities the campaign could turn to. Launching one gives the campaign that target.
```

- [ ] `promptSpec/campaignRuleText.ts`: after the sentence that begins `To choose a different target, set "campaignTarget"`, add: `You may instead launch a land row of Operation Options; both do the same thing.` Print the added sentence only when the caller passes `operationsEnabled: true`. `buildCampaignRuleBlock` gains that boolean parameter, default `false`, so every existing caller and test is unchanged.
- [ ] `coachingTextStrategic.ts`: pass `gates.operationsEnabled === true` to `buildCampaignRuleBlock` and `gates.campaignEnabled === true` to `buildOperationRuleBlock`.
- [ ] Tests in `promptSpec/coachingText.test.ts`: the campaign paragraph prints only with both gates; the campaign rule's extra sentence prints only with `operationsEnabled`; tactical gates print neither.

### Phase 4 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/briefingSectionsOperations.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/coachingText.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptContracts.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/variantConformance.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/briefingSectionsCampaign.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/campaignRules.test.js`
- [ ] `briefingSectionsCampaign.test.js` and `campaignRules.test.js` pass with no change.

## Phase 5: Documentation and Final Verification

- [ ] `doc/hybrid-ai.md`: in the Operations section, that the land campaign is shown and chosen as an operation and is otherwise unchanged; in the Campaign section, a pointer to it.
- [ ] `doc/ai-commander-prompts/strategic-prompt.md`, `assembly-contract.md`, `information-decision-model.md`, `variants.md`, `source-inventory.md`, `crosswalk.md`: land rows, the campaign bullet, the `land` method, and the two added sentences.
- [ ] `doc/ai-commander-prompts/example-strategic-prompt.md`: the campaign bullet and one land row. `example-strategic-response.md`: unchanged.
- [ ] `node scripts/check-doc-links.cjs` passes.
- [ ] `npm test` passes. `npm run check:circular` reports no new cycle.
- [ ] `git diff --stat` shows no change to `src/main/openRouter/campaignRules.ts` or `src/main/openRouter/campaignTargetSelection.ts`.
- [ ] `rg -n "Phase [0-9]|Step [0-9]|\bR[0-9]+\b" src doc` shows no hit introduced by this change.
- [ ] No file touched here crossed 600 lines that was under it before, and none is over 1000.

## Phase 6: Verification Run

This phase is for the user, not the implementing agent. The agent stops after the previous phase and reports. The run needs the game window and a model key.

- [ ] Set `AGENT_WARS_LOG_LEVEL=debug` and `AGENT_WARS_LOG_FULL_PROMPTS=1`. Run 40 turns on one regional map where the home regions share a landmass, and 40 turns on the global map. No fog, no tactical battles, balanced doctrine.
- [ ] From `debug.log`, per seat: count `campaignTargetOverride: commander target stored` lines; count how many followed an `operations` launch and how many a `campaignTarget` field; list every `operations` drop reason.
- [ ] Compare against the plan 4 run on the same maps: the number of turns to the first captured enemy city, and the count of `campaignPlanForState` lines with `campaignUnitCount` of 0.
- [ ] Pass when the campaign still captures cities at about the rate of the plan 4 run, and at least one seat changed its land target through `operations`.
- [ ] Report the counts and the comparison whether or not the run passes.

## Out of Scope

- Changing how the campaign picks its target, stages, or switches phase.
- Removing the `campaignTarget` field or the Campaign Objective section.
- A stored operation with the method `land`.
- Any change to the game's interface.
