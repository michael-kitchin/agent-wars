/**
 * Playback, infrastructure counts, and loss notes for one resolved tactical beat.
 *
 * Purpose: A human beat and an AI-only beat record the same combat fields from one outcome.
 * When to use: `commitHumanTacticalDraftOrders` and `commitAiOnlyTacticalBeat` after the beat succeeds.
 * Expected outcome: March rows, combat fields, reconciled city counts, and one tactical loss note per active AI seat.
 */

import { HUMAN_SEAT_ID, type OwnerId } from '../../shared/seatIds';
import { clipTacticalMarchPathToDestination } from '../../shared/tacticalMarchPlaybackPath.js';
import type { TacticalCommitResolutionPlayback } from '../../shared/ipcTypes';
import type { TacticalPlaybackMarchMove } from '../../shared/ipc/tacticalPlaybackTypes';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { combatDicePlaybackFields } from '../combatDiceRecording';
import { effectiveTacticalMovementPointBudgetForMarchLeg } from '../../shared/tacticalTerrainCombatModifiers';
import { tacticalMarchSetForMover } from '../../shared/tacticalFortificationMovement';
import { tacticalMovementUnitTypeForPathfinding } from '../../shared/tacticalTerrainMovement';
import { reconcileStrategicInfrastructureCountsFromTacticalOverrides } from '../gameDb';
import { logDebug, logTrace } from '../logger';
import { tacticalMarchFirstStopAlongPath } from '../tacticalBattle/tacticalRulesAdapter';
import type { TacticalBeatOutcome } from '../tacticalBattle/tacticalBeatOutcome';
import { captureTurnLossNoteFromResolution } from './captureTurnLossNote';

/**
 * Terrain and weather fields a march leg reads from the battle that is about to resolve.
 *
 * Purpose: March playback and the applied first stop share one view of the pre-beat snapshot.
 * When to use: `tacticalTerrainBattleView` and the march helpers that take that view.
 * Expected outcome: The fields `effectiveTacticalMovementPointBudgetForMarchLeg` and `tacticalMarchFirstStopAlongPath` read.
 * Exceptions: None.
 */
export type TacticalTerrainBattleView = ReturnType<typeof tacticalTerrainBattleView>;

/**
 * The terrain, weather, and roster fields a march leg reads, copied from the pre-beat snapshot.
 *
 * Purpose: Playback plans the path from the positions and terrain that existed before the beat was applied.
 * When to use: Before building march rows for any seat.
 * Expected outcome: A view whose optional maps are present only when the snapshot has them.
 * Exceptions: None.
 */
