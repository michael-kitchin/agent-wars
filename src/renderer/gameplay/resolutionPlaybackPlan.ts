/**
 * Decides what one resolution result shows.
 *
 * Purpose: The live turn and replay share one computation of visibility, moves, strike lines, and whether the update dialog is needed. The function only computes values.
 * When to use: After a resolution result and the snapshot that followed it are in hand.
 * Expected outcome: A `ResolutionPlaybackPlan` with no change to the page, the state, or the main process.
 * Exceptions: None.
 */

import type { GameStateSnapshot, ReadyResult } from '../../shared/ipcTypes';
import { buildMissilePlaybackMoves, missileLaunchVisibleToViewer } from '../../shared/missileStrikeReport';
import { sightCueBeamsForViewer } from '../../shared/sightCueDrawModel';
import type { ResolutionMove } from '../core/types';
import { buildAirDropOutboundPlaybackMoves, buildAirDropReturnPlaybackMoves } from '../rendering/orderDrawing';
import { deriveCombatVisibilityClassification, reportViewerSeatId } from './readyResolutionAnnouncements';
import type { ReadyHandlerDeps } from './readyHandlerTypes';

/**
 * What one resolution result shows.
 *
 * Purpose: The live turn and replay decide visibility, moves, strike lines, and whether an update dialog is needed from one function.
 * When to use: The value returned by `planResolutionPlayback`.
 * Expected outcome: The values the live turn reads after its snapshot is applied. Values only used to compute others stay inside the function.
 * Exceptions: None.
 */
