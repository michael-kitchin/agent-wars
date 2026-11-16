/**
 * Decides whether a tactical beat shows an animation, and builds that animation.
 *
 * Purpose: The live beat and replay read the same rule, so a recorded beat animates and announces exactly when the live beat did.
 * When to use: After a beat's resolution playback is in hand, from the live beat commit and from replay.
 * Expected outcome: Plain values. Nothing here changes the page, the shared state, or the main process.
 * Exceptions: None.
 */

import { pickPlaybackDiceRolls } from '../../shared/combatDiceChips';
import type { GameStateSnapshot, TacticalCommitResolutionPlayback } from '../../shared/ipcTypes';
import type { TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { rendererSharedState as S } from '../core/state';
import { buildAirDropOutboundPlaybackMoves, buildAirDropReturnPlaybackMoves } from '../rendering/orderDrawing';
import type { ReadyHandlerDeps } from './readyHandlerTypes';

/**
 * Whether a beat's playback has anything to show.
 *
 * Purpose: The live beat plays an animation and announces its update only when the beat had movement, fire, melee, kills, air strikes, or dice. Replay applies the same test.
 * When to use: With the beat's `tacticalResolutionPlayback`, before starting its animation or showing its update dialog.
 * Expected outcome: True when any of those parts is present. False for a missing playback or one with nothing in it.
 * Exceptions: None.
 */
export function tacticalPlaybackNeeded(playback: TacticalCommitResolutionPlayback | undefined): boolean {
  const hasMoves =
    (playback?.humanMoves?.length ?? 0) > 0 || (playback?.opponentMoves?.length ?? 0) > 0;
  const hasRangedPlayback =
    (playback?.rangedCombatHexes?.length ?? 0) > 0 ||
    (playback?.rangedCasualtyHexes?.length ?? 0) > 0 ||
    (playback?.rangedRemovedUnits?.length ?? 0) > 0;
  const hasMeleePlayback =
    (playback?.meleeCombatHexes?.length ?? 0) > 0 ||
    (playback?.meleeCasualtyHexes?.length ?? 0) > 0 ||
    (playback?.meleeRemovedUnits?.length ?? 0) > 0 ||
    (playback?.killsByMelee?.length ?? 0) > 0;
  const hasKillPlayback =
    (playback?.killsByDirectFire?.length ?? 0) > 0 ||
    (playback?.killsByAirStrike?.length ?? 0) > 0 ||
    (playback?.killsByReturnFire?.length ?? 0) > 0 ||
    (playback?.killsByMelee?.length ?? 0) > 0;
  const hasAirStrikePlaybackAnim =
    (playback?.airStrikeAttemptCount ?? 0) > 0 ||
    (playback?.airStrikeMoves?.length ?? 0) > 0 ||
    (playback?.airStrikeHexes?.length ?? 0) > 0 ||
    (playback?.airStrikeCasualtyHexes?.length ?? 0) > 0;
  const hasDicePlayback =
    (playback?.airStrikeDiceRolls?.length ?? 0) > 0 ||
    (playback?.rangedDiceRolls?.length ?? 0) > 0 ||
    (playback?.meleeDiceRolls?.length ?? 0) > 0;
  const needsResolutionPlayback =
    hasMoves || hasRangedPlayback || hasMeleePlayback || hasKillPlayback || hasAirStrikePlaybackAnim || hasDicePlayback;
  return needsResolutionPlayback;
}

/**
 * What the animation of a tactical beat is built from.
 *
 * Purpose: One object keeps the builder's signature short and names each input.
 * When to use: The argument of `buildTacticalResolutionAnimation`.
 * Expected outcome: The beat's playback, the sub-units from before it, and the two strike-leg builders.
 * Exceptions: None.
 */
export interface TacticalResolutionAnimationInput {
  /**
   * The beat's resolution playback.
   *
   * Contract: A playback for which `tacticalPlaybackNeeded` is true, live or recorded.
   * When to use: The moves, strike legs, fire, melee, and dice of the animation.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly playback: TacticalCommitResolutionPlayback;
  /**
   * The battle's sub-units before the beat resolved.
   *
   * Contract: The live beat passes the sub-units it held before the commit. Replay passes the step's recorded ones. Null or undefined when there were none.
   * When to use: Gliding marching sub-units from where they stood.
   * Expected outcome: Reduced to id, owner, type, and cell for the animation.
   * Exceptions: None.
   */
  readonly subUnitsBefore: readonly TacticalSubUnitSnapshot[] | null | undefined;
  /**
   * The helpers that build air strike legs.
   *
   * Contract: The two strike-leg builders from the Ready dependencies.
   * When to use: Building the outbound and return legs.
   * Expected outcome: Called with no side effects.
   * Exceptions: None.
   */
  readonly deps: Pick<ReadyHandlerDeps, 'buildAirStrikeOutboundPlaybackMoves' | 'buildAirStrikeReturnPlaybackMoves'>;
}

/**
 * Builds the animation state for one tactical beat.
 *
 * Purpose: The live beat and replay build the same state from a beat's playback, with the clock held until the frames start.
 * When to use: Before the battle snapshot is updated, so no redraw paints the cells after the beat while the animation is missing.
 * Expected outcome: The state to assign to `S.resolutionMoveAnimation`. Nothing is stored or started here.
 * Exceptions: None.
 */
export function buildTacticalResolutionAnimation(input: TacticalResolutionAnimationInput): NonNullable<typeof S.resolutionMoveAnimation> {
  const { playback, subUnitsBefore, deps } = input;
  const tacticalMarchPlaybackUnits = subUnitsBefore?.length
    ? (subUnitsBefore.map((u) => ({
        id: u.id,
        player: u.player,
        unitType: u.unitType,
        h3Index: u.h3Index,
      })) as GameStateSnapshot['units'])
    : undefined;
  const airStrikeOutboundMoves = [
    ...deps.buildAirStrikeOutboundPlaybackMoves(playback.airStrikeMoves),
    ...buildAirDropOutboundPlaybackMoves(playback.airDropMoves),
  ];
  const airStrikeReturnMoves = [
    ...deps.buildAirStrikeReturnPlaybackMoves(playback.airStrikeMoves),
    ...buildAirDropReturnPlaybackMoves(playback.airDropMoves),
  ];
  return {
    moves: [...playback.humanMoves, ...(playback.opponentMoves ?? [])],
    startTime: Date.now(),
    tacticalDeferResolutionClock: true,
    ...(tacticalMarchPlaybackUnits ? { tacticalMarchPlaybackUnits } : {}),
    ...(airStrikeOutboundMoves.length > 0 ? { airStrikeOutboundMoves } : {}),
    ...(airStrikeReturnMoves.length > 0 ? { airStrikeReturnMoves } : {}),
    ...(playback.airStrikeHexes?.length ? { airStrikeCombatHexes: playback.airStrikeHexes } : {}),
    ...(playback.airStrikeCasualtyHexes?.length
      ? { airStrikeCasualtyHexes: playback.airStrikeCasualtyHexes }
      : {}),
    ...(playback.airStrikeRemovedUnits?.length ? { airStrikeRemovedUnits: playback.airStrikeRemovedUnits } : {}),
    rangedCombatHexes: playback.rangedCombatHexes,
    rangedCasualtyHexes: playback.rangedCasualtyHexes,
    rangedRemovedUnits: playback.rangedRemovedUnits,
    ...(playback.rangedResolutionShotLines?.length
      ? { rangedResolutionShotLines: playback.rangedResolutionShotLines }
      : {}),
    meleeCombatHexes: playback.meleeCombatHexes?.length ? playback.meleeCombatHexes : undefined,
    meleeCasualtyHexes: playback.meleeCasualtyHexes?.length ? playback.meleeCasualtyHexes : undefined,
    meleeRemovedUnits: playback.meleeRemovedUnits?.length ? playback.meleeRemovedUnits : undefined,
    ...pickPlaybackDiceRolls(playback),
  };
}
