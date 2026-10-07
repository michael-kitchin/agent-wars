import { strategicUrbanCellsDestroyedPerHit } from '../../shared/gameRules';
import { strategicParentOf } from '../../shared/h3Resolutions';
import {
  dbGetAll,
  dbGetOne,
  dbRun,
  getKeepBuildingForHex,
  getStrategicInfrastructureForHex,
  listBuildQueueRowsForHex,
  listTacticalFeatureOverridesForGame,
  replaceBuildQueueForHex,
  clearBuildQueueAndProgressForHex,
  setKeepBuildingForHex,
  updateTacticalFeatureOverrideRow,
} from '../gameDb';
import { logDebug } from '../logger';
import { getAvailableBuildUnitTypes } from '../productionRules';
import { casualtyPriorityIndex, getDefense, getRange } from '../combatConstants';
import { createCombatDieRoller, INFRASTRUCTURE_COUNTER_FIRE_THRESHOLD } from '../combatDice';
import { attackHitThreshold } from '../combatHitThresholds';
import { createCombatDiceLog, rollCombatDieAgainst, type CombatDiceLog } from '../combatDiceRecording';
import { readPersistedOriginBonusSettings } from '../gameDb/originBonusConfig';
import { weatherPenaltyForRoll } from '../weather/weatherMatch';
import { weatherTagsForBirthHex } from '../weather/weatherPackLoad';
import { weatherBonusLevelOf } from '../../shared/weatherBonusRules';
import type { WeatherAttackKind, WeatherAttackPenalty } from '../../shared/weatherBonusTypes';
import type {
  AirStrikeAnimationMove,
  AirStrikeOrder,
  AirStrikeTargetType,
  CombatDiceRoll,
  InfrastructureDestroyedEvent,
} from '../../shared/ipcTypes';
import type { CombatUnit } from '../combatUnitTypes';
import type { OriginHitBonusLookup } from '../originBonus/originHitBonusLookup';
import { noTechHitBonus, type TechHitBonusLookup } from '../techBonus/techHitBonusLookup';
import type { TerrainCoverLookup } from '../terrainCover/terrainCoverLookup';
import { validateAirStrikeOrder } from './airValidation';
import { isEmbarkedLandUnitOnWater } from './sealift';

/**
 * Removes illegal build-queue rows after infrastructure changes and syncs Keep building.
 *
 * Purpose: Keeps queued types and Keep-building standing orders aligned with current eligibility.
 * When to use: After air-strike / tactical rubble (or any infra change) that may invalidate unit types.
 * Expected outcome: Illegal rows removed; empty queues and illegal empty-gap standing orders clear Keep building;
 * armed non-empty queues retarget Keep building to the new last remaining type. Urban wipe clears queue+progress.
 * Exceptions: None.
 */
export function pruneBuildQueueForInfrastructureState(h3Index: string): void {
  logDebug('pruneBuildQueueForInfrastructureState', { h3Index });
  const infra = getStrategicInfrastructureForHex(h3Index);
  if (infra.urbanHexCount <= 0) {
    clearBuildQueueAndProgressForHex(h3Index);
    return;
  }

  const allowed = new Set(getAvailableBuildUnitTypes(infra.urbanHexCount, infra.seaportCount, infra.airportCount));
  const rows = listBuildQueueRowsForHex(h3Index);
  const standing = getKeepBuildingForHex(h3Index);

  if (rows.length === 0) {
    if (
      standing.keepBuilding &&
      (!standing.keepBuildingUnitType || !allowed.has(standing.keepBuildingUnitType))
    ) {
      setKeepBuildingForHex(h3Index, false, null);
      logDebug('pruneBuildQueueForInfrastructureState: cleared empty-gap standing order', { h3Index });
    }
    return;
  }

  const filtered = rows.filter((row) => allowed.has(row.unitType));
  if (filtered.length !== rows.length) {
    replaceBuildQueueForHex(
      h3Index,
      filtered.map((row) => ({ unitType: row.unitType, remainingCount: row.remainingCount }))
    );
    logDebug('pruneBuildQueueForInfrastructureState: removed illegal queue rows', {
      h3Index,
      beforeCount: rows.length,
      afterCount: filtered.length,
    });
  }

  if (filtered.length === 0) {
    if (standing.keepBuilding) {
      setKeepBuildingForHex(h3Index, false, null);
    }
    return;
  }

  if (standing.keepBuilding) {
    const lastType = filtered[filtered.length - 1]!.unitType;
    setKeepBuildingForHex(h3Index, true, lastType);
  }
}

