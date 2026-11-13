# Operations 6 of 6, Posture: Execution Plan

## Where This Plan Sits

| Order | File | What it delivers |
|-------|------|------------------|
| 0 | `2026-11-13-logistics-commander-execution-plan.md` | Goals, tools, production priorities, mercenaries, missiles |
| 1 | `2026-11-13-operations-1-lift-foundations-execution-plan.md` | Embarked units stay aboard; shared lift rules and terrain helpers |
| 2 | `2026-11-13-operations-2-sea-operations-execution-plan.md` | Stored operations; the engine runs sea landings end to end |
| 3 | `2026-11-13-operations-3-operation-menu-execution-plan.md` | The commander sees a menu and can launch and cancel |
| 4 | `2026-11-13-operations-4-air-operations-execution-plan.md` | Air landings; objectives the commander names itself |
| 5 | `2026-11-13-operations-5-land-campaign-execution-plan.md` | The land campaign shown and chosen as an operation |
| 6 | this file | A posture the commander declares, which shifts the engine's settings |

Plans 0 through 5 must be complete before this plan starts. It is last because it changes settings that those plans create: the naval priority, the credits city, the lift share, the air slots, the menu order, and the engine's own launch rule.

## Why This Change

After plan 5 the commander makes its choices one at a time: a queue here, an operation there. Nothing ties them together from turn to turn, and two seats with the same doctrine make the same choices.

A posture is one declared intent that the engine remembers and acts on. The commander picks one of four. Each is a row of values for settings the engine already has, so production, operations, and the campaign all lean the same way until the commander changes its mind. Doctrine stays what it is: how much risk a seat accepts, set when the match is created. Posture is what the seat spends its effort on, chosen by the commander during the match.

A seat that never declares a posture is on `overland`, and `overland` is exactly today's settings. Nothing changes for a commander that ignores the feature.

## The Four Postures

| Posture | What it shifts | Historical illustration, used in the prompt |
|---------|----------------|---------------------------------------------|
| `overland` | Nothing. Land options first, mass before the assault. | The Soviet summer offensive of 1944: mass, then break through. |
| `maritime` | Ships up to the full naval cap. Up to half the ground force may be lifted. Sea and air options listed first. | The Pacific island-hopping campaign: land where the enemy is weak and bypass where it is strong. |
| `strangle` | A missile asked for in every city that can reach an enemy city. A larger city on credits. The briefing says to strike production before units. | The Combined Bomber Offensive and the Battle of the Atlantic: destroy what builds and moves the enemy's force. |
| `blitz` | The campaign assaults with half the usual mass. Twice the air operations. Air options first. The engine may launch against an objective with one defender. | The 1940 campaign in France: strike before the enemy has massed, and accept thin odds for speed. |

## Requirements

| Id | Requirement |
|----|-------------|
| R1 | Each seat has one posture, stored with the turn it was set. It survives save and load, and is cleared on a new match and when the seat is knocked out. |
| R2 | The reply may carry `"posture": "<name>"`. A new posture is accepted only when the current one has been held for `POSTURE_MIN_HOLD_TURNS` turns. An early change is dropped with a reason. |
| R3 | The settings of `overland` equal the constants the earlier plans use. A test proves it for every setting. |
| R4 | Every place that reads one of those constants to make a decision for a seat reads the seat's posture setting instead. |
| R5 | The briefing prints the seat's posture, the turn it was set, the turn it may next be changed, and one line saying what it changes. |
| R6 | The system prompt lists the four postures, what each shifts, and one historical illustration each, and says they are illustrations. |
| R7 | The engine never changes a seat's posture. |
| R8 | A failure to read a posture falls back to `overland` and never stops a turn or a consult. |
| R9 | The tactical prompt and the tactical reply contract are unchanged. |
| R10 | Living docs match the builders in the same change. |

## Decisions Already Made

Do not reopen these.

