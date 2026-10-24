import { computeGridPathCellsPure } from '../../shared/h3GridRangePure';
import { isNeutralBorderHex } from '../../shared/h3Resolutions';
import {
  allocateNextUnitDisplayOrder,
  allocateNextUnitIdOrdinal,
  clearBuildQueueAndProgressForHex,
  dbGetAll,
  dbGetOne,
  dbRun,
  getBuildProgressPointsForHex,
  getKeepBuildingForHex,
  getHexControlMap,
  getSeatRoster,
  getStrategicInfrastructureForHex,
  listAllHexControls,
  listBuildQueueRowsForHex,
  replaceBuildQueueForHex,
  setBuildProgressPointsForHex,
  setKeepBuildingForHex,
  setHexController,
} from '../gameDb';
import { logDebug, logError } from '../logger';
import { isNeutralOwnerId, isSeatId, NEUTRAL_OWNER_ID, type OwnerId, type SeatId } from '../../shared/seatIds';
import { formatStrategicUnitId } from '../../shared/unitIds';
import { DEPLOYMENT_CAP_TYPE_ORDER } from '../productionCaps';
import { readPersistedMaxUnitsPerType } from '../gameDb/gameSizeConfig';
import type { BasicDbOps } from '../gameDb/dbOps';
import { insertUnitRow } from '../gameDb/unitInsert';
import { resolveUnitBirthOrigin } from '../unitOrigin/unitBirthOrigin';
import {
  computeKeepBuildingRefillCount,
  getAvailableBuildUnitTypes,
  type BuildUnitType,
} from '../productionRules';
import { unitCostFor } from '../../shared/gameRules';

/**
 * Documents the `DeployedUnitsByType` type alias (type DeployedUnitsByType).

 * Purpose: Supports maintainability by documenting why `DeployedUnitsByType` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type DeployedUnitsByType = { /**
 * Specifies the contract for the `armor` member (armor?: number;).

 * Contract: Describes stable behavior for callers of `armor` in this codebase.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
armor?: number; /**
 * Specifies the contract for the `infantry` member (infantry?: number;).

 * Contract: Describes stable behavior for callers of `infantry` in this codebase.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
infantry?: number; /**
 * Specifies the contract for the `naval` member (naval?: number;).

 * Contract: Describes stable behavior for callers of `naval` in this codebase.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
naval?: number; /**
 * Specifies the contract for the `air` member (air?: number).

 * Contract: Describes stable behavior for callers of `air` in this codebase.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
air?: number };
/**
 * Documents the `ControlTransition` type alias (type ControlTransition).

 * Purpose: Supports maintainability by documenting why `ControlTransition` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type ControlTransition = { /**
 * Specifies the contract for the `h3Index` member (h3Index: string;).

 * Contract: Describes stable behavior for callers of `h3Index` in this codebase.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
h3Index: string; /**
 * Specifies the contract for the `fromControllerPlayerId` member (fromControllerPlayerId: string | null;).

 * Contract: Describes stable behavior for callers of `fromControllerPlayerId` in this codebase.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
fromControllerPlayerId: string | null; /**
 * Specifies the contract for the `toControllerPlayerId` member (toControllerPlayerId: string | null).

 * Contract: Describes stable behavior for callers of `toControllerPlayerId` in this codebase.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
toControllerPlayerId: string | null };
/**
 * Documents the module-scope binding `CONTROL_UNIT_TYPES` (CONTROL_UNIT_TYPES).

 * Purpose: Supports maintainability by documenting why `CONTROL_UNIT_TYPES` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const CONTROL_UNIT_TYPES = ['infantry', 'armor', 'naval'] as const;
/**
 * Documents the module-scope binding `CONTROL_UNIT_TYPE_SET` (CONTROL_UNIT_TYPE_SET).

 * Purpose: Supports maintainability by documenting why `CONTROL_UNIT_TYPE_SET` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const CONTROL_UNIT_TYPE_SET = new Set<string>(CONTROL_UNIT_TYPES);

/**
 * Database operations on the live game database, shaped for ops-taking helpers.
 *
 * Purpose: Lets production resolve unit birth origins without rebuilding an ops object per unit.
 * When to use: Passed to `resolveUnitBirthOrigin` when spawning produced units.
 * Expected outcome: Delegates to the `gameDb` facade functions.
 * Exceptions: None; underlying SQLite errors propagate.
 */