export function tacticalTerrainBattleView(preBattle: TacticalBattleSnapshot): {
  battleId: string;
  tacticalTurnNumber: number;
  subUnits: TacticalSubUnitSnapshot[];
  tacticalChildH3Indexes: string[];
  tacticalTerrainKindByH3: TacticalBattleSnapshot['tacticalTerrainKindByH3'];
  strategicHexTerrain: TacticalBattleSnapshot['strategicHexTerrain'];
  strategicHexTerrainKind: TacticalBattleSnapshot['strategicHexTerrainKind'];
  tacticalIsSeaportByH3?: TacticalBattleSnapshot['tacticalIsSeaportByH3'];
  tacticalIsUrbanByH3?: TacticalBattleSnapshot['tacticalIsUrbanByH3'];
  tacticalIsRubbleByH3?: TacticalBattleSnapshot['tacticalIsRubbleByH3'];
  tacticalRoadSidesByH3?: TacticalBattleSnapshot['tacticalRoadSidesByH3'];
  tacticalRailSidesByH3?: TacticalBattleSnapshot['tacticalRailSidesByH3'];
  weatherBonusEnabled?: true;
  weatherBonusLevel?: TacticalBattleSnapshot['weatherBonusLevel'];
  weather?: TacticalBattleSnapshot['weather'];
  terrainBonusEnabled?: true;
} {
  logTrace('tacticalTerrainBattleView', { battleId: preBattle.battleId, beat: preBattle.tacticalTurnNumber });
  return {
    battleId: preBattle.battleId,
    tacticalTurnNumber: preBattle.tacticalTurnNumber,
    subUnits: preBattle.subUnits,
    tacticalChildH3Indexes: preBattle.tacticalChildH3Indexes,
    tacticalTerrainKindByH3: preBattle.tacticalTerrainKindByH3,
    strategicHexTerrain: preBattle.strategicHexTerrain,
    strategicHexTerrainKind: preBattle.strategicHexTerrainKind,
    ...(preBattle.tacticalIsSeaportByH3 ? { tacticalIsSeaportByH3: preBattle.tacticalIsSeaportByH3 } : {}),
    ...(preBattle.tacticalIsUrbanByH3 ? { tacticalIsUrbanByH3: preBattle.tacticalIsUrbanByH3 } : {}),
    ...(preBattle.tacticalIsRubbleByH3 ? { tacticalIsRubbleByH3: preBattle.tacticalIsRubbleByH3 } : {}),
    ...(preBattle.tacticalRoadSidesByH3 ? { tacticalRoadSidesByH3: preBattle.tacticalRoadSidesByH3 } : {}),
    ...(preBattle.tacticalRailSidesByH3 ? { tacticalRailSidesByH3: preBattle.tacticalRailSidesByH3 } : {}),
    ...(preBattle.weatherBonusEnabled ? { weatherBonusEnabled: true as const, weatherBonusLevel: preBattle.weatherBonusLevel, weather: preBattle.weather } : {}),
    ...(preBattle.terrainBonusEnabled === true ? { terrainBonusEnabled: true as const } : {}),
  };
}

/**
 * March and ferry playback rows for the sub-units `isMover` accepts.
 *
 * Purpose: One loop draws a seat's marches and ferry hops. The human commit uses it for the opposing party. An AI-only commit uses it once per seat.
 * When to use: After the beat, with the pre-beat snapshot and the snapshot from before ferry.
 * Expected outcome: One row per march that changed cell, then one row per air ferry that changed cell. `to` is the post-movement cell.
 * Exceptions: None. A unit that is not a mover, or that did not change cell, is left out.
 */
export function buildSeatPlaybackMoves(args: {
  readonly preBattle: TacticalBattleSnapshot;
  readonly postMovementBattle: TacticalBattleSnapshot;
  readonly terrainBattle: TacticalTerrainBattleView;
  readonly movementOrders: readonly { unitId: string; toH3Index: string }[];
  readonly ferryOrders: readonly { unitId: string; destinationH3Index: string }[];
  readonly isMover: (player: OwnerId) => boolean;
}): TacticalPlaybackMarchMove[] {
  logDebug('buildSeatPlaybackMoves', {
    battleId: args.preBattle.battleId,
    movementCount: args.movementOrders.length,
    ferryCount: args.ferryOrders.length,
  });
  const moves: TacticalPlaybackMarchMove[] = [];
  for (const order of args.movementOrders) {
    const su = args.preBattle.subUnits.find((unit) => unit.id === order.unitId);
    if (!su || !args.isMover(su.player)) continue;
    const from = su.h3Index;
    if (from === order.toH3Index) continue;
    const after = args.postMovementBattle.subUnits.find((unit) => unit.id === order.unitId);
    const to = after?.h3Index ?? order.toH3Index;
    if (from === to) continue;
    const moveType = tacticalMovementUnitTypeForPathfinding(su, order.toH3Index);
    const maxEdges = effectiveTacticalMovementPointBudgetForMarchLeg(
      args.terrainBattle,
      su,
      args.preBattle.subUnits,
      moveType
    );
    let pathH3Indexes: string[] | undefined;
    if (maxEdges > 0) {
      const march = tacticalMarchFirstStopAlongPath(
        from,
        order.toH3Index,
        maxEdges,
        tacticalMarchSetForMover({ battle: args.preBattle, moverPlayer: su.player, originH3: from }),
        args.terrainBattle,
        moveType,
        su
      );
      pathH3Indexes = clipTacticalMarchPathToDestination(to, march.pathH3Prefix);
    }
    moves.push({
      unitId: order.unitId,
      fromH3Index: from,
      toH3Index: to,
      ...(pathH3Indexes ? { pathH3Indexes } : {}),
    });
  }
  for (const ferry of args.ferryOrders) {
    const unit = args.postMovementBattle.subUnits.find((row) => row.id === ferry.unitId);
    if (!unit || unit.unitType !== 'air' || !args.isMover(unit.player)) continue;
    if (unit.h3Index === ferry.destinationH3Index) continue;
    moves.push({ unitId: ferry.unitId, fromH3Index: unit.h3Index, toH3Index: ferry.destinationH3Index });
  }
  return moves;
}

