/**
 * Air-drop rows for Best Options This Turn.
 *
 * Purpose: An air unit that has infantry aboard, or that shares its hex with an unembarked friendly infantry unit,
 *   gets drop rows beside its strike or ferry rows. The model picks one air action. The lead side of an AI-only
 *   battle embarks after the drop, so that side lists a drop only when the infantry is already aboard.
 * When to use: From `collectAggregatedPossibleActionRows` when the table is Best Options This Turn.
 * Expected outcome: Land hexes within strike range, or battle cells, that hold an enemy or a city the owner does not control.
 * Exceptions: None.
 */

import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { landUnitCanOccupyHex } from '../../shared/landTraversalStrategic';
import { getStrategicLandMassByH3 } from '../terrainClassificationCache';
import { isNeutralBorderHex } from '../../shared/h3Resolutions';
import { logDebug, logTrace } from '../logger';
import { tacticalAirDropTargetRefusal } from '../tacticalBattle/tacticalAirDrop';
import {
  airBaseHasIntactAirport,
  getInfra,
  type PossibleActionsIndexedState,
} from './possibleUnitActionsIndexedState';
import { collectStrikeHexesForAirUnit } from './possibleUnitActionsDestinations';
import {
  tacticalBestOptionsUrbanHexCount,
  type TacticalBestOptionsInterestContext,
} from './possibleUnitActionsBestOptionsInterest';

/**
 * One roster row the drop listing reads for cargo and a shared hex.
 *
 * Purpose: Strategic units and battle sub-units store the carrier id under different field names.
 * When to use: The caller copies `embarkedOnCarrierUnitId` or `embarkedOnSubUnitId` into `carrierId`.
 * Expected outcome: `carrierId` is the air unit this infantry is aboard, or null when it is free to embark.
 * Exceptions: None.
 */
export type AirDropRosterUnit = {
  /** Stable unit id. Contract: Matches the air unit id the table row will name. */
  readonly id: string;
  /** Owning seat. Contract: Compared with the air unit's player for a shared hex. */
  readonly player: string;
  /** Engine unit type. Contract: Only `infantry` counts as cargo or as a unit that can embark. */
  readonly unitType: string;
  /** Current hex or battle cell. Contract: A shared infantry unit uses the same index as the air unit. */
  readonly h3Index: string;
  /** Air unit this infantry is aboard, or null. Contract: A non-null value means the unit cannot embark again. */
  readonly carrierId: string | null;
};

/**
 * Whether this air unit can list a drop because infantry is aboard or waiting on its hex.
 *
 * Purpose: Strategic embark, and every tactical embark except the lead side of an AI-only battle, runs before the drop.
 *   A free infantry unit on the hex is enough for those sides. The lead side's embark runs after the drop.
 * When to use: Before collecting drop targets. Pass `freeInfantryCounts: false` for that lead side.
 * Expected outcome: True when one own infantry unit is aboard this air unit, or when free infantry counts and one own
 *   unembarked infantry unit shares its hex. Armor and another side's infantry do not count.
 * Exceptions: None.
 */
export function airUnitCanListDrop(input: {
  readonly airUnitId: string;
  readonly airH3Index: string;
  readonly owner: string;
  readonly roster: readonly AirDropRosterUnit[];
  /**
   * Whether infantry that is on the hex but not aboard can make this beat's drop legal.
   *
   * Contract: False only for the lead side of an AI-only battle. Omitted means true.
   * When to use: The briefing entry sets it from `leadPartyId`.
   * Expected outcome: A false value ignores co-located infantry and keeps an infantry unit already aboard.
   * Exceptions: None.
   */
  readonly freeInfantryCounts?: boolean;
}): boolean {
  const freeInfantryCounts = input.freeInfantryCounts !== false;
  const aboard = input.roster.some(
    (row) => row.unitType === 'infantry' && row.carrierId === input.airUnitId
  );
  const sharing =
    freeInfantryCounts &&
    input.roster.some(
      (row) =>
        row.unitType === 'infantry' &&
        row.player === input.owner &&
        row.h3Index === input.airH3Index &&
        row.carrierId == null
    );
  logTrace('possibleUnitActionsAirDrop airUnitCanListDrop', {
    airUnitId: input.airUnitId,
    aboard,
    sharing,
    freeInfantryCounts,
  });
  return aboard || sharing;
}

/**
 * Whether one strategic hex is a drop the briefing should list.
 *
 * Purpose: The ground-move interest filter skips an empty enemy city and keeps a bare airport. A drop does neither.
 * When to use: For each land hex within strike range of the air unit's base.
 * Expected outcome: True when the hex can hold a land unit and an enemy unit is on it, or it has urban cells and the
 *   controller is not the air unit's owner, including no controller. False when the hex cannot hold a land unit, when
 *   it is the owner's empty city, and when it is an empty uncontrolled airport. The caller drops the air unit's own hex.
 * Exceptions: None.
 */
export function isStrategicAirDropTarget(input: {
  readonly h3Index: string;
  readonly owner: string;
  readonly enemyOccupied: boolean;
  readonly urbanCellCount: number;
  readonly controller: string | null;
  readonly canOccupy: boolean;
}): boolean {
  const listed =
    input.canOccupy &&
    (input.enemyOccupied || (input.urbanCellCount > 0 && input.controller !== input.owner));
  logTrace('possibleUnitActionsAirDrop isStrategicAirDropTarget', {
    h3Index: input.h3Index,
    listed,
  });
  return listed;
}

