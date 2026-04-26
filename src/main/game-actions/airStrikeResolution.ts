import { cellToParent } from 'h3-js';
import { dbGetAll, dbGetOne, dbRun, getRes1InfrastructureForHex, listBuildQueueRowsForHex, listRes4FeatureOverridesForGame, replaceBuildQueueForHex, clearBuildQueueAndProgressForHex, updateRes4FeatureOverrideRow } from '../gameDb';
import { logDebug } from '../logger';
import { getAvailableBuildUnitTypes } from '../productionRules';
import { casualtyPriorityIndex, getAttack, getDefense, getRange } from '../combatConstants';
import type { AirStrikeAnimationMove, AirStrikeOrder, AirStrikeTargetType, InfrastructureDestroyedEvent } from '../../shared/ipcTypes';
import type { CombatUnit } from '../combatUnitTypes';
import { validateAirStrikeOrder } from './airValidation';
import { isEmbarkedLandUnitOnWater } from './sealift';

/**
 * Explains why this constant exists: upper bound on how many res4 urban cells one successful **strategic** urban infrastructure air strike may turn to rubble **per air unit order** (same cap regardless of how many sub-units the row represents).
 * When to use: Only the non-tactical urban branch of `applyInfrastructureDestructionEffects`; tactical urban strikes that pin a res4 cell stay at one cell.
 * What to expect: Actual count is `Math.min(this value, current res1 urban_hex_count)` and may be lower if fewer eligible res4 override rows exist.
 * Exceptions: None.
 */
const MAX_URBAN_RES4_CELLS_DESTROYED_PER_STRATEGIC_URBAN_AIR_STRIKE = 9;

/**
 * Defines the `pruneBuildQueueForInfrastructureState` function shape (function pruneBuildQueueForInfrastructureState(h3Index: string): void).

 * Purpose: Supports maintainability by documenting why `pruneBuildQueueForInfrastructureState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function pruneBuildQueueForInfrastructureState(h3Index: string): void {
  const infra = getRes1InfrastructureForHex(h3Index);
  const rows = listBuildQueueRowsForHex(h3Index);
  if (rows.length === 0) return;
  const allowed = new Set(getAvailableBuildUnitTypes(infra.urbanHexCount, infra.seaportCount, infra.airportCount));
  if (infra.urbanHexCount <= 0) {
    clearBuildQueueAndProgressForHex(h3Index);
    return;
  }
  const filtered = rows.filter((row) => allowed.has(row.unitType));
  if (filtered.length === rows.length) return;
  replaceBuildQueueForHex(
    h3Index,
    filtered.map((row) => ({ unitType: row.unitType, remainingCount: row.remainingCount }))
  );
}

/**
 * Defines the `replaceRandomRes4FeaturesWithRubble` function shape (function replaceRandomRes4FeaturesWithRubble( h3Index: string, feature: 'urban' | 'airport' | 'seaport', count: number, next: () => number ): numbe).

 * Purpose: Supports maintainability by documenting why `replaceRandomRes4FeaturesWithRubble` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function replaceRandomRes4FeaturesWithRubble(
  h3Index: string,
  feature: 'urban' | 'airport' | 'seaport',
  count: number,
  next: () => number
): number {
  if (count <= 0) return 0;
  const candidates = listRes4FeatureOverridesForGame().filter((row) => {
    if (row.parentH3Index !== h3Index) return false;
    if (row.isRubble) return false;
    if (feature === 'urban') return row.isUrban;
    if (feature === 'airport') return row.isAirport;
    return row.isSeaport;
  });
  let changed = 0;
  const pool = [...candidates];
  while (pool.length > 0 && changed < count) {
    const idx = Math.floor(next() * pool.length);
    const row = pool.splice(idx, 1)[0]!;
    updateRes4FeatureOverrideRow(row.h3Index, {
      isRubble: true,
      isUrban: feature === 'urban' ? false : row.isUrban,
      isAirport: feature === 'airport' ? false : row.isAirport,
      isSeaport: feature === 'seaport' ? false : row.isSeaport,
    });
    changed++;
  }
  return changed;
}

/**
 * Defines the `destroyBasedAirUnitsAtHex` function shape (function destroyBasedAirUnitsAtHex().

 * Purpose: Supports maintainability by documenting why `destroyBasedAirUnitsAtHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function destroyBasedAirUnitsAtHex(
  h3Index: string
): Array<{ id: string; player: string; unit_type: string; h3_index: string; display_order: number | null }> {
  logDebug('airStrikeResolution destroyBasedAirUnitsAtHex', { h3Index });
  const rows = dbGetAll<{ id: string; player: string; unit_type: string; h3_index: string; display_order: number | null }>(
    'SELECT id, player, unit_type, h3_index, display_order FROM units WHERE h3_index = ? AND unit_type = ?',
    [h3Index, 'air']
  );
  for (const row of rows) {
    dbRun('DELETE FROM units WHERE id = ?', [row.id]);
  }
  return rows;
}

/**
 * Documents optional behavior flags for `applyInfrastructureDestructionEffects` as a named contract surface.
 *
 * Purpose: Lets tactical urban strikes convert a single targeted res4 cell to rubble while strategic strikes keep random multi-cell destruction under the parent res1 (capped per air unit by `MAX_URBAN_RES4_CELLS_DESTROYED_PER_STRATEGIC_URBAN_AIR_STRIKE`).
 * When to use: Pass from tactical projection when resolving urban infrastructure strikes at res4 resolution; omit for strategic resolution and non-urban strikes.
 * Expected outcome: When `tacticalUrbanStrikeTargetRes4H3` is set with `targetType === 'urban'`, at most that res4 urban override becomes rubble if it belongs to `h3Index` and is eligible.
 * Exceptions: None.
 */
