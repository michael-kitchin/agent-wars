# Campaign Home-Defender Sizing: Execution Plan

## Why This Change

A live Europe match showed the campaign losing its whole force at the border. By turn 3, three of four AI seats had a campaign phase of `assault` and **zero campaign units** (`campaignPlanForState ... "campaignUnitCount":0` in `debug.log`).

Cause: `isHomeDefender` in `src/main/openRouter/campaignRules.ts` makes **every** ground unit inside its own home a defender when any visible enemy unit is within `CAMPAIGN_HOME_DEFENSE_RADIUS` (3) hops. Nothing limits how many units become defenders. The staging hex is usually inside the seat's own home next to the border. The force gathers there, the phase flips to `assault`, and then the enemy across the border is visible, so every massed unit becomes a home defender at once.

A second gap: a unit that becomes a defender keeps its old `march` to the campaign target. `buildCampaignOrderRows` only lists campaign units, so nothing tells the model to cancel that march. Seat a2's briefing listed all six ground units as home defenders while their standing orders still said `march B5`.

## Requirements

| Id | Requirement |
|----|-------------|
| R1 | A threat is a visible infantry or armor unit of an active enemy seat (mercenaries included, aboard a transport or not, whenever the snapshot lists it) within `CAMPAIGN_HOME_DEFENSE_RADIUS` (3) hops of at least one own ground unit standing on an own home hex. Count one threat per enemy unit, so stacked units count separately. Air, naval, and missile units are not threats. |
| R2 | The engine keeps one home defender per threat. Candidates are own ground units on own home hexes within the radius of at least one threat. Rank candidates by hops to their nearest threat (ascending), then by unit id (plain string comparison, not locale). |
| R3 | The number of defenders is never more than `floor(ground unit count × CAMPAIGN_HOME_DEFENDER_MAX_SHARE)`, where the ground unit count is every ground unit of the seat and the share is `0.5`. A seat with one ground unit keeps no defender. |
| R4 | A home unit that is not picked as a defender and is within `CAMPAIGN_CONTACT_RADIUS` (1) hop of any visible enemy unit (any type) is still a contact unit and is not a campaign unit. Every other rule in `buildCampaignPlan` is unchanged. |
| R5 | Campaign Orders lists a home defender whose stored standing order is a `march` to the campaign target or the staging hex. Its Campaign Order is `defend` on its own hex. A defender with any other order (another march, defend, pursue) gets no row. Contact units get no row. |
| R6 | The Campaign Objective defender bullet names the threat count. It adds "At most half your ground units stay home." only when `homeDefenseCapped` is true. That flag is true when more home units were in range than the cap, and the cap is smaller than the threat count. It is false when every in-range home unit was kept, including when several threats sit near fewer home units. |
| R7 | The system-prompt Campaign section teaches the sized defense and the defender recall. |
| R8 | Living docs in `doc/` match the code in the same change. |

## Decisions Already Made

Do not reopen these.

- Defenders are sized to the threat and capped at half the ground force, rounded down. The user chose this over an uncapped rule and over "always leave one unit for the campaign".
- Only enemy infantry and armor count as threats. The user chose this over counting every enemy unit type.
- The threat test is "within 3 hops of an own ground unit standing on a home hex", not "within 3 hops of any home hex". This avoids scanning every home hex and matches how defenders are picked.
- The assault threshold, mass count, phase flip, `campaign_ready`, staging, and target choice are unchanged. Defenders still count toward the mass, as today.
- Contact-before-campaign ordering in Suggested Destination and Best Options is unchanged.
- Orderless defenders keep today's Suggested Destination. Only Campaign Orders changes for defenders.
- `CAMPAIGN_HOME_DEFENSE_RADIUS` stays `3` and stays in `campaignRules.ts`.
- `isHomeDefender` is deleted. It has no caller outside `campaignRules.ts` (verify with the grep in Phase 1 Step 1).
- The recall helper is a private function in `standingOrdersInjectionText.ts`, not an export of `campaignRules.ts`. That keeps `campaignRules.ts` under the 600-line desirable limit and avoids a new import cycle. It is tested through `buildCampaignOrderRows`.
- The prompt and briefing say "half". The constant's comment says to change that text when the share changes.
- `homeDefenseCapped` is `ranked.length > cap && cap < threatCount`. Do not treat "fewer defenders than threats" as the cap. Five threats next to two home units, in a force of six, keeps both home units and does not set the flag, because the share cap is three.

## Constants

| Name | File | Value | Status |
|------|------|-------|--------|
| `CAMPAIGN_HOME_DEFENSE_RADIUS` | `src/main/openRouter/campaignRules.ts` | 3 | existing, comment updated |
| `CAMPAIGN_HOME_DEFENDER_MAX_SHARE` | `src/main/openRouter/campaignRules.ts` | 0.5 | new |
| `CAMPAIGN_CONTACT_RADIUS` | `src/main/openRouter/campaignRules.ts` | 1 | unchanged |

## Rules for the Implementing Agent

Read these before Phase 1. They apply to every phase.

- Never commit or push.
- Source files under `src/` use CRLF line endings. Keep CRLF when you edit them. `.spec` files may stay LF.
- Do not put plan words in code, comments, test names, or docs: no "Phase", "Step", "R1", "R5", and so on. Those labels exist only in this file.
- Every new or changed function, constant, and interface field needs an orienting comment block with at least 5 non-empty lines: a summary line, then `Purpose:` (or `Contract:` on interface fields), `When to use:`, `Expected outcome:`, `Exceptions:`. Copy the style of the neighbouring comments. ESLint rule `orienting-comments/require-orienting-block` enforces this.
- Logging: use `logDebug` for a function that makes a per-consult decision, `logTrace` for a lookup or per-unit check. Import from `../logger` (already imported in every file below).
- Tests: never delete a content assertion. When wording changes, change the expected string. Never replace an assertion with `assert.ok(true)`.
- PowerShell does not support `&&`. Chain commands with `; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`.
- If a database test fails with a `NODE_MODULE_VERSION` error, run `npm run rebuild:native:node` once, then rerun it.
- When an instruction says "replace", replace exactly the quoted text. If the quoted text is not found, stop and report. Do not guess.

