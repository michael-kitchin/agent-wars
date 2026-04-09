import { gridPathCells } from 'h3-js';
import {
  allocateNextUnitDisplayOrder,
  clearBuildQueueAndProgressForHex,
  dbGetAll,
  dbGetOne,
  dbRun,
  getBuildProgressPointsForHex,
  getRes1InfrastructureForHex,
  listAllHexControls,
  listBuildQueueRowsForHex,
  replaceBuildQueueForHex,
  setBuildProgressPointsForHex,
  setHexController,
} from '../gameDb';
import { logDebug } from '../logger';
import { DEPLOYMENT_CAP_TYPE_ORDER, MAX_UNITS_PER_TYPE } from '../productionCaps';
import { UNIT_COST_BY_TYPE, type BuildUnitType } from '../productionRules';

type DeployedUnitsByType = { armor?: number; infantry?: number; naval?: number; air?: number };
type ControlTransition = { h3Index: string; fromControllerPlayerId: string | null; toControllerPlayerId: string | null };
type DeploymentCapReachedByPlayer = { human: BuildUnitType[]; opponent: BuildUnitType[] };
const CONTROL_UNIT_TYPES = ['infantry', 'armor', 'naval'] as const;
const CONTROL_UNIT_TYPE_SET = new Set<string>(CONTROL_UNIT_TYPES);

function currentPlanningTurnNumber(): number {
  return dbGetOne<{ turnNumber: number }>('SELECT turn_number AS turnNumber FROM turn_state WHERE id = 1')?.turnNumber ?? 1;
}

function spawnProducedUnitsForHex(
  h3Index: string,
  controllerPlayerId: string,
  unitTypes: BuildUnitType[],
  unitCountsByPlayerType: Map<string, number>,
  capReachedByPlayer: DeploymentCapReachedByPlayer
): BuildUnitType[] {
  if (unitTypes.length === 0) return [];
  const turnNumber = currentPlanningTurnNumber();
  const seqRow = dbGetOne<{ value: string }>("SELECT value FROM game_config WHERE key = 'production_unit_spawn_sequence'");
  let sequence = seqRow ? parseInt(seqRow.value, 10) : 0;
  if (!Number.isFinite(sequence)) sequence = 0;
  const deployed: BuildUnitType[] = [];
  const capArray = controllerPlayerId === 'opponent' ? capReachedByPlayer.opponent : capReachedByPlayer.human;
  const capSet = new Set(capArray);
  for (const unitType of unitTypes) {
    const key = `${controllerPlayerId}:${unitType}`;
    const currentCount = unitCountsByPlayerType.get(key) ?? 0;
    const maxCount = MAX_UNITS_PER_TYPE[unitType];
    if (currentCount >= maxCount) {
      capSet.add(unitType);
      continue;
    }
    sequence += 1;
    const unitId = `${controllerPlayerId}-${unitType}-prod-${turnNumber}-${sequence}`;
    const displayOrder = allocateNextUnitDisplayOrder(unitType);
    dbRun('INSERT INTO units (id, player, unit_type, display_order, h3_index) VALUES (?, ?, ?, ?, ?)', [
      unitId,
      controllerPlayerId,
      unitType,
      displayOrder,
      h3Index,
    ]);
    unitCountsByPlayerType.set(key, currentCount + 1);
    deployed.push(unitType);
  }
  capArray.splice(0, capArray.length, ...DEPLOYMENT_CAP_TYPE_ORDER.filter((unitType) => capSet.has(unitType)));
  dbRun(`INSERT OR REPLACE INTO game_config (key, value) VALUES ('production_unit_spawn_sequence', ?)`, [String(sequence)]);
  return deployed;
}

/**
 * Why this exists:
 *     Resolves post-resolution res-1 control ownership from control-capable occupancy and movement traversal.
 * When to use:
 *     Called once per turn after movement/combat outcomes are applied and before production processing.
 * What to expect:
 *     Returns persisted ownership transitions where infantry/armor/naval exclusively occupy or uniquely traversed an empty hex.
 */