/**
 * Defines the `replaceRandomTacticalFeaturesWithRubble` function shape (function replaceRandomTacticalFeaturesWithRubble( h3Index: string, feature: 'urban' | 'airport' | 'seaport', count: number, next: () => number ): numbe).

 * Purpose: Supports maintainability by documenting why `replaceRandomTacticalFeaturesWithRubble` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function replaceRandomTacticalFeaturesWithRubble(
  h3Index: string,
  feature: 'urban' | 'airport' | 'seaport',
  count: number,
  next: () => number
): number {
  if (count <= 0) return 0;
  const candidates = listTacticalFeatureOverridesForGame().filter((row) => {
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
    updateTacticalFeatureOverrideRow(row.h3Index, {
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
 * Purpose: Lets tactical urban strikes convert a single targeted tactical cell to rubble while strategic strikes keep random multi-cell destruction under the parent strategic, capped by the active map's strike cell count.
 * When to use: Pass from tactical projection when resolving urban infrastructure strikes at tactical resolution; omit for strategic resolution and non-urban strikes.
 * Expected outcome: When `tacticalUrbanStrikeTargetTacticalH3` is set with `targetType === 'urban'`, at most that tactical urban override becomes rubble if it belongs to `h3Index` and is eligible.
 * Exceptions: None.
 */
export type ApplyInfrastructureDestructionOptions = {
  /**
   * Explains why this field exists: pins tactical urban rubble conversion to the tactical cell the player selected.
   * When to use: Set only for tactical human urban strikes (pass the clicked tactical H3 id); omit for strategic strikes and other target types.
   * What to expect: The strategic `h3Index` argument must equal `cellToParent` of this value; the matching override row must be urban and not already rubble, or no change occurs.
   * Exceptions: None.
   */
  tacticalUrbanStrikeTargetH3?: string;
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
  logDebug('applyInfrastructureDestructionEffects', {
    h3Index,
    targetType,
    tacticalUrbanStrikeTargetH3: options?.tacticalUrbanStrikeTargetH3,
  });
  const current = getStrategicInfrastructureForHex(h3Index);
  const result = {
    destroyedAirUnits: [] as Array<{ id: string; player: string; unit_type: string; h3_index: string; display_order: number | null }>,
    changedRubbleCount: 0,
  };
  if (targetType === 'urban') {
    const tacticalStrikeTarget = options?.tacticalUrbanStrikeTargetH3?.trim();
    if (tacticalStrikeTarget) {
      if (strategicParentOf(tacticalStrikeTarget) !== h3Index) {
        logDebug('applyInfrastructureDestructionEffects tactical urban parent mismatch', { tacticalStrikeTarget, h3Index });
        return result;
      }
      const match = listTacticalFeatureOverridesForGame().find(
        (row) => row.h3Index === tacticalStrikeTarget && row.parentH3Index === h3Index && row.isUrban && !row.isRubble
      );
      if (!match) {
        logDebug('applyInfrastructureDestructionEffects tactical urban no eligible res4 row', { tacticalStrikeTarget, h3Index });
        return result;
      }
      logDebug('applyInfrastructureDestructionEffects tactical urban converting targeted res4 to rubble', {
        tacticalStrikeTarget,
        h3Index,
      });
      updateTacticalFeatureOverrideRow(match.h3Index, {
        isRubble: true,
        isUrban: false,
        isAirport: match.isAirport,
        isSeaport: match.isSeaport,
      });
      result.changedRubbleCount = 1;
      pruneBuildQueueForInfrastructureState(h3Index);
      return result;
    }
    const destroyCount = Math.min(strategicUrbanCellsDestroyedPerHit(), current.urbanHexCount);
    if (destroyCount <= 0) return result;
    result.changedRubbleCount = replaceRandomTacticalFeaturesWithRubble(h3Index, 'urban', destroyCount, next);
    if (result.changedRubbleCount > 0) {
      pruneBuildQueueForInfrastructureState(h3Index);
    }
    return result;
  }
  if (targetType === 'airport') {
    if (current.airportCount <= 0) return result;
    result.changedRubbleCount = replaceRandomTacticalFeaturesWithRubble(h3Index, 'airport', 1, next);
    if (result.changedRubbleCount > 0) {
      result.destroyedAirUnits = destroyBasedAirUnitsAtHex(h3Index);
      pruneBuildQueueForInfrastructureState(h3Index);
    }
    return result;
  }
  if (targetType === 'seaport') {
    if (current.seaportCount <= 0) return result;
    result.changedRubbleCount = replaceRandomTacticalFeaturesWithRubble(h3Index, 'seaport', 1, next);
    if (result.changedRubbleCount > 0) {
      pruneBuildQueueForInfrastructureState(h3Index);
    }
  }
  return result;
}

