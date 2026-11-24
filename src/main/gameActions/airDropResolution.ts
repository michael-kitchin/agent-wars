import { isLandUnitType } from '../../shared/landUnitType';
import { compareCodeUnits } from '../../shared/codeUnitOrder';
/**
 * Lands every embarked infantry unit from an air unit, or loses all of them when the target shoots the air unit down.
 *
 * Purpose: A drop is not an attack roll. Only anti-air uses the combat dice.
 * When to use: Immediately after air strikes and before the ranged-fire list is built.
 * Expected outcome: Every infantry unit aboard is on the target and the air unit is still on its airport, or the air unit and all its infantry are gone.
 * Exceptions: None. An illegal order is skipped.
 */

import type { AirDropAnimationMove, AirDropOrder } from '../../shared/ipc/airDropTypes';
import type { AirStrikeOrder, FerryOrder } from '../../shared/ipc/ordersTypes';
import type { CombatDiceRoll } from '../../shared/ipc/combatDiceTypes';
import { createCombatDiceLog, type CombatDiceLog } from '../combatDiceRecording';
import { dbGetAll, dbGetOne, dbRun } from '../gameDb';
import { readTurnNumberOrFirst } from '../gameDb/turnStateReads';
import { logDebug } from '../logger';
import { noOriginHitBonus, type OriginHitBonusLookup } from '../originBonus/originHitBonusLookup';
import { noTechHitBonus, type TechHitBonusLookup } from '../techBonus/techHitBonusLookup';
import { landUnitSitsOutCombat } from './airlift';
import { rollAntiAirCounterFire } from './airCounterFire';
import { validateAirDropOrder } from './airDropValidation';
import { applyTransportLossForRemovedCarriers } from './transportCargoLoss';
import { readPersistedOriginBonusSettings } from '../gameDb/originBonusConfig';
import { weatherPenaltyForRoll } from '../weather/weatherMatch';
import { weatherTagsForBirthHex } from '../weather/weatherPackLoad';
import { weatherBonusLevelOf } from '../../shared/weatherBonusRules';
import type { WeatherAttackPenalty } from '../../shared/weatherBonusTypes';
import type { CombatUnit } from '../combatUnitTypes';

/**
 * What one drop phase changed.
 *
 * Purpose: Playback, the ranged-fire exclusion list, and the air-strike dice log.
 * When to use: The return of `resolveAirDropPhase`.
 * Expected outcome: Moves for drops that were attempted. Removed ids include the air unit and all its infantry when return fire hit.
 * Exceptions: None.
 */
export type AirDropPhaseResult = {
  readonly moves: AirDropAnimationMove[];
  readonly removedUnitIds: string[];
  readonly removedUnits: CombatUnit[];
  readonly diceRolls: CombatDiceRoll[];
  /**
   * The carrier each lost cargo unit was aboard.
   *
   * Contract: Keys are ids of infantry in `removedUnits` that were lost with a shot-down carrier. Values are that carrier's id.
   * When to use: Loss attribution, so the infantry is credited to whoever shot the carrier down.
   * Expected outcome: Empty when no carrier was shot down.
   * Exceptions: None.
   */
  readonly carrierIdByCargoId: ReadonlyMap<string, string>;
};

/**
 * Drops a generated strike that would cancel an explicit ferry or drop.
 *
 * Purpose: A standing-order strike used to erase a ferry the player had queued. An explicit strike still wins.
 * When to use: For the human lists, before they are merged with other owners.
 * Expected outcome: Generated strikes whose unit has an explicit ferry or drop, and no explicit strike, are gone. Explicit strikes, ferries, and drops are otherwise unchanged.
 * Exceptions: None.
 */
export function reconcileHumanAirActions(args: {
  readonly generatedStrikes: readonly AirStrikeOrder[];
  readonly explicitStrikes: readonly AirStrikeOrder[];
  readonly ferryOrders: readonly FerryOrder[];
  readonly dropOrders: readonly AirDropOrder[];
}): { readonly strikes: AirStrikeOrder[]; readonly ferryOrders: FerryOrder[]; readonly dropOrders: AirDropOrder[] } {
  const explicitStrikeIds = new Set(args.explicitStrikes.map((strike) => strike.unitId));
  const committed = new Set([
    ...args.ferryOrders.map((ferry) => ferry.unitId),
    ...args.dropOrders.map((drop) => drop.unitId),
  ]);
  const byUnit = new Map<string, AirStrikeOrder>();
  for (const strike of args.generatedStrikes) {
    if (!explicitStrikeIds.has(strike.unitId) && committed.has(strike.unitId)) {
      logDebug('airDropResolution skip generated strike for ferry or drop', { unitId: strike.unitId });
      continue;
    }
    byUnit.set(strike.unitId, strike);
  }
  for (const strike of args.explicitStrikes) byUnit.set(strike.unitId, strike);
  const strikes = [...byUnit.values()];
  logDebug('airDropResolution reconcileHumanAirActions', {
    strikeCount: strikes.length,
    ferryCount: args.ferryOrders.length,
    dropCount: args.dropOrders.length,
  });
  return { strikes, ferryOrders: [...args.ferryOrders], dropOrders: [...args.dropOrders] };
}

/**
 * Resolves strategic air drops.
 *
 * Purpose: Every infantry unit aboard lands on the target when the air unit is not shot down. A hit deletes the air unit and all its infantry, and none of it lands.
 * When to use: After air-strike transport losses, with the same combat die the strike phase used.
 * Expected outcome: One animation row per drop that passed validation and was not skipped. Anti-air dice are `kind: 'antiAir'`.
 * Exceptions: None.
 */