const GAME_DB_OPS: BasicDbOps = { run: dbRun, getOne: dbGetOne, getAll: dbGetAll };

/**
 * Defines the `currentPlanningTurnNumber` function shape (function currentPlanningTurnNumber(): number).

 * Purpose: Supports maintainability by documenting why `currentPlanningTurnNumber` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function currentPlanningTurnNumber(): number {
  return dbGetOne<{ turnNumber: number }>('SELECT turn_number AS turnNumber FROM turn_state WHERE id = 1')?.turnNumber ?? 1;
}

/**
 * Defines the `spawnProducedUnitsForHex` function shape (function spawnProducedUnitsForHex( h3Index: string, controllerPlayerId: string, unitTypes: BuildUnitType[], unitCountsByPlayerType: Map<string, numb).

 * Purpose: Supports maintainability by documenting why `spawnProducedUnitsForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function spawnProducedUnitsForHex(
  h3Index: string,
  controllerPlayerId: string,
  unitTypes: BuildUnitType[],
  unitCountsByPlayerType: Map<string, number>,
  capReachedByPlayer: Map<SeatId, BuildUnitType[]>,
  maxUnitsPerType: Readonly<Record<BuildUnitType, number>>
): BuildUnitType[] {
  if (unitTypes.length === 0) return [];
  const turnNumber = currentPlanningTurnNumber();
  if (!isSeatId(controllerPlayerId)) {
    throw new Error(`Cannot spawn produced units: unknown controller ${controllerPlayerId}`);
  }
  const owner: SeatId = controllerPlayerId;
  const deployed: BuildUnitType[] = [];
  const capArray = capReachedByPlayer.get(owner) ?? [];
  capReachedByPlayer.set(owner, capArray);
  const capSet = new Set(capArray);
  for (const unitType of unitTypes) {
    const key = `${controllerPlayerId}:${unitType}`;
    const currentCount = unitCountsByPlayerType.get(key) ?? 0;
    const maxCount = maxUnitsPerType[unitType];
    if (currentCount >= maxCount) {
      capSet.add(unitType);
      continue;
    }
    const ordinal = allocateNextUnitIdOrdinal(unitType, owner);
    const unitId = formatStrategicUnitId({ player: owner, unitType, ordinal });
    logDebug('controlAndProduction spawnProducedUnitsForHex', { unitId, unitType, owner, h3Index, turnNumber, ordinal });
    const displayOrder = allocateNextUnitDisplayOrder(unitType, controllerPlayerId);
    insertUnitRow(dbRun, {
      id: unitId,
      player: controllerPlayerId,
      unitType,
      displayOrder,
      h3Index,
      origin: resolveUnitBirthOrigin(GAME_DB_OPS, { unitId, birthH3Index: h3Index }),
      formedTurn: turnNumber + 1,
    });
    unitCountsByPlayerType.set(key, currentCount + 1);
    deployed.push(unitType);
  }
  capArray.splice(0, capArray.length, ...DEPLOYMENT_CAP_TYPE_ORDER.filter((unitType) => capSet.has(unitType)));
  return deployed;
}

/**
 * Reconciles `res_s_control` after combat and movement using per-hex land and air occupancy plus optional traversal hints.
 *
 * Purpose: Grants sole-player hexes to that player, preserves contested hexes until co-occupancy clears, and applies
 * traversal-based capture when a hex ends empty but only one side moved through it this turn.
 * When to use: End of each strategic `ready` finalize (including melee-intercept resume) after unit positions are final.
 * Expected outcome: No control flip when two or more players still have combat units (including air) on the same hex;
 * without that rule, land-only counting would treat e.g. human armor + opponent air as uncontested human land and
 * `destroyAirUnitsWithInvalidBase` would delete the air before a Fight→tactical handoff.
 * Exceptions: None; propagates database errors from helpers.
 */