/**
 * Combat playback fields for one beat, omitting arrays that are empty.
 *
 * Purpose: Ranged hexes, shot lines, kills, infrastructure, air strikes, melee, and dice are the same on a human beat and an AI-only beat.
 * When to use: After march rows are chosen. `rangedTargetHexes` is every ranged order's target, human orders first when both exist.
 * Expected outcome: A partial playback. An empty list is omitted. Dice use `combatDicePlaybackFields`.
 * Exceptions: None.
 */
export function buildTacticalCombatPlaybackFields(
  outcome: TacticalBeatOutcome,
  rangedTargetHexes: readonly string[]
): Partial<TacticalCommitResolutionPlayback> {
  logDebug('buildTacticalCombatPlaybackFields', {
    battleId: outcome.battle.battleId,
    rangedTargetCount: rangedTargetHexes.length,
    removedCount: outcome.removedUnits.length,
    fortificationReportCount: outcome.fortificationReports.length,
  });
  const rangedCombatHexes = [...new Set(rangedTargetHexes)];
  const casualtyHexSet = new Set(outcome.removedUnits.map((unit) => unit.h3Index));
  const rangedCasualtyHexes = rangedCombatHexes.filter((hex) => casualtyHexSet.has(hex));
  const meleePack = outcome.meleePack;
  return {
    rangedCombatHexes: rangedCombatHexes.length > 0 ? rangedCombatHexes : undefined,
    rangedCasualtyHexes: rangedCasualtyHexes.length > 0 ? rangedCasualtyHexes : undefined,
    rangedRemovedUnits: outcome.removedUnits.length > 0 ? outcome.removedUnits : undefined,
    rangedResolutionShotLines: outcome.rangedResolutionShotLines.length > 0 ? outcome.rangedResolutionShotLines : undefined,
    killsByDirectFire: outcome.killsByDirectFire.length > 0 ? outcome.killsByDirectFire : undefined,
    killsByReturnFire: outcome.killsByReturnFire.length > 0 ? outcome.killsByReturnFire : undefined,
    killsByAirStrike: outcome.killsByAirStrike.length > 0 ? outcome.killsByAirStrike : undefined,
    infrastructureDestroyedEvents:
      outcome.infrastructureDestroyedEvents.length > 0 ? outcome.infrastructureDestroyedEvents : undefined,
    fortificationReports: outcome.fortificationReports.length > 0 ? [...outcome.fortificationReports] : undefined,
    airStrikeAttemptCount: outcome.airStrikeAttemptCount > 0 ? outcome.airStrikeAttemptCount : undefined,
    ...(outcome.airStrikePlaybackMoves.length > 0 ? { airStrikeMoves: outcome.airStrikePlaybackMoves } : {}),
    ...(outcome.airDropPlaybackMoves && outcome.airDropPlaybackMoves.length > 0
      ? { airDropMoves: [...outcome.airDropPlaybackMoves] }
      : {}),
    ...(outcome.airStrikePlaybackStrikeHexes.length > 0 ? { airStrikeHexes: outcome.airStrikePlaybackStrikeHexes } : {}),
    ...(outcome.airStrikePlaybackCasualtyHexes.length > 0
      ? { airStrikeCasualtyHexes: outcome.airStrikePlaybackCasualtyHexes }
      : {}),
    ...(outcome.airStrikePlaybackRemovedUnits.length > 0
      ? { airStrikeRemovedUnits: outcome.airStrikePlaybackRemovedUnits }
      : {}),
    killsByMelee: meleePack.killsByMelee.length > 0 ? meleePack.killsByMelee : undefined,
    meleeCombatHexes: meleePack.meleeCombatHexes.length > 0 ? meleePack.meleeCombatHexes : undefined,
    meleeCasualtyHexes: meleePack.meleeCasualtyHexes.length > 0 ? meleePack.meleeCasualtyHexes : undefined,
    meleeRemovedUnits: meleePack.meleeRemovedUnits.length > 0 ? meleePack.meleeRemovedUnits : undefined,
    ...combatDicePlaybackFields(outcome.airStrikeDiceRolls, outcome.rangedDiceRolls, meleePack.meleeDiceRolls),
  };
}