export interface ResolutionPlaybackPlan {
  /**
   * Every marching and moving unit the playback glides.
   *
   * Contract: The human moves, then the other sides' moves.
   * When to use: The resolution move animation.
   * Expected outcome: One entry per move.
   * Exceptions: None.
   */
  readonly resolutionMoves: ResolutionMove[];
  /**
   * The hexes the viewer can see after the turn.
   *
   * Contract: Taken from the snapshot the plan was given.
   * When to use: Fog filtering of combat marks and dice chips.
   * Expected outcome: A set of hex ids.
   * Exceptions: None.
   */
  readonly visibleHexes: Set<string>;
  /**
   * The missile launches the viewer can see.
   *
   * Contract: A subset of the result's launches.
   * When to use: The update dialog and the strike lines.
   * Expected outcome: Launches seen from a visible hex before or after the turn.
   * Exceptions: None.
   */
  readonly visibleMissileLaunches: NonNullable<ReadyResult['missileLaunches']>;
  /**
   * The sight beams the viewer can see.
   *
   * Contract: Filtered by the viewer.
   * When to use: The playback and the animation decision.
   * Expected outcome: A list of beams.
   * Exceptions: None.
   */
  readonly sightCuesForPlayback: ReturnType<typeof sightCueBeamsForViewer>;
  /**
   * The outbound legs of air strikes, missiles, and air drops.
   *
   * Contract: Built from the strike moves and the air drop moves.
   * When to use: The resolution move animation.
   * Expected outcome: A list of playback moves.
   * Exceptions: None.
   */
  readonly airStrikeOutboundMoves: ReturnType<ReadyHandlerDeps['buildAirStrikeOutboundPlaybackMoves']>;
  /**
   * The return legs of air strikes, missiles, and air drops.
   *
   * Contract: Built from the strike moves and the air drop moves.
   * When to use: The resolution move animation.
   * Expected outcome: A list of playback moves.
   * Exceptions: None.
   */
  readonly airStrikeReturnMoves: ReturnType<ReadyHandlerDeps['buildAirStrikeReturnPlaybackMoves']>;
  /**
   * How much of the combat the viewer could see.
   *
   * Contract: The result of `deriveCombatVisibilityClassification`.
   * When to use: The update dialog and the dice chips.
   * Expected outcome: The classification for this viewer.
   * Exceptions: None.
   */
  readonly visibility: ReturnType<typeof deriveCombatVisibilityClassification>;
  /**
   * Hexes where combat happened that the viewer could not see.
   *
   * Contract: A field of `visibility`.
   * When to use: The unknown-hex marks.
   * Expected outcome: A list of hex ids.
   * Exceptions: None.
   */
  readonly unknownCombatHexes: ReturnType<typeof deriveCombatVisibilityClassification>['unknownCombatHexes'];
  /**
   * Hexes where a casualty happened that the viewer could not see.
   *
   * Contract: A field of `visibility`.
   * When to use: The unknown-hex marks.
   * Expected outcome: A list of hex ids.
   * Exceptions: None.
   */
  readonly unknownCasualtyHexes: ReturnType<typeof deriveCombatVisibilityClassification>['unknownCasualtyHexes'];
  /**
   * The units air strikes and visible missiles removed.
   *
   * Contract: Air strike losses plus the victims of visible missile launches.
   * When to use: The resolution move animation.
   * Expected outcome: A list of removed units.
   * Exceptions: None.
   */
  readonly airStrikeRemovedForPlayback: NonNullable<ReadyResult['airStrikeRemovedUnits'] | ReadyResult['missileStrikeRemovedUnits']>;
  /**
   * The hexes where air strikes caused casualties.
   *
   * Contract: The result's casualty hexes plus the hexes of visible missile victims.
   * When to use: The resolution move animation.
   * Expected outcome: A list of hex ids.
   * Exceptions: None.
   */
  readonly airStrikeCasualtyHexesForPlayback: string[];
  /**
   * The hexes where air strikes were fought.
   *
   * Contract: The result's strike hexes plus the targets of visible missile launches.
   * When to use: The resolution move animation.
   * Expected outcome: A list of hex ids.
   * Exceptions: None.
   */
  readonly airStrikeCombatHexesForPlayback: string[];
  /**
   * Whether the turn has movement or combat to show.
   *
   * Contract: True for any move, ranged, melee, legacy, air strike, or dice result.
   * When to use: The update dialog and the animation decision.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  readonly needsCombatOrMovementAnimation: boolean;
  /**
   * Whether the playback has anything to animate.
   *
   * Contract: `needsCombatOrMovementAnimation` or a visible sight beam.
   * When to use: Starting the animation.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  readonly needsAnimation: boolean;
}

/**
 * What `planResolutionPlayback` reads.
 *
 * Purpose: One object keeps the function within the parameter limit.
 * When to use: The live turn and replay.
 * Expected outcome: The result, the snapshot after it, the human moves, the visibility before it, and three helpers.
 * Exceptions: None.
 */
export interface ResolutionPlaybackPlanInput {
  /**
   * The result of the resolution.
   *
   * Contract: A successful Ready or melee-resolve result.
   * When to use: Every computation.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly readyResult: ReadyResult;
  /**
   * The snapshot after the resolution.
   *
   * Contract: The snapshot the viewer sees after the turn.
   * When to use: The visible hex set.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly state: GameStateSnapshot;
  /**
   * The human side's moves.
   *
   * Contract: The result's human moves, or an empty list.
   * When to use: Joining the moves of every side.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly humanMoves: readonly ResolutionMove[];
  /**
   * The hexes the viewer could see before the turn.
   *
   * Contract: Taken before the turn resolved.
   * When to use: Deciding which missile launches the viewer saw.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly visibleHexesBeforeTurn: ReadonlySet<string>;
  /**
   * The helpers the plan calls.
   *
   * Contract: The visible-hex reader and the two strike-leg builders from the Ready dependencies.
   * When to use: Every computation that needs them.
   * Expected outcome: Called with no side effects.
   * Exceptions: None.
   */
  readonly deps: Pick<ReadyHandlerDeps, 'getVisibleHexSet' | 'buildAirStrikeOutboundPlaybackMoves' | 'buildAirStrikeReturnPlaybackMoves'>;
}

/**
 * Computes what a resolution shows.
 *
 * Purpose: Moves, visible missile launches, sight beams, strike legs, visibility, and the animation decision come from one place, in the order the live turn always computed them.
 * When to use: In `handleReadyButtonClick` after the snapshot is applied, and in replay for a past turn.
 * Expected outcome: The plan. The live turn reads its animation inputs from it, and replay reads its visibility and missile launches.
 * Exceptions: None.
 */
export function planResolutionPlayback(input: ResolutionPlaybackPlanInput): ResolutionPlaybackPlan {
  const { readyResult, state, humanMoves, visibleHexesBeforeTurn, deps } = input;
  const aiMoves = readyResult.aiMoves ?? [];
  const resolutionMoves = [...humanMoves, ...aiMoves];
  const visibleHexes = deps.getVisibleHexSet(state);
  const visibleMissileLaunches = (readyResult.missileLaunches ?? []).filter((record) =>
    missileLaunchVisibleToViewer(
      record,
      reportViewerSeatId(),
      new Set([...visibleHexesBeforeTurn, ...visibleHexes])
    )
  );
  const sightCuesForPlayback = sightCueBeamsForViewer(readyResult.sightCues ?? [], reportViewerSeatId());
  const strikeMoves = [...(readyResult.airStrikeMoves ?? []), ...buildMissilePlaybackMoves(visibleMissileLaunches)];
  const airStrikeOutboundMoves = [
    ...deps.buildAirStrikeOutboundPlaybackMoves(strikeMoves),
    ...buildAirDropOutboundPlaybackMoves(readyResult.airDropMoves),
  ];
  const airStrikeReturnMoves = [
    ...deps.buildAirStrikeReturnPlaybackMoves(strikeMoves),
    ...buildAirDropReturnPlaybackMoves(readyResult.airDropMoves),
  ];

  const hasRanged =
    (readyResult.rangedCombatHexes?.length ?? 0) > 0 ||
    (readyResult.rangedCasualtyHexes?.length ?? 0) > 0 ||
    (readyResult.rangedRemovedUnits?.length ?? 0) > 0;
  const hasMelee =
    (readyResult.meleeCombatHexes?.length ?? 0) > 0 ||
    (readyResult.meleeCasualtyHexes?.length ?? 0) > 0 ||
    (readyResult.meleeRemovedUnits?.length ?? 0) > 0 ||
    (readyResult.controlLossLightningHexes?.length ?? 0) > 0;
  const hasLegacy = (readyResult.combatHexes?.length ?? 0) > 0 || (readyResult.casualtyHexes?.length ?? 0) > 0;
  const hasAirStrikeResolution =
    visibleMissileLaunches.length > 0 ||
    (readyResult.airStrikeAttemptCount ?? 0) > 0 ||
    (readyResult.airStrikeHexes?.length ?? 0) > 0 ||
    (readyResult.infrastructureDestroyedEvents?.length ?? 0) > 0 ||
    (readyResult.baseInvalidAirLossCount ?? 0) > 0;
  const hasDiceRolls =
    (readyResult.airStrikeDiceRolls?.length ?? 0) > 0 ||
    (readyResult.rangedDiceRolls?.length ?? 0) > 0 ||
    (readyResult.meleeDiceRolls?.length ?? 0) > 0;
  const visibility = deriveCombatVisibilityClassification(readyResult, visibleHexes, reportViewerSeatId());
  const { unknownCombatHexes, unknownCasualtyHexes } = visibility;
  const visibleMissileVictimIds = new Set(visibleMissileLaunches.flatMap((record) => record.destroyedAirUnitIds));
  const visibleMissileVictims = (readyResult.missileStrikeRemovedUnits ?? []).filter((unit) =>
    visibleMissileVictimIds.has(unit.id)
  );
  const airStrikeRemovedForPlayback = [...(readyResult.airStrikeRemovedUnits ?? []), ...visibleMissileVictims];
  const airStrikeCasualtyHexesForPlayback = [
    ...(readyResult.airStrikeCasualtyHexes ?? []),
    ...visibleMissileVictims
      .map((unit) => unit.h3Index)
      .filter((hex) => !(readyResult.airStrikeCasualtyHexes ?? []).includes(hex)),
  ];
  const airStrikeCombatHexesForPlayback = [
    ...(readyResult.airStrikeHexes ?? []),
    ...visibleMissileLaunches
      .map((record) => record.targetH3Index)
      .filter((hex) => !(readyResult.airStrikeHexes ?? []).includes(hex)),
  ];
  const needsCombatOrMovementAnimation =
    resolutionMoves.length > 0 || hasRanged || hasMelee || hasLegacy || hasAirStrikeResolution || hasDiceRolls;
  const needsAnimation = needsCombatOrMovementAnimation || sightCuesForPlayback.length > 0;
  return {
    resolutionMoves,
    visibleHexes,
    visibleMissileLaunches,
    sightCuesForPlayback,
    airStrikeOutboundMoves,
    airStrikeReturnMoves,
    visibility,
    unknownCombatHexes,
    unknownCasualtyHexes,
    airStrikeRemovedForPlayback,
    airStrikeCasualtyHexesForPlayback,
    airStrikeCombatHexesForPlayback,
    needsCombatOrMovementAnimation,
    needsAnimation,
  };
}