/**
 * Running totals of one strategic air strike phase, shared by every strike it resolves.
 *
 * Purpose: Lets the per-strike helpers record removals, casualty hexes, and dice without returning and merging lists.
 * When to use: Created once in `resolveAirStrikePhase` and passed to each strike helper.
 * Expected outcome: Each unit is recorded once even when several strikes remove it; the dice log keeps roll order.
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
  /**
   * Every die rolled in this phase, for resolution playback.
   *
   * Contract: Roll sites in this file pass `diceLog.sink` to `rollCombatDieAgainst`; anchors are strike targets.
   * When to use: Read `diceLog.rolls` once the phase finishes.
   * Expected outcome: Attack, anti-air, and infrastructure counter-fire rolls in roll order.
   * Exceptions: None.
   */
  readonly diceLog: CombatDiceLog;
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
 * Returns the weather penalty for one strategic unit's roll.
 *
 * Purpose: Air strikes and their counter-fire share the match level, the turn, and the unit's birth tags.
 * When to use: Immediately before `attackHitThreshold` in this file.
 * Expected outcome: 0 when the weather bonus is off. Otherwise the shared penalty for that kind of attack at the match's level.
 * Exceptions: None beyond pack load failures.
 */
function penaltyForDbUnit(input: {
  unitId: string;
  unitType: string;
  h3Index: string;
  kind: WeatherAttackKind;
  targetH3Index?: string;
}): WeatherAttackPenalty {
  const settings = readPersistedOriginBonusSettings({ getOne: dbGetOne, hasDb: () => true });
  const turnNumber = dbGetOne<{ turn_number: number }>('SELECT turn_number FROM turn_state WHERE id = 1')?.turn_number ?? 1;
  const birth = dbGetOne<{ birth_h3_index: string | null }>('SELECT birth_h3_index FROM units WHERE id = ?', [input.unitId])?.birth_h3_index;
  return weatherPenaltyForRoll({
    unitType: input.unitType,
    kind: input.kind,
    level: weatherBonusLevelOf(settings),
    turnNumber,
    startMonth: settings.startMonth ?? 1,
    unitH3Index: input.h3Index,
    targetH3Index: input.targetH3Index,
    tags: weatherTagsForBirthHex(birth),
  });
}

/**
 * Resolves one strategic air strike against the enemy units in a hex.
 *
 * Purpose: Applies the pre-rolled attack hit to the lowest-defense victim, then rolls counter-fire from eligible defenders.
 * When to use: From `resolveAirStrikePhase` for `units` targets.
 * Expected outcome: Deletes the victim and/or the attacker; counter-fire thresholds include each defender's origin bonus from `originHitBonusAt` at its own hex, while the victim pick keeps printed defense values.
 *   Counter-fire stops at the first hit; each roll is recorded in `acc.diceLog` as `antiAir`, anchored on the target hex.
 * Exceptions: None.
 */
function resolveAirStrikeAgainstUnits(
  attacker: { id: string; player: string; unit_type: string; h3_index: string; display_order: number | null },
  targetH3Index: string,
  attackHit: boolean,
  rollDie: () => number,
  acc: AirStrikePhaseAccumulator,
  bonuses: { originHitBonusAt: OriginHitBonusLookup; techHitBonusAt?: TechHitBonusLookup }
): { success: boolean; attackerLost: boolean } {
  const originHitBonusAt = bonuses.originHitBonusAt;
  const techHitBonusAt = bonuses.techHitBonusAt ?? noTechHitBonus;
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
    const counterFireThreshold = attackHitThreshold({
      unitType: defender.unit_type,
      originHitBonus: originHitBonusAt(defender.id, defender.h3_index),
      techAttackBonus: techHitBonusAt(defender.id).attack,
      weatherAttackPenalty: penaltyForDbUnit({
        unitId: defender.id,
        unitType: defender.unit_type,
        h3Index: defender.h3_index,
        kind: 'ranged',
      }),
    });
    const counterFireContext = {
      kind: 'antiAir',
      player: defender.player,
      unitType: defender.unit_type,
      anchorH3Index: targetH3Index,
    } as const;
    if (!rollCombatDieAgainst(rollDie, counterFireThreshold, counterFireContext, acc.diceLog.sink)) continue;
    dbRun('DELETE FROM units WHERE id = ?', [attacker.id]);
    recordRemovedUnit(acc, attacker, { removedAtH3Index: targetH3Index });
    attackerLost = true;
    break;
  }
  return { success, attackerLost };
}

