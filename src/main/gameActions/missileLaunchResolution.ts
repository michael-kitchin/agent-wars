/**
 * Resolves strategic missile launches before air strikes and ranged fire.
 *
 * Purpose: Each launch rolls one d20 per set urban, airport, and seaport flag. A face at or below getAttack('air') clears that flag.
 * A spent missile is deleted and is not a removed unit, so it never reaches loss reports or destroyed-unit callbacks.
 * When to use: Once per Ready, after the combat-resolution log and before any later phase reads units.
 * Expected outcome: Accepted launches spend their missiles. Rejected launches leave the missile in place.
 * Exceptions: Database errors propagate. A missing missile is logged and skipped.
 */

import type { MissileLaunchOrder, MissileLaunchRecord } from '../../shared/ipc/missileTypes';
import type { InfrastructureDestroyedEvent } from '../../shared/ipc/readyTypes';
import { recordFortificationLoss, type FortificationLossTally } from '../fortificationCombat';
import { getAttack } from '../combatConstants';
import { createCombatDieRoller } from '../combatDice';
import type { CombatUnit } from '../combatUnitTypes';
import { dbGetOne, dbRun, getHexController, listTacticalFeatureOverridesForGame, updateTacticalFeatureOverrideRow } from '../gameDb';
import { logDebug } from '../logger';
import { destroyBasedAirUnitsAtHex, pruneBuildQueueForInfrastructureState } from './airStrikeResolution';
import { validateMissileLaunchOrder } from './missileValidation';

/**
 * What one Ready's launches removed and recorded.
 *
 * Purpose: Finalize joins the removed air units and the events, and stores the records on `ReadyResult`.
 * When to use: The return of `resolveMissileLaunchPhase`, including the melee-intercept pause.
 * Expected outcome: `launches` lists only spent missiles. `removedUnits` lists only air destroyed on the ground.
 * Exceptions: None.
 */
export interface MissileLaunchPhaseResult {
  /**
   * Launches that spent a missile.
   *
   * Contract: One record per spent missile, in resolution order.
   * When to use: Playback and consultation.
   * Expected outcome: Empty when every order was dropped.
   * Exceptions: None.
   */
  readonly launches: readonly MissileLaunchRecord[];
  /**
   * Air destroyed on the ground. The launching missile is not here.
   *
   * Contract: `h3Index` is the target hex.
   * When to use: Loss reports, before air-strike removals.
   * Expected outcome: Empty when no airport flag was destroyed.
   * Exceptions: None.
   */
  readonly removedUnits: readonly CombatUnit[];
  /**
   * Ids of `removedUnits`, in the same order.
   *
   * Contract: Same length as `removedUnits`.
   * When to use: The Ready removed-id list.
   * Expected outcome: Air unit ids only.
   * Exceptions: None.
   */
  readonly removedUnitIds: readonly string[];
  /**
   * One event per infrastructure kind this phase destroyed.
   *
   * Contract: Order is urban, then airport, then seaport, across launches in resolution order.
   * When to use: Ahead of the air-strike events in `ReadyResult`.
   * Expected outcome: `changedRubbleCount` is that kind's destroyed flag count. Only an airport event carries a non-zero air count.
   * Exceptions: None.
   */
  readonly infrastructureDestroyedEvents: readonly InfrastructureDestroyedEvent[];
}

/**
 * A launch whose missile row still exists.
 *
 * Purpose: Sorting needs the launching hex before any missile is deleted.
 * When to use: Inside `resolveMissileLaunchPhase` only.
 * Expected outcome: `fromH3Index` is the missile's hex.
 * Exceptions: None.
 */
interface LoadedLaunch {
  /**
   * The order that still has a missile row.
   *
   * Contract: `unitId` exists in `units` at load time.
   * When to use: Sorting and resolution.
   * Expected outcome: The caller's order, unchanged.
   * Exceptions: None.
   */
  readonly order: MissileLaunchOrder;
  /**
   * Owner of the missile.
   *
   * Contract: The `player` column at load time.
   * When to use: Validation and the launch record.
   * Expected outcome: A seat id.
   * Exceptions: None.
   */
  readonly player: string;
  /**
   * Hex the missile occupied when the order was loaded.
   *
   * Contract: The missile's `h3_index` before any launch deletes it.
   * When to use: Sort order and the record's `fromH3Index`.
   * Expected outcome: A strategic hex.
   * Exceptions: None.
   */
  readonly fromH3Index: string;
}