- The word is "posture". The reply already has a free-text `strategy` field, and doctrine is a different thing.
- There are four postures. Method ("by sea", "by land") is not a posture; the engine already knows what can be reached.
- A posture is a row of values in one table. No decision branches on a posture's name; code reads a setting. The one table keyed by name is the briefing's effect sentence, which is text, not a decision. The `strangle` sentence about striking production first is guidance to the commander only; no setting backs it.
- The default is `overland`, and it changes nothing.
- The hold is six turns, counted from the turn the posture was set. The briefing states the turn it may next change, so a refused change needs no separate note.
- The historical names appear only in the system prompt, as illustrations. They are not options and the commander cannot select them.
- The campaign's assault threshold becomes a parameter with the present constant as its default. This is the only edit to `campaignRules.ts`, and every existing call that passes nothing behaves as before.
- Posture text in the briefing travels in the same string as the Active Operations section, so `briefingFormatter.ts` is not edited.

## Constants

New, in `src/shared/postureTypes.ts`.

| Name | Value |
|------|-------|
| `POSTURES` | `['overland', 'maritime', 'strangle', 'blitz']` |
| `DEFAULT_POSTURE` | `'overland'` |
| `POSTURE_MIN_HOLD_TURNS` | 6 |
| `POSTURE_SETTINGS` | the table in Phase 1 Step 1 |

New, in `src/main/gameDb/postureMemory.ts`: `POSTURES_CONFIG_KEY = 'postures'`.

The `overland` row repeats three values that live under `src/main`: `LIFT_MAX_GROUND_SHARE`, `NAVAL_PRIORITY_CAP_SHARE`, and a factor of 1 on `CAMPAIGN_ASSAULT_MIN_UNITS`. A file under `src/shared` may not import from `src/main`, so the values are written out there and a test under `src/main` proves they are equal.

## Rules for the Implementing Agent

Read these before Phase 1. They apply to every phase.

- Never commit or push.
- Source files under `src/` use CRLF line endings. Keep CRLF. `.spec` files may stay LF.
- Do not put plan words in code, comments, test names, or docs: no "Phase", "Step", "R1", "Operations 6", and so on.
- Every new or changed function, constant, and interface field needs an orienting comment block with at least 5 non-empty lines: a summary line, then `Purpose:` (or `Contract:` on interface fields), `When to use:`, `Expected outcome:`, `Exceptions:`.
- Logging: every new exported function logs its call. Use `logDebug` when it changes state or makes a per-turn or per-consult decision, `logTrace` when it only reads and returns, and `logError` for every caught exception. Use the existing `../logger` import of each file.
- Documentation follows `AGENTS.md`. In the documentation phase, also read `doc/README.md`: add every new exported constant this plan introduces to the engine-constants section there, beside the campaign constants, naming its file. Search `doc/` for any sentence the change makes wrong. End your final summary with the list of documents you updated.
- Mark every new binding `const` and every new interface field `readonly`.
- No function takes more than 6 named arguments. Use one `args` object.
- A new parameter that carries a posture setting is optional and defaults to the constant it replaces. An existing caller that passes nothing must behave exactly as before.
- Tests cover happy paths and essential failure cases only. Never delete a content assertion. Never replace an assertion with `assert.ok(true)`.
- PowerShell does not support `&&`. Chain commands with `; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`.
- When a step says "replace", replace exactly the quoted text. If it is not found, stop and report.
- When a step says "read first", open the named function before editing. If it does not do what this plan says, stop and report.
- Numbers in prompt text come from the named constant or setting.

## Phase 1: Types, Settings, and Storage

Goal: R1, R3, R8. Nothing reads a posture yet.

### Step 1: New file `src/shared/postureTypes.ts`

- [ ] Add:

```ts
export const POSTURES = ['overland', 'maritime', 'strangle', 'blitz'] as const;
export type Posture = (typeof POSTURES)[number];
export const DEFAULT_POSTURE: Posture = 'overland';
export const POSTURE_MIN_HOLD_TURNS = 6;

export type PostureMenuMethod = OperationChoiceMethod;

export interface PostureSettings {
  readonly navalPriorityCapShare: number;
  readonly missilePriorityEveryCity: boolean;
  readonly creditsCityUrbanFactor: number;
  readonly liftGroundShare: number;
  readonly airOperationSlotFactor: number;
  readonly menuMethodOrder: readonly PostureMenuMethod[];
  readonly engineLaunchMaxDefenders: number;
  readonly campaignAssaultFactor: number;
}

export const POSTURE_SETTINGS: Readonly<Record<Posture, PostureSettings>>
```

- [ ] The values:

| Setting | `overland` | `maritime` | `strangle` | `blitz` |
|---------|-----------|-----------|-----------|--------|
| `navalPriorityCapShare` | 0.5 | 1 | 0.5 | 0.5 |
| `missilePriorityEveryCity` | false | false | true | false |
| `creditsCityUrbanFactor` | 1 | 1 | 2 | 1 |
| `liftGroundShare` | 0.25 | 0.5 | 0.25 | 0.25 |
| `airOperationSlotFactor` | 1 | 1 | 1 | 2 |
| `menuMethodOrder` | land, sea, air | sea, air, land | land, sea, air | air, land, sea |
| `engineLaunchMaxDefenders` | 0 | 0 | 0 | 1 |
| `campaignAssaultFactor` | 1 | 1 | 1 | 0.5 |

- [ ] `export function isPosture(value: unknown): value is Posture`.
- [ ] `PostureMenuMethod` has the same members as `OperationChoiceMethod` in `operationTypes.ts`. Define it as `export type PostureMenuMethod = OperationChoiceMethod;` with an import from `./operationTypes`; both files are under `src/shared`.

### Step 2: New file `src/main/gameDb/postureMemory.ts`

Read `src/main/gameDb/campaignObjectiveMemory.ts` first and copy its shape.

- [ ] `export const POSTURES_CONFIG_KEY = 'postures';`
- [ ] `export interface StoredPosture { readonly posture: Posture; readonly sinceTurn: number }`.
- [ ] `readPosture(ops, seatId): StoredPosture | null`. A stored entry whose `posture` fails `isPosture`, or whose `sinceTurn` is not an integer, reads as `null` and is logged with `logDebug`. A value that is not JSON logs with `logError` and reads as `null`.
- [ ] `writePosture(ops, seatId, stored: StoredPosture | null)`. `null` removes the seat's entry.
- [ ] `export function postureSettingsForSeat(seatId: string): PostureSettings` reads with `{ getOne: dbGetOne }` and returns `POSTURE_SETTINGS[stored?.posture ?? DEFAULT_POSTURE]`. The body is inside a `try`/`catch` that logs with `logError` and returns `POSTURE_SETTINGS[DEFAULT_POSTURE]`.
- [ ] Clear `POSTURES_CONFIG_KEY` in `resetGame.ts` beside `OPERATIONS_CONFIG_KEY`, and clear the seat's entry in `deleteSeatPrivateRows` beside the operations line.

### Step 3: Tests

- [ ] New `src/main/operations/postureSettings.test.ts`: `POSTURE_SETTINGS.overland.liftGroundShare === LIFT_MAX_GROUND_SHARE`; `POSTURE_SETTINGS.overland.navalPriorityCapShare === NAVAL_PRIORITY_CAP_SHARE`; `creditsCityUrbanFactor`, `airOperationSlotFactor`, and `campaignAssaultFactor` are 1; `engineLaunchMaxDefenders` is 0; `missilePriorityEveryCity` is false; `menuMethodOrder` is land, sea, air. Every posture's `menuMethodOrder` holds each of the three methods exactly once.
- [ ] New `src/main/gameDb/postureMemory.test.ts`: write then read; a bad stored name reads as `null`; `postureSettingsForSeat` for an unknown seat returns the `overland` row; with a database that throws it returns the `overland` row.

### Phase 1 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/postureSettings.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/gameDb/postureMemory.test.js`

## Phase 2: Production Settings