export function resolveStrategicControlAfterCombatAndMovement(
  traversedHexesByPlayer?: Map<OwnerId, Set<string>>
): ControlTransition[] {
  logDebug('gameActions resolveRes1ControlAfterCombatAndMovement', {
    owners: traversedHexesByPlayer ? [...traversedHexesByPlayer.keys()] : [],
  });
  const transitions: ControlTransition[] = [];
  const occupantRows = dbGetAll<{ h3Index: string; distinctPlayers: number; solePlayer: string | null }>(
    `SELECT h3_index AS h3Index,
            COUNT(DISTINCT player) AS distinctPlayers,
            CASE WHEN COUNT(DISTINCT player) = 1 THEN MIN(player) ELSE NULL END AS solePlayer
     FROM units
     WHERE unit_type IN ('infantry', 'armor', 'naval', 'air')
     GROUP BY h3_index`
  );
  const occupancyByHex = new Map(occupantRows.map((row) => [row.h3Index, row]));
  const currentControlByHex = getHexControlMap();
  const allHexes = new Set<string>([
    ...Array.from(occupancyByHex.keys()),
    ...Array.from(currentControlByHex.keys()),
    ...(traversedHexesByPlayer ? [...traversedHexesByPlayer.values()].flatMap((hexes) => [...hexes]) : []),
  ]);
  for (const h3Index of allHexes) {
    const occupied = occupancyByHex.get(h3Index);
    const currentController = currentControlByHex.get(h3Index) ?? null;
    let nextController: string | null = null;
    if (occupied && occupied.distinctPlayers === 1 && occupied.solePlayer) {
      nextController = occupied.solePlayer;
    } else if (!occupied && traversedHexesByPlayer) {
      nextController = emptyHexController(h3Index, traversedHexesByPlayer);
    } else {
      continue;
    }
    if (!nextController) continue;
    if (currentController === nextController) continue;
    setHexController(h3Index, nextController);
    transitions.push({
      h3Index,
      fromControllerPlayerId: currentController,
      toControllerPlayerId: nextController,
    });
    if (currentController !== null && currentController !== nextController) {
      clearBuildQueueAndProgressForHex(h3Index);
    }
  }
  return transitions;
}

/**
 * Runs the post-control production pulse for every controlled hex with urban capacity.
 *
 * Purpose: Accrues stored+urban points once per hex, spends the build queue head-first under costs and
 * deployment caps, and when Keep building is armed refills the empty queue in-loop from leftover points
 * until `$` or a cap stalls (leaving a planning residue when points cannot afford another unit).
 * When to use: After control resolution in the Ready pipeline, before returning deployed/cap summaries.
 * Expected outcome: Queues and stored points persisted; units spawned; Keep building cleared only when an
 * armed type is ineligible at refill time; iteration guard logs an error if the refill/spend loop exceeds
 * its safety cap.
 * Exceptions: None (DB/spawn failures surface from callees).
 */