/**
 * Counts of one flag kind before and after a launch.
 *
 * Purpose: The record and the infrastructure events share these three pairs.
 * When to use: The result of rolling one target hex.
 * Expected outcome: Destroyed counts are never above the before counts.
 * Exceptions: None.
 */
interface FlagCounts {
  /**
   * Urban flags present when the rolls started.
   *
   * Contract: The number of set urban flags in the target hex.
   * When to use: The launch record.
   * Expected outcome: At least the number destroyed.
   * Exceptions: None.
   */
  urbanBefore: number;
  /**
   * Urban flags cleared by this launch.
   *
   * Contract: Incremented only when an urban roll is at or below getAttack('air').
   * When to use: The launch record and the urban event.
   * Expected outcome: Zero when every urban roll survives.
   * Exceptions: None.
   */
  urbanDestroyed: number;
  /**
   * Airport flags present when the rolls started.
   *
   * Contract: The number of set airport flags in the target hex.
   * When to use: The launch record.
   * Expected outcome: At least the number destroyed.
   * Exceptions: None.
   */
  airportsBefore: number;
  /**
   * Airport flags cleared by this launch.
   *
   * Contract: Incremented only when an airport roll is at or below getAttack('air').
   * Based air is removed only when this is above zero.
   * When to use: The launch record and the airport event.
   * Expected outcome: Zero when every airport roll survives.
   * Exceptions: None.
   */
  airportsDestroyed: number;
  /**
   * Seaport flags present when the rolls started.
   *
   * Contract: The number of set seaport flags in the target hex.
   * When to use: The launch record.
   * Expected outcome: At least the number destroyed.
   * Exceptions: None.
   */
  seaportsBefore: number;
  /**
   * Seaport flags cleared by this launch.
   *
   * Contract: Incremented only when a seaport roll is at or below getAttack('air').
   * When to use: The launch record and the seaport event.
   * Expected outcome: Zero when every seaport roll survives.
   * Exceptions: None.
   */
  seaportsDestroyed: number;
  /**
   * Fortified cells in the target when the launch started.
   *
   * Contract: A fortified cell is not also counted in the urban, airport, or seaport before-counts.
   * When to use: The launch record.
   * Expected outcome: Zero when the hex has no fortifications.
   * Exceptions: None.
   */
  fortificationsBefore: number;
  /**
   * Fortifications this launch removed.
   *
   * Contract: The city, airport, and seaport flags on that cell stay.
   * When to use: The launch record and the turn tally.
   * Expected outcome: Zero when every fortified cell rolls above getAttack('air').
   * Exceptions: None.
   */
  fortificationsDestroyed: number;
}

/**
 * Reads each order's missile and drops an order whose unit is already gone.
 *
 * Purpose: Resolution order is the launching hex, then the unit id.
 * When to use: At the start of `resolveMissileLaunchPhase`.
 * Expected outcome: Present missiles, sorted. A missing row is logged and omitted.
 * Exceptions: None.
 */
function loadLaunchOrder(order: MissileLaunchOrder): LoadedLaunch | null {
  const row = dbGetOne<{ player: string; h3Index: string }>(
    'SELECT player, h3_index AS h3Index FROM units WHERE id = ?',
    [order.unitId]
  );
  if (!row) {
    logDebug('missileLaunchResolution dropped a launch whose unit is missing', { unitId: order.unitId });
    return null;
  }
  return { order, player: row.player, fromH3Index: row.h3Index };
}

/**
 * Rolls every set flag in the target hex and clears the ones that do not survive.
 *
 * Purpose: Each urban, airport, and seaport flag rolls its own d20 against hitThreshold, which is getAttack('air') from the caller.
 * A face at or below that number destroys the flag. A fortified cell rolls once against the same number and loses only its fortification.
 * When to use: After a launch has passed validation.
 * Expected outcome: Updated override rows, and the before and destroyed counts for the record.
 * Exceptions: None. An empty cell rolls nothing.
 */