Goal: R4 for the three production settings. With no stored posture, every existing test passes unchanged.

Read `buildProductionPriorityLines` in `src/main/openRouter/productionPriorities.ts` first.

### Step 1: Confirm the naval share is named

- [ ] `productionPriorities.ts` already exports `NAVAL_PRIORITY_CAP_SHARE` and its naval condition reads `counts.naval < Math.ceil(caps.naval * NAVAL_PRIORITY_CAP_SHARE)`. If it does not, stop and report.

### Step 2: Settings as an argument

- [ ] `buildProductionPriorityLines` gains an optional `readonly settings?: PostureSettings` in its `args`. Absent, it behaves as today.
  - Naval: `share = args.settings?.navalPriorityCapShare ?? NAVAL_PRIORITY_CAP_SHARE`.
  - Credits: `minUrban` is multiplied by `args.settings?.creditsCityUrbanFactor ?? 1`. The treasury ceiling uses the multiplied value.
  - Missile: when `args.settings?.missilePriorityEveryCity === true`, the "missile is not queued" condition is dropped, and a builder whose own queue already holds a missile is not a builder. The cap condition stays.
- [ ] In `src/main/openRouter/briefingSections.ts`, where `buildProductionPriorityLines` is called, pass `settings: postureSettingsForSeat(ownSeat)`.

### Step 3: Tests in `productionPriorities.test.ts`

- [ ] With no `settings`, every existing expectation holds.
- [ ] `maritime` settings: a seat at half its naval cap still gets the naval line; at the full cap it does not.
- [ ] `strangle` settings: with a missile queued in one city and a second city that can reach an enemy city, the line names the second city. The credits line names the 24-cell city on Small where the default names the 12-cell one.

### Phase 2 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/productionPriorities.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/briefingSections.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/postureSettings.test.js`

## Phase 3: Operation Settings

Goal: R4 for the lift share, the air slots, the menu order, and the engine's launch rule.

### Step 1: Lift share

- [ ] `liftGroundCap` in `src/main/operations/liftRules.ts` gains an optional `readonly campaignShare?: number`. `share` is `args.campaignShare ?? LIFT_MAX_GROUND_SHARE` when `hasCampaignPlan`, and `LIFT_MAX_GROUND_SHARE_NO_CAMPAIGN` otherwise. When `campaignShare` is larger than `LIFT_MAX_GROUND_SHARE_NO_CAMPAIGN`, use it in both cases.
- [ ] `listSeaOperationCandidates` gains an optional `readonly settings?: PostureSettings` and passes `campaignShare: args.settings?.liftGroundShare`.

### Step 2: Air slots

- [ ] `operationSlotsForState(state, method)` in `operationCandidates.ts` gains an optional third parameter `settings?: PostureSettings`. For `air` the result is multiplied by `settings?.airOperationSlotFactor ?? 1`.

### Step 3: Menu order

Read `operationCandidatesForSeat` first. After plan 5 it returns land rows, then sea, then air, with a row budget for each.

- [ ] At its start add `const settings = postureSettingsForSeat(args.seatId);`. Pass `settings` to the sea builder and to both `operationSlotsForState` calls.
- [ ] Keep the row budgets as they are: land up to `OPERATION_MENU_LAND_ROWS`, air up to `OPERATION_MENU_AIR_ROWS`, sea in what is left. Then return the three groups in the order of `settings.menuMethodOrder`, leaving out `land` when `includeLand` is not true.
- [ ] Nothing else may order the list. The briefing and the commands both call this function, so a letter still means the same row in both.

### Step 4: The engine's launch rule

In `advanceOperationsForSeat` in `operationTurnFlow.ts`:

- [ ] Replace the choice of the first candidate with `clear: true` by the first candidate for which `candidate.clear || candidate.defenders <= settings.engineLaunchMaxDefenders`, with `settings = postureSettingsForSeat(seatId)` read once per seat.

### Step 5: Tests