export function resolveAirDropPhase(
  orders: readonly AirDropOrder[],
  rollDie: () => number,
  originHitBonusAt: OriginHitBonusLookup = noOriginHitBonus,
  techHitBonusAt: TechHitBonusLookup = noTechHitBonus
): AirDropPhaseResult {
  logDebug('airDropResolution resolveAirDropPhase', { orderCount: orders.length });
  const diceLog: CombatDiceLog = createCombatDiceLog();
  const moves: AirDropAnimationMove[] = [];
  const removedUnitIds: string[] = [];
  const removedUnits: CombatUnit[] = [];
  const carrierIdByCargoId = new Map<string, string>();
  for (const order of orders) {
    const owner = dbGetOne<{ player: string }>('SELECT player FROM units WHERE id = ?', [order.unitId]);
    if (!owner) continue;
    const checked = validateAirDropOrder(order.unitId, order.targetH3Index, { allowedPlayer: owner.player });
    if (!checked.valid) {
      logDebug('airDropResolution skip drop', { unitId: order.unitId, reason: checked.reason });
      continue;
    }
    const carrier = dbGetOne<{ id: string; player: string; h3Index: string; displayOrder: number | null }>(
      'SELECT id, player, h3_index AS h3Index, display_order AS displayOrder FROM units WHERE id = ? AND unit_type = ?',
      [order.unitId, 'air']
    );
    const infantry = dbGetAll<{ id: string; player: string; h3Index: string; displayOrder: number | null }>(
      `SELECT lu.id AS id, lu.player AS player, lu.h3_index AS h3Index, lu.display_order AS displayOrder
       FROM unit_transport_assignments uta
       JOIN units lu ON lu.id = uta.land_unit_id
       WHERE uta.naval_unit_id = ?`,
      [order.unitId]
    ).sort((left, right) => compareCodeUnits(left.id, right.id));
    if (!carrier || infantry.length === 0) continue;
    const defenders = dbGetAll<{ id: string; player: string; unit_type: string; h3_index: string }>(
      'SELECT id, player, unit_type, h3_index FROM units WHERE h3_index = ? AND player != ?',
      [order.targetH3Index, carrier.player]
    ).filter((defender) => {
      if (!isLandUnitType(defender.unit_type)) return true;
      return !landUnitSitsOutCombat(defender.id);
    });
    const shotDown = defenders.length > 0 && rollAntiAirCounterFire({
      attacker: {
        id: carrier.id,
        player: carrier.player,
        unit_type: 'air',
        h3_index: carrier.h3Index,
        display_order: carrier.displayOrder,
      },
      targetH3Index: order.targetH3Index,
      defenders,
      rollDie,
      diceLog,
      originHitBonusAt,
      techHitBonusAt,
      weatherAttackPenalty: (defender) => dropWeatherPenalty(defender.id, defender.unit_type, defender.h3_index),
      onAttackerRemoved: () => {
        removedUnitIds.push(carrier.id);
        removedUnits.push({
          id: carrier.id,
          player: carrier.player,
          unitType: 'air',
          h3Index: order.targetH3Index,
          displayOrder: carrier.displayOrder ?? undefined,
        });
      },
    });
    if (shotDown) {
      const lost = applyTransportLossForRemovedCarriers([{
        id: carrier.id,
        player: carrier.player,
        unitType: 'air',
        h3Index: infantry[0].h3Index,
        displayOrder: carrier.displayOrder ?? undefined,
      }]);
      for (const unit of lost.cargo) {
        removedUnitIds.push(unit.id);
        removedUnits.push(unit);
      }
      for (const [cargoId, carrierId] of lost.carrierIdByCargoId) carrierIdByCargoId.set(cargoId, carrierId);
      moves.push({
        unitId: carrier.id,
        player: carrier.player,
        fromH3Index: carrier.h3Index,
        targetH3Index: order.targetH3Index,
        returnsToBase: false,
      });
      continue;
    }
    for (const unit of infantry) {
      dbRun('DELETE FROM unit_transport_assignments WHERE land_unit_id = ?', [unit.id]);
      dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [order.targetH3Index, unit.id]);
    }
    moves.push({
      unitId: carrier.id,
      player: carrier.player,
      fromH3Index: carrier.h3Index,
      targetH3Index: order.targetH3Index,
      returnsToBase: true,
      infantryUnitIds: infantry.map((unit) => unit.id),
    });
  }
  return { moves, removedUnitIds, removedUnits, diceRolls: diceLog.rolls, carrierIdByCargoId };
}

/**
 * Weather penalty for one defender's anti-air roll during a drop.
 *
 * Purpose: The drop uses the same penalty an air-strike counter-fire roll uses.
 * When to use: From `resolveAirDropPhase` only.
 * Expected outcome: 0 when the weather bonus is off.
 * Exceptions: None beyond pack load failures.
 */
function dropWeatherPenalty(unitId: string, unitType: string, h3Index: string): WeatherAttackPenalty {
  const settings = readPersistedOriginBonusSettings({ getOne: dbGetOne, hasDb: () => true });
  const turnNumber = readTurnNumberOrFirst(dbGetOne);
  const birth = dbGetOne<{ birth_h3_index: string | null }>('SELECT birth_h3_index FROM units WHERE id = ?', [unitId])?.birth_h3_index;
  return weatherPenaltyForRoll({
    unitType,
    kind: 'ranged',
    level: weatherBonusLevelOf(settings),
    turnNumber,
    startMonth: settings.startMonth ?? 1,
    unitH3Index: h3Index,
    tags: weatherTagsForBirthHex(birth),
  });
}