export type ApplyInfrastructureDestructionOptions = {
  /**
   * Explains why this field exists: pins tactical urban rubble conversion to the res4 cell the player selected.
   * When to use: Set only for tactical human urban strikes (pass the clicked res4 H3 id); omit for strategic strikes and other target types.
   * What to expect: The res1 `h3Index` argument must equal `cellToParent` of this value; the matching override row must be urban and not already rubble, or no change occurs.
   * Exceptions: None.
   */
  tacticalUrbanStrikeTargetRes4H3?: string;
};

/**
 * Defines the `applyInfrastructureDestructionEffects` function shape (function applyInfrastructureDestructionEffects( h3Index: string, targetType: AirStrikeTargetType, next: () => number, options?: ApplyInfrastructureDestructionOptions ): { destroyedAirUnits: Array<...>; changedRubbleCount: number }).

 * Purpose: Supports maintainability by documenting why `applyInfrastructureDestructionEffects` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function applyInfrastructureDestructionEffects(
  h3Index: string,
  targetType: AirStrikeTargetType,
  next: () => number,
  options?: ApplyInfrastructureDestructionOptions
): {
  destroyedAirUnits: Array<{ id: string; player: string; unit_type: string; h3_index: string; display_order: number | null }>;
  changedRubbleCount: number;
} {
  const current = getRes1InfrastructureForHex(h3Index);
  const result = {
    destroyedAirUnits: [] as Array<{ id: string; player: string; unit_type: string; h3_index: string; display_order: number | null }>,
    changedRubbleCount: 0,
  };
  if (targetType === 'urban') {
    const tacticalRes4 = options?.tacticalUrbanStrikeTargetRes4H3?.trim();
    if (tacticalRes4) {
      if (cellToParent(tacticalRes4, 1) !== h3Index) {
        logDebug('applyInfrastructureDestructionEffects tactical urban parent mismatch', { tacticalRes4, h3Index });
        return result;
      }
      const match = listRes4FeatureOverridesForGame().find(
        (row) => row.h3Index === tacticalRes4 && row.parentH3Index === h3Index && row.isUrban && !row.isRubble
      );
      if (!match) {
        logDebug('applyInfrastructureDestructionEffects tactical urban no eligible res4 row', { tacticalRes4, h3Index });
        return result;
      }
      logDebug('applyInfrastructureDestructionEffects tactical urban converting targeted res4 to rubble', {
        tacticalRes4,
        h3Index,
      });
      updateRes4FeatureOverrideRow(match.h3Index, {
        isRubble: true,
        isUrban: false,
        isAirport: match.isAirport,
        isSeaport: match.isSeaport,
      });
      result.changedRubbleCount = 1;
      pruneBuildQueueForInfrastructureState(h3Index);
      return result;
    }
    const destroyCount = Math.min(MAX_URBAN_RES4_CELLS_DESTROYED_PER_STRATEGIC_URBAN_AIR_STRIKE, current.urbanHexCount);
    if (destroyCount <= 0) return result;
    result.changedRubbleCount = replaceRandomRes4FeaturesWithRubble(h3Index, 'urban', destroyCount, next);
    if (result.changedRubbleCount > 0) {
      pruneBuildQueueForInfrastructureState(h3Index);
    }
    return result;
  }
  if (targetType === 'airport') {
    if (current.airportCount <= 0) return result;
    result.changedRubbleCount = replaceRandomRes4FeaturesWithRubble(h3Index, 'airport', 1, next);
    if (result.changedRubbleCount > 0) {
      result.destroyedAirUnits = destroyBasedAirUnitsAtHex(h3Index);
      pruneBuildQueueForInfrastructureState(h3Index);
    }
    return result;
  }
  if (targetType === 'seaport') {
    if (current.seaportCount <= 0) return result;
    result.changedRubbleCount = replaceRandomRes4FeaturesWithRubble(h3Index, 'seaport', 1, next);
    if (result.changedRubbleCount > 0) {
      pruneBuildQueueForInfrastructureState(h3Index);
    }
  }
  return result;
}

/**
 * Documents the `AirStrikePhaseAccumulator` interface as a named contract surface (interface AirStrikePhaseAccumulator).

 * Purpose: Supports maintainability by documenting why `AirStrikePhaseAccumulator` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface AirStrikePhaseAccumulator {
    /**
   * Specifies the contract for the `removedSet` member (removedSet: Set<string>;).

   * Contract: Describes stable behavior for callers of `removedSet` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
removedSet: Set<string>;
    /**
   * Specifies the contract for the `removedUnitIds` member (removedUnitIds: string[];).

   * Contract: Describes stable behavior for callers of `removedUnitIds` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
removedUnitIds: string[];
    /**
   * Specifies the contract for the `removedUnits` member (removedUnits: CombatUnit[];).

   * Contract: Describes stable behavior for callers of `removedUnits` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
removedUnits: CombatUnit[];
    /**
   * Specifies the contract for the `casualtyHexes` member (casualtyHexes: Set<string>;).

   * Contract: Describes stable behavior for callers of `casualtyHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
casualtyHexes: Set<string>;
}

/**
 * Defines the `recordRemovedUnit` function shape (function recordRemovedUnit( acc: AirStrikePhaseAccumulator, row: { id: string; player: string; unit_type: string; h3_index: string; display_order: number).

 * Purpose: Supports maintainability by documenting why `recordRemovedUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function recordRemovedUnit(
  acc: AirStrikePhaseAccumulator,
  row: { id: string; player: string; unit_type: string; h3_index: string; display_order: number | null },
  options?: { removedAtH3Index?: string }
): void {
  if (acc.removedSet.has(row.id)) return;
  const removedAtH3Index = options?.removedAtH3Index ?? row.h3_index;
  acc.removedSet.add(row.id);
  acc.removedUnitIds.push(row.id);
  acc.removedUnits.push({
    id: row.id,
    player: row.player,
    unitType: row.unit_type,
    h3Index: removedAtH3Index,
    displayOrder: row.display_order ?? undefined,
  });
  acc.casualtyHexes.add(removedAtH3Index);
}

/**
 * Defines the `resolveAirStrikeAgainstUnits` function shape (function resolveAirStrikeAgainstUnits( attacker: { id: string; player: string; unit_type: string; h3_index: string; display_order: number | null }, target).

 * Purpose: Supports maintainability by documenting why `resolveAirStrikeAgainstUnits` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function resolveAirStrikeAgainstUnits(
  attacker: { id: string; player: string; unit_type: string; h3_index: string; display_order: number | null },
  targetH3Index: string,
  attackHit: boolean,
  rollD6: () => number,
  acc: AirStrikePhaseAccumulator
): { success: boolean; attackerLost: boolean } {
  const defenders = dbGetAll<{ id: string; player: string; unit_type: string; h3_index: string; display_order: number | null }>(
    'SELECT id, player, unit_type, h3_index, display_order FROM units WHERE h3_index = ? AND player != ?',
    [targetH3Index, attacker.player]
  );
  const eligibleDefenders = defenders.filter((defender) => {
    if (defender.unit_type !== 'infantry' && defender.unit_type !== 'armor') return true;
    return !isEmbarkedLandUnitOnWater(defender.id);
  });
  let success = false;
  let attackerLost = false;
  if (attackHit && defenders.length > 0) {
    const victim = defenders
      .map((u) => ({ ...u, defense: getDefense(u.unit_type), order: casualtyPriorityIndex(u.unit_type) }))
      .sort((a, b) => a.defense - b.defense || a.order - b.order)[0]!;
    dbRun('DELETE FROM units WHERE id = ?', [victim.id]);
    recordRemovedUnit(acc, victim);
    success = true;
  }

  for (const defender of eligibleDefenders) {
    if (getRange(defender.unit_type) < 1) continue;
    if (rollD6() > getAttack(defender.unit_type)) continue;
    dbRun('DELETE FROM units WHERE id = ?', [attacker.id]);
    recordRemovedUnit(acc, attacker, { removedAtH3Index: targetH3Index });
    attackerLost = true;
    break;
  }
  return { success, attackerLost };
}

/**
 * Defines the `resolveAirStrikeAgainstInfrastructure` function shape (function resolveAirStrikeAgainstInfrastructure( attacker: { id: string; player: string; unit_type: string; h3_index: string; display_order: number | null },).

 * Purpose: Supports maintainability by documenting why `resolveAirStrikeAgainstInfrastructure` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function resolveAirStrikeAgainstInfrastructure(
  attacker: { id: string; player: string; unit_type: string; h3_index: string; display_order: number | null },
  order: { targetH3Index: string; targetType: Exclude<AirStrikeTargetType, 'units'> },
  attackHit: boolean,
  next: () => number,
  rollD6: () => number,
  acc: AirStrikePhaseAccumulator,
  infrastructureDestroyedEvents: InfrastructureDestroyedEvent[]
): { success: boolean; attackerLost: boolean } {
  let success = false;
  let attackerLost = false;
  if (attackHit) {
    const destruction = applyInfrastructureDestructionEffects(order.targetH3Index, order.targetType, next);
    if (destruction.changedRubbleCount > 0 || destruction.destroyedAirUnits.length > 0) {
      infrastructureDestroyedEvents.push({
        h3Index: order.targetH3Index,
        targetType: order.targetType,
        changedRubbleCount: destruction.changedRubbleCount,
        destroyedAirUnitsCount: destruction.destroyedAirUnits.length,
      });
      success = true;
    }
    for (const removed of destruction.destroyedAirUnits) {
      recordRemovedUnit(acc, removed);
    }
  }

  const counterThreshold = order.targetType === 'airport' ? 2 : 1;
  if (rollD6() <= counterThreshold) {
    dbRun('DELETE FROM units WHERE id = ?', [attacker.id]);
    recordRemovedUnit(acc, attacker, { removedAtH3Index: order.targetH3Index });
    attackerLost = true;
  }
  return { success, attackerLost };
}

/**
 * Defines the `resolveAirStrikePhase` function shape (export function resolveAirStrikePhase( airOrders: AirStrikeOrder[], next: () => number ): { removedUnitIds: string[]; removedUnits: CombatUnit[];).

 * Purpose: Supports maintainability by documenting why `resolveAirStrikePhase` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function resolveAirStrikePhase(
  airOrders: AirStrikeOrder[],
  next: () => number
): {
  removedUnitIds: string[];
  removedUnits: CombatUnit[];
  casualtyHexes: string[];
  strikeHexes: string[];
  strikeMoves: AirStrikeAnimationMove[];
  infrastructureDestroyedEvents: InfrastructureDestroyedEvent[];
  attemptCount: number;
  successfulCount: number;
  failedCount: number;
  attackerLossCount: number;
} {
  logDebug('resolveAirStrikePhase', { orderCount: airOrders.length });
  const acc: AirStrikePhaseAccumulator = {
    removedSet: new Set<string>(),
    removedUnitIds: [],
    removedUnits: [],
    casualtyHexes: new Set<string>(),
  };
  const strikeHexes = new Set<string>();
  const strikeMoves: AirStrikeAnimationMove[] = [];
  const infrastructureDestroyedEvents: InfrastructureDestroyedEvent[] = [];
  let attemptCount = 0;
  let successfulCount = 0;
  let failedCount = 0;
  let attackerLossCount = 0;
  const sorted = [...airOrders].sort((a, b) => {
    const aUnit = dbGetOne<{ h3_index: string }>('SELECT h3_index FROM units WHERE id = ?', [a.unitId])?.h3_index ?? '';
    const bUnit = dbGetOne<{ h3_index: string }>('SELECT h3_index FROM units WHERE id = ?', [b.unitId])?.h3_index ?? '';
    return aUnit.localeCompare(bUnit) || a.unitId.localeCompare(b.unitId);
  });
  const rollD6 = () => Math.floor(next() * 6) + 1;

  for (const order of sorted) {
    if (acc.removedSet.has(order.unitId)) continue;
    const valid = validateAirStrikeOrder(order.unitId, order.targetH3Index, order.targetType, {
      allowedPlayer: dbGetOne<{ player: string }>('SELECT player FROM units WHERE id = ?', [order.unitId])?.player ?? 'human',
    });
    if (!valid.valid) continue;
    strikeHexes.add(order.targetH3Index);
    const attacker = dbGetOne<{ id: string; player: string; unit_type: string; h3_index: string; display_order: number | null }>(
      'SELECT id, player, unit_type, h3_index, display_order FROM units WHERE id = ?',
      [order.unitId]
    );
    if (!attacker) continue;
    attemptCount += 1;
    const attackHit = rollD6() <= getAttack('air');
    if (order.targetType === 'units') {
      const result = resolveAirStrikeAgainstUnits(attacker, order.targetH3Index, attackHit, rollD6, acc);
      strikeMoves.push({
        unitId: attacker.id,
        player: attacker.player,
        unitType: attacker.unit_type,
        fromH3Index: attacker.h3_index,
        targetH3Index: order.targetH3Index,
        returnsToBase: !result.attackerLost,
      });
      if (result.success) successfulCount += 1;
      else failedCount += 1;
      if (result.attackerLost) attackerLossCount += 1;
      continue;
    }

    const result = resolveAirStrikeAgainstInfrastructure(
      attacker,
      { targetH3Index: order.targetH3Index, targetType: order.targetType },
      attackHit,
      next,
      rollD6,
      acc,
      infrastructureDestroyedEvents
    );
    strikeMoves.push({
      unitId: attacker.id,
      player: attacker.player,
      unitType: attacker.unit_type,
      fromH3Index: attacker.h3_index,
      targetH3Index: order.targetH3Index,
      returnsToBase: !result.attackerLost,
    });
    if (result.success) successfulCount += 1;
    else failedCount += 1;
    if (result.attackerLost) attackerLossCount += 1;
  }

  return {
    removedUnitIds: acc.removedUnitIds,
    removedUnits: acc.removedUnits,
    casualtyHexes: [...acc.casualtyHexes],
    strikeHexes: [...strikeHexes],
    strikeMoves,
    infrastructureDestroyedEvents,
    attemptCount,
    successfulCount,
    failedCount,
    attackerLossCount,
  };
}

/**
 * Documents the `AirStrikePhaseResult` type alias (export type AirStrikePhaseResult).

 * Purpose: Names the return shape of `resolveAirStrikePhase` so melee-intercept pause snapshots can store it without circular imports.
 * When to use: Typing fields that mirror the air strike phase outcome between ready pause and resolve.
 * Expected outcome: Structural compatibility with `resolveAirStrikePhase` return value.
 * Exceptions: None.
 */
export type AirStrikePhaseResult = ReturnType<typeof resolveAirStrikePhase>;