- [ ] `liftRules.test.ts`: 8 units with a campaign and `campaignShare: 0.5` gives 4; without `campaignShare` it gives 2.
- [ ] `operationCandidates.test.ts`: with a stored `maritime` posture the list is sea, then air, then land; with `blitz` it is air, then land, then sea, and two air operations may be active on Small.
- [ ] `operationTurnFlow.test.ts`: with no stored posture, a candidate with one defender is not launched by the engine; with `blitz` it is.

### Phase 3 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/liftRules.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/operationCandidates.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/operationTurnFlow.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/operationCommands.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/seaOperationCandidates.test.js`
- [ ] Every test in those files that stores no posture passes with no change.

## Phase 4: The Campaign's Assault Threshold

Goal: R4 for `campaignAssaultFactor`. This is the only phase that edits `src/main/openRouter/campaignRules.ts`.

Read `campaignAssaultThreshold`, `resolveCampaignObjective`, `campaignAssaultReady`, and `buildCampaignPlan` first. The first is called once in each of the other three.

### Step 1: The parameter

- [ ] `campaignAssaultThreshold(groundUnitCount: number, minUnits: number = CAMPAIGN_ASSAULT_MIN_UNITS): number` uses `minUnits` where it used the constant.
- [ ] The `args` of `resolveCampaignObjective`, `campaignAssaultReady`, and `buildCampaignPlan` each gain `readonly assaultMinUnits?: number`, passed as the second argument to `campaignAssaultThreshold`.
- [ ] Add `export function campaignAssaultMinUnitsFor(factor: number): number` returning `Math.max(1, Math.ceil(CAMPAIGN_ASSAULT_MIN_UNITS * factor))`.

### Step 2: The callers

- [ ] `src/main/openRouter/campaignObjectiveFlow.ts`: in `resolveCampaignObjectiveForSeat` and in `campaignPlanForState`, compute `const assaultMinUnits = campaignAssaultMinUnitsFor(postureSettingsForSeat(seatId).campaignAssaultFactor);` and pass it.
- [ ] `src/main/openRouter/afterResolution.ts`: `campaignReadyOverride` does the same for `campaignAssaultReady`.
- [ ] Run `rg -n "campaignAssaultThreshold|campaignAssaultReady\(|buildCampaignPlan\(|resolveCampaignObjective\(" src --glob "!*.test.ts"`. Every call outside tests must be one of the three above or inside `campaignRules.ts`. If there is another, pass the value there too.

### Step 3: Tests

- [ ] `campaignRules.test.ts`: no existing expectation changes. Add: `campaignAssaultThreshold(10, 3)` is 3; `campaignAssaultMinUnitsFor(0.5)` is 3 and `campaignAssaultMinUnitsFor(1)` is `CAMPAIGN_ASSAULT_MIN_UNITS`; `campaignAssaultReady` with three units massed is false by default and true with `assaultMinUnits: 3`.
- [ ] `campaignObjectiveFlow.test.ts`: with a stored `blitz` posture and three of eight ground units massed at the staging hex, the stored phase becomes `assault`; with no stored posture it stays `assemble`.

### Phase 4 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/campaignRules.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/campaignObjectiveFlow.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/briefingSectionsCampaign.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/possibleUnitActionsCampaign.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/tools/standingOrdersInjectionMission.test.js`
- [ ] The diff of `campaignRules.ts` touches only the four functions named above and adds the one new function.

## Phase 5: The Reply Field

Goal: R2, R7.

### Step 1: Apply, new file `src/main/operations/postureChoice.ts`

- [ ] Function:

```ts
export function applyPostureChoice(args: {
  readonly seatId: string;
  readonly posture: Posture;
  readonly turnNumber: number;
}): { readonly applied: boolean; readonly dropReasons: string[] }
```

  - `stored = readPosture(...)`. `current = stored?.posture ?? DEFAULT_POSTURE`.
  - `args.posture === current`: applied, no reason, nothing written.
  - `stored !== null && args.turnNumber - stored.sinceTurn < POSTURE_MIN_HOLD_TURNS`: not applied, with the reason `posture dropped: you set ${current} on turn ${stored.sinceTurn} and may change it from turn ${stored.sinceTurn + POSTURE_MIN_HOLD_TURNS}.`
  - Otherwise `writePosture(..., { posture: args.posture, sinceTurn: args.turnNumber })`, applied. Log with `logDebug('postureChoice applied', { seatId, from: current, to: args.posture, turnNumber })`.
  - A seat with no stored posture may set one at once.
  - The body is inside a `try`/`catch`; a throw is logged with `logError` and returns `{ applied: false, dropReasons: ['posture dropped: the engine could not store it.'] }`.
- [ ] Tests in `postureChoice.test.ts`: first choice is stored; the same choice again writes nothing; a different choice two turns later is dropped with the turn numbers in the reason; a different choice six turns later is stored.

### Step 2: Parse

Read the `campaignTarget` handling in `src/main/openRouter/orderResponseParsing.ts` first.

- [ ] Beside `campaignTargetCode?: string;` add `postureChoice?: Posture;` with an orienting block.
- [ ] Beside the `rawCampaignTarget` lines add:

```ts
        const rawPosture = obj.posture;
        const postureChoice =
          context.mode !== 'tactical' && typeof rawPosture === 'string' && isPosture(rawPosture.trim().toLowerCase())
            ? (rawPosture.trim().toLowerCase() as Posture)
            : undefined;
```

  and, beside the `campaignTarget` drop reason: `if (context.mode !== 'tactical' && rawPosture !== undefined && postureChoice === undefined) dropReasons.push(`posture dropped: expected one of ${POSTURES.join(', ')}.`);`. Return `postureChoice` beside `campaignTargetCode`.

### Step 3: Call it

- [ ] In `src/main/openRouter/requestOrdersApplyParsed.ts`, directly after the `applyOperationCommands` block:

```ts
  if (!tacticalBattle && ordersEnabled && parsed.postureChoice) {
    const postureResult = applyPostureChoice({
      seatId,
      posture: parsed.postureChoice,
      turnNumber: state.turnNumber,
    });
    dropReasons.push(...postureResult.dropReasons);
  }
```

### Step 4: The reply contract

Run `rg -n "includeOperations" src/main/openRouter --glob "!*.test.ts"` and read every hit. Add `posture` beside `operations` with a gate named `includePosture`, fed the same value as `includeOperations` at every site.

- [ ] `promptSpec/envelopeContract.ts`: `'posture'` in `ENVELOPE_FIELD_ORDER` after `'operations'`; the gate field; the filter line.
- [ ] `promptSpec/envelopeJsonSchema.ts`: `case 'posture':` returns a string schema with an `enum` of `POSTURES`. Treat it as optional wherever `operations` is.
- [ ] `promptContracts.ts`: `posture: '"posture": "<optional posture>"'` in `headerSlots`; the gate; and a paragraph after the `operations` paragraph:

```text
Optional "posture": one of ${POSTURES.join(', ')}. Omit it to keep your posture. A posture holds for ${POSTURE_MIN_HOLD_TURNS} turns before it can change; the Posture section of the briefing says when.
```

### Step 5: Tests

- [ ] `orderResponseParsing.test.ts`: `"posture":"Maritime"` parses to `maritime`; an unknown name is dropped with the reason; a tactical reply with the field yields nothing and no reason.
- [ ] `promptSpec/envelopeContract.test.ts`, `envelopeJsonSchema.test.ts`, `promptContracts.test.ts`: present with the gate for strategic gates, absent otherwise and for every tactical gate set; the schema rejects an unknown name.

### Phase 5 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/operations/postureChoice.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/orderResponseParsing.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/envelopeContract.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/envelopeJsonSchema.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptContracts.test.js`
- [ ] `npm run check:circular` reports no new cycle.

## Phase 6: Briefing and Prompt Text

Goal: R5, R6, R9.

### Step 1: Headings