## Phase 1: Sized Home Defense in the Campaign Rules

Goal: `buildCampaignPlan` picks defenders with `chooseHomeDefenders`, and the plan carries `homeThreatCount` and `homeDefenseCapped`. The build stays green because the flow and all hand-built plans are updated in the same phase.

### Step 1: Confirm callers

- [x] Run `rg -n "isHomeDefender" src` and confirm the only hits are in `src/main/openRouter/campaignRules.ts`. If any other file uses it, stop and report.
- [x] Run `rg -n "massedCount:" src --glob "*.ts"` and confirm hand-built `CampaignPlan` literals exist only in:
  - `src/main/openRouter/briefingSectionsCampaign.test.ts` (`planFor`)
  - `src/main/tools/standingOrdersInjectionMission.test.ts`
  - `src/main/tools/orderlessUnitSuggestions.test.ts`
  - `src/main/openRouter/possibleUnitActionsCampaign.test.ts`

  (`campaignRules.test.ts` hits are `nextCampaignPhase` arguments, not plans.) If another plan literal exists, add `homeThreatCount: 0` and `homeDefenseCapped: false` to it in Step 7 too.

### Step 2: New constant in `campaignRules.ts`

- [x] Directly after `CAMPAIGN_HOME_DEFENSE_RADIUS`, add:

```ts
/**
 * Largest share of the ground force that stays home as defenders.
 *
 * Purpose: A side whose home borders the enemy still sends a force to the campaign.
 * When to use: `chooseHomeDefenders`. The campaign rule text and the Campaign Objective defender bullet say "half"; change them when this changes.
 * Expected outcome: 0.5. The cap is the ground-unit count times this share, rounded down, so a side with one ground unit keeps no defender.
 * Exceptions: None.
 */
export const CAMPAIGN_HOME_DEFENDER_MAX_SHARE = 0.5;
```

- [x] Change the `CAMPAIGN_HOME_DEFENSE_RADIUS` comment. Replace:
  - `* Purpose: A raid on a home city keeps that unit home.` with `* Purpose: An enemy ground unit this close to a home unit is a threat, and each threat keeps one home unit home.`
  - `* When to use: \`isHomeDefender\`.` with `* When to use: \`chooseHomeDefenders\`.`

### Step 3: `homeThreatCount` on `CampaignPlan`

- [x] In `interface CampaignPlan`, replace the `defenderUnitIds` comment's Contract line `* Contract: Ground units inside the home region with a visible enemy inside the defense radius.` with `* Contract: The units \`chooseHomeDefenders\` keeps home. At most one per threat and at most \`CAMPAIGN_HOME_DEFENDER_MAX_SHARE\` of the ground force.`
- [x] Directly after the `defenderUnitIds` field, add:

```ts
  /**
   * Enemy ground units near the home units.
   *
   * Contract: The `threatCount` from `chooseHomeDefenders`.
   * When to use: The Campaign Objective defender bullet.
   * Expected outcome: Zero or more. `defenderUnitIds` is never longer than this.
   * Exceptions: None.
   */
  readonly homeThreatCount: number;
  /**
   * Whether the half-force cap left a home unit out.
   *
   * Contract: True only when more home units were in range than the cap and that cap is smaller than the threat count.
   * When to use: The Campaign Objective defender bullet.
   * Expected outcome: False when every in-range home unit was kept, and false when the threat count was the limit rather than the share.
   * Exceptions: None.
   */
  readonly homeDefenseCapped: boolean;
```

### Step 4: Replace `isHomeDefender` with `chooseHomeDefenders`

- [x] Delete the whole `isHomeDefender` function and its comment block.
- [x] In the same place, add this private helper and the new export:

```ts
/**
 * Hops from one hex to the nearest of the targets.
 *
 * Purpose: Defenders are ranked by how close the nearest threat is.
 * When to use: `chooseHomeDefenders`. Do not log here; it runs once per home unit.
 * Expected outcome: The smallest measured distance, or null when no pair can be measured or the list is empty.
 * Exceptions: None. An unmeasurable pair is skipped.
 */
function nearestHops(fromH3: string, targets: readonly string[], hopDistance: HopDistance): number | null {
  return targets.reduce<number | null>((nearest, h3) => {
    const distance = hopDistance(fromH3, h3);
    return distance !== null && (nearest === null || distance < nearest) ? distance : nearest;
  }, null);
}

/**
 * The home units that stay home this consult.
 *
 * Purpose: One defender per enemy ground unit near home, nearest the enemy first, so a border fight does not hold back the whole force.
 * When to use: Once per consult, from `buildCampaignPlan`. Pass only enemy infantry and armor as `enemyGroundUnitHexes`, one entry per unit.
 * Expected outcome: `threatCount` is the number of entries within `CAMPAIGN_HOME_DEFENSE_RADIUS` hops of a ground unit on a home hex. Defenders are home units within that radius of a threat, ranked by hops to the nearest threat and then by unit id, limited to the threat count and to `CAMPAIGN_HOME_DEFENDER_MAX_SHARE` of all ground units, rounded down. Defenders come back in roster order. `homeDefenseCapped` is true only when more home units were in range than that limit and the limit is below the threat count.
 * Exceptions: None. An unmeasurable pair does not count.
 */
export function chooseHomeDefenders(args: {
  readonly groundUnits: readonly CampaignUnitInput[];
  readonly ownHomeHexes: ReadonlySet<string>;
  readonly enemyGroundUnitHexes: readonly string[];
  readonly hopDistance: HopDistance;
}): { readonly defenderUnitIds: readonly string[]; readonly threatCount: number; readonly homeDefenseCapped: boolean } {
  const homeUnits = args.groundUnits.filter((unit) => args.ownHomeHexes.has(unit.h3Index));
  const threatHexes = args.enemyGroundUnitHexes.filter((enemyH3) =>
    homeUnits.some((unit) => anyWithinHops(unit.h3Index, [enemyH3], CAMPAIGN_HOME_DEFENSE_RADIUS, args.hopDistance))
  );
  const ranked = homeUnits
    .flatMap((unit) => {
      const hops = nearestHops(unit.h3Index, threatHexes, args.hopDistance);
      return hops !== null && hops <= CAMPAIGN_HOME_DEFENSE_RADIUS ? [{ unit, hops }] : [];
    })
    .sort((a, b) => a.hops - b.hops || (a.unit.id < b.unit.id ? -1 : a.unit.id > b.unit.id ? 1 : 0));
  const cap = Math.min(threatHexes.length, Math.floor(args.groundUnits.length * CAMPAIGN_HOME_DEFENDER_MAX_SHARE));
  const chosen = new Set(ranked.slice(0, cap).map((entry) => entry.unit.id));
  const defenderUnitIds = args.groundUnits.filter((unit) => chosen.has(unit.id)).map((unit) => unit.id);
  const homeDefenseCapped = ranked.length > cap && cap < threatHexes.length;
  logDebug('campaignRules chooseHomeDefenders', {
    homeUnitCount: homeUnits.length,
    threatCount: threatHexes.length,
    cap,
    defenderCount: defenderUnitIds.length,
    homeDefenseCapped,
  });
  return { defenderUnitIds, threatCount: threatHexes.length, homeDefenseCapped };
}
```

