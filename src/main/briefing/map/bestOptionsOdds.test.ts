/**
 * Contract tests for the Best Options Odds cell.
 *
 * Purpose: The cell is two rounded percentages, an em dash when there is no fight, and one estimate per distinct fight.
 * When to use: After changes to `formatBestOptionsOdds` or `resolveBestOptionsOdds`.
 * Expected outcome: Each case prints OK or the process exits 1.
 * Exceptions: None.
 */

import * as assert from 'assert';
import type { GameStateSnapshot } from '../../gameDb';
import {
  formatBestOptionsOdds,
  resolveBestOptionsOdds,
  type BestOptionsOddsInput,
} from './bestOptionsOdds';

/**
 * A snapshot the resolver does not read when the injected estimator returns first.
 *
 * Purpose: These cases must not depend on a loaded map.
 * When to use: `resolveBestOptionsOdds` fixtures.
 * Expected outcome: An empty unit list and turn 1.
 * Exceptions: None.
 */
function emptyState(): GameStateSnapshot {
  return { turnNumber: 1, phase: 'planning', hexes: [], units: [], pendingOrders: [] } as GameStateSnapshot;
}

/**
 * Shared lookup fields for a two-row cache test.
 *
 * Purpose: The resolver needs a target pair and a resolver even when the estimator is fake.
 * When to use: Tests that inject `estimate`.
 * Expected outcome: The target H3 `cell-1` resolves to `[1, 2]`.
 * Exceptions: None.
 */
function oddsInput(overrides: Partial<BestOptionsOddsInput>): BestOptionsOddsInput {
  return {
    row: { action: 'ranged', unitIds: ['a1'], targetH3: 'cell-1' },
    state: emptyState(),
    latLngByH3: new Map([['cell-1', [1, 2]]]),
    resolveToH3: () => 'cell-1',
    ...overrides,
  };
}

/**
 * Rounds exact hundredths and leaves an uncontested or empty prediction as an em dash.
 *
 * Purpose: Binary fractions such as 0.185 can round the wrong way, so the fixture uses multiples of 0.01.
 * When to use: The formatter.
 * Expected outcome: `wipe 62%, lose 19%` for those two fractions, and an em dash otherwise.
 * Exceptions: None.
 */
function testFormatRoundsHundredthsAndDashesTheRest(): void {
  assert.equal(
    formatBestOptionsOdds({ probabilityDefenderEliminated: 0.62, probabilityAttackerLosesUnit: 0.19 }),
    'wipe 62%, lose 19%'
  );
  assert.equal(formatBestOptionsOdds(null), '—');
  assert.equal(formatBestOptionsOdds({ assessment: 'uncontested' }), '—');
}

/**
 * Air-strike rows never call the estimator, and a repeated fight calls it once.
 *
 * Purpose: Air strikes are not this estimator's fight, and a merged row must not be priced twice.
 * When to use: `resolveBestOptionsOdds` with an injected caller.
 * Expected outcome: The air-strike cell is an em dash and the counter stays at 1 after the second ranged row.
 * Exceptions: None.
 */
function testAirStrikeSkipsAndCacheCollapses(): void {
  let calls = 0;
  const estimate = () => {
    calls += 1;
    return {
      status: 'ok',
      error: null,
      prediction: { probabilityDefenderEliminated: 0.5, probabilityAttackerLosesUnit: 0.1, assessment: 'even' },
    };
  };
  const cache = new Map<string, string>();
  const air = resolveBestOptionsOdds(
    oddsInput({
      row: { action: 'air strike', unitIds: ['a1'], targetH3: 'cell-1' },
      estimate: estimate as BestOptionsOddsInput['estimate'],
      cache,
    })
  );
  assert.equal(air, '—');
  assert.equal(calls, 0);
  const first = resolveBestOptionsOdds(
    oddsInput({
      row: { action: 'ranged', unitIds: ['b1', 'a1'], targetH3: 'cell-1' },
      estimate: estimate as BestOptionsOddsInput['estimate'],
      cache,
    })
  );
  const second = resolveBestOptionsOdds(
    oddsInput({
      row: { action: 'ranged', unitIds: ['a1', 'b1'], targetH3: 'cell-1' },
      estimate: estimate as BestOptionsOddsInput['estimate'],
      cache,
    })
  );
  assert.equal(first, 'wipe 50%, lose 10%');
  assert.equal(second, first);
  assert.equal(calls, 1);
}

const tests = [
  { name: 'odds format rounds hundredths and dashes the rest', fn: testFormatRoundsHundredthsAndDashesTheRest },
  { name: 'air strike skips the estimator and a repeated fight is cached', fn: testAirStrikeSkipsAndCacheCollapses },
];

/**
 * Runs this file's cases.
 *
 * Purpose: The main-process suite executes the compiled file directly.
 * When to use: Module load.
 * Expected outcome: OK lines, or exit 1 on the first failure.
 * Exceptions: None.
 */
function run(): void {
  for (const t of tests) {
    try {
      t.fn();
      console.log(`OK ${t.name}`);
    } catch (err) {
      console.error(`FAIL ${t.name}`, err);
      process.exit(1);
    }
  }
}

run();