- [ ] `promptSpec/sectionHeadings.ts`: `export const SECTION_TITLE_POSTURE = 'Posture' as const;` after `SECTION_TITLE_OPERATIONS`, and `export const SECTION_TITLE_POSTURE_RULES = 'Postures' as const;` after `SECTION_TITLE_OPERATION_RULES`. Register each wherever its neighbour is registered.

### Step 2: New file `src/main/openRouter/briefingSectionsPosture.ts`

- [ ] `export function postureEffectLine(posture: Posture): string` builds the line from `POSTURE_SETTINGS[posture]`, so the numbers cannot drift:

| Posture | Line |
|---------|------|
| `overland` | `Land options are listed first, and the engine launches only against undefended objectives.` |
| `maritime` | `Sea and air options are listed first. Production Priorities asks for ships up to your full naval cap, and up to ${percent(liftGroundShare)} of your ground units may be lifted.` |
| `strangle` | `Production Priorities asks for a missile in every city that can reach an enemy city, and names a larger city for credits. Strike city, airport, and seaport cells before units.` |
| `blitz` | `Air options are listed first and you may run ${airOperationSlotFactor} times as many. The campaign assaults with ${campaignAssaultMinUnitsFor(campaignAssaultFactor)} ground units massed instead of ${CAMPAIGN_ASSAULT_MIN_UNITS}, and the engine launches against an objective with ${engineLaunchMaxDefenders} defender.` |

  `percent(0.5)` is `50%`.
- [ ] `export function buildPostureSection(args: { readonly stored: StoredPosture | null; readonly turnNumber: number }): string` returns `topLevelHeading(SECTION_TITLE_POSTURE)`, a blank line, and:
  - with no stored posture: `- Posture: ${DEFAULT_POSTURE}, the default. You may set another at any time.`
  - with one: `- Posture: ${posture}, set on turn ${sinceTurn}. You may change it from turn ${sinceTurn + POSTURE_MIN_HOLD_TURNS}.` When that turn is not after `turnNumber`, the second sentence is `You may change it now.`
  - then `- Effect: ${postureEffectLine(posture)}`.
- [ ] `requestOrdersInjection.ts`, where `operationsText` is built: when `args.ordersEnabled` and the mode is not tactical, `operationsText` becomes the posture section, two newlines, and the operations section when that is not empty. When the operations section is empty, it is the posture section alone.
- [ ] Tests in `briefingSectionsPosture.test.ts`: the default form; a stored posture that cannot change yet; one that can; the `blitz` effect line contains `3 ground units massed instead of 6` on the present constants.

### Step 3: New file `src/main/openRouter/promptSpec/postureRuleText.ts`

- [ ] `export function buildPostureRuleBlock(): string` returns exactly this, with the first line from `subHeading(SECTION_TITLE_POSTURE_RULES)` and the numbers from the constants:

```text
## Postures

Your posture is what you put your effort into. The engine remembers it and leans production, operations, and the campaign the same way until you change it. Set it with "posture" in your reply. It holds for 6 turns before it can change. If you never set one you are on overland.

- overland: mass your ground units and march. Land options come first. Like the Soviet summer offensive of 1944: mass, then break through.
- maritime: build ships to your full cap and lift up to half your ground units. Sea and air options come first. Like the Pacific island-hopping campaign: land where the enemy is weak and bypass where it is strong.
- strangle: build missiles in every city that reaches an enemy city, bank more credits for mercenaries, and strike city, airport, and seaport cells before units. Like the Combined Bomber Offensive and the Battle of the Atlantic: destroy what builds and moves the enemy's force.
- blitz: assault with half the usual mass, run twice the air operations, and let the engine launch against a lightly held objective. Like the 1940 campaign in France: strike before the enemy has massed, and accept thin odds for speed.

The historical names are illustrations of an idea. Decide from the map and the tables in front of you, not from how those campaigns went.
```