export function processProductionAfterControlResolution(): {
  deployedByPlayer: ReadonlyMap<SeatId, DeployedUnitsByType>;
  capReachedByPlayer: ReadonlyMap<SeatId, BuildUnitType[]>;
} {
  logDebug('gameActions processProductionAfterControlResolution');
  const maxUnitsPerType = readPersistedMaxUnitsPerType({ run: dbRun, getOne: dbGetOne });
  const deployedByPlayer = new Map<SeatId, DeployedUnitsByType>();
  const capReachedByPlayer = new Map<SeatId, BuildUnitType[]>();
  for (const seat of getSeatRoster()) {
    deployedByPlayer.set(seat.seatId, {});
    capReachedByPlayer.set(seat.seatId, []);
  }
  const unitCountsByPlayerType = new Map<string, number>();
  const unitCountRows = dbGetAll<{ player: string; unitType: BuildUnitType; count: number }>(
    `SELECT player, unit_type AS unitType, COUNT(*) AS count
     FROM units
     GROUP BY player, unit_type`
  );
  for (const row of unitCountRows) {
    unitCountsByPlayerType.set(`${row.player}:${row.unitType}`, row.count);
  }
  const controls = listAllHexControls().filter((row) => row.controllerPlayerId !== null);
  for (const control of controls) {
    const controllerPlayerId = control.controllerPlayerId;
    if (!controllerPlayerId || !isSeatId(controllerPlayerId)) continue;
    const { urbanHexCount, seaportCount, airportCount } = getStrategicInfrastructureForHex(control.h3Index);
    if (urbanHexCount <= 0) continue;

    const queueRows = listBuildQueueRowsForHex(control.h3Index);
    const standingAtStart = getKeepBuildingForHex(control.h3Index);
    if (queueRows.length === 0 && !(standingAtStart.keepBuilding && standingAtStart.keepBuildingUnitType)) {
      continue;
    }

    const neutralBorder = isNeutralBorderHex(control.h3Index);
    const storedPoints = getBuildProgressPointsForHex(control.h3Index);
    const capArray = capReachedByPlayer.get(controllerPlayerId) ?? [];
    capReachedByPlayer.set(controllerPlayerId, capArray);
    const capSet = new Set(capArray);
    const queueWorking = queueRows
      .map((row) => ({
        id: row.id,
        queueIndex: row.queueIndex,
        unitType: row.unitType,
        remainingCount: row.remainingCount,
      }))
      .sort((a, b) => a.queueIndex - b.queueIndex || a.id - b.id);
    let points = Math.max(0, Math.trunc(storedPoints)) + (neutralBorder ? 0 : Math.max(0, Math.trunc(urbanHexCount)));
    const simulatedCountsByType = new Map<BuildUnitType, number>();
    for (const unitType of DEPLOYMENT_CAP_TYPE_ORDER) {
      simulatedCountsByType.set(unitType, unitCountsByPlayerType.get(`${controllerPlayerId}:${unitType}`) ?? 0);
    }
    const spawnedUnitTypes: BuildUnitType[] = [];
    let blockedByCapType: BuildUnitType | null = null;
    let lastDepletedUnitType: BuildUnitType | null = null;
    const availableTypes = getAvailableBuildUnitTypes(
      neutralBorder ? 0 : urbanHexCount,
      seaportCount,
      airportCount
    );
    const maxLoopIterations = 10_000;
    let loopIterations = 0;

    while (loopIterations < maxLoopIterations) {
      loopIterations += 1;
      if (queueWorking.length === 0) {
        const standing = getKeepBuildingForHex(control.h3Index);
        if (!standing.keepBuilding || !standing.keepBuildingUnitType) break;
        if (!availableTypes.includes(standing.keepBuildingUnitType)) {
          setKeepBuildingForHex(control.h3Index, false, null);
          logDebug('gameActions processProductionAfterControlResolution: cleared ineligible Keep building', {
            h3Index: control.h3Index,
            unitType: standing.keepBuildingUnitType,
          });
          break;
        }
        const refillType = standing.keepBuildingUnitType;
        const refillCount = computeKeepBuildingRefillCount(refillType, points);
        queueWorking.push({
          id: -1,
          queueIndex: 0,
          unitType: refillType,
          remainingCount: refillCount,
        });
        logDebug('gameActions processProductionAfterControlResolution: Keep building refill', {
          h3Index: control.h3Index,
          unitType: refillType,
          refillCount,
          availablePoints: points,
        });
        continue;
      }

      const entry = queueWorking[0]!;
      const cost = unitCostFor(entry.unitType);
      const currentCount = simulatedCountsByType.get(entry.unitType) ?? 0;
      const maxCount = maxUnitsPerType[entry.unitType];
      if (currentCount >= maxCount) {
        blockedByCapType = entry.unitType;
        capSet.add(entry.unitType);
        break;
      }
      if (points < cost) break;
      const maxByPoints = Math.floor(points / cost);
      const maxByCap = maxCount - currentCount;
      const built = Math.min(entry.remainingCount, maxByPoints, maxByCap);
      if (built <= 0) break;
      entry.remainingCount -= built;
      points -= built * cost;
      simulatedCountsByType.set(entry.unitType, currentCount + built);
      for (let n = 0; n < built; n++) spawnedUnitTypes.push(entry.unitType);
      if (entry.remainingCount <= 0) {
        lastDepletedUnitType = entry.unitType;
        queueWorking.shift();
      }
    }
    if (loopIterations >= maxLoopIterations) {
      logError('gameActions processProductionAfterControlResolution: Keep building loop iteration guard hit', {
        h3Index: control.h3Index,
        loopIterations,
      });
    }

    for (let i = 0; i < queueWorking.length; i++) {
      queueWorking[i]!.queueIndex = i;
    }
    replaceBuildQueueForHex(
      control.h3Index,
      queueWorking.map((entry) => ({ unitType: entry.unitType, remainingCount: entry.remainingCount }))
    );
    setBuildProgressPointsForHex(control.h3Index, points);
    const standingAfter = getKeepBuildingForHex(control.h3Index);
    if (standingAfter.keepBuilding) {
      const confirmedType =
        (queueWorking.length > 0 ? queueWorking[queueWorking.length - 1]!.unitType : null) ??
        lastDepletedUnitType ??
        standingAfter.keepBuildingUnitType;
      if (confirmedType) {
        setKeepBuildingForHex(control.h3Index, true, confirmedType);
      }
    }
    const deployedForHex = spawnProducedUnitsForHex(
      control.h3Index,
      controllerPlayerId,
      spawnedUnitTypes,
      unitCountsByPlayerType,
      capReachedByPlayer,
      maxUnitsPerType
    );
    const deployedForController = deployedByPlayer.get(controllerPlayerId) ?? {};
    deployedByPlayer.set(controllerPlayerId, deployedForController);
    for (const unitType of deployedForHex) {
      deployedForController[unitType] = (deployedForController[unitType] ?? 0) + 1;
    }
    logDebug('gameActions processProductionAfterControlResolution: processed hex', {
      h3Index: control.h3Index,
      controllerPlayerId,
      urbanHexCount,
      queueBeforeCount: queueRows.length,
      queueAfterCount: queueWorking.length,
      storedPointsAfter: points,
      spawnedCount: deployedForHex.length,
      blockedByCapType,
      loopIterations,
      cappedTypesForController:
        DEPLOYMENT_CAP_TYPE_ORDER.filter((unitType) => capSet.has(unitType)).join(', ') || 'none',
    });
    capArray.splice(0, capArray.length, ...DEPLOYMENT_CAP_TYPE_ORDER.filter((unitType) => capSet.has(unitType)));
  }
  return { deployedByPlayer, capReachedByPlayer };
}

