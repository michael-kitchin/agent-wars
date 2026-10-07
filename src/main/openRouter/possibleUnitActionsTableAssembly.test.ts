/**
 * Unit tests for Best Options This Turn table assembly helpers (`deriveThisTurnOptionsActionColumn`, row priority inputs).
 *
 * Purpose: Locks action-column labels and documents that Best Options This Turn tables no longer merge multiple target hexes into one row.
 * When to use: `npm test` after `build:main`.
 * Expected outcome: `deriveThisTurnOptionsActionColumn` returns stable labels; a hex that is both a move and a shot stays two table rows; a ranged-only row does not gain a move row.
 * Exceptions: Assertion failures indicate regression in action column derivation.
 */

import assert from 'node:assert/strict';
import { renderThisTurnOptionsTableMarkdown } from '../briefing/map/briefingTables';
import { ensureStrategicCoordinateRegistryInitialized, listStrategicH3Indexes } from '../briefing/map/hexCoordinates';
import {
  ACTION_AIR_STRIKES,
  ACTION_FERRY,
  deriveThisTurnOptionsActionColumn,
  omitThisTurnFerryRowsForStrikingAir,
  selectTopRowsPerUnit,
  type PossibleActionTableRow,
  type RawPossibleActionRow,
} from './possibleUnitActionsTableAssembly';

/**
 * Documents the function binding `fixtureRow` (fixtureRow).
 *
 * Purpose: Builds a minimal `PossibleActionTableRow` with overridable fields for assembly tests.
 * When to use: Only inside this test module.
 * Expected outcome: Valid row with defaults for priority / action column checks.
 * Exceptions: None.
 */
function fixtureRow(overrides: Partial<PossibleActionTableRow>): PossibleActionTableRow {
  return {
    bucket: 'other',
    unitId: 'opponent-armor-2:01',
    unitType: 'armor',
    actionTypes: 'move/melee',
    targetH3: '8f283082dcb519f',
    distance: 1,
    enemySummary: '—',
    featuresSummary: '—',
    enemyUnitCount: 0,
    urbanHexCount: 0,
    ...overrides,
  };
}

/**
 * Documents the function binding `testSelectTopRowsPerUnitKeepsDistinctHexRows` (testSelectTopRowsPerUnitKeepsDistinctHexRows).
 *
 * Purpose: Ensures four same-context rows stay four rows after per-unit capping (no merge step in this module).
 * When to use: Regression guard after removing `mergeThisTurnOptionsRowsForBriefing`.
 * Expected outcome: `selectTopRowsPerUnit` returns four rows for one unit when under the per-unit cap.
 * Exceptions: None.
 */
function testSelectTopRowsPerUnitKeepsDistinctHexRows(): void {
  const h0 = '8f283082dcb519f0';
  const h1 = '8f283082dcb519f1';
  const h2 = '8f283082dcb519f2';
  const h3 = '8f283082dcb519f3';
  const rows: PossibleActionTableRow[] = [
    fixtureRow({ targetH3: h0, distance: 2 }),
    fixtureRow({ targetH3: h1, distance: 2 }),
    fixtureRow({ targetH3: h2, distance: 2 }),
    fixtureRow({ targetH3: h3, distance: 2 }),
  ];
  const latLngByH3 = new Map<string, [number, number]>();
  const capped = selectTopRowsPerUnit(rows, latLngByH3);
  assert.strictEqual(capped.length, 4);
  const hexes = new Set(capped.map((r) => r.targetH3));
  assert.strictEqual(hexes.size, 4);
}

/**
 * Documents the function binding `testDeriveActionColumnMoveMelee` (testDeriveActionColumnMoveMelee).
 *
 * Purpose: Smoke test for exported action label helper.
 * When to use: Same module as priority tests.
 * Expected outcome: `move/melee` for standard move row.
 * Exceptions: None.
 */
function testDeriveActionColumnMoveMelee(): void {
  assert.strictEqual(deriveThisTurnOptionsActionColumn(fixtureRow({})), 'move/melee');
}