export function resolveRes1ControlAfterCombatAndMovement(
  traversedHexesByPlayer?: Record<'human' | 'opponent', Set<string>>
): ControlTransition[] {
  logDebug('gameActions resolveRes1ControlAfterCombatAndMovement', {
    humanTraversedHexes: traversedHexesByPlayer?.human?.size ?? 0,
    opponentTraversedHexes: traversedHexesByPlayer?.opponent?.size ?? 0,
  });
  const transitions: ControlTransition[] = [];
  const occupantRows = dbGetAll<{ h3Index: string; distinctPlayers: number; solePlayer: string | null }>(
    `SELECT h3_index AS h3Index,
            COUNT(DISTINCT player) AS distinctPlayers,
            CASE WHEN COUNT(DISTINCT player) = 1 THEN MIN(player) ELSE NULL END AS solePlayer
     FROM units
     WHERE unit_type IN ('infantry', 'armor', 'naval')
     GROUP BY h3_index`
  );
  const occupancyByHex = new Map(occupantRows.map((row) => [row.h3Index, row]));
  const currentControlByHex = new Map(listAllHexControls().map((row) => [row.h3Index, row.controllerPlayerId]));
  const allHexes = new Set<string>([
    ...Array.from(occupancyByHex.keys()),
    ...Array.from(currentControlByHex.keys()),
    ...(traversedHexesByPlayer ? [...traversedHexesByPlayer.human, ...traversedHexesByPlayer.opponent] : []),
  ]);
  for (const h3Index of allHexes) {
    const occupied = occupancyByHex.get(h3Index);
    const currentController = currentControlByHex.get(h3Index) ?? null;
    let nextController: string | null = null;
    if (occupied && occupied.distinctPlayers === 1 && occupied.solePlayer) {
      nextController = occupied.solePlayer;
    } else if (!occupied && traversedHexesByPlayer) {
      const humanTraversed = traversedHexesByPlayer.human.has(h3Index);
      const opponentTraversed = traversedHexesByPlayer.opponent.has(h3Index);
      if (humanTraversed !== opponentTraversed) {
        nextController = humanTraversed ? 'human' : 'opponent';
      }
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

export function processProductionAfterControlResolution(): {
  deployedByPlayer: { human: DeployedUnitsByType; opponent: DeployedUnitsByType };
  capReachedByPlayer: DeploymentCapReachedByPlayer;
} {
  logDebug('gameActions processProductionAfterControlResolution');
  const deployedByPlayer: { human: DeployedUnitsByType; opponent: DeployedUnitsByType } = {
    human: {},
    opponent: {},
  };
  const capReachedByPlayer: DeploymentCapReachedByPlayer = { human: [], opponent: [] };
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
    if (!controllerPlayerId) continue;
    const queueRows = listBuildQueueRowsForHex(control.h3Index);
    if (queueRows.length === 0) continue;
    const { urbanHexCount } = getRes1InfrastructureForHex(control.h3Index);
    if (urbanHexCount <= 0) continue;
    const storedPoints = getBuildProgressPointsForHex(control.h3Index);
    const capArray = controllerPlayerId === 'opponent' ? capReachedByPlayer.opponent : capReachedByPlayer.human;
    const capSet = new Set(capArray);
    const queueWorking = queueRows
      .map((row) => ({
        id: row.id,
        queueIndex: row.queueIndex,
        unitType: row.unitType,
        remainingCount: row.remainingCount,
      }))
      .sort((a, b) => a.queueIndex - b.queueIndex || a.id - b.id);
    let points = Math.max(0, Math.trunc(storedPoints)) + Math.max(0, Math.trunc(urbanHexCount));
    const simulatedCountsByType = new Map<BuildUnitType, number>();
    for (const unitType of DEPLOYMENT_CAP_TYPE_ORDER) {
      simulatedCountsByType.set(unitType, unitCountsByPlayerType.get(`${controllerPlayerId}:${unitType}`) ?? 0);
    }
    const spawnedUnitTypes: BuildUnitType[] = [];
    let blockedByCapType: BuildUnitType | null = null;
    const idx = 0;
    while (idx < queueWorking.length) {
      const entry = queueWorking[idx]!;
      const cost = UNIT_COST_BY_TYPE[entry.unitType];
      if (points < cost) break;
      const currentCount = simulatedCountsByType.get(entry.unitType) ?? 0;
      const maxCount = MAX_UNITS_PER_TYPE[entry.unitType];
      if (currentCount >= maxCount) {
        blockedByCapType = entry.unitType;
        capSet.add(entry.unitType);
        break;
      }
      const maxByPoints = Math.floor(points / cost);
      const maxByCap = maxCount - currentCount;
      const built = Math.min(entry.remainingCount, maxByPoints, maxByCap);
      if (built <= 0) break;
      entry.remainingCount -= built;
      points -= built * cost;
      simulatedCountsByType.set(entry.unitType, currentCount + built);
      for (let n = 0; n < built; n++) spawnedUnitTypes.push(entry.unitType);
      if (entry.remainingCount <= 0) {
        queueWorking.splice(idx, 1);
      }
    }
    for (let i = 0; i < queueWorking.length; i++) {
      queueWorking[i]!.queueIndex = i;
    }
    replaceBuildQueueForHex(
      control.h3Index,
      queueWorking.map((entry) => ({ unitType: entry.unitType, remainingCount: entry.remainingCount }))
    );
    setBuildProgressPointsForHex(control.h3Index, points);
    const deployedForHex = spawnProducedUnitsForHex(
      control.h3Index,
      controllerPlayerId,
      spawnedUnitTypes,
      unitCountsByPlayerType,
      capReachedByPlayer
    );
    const deployedForController = controllerPlayerId === 'opponent' ? deployedByPlayer.opponent : deployedByPlayer.human;
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
      cappedTypesForController:
        DEPLOYMENT_CAP_TYPE_ORDER.filter((unitType) => capSet.has(unitType)).join(', ') || 'none',
    });
    capArray.splice(0, capArray.length, ...DEPLOYMENT_CAP_TYPE_ORDER.filter((unitType) => capSet.has(unitType)));
  }
  return { deployedByPlayer, capReachedByPlayer };
}

