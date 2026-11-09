# Tactical sub-unit counts — Execution Plan

Change how many tactical sub-units one strategic unit becomes when a battle starts. Infantry becomes 8, armor 4, air stays 3, and naval becomes 4.

**Do not** put this document's phase numbers or labels into product code, comments, configuration, or docs. Never commit or push.

## Locked Decisions

- **Counts:** infantry 8, armor 4, air 3, naval 4. Unknown types stay 0.
- **Where:** only `tacticalSubUnitCountForStrategicUnitType`. Placement already calls it once per parent. Do not copy the numbers anywhere else in code.
- **Unchanged:** strategic caps and build costs (`MAX_UNITS_PER_TYPE`, `UNIT_COST_BY_TYPE`), movement budgets, ranged baselines, sub-unit id format, and the voluntary-exit rule `survivors * 2 < baseline`.
- **Battles already open:** a saved snapshot keeps the sub-units it already placed. Voluntary exit uses `initialPlacedSubUnitCountByParentId` when that map is present. Do not add a second table of old counts.

## Verified Facts

- The function is in `src/main/tacticalBattle/computeTacticalBattleSnapshot.ts`. Placement loops `while (placed < n)` and records how many sub-units were actually placed on `initialPlacedSubUnitCountByParentId`.
- If the map runs out of passable cells, `placed` can be less than `n`. Those placed sub-units stay. The baseline for exit is the placed count, not `n`. Do not fail the battle for that.
- `tacticalBattleSession.ts` calls the function only when a snapshot has no stored baseline for that parent. Leave that fallback as it is.
- `src/main/tacticalBattle/tacticalBattleSession.test.ts` reads the function. It does not hardcode 12, 6, or 2. It should pass without edits.
- `src/main/unitDisplayNames.test.ts` formats slot 12 as a display example. That is not a multiplication count. Do not change it.
- `doc/combat-rules-v3.md` line about caps ("Small 12/8/8/6") is the strategic roster cap. Do not change it.
- Prompt text does not quote these counts.

## Phases

Each phase ends with the command in that phase. If a result does not match, investigate. Do not edit an assertion to match the old counts.

### 0. Preflight

```text
npm run build:main
node --test dist/main/tacticalBattle/computeTacticalBattleSnapshot.test.js
```

Expected: the count test still expects infantry 12, armor 6, air 3, naval 2, and passes.

### 1. Counts and the unit test

Replace `tacticalSubUnitCountForStrategicUnitType` with this function. `tacticalLogQuery` is already imported in the file.

```ts
/**
 * Maps one strategic parent type to the number of tactical sub-units placed for it.
 *
 * Purpose: Only multiplication table. Placement and the voluntary-exit fallback (when a snapshot stored no baseline) both use it.
 * When to use: Once per parent while building a battle snapshot, and from the exit fallback.
 * Expected outcome: Infantry 8, armor 4, air 3, naval 4. Any other type returns 0.
 * Exceptions: None.
 */
export function tacticalSubUnitCountForStrategicUnitType(unitType: string): number {
  let count = 0;
  switch (unitType) {
    case 'infantry':
      count = 8;
      break;
    case 'armor':
      count = 4;
      break;
    case 'air':
      count = 3;
      break;
    case 'naval':
      count = 4;
      break;
    default:
      count = 0;
      break;
  }
  tacticalLogQuery('computeTacticalBattleSnapshot tacticalSubUnitCountForStrategicUnitType', { unitType, count });
  return count;
}
```

In `src/main/tacticalBattle/computeTacticalBattleSnapshot.test.ts`, change the four assertions to 8, 4, 3, and 4. Leave the unknown-type test at 0.

```text
npm run build:main
node --test dist/main/tacticalBattle/computeTacticalBattleSnapshot.test.js dist/main/tacticalBattle/computeTacticalBattleSnapshotDb.test.js dist/main/tacticalBattle/tacticalBattleSession.test.js
```

Expected: all three files pass. The database snapshot test checks that the stored baseline matches the sub-units actually placed. It does not hardcode 12. If it fails because a side cannot place, inspect passable cells. Do not change the counts to satisfy the fixture.

### 2. Living docs

Update only the multiplication tables. In `doc/combat-rules-v3.md` §12.2, change the four numbers in the existing Sub-Units column to 8, 4, 3, and 4. Leave the Movement budget and Ranged baseline columns, and the rest of the table, unchanged.

`doc/game-vision-v2.md`, the "Tactical Level: Unit Multiplication" table:

| Strategic Unit | Tactical Sub-Units | Rationale |
| --- | --- | --- |
| 1 Infantry | 8 sub-units | Largest formation; cheapest strategic unit |
| 1 Armor | 4 sub-units | Half an infantry formation; each sub-unit hits harder |
| 1 Air | 3 sub-units | Small number of air wings |
| 1 Naval | 4 sub-units | Enough hulls that losing one does not leave the parent on exact half |

Do not edit the strategic cap sentence in either file.

No test command. Read both tables back and confirm no other column changed.

### 3. Final check

Search the repo for the old multiplication claims. These may remain, and must not be edited:

- Strategic caps of 12 infantry, 8 armor, 8 naval, 6 air.
- The display-name example that formats slot 12.
- Attack and defense values, costs, and ranges.

These must be gone:

- A tactical multiplication row or assertion that infantry is 12, armor is 6, or naval is 2.

```text
npm test
```

Expected: exit 0. That run includes lint, the naming check, the renderer type check, and the main tests.

## Known Limits

- A saved battle that has no `initialPlacedSubUnitCountByParentId` uses the new counts on voluntary exit. Battles that stored the map keep the counts they placed.
- A parent that cannot find enough passable cells still places fewer sub-units than the table. Exit uses that smaller placed count.
- Strategic roster caps and build costs are not part of this change.
