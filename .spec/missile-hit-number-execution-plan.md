# Missile cell hit number

Audience: a lower-quality coding agent. Implement one phase at a time. Stop after each phase and report files touched, test results, and any doc updated. Wait for the human before the next phase. If a phase fails, restore only the files that phase changed. Do not run `git reset`, `git checkout`, `git commit`, or `git push`. If a line in this plan disagrees with the code, trust the code, stop, and report the discrepancy. Do not guess.

## Goal

A ballistic missile still rolls one d20 for every set city, airport, and seaport flag in the target hex, and one d20 for every fortified cell. A flag or a fortification is now destroyed when that face is at or below the air unit's printed attack, `getAttack('air')`, which is 10. A higher face leaves it. The missile is still spent either way.

That is the air strike's hit number before cover and bonuses. It is not an air strike. Do not send the launch through the air-strike destruction function.

## Why the air-strike function does not fit

`applyInfrastructureDestructionEffects` in [`src/main/gameActions/airStrikeResolution.ts`](../src/main/gameActions/airStrikeResolution.ts) runs after one hit roll. On that hit it randomly destroys a fixed count of one feature: `strategicUrbanCellsDestroyedPerHit()` urban cells (9 on the global map), or 1 airport, or 1 seaport. Calling it from a launch would replace the per-flag roll with one strike's worth of cells.

The launch path already shares the two follow-ups that are the same work:

- `destroyBasedAirUnitsAtHex`, when an airport flag was destroyed
- `pruneBuildQueueForInfrastructureState`, when a city, airport, or seaport flag was destroyed

Keep calling those. Do not call `applyInfrastructureDestructionEffects` or `replaceRandomTacticalFeaturesWithRubble`. Do not edit `airStrikeResolution.ts`.

The hit number is `getAttack('air')` in [`src/main/combatConstants.ts`](../src/main/combatConstants.ts). `getAttack`'s own comment says roll sites use `attackHitThreshold`. Ignore that sentence for this change. `attackHitThreshold` subtracts weather and cover and adds origin and tech. A missile has none of those. Infrastructure air strikes set cover to 0 and still apply the striker's bonuses. A missile cell does not.

## Locked decisions

- One d20 per set flag, in the order urban, then airport, then seaport. A cell with two flags rolls twice. Do not collapse that into one roll per cell.
- A fortified cell rolls once and then skips its flags. A hit clears `isFortified` only. The city, airport, and seaport flags on that cell stay, and the cell does not become rubble. A miss leaves the fortification.
- Destroyed when `face <= getAttack('air')`. Today that attack is 10, so faces 1 through 10 destroy and faces 11 through 20 leave the flag or fortification.
- Compute `getAttack('air')` once at the start of `resolveMissileLaunchPhase`. Pass that number into `rollTargetFlags`.
- Delete `MISSILE_INFRASTRUCTURE_SURVIVAL_FACE`. Do not add a second constant whose value is 10.
- Do not import `getAttack` from [`src/shared/missileRules.ts`](../src/shared/missileRules.ts). [`src/main/combatConstants.ts`](../src/main/combatConstants.ts) already imports `isMissileUnitType` from that module. An import the other way is a cycle.
- The signature of `resolveMissileLaunchPhase` stays `(orders, next, fortificationTally?)`. Do not add a weather, origin, tech, or cover argument.
- A launch still spends the missile when every roll misses. Invalid launches are still skipped before any roll, so they still draw no dice.
- Still no counter-fire. Still no combat-dice chips. Do not call `rollCombatDieAgainst`. Each flag still draws through the existing `createCombatDieRoller(next)`, including flags that will miss. Do not skip a draw, and do not add one. A resumed turn replays this same stream.
- Based air still dies only when `airportsDestroyed` is above 0. Stripping a fortification off an airport cell does not destroy that airport and does not kill based air.
- The queue is still pruned only when a city, airport, or seaport flag was destroyed. Stripping a fortification alone does not prune it.
- Do not bump `EXPECTED_USER_VERSION`. A pending launch in an existing match resolves under the new odds. Nothing about the save format changes.
- The player guide states the number 10, because that is `getAttack('air')` today and the guide already prints attack values as numbers. Combat rules and the model sentence name `getAttack('air')`. Code must call `getAttack('air')` and must not contain a literal `10` for this roll.