Notes for the implementer:
- `threatHexes` keeps duplicates on purpose. Two enemy units on one hex are two threats.
- `flatMap` drops home units with no threat in range, so `hops` is always a number in the sort.
- The id comparison uses `<` and `>`, not `localeCompare`, so the order does not depend on the machine's locale.

### Step 5: Use it in `buildCampaignPlan`

- [x] Add `readonly enemyGroundUnitHexes: readonly string[];` to the `buildCampaignPlan` argument type, directly after `enemyUnitHexes`.
- [x] Update the `buildCampaignPlan` comment Purpose line to: `* Purpose: \`chooseHomeDefenders\` keeps defenders home, and units in contact keep today's suggestions. Every other ground unit that can reach the waypoint by land is a campaign unit. During assemble, a campaign unit already within the mass radius holds.`
- [x] Replace the start of the body, from `const defenderUnitIds: string[] = [];` through the end of the `if (defender) { ... continue; }` block, with:

```ts
  const homeDefense = chooseHomeDefenders({
    groundUnits: args.groundUnits,
    ownHomeHexes: args.ownHomeHexes,
    enemyGroundUnitHexes: args.enemyGroundUnitHexes,
    hopDistance: args.hopDistance,
  });
  const defenderIds = new Set(homeDefense.defenderUnitIds);
  for (const unit of args.groundUnits) {
    if (defenderIds.has(unit.id)) continue;
```

  The old `for` line is inside that span. The replacement contains the only `for`. Keep the contact check, the land-reach check, and the hold check that follow exactly as they are. `enemyUnitHexes` is still the contact list.
- [x] In the returned plan object, replace `defenderUnitIds,` with these three lines:

```ts
    defenderUnitIds: homeDefense.defenderUnitIds,
    homeThreatCount: homeDefense.threatCount,
    homeDefenseCapped: homeDefense.homeDefenseCapped,
```

- [x] In `logTrace('campaignRules buildCampaignPlan', ...)`, change `defenderCount: defenderUnitIds.length` to `defenderCount: homeDefense.defenderUnitIds.length`, and add `homeThreatCount: homeDefense.threatCount` and `homeDefenseCapped: homeDefense.homeDefenseCapped`.
- [x] The contact check stays on `enemyUnitHexes` and still runs for every unit that was not picked as a defender. A home unit within 1 hop of an enemy that lost the defender ranking is not a campaign unit. Do not delete that check.

### Step 6: Flow inputs in `campaignObjectiveFlow.ts`

- [x] In `interface CampaignStateInputs`, change the `enemyUnitHexes` comment line `* When to use: Contact and home defense. Intel is not included.` to `* When to use: Contact. Intel is not included.`
- [x] Directly after `enemyUnitHexes`, add:

```ts
  /**
   * Visible infantry and armor of active enemy seats, one entry per unit.
   *
   * Contract: A subset of `enemyUnitHexes`. Units aboard a transport are included when the snapshot lists them.
   * When to use: Home-defense threats. Only these units can take a city.
   * Expected outcome: H3 indexes. Stacked units repeat their hex.
   * Exceptions: None.
   */
  readonly enemyGroundUnitHexes: readonly string[];
```

- [x] In `campaignInputsFromState`, replace:

```ts
  const enemyUnitHexes = state.units.filter((unit) => activeEnemySeatIds.has(unit.player)).map((unit) => unit.h3Index);
```

with:

```ts
  const enemyUnits = state.units.filter((unit) => activeEnemySeatIds.has(unit.player));
  const enemyUnitHexes = enemyUnits.map((unit) => unit.h3Index);
  const enemyGroundUnitHexes = enemyUnits
    .filter((unit) => unit.unitType === 'infantry' || unit.unitType === 'armor')
    .map((unit) => unit.h3Index);
```

- [x] Add `enemyGroundUnitHexes,` to the returned object, directly after `enemyUnitHexes,`.
- [x] Add `enemyGroundUnitHexes: inputs.enemyGroundUnitHexes,` to the `buildCampaignPlan({ ... })` call in `campaignPlanForState`, directly after `enemyUnitHexes`.
- [x] Add `defenderCount: plan.defenderUnitIds.length,`, `homeThreatCount: plan.homeThreatCount,`, and `homeDefenseCapped: plan.homeDefenseCapped,` to the `logDebug('campaignObjectiveFlow campaignPlanForState', ...)` object.
- [x] Update the `campaignInputsFromState` Purpose line to: `* Purpose: Ground units are the seat's infantry and armor that are not aboard a carrier. Enemy units are visible units of active enemy seats, and enemy ground units are the infantry and armor among them. Cities follow \`knownCampaignCities\`. A hex in more than one enemy home has no assumed owner.`

