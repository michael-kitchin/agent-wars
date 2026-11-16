/**
 * Builds the animation a strategic resolution plays and starts its frames.
 *
 * Purpose: The live turn and replay play a strategic resolution through the same two functions, so a recorded turn looks as the live turn looked.
 * When to use: After `planResolutionPlayback` says the result needs an animation. The live turn calls both. Replay calls both for each step it plays.
 * Expected outcome: `buildStrategicResolutionAnimation` returns the animation state and does not store it. `startResolutionAnimationFrames` starts the clock and the frame loop for the state already stored.
 * Exceptions: None.
 */

import { pickPlaybackDiceRolls } from '../../shared/combatDiceChips';
import type { ferriesHeldUntilMovementEnds, ordersHeldUntilMovementEnds } from '../../shared/ordersHeldForPlayback';
import type { ReadyResult } from '../../shared/ipcTypes';
import { rendererSharedState as S } from '../core/state';
import type { ResolutionPlaybackPlan } from './resolutionPlaybackPlan';

/**
 * What the animation of a strategic resolution is built from.
 *
 * Purpose: One object keeps the builder's signature short and names each input.
 * When to use: The argument of `buildStrategicResolutionAnimation`.
 * Expected outcome: The plan, the result, the visibility before the turn, and the two held-arrow lists.
 * Exceptions: None.
 */
export interface StrategicResolutionAnimationInput {
  /**
   * What the result shows.
   *
   * Contract: The value `planResolutionPlayback` returned for `readyResult`.
   * When to use: The moves, strike legs, and fog-filtered combat marks.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly plan: ResolutionPlaybackPlan;
  /**
   * The resolution result.
   *
   * Contract: A successful Ready or melee-resolve result, live or recorded.
   * When to use: The combat hexes, casualties, shot lines, and dice rolls.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly readyResult: ReadyResult;
  /**
   * The hexes the viewer could see before the turn.
   *
   * Contract: Taken before the turn resolved.
   * When to use: Choosing which dice chips the viewer was shown.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly visibleHexesBeforeTurn: ReadonlySet<string>;
  /**
   * The march orders drawn until movement ends.
   *
   * Contract: The value of `ordersHeldUntilMovementEnds`, empty for a past turn.
   * When to use: Keeping the player's march arrows on screen until the units move.
   * Expected outcome: Added to the animation only when it holds orders.
   * Exceptions: None.
   */
  readonly marchArrowsUntilMovementEnds: ReturnType<typeof ordersHeldUntilMovementEnds>;
  /**
   * The ferry orders drawn until movement ends.
   *
   * Contract: The value of `ferriesHeldUntilMovementEnds`, empty for a past turn.
   * When to use: Keeping the player's ferry arrows on screen until the units move.
   * Expected outcome: Added to the animation only when it holds orders.
   * Exceptions: None.
   */
  readonly ferryArrowsUntilMovementEnds: ReturnType<typeof ferriesHeldUntilMovementEnds>;
}

/**
 * Builds the animation state for one strategic resolution.
 *
 * Purpose: The live turn and replay build the same state from a result and its plan, with the clock held until the frames start.
 * When to use: Before the new snapshot is applied or just after it, directly before `startResolutionAnimationFrames`.
 * Expected outcome: The state to assign to `S.resolutionMoveAnimation`. Nothing is stored or started here.
 * Exceptions: None.
 */
