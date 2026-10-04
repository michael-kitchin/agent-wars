import * as assert from 'assert';
import type { TacticalCommitResolutionPlayback } from '../../shared/ipc/tacticalPlaybackTypes';
import { tacticalKillEdgesForStrategicStyleTurnUpdate } from '../../shared/tacticalToastKillSlice';

/**
 * Verifies tactical toast `kills` assembly omits air-strike edges so summaries mirror strategic Ready.
 *
 * Purpose: Locks the contract that air strike victims must not appear as pseudo-melee or extra kill lines.
 * When to use: Regression coverage after edits to `tacticalKillEdgesForStrategicStyleTurnUpdate`.
 * Expected outcome: Ranged direct and return-fire edges are returned; air strike victims stay out of this list.
 * Exceptions: Assertion failure on contract drift.
 */
function testOmitsAirStrikeVictims(): void {
  const playback: TacticalCommitResolutionPlayback = {
    humanMoves: [],
    killsByDirectFire: [{ victimId: 'v-ranged', killerIds: ['a1'] }],
    killsByAirStrike: [{ victimId: 'v-air', killerIds: ['a2'] }],
    killsByReturnFire: [{ victimId: 'v-return', killerIds: ['a3'] }],
  };
  const edges = tacticalKillEdgesForStrategicStyleTurnUpdate(playback);
  assert.strictEqual(edges.length, 2);
  assert.ok(edges.some((e) => e.victimId === 'v-ranged'));
  assert.ok(edges.some((e) => e.victimId === 'v-return'));
  assert.ok(!edges.some((e) => e.victimId === 'v-air'));
}

/**
 * Verifies melee kill edges are folded into the tactical toast `kills` edge list like strategic Ready.
 *
 * Purpose: Ensures post-support melee casualties surface on melee summary lines in the renderer.
 * When to use: Regression coverage after edits to `tacticalKillEdgesForStrategicStyleTurnUpdate`.
 * Expected outcome: `killsByMelee` entries appear in the combined edge list; air strike rows still excluded.
 * Exceptions: Assertion failure on contract drift.
 */
function testIncludesMeleeEdges(): void {
  const playback: TacticalCommitResolutionPlayback = {
    humanMoves: [],
    killsByDirectFire: [{ victimId: 'v-r', killerIds: ['a1'] }],
    killsByMelee: [{ victimId: 'v-m', killerIds: ['a2'] }],
    killsByAirStrike: [{ victimId: 'v-air', killerIds: ['a3'] }],
  };
  const edges = tacticalKillEdgesForStrategicStyleTurnUpdate(playback);
  assert.strictEqual(edges.length, 2);
  assert.ok(edges.some((e) => e.victimId === 'v-r'));
  assert.ok(edges.some((e) => e.victimId === 'v-m'));
  assert.ok(!edges.some((e) => e.victimId === 'v-air'));
}

const tests: { name: string; fn: () => void }[] = [
  { name: 'tacticalKillEdgesForStrategicStyleTurnUpdate omits air strike', fn: testOmitsAirStrikeVictims },
  { name: 'tacticalKillEdgesForStrategicStyleTurnUpdate includes melee', fn: testIncludesMeleeEdges },
];

for (const t of tests) {
  try {
    t.fn();
    console.log(`OK ${t.name}`);
  } catch (e) {
    console.error(`FAIL ${t.name}`, e);
    process.exit(1);
  }
}