### Step 7: Hand-built plans in tests

- [x] `src/main/openRouter/briefingSectionsCampaign.test.ts`: in `planFor`, add optional arguments `homeThreatCount?: number;` and `homeDefenseCapped?: boolean;` after `defenders?`. In the returned object, after `defenderUnitIds`, add `homeThreatCount: args.homeThreatCount ?? 0,` and `homeDefenseCapped: args.homeDefenseCapped ?? false,`.
- [x] Add `homeThreatCount: 0,` and `homeDefenseCapped: false,` directly after `defenderUnitIds: [],` in each of these. Each file has that line once:
  - `src/main/tools/standingOrdersInjectionMission.test.ts`, inside the plan object in `testCampaignOrdersListOnlyDifferingUnits`
  - `src/main/tools/orderlessUnitSuggestions.test.ts`, inside the `plan` arrow function
  - `src/main/openRouter/possibleUnitActionsCampaign.test.ts`, inside `planFor`

### Step 8: Tests in `campaignRules.test.ts`

- [x] Add `chooseHomeDefenders` to the `./campaignRules` import list (alphabetical order is not required; put it after `campaignOrderFor`).
- [x] In the existing test `defenders and units in contact stay out of the campaign, and massed units hold`, add `enemyGroundUnitHexes: ['0:2', '3:6'],` after `enemyUnitHexes`, and add `assert.equal(plan.homeThreatCount, 1);` and `assert.equal(plan.homeDefenseCapped, false);` after the `defenderUnitIds` assertion. Every other assertion stays. (Five ground units give a cap of 2; only `0:2` is within 3 of `d1`, so `d1` is the only defender and the share cap did not apply.)
- [x] After the `hop` constant, add two shared fixtures:

```ts
/**
 * Six home hexes in a row, for the home-defense cases.
 *
 * Purpose: The cases need a home region that every unit below stands in.
 * When to use: Home-defense tests in this file.
 * Expected outcome: The hexes `0:0` through `5:0`.
 * Exceptions: None.
 */
const HOME_ROW = new Set(['0:0', '1:0', '2:0', '3:0', '4:0', '5:0']);

/**
 * One ground unit on each home hex.
 *
 * Purpose: A six-unit force gives a defender cap of three.
 * When to use: Home-defense tests in this file.
 * Expected outcome: Units `a1` through `a6`, on `0:0` through `5:0`.
 * Exceptions: None.
 */
const SIX_AT_HOME = [
  { id: 'a1', h3Index: '0:0' },
  { id: 'a2', h3Index: '1:0' },
  { id: 'a3', h3Index: '2:0' },
  { id: 'a4', h3Index: '3:0' },
  { id: 'a5', h3Index: '4:0' },
  { id: 'a6', h3Index: '5:0' },
];
```

- [x] Add these two tests after the existing defenders test:

```ts
test('home defenders match the enemy ground units near home and never exceed half the force', () => {
  assert.deepEqual(
    chooseHomeDefenders({ groundUnits: SIX_AT_HOME, ownHomeHexes: HOME_ROW, enemyGroundUnitHexes: ['0:2'], hopDistance: hop }),
    { defenderUnitIds: ['a1'], threatCount: 1, homeDefenseCapped: false }
  );
  assert.deepEqual(
    chooseHomeDefenders({
      groundUnits: SIX_AT_HOME,
      ownHomeHexes: HOME_ROW,
      enemyGroundUnitHexes: ['5:1', '5:1', '4:2', '5:3', '3:3'],
      hopDistance: hop,
    }),
    { defenderUnitIds: ['a3', 'a5', 'a6'], threatCount: 5, homeDefenseCapped: true }
  );
  assert.deepEqual(
    chooseHomeDefenders({
      groundUnits: [{ id: 'a1', h3Index: '0:0' }],
      ownHomeHexes: HOME_ROW,
      enemyGroundUnitHexes: ['0:1'],
      hopDistance: hop,
    }),
    { defenderUnitIds: [], threatCount: 1, homeDefenseCapped: true }
  );
  assert.deepEqual(
    chooseHomeDefenders({
      groundUnits: [
        { id: 'a1', h3Index: '0:0' },
        { id: 'a2', h3Index: '1:0' },
        { id: 'b1', h3Index: '9:9' },
        { id: 'b2', h3Index: '9:8' },
        { id: 'b3', h3Index: '9:7' },
        { id: 'b4', h3Index: '9:6' },
      ],
      ownHomeHexes: new Set(['0:0', '1:0']),
      enemyGroundUnitHexes: ['0:1', '0:1', '0:1', '0:1', '0:1'],
      hopDistance: hop,
    }),
    { defenderUnitIds: ['a1', 'a2'], threatCount: 5, homeDefenseCapped: false }
  );
  const fiveAtHome = ['a1', 'a2', 'a3', 'a4', 'a5'].map((id, index) => ({ id, h3Index: `${index}:0` }));
  assert.deepEqual(
    chooseHomeDefenders({
      groundUnits: fiveAtHome,
      ownHomeHexes: new Set(fiveAtHome.map((unit) => unit.h3Index)),
      enemyGroundUnitHexes: ['4:1', '4:1', '4:1', '4:1', '4:1'],
      hopDistance: hop,
    }),
    { defenderUnitIds: ['a4', 'a5'], threatCount: 5, homeDefenseCapped: true }
  );
});

test('home units the defense does not keep join the campaign, and enemy air is not a threat', () => {
  const plan = buildCampaignPlan({
    objective: { targetH3: '9:0', stagingH3: null, phase: 'assault', source: 'engine', chosenTurn: 1 },
    groundUnits: SIX_AT_HOME,
    ownHomeHexes: HOME_ROW,
    enemyUnitHexes: ['5:1', '5:1', '4:2', '5:3', '3:3', '0:3'],
    enemyGroundUnitHexes: ['5:1', '5:1', '4:2', '5:3', '3:3'],
    landStepsFromWaypoint: new Map<string, number>([...HOME_ROW].map((h3) => [h3, 1])),
    hopDistance: hop,
  });
  assert.deepEqual(plan.defenderUnitIds, ['a3', 'a5', 'a6']);
  assert.equal(plan.homeThreatCount, 5);
  assert.equal(plan.homeDefenseCapped, true);
  assert.deepEqual([...plan.campaignUnitIds], ['a1', 'a2', 'a4']);
});

test('a home unit left out of the defense still stays in a contact fight', () => {
  const plan = buildCampaignPlan({
    objective: { targetH3: '9:0', stagingH3: null, phase: 'assault', source: 'engine', chosenTurn: 1 },
    groundUnits: SIX_AT_HOME,
    ownHomeHexes: HOME_ROW,
    enemyUnitHexes: ['0:1'],
    enemyGroundUnitHexes: ['0:1'],
    landStepsFromWaypoint: new Map<string, number>([...HOME_ROW].map((h3) => [h3, 1])),
    hopDistance: hop,
  });
  assert.deepEqual(plan.defenderUnitIds, ['a1']);
  assert.equal(plan.campaignUnitIds.has('a2'), false);
  assert.equal(plan.campaignUnitIds.has('a3'), true);
});
```