/**
 * Ensures approach rows do not win the per-unit cap just because the hex is urban.
 *
 * Purpose: Friendly-occupied cities can still be legal approach dests (stacking while closing); ranking must not put them ahead of closer empty hexes.
 * When to use: After changing `compareTableRowsForUnitPriority` or approach row assembly.
 * Expected outcome: Among `approach` rows, shorter distance wins even when the farther hex has a higher urban count.
 * Exceptions: None.
 */
function testSelectTopRowsPerUnitApproachIgnoresUrbanCount(): void {
  const closerEmpty = '8f283082dcb519e0';
  const fartherUrban = '8f283082dcb519e1';
  const rows: PossibleActionTableRow[] = [
    fixtureRow({
      actionTypes: 'approach',
      targetH3: fartherUrban,
      distance: 2,
      urbanHexCount: 5,
    }),
    fixtureRow({
      actionTypes: 'approach',
      targetH3: closerEmpty,
      distance: 1,
      urbanHexCount: 0,
    }),
  ];
  const capped = selectTopRowsPerUnit(rows, new Map());
  assert.strictEqual(capped[0]?.targetH3, closerEmpty);
}

/**
 * Ensures move/melee capture interest still prefers urban hexes when distances differ.
 *
 * Purpose: Ignoring urban for approach must not change city-capture ranking among interest rows.
 * When to use: Together with `testSelectTopRowsPerUnitApproachIgnoresUrbanCount`.
 * Expected outcome: Higher urban count still ranks first for `move/melee`.
 * Exceptions: None.
 */
function testSelectTopRowsPerUnitMoveMeleeStillPrefersUrban(): void {
  const closerEmpty = '8f283082dcb519e2';
  const fartherUrban = '8f283082dcb519e3';
  const rows: PossibleActionTableRow[] = [
    fixtureRow({
      actionTypes: 'move/melee',
      targetH3: closerEmpty,
      distance: 1,
      urbanHexCount: 0,
    }),
    fixtureRow({
      actionTypes: 'move/melee',
      targetH3: fartherUrban,
      distance: 2,
      urbanHexCount: 5,
    }),
  ];
  const capped = selectTopRowsPerUnit(rows, new Map());
  assert.strictEqual(capped[0]?.targetH3, fartherUrban);
}

/**
 * Ensures a this-turn air strike is not crowded out of the per-unit cap by high-urban ferry dests.
 *
 * Purpose: Turn 13 kept one legal strike (human-controlled seaport) but Best Options showed only ferry rows for that air unit, so the tempo rule could not fire.
 * When to use: After edits to `compareTableRowsForUnitPriority` action ranking.
 * Expected outcome: With one air-strike row and five high-urban ferry rows, the capped list includes the strike.
 * Exceptions: None.
 */
function testSelectTopRowsPerUnitKeepsAirStrikeAheadOfFerry(): void {
  const strikeHex = '8f283082dcb519a0';
  const ferryHexes = [
    '8f283082dcb519a1',
    '8f283082dcb519a2',
    '8f283082dcb519a3',
    '8f283082dcb519a4',
    '8f283082dcb519a5',
  ];
  const rows: PossibleActionTableRow[] = [
    fixtureRow({
      unitId: 'opponent-air-1',
      unitType: 'air',
      actionTypes: 'air strike',
      targetH3: strikeHex,
      urbanHexCount: 0,
      distance: 2,
    }),
    ...ferryHexes.map((targetH3, i) =>
      fixtureRow({
        unitId: 'opponent-air-1',
        unitType: 'air',
        actionTypes: 'ferry',
        targetH3,
        urbanHexCount: 80 - i,
        distance: 1,
      })
    ),
  ];
  const capped = selectTopRowsPerUnit(rows, new Map());
  assert.ok(
    capped.some((r) => r.targetH3 === strikeHex && r.actionTypes.includes('air strike')),
    'air strike must survive the per-unit top-5 when ferry dests have higher urban counts'
  );
}

/**
 * Documents the function binding `rawFixture` (rawFixture).
 *
 * Purpose: Builds a minimal `RawPossibleActionRow` for this-turn ferry-vs-strike filtering tests.
 * When to use: Only inside this test module.
 * Expected outcome: Valid raw row with defaults for omit-ferry checks.
 * Exceptions: None.
 */
