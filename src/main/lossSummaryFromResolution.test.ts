/**
 * Tests for loss summary normalization. Run with: node dist/main/lossSummaryFromResolution.test.js
 */

import assert from 'node:assert/strict';
import { AI_SEAT_IDS } from '../shared/seatIds';
import { buildTurnLossSummary } from '../shared/lossSummaryFromResolution';
import type { RemovedUnitSnapshot } from '../shared/ipc/readyTypes';

/**
 * Builds a minimal removed-unit snapshot for normalization tests.
 *
 * Purpose: Keeps victim metadata construction consistent across test cases.
 * When to use: When exercising `buildTurnLossSummary` classification paths.
 * Expected outcome: Snapshot with id, player, unitType, and placeholder h3 index.
 * Exceptions: None.
 */
function snap(id: string, player: string, unitType: string): RemovedUnitSnapshot {
  return { id, player, unitType, h3Index: 'h3' };
}

const meta = (id: string) => {
  const table: Record<string, { player: string; unitType: string }> = {
    h1: { player: 'human', unitType: 'infantry' },
    o1: { player: 'opponent', unitType: 'armor' },
    o2: { player: 'opponent', unitType: 'naval' },
    o3: { player: 'opponent', unitType: 'air' },
    cargo: { player: 'human', unitType: 'infantry' },
  };
  return table[id];
};

/**
 * Verifies cause precedence: air strike beats direct fire for the same victim id.
 *
 * Purpose: Protects highest-precedence classification order.
 * When to use: Run after changing `buildTurnLossSummary` assignment.
 * Expected outcome: Victim appears in airStrike bucket, not ranged.
 * Exceptions: None.
 */
function testAirPrecedenceOverDirect(): void {
  const summary = buildTurnLossSummary({
    killsByDirectFire: [{ victimId: 'o1' }],
    killsByAirStrike: [{ victimId: 'o1' }],
    removedUnits: [snap('o1', 'opponent', 'armor')],
    resolveDisplayName: (id) => id,
    resolveUnitMeta: meta,
  });
  assert.strictEqual(summary.byOwner.opponent?.ranged.length, 0);
  assert.strictEqual(summary.byOwner.opponent?.airStrike.length, 1);
}

/**
 * Verifies human vs AI player split.
 *
 * Purpose: Ensures victims land in the correct player summary.
 * When to use: Run after changing player bucketing.
 * Expected outcome: Human victim in `human`, opponent in `ai`.
 * Exceptions: None.
 */
function testHumanAiSplit(): void {
  const summary = buildTurnLossSummary({
    killsByDirectFire: [{ victimId: 'h1' }, { victimId: 'o1' }],
    removedUnits: [snap('h1', 'human', 'infantry'), snap('o1', 'opponent', 'armor')],
    resolveDisplayName: (id) => id,
    resolveUnitMeta: meta,
  });
  assert.strictEqual(summary.byOwner.human?.ranged.length, 1);
  assert.strictEqual(summary.byOwner.opponent?.ranged.length, 1);
}

/**
 * Verifies fog predicate hides opponent victims but never human victims.
 *
 * Purpose: Protects renderer popup fog filtering contract.
 * When to use: Run after changing visibility predicate handling.
 * Expected outcome: Hidden opponent omitted; human always included.
 * Exceptions: None.
 */
function testFogFiltersOpponentOnly(): void {
  const visible = new Set(['o1']);
  const summary = buildTurnLossSummary({
    killsByDirectFire: [{ victimId: 'h1' }, { victimId: 'o2' }],
    removedUnits: [snap('h1', 'human', 'infantry'), snap('o2', 'opponent', 'naval')],
    resolveDisplayName: (id) => id,
    resolveUnitMeta: meta,
    isVictimVisible: (id, player) => player === 'human' || visible.has(id),
  });
  assert.strictEqual(summary.byOwner.human?.ranged.length, 1);
  assert.strictEqual(summary.byOwner.opponent?.ranged.length ?? 0, 0);
}

/**
 * Verifies removed units without kill edges classify as other losses.
 *
 * Purpose: Protects catch-all bucket for transport/base losses.
 * When to use: Run after changing final removed-unit sweep.
 * Expected outcome: Victim appears in `other`, not combat buckets.
 * Exceptions: None.
 */