Why these numbers are right (King-move distance):
- One threat at `0:2`: `a1`, `a2`, and `a3` are 2 away, `a4` is 3. Cap is `min(1, 3) = 1`. The tie at 2 goes to the lower id, `a1`. Four units are in range and the cap equals the threat count, so `homeDefenseCapped` is false.
- Five threats on the row: nearest hops are `a5` 1, `a6` 1, `a3` 2, `a4` 2, `a1` 3, `a2` 3. Cap is `min(5, floor(6 × 0.5)) = 3`. The top three are `a5`, `a6`, `a3`, returned in roster order `a3`, `a5`, `a6`. Six units are in range and 3 is below 5, so the flag is true.
- One ground unit: cap is `floor(1 × 0.5) = 0`. The one in-range unit was left out by the share, so the flag is true.
- Five threats on `0:1`, with only `a1` and `a2` at home: both are 1 away, and `9:9` is not a home hex. Cap is `min(5, 3) = 3`, so both home units are kept. Two in range is not more than 3, so the flag is false even though 2 is less than 5.
- Five units and five threats on `4:1`: `a5` and `a4` are 1 away, `a3` is 2, `a2` is 3, `a1` is 4. Cap is `min(5, floor(5 × 0.5)) = 2`. Roster order of the top two is `a4`, `a5`. Four were in range, so the flag is true.
- In the air test, `0:3` is not a ground threat. Counting it would make the threat count 6. `a1`, `a2`, and `a4` are at least 2 hops from every enemy, so they are not in contact and join the campaign.
- In the contact test, `a1` and `a2` are both 1 from `0:1`. The cap keeps `a1`. `a2` is inside the contact radius, so it is not a campaign unit. `a3` is 2 away, so it joins.

### Phase 1 verification

- [x] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/campaignRules.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/campaignObjectiveFlow.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/briefingSectionsCampaign.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/possibleUnitActionsCampaign.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/tools/orderlessUnitSuggestions.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/tools/standingOrdersInjectionMission.test.js`
- [x] `npx eslint src/main/openRouter/campaignRules.ts src/main/openRouter/campaignRules.test.ts src/main/openRouter/campaignObjectiveFlow.ts src/main/openRouter/briefingSectionsCampaign.test.ts src/main/tools/standingOrdersInjectionMission.test.ts src/main/tools/orderlessUnitSuggestions.test.ts src/main/openRouter/possibleUnitActionsCampaign.test.ts` exits 0.
- [x] `rg -n "isHomeDefender" src` finds nothing.
- [x] `(Get-Content src/main/openRouter/campaignRules.ts).Count` is under 1000. The desirable limit is 600. Do not split this file to get under 600: `chooseHomeDefenders` uses types from this file, and moving it out would cycle. A count between 600 and 650 is acceptable. If it is over 650, stop and report.

## Phase 2: Campaign Orders Recalls Marching Defenders

Goal: `buildCampaignOrderRows` adds a `defend` row for a home defender whose stored order is a march to the target or staging hex. Depends on Phase 1 (`homeThreatCount` must exist on plans).

### Step 1: Private helper in `src/main/tools/standingOrdersInjectionText.ts`

- [x] Directly above `export function buildCampaignOrderRows`, add:

```ts
/**
 * The order that recalls a home defender still marching on the campaign.
 *
 * Purpose: A unit sent toward the campaign can become a home defender later. Its old march would carry it away from home, so Campaign Orders tells it to stay.
 * When to use: `buildCampaignOrderRows`, for a unit that `campaignOrderFor` does not cover.
 * Expected outcome: Defend on the unit's hex when the unit is a home defender and its stored order is a march to the campaign target or staging hex. Otherwise null, so a defender's other orders are left alone.
 * Exceptions: None.
 */
function homeDefenderRecallOrder(args: {
  readonly plan: CampaignPlan;
  readonly unitId: string;
  readonly unitH3: string;
  readonly storedOrderType: string;
  readonly storedH3: string | undefined;
}): { readonly orderType: 'defend'; readonly destinationH3: string } | null {
  const { objective } = args.plan;
  const marchingOnCampaign =
    args.storedOrderType === 'march' &&
    args.storedH3 !== undefined &&
    (args.storedH3 === objective.targetH3 || args.storedH3 === objective.stagingH3);
  const recall = marchingOnCampaign && args.plan.defenderUnitIds.includes(args.unitId);
  logTrace('standingOrders homeDefenderRecallOrder', { unitId: args.unitId, recall });
  return recall ? { orderType: 'defend', destinationH3: args.unitH3 } : null;
}
```

  `CampaignPlan` and `logTrace` are already imported in this file. Confirm with `rg -n "CampaignPlan|logTrace" src/main/tools/standingOrdersInjectionText.ts` before adding imports.

### Step 2: Use it in `buildCampaignOrderRows`

- [x] Replace the loop body from `const desired = campaignOrderFor(...)` through `if (row.order_type === desired.orderType && storedH3 === desired.destinationH3) continue;` with:

```ts
    const params = parseOrderParams(row);
    const stored = row.order_type === 'march' ? params.destination : row.order_type === 'defend' ? params.defendHex : undefined;
    const storedH3 =
      Array.isArray(stored) && stored.length >= 2 ? resolveToH3(Number(stored[0]), Number(stored[1])) : undefined;
    const desired =
      campaignOrderFor(args.plan, { id: unit.id, h3Index: unit.h3Index }) ??
      homeDefenderRecallOrder({
        plan: args.plan,
        unitId: unit.id,
        unitH3: unit.h3Index,
        storedOrderType: row.order_type,
        storedH3,
      });
    if (desired === null) continue;
    if (row.order_type === desired.orderType && storedH3 === desired.destinationH3) continue;