function rollTargetFlags(targetH3Index: string, rollDie: () => number, hitThreshold: number): FlagCounts {
  const counts: FlagCounts = {
    urbanBefore: 0,
    urbanDestroyed: 0,
    airportsBefore: 0,
    airportsDestroyed: 0,
    seaportsBefore: 0,
    seaportsDestroyed: 0,
    fortificationsBefore: 0,
    fortificationsDestroyed: 0,
  };
  const rows = listTacticalFeatureOverridesForGame().filter((row) => row.parentH3Index === targetH3Index);
  for (const row of rows) {
    if (row.isFortified) {
      counts.fortificationsBefore += 1;
      if (rollDie() <= hitThreshold) {
        updateTacticalFeatureOverrideRow(row.h3Index, { isFortified: false });
        counts.fortificationsDestroyed += 1;
      }
      continue;
    }
    let isUrban = row.isUrban;
    let isAirport = row.isAirport;
    let isSeaport = row.isSeaport;
    let destroyedOnRow = false;
    if (row.isUrban) {
      counts.urbanBefore += 1;
      if (rollDie() <= hitThreshold) {
        isUrban = false;
        counts.urbanDestroyed += 1;
        destroyedOnRow = true;
      }
    }
    if (row.isAirport) {
      counts.airportsBefore += 1;
      if (rollDie() <= hitThreshold) {
        isAirport = false;
        counts.airportsDestroyed += 1;
        destroyedOnRow = true;
      }
    }
    if (row.isSeaport) {
      counts.seaportsBefore += 1;
      if (rollDie() <= hitThreshold) {
        isSeaport = false;
        counts.seaportsDestroyed += 1;
        destroyedOnRow = true;
      }
    }
    if (destroyedOnRow) {
      updateClearedFlags(row.h3Index, isUrban, isAirport, isSeaport);
    }
  }
  return counts;
}

/**
 * Writes one tactical cell after its flag rolls.
 *
 * Purpose: A destroyed flag is cleared and the cell becomes rubble. Surviving flags stay.
 * When to use: After at least one flag on the cell was destroyed.
 * Expected outcome: The override row matches the surviving flags and is rubble.
 * Exceptions: None. A missing row is a no-op inside the database helper.
 */
function updateClearedFlags(h3Index: string, isUrban: boolean, isAirport: boolean, isSeaport: boolean): void {
  updateTacticalFeatureOverrideRow(h3Index, { isRubble: true, isUrban, isAirport, isSeaport });
}

/**
 * Deletes a missile that launched, including its hold order and pending launch.
 *
 * Purpose: A spent missile is not a loss. It leaves the map without a casualty row.
 * When to use: After the launch's damage has been applied.
 * Expected outcome: The unit, its standing order, and its pending launch are gone.
 * Exceptions: None.
 */
function spendMissile(unitId: string): void {
  dbRun('DELETE FROM units WHERE id = ?', [unitId]);
  dbRun('DELETE FROM standing_orders WHERE unit_id = ?', [unitId]);
  dbRun('DELETE FROM pending_missile_launches WHERE unit_id = ?', [unitId]);
}

/**
 * Resolves every launch for this Ready.
 *
 * Purpose: Draws infrastructure dice from the shared `next` stream against the printed air attack, `getAttack('air')`, with no weather, origin, tech, or cover, then removes spent missiles before later phases.
 * When to use: Immediately after the `ready: combat resolution` log.
 * Expected outcome: Records for spent missiles, removed based air, and infrastructure events. Invalid orders are skipped.
 * Exceptions: Propagates database errors.
 */