- [ ] `promptSpec/coachingGates.ts`: `readonly postureEnabled?: boolean;`. `consultPromptParts.ts`: `postureEnabled: coachingGates.operationsEnabled === true` (set it in the literal with the same expression `operationsEnabled` uses).
- [ ] `coachingTextStrategic.ts`, in `buildStrategicContextCoaching`: after the operations block is appended, append `\n\n${buildPostureRuleBlock()}` when `gates.postureEnabled === true`.
- [ ] Build `6` from `POSTURE_MIN_HOLD_TURNS`. The words `full cap`, `half your ground units`, `twice`, and `half the usual mass` state settings, so add a test beside the block that fails when they stop being true: `maritime.navalPriorityCapShare === 1`, `maritime.liftGroundShare === 0.5`, `blitz.airOperationSlotFactor === 2`, `blitz.campaignAssaultFactor === 0.5`, `blitz.engineLaunchMaxDefenders === 1`. Whoever changes a setting then has to change the sentence.
- [ ] Tests in `promptSpec/coachingText.test.ts`: the block prints after the Operations block with the gate, not without, and never for tactical gates.

### Phase 6 verification

- [ ] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/briefingSectionsPosture.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/briefingSectionsOperations.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/coachingText.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptContracts.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptSpec/variantConformance.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/briefingFormatter.test.js`
- [ ] `git diff --stat` shows no change to `src/main/briefingFormatter.ts`.

## Phase 7: Documentation and Final Verification

- [ ] `doc/hybrid-ai.md`: a Posture section after Operations. The four postures, the settings table with its values taken from `POSTURE_SETTINGS`, the hold, and that doctrine is separate.
- [ ] `doc/ai-commander-prompts/strategic-prompt.md`, `assembly-contract.md`, `information-decision-model.md`, `variants.md`, `source-inventory.md`, `crosswalk.md`: the Postures block, the Posture section, the `posture` field, and their include conditions.
- [ ] `doc/ai-commander-prompts/example-strategic-prompt.md`: the Postures block and a Posture section in the default form. `example-strategic-response.md`: unchanged.
- [ ] `doc/save-files.md`: postures are stored in `game_config` under `postures`.
- [ ] `doc/how-to-play.md`: only if it describes how AI opponents decide. Run `rg -n -i "doctrine" doc/how-to-play.md`; where doctrine is explained, add one sentence that an AI opponent also declares a posture during the match.
- [ ] `node scripts/check-doc-links.cjs` passes.
- [ ] `npm test` passes. `npm run check:circular` reports no new cycle.
- [ ] `rg -n "Phase [0-9]|Step [0-9]|\bR[0-9]+\b" src doc` shows no hit introduced by this change.
- [ ] `orderResponseParsing.ts` grew by at most 12 lines and `requestOrdersApplyParsed.ts` by at most 9.
- [ ] No file touched here crossed 600 lines that was under it before, and none is over 1000.

## Phase 8: Verification Run

This phase is for the user, not the implementing agent. The agent stops after the previous phase and reports. The run needs the game window and a model key.

- [ ] Set `AGENT_WARS_LOG_LEVEL=debug` and `AGENT_WARS_LOG_FULL_PROMPTS=1`. Run 60 turns on the global map and 60 on one regional map. No fog, no tactical battles, balanced doctrine.
- [ ] From `debug.log`, per seat: every `postureChoice applied` line, in order; the count of `posture dropped` reasons; the unit counts by type at turn 60.
- [ ] Compare against the plan 5 run on the same maps: turns to the first captured enemy city, operations completed, missiles launched.
- [ ] Pass when at least one seat set a posture other than `overland`, a seat on `maritime` ended with more naval units than a seat on `overland`, and no seat did measurably worse than in the plan 5 run.
- [ ] If every seat stays on `overland`, read one reply per seat and report whether it mentioned posture at all.

## Out of Scope

- A posture set by the player when a match is created, or shown in the game's interface.
- The engine choosing or changing a posture.
- Postures that change combat, movement, costs, or caps.
- More than four postures, or postures that combine.
- Historical operations as selectable options.