## Out of scope

Cost, range, caps, launch timing, target rules, playback, strike-line wording, dice chips, and release notes. Do not edit `.spec/completed/`, [`doc/release-notes/v2.10.0.md`](../doc/release-notes/v2.10.0.md), [`doc/region-summary-1.md`](../doc/region-summary-1.md), [`doc/hybrid-ai.md`](../doc/hybrid-ai.md), or [`doc/save-files.md`](../doc/save-files.md). Do not edit [`src/shared/missileStrikeReport.ts`](../src/shared/missileStrikeReport.ts) or its test. Do not edit [`src/main/gameActions/readySeats.test.ts`](../src/main/gameActions/readySeats.test.ts). Those tests check that a launch is spent, or how a finished record is printed. They do not depend on which faces destroy a cell.

## Working rules

- Read every `.mdc` file in `.cursor/rules/` and [`AGENTS.md`](../AGENTS.md) before the first phase, and follow them. Where they differ from this plan, the rule files win.
- Shell is Windows PowerShell at `F:\Projects\Personal\agent-wars-public`. Run one command at a time. Do not chain with `&&`.
- Keep each file's existing line endings.
- **Orienting comments** on every new or changed function, field, and module comment: Purpose, When to use, Expected outcome, Exceptions. Say what the code does and why. Never write filler such as "Supports maintainability".
- **Logging:** `resolveMissileLaunchPhase` already logs at debug at its start. Add `hitThreshold` to that existing call. Do not add a log inside the per-flag loop. `buildMissileEmploymentRule` already logs at trace. Leave that call.
- **Immutability:** `const` for the threshold. It is not reassigned.
- **File size:** desirable 600 lines, hard limit 1000. Before editing, these are the sizes that matter. Change only what a phase names. Do not split a file.

| File | Lines | What this plan allows |
| --- | --- | --- |
| `src/main/gameActions/missileLaunchResolution.ts` | 415 | The threshold, the four comparisons, and the comments listed in Phase 1 |
| `src/main/gameActions/missileLaunchResolution.test.ts` | 204 | The helper and two tests |
| `src/shared/missileRules.ts` | 207 | Delete the survival-face constant and fix the module comment |
| `src/shared/ipc/missileTypes.ts` | 174 | One comment |
| `src/main/openRouter/promptSpec/gameRuleMissileText.ts` | 37 | The strategic sentence and its comment |
| `src/main/openRouter/promptSpec/gameRuleText.test.ts` | 449 | The missile-rule assertion |
| `src/main/openRouter/promptSpec/gameRuleText.ts` | 633 | No edit. The missile sentence stays in `gameRuleMissileText.ts` |
| `doc/combat-rules-v3.md` | 743 | The two missile sentences in §3.6 and §8.6 only |
| `doc/how-to-play.md` | 448 | The two bullets named in Phase 2 |
| `doc/ai-commander-prompts/strategic-prompt.md` | 366 | Item 18 only |

- After each phase, report any edited file that crosses 600 lines.
- No commit. No plan-phase labels in code, comments, configuration, or living docs.

## Phase 1 — The roll

### Files

- Modify [`src/main/gameActions/missileLaunchResolution.ts`](../src/main/gameActions/missileLaunchResolution.ts)
- Modify [`src/shared/missileRules.ts`](../src/shared/missileRules.ts)
- Modify [`src/shared/ipc/missileTypes.ts`](../src/shared/ipc/missileTypes.ts)
- Modify [`src/main/gameActions/missileLaunchResolution.test.ts`](../src/main/gameActions/missileLaunchResolution.test.ts)

### Resolution

Replace the import of `MISSILE_INFRASTRUCTURE_SURVIVAL_FACE` with:

```ts
import { getAttack } from '../combatConstants';
```

At the start of `resolveMissileLaunchPhase`, before the existing debug log:

```ts
const hitThreshold = getAttack('air');
logDebug('missileLaunchResolution resolveMissileLaunchPhase', { orderCount: orders.length, hitThreshold });
```

Pass `hitThreshold` into `rollTargetFlags`. The function becomes:

```ts
function rollTargetFlags(targetH3Index: string, rollDie: () => number, hitThreshold: number): FlagCounts {
```

Replace all four `rollDie() < MISSILE_INFRASTRUCTURE_SURVIVAL_FACE` checks with `rollDie() <= hitThreshold`. The four sites are the fortified cell, the urban flag, the airport flag, and the seaport flag. The airport check has no comment that mentions 20, and it still changes.

Leave the rest of the function as it is. A fortified cell still `continue`s after its one roll. A destroyed flag still goes through `updateClearedFlags`. Empty cells still roll nothing.

Replace these comments. Do not edit a comment that is not in this list.

File header, the Purpose sentence that currently says a face below 20 clears the flag:

```text
Purpose: Each launch rolls one d20 per set urban, airport, and seaport flag. A face at or below getAttack('air') clears that flag.
```

`urbanDestroyed` contract:

```text
Contract: Incremented only when an urban roll is at or below getAttack('air').
```

`seaportsDestroyed` contract:

```text
Contract: Incremented only when a seaport roll is at or below getAttack('air').
```

`fortificationsDestroyed` expected outcome, in this file and in `MissileLaunchRecord` in `missileTypes.ts`:

```text
Expected outcome: Zero when every fortified cell rolls above getAttack('air').
```

`rollTargetFlags` purpose:

```text
Purpose: Each urban, airport, and seaport flag rolls its own d20 against hitThreshold, which is getAttack('air') from the caller. A face at or below that number destroys the flag. A fortified cell rolls once against the same number and loses only its fortification.
```

`airportsDestroyed` does not mention a face. Leave that comment.

In `missileRules.ts`, delete the comment and the export for `MISSILE_INFRASTRUCTURE_SURVIVAL_FACE`. In the module comment, replace "the missile token, the survival face, the cost multiplier" with "the missile token, the cost multiplier". Leave every other export in that file.

### Tests

Keep the four existing tests and their rollers. `() => 0` is face 1 and still destroys. `() => 0.999` is face 20 and still leaves the target. Do not rewrite those rollers.

Replace the test-file Purpose sentence with:

```text
Purpose: A face of 1, and a face equal to getAttack('air'), clear every unfortified flag and based air. A face one above getAttack('air'), and a face of 20, spend the missile and leave the target.
```

Add these imports:

```ts
import { getAttack } from '../combatConstants';
import { COMBAT_DIE_SIDES } from '../combatDice';
```

Add this helper next to the existing helpers. `createCombatDieRoller` is `Math.floor(next() * COMBAT_DIE_SIDES) + 1`. The half-face offset is the conversion already used in [`src/main/combatResolution.test.ts`](../src/main/combatResolution.test.ts). Faces 1, 10, 11, and 20 round-trip through it.

```ts
/**
 * Turns one die face into the uniform draw the combat die roller expects.
 *
 * Purpose: A boundary case needs every flag in the hex to roll the same face.
 * When to use: The air-attack hit test and the face-above-it miss test.
 * Expected outcome: The combat die roller returns `face`.
 * Exceptions: None. `face` is from 1 through `COMBAT_DIE_SIDES`.
 */
function uniformFace(face: number): () => number {
  return () => (face - 0.5) / COMBAT_DIE_SIDES;
}
```

Add two tests.

The hit test fortifies one city cell that is not an airport and not a seaport. A fortified cell does not roll its flags, so fortifying the only airport would leave based air alive and the test would fail for the wrong reason. If the hex has no such city cell, the assertion fails. Stop and report that. Do not fortify an airport or a seaport to make the test pass.