export function resolveMissileLaunchPhase(
  orders: readonly MissileLaunchOrder[],
  next: () => number,
  fortificationTally?: FortificationLossTally
): MissileLaunchPhaseResult {
  const hitThreshold = getAttack('air');
  logDebug('missileLaunchResolution resolveMissileLaunchPhase', { orderCount: orders.length, hitThreshold });
  const loaded = orders
    .map(loadLaunchOrder)
    .filter((row): row is LoadedLaunch => row !== null)
    .sort((a, b) => a.fromH3Index.localeCompare(b.fromH3Index) || a.order.unitId.localeCompare(b.order.unitId));
  const rollDie = createCombatDieRoller(next);
  const launches: MissileLaunchRecord[] = [];
  const removedUnits: CombatUnit[] = [];
  const removedUnitIds: string[] = [];
  const infrastructureDestroyedEvents: InfrastructureDestroyedEvent[] = [];

  for (const launch of loaded) {
    const check = validateMissileLaunchOrder(launch.order.unitId, launch.order.targetH3Index, {
      allowedPlayer: launch.player,
    });
    if (!check.valid) {
      logDebug('missileLaunchResolution skipped an invalid launch', {
        unitId: launch.order.unitId,
        targetH3Index: launch.order.targetH3Index,
        reason: check.reason,
      });
      continue;
    }
    const target = launch.order.targetH3Index;
    const controller = getHexController(target);
    const counts = rollTargetFlags(target, rollDie, hitThreshold);
    recordFortificationLoss(fortificationTally, target, counts.fortificationsDestroyed);
    const destroyedAir = counts.airportsDestroyed > 0 ? destroyBasedAirUnitsAtHex(target) : [];
    const destroyedAirUnitIds = destroyedAir.map((row) => row.id);
    for (const row of destroyedAir) {
      removedUnits.push({
        id: row.id,
        player: row.player,
        unitType: row.unit_type,
        h3Index: target,
        displayOrder: row.display_order ?? undefined,
      });
      removedUnitIds.push(row.id);
    }
    const anythingDestroyed = counts.urbanDestroyed + counts.airportsDestroyed + counts.seaportsDestroyed > 0;
    if (anythingDestroyed) pruneBuildQueueForInfrastructureState(target);
    pushInfrastructureEvents(infrastructureDestroyedEvents, target, counts, destroyedAir.length);
    spendMissile(launch.order.unitId);
    launches.push({
      unitId: launch.order.unitId,
      player: launch.player,
      fromH3Index: launch.fromH3Index,
      targetH3Index: target,
      targetControllerId: controller,
      urbanBefore: counts.urbanBefore,
      urbanDestroyed: counts.urbanDestroyed,
      airportsBefore: counts.airportsBefore,
      airportsDestroyed: counts.airportsDestroyed,
      seaportsBefore: counts.seaportsBefore,
      seaportsDestroyed: counts.seaportsDestroyed,
      fortificationsBefore: counts.fortificationsBefore,
      fortificationsDestroyed: counts.fortificationsDestroyed,
      destroyedAirUnitIds,
    });
  }

  return { launches, removedUnits, removedUnitIds, infrastructureDestroyedEvents };
}

/**
 * Adds one event for each kind this launch destroyed.
 *
 * Purpose: The turn report and callbacks see urban, airport, and seaport strikes separately.
 * When to use: After the launch's air removals are known.
 * Expected outcome: Only kinds with a destroyed count above 0 are pushed. Only the airport event carries the air count.
 * Exceptions: None.
 */
function pushInfrastructureEvents(
  events: InfrastructureDestroyedEvent[],
  targetH3Index: string,
  counts: FlagCounts,
  destroyedAirUnitsCount: number
): void {
  if (counts.urbanDestroyed > 0) {
    events.push({
      h3Index: targetH3Index,
      targetType: 'urban',
      changedRubbleCount: counts.urbanDestroyed,
      destroyedAirUnitsCount: 0,
    });
  }
  if (counts.airportsDestroyed > 0) {
    events.push({
      h3Index: targetH3Index,
      targetType: 'airport',
      changedRubbleCount: counts.airportsDestroyed,
      destroyedAirUnitsCount,
    });
  }
  if (counts.seaportsDestroyed > 0) {
    events.push({
      h3Index: targetH3Index,
      targetType: 'seaport',
      changedRubbleCount: counts.seaportsDestroyed,
      destroyedAirUnitsCount: 0,
    });
  }
}
