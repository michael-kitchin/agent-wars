/**
 * Shared DB setup and teardown for tactical battle snapshot and session integration tests.
 */

import { afterEach } from 'node:test';
import { dbGetOne, dbRun } from '../../gameDb';
import { clearStrategicPreviousHexMemory } from '../../strategicUnitPreviousHex';
import { withTempGameDb } from '../../testSupport/withTempGameDb';
import { endTacticalBattleSession } from '../tacticalBattleSession';

/**
 * Registers `node:test` cleanup that clears strategic previous-hex memory and ends any in-memory tactical session.
 *
 * Contract: Safe to call once per tactical DB test file; mirrors prior per-file `afterEach` duplication.
 * When to use: Tactical snapshot/session tests that mutate `turn_state`, `units`, or main-process tactical globals.
 * Expected outcome: Each test case starts without leaked tactical session state or previous-hex side effects.
 * Exceptions: None.
 */
export function tacticalDbFixtureRegisterDefaultAfterEach(): void {
  afterEach(() => {
    clearStrategicPreviousHexMemory();
    endTacticalBattleSession();
  });
}

/**
 * Forces the seeded game DB into strategic planning phase for tactical start eligibility.
 *
 * Contract: Updates `turn_state` row `id = 1`; assumes default fixture schema from `withTempGameDb`.
 * When to use: Tactical snapshot tests that require planning-gated `computeTacticalBattleSnapshot` success paths.
 * Expected outcome: `turn_state.phase` is `planning`.
 * Exceptions: None when the temp DB was initialized correctly.
 */
export function tacticalDbFixtureSetStrategicPlanningPhase(): void {
  dbRun(`UPDATE turn_state SET phase = 'planning' WHERE id = 1`);
}

/**
 * Co-locates the given human and opponent parent units on one strategic hex to create a contested cell.
 *
 * Contract: Updates `units.h3_index` for both ids; does not validate that `targetH3` is strategic.
 * When to use: Tactical placement tests that need both players present in the enclosing hex.
 * Expected outcome: Both units report `h3_index = targetH3` for subsequent snapshot queries.
 * Exceptions: None.
 */
export function tacticalDbFixtureColocateHumanOpponentUnits(targetH3: string, humanId: string, opponentId: string): void {
  dbRun(`UPDATE units SET h3_index = ? WHERE id = ? OR id = ?`, [targetH3, humanId, opponentId]);
}

/**
 * Loads the first human unit (id + strategic hex) and first opponent unit id from the temp strategic DB.
 *
 * Contract: Throws if either seed row is missing; callers must run inside `withTempGameDb`.
 * When to use: Fixture blocks that need stable human/opponent ids without hard-coding fixture rows.
 * Expected outcome: Returns ids suitable for `tacticalDbFixtureColocateHumanOpponentUnits`.
 * Exceptions: Error when seed data is absent.
 */
export function tacticalDbFixtureLoadDefaultHumanOpponentPlacement(): {
  humanId: string;
  opponentId: string;
  humanStrategicH3: string;
} {
  const human = dbGetOne<{ id: string; h3Index: string }>(
    `SELECT id, h3_index AS h3Index FROM units WHERE player = 'human' LIMIT 1`
  );
  const opponent = dbGetOne<{ id: string }>(`SELECT id FROM units WHERE player = 'opponent' LIMIT 1`);
  if (!human || !opponent) {
    throw new Error('tacticalDbFixtureLoadDefaultHumanOpponentPlacement: missing seed human or opponent unit');
  }
  return { humanId: human.id, opponentId: opponent.id, humanStrategicH3: human.h3Index };
}

/**
 * Runs `fn` inside a disposable game DB after planning phase + contested co-location on the human strategic hex.
 *
 * Contract: Wraps `withTempGameDb`; mutates units/turn_state for the duration of `fn` only.
 * When to use: Tactical integration tests that share the common “both sides on one strategic during planning” prelude.
 * Expected outcome: `fn` receives the strategic target hex and both unit ids used for placement.
 * Exceptions: Propagates errors from `withTempGameDb` or missing seed rows.
 */
export function tacticalDbFixtureWithTempDbContestedPlanning(
  labelPrefix: string,
  fn: (ctx: { targetStrategicH3: string; humanId: string; opponentId: string }) => void
): void {
  withTempGameDb(labelPrefix, () => {
    tacticalDbFixtureSetStrategicPlanningPhase();
    const { humanId, opponentId, humanStrategicH3 } = tacticalDbFixtureLoadDefaultHumanOpponentPlacement();
    tacticalDbFixtureColocateHumanOpponentUnits(humanStrategicH3, humanId, opponentId);
    fn({ targetStrategicH3: humanStrategicH3, humanId, opponentId });
  });
}
