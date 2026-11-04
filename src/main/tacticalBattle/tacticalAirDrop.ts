/**
 * Tactical air-drop legality and resolution.
 *
 * Purpose: An air sub-unit lands its infantry on a battle cell and stays where it is.
 * When to use: Group targeting, and the air phase after strikes and before ranged fire.
 * Expected outcome: One infantry moves to the cell, or return fire removes the air unit and that infantry.
 * Exceptions: None. An illegal order is skipped.
 */

import type { AirDropAnimationMove, AirDropOrder, FerryOrder } from '../../shared/ipcTypes';
import type { KillEdge } from '../../shared/ipc/combatResultTypes';
import type { RemovedUnitSnapshot } from '../../shared/ipc/readyTypes';
import { removedUnitSnapshot } from '../../shared/lossFlagFacts';
import { TACTICAL_DESTINATION_BLOCKS_ENTRY_REASON } from '../../shared/marchInvalidReasons';
import { FORTIFIED_CELL_BLOCKED_HOVER } from '../../shared/fortificationRules';
import { isCellBlockedByFortification } from '../../shared/tacticalFortificationMovement';
import {
  tacticalCellBlocksEntry,
  terrainEffectsInputForBattleCell,
} from '../../shared/tacticalMarchDestinationBlock';
import { unitHasTacticalRangedBaseline } from '../../shared/tacticalRanges';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { weatherAttackPenalty, weatherBonusLevelOf } from '../../shared/weatherBonusRules';
import { attackHitThreshold } from '../combatHitThresholds';
import { rollCombatDieAgainst, type CombatDiceRollSink } from '../combatDiceRecording';
import type { OriginHitBonusLookup } from '../originBonus/originHitBonusLookup';
import type { TechHitBonusLookup } from '../techBonus/techHitBonusLookup';
import { logDebug } from '../logger';
import { markTacticalSubUnitCasualty } from './tacticalAirStrikeUnits';
import { tacticalEmbarkedLandExcludedFromRangedInput } from './tacticalCombatInput';
import type { SubmitOrdersResult } from '../gameActions/gameActionsTypes';

/**
 * Ferry rows whose air unit is dropping on this beat.
 *
 * Purpose: A drop and a ferry cannot both happen. A strike cancels the drop, so that unit's ferry stays for the strike rule.
 * When to use: Before the tactical ferry phase.
 * Expected outcome: The same list when no remaining drop names those units. Otherwise the ferries for dropping units are gone.
 * Exceptions: None.
 */
export function withoutFerryForDroppedUnits(
  ferryOrders: readonly FerryOrder[] | undefined,
  dropOrders: readonly AirDropOrder[] | undefined,
  strikeUnitIds: ReadonlySet<string>
): readonly FerryOrder[] | undefined {
  if (!ferryOrders?.length) return ferryOrders;
  const dropping = new Set(
    (dropOrders ?? []).filter((order) => !strikeUnitIds.has(order.unitId)).map((order) => order.unitId)
  );
  if (dropping.size === 0) return ferryOrders;
  return ferryOrders.filter((order) => !dropping.has(order.unitId));
}

/**
 * Why one tactical drop is illegal, or null when it can land.
 *
 * Purpose: Planning and resolution share one gate.
 * When to use: For each selected air sub-unit, and again when the beat resolves.
 * Expected outcome: Null when the air unit carries one infantry unit and the cell is land inside the footprint.
 *   A fortified cell owned by someone else is `Blocked: Fortified`. Enemy units on the cell do not refuse the drop.
 * Exceptions: None.
 */
export function tacticalAirDropRefusal(
  battle: TacticalBattleSnapshot,
  unitId: string,
  targetH3Index: string
): string | null {
  const unit = battle.subUnits.find((row) => row.id === unitId);
  if (!unit) return 'Unknown unit';
  if (unit.unitType !== 'air') return 'Only air units can air drop';
  const infantry = battle.subUnits.filter(
    (row) => row.unitType === 'infantry' && row.embarkedOnSubUnitId === unitId
  );
  if (infantry.length !== 1) return 'Air drop needs exactly one infantry unit aboard.';
  if (!battle.tacticalChildH3Indexes.includes(targetH3Index)) return 'Target is outside the tactical battle.';
  if (targetH3Index === unit.h3Index) return "Air drop cannot target the air unit's own hex.";
  if (isCellBlockedByFortification(battle, targetH3Index, unit.player)) return FORTIFIED_CELL_BLOCKED_HOVER;
  if (
    tacticalCellBlocksEntry({
      input: terrainEffectsInputForBattleCell(battle, targetH3Index),
      moveType: 'infantry',
      allowsTerrainBonusStop: false,
    })
  ) {
    return TACTICAL_DESTINATION_BLOCKS_ENTRY_REASON;
  }
  return null;
}

/**
 * Validates one drop target for every selected air sub-unit.
 *
 * Purpose: One illegal unit queues nothing.
 * When to use: The group air-drop IPC while a battle is active.
 * Expected outcome: Success when every id belongs to `allowedPlayer` and can drop on the cell. Otherwise the first reason.
 * Exceptions: None.
 */
export function validateTacticalAirDropGroup(
  battle: TacticalBattleSnapshot,
  unitIds: readonly string[],
  targetH3Index: string,
  allowedPlayer: string
): SubmitOrdersResult {
  logDebug('tacticalAirDrop validateTacticalAirDropGroup', {
    battleId: battle.battleId,
    unitCount: unitIds.length,
    targetH3Index,
    allowedPlayer,
  });
  const unique = [...new Set(unitIds.filter((id) => id.trim() !== ''))];
  if (unique.length === 0) return { success: false, reason: 'No selected units for air drop' };
  for (const unitId of unique) {
    const unit = battle.subUnits.find((row) => row.id === unitId);
    if (!unit || unit.player !== allowedPlayer) return { success: false, reason: 'That unit is not yours.' };
    const reason = tacticalAirDropRefusal(battle, unitId, targetH3Index);
    if (reason) return { success: false, reason };
  }
  return { success: true };
}