```ts
test('a launch that rolls the air attack clears unfortified flags, strips one fortification, and destroys based air', () => {
  withSeatedTempGameDb('aw-missile-launch-air-attack-', { fogOfWarEnabled: false }, () => {
    const { target, launch } = urbanAirportTarget();
    const cell = listTacticalFeatureOverridesForGame().find(
      (row) => row.parentH3Index === target && row.isUrban && !row.isAirport && !row.isSeaport && !row.isRubble
    );
    assert.ok(cell, 'expected an intact city cell that is not an airport or a seaport');
    const airportLeft = listTacticalFeatureOverridesForGame().some(
      (row) => row.parentH3Index === target && row.isAirport && row.h3Index !== cell.h3Index
    );
    assert.equal(airportLeft, true);
    setTacticalCellFortified(cell.h3Index, true);
    const unfortifiedUrban = listTacticalFeatureOverridesForGame().filter(
      (row) => row.parentH3Index === target && row.isUrban && !row.isFortified
    ).length;
    placeMissileAndAir(launch, target);
    const tally = new Map<string, number>();
    const result = resolveMissileLaunchPhase(
      [{ unitId: 'h1-m1', targetH3Index: target }],
      uniformFace(getAttack('air')),
      tally
    );
    const after = new Map(
      listTacticalFeatureOverridesForGame().filter((row) => row.parentH3Index === target).map((row) => [row.h3Index, row])
    );
    const fortified = after.get(cell.h3Index);
    assert.ok(fortified);
    assert.equal(fortified.isUrban, true);
    assert.equal(fortified.isFortified, false);
    assert.equal(fortified.isRubble, false);
    for (const [h3Index, row] of after) {
      if (h3Index === cell.h3Index) continue;
      if (!row.isRubble && !row.isUrban && !row.isAirport && !row.isSeaport) continue;
      assert.equal(row.isUrban, false);
      assert.equal(row.isAirport, false);
      assert.equal(row.isSeaport, false);
      assert.equal(row.isRubble, true);
    }
    assert.equal(dbGetOne('SELECT id FROM units WHERE id = ?', ['a2-a1']), undefined);
    assert.equal(dbGetOne('SELECT id FROM units WHERE id = ?', ['h1-m1']), undefined);
    const record = result.launches[0];
    assert.equal(record?.fortificationsBefore, 1);
    assert.equal(record?.fortificationsDestroyed, 1);
    assert.equal(record?.urbanBefore, unfortifiedUrban);
    assert.equal(tally.get(target), 1);
    assert.equal(result.removedUnits.some((unit) => unit.id === 'a2-a1'), true);
  });
});
```

The loop above skips cells that were already empty. Every cell that still has a flag after the launch is a failure, because the fortified cell is the only one allowed to keep a flag.

The miss test:

```ts
test('a launch that rolls one above the air attack spends the missile and leaves the target', () => {
  withSeatedTempGameDb('aw-missile-launch-above-air-attack-', { fogOfWarEnabled: false }, () => {
    const missFace = getAttack('air') + 1;
    assert.ok(missFace <= COMBAT_DIE_SIDES);
    const { target, launch } = urbanAirportTarget();
    const cell = listTacticalFeatureOverridesForGame().find(
      (row) => row.parentH3Index === target && row.isUrban && !row.isRubble
    );
    assert.ok(cell, 'expected an intact city cell');
    setTacticalCellFortified(cell.h3Index, true);
    placeMissileAndAir(launch, target);
    const before = listTacticalFeatureOverridesForGame().filter((row) => row.parentH3Index === target);
    const result = resolveMissileLaunchPhase(
      [{ unitId: 'h1-m1', targetH3Index: target }],
      uniformFace(missFace)
    );
    const after = listTacticalFeatureOverridesForGame().filter((row) => row.parentH3Index === target);
    assert.deepEqual(after, before);
    assert.ok(dbGetOne('SELECT id FROM units WHERE id = ?', ['a2-a1']));
    assert.equal(dbGetOne('SELECT id FROM units WHERE id = ?', ['h1-m1']), undefined);
    assert.equal(result.launches[0]?.fortificationsDestroyed, 0);
    assert.equal(result.launches[0]?.urbanDestroyed, 0);
    assert.equal(result.launches[0]?.airportsDestroyed, 0);
    assert.equal(result.launches[0]?.seaportsDestroyed, 0);
    assert.equal(result.removedUnits.length, 0);
  });
});
```