function rawFixture(overrides: Partial<RawPossibleActionRow>): RawPossibleActionRow {
  return {
    bucket: 'other',
    unitId: 'opponent-air-1',
    unitType: 'air',
    actionType: ACTION_FERRY,
    targetH3: '8f283082dcb519f',
    distance: 1,
    enemySummary: '—',
    featuresSummary: '—',
    enemyUnitCount: 0,
    urbanHexCount: 0,
    ...overrides,
  };
}

/**
 * A hex that is both a shot and a move must stay two Best Options rows.
 *
 * Purpose: Aggregation merges those actions onto one row, and the Action column used to keep only ranged,
 * so a sub-unit with a legal close never saw a move/melee hex.
 * When to use: After edits to Best Options action labeling.
 * Expected outcome: The markdown lists both `move/melee` and `ranged` for that unit and hex.
 * Exceptions: None.
 */
function testBestOptionsTableKeepsMoveRowWhenRangedSharesTheHex(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const targetH3 = listStrategicH3Indexes()[0]!;
  const markdown = renderThisTurnOptionsTableMarkdown(
    [
      fixtureRow({
        unitId: 'a1-t1-s1',
        actionTypes: 'move/melee, ranged attack',
        targetH3,
        enemySummary: '2 infantry',
        enemyUnitCount: 2,
      }),
    ],
    new Map(),
    { mode: 'strategic' }
  );
  assert.match(markdown, /\| a1-t1-s1 \| move\/melee \|/);
  assert.match(markdown, /\| a1-t1-s1 \| ranged \|/);
  const rangedOnly = renderThisTurnOptionsTableMarkdown(
    [fixtureRow({ unitId: 'a1-t1-s3', actionTypes: 'ranged attack', targetH3 })],
    new Map(),
    { mode: 'strategic' }
  );
  assert.match(rangedOnly, /\| a1-t1-s3 \| ranged \|/);
  assert.equal(rangedOnly.includes('move/melee'), false, rangedOnly);
}

/**
 * Drops this-turn ferry dests for air units that already have an air-strike row.
 *
 * Purpose: Turn 18 listed the same strike-capable air units on both strike and ferry Best Options rows.
 * When to use: After edits to `omitThisTurnFerryRowsForStrikingAir`.
 * Expected outcome: Striking units keep strike rows and lose ferry rows; ferry-only units are unchanged.
 * Exceptions: None.
 */
function testOmitThisTurnFerryRowsForStrikingAir(): void {
  const kept = omitThisTurnFerryRowsForStrikingAir([
    rawFixture({ actionType: ACTION_AIR_STRIKES, targetH3: 'strike-hex' }),
    rawFixture({ actionType: ACTION_FERRY, targetH3: 'ferry-hex' }),
    rawFixture({ unitId: 'opponent-air-2', actionType: ACTION_FERRY, targetH3: 'ferry-only-hex' }),
  ]);
  assert.equal(kept.length, 2);
  assert.ok(
    kept.some((row) => row.unitId === 'opponent-air-1' && row.actionType === ACTION_AIR_STRIKES),
    'strike row must remain'
  );
  assert.ok(
    !kept.some((row) => row.unitId === 'opponent-air-1' && row.actionType === ACTION_FERRY),
    'striking air must not keep a this-turn ferry row'
  );
  assert.ok(
    kept.some((row) => row.unitId === 'opponent-air-2' && row.actionType === ACTION_FERRY),
    'ferry-only air must keep its ferry row'
  );
}

/**
 * Documents the function binding `main` (main).
 *
 * Purpose: Node test driver for this file.
 * When to use: `node dist/main/openRouter/possibleUnitActionsTableAssembly.test.js`.
 * Expected outcome: All tests pass; prints success line.
 * Exceptions: Propagates assertion errors.
 */
function main(): void {
  testSelectTopRowsPerUnitKeepsDistinctHexRows();
  testDeriveActionColumnMoveMelee();
  testSelectTopRowsPerUnitApproachIgnoresUrbanCount();
  testSelectTopRowsPerUnitMoveMeleeStillPrefersUrban();
  testSelectTopRowsPerUnitKeepsAirStrikeAheadOfFerry();
  testBestOptionsTableKeepsMoveRowWhenRangedSharesTheHex();
  testOmitThisTurnFerryRowsForStrikingAir();
  console.log('possibleUnitActionsTableAssembly tests passed');
}

main();