/**
 * Why this exists:
 *     Collects per-player hex traversal for control resolution from committed movement orders.
 * When to use:
 *     Build the traversal input for `resolveRes1ControlAfterCombatAndMovement` during turn resolution.
 * What to expect:
 *     Returns de-duplicated traversed hex sets for control-capable unit types only (infantry/armor/naval).
 */
export function collectTraversedHexesByPlayer(
  orders: Array<{ unitId: string; toH3Index: string }>,
  unitsBeforeMove: Array<{ id: string; player: string; h3Index: string; unitType: string }>
): Record<'human' | 'opponent', Set<string>> {
  logDebug('gameActions collectTraversedHexesByPlayer', {
    orderCount: orders.length,
    unitCount: unitsBeforeMove.length,
  });
  const traversed: Record<'human' | 'opponent', Set<string>> = {
    human: new Set<string>(),
    opponent: new Set<string>(),
  };
  const byId = new Map(unitsBeforeMove.map((u) => [u.id, u]));
  for (const order of orders) {
    const unit = byId.get(order.unitId);
    if (!unit) continue;
    if (!CONTROL_UNIT_TYPE_SET.has(unit.unitType)) continue;
    const player = unit.player === 'opponent' ? 'opponent' : 'human';
    try {
      const path = gridPathCells(unit.h3Index, order.toH3Index);
      for (const h3 of path) traversed[player].add(h3);
    } catch {
      traversed[player].add(unit.h3Index);
      traversed[player].add(order.toH3Index);
    }
  }
  return traversed;
}