/**
 * The sub-units, removals, and playback after one drop pass.
 *
 * Purpose: The air phase replaces its working list with this result.
 * When to use: The return of `resolveTacticalAirDrops`.
 * Expected outcome: Surviving infantry is on the target. A shot-down air unit and its infantry are in `removedUnits`.
 * Exceptions: None.
 */
export type TacticalAirDropResolution = {
  readonly subUnits: TacticalSubUnitSnapshot[];
  readonly removedUnits: RemovedUnitSnapshot[];
  readonly moves: AirDropAnimationMove[];
  readonly killsByReturnFire: KillEdge[];
};

/**
 * Lands infantry from air units that are not striking this beat.
 *
 * Purpose: The air unit does not change cells. Return fire uses the same anti-air dice as a strike against units.
 * When to use: After tactical air strikes, before ranged fire.
 * Expected outcome: A miss or an empty cell moves the infantry and clears its assignment. A hit removes the air unit and the infantry.
 *   Dice are reported through `onRoll`. No attack roll is made against the defenders.
 * Exceptions: None. An illegal order is logged and skipped.
 */
export function resolveTacticalAirDrops(args: {
  readonly battle: TacticalBattleSnapshot;
  readonly orders: readonly AirDropOrder[];
  readonly strikeUnitIds: ReadonlySet<string>;
  readonly rollDie: () => number;
  readonly onRoll: CombatDiceRollSink;
  readonly originHitBonusAt: OriginHitBonusLookup;
  readonly techHitBonusAt: TechHitBonusLookup;
}): TacticalAirDropResolution {
  logDebug('tacticalAirDrop resolveTacticalAirDrops', {
    battleId: args.battle.battleId,
    orderCount: args.orders.length,
    strikeCount: args.strikeUnitIds.size,
  });
  let sub = args.battle.subUnits.map((row) => ({ ...row }));
  const removedUnits: RemovedUnitSnapshot[] = [];
  const moves: AirDropAnimationMove[] = [];
  const killsByReturnFire: KillEdge[] = [];
  const removedIds = new Set<string>();
  for (const order of args.orders) {
    if (args.strikeUnitIds.has(order.unitId) || removedIds.has(order.unitId)) {
      logDebug('tacticalAirDrop skip drop for a striking or removed air unit', { unitId: order.unitId });
      continue;
    }
    const battleNow = { ...args.battle, subUnits: sub };
    const reason = tacticalAirDropRefusal(battleNow, order.unitId, order.targetH3Index);
    if (reason) {
      logDebug('tacticalAirDrop skip illegal drop', { unitId: order.unitId, reason });
      continue;
    }
    const attacker = sub.find((row) => row.id === order.unitId);
    if (!attacker) continue;
    const defenders = sub.filter(
      (row) =>
        row.h3Index === order.targetH3Index &&
        row.player !== attacker.player &&
        !removedIds.has(row.id) &&
        ((row.unitType !== 'infantry' && row.unitType !== 'armor') ||
          !tacticalEmbarkedLandExcludedFromRangedInput(battleNow, sub, row))
    );
    const shooters = defenders.filter((row) => unitHasTacticalRangedBaseline(row.unitType));
    let shotDown = false;
    for (const defender of shooters) {
      if (shotDown || removedIds.has(defender.id)) continue;
      const threshold = attackHitThreshold({
        unitType: defender.unitType,
        originHitBonus: args.originHitBonusAt(defender.id, defender.h3Index),
        techAttackBonus: args.techHitBonusAt(defender.id).attack,
        weatherAttackPenalty: weatherAttackPenalty({
          unitType: defender.unitType,
          kind: 'ranged',
          weatherAtUnit: args.battle.weather,
          tags: defender.weatherTags,
          level: weatherBonusLevelOf(args.battle),
        }),
      });
      const hit = rollCombatDieAgainst(
        args.rollDie,
        threshold,
        {
          kind: 'antiAir',
          player: defender.player,
          unitType: defender.unitType,
          anchorH3Index: order.targetH3Index,
        },
        args.onRoll
      );
      if (!hit) continue;
      shotDown = true;
      const toRemove = new Set<string>();
      markTacticalSubUnitCasualty(sub, toRemove, attacker.id, [defender.id], killsByReturnFire);
      for (const id of toRemove) {
        if (removedIds.has(id)) continue;
        removedIds.add(id);
        const row = sub.find((unit) => unit.id === id);
        if (row) removedUnits.push(removedUnitSnapshot(row));
      }
    }
    if (shotDown) {
      sub = sub.filter((row) => !removedIds.has(row.id));
      moves.push({
        unitId: attacker.id,
        player: attacker.player,
        fromH3Index: attacker.h3Index,
        targetH3Index: order.targetH3Index,
        returnsToBase: false,
      });
      continue;
    }
    const infantry = sub.find((row) => row.unitType === 'infantry' && row.embarkedOnSubUnitId === attacker.id);
    if (!infantry) continue;
    sub = sub.map((row) =>
      row.id === infantry.id ? { ...row, h3Index: order.targetH3Index, embarkedOnSubUnitId: null } : row
    );
    moves.push({
      unitId: attacker.id,
      player: attacker.player,
      fromH3Index: attacker.h3Index,
      targetH3Index: order.targetH3Index,
      returnsToBase: true,
      infantryUnitId: infantry.id,
    });
  }
  return { subUnits: sub, removedUnits, moves, killsByReturnFire };
}