```

  The `if (!unit) continue;` line above stays. Everything after (`currentTarget`, `result.push`) stays. The old `const params`, `const stored`, and `const storedH3` lines are inside the replaced span. Do not leave a second copy of them.
- [x] Update comments:
  - `CampaignOrderRow` summary: `* One unit whose standing order does not match the campaign.`
  - `CampaignOrderRow.unitId` Contract: `* Contract: A campaign unit, or a home defender still marching on the campaign, that exists on the snapshot.`
  - `campaignOrder` field Contract: `* Contract: \`march\` or \`defend\` plus the briefing hex. A recalled home defender gets \`defend\` on its own hex.`
  - `buildCampaignOrderRows` summary: `* Lists campaign units whose stored standing order differs from the campaign order, and home defenders still marching on the campaign.`
  - `buildCampaignOrderRows` Expected outcome: `* Expected outcome: One row per differing campaign order, and one \`defend\` row per home defender whose stored march goes to the target or staging hex. Units with no standing order are absent. An empty list means nothing needs to change.`
- [x] In `src/main/openRouter/promptSpec/sectionHeadings.ts`, change the `SECTION_TITLE_CAMPAIGN_ORDERS` Purpose line from `* Purpose: Lists campaign units whose standing order should change.` to `* Purpose: Lists campaign units whose standing order should change, and home defenders still marching on the campaign.`
- [x] In `src/main/openRouter/requestOrdersInjection.ts`, change the `formatCampaignAttentionBullet` summary from `* The attention sentence for campaign units whose standing order should change.` to `* The attention sentence for units whose standing order Campaign Orders changes.`

### Step 3: Test in `standingOrdersInjectionMission.test.ts`

- [x] The comment block that starts `Opens a temporary game database, runs the cell contract` sits above `testCampaignOrdersListOnlyDifferingUnits` by mistake; it describes `run`. Move that block so it sits directly above `function run(): void {`.
- [x] After `testCampaignOrdersListOnlyDifferingUnits`, add:

```ts
/**
 * Campaign Orders recalls a home defender still marching on the campaign.
 *
 * Purpose: A unit that became a defender after it was sent to the target must be told to stay, and its other orders are left alone.
 * When to use: After edits to `buildCampaignOrderRows` or the home-defender recall.
 * Expected outcome: One row for the defender marching on the target, naming defend on its own hex. No row for the defender marching elsewhere. A second plan whose staging hex is that other destination adds a row for the second unit.
 * Exceptions: Throws when the seeded match has fewer than two ground units or fewer than two spare hexes.
 */
function testCampaignOrdersRecallMarchingDefenders(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const seat = 'opponent' as const;
  const state = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
  const ground = state.units.filter(
    (unit) =>
      unit.player === seat &&
      (unit.unitType === 'infantry' || unit.unitType === 'armor') &&
      !unit.embarkedOnCarrierUnitId
  );
  assert.ok(ground.length >= 2, 'expected two ground units');
  const unitA = ground[0]!;
  const unitB = ground[1]!;
  const spare = state.hexes
    .map((hex) => hex.h3Index)
    .filter((h3) => h3 !== unitA.h3Index && h3 !== unitB.h3Index);
  assert.ok(spare.length >= 2, 'expected two spare hexes');
  const target = spare[0]!;
  const elsewhere = spare[1]!;
  dbRun('DELETE FROM standing_orders WHERE player_id = ?', [seat]);
  for (const [unit, destination] of [
    [unitA, target],
    [unitB, elsewhere],
  ] as const) {
    const [lat, lng] = cellToLatLng(destination);
    dbRun(
      `INSERT INTO standing_orders (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
       VALUES (?, ?, 'march', ?, NULL, 'en_route', ?, ?)`,
      [seat, unit.id, JSON.stringify({ type: 'march', destination: [lat, lng] }), state.turnNumber, JSON.stringify(cellToLatLng(unit.h3Index))]
    );
  }
  const plan: CampaignPlan = {
    objective: { targetH3: target, stagingH3: null, phase: 'assault', source: 'engine', chosenTurn: state.turnNumber },
    waypointH3: target,
    campaignUnitIds: new Set(),
    holdUnitIds: new Set(),
    defenderUnitIds: [unitA.id, unitB.id],
    homeThreatCount: 2,
    homeDefenseCapped: false,
    massedCount: 0,
    threshold: 1,
  };
  const rows = buildCampaignOrderRows({ playerId: seat, state, plan, coordinateContext: STRATEGIC });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0]?.unitId, unitA.id);
  assert.strictEqual(rows[0]?.currentOrder, `march ${h3ToCode(target, STRATEGIC)}`);
  assert.strictEqual(rows[0]?.campaignOrder, `defend ${h3ToCode(unitA.h3Index, STRATEGIC)}`);
  const staged: CampaignPlan = { ...plan, objective: { ...plan.objective, stagingH3: elsewhere } };
  const both = buildCampaignOrderRows({ playerId: seat, state, plan: staged, coordinateContext: STRATEGIC });
  assert.strictEqual(both.length, 2);
  assert.strictEqual(both.find((row) => row.unitId === unitB.id)?.campaignOrder, `defend ${h3ToCode(unitB.h3Index, STRATEGIC)}`);
}
```

- [x] In `run()`, after the `console.log('OK campaign orders list only units ...')` line, add:

```ts
    testCampaignOrdersRecallMarchingDefenders();
    console.log('OK campaign orders recall a home defender still marching on the campaign');
```

### Phase 2 verification

- [x] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/tools/standingOrdersInjectionMission.test.js` prints both campaign-orders OK lines.
- [x] `npx eslint src/main/tools/standingOrdersInjectionText.ts src/main/tools/standingOrdersInjectionMission.test.ts src/main/openRouter/promptSpec/sectionHeadings.ts src/main/openRouter/requestOrdersInjection.ts` exits 0.

## Phase 3: Briefing Bullet and System-Prompt Text

Goal: the model is told how many enemies keep units home, that the cap is half the force, and that Campaign Orders recalls marching defenders. Depends on Phases 1 and 2.

### Step 1: Defender bullet in `src/main/openRouter/briefingSectionsCampaign.ts`

- [x] Replace the whole `if (plan.defenderUnitIds.length > 0) { ... }` block with:

```ts
  if (plan.defenderUnitIds.length > 0) {
    const threatNoun = plan.homeThreatCount === 1 ? 'enemy ground unit is' : 'enemy ground units are';
    const capSentence = plan.homeDefenseCapped ? ' At most half your ground units stay home.' : '';
    lines.push(
      `- Home defenders: ${plan.defenderUnitIds.join(', ')}. ${plan.homeThreatCount} ${threatNoun} within ${CAMPAIGN_HOME_DEFENSE_RADIUS} hexes of your units at home, so these units stay home.${capSentence}`
    );
  }
```

- [x] Update the `buildCampaignObjectiveSection` Expected outcome to: `* Expected outcome: An H1 heading and one bullet per fact. A null staging hex says the assault has already started. The defender bullet names the enemy ground units near home and says when the half-force cap held units back.`

### Step 2: Test in `briefingSectionsCampaign.test.ts`

- [x] In the test `an explored assault names known forts, the commander, and the defenders`, add `homeThreatCount: 4,` and `homeDefenseCapped: true,` to the `planFor({ ... })` argument after `defenders`.
- [x] Replace the expected string `'- Home defenders: a1-i3, a1-t2. Each has an enemy unit within 3 hexes, so it stays home.'` with `'- Home defenders: a1-i3, a1-t2. 4 enemy ground units are within 3 hexes of your units at home, so these units stay home. At most half your ground units stay home.'`
- [x] In that same test, build the section once more with `homeDefenseCapped: false` and the same defenders and threat count. Assert that this text includes `4 enemy ground units are within 3 hexes` and does not include `At most half`.

### Step 3: Rule text in `src/main/openRouter/promptSpec/campaignRuleText.ts`

- [x] Replace the third paragraph (it starts `` `Ground units in your home region with an enemy unit within ``) with:

```ts
    `When enemy ground units are within ${CAMPAIGN_HOME_DEFENSE_RADIUS} hexes of your ground units at home, the engine keeps one home unit per enemy unit as a home defender, nearest the enemy first, and never more than half your ground units. Home defenders stay out of the campaign. A unit within ${CAMPAIGN_CONTACT_RADIUS} hex of an enemy keeps fighting it.`,
```

- [x] Replace the fourth paragraph with:

```ts
    'Campaign Orders, under Standing Order Status, lists each campaign unit whose standing order should change, and each home defender still marching on the campaign target or staging hex. Give each listed unit the order its row names. A campaign unit without a standing order has the campaign hex as its Suggested Destination.',
```

- [x] Update the `buildCampaignRuleBlock` Purpose line to: `* Purpose: The model needs the phase, how many units stay home, the advance rows, and how a new target is chosen.`

### Step 4: Test in `promptContracts.test.ts`

- [x] In `testCampaignRuleAppearsOnlyWhenEnabled`, after `assert.ok(enabled.includes('Copy it into explicit_move like an approach row.'));`, add:

```ts
  assert.ok(enabled.includes('never more than half your ground units'));
  assert.ok(enabled.includes('each home defender still marching on the campaign target or staging hex'));
```

### Phase 3 verification

- [x] `npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/briefingSectionsCampaign.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/promptContracts.test.js`
- [x] `npx eslint src/main/openRouter/briefingSectionsCampaign.ts src/main/openRouter/briefingSectionsCampaign.test.ts src/main/openRouter/promptSpec/campaignRuleText.ts src/main/openRouter/promptContracts.test.ts` exits 0.
- [x] Run the prompt sweep and confirm nothing else asserted the old wording:

```powershell
$files = @(Get-ChildItem dist/main/openRouter, dist/main/briefing, dist/main/tools -Recurse -Filter *.test.js) + @(Get-ChildItem dist/main -Filter *.test.js); foreach ($f in $files) { node $f.FullName; if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: $($f.FullName)"; exit 1 } }; Write-Host "SWEEP OK"
```

## Phase 4: Living Documentation

Goal: `doc/` matches the code. Do not edit `doc/devleopment-plan-v3.4.md`, `doc/poc-analysis.md`, `doc/market-research.md`, or `doc/release-notes/`. Keep each file's existing line endings (check with `git diff --stat` and `git diff` that only the intended lines changed).

### Step 1: `doc/hybrid-ai.md` (Campaign section)

