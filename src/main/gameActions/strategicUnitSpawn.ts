/**
 * Creates a strategic unit and spawns the units a hex just produced.
 *
 * Purpose: Production and later hiring share one insert path, including id and display counters.
 * When to use: After the production loop decides which unit types to spawn. Pass the turn being resolved.
 * Expected outcome: New unit rows, and a Neutral hold order for each missile. Counters advance once per unit.
 * Exceptions: `createStrategicUnit` throws when asked to make a mercenary missile. An unknown controller throws from the spawn helper.
 */

import { isMissileUnitType } from '../../shared/missileRules';
import { isSeatId, type SeatId } from '../../shared/seatIds';
import { formatStrategicUnitId } from '../../shared/unitIds';
import type { BuildUnitType } from '../productionRules';
import { DEPLOYMENT_CAP_TYPE_ORDER } from '../productionCaps';
import {
  allocateNextUnitDisplayOrder,
  allocateNextUnitIdOrdinal,
} from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { insertUnitRow } from '../gameDb/unitInsert';
import { logDebug, logError } from '../logger';
import { insertMissileHoldOrder } from '../tools/missileHoldOrder';
import { resolveUnitBirthOrigin } from '../unitOrigin/unitBirthOrigin';

/**
 * Inserts one strategic unit and returns its id.
 *
 * Purpose: Id and display counters must advance in the same order production has always used.
 * When to use: Once per spawned or hired unit. `turnNumber` is the turn being resolved, not the next one.
 * Expected outcome: The new id. `formedTurn` is `turnNumber + 1`. A missile also gets a hold order dated `turnNumber`.
 * Exceptions: Throws when `isMercenary` is true and the type is a missile. SQLite errors propagate.
 */
export function createStrategicUnit(args: {
  readonly owner: SeatId;
  readonly unitType: BuildUnitType;
  readonly h3Index: string;
  readonly turnNumber: number;
  readonly isMercenary: boolean;
}): string {
  logDebug('gameActions createStrategicUnit', {
    owner: args.owner,
    unitType: args.unitType,
    h3Index: args.h3Index,
    turnNumber: args.turnNumber,
    isMercenary: args.isMercenary,
  });
  if (args.isMercenary && isMissileUnitType(args.unitType)) {
    const error = new Error('A missile cannot be a mercenary');
    logError('gameActions createStrategicUnit: rejected mercenary missile', { unitType: args.unitType, error });
    throw error;
  }
  const ordinal = allocateNextUnitIdOrdinal(args.unitType, args.owner);
  const unitId = formatStrategicUnitId({ player: args.owner, unitType: args.unitType, ordinal });
  const displayOrder = allocateNextUnitDisplayOrder(args.unitType, args.owner);
  insertUnitRow(gameDbOps.run, {
    id: unitId,
    player: args.owner,
    unitType: args.unitType,
    displayOrder,
    h3Index: args.h3Index,
    origin: resolveUnitBirthOrigin(gameDbOps, { unitId, birthH3Index: args.h3Index }),
    formedTurn: args.turnNumber + 1,
    isMercenary: args.isMercenary,
  });
  if (isMissileUnitType(args.unitType)) {
    insertMissileHoldOrder({
      playerId: args.owner,
      unitId,
      h3Index: args.h3Index,
      createdTurn: args.turnNumber,
    });
  }
  return unitId;
}

/**
 * Spawns the ordinary units one hex produced, respecting deployment caps.
 *
 * Purpose: The production loop decides the types. This writes the rows and records which types hit their cap.
 * When to use: After spending a hex's queue. `turnNumber` is the turn being resolved.
 * Expected outcome: The types that were actually inserted. A type already at its cap is recorded and skipped.
 * Exceptions: Throws when `controllerPlayerId` is not a seat. SQLite errors propagate.
 */
export function spawnProducedUnitsForHex(args: {
  readonly h3Index: string;
  readonly controllerPlayerId: string;
  readonly unitTypes: readonly BuildUnitType[];
  readonly unitCountsByPlayerType: Map<string, number>;
  readonly capReachedByPlayer: Map<SeatId, BuildUnitType[]>;
  readonly maxUnitsPerType: Readonly<Record<BuildUnitType, number>>;
  readonly turnNumber: number;
}): BuildUnitType[] {
  logDebug('gameActions spawnProducedUnitsForHex', {
    h3Index: args.h3Index,
    controllerPlayerId: args.controllerPlayerId,
    unitCount: args.unitTypes.length,
    turnNumber: args.turnNumber,
  });
  if (args.unitTypes.length === 0) return [];
  if (!isSeatId(args.controllerPlayerId)) {
    throw new Error(`Cannot spawn produced units: unknown controller ${args.controllerPlayerId}`);
  }
  const owner: SeatId = args.controllerPlayerId;
  const deployed: BuildUnitType[] = [];
  const capArray = args.capReachedByPlayer.get(owner) ?? [];
  args.capReachedByPlayer.set(owner, capArray);
  const capSet = new Set(capArray);
  for (const unitType of args.unitTypes) {
    const key = `${args.controllerPlayerId}:${unitType}`;
    const currentCount = args.unitCountsByPlayerType.get(key) ?? 0;
    const maxCount = args.maxUnitsPerType[unitType];
    if (currentCount >= maxCount) {
      capSet.add(unitType);
      continue;
    }
    const unitId = createStrategicUnit({
      owner,
      unitType,
      h3Index: args.h3Index,
      turnNumber: args.turnNumber,
      isMercenary: false,
    });
    logDebug('controlAndProduction spawnProducedUnitsForHex', {
      unitId,
      unitType,
      owner,
      h3Index: args.h3Index,
      turnNumber: args.turnNumber,
    });
    args.unitCountsByPlayerType.set(key, currentCount + 1);
    deployed.push(unitType);
  }
  capArray.splice(0, capArray.length, ...DEPLOYMENT_CAP_TYPE_ORDER.filter((unitType) => capSet.has(unitType)));
  return deployed;
}