/**
 * Defines the `collectTraversedHexesByPlayer` function shape (export function collectTraversedHexesByPlayer( orders: Array<{ unitId: string; toH3Index: string }>, unitsBeforeMove: Array<{ id: string; player: string;).

 * Purpose: Supports maintainability by documenting why `collectTraversedHexesByPlayer` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function collectTraversedHexesByPlayer(
  orders: Array<{ unitId: string; toH3Index: string }>,
  unitsBeforeMove: Array<{ id: string; player: string; h3Index: string; unitType: string }>
): Map<OwnerId, Set<string>> {
  logDebug('gameActions collectTraversedHexesByPlayer', {
    orderCount: orders.length,
    unitCount: unitsBeforeMove.length,
  });
  const traversed = new Map<OwnerId, Set<string>>();
  const byId = new Map(unitsBeforeMove.map((u) => [u.id, u]));
  for (const order of orders) {
    const unit = byId.get(order.unitId);
    const owner = unit ? traversalOwner(unit.player, unit.unitType) : null;
    if (!unit || !owner) continue;
    const hexes = traversed.get(owner) ?? new Set<string>();
    traversed.set(owner, hexes);
    const path = computeGridPathCellsPure(unit.h3Index, order.toH3Index);
    if (path === null) {
      hexes.add(unit.h3Index);
      hexes.add(order.toH3Index);
      continue;
    }
    for (const h3 of path) hexes.add(h3);
  }
  return traversed;
}

/**
 * The owner whose movement can capture hexes, or null when this unit cannot.
 *
 * Purpose: Seats capture with infantry, armor, and naval. Neutral captures with infantry and armor only.
 * When to use: While recording one order's path.
 * Expected outcome: The owner id, or null for air, Neutral naval, and any other owner.
 * Exceptions: None.
 */
function traversalOwner(player: string, unitType: string): OwnerId | null {
  if (isSeatId(player)) return CONTROL_UNIT_TYPE_SET.has(unitType) ? player : null;
  if (isNeutralOwnerId(player)) return unitType === 'infantry' || unitType === 'armor' ? NEUTRAL_OWNER_ID : null;
  return null;
}

/**
 * Chooses the controller of an empty hex from who traversed it.
 *
 * Purpose: Neutral land capture wins over a seat. Otherwise one seat captures and two seats leave the hex alone.
 * When to use: After combat, for a hex with no occupant.
 * Expected outcome: Neutral, the only seat, or null when the hex should keep its controller.
 * Exceptions: None.
 */
function emptyHexController(h3Index: string, traversed: Map<OwnerId, Set<string>>): string | null {
  if (traversed.get(NEUTRAL_OWNER_ID)?.has(h3Index)) return NEUTRAL_OWNER_ID;
  const seats = [...traversed.entries()].filter(([owner, hexes]) => owner !== NEUTRAL_OWNER_ID && hexes.has(h3Index));
  return seats.length === 1 ? seats[0]![0] : null;
}
