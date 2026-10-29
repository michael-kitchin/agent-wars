/**
 * Which side owns each fortified cell in a battle footprint.
 *
 * Purpose: Placement, movement, and drawing share one record of fortified cells.
 * When to use: When a battle snapshot is built, and again when a beat ends.
 * Expected outcome: A cell is present only when its row is fortified and its parent hex has an owner.
 * Exceptions: None.
 */

import type { TacticalFeatureOverrideRow } from '../gameDb/controlInfrastructure';
import { getHexController, listTacticalFeatureOverridesForGame } from '../gameDb';
import { logDebug, logTrace } from '../logger';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { isOwnerId, type OwnerId } from '../../shared/seatIds';

/**
 * Maps each fortified footprint cell to the controller of its parent hex.
 *
 * Purpose: The record is pure, so tests can pass rows without a database.
 * When to use: While building a battle snapshot, and from `withFortificationOwnersFromGameDb`.
 * Expected outcome: Core and margin cells are included. An unfortified row, a cell outside the footprint, and a parent with no owner are left out.
 * Exceptions: None.
 */
export function buildTacticalFortificationOwnerRecord(args: {
  readonly rows: readonly TacticalFeatureOverrideRow[];
  readonly footprint: readonly string[];
  readonly controllerOf: (strategicH3: string) => string | null;
}): Record<string, OwnerId> {
  const footprint = new Set(args.footprint);
  const ownerByH3: Record<string, OwnerId> = {};
  for (const row of args.rows) {
    if (!row.isFortified || !footprint.has(row.h3Index)) continue;
    const owner = args.controllerOf(row.parentH3Index);
    if (owner === null || !isOwnerId(owner)) continue;
    ownerByH3[row.h3Index] = owner;
  }
  logTrace('buildTacticalFortificationOwnerRecord', { cellCount: Object.keys(ownerByH3).length });
  return ownerByH3;
}

/**
 * Copies a battle snapshot with the fortification owners read from the open match.
 *
 * Purpose: A beat starts and ends with the cells that are still fortified.
 * When to use: When the snapshot is first built, and when `applyHumanTacticalDraftBeatInStrategicOrder` advances the turn.
 * Expected outcome: The field is set when at least one cell is fortified. It is omitted when none are.
 * Exceptions: Propagates SQLite errors from the cell and controller reads.
 */
export function withFortificationOwnersFromGameDb(battle: TacticalBattleSnapshot): TacticalBattleSnapshot {
  const ownerByH3 = buildTacticalFortificationOwnerRecord({
    rows: listTacticalFeatureOverridesForGame(),
    footprint: battle.tacticalChildH3Indexes,
    controllerOf: getHexController,
  });
  const cellCount = Object.keys(ownerByH3).length;
  logDebug('withFortificationOwnersFromGameDb', { battleId: battle.battleId, cellCount });
  if (cellCount === 0) {
    const { tacticalFortificationOwnerByH3: omitted, ...rest } = battle;
    void omitted;
    return rest;
  }
  return { ...battle, tacticalFortificationOwnerByH3: ownerByH3 };
}