/**
 * Resolves one strategic air strike against a city, airport, or seaport.
 *
 * Purpose: Applies the pre-rolled attack hit as infrastructure destruction, then rolls the target's counter-fire.
 * When to use: From `resolveAirStrikePhase` for targets other than `units`.
 * Expected outcome: A hit rubbles the target and removes air units based there, and counts as a success only when
 *   something changed. Counter-fire always rolls once against `INFRASTRUCTURE_COUNTER_FIRE_THRESHOLD` and, on a hit,
 *   deletes the attacker. That roll is recorded in `acc.diceLog` as `infrastructureCounterFire` on the target hex.
 * Exceptions: Propagates database errors.
 */
function resolveAirStrikeAgainstInfrastructure(
  attacker: { id: string; player: string; unit_type: string; h3_index: string; display_order: number | null },
  order: { targetH3Index: string; targetType: Exclude<AirStrikeTargetType, 'units'> },
  attackHit: boolean,
  next: () => number,
  rollDie: () => number,
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

  const counterFireContext = {
    kind: 'infrastructureCounterFire',
    player: null,
    unitType: null,
    infrastructureType: order.targetType,
    anchorH3Index: order.targetH3Index,
  } as const;
  const counterFireThreshold = INFRASTRUCTURE_COUNTER_FIRE_THRESHOLD[order.targetType];
  if (rollCombatDieAgainst(rollDie, counterFireThreshold, counterFireContext, acc.diceLog.sink)) {
    dbRun('DELETE FROM units WHERE id = ?', [attacker.id]);
    recordRemovedUnit(acc, attacker, { removedAtH3Index: order.targetH3Index });
    attackerLost = true;
  }
  return { success, attackerLost };
}

/**
 * Resolves every strategic air strike of the turn against units or infrastructure.
 *
 * Purpose: First rolling phase of strategic resolution.
 * When to use: From `executeReadyStrategicTurn`, with the turn's seeded RNG, its origin bonus lookup, and its terrain cover lookup; tests that ignore them pass `noOriginHitBonus` and `noTerrainCover`.
 * Expected outcome: Removed units, strike hexes, animation moves, and counts. Each attack roll adds the air unit's origin bonus at its base hex, and a strike on units loses the target hex's air cover; unit counter-fire adds each defender's bonus at its hex. Infrastructure strikes and all counter-fire ignore cover.
 * Exceptions: None.
 */
export function resolveAirStrikePhase(
  airOrders: AirStrikeOrder[],
  next: () => number,
  originHitBonusAt: OriginHitBonusLookup,
  targetCoverAt: TerrainCoverLookup,
  techHitBonusAt: TechHitBonusLookup = noTechHitBonus
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
  diceRolls: CombatDiceRoll[];
} {
  logDebug('resolveAirStrikePhase', { orderCount: airOrders.length });
  const acc: AirStrikePhaseAccumulator = {
    removedSet: new Set<string>(),
    removedUnitIds: [],
    removedUnits: [],
    casualtyHexes: new Set<string>(),
    diceLog: createCombatDiceLog(),
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
  const rollDie = createCombatDieRoller(next);

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
    const strikeThreshold = attackHitThreshold({
      unitType: 'air',
      originHitBonus: originHitBonusAt(attacker.id, attacker.h3_index),
      techAttackBonus: techHitBonusAt(attacker.id).attack,
      weatherAttackPenalty: penaltyForDbUnit({
        unitId: attacker.id,
        unitType: 'air',
        h3Index: attacker.h3_index,
        targetH3Index: order.targetH3Index,
        kind: 'airStrike',
      }),
      targetCover: order.targetType === 'units' ? targetCoverAt(order.targetH3Index, 'air') : 0,
    });
    const strikeContext = {
      kind: 'airStrike',
      player: attacker.player,
      unitType: attacker.unit_type,
      anchorH3Index: order.targetH3Index,
    } as const;
    const attackHit = rollCombatDieAgainst(rollDie, strikeThreshold, strikeContext, acc.diceLog.sink);
    if (order.targetType === 'units') {
      const result = resolveAirStrikeAgainstUnits(attacker, order.targetH3Index, attackHit, rollDie, acc, {
        originHitBonusAt,
        techHitBonusAt,
      });
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
      rollDie,
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

  logDebug('resolveAirStrikePhase complete', {
    attemptCount,
    removedCount: acc.removedUnitIds.length,
    diceRollCount: acc.diceLog.rolls.length,
  });
  return {
    diceRolls: acc.diceLog.rolls,
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