export function buildStrategicResolutionAnimation(input: StrategicResolutionAnimationInput): NonNullable<typeof S.resolutionMoveAnimation> {
  const { plan, readyResult, visibleHexesBeforeTurn, marchArrowsUntilMovementEnds, ferryArrowsUntilMovementEnds } = input;
  const {
    resolutionMoves,
    visibleHexes,
    sightCuesForPlayback,
    airStrikeOutboundMoves,
    airStrikeReturnMoves,
    unknownCombatHexes,
    unknownCasualtyHexes,
    airStrikeRemovedForPlayback,
    airStrikeCasualtyHexesForPlayback,
    airStrikeCombatHexesForPlayback,
  } = plan;
  return {
    moves: resolutionMoves,
    ...(sightCuesForPlayback.length > 0 ? { sightCues: sightCuesForPlayback } : {}),
    airStrikeOutboundMoves: airStrikeOutboundMoves.length > 0 ? airStrikeOutboundMoves : undefined,
    airStrikeReturnMoves: airStrikeReturnMoves.length > 0 ? airStrikeReturnMoves : undefined,
    airStrikeCombatHexes: airStrikeCombatHexesForPlayback.length > 0 ? airStrikeCombatHexesForPlayback : undefined,
    airStrikeCasualtyHexes: airStrikeCasualtyHexesForPlayback.length > 0 ? airStrikeCasualtyHexesForPlayback : undefined,
    ...(airStrikeRemovedForPlayback.length > 0 ? { airStrikeRemovedUnits: airStrikeRemovedForPlayback } : {}),
    startTime: Date.now(),
    tacticalDeferResolutionClock: true,
    combatHexes: readyResult.combatHexes?.length ? readyResult.combatHexes : undefined,
    casualtyHexes: readyResult.casualtyHexes?.length ? readyResult.casualtyHexes : undefined,
    rangedCombatHexes: readyResult.rangedCombatHexes?.length ? readyResult.rangedCombatHexes : undefined,
    rangedCasualtyHexes: readyResult.rangedCasualtyHexes?.length ? readyResult.rangedCasualtyHexes : undefined,
    rangedRemovedUnits: readyResult.rangedRemovedUnits?.length ? readyResult.rangedRemovedUnits : undefined,
    ...(readyResult.rangedResolutionShotLines?.length
      ? { rangedResolutionShotLines: readyResult.rangedResolutionShotLines }
      : {}),
    meleeCombatHexes: readyResult.meleeCombatHexes?.length ? readyResult.meleeCombatHexes : undefined,
    controlLossLightningHexes: readyResult.controlLossLightningHexes?.length ? readyResult.controlLossLightningHexes : undefined,
    meleeCasualtyHexes: readyResult.meleeCasualtyHexes?.length ? readyResult.meleeCasualtyHexes : undefined,
    meleeRemovedUnits: readyResult.meleeRemovedUnits?.length ? readyResult.meleeRemovedUnits : undefined,
    unknownCombatHexes: unknownCombatHexes.length > 0 ? unknownCombatHexes : undefined,
    unknownCasualtyHexes: unknownCasualtyHexes.length > 0 ? unknownCasualtyHexes : undefined,
    ...(marchArrowsUntilMovementEnds.orders.length > 0 ? { marchArrowsUntilMovementEnds } : {}),
    ...(ferryArrowsUntilMovementEnds.length > 0 ? { ferryArrowsUntilMovementEnds } : {}),
    ...pickPlaybackDiceRolls(readyResult, {
      visibleHexesBeforeTurn,
      visibleHexesAfterTurn: visibleHexes,
      unknownHexes: new Set([...unknownCombatHexes, ...unknownCasualtyHexes]),
    }),
  };
}

/**
 * Starts the clock and the frame loop for the stored resolution animation.
 *
 * Purpose: The animation is built with its clock held. This releases the clock and requests the first frame.
 * When to use: After `S.resolutionMoveAnimation` is assigned and the page is ready to show it.
 * Expected outcome: The clock restarts at the current time and `S.resolutionMoveAnimationFrameId` holds the first frame request, which calls `tick`.
 * Exceptions: None.
 */
export function startResolutionAnimationFrames(tick: FrameRequestCallback): void {
  if (S.resolutionMoveAnimation) {
    S.resolutionMoveAnimation.tacticalDeferResolutionClock = false;
    S.resolutionMoveAnimation.startTime = Date.now();
  }
  S.resolutionMoveAnimationFrameId = requestAnimationFrame(tick);
}