- [x] In the first Campaign paragraph, after the sentence `The briefing asks the model to copy each Campaign Orders row into \`assign_order\`.`, insert: `Campaign Orders also lists a home defender whose standing order is a march to the target or the staging hex, with \`defend\` on its own hex as the new order.`
- [x] In the second Campaign paragraph, replace the sentence `A **home defender** is a ground unit inside the seat's own home with a visible active enemy within \`CAMPAIGN_HOME_DEFENSE_RADIUS\` (3) hops.` with:

  `**Home defenders** come from \`chooseHomeDefenders\`. A threat is a visible infantry or armor unit of an active enemy seat within \`CAMPAIGN_HOME_DEFENSE_RADIUS\` (3) hops of a ground unit standing in the seat's own home. Each enemy unit is one threat, and air, naval, and missile units are not threats. The engine keeps one home unit per threat, picking home units within that radius of a threat, nearest first and then by unit id. It never keeps more than \`CAMPAIGN_HOME_DEFENDER_MAX_SHARE\` (half) of the seat's ground units, rounded down, so a seat with one ground unit keeps no defender. \`homeDefenseCapped\` is true only when that share, rather than the threat count, left a home unit out.`

  The sentences that follow (`A unit **in contact** ...`, `Those units are not campaign units.`) stay.

### Step 2: `doc/README.md`

- [x] In the paragraph that lists campaign constants, replace `` `CAMPAIGN_HOME_DEFENSE_RADIUS`, and `CAMPAIGN_CONTACT_RADIUS` in `src/main/openRouter/campaignRules.ts` `` with `` `CAMPAIGN_HOME_DEFENSE_RADIUS`, `CAMPAIGN_HOME_DEFENDER_MAX_SHARE`, and `CAMPAIGN_CONTACT_RADIUS` in `src/main/openRouter/campaignRules.ts` ``.

### Step 3: `doc/ai-commander-prompts/strategic-prompt.md`

- [x] In the Campaign Objective **Content** bullet, replace `and one for home defenders when any exist.` with `and one for home defenders when any exist. The defender bullet names the number of enemy ground units within \`CAMPAIGN_HOME_DEFENSE_RADIUS\` (3) of the units at home, and adds \`At most half your ground units stay home.\` when \`homeDefenseCapped\` is true.`
- [x] In `#### \`### Campaign Orders\``, replace `A row appears only when the stored standing order differs from the campaign order.` with `A row appears only when the stored standing order differs from the campaign order, or when a home defender's stored order is a march to the target or staging hex; that row's Campaign Order is \`defend\` on the defender's own hex.`

### Step 4: `doc/ai-commander-prompts/example-strategic-prompt.md`

- [x] Replace the line `Ground units in your home region with an enemy unit within 3 hexes are home defenders and stay out of the campaign. A unit within 1 hex of an enemy keeps fighting it.` with `When enemy ground units are within 3 hexes of your ground units at home, the engine keeps one home unit per enemy unit as a home defender, nearest the enemy first, and never more than half your ground units. Home defenders stay out of the campaign. A unit within 1 hex of an enemy keeps fighting it.`
- [x] Replace the line `Campaign Orders, under Standing Order Status, lists each campaign unit whose standing order should change. Give each listed unit the order its row names. A campaign unit without a standing order has the campaign hex as its Suggested Destination.` with `Campaign Orders, under Standing Order Status, lists each campaign unit whose standing order should change, and each home defender still marching on the campaign target or staging hex. Give each listed unit the order its row names. A campaign unit without a standing order has the campaign hex as its Suggested Destination.`
- [x] This file uses CRLF. After editing, confirm with `git diff --stat doc/ai-commander-prompts/example-strategic-prompt.md` that only 2 lines changed. If the whole file shows as changed, restore CRLF.

### Step 5: `doc/ai-commander-prompts/source-inventory.md`

- [x] Replace `Built by \`buildCampaignOrderRows\`. A row appears only when the stored order differs.` with `Built by \`buildCampaignOrderRows\`. A row appears only when the stored order differs, or when a home defender's stored march goes to the target or staging hex; that row names \`defend\` on the defender's hex.`

### Step 6: `doc/ai-commander-prompts/information-decision-model.md`

- [x] In decision 6, replace `Campaign Orders names each campaign unit whose stored order should change,` with `Campaign Orders names each campaign unit whose stored order should change, and each home defender still marching on the campaign,`
- [x] In the `CAMPAIGN_ORDERS` row, replace `Campaign units whose stored standing order differs from the campaign order.` with `Campaign units whose stored standing order differs from the campaign order, and home defenders whose stored march goes to the target or staging hex (Campaign Order \`defend\` on their own hex).`

### Step 7: Search for stale wording

- [x] `rg -n "Each has an enemy unit within|are home defenders and stay out|isHomeDefender" doc src` finds nothing outside `.spec`.
- [x] `rg -n "home defender" doc` and read each hit. Each must agree with the rules above.

## Phase 5: Final Verification

- [x] `npm test` exits 0. It takes about 30 minutes; run it in the background and wait. ERROR lines from known failure-path tests (database open/reset, region pack zip, IPC boom, timeout) are expected.
- [x] `npm run check:circular` reports the same 4 pre-existing cycles as before this change and no new one. None of the files touched here may appear in a new cycle.
- [x] Line counts: `campaignRules.ts` under 1000 (600 to 650 is acceptable; do not split it), `standingOrdersInjectionText.ts` under 1000, `campaignObjectiveFlow.ts` under 1000.
- [x] `rg -n "Phase [0-9]|Step [0-9]" src/main/openRouter/campaignRules.ts src/main/openRouter/campaignObjectiveFlow.ts src/main/openRouter/briefingSectionsCampaign.ts src/main/openRouter/promptSpec/campaignRuleText.ts src/main/tools/standingOrdersInjectionText.ts doc/hybrid-ai.md doc/README.md doc/ai-commander-prompts` finds nothing.
- [x] `git status` shows only the files named in this plan plus this plan file. Nothing is committed.
- [ ] Optional manual check (user): start a new region-vs-region match with two adjacent homes, play to turn 3, and confirm in `debug.log` that `campaignPlanForState` logs a non-zero `campaignUnitCount` for a seat that has enemy ground units near home, and that `defenderCount` is at most half its ground units.

## Out of Scope

- Suggested Destination for orderless defenders.
- The assault threshold and the mass count (defenders still count toward the mass).
- Doctrine-specific defender caps.
- Battles, naval, air, and missile behavior.