If `missFace <= COMBAT_DIE_SIDES` fails, stop. The air attack is no longer 10, and the player-guide sentences in Phase 2 would be wrong. Report the value `getAttack('air')` returned.

### Check

Run these as two separate commands:

```powershell
npm run build:main
node dist/main/gameActions/missileLaunchResolution.test.js
```

Expected: that file's tests pass, including the two new ones and the four that were already there. The player guide, the combat rules, the README row, and the model sentence still describe a cell surviving on a 20. That is expected until Phase 2. Do not start Phase 2 until the human says to.

## Phase 2 — Sentences

Do not put a literal `10` in the TypeScript written in Phase 1. The sentences below are the places that print the number.

### Model sentence

In [`src/main/openRouter/promptSpec/gameRuleMissileText.ts`](../src/main/openRouter/promptSpec/gameRuleMissileText.ts), import `getAttack` from `../../combatConstants`. Do not edit [`src/main/openRouter/promptSpec/gameRuleText.ts`](../src/main/openRouter/promptSpec/gameRuleText.ts). It is past 600 lines, and it already calls `buildMissileEmploymentRule`.

Replace the strategic `return` with:

```ts
return `A missile never moves and is spent when it launches. Launch it with a missileLaunches entry at any hex you have explored within ${missileRangeHexes()} hexes. Launches resolve before air strikes and always hit: each city, airport, and seaport cell in the target hex is destroyed when its own d20 roll is at or below the air unit's attack of ${getAttack('air')}, and every air unit based there is destroyed when an airport cell is destroyed. Other units in the hex are unharmed. A missile keeps its hold_fire order and takes no other standing order.`;
```

In that function's Expected outcome, add that the strategic sentence names `getAttack('air')`. Do not add a fortification clause. [`buildFortificationRule`](../src/main/openRouter/promptSpec/gameRuleFortificationText.ts) already says a missile removes a fortification before it can destroy the cell, and that sentence stays true: a fortified cell is not destroyed.

In [`src/main/openRouter/promptSpec/gameRuleText.test.ts`](../src/main/openRouter/promptSpec/gameRuleText.test.ts), add `getAttack` to the existing import from `../../combatConstants`. In the test named `the missile rule appears only when the roster has a missile`, replace the `/its own d20 roll is a 20/` assertion with:

```ts
assert.match(
  strategic,
  new RegExp(`its own d20 roll is at or below the air unit's attack of ${getAttack('air')}`)
);
assert.equal(strategic.includes('roll is a 20'), false);
```

Leave the rest of that test.

### Player guide

In [`doc/how-to-play.md`](../doc/how-to-play.md), replace the Ballistic Missiles bullet **What a hit does** with:

```markdown
- **What a hit does:** Every city, airport, and seaport cell rolls a d20 and is destroyed on a roll of 10 or less, the same chance as an air strike before cover and bonuses. A higher roll leaves the cell. A fortified cell rolls once and, on a roll of 10 or less, loses only its fortification. Based air dies when an airport cell is destroyed. Other units are unharmed.
```

Replace the Fortifications bullet **Strikes and missiles** with:

```markdown
- **Strikes and missiles:** A hit by an air strike, or a missile roll of 10 or less, on a fortified city, airport, or seaport cell removes the fortification and leaves the cell. An explored enemy hex with no units is a legal ranged target when it still has a fortification. There's no return fire.
```

Leave the **When it fires** bullet and the rest of both sections.

### Combat rules

In [`doc/combat-rules-v3.md`](../doc/combat-rules-v3.md) §3.6, replace the **Strengths** bullet with:

```markdown
- **Strengths:** A missile does not roll to hit. Each flagged city, airport, and seaport cell in the target hex rolls its own d20 and is destroyed when the face is at or below `getAttack('air')` (10). A higher face leaves that flag. A fortified cell is the exception: it rolls once, a face at or below `getAttack('air')` removes only the fortification, and a higher face leaves it. The cell stays a city, airport, or seaport, and it is not counted among the cells destroyed. Based air at that hex is destroyed when any airport cell is destroyed. Other units in the hex are unharmed. Launch range is `missileRangeHexes()`: 12 hexes on the global map.
```

Replace the first paragraph of §8.6 with:

```markdown
A missile does not roll to hit. Every flagged city, airport, and seaport cell in the target hex rolls its own d20. The cell is destroyed when the face is at or below `getAttack('air')` (10). A higher face leaves that flag. A fortified cell rolls once: a face at or below `getAttack('air')` clears `is_fortified` only, and a higher face leaves it. That cell is not added to the city, airport, or seaport counts in the strike sentence. Other units in the hex are unharmed. If any airport cell is destroyed, every air unit based at that hex is destroyed. Destroyed cells become rubble, and build queues are pruned the same way an air strike prunes them (`pruneBuildQueueForInfrastructureState`). Stripping a fortification does not prune the queue by itself.
```

Leave the range paragraph and the knockout paragraph under §8.6. The file is already past 600 lines. Do not split it, and do not edit any other section.

### README and the prompt catalog

In the engine-constants table of [`doc/README.md`](../doc/README.md), replace the missile row with:

```markdown
| Missile range, cell hit number, and launch timing | `missileRangeHexes` in `src/shared/gameRules.ts`, `getAttack('air')` in `src/main/combatConstants.ts`, and `resolveMissileLaunchPhase` in `src/main/gameActions/missileLaunchResolution.ts`. A set flag or a fortification is destroyed when its d20 is at or below that attack. Launches run after embark and before air strikes. |
```

This row is the only engine-constants edit. Consultation deadlines and save versions are unchanged.

In [`doc/ai-commander-prompts/strategic-prompt.md`](../doc/ai-commander-prompts/strategic-prompt.md), replace item 18 with:

```markdown
18. Missile sentence, included only when the opponent has a missile (`buildMissileEmploymentRule`): a missile never moves and is spent when it launches; the launch is a `missileLaunches` entry at an explored hex within `missileRangeHexes()` hexes; launches resolve before air strikes and always hit; each city, airport, and seaport cell is destroyed when its own d20 roll is at or below the air unit's attack of 10 (`getAttack('air')`); based air is destroyed when an airport cell is destroyed; other units in the hex are unharmed; the missile keeps `hold_fire` and takes no other standing order.
```

Do not edit the other files under `doc/ai-commander-prompts/`. The example prompt does not contain this sentence.

### Check

Run these as two separate commands:

```powershell
npm run build:main
node dist/main/openRouter/promptSpec/gameRuleText.test.js
```

Expected: that file passes. Then run:

```powershell
node dist/main/gameActions/missileLaunchResolution.test.js
```

Expected: that file still passes. Do not start Phase 3 until the human says to.

## Phase 3 — Search

Search the repo, excluding `node_modules` and `dist`, for:

- `MISSILE_INFRASTRUCTURE_SURVIVAL_FACE`
- `roll is a 20`
- `unless it rolls 20`
- `unless the face`
- `d20 of 20`
- `survives only on`
- `Only 20 survives`
- `rolls a 20`
- `twenty-sided roll is a 20`
- `below 20`

Allowed hits:

- Anything under `.spec/completed/`
- [`doc/release-notes/v2.10.0.md`](../doc/release-notes/v2.10.0.md), which describes the odds that release shipped
- [`doc/region-summary-1.md`](../doc/region-summary-1.md), the rounding sentence "to the nearest whole number below 20". That sentence is about infantry cost, not missiles. Leave it.

Any other hit is a missed edit. Fix it and re-run both test files from Phase 2. Then report the files touched, both test results, and that the living docs were updated. No commit.