/**
 * Writes strategic infrastructure counts when this beat destroyed any.
 *
 * Purpose: A tactical strike that removes a city's infrastructure has to show up on the strategic map.
 * When to use: After a successful beat and before playback is returned. `logLabel` is the caller's existing debug message.
 * Expected outcome: Counts are reconciled only when `infrastructureDestroyedEvents` is non-empty. The debug line names how many hexes changed.
 * Exceptions: None. The database helper logs its own failures.
 */
export function reconcileInfrastructureAfterTacticalBeat(outcome: TacticalBeatOutcome, logLabel: string): void {
  logDebug('reconcileInfrastructureAfterTacticalBeat', {
    battleId: outcome.battle.battleId,
    eventCount: outcome.infrastructureDestroyedEvents.length,
  });
  if (outcome.infrastructureDestroyedEvents.length === 0) return;
  const { changedHexCount } = reconcileStrategicInfrastructureCountsFromTacticalOverrides();
  logDebug(logLabel, {
    changedHexCount,
    eventCount: outcome.infrastructureDestroyedEvents.length,
  });
}

/**
 * Stores this beat's losses as a tactical turn note for each active AI seat.
 *
 * Purpose: Recent Turn Notes in the next tactical briefing can name who was lost on the beat that just finished.
 * When to use: After embark rows for this beat have been written, so the note matches the stored battle.
 * Expected outcome: One note at `tacticalTurnNumber - 1` (at least 1). An air unit of the human seat that was not a ranged victim is treated as an air-strike loss.
 * Exceptions: None. The note writer logs a database failure.
 */
export function captureTacticalBeatLossNote(outcome: TacticalBeatOutcome): void {
  const battle = outcome.battle;
  logDebug('captureTacticalBeatLossNote', {
    battleId: battle.battleId,
    tacticalTurnNumber: battle.tacticalTurnNumber,
    removedCount: outcome.removedUnits.length,
  });
  const tacticalRemovedById = new Map(outcome.removedUnits.map((unit) => [unit.id, unit] as const));
  for (const unit of outcome.meleePack.meleeRemovedUnits ?? []) tacticalRemovedById.set(unit.id, unit);
  const tacticalRemovedAll = [...tacticalRemovedById.values()];
  const airStrikeVictimIds = new Set((outcome.killsByAirStrike ?? []).map((kill) => kill.victimId));
  const rangedVictimIds = new Set(outcome.killsByDirectFire.map((kill) => kill.victimId));
  const airStrikeRemovedUnits = tacticalRemovedAll.filter((unit) => {
    if (airStrikeVictimIds.has(unit.id)) return true;
    if (unit.player === HUMAN_SEAT_ID && unit.unitType === 'air' && !rangedVictimIds.has(unit.id)) return true;
    return false;
  });
  captureTurnLossNoteFromResolution({
    scope: 'tactical',
    battleId: battle.battleId,
    turnNumber: Math.max(1, battle.tacticalTurnNumber - 1),
    killsByDirectFire: outcome.killsByDirectFire,
    killsByReturnFire: outcome.killsByReturnFire,
    killsByMelee: outcome.meleePack.killsByMelee,
    killsByAirStrike: outcome.killsByAirStrike,
    removedUnits: tacticalRemovedAll,
    airStrikeRemovedUnits,
    airStrikeMoves: outcome.airStrikePlaybackMoves,
  });
}