function testOtherCatchAllWithoutKillEdge(): void {
  const summary = buildTurnLossSummary({
    removedUnits: [snap('cargo', 'human', 'infantry')],
    resolveDisplayName: (id) => id,
    resolveUnitMeta: meta,
  });
  assert.strictEqual(summary.byOwner.human?.other.length, 1);
  assert.strictEqual(summary.byOwner.human?.ranged.length, 0);
}

/**
 * Verifies AA counter-fire on a striker classifies as return fire, not air strike.
 *
 * Purpose: Protects popup Human Losses label for air lost while striking.
 * When to use: Run after changing air-strike loss classification.
 * Expected outcome: Human air victim in `returnFire`; enemy victim stays in `airStrike`.
 * Exceptions: None.
 */
function testAirStrikerCounterFireIsReturnFire(): void {
  const summary = buildTurnLossSummary({
    killsByAirStrike: [
      { victimId: 'h-air', killerIds: ['o-naval'] },
      { victimId: 'o1', killerIds: ['h-air'] },
    ],
    removedUnits: [snap('h-air', 'human', 'air'), snap('o1', 'opponent', 'armor')],
    resolveDisplayName: (id) => id,
    resolveUnitMeta: (id) =>
      id === 'h-air'
        ? { player: 'human', unitType: 'air' }
        : id === 'o1'
          ? { player: 'opponent', unitType: 'armor' }
          : id === 'o-naval'
            ? { player: 'opponent', unitType: 'naval' }
            : undefined,
  });
  assert.strictEqual(summary.byOwner.human?.returnFire.length, 1);
  assert.strictEqual(summary.byOwner.human?.airStrike.length, 0);
  assert.strictEqual(summary.byOwner.opponent?.airStrike.length, 1);
  assert.strictEqual(summary.byOwner.opponent?.returnFire.length, 0);
}

/**
 * Verifies strategic infra counter attacker loss uses return fire via strike moves.
 *
 * Purpose: Protects classification when kill edges omit the striker.
 * When to use: Run after changing `airStrikeAttackerLossUnitIdsFromMoves` wiring.
 * Expected outcome: Striker id in return fire bucket.
 * Exceptions: None.
 */
function testAttackerLossFromStrikeMovesIsReturnFire(): void {
  const summary = buildTurnLossSummary({
    airStrikeRemovedUnits: [snap('h-air', 'human', 'air')],
    airStrikeAttackerLossUnitIds: ['h-air'],
    resolveDisplayName: (id) => id,
    resolveUnitMeta: (id) => (id === 'h-air' ? { player: 'human', unitType: 'air' } : undefined),
  });
  assert.strictEqual(summary.byOwner.human?.returnFire.length, 1);
  assert.strictEqual(summary.byOwner.human?.airStrike.length, 0);
}

function testMissileStrikePrecedesAirStrike(): void {
  const seatId = AI_SEAT_IDS[0];
  const air = snap('a2-a1', seatId, 'air');
  const summary = buildTurnLossSummary({
    missileStrikeRemovedUnits: [air],
    airStrikeRemovedUnits: [air],
    resolveDisplayName: (id) => id,
    resolveUnitMeta: () => ({ player: seatId, unitType: 'air' }),
  });
  assert.equal(summary.byOwner[seatId]?.missileStrike.length, 1);
  assert.equal(summary.byOwner[seatId]?.airStrike.length, 0);
}

/**
 * Runs all loss summary normalization tests.
 *
 * Purpose: Single entrypoint for the Node test runner manifest.
 * When to use: Invoked at module load by `node dist/main/lossSummaryFromResolution.test.js`.
 * Expected outcome: Throws on first assertion failure; logs pass message when all succeed.
 * Exceptions: Propagates assertion errors from individual cases.
 */
function run(): void {
  testAirPrecedenceOverDirect();
  testAirStrikerCounterFireIsReturnFire();
  testAttackerLossFromStrikeMovesIsReturnFire();
  testMissileStrikePrecedesAirStrike();
  testHumanAiSplit();
  testFogFiltersOpponentOnly();
  testOtherCatchAllWithoutKillEdge();
  console.log('lossSummaryFromResolution.test.ts passed');
}

run();