/**
 * Roster the drop listing reads, from the strategic seat or from the battle's sub-units.
 *
 * Purpose: Strategic cargo is `embarkedOnCarrierUnitId`. A battle stores it as `embarkedOnSubUnitId` and does not
 *   copy the strategic assignment onto sub-units.
 * When to use: Once per Best Options collection, before the unit loop.
 * Expected outcome: One row per unit or sub-unit. `carrierId` is null when the unit is not embarked.
 * Exceptions: None.
 */
export function airDropRosterForBriefing(
  source:
    | { readonly battle: TacticalBattleSnapshot }
    | {
        readonly units: readonly {
          readonly id: string;
          readonly player: string;
          readonly unitType: string;
          readonly h3Index: string;
          readonly embarkedOnCarrierUnitId?: string | null;
        }[];
      }
): AirDropRosterUnit[] {
  if ('battle' in source) {
    const roster = source.battle.subUnits.map((row) => ({
      id: row.id,
      player: row.player,
      unitType: row.unitType,
      h3Index: row.h3Index,
      carrierId: row.embarkedOnSubUnitId ?? null,
    }));
    logDebug('possibleUnitActionsAirDrop airDropRosterForBriefing', {
      mode: 'tactical',
      rosterCount: roster.length,
    });
    return roster;
  }
  const roster = source.units.map((row) => ({
    id: row.id,
    player: row.player,
    unitType: row.unitType,
    h3Index: row.h3Index,
    carrierId: row.embarkedOnCarrierUnitId ?? null,
  }));
  logDebug('possibleUnitActionsAirDrop airDropRosterForBriefing', {
    mode: 'strategic',
    rosterCount: roster.length,
  });
  return roster;
}

/**
 * Drop hexes or cells for one air unit, or an empty list when it cannot list a drop.
 *
 * Purpose: One call from the Best Options collector, so that file stays under the source-size limit.
 * When to use: For each air unit while `forThisTurn` is set.
 * Expected outcome: Strategic hexes within strike range of an intact airport that `isStrategicAirDropTarget` keeps.
 *   In a battle, footprint cells the target refusal allows that hold an enemy or a city the owner does not control.
 *   Empty when the air unit has no infantry aboard and no friendly infantry on its hex. The lead side of an
 *   AI-only battle ignores that free infantry, because its embark is applied after the drop.
 * Exceptions: None.
 */
export function airDropTargetHexesForBriefing(input: {
  readonly unit: AirDropRosterUnit;
  readonly roster: readonly AirDropRosterUnit[];
  readonly indexed: PossibleActionsIndexedState;
  readonly tactical?: {
    readonly battle: TacticalBattleSnapshot;
    readonly interest: TacticalBestOptionsInterestContext;
  };
}): string[] {
  const freeInfantryCounts = input.tactical?.battle.leadPartyId !== input.unit.player;
  const canList =
    input.unit.unitType === 'air' &&
    airUnitCanListDrop({
      airUnitId: input.unit.id,
      airH3Index: input.unit.h3Index,
      owner: input.unit.player,
      roster: input.roster,
      freeInfantryCounts,
    });
  const targets = !canList
    ? []
    : input.tactical
      ? tacticalAirDropTargets(input.unit, input.tactical.battle, input.tactical.interest)
      : strategicAirDropTargets(input.unit, input.indexed);
  logDebug('possibleUnitActionsAirDrop airDropTargetHexesForBriefing', {
    unitId: input.unit.id,
    mode: input.tactical ? 'tactical' : 'strategic',
    canList,
    freeInfantryCounts,
    targetCount: targets.length,
  });
  return targets;
}

/**
 * Strategic drop hexes within strike range of an intact airport.
 *
 * Purpose: Keeps the public entry to one branch.
 * When to use: When no battle snapshot was passed.
 * Expected outcome: Empty when the air unit's hex is a neutral border or has no intact airport. The air unit's own hex is not a target.
 * Exceptions: None.
 */
function strategicAirDropTargets(unit: AirDropRosterUnit, indexed: PossibleActionsIndexedState): string[] {
  if (isNeutralBorderHex(unit.h3Index)) return [];
  if (!airBaseHasIntactAirport(indexed, unit.h3Index)) return [];
  const landMass = getStrategicLandMassByH3();
  return collectStrikeHexesForAirUnit(unit.h3Index, indexed).filter((h3) => {
    if (h3 === unit.h3Index) return false;
    return isStrategicAirDropTarget({
      h3Index: h3,
      owner: unit.player,
      enemyOccupied: (indexed.enemyUnitsByHex.get(h3)?.length ?? 0) > 0,
      urbanCellCount: getInfra(indexed, h3).urban,
      controller: indexed.controlByHex.get(h3) ?? null,
      canOccupy: landUnitCanOccupyHex(h3, landMass),
    });
  });
}

/**
 * Battle cells an embarked or co-located infantry unit could be dropped on.
 *
 * Purpose: The target refusal ignores cargo, because the embark order is not stored yet.
 * When to use: When the briefing is for an active battle.
 * Expected outcome: Cells the refusal allows that hold an enemy sub-unit, or urban cells whose enclosing
 *   hex is not controlled by the air unit's owner. Rubble is not a city.
 * Exceptions: None.
 */
function tacticalAirDropTargets(
  unit: AirDropRosterUnit,
  battle: TacticalBattleSnapshot,
  interest: TacticalBestOptionsInterestContext
): string[] {
  return battle.tacticalChildH3Indexes.filter((cell) => {
    if (tacticalAirDropTargetRefusal(battle, unit, cell)) return false;
    if (interest.humanOccupiedH3.has(cell)) return true;
    return (
      tacticalBestOptionsUrbanHexCount(cell, interest) > 0 && interest.enclosingController !== unit.player
    );
  });
}
