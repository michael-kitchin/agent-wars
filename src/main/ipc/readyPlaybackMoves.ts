/**
 * Builds the move lists strategic playback glides, for a finished Ready and for a melee-intercept resolve.
 *
 * Purpose: Both IPC handlers have to append resolved ferries to the moves resolution already recorded, and the
 * opponent's rows have to be the ones resolution kept.
 * When to use: After `ready()` or `resolveMeleeIntercept()` succeeds and the turn is finished.
 * Expected outcome: Human and opponent move lists, each with that side's ferries appended and their paths copied.
 * Exceptions: None. A missing list counts as empty.
 */

import type { FerryAnimationMove, ReadyResult } from '../../shared/ipcTypes';
import { HUMAN_SEAT_ID, isAiSeatId } from '../../shared/seatIds';
import { logDebug } from '../logger';

/** One human playback row, including a ferry whose path was copied off the resolution result. */
type PlaybackHumanMove = NonNullable<ReadyResult['humanMoves']>[number];

/** One opponent playback row, including cargo and a ferry whose path was copied off the resolution result. */
type PlaybackAiMove = NonNullable<ReadyResult['aiMoves']>[number];

/**
 * The resolution fields playback needs in order to glide marches, cargo, and ferries.
 *
 * Purpose: Lets both Ready handlers pass the same slice without depending on the rest of the result.
 * When to use: As the argument of `buildReadyPlaybackMoves`.
 * Expected outcome: Each list is optional. A missing list is treated as empty.
 * Exceptions: None.
 */
export interface ReadyPlaybackMoveSource {
  /**
   * Marches and cargo the human side already resolved.
   *
   * Contract: Copied in order, ahead of human ferries. Not mutated.
   * When to use: `ReadyResult.humanMoves`.
   * Expected outcome: Included as given, including any path already on a row.
   * Exceptions: None.
   */
  readonly humanMoves?: readonly PlaybackHumanMove[];
  /**
   * Marches and cargo the other sides already resolved.
   *
   * Contract: Copied in order, ahead of opponent ferries. Not mutated.
   * When to use: `ReadyResult.aiMoves`, which already holds opponent cargo.
   * Expected outcome: Included as given, including `player` and any path.
   * Exceptions: None.
   */
  readonly aiMoves?: readonly PlaybackAiMove[];
  /**
   * Ferries that flew this resolution, for every side.
   *
   * Contract: A human ferry joins `humanMoves`. An AI-seat ferry joins `aiMoves`. Any other owner is left out.
   * When to use: `ReadyResult.resolvedFerryMoves`.
   * Expected outcome: Each kept ferry becomes a playback row without `player`, and with its path copied.
   * Exceptions: None.
   */
  readonly resolvedFerryMoves?: readonly FerryAnimationMove[];
}

/**
 * The two playback lists a finished turn returns to the renderer.
 *
 * Purpose: Names the pair both handlers spread into the IPC result.
 * When to use: The return of `buildReadyPlaybackMoves`.
 * Expected outcome: New arrays. Empty when that side had nothing to glide.
 * Exceptions: None.
 */
export interface ReadyPlaybackMoves {
  /**
   * Human marches, cargo, and ferries, in that order.
   *
   * Contract: A new array. Ferry paths are copies.
   * When to use: `humanMoves` on the IPC result, omitted when empty.
   * Expected outcome: The renderer glides these rows during Movement.
   * Exceptions: None.
   */
  readonly humanMoves: PlaybackHumanMove[];
  /**
   * Opponent marches, cargo, and ferries, in that order.
   *
   * Contract: A new array. Ferry paths are copies. `player` stays on rows that already had it.
   * When to use: `aiMoves` on the IPC result, omitted when empty.
   * Expected outcome: The renderer glides these rows during Movement.
   * Exceptions: None.
   */
  readonly aiMoves: PlaybackAiMove[];
}

/**
 * Copies one flown ferry into a playback row.
 *
 * Purpose: Playback rows do not carry the ferry's owner, and the path must not alias the resolution array.
 * When to use: For each resolved ferry that belongs to the human seat or an AI seat.
 * Expected outcome: The unit, the origin, and the destination. `pathH3Indexes` is a copy, and is omitted when the ferry had none.
 * Exceptions: None.
 */
function playbackRowFromFerry(move: FerryAnimationMove): PlaybackHumanMove {
  return {
    unitId: move.unitId,
    fromH3Index: move.fromH3Index,
    toH3Index: move.toH3Index,
    ...(move.pathH3Indexes ? { pathH3Indexes: [...move.pathH3Indexes] } : {}),
  };
}

/**
 * Joins resolved ferries onto the move lists resolution already produced.
 *
 * Purpose: One implementation for strategic Ready and for the melee-intercept resolve, so the two paths cannot drift.
 * When to use: When a finished turn is about to be returned to the renderer.
 * Expected outcome: Human ferries follow `humanMoves`. AI-seat ferries follow `aiMoves`. Paths are copies.
 *   A ferry for any other owner is left out. The inputs are not mutated.
 * Exceptions: None.
 */
export function buildReadyPlaybackMoves(source: ReadyPlaybackMoveSource): ReadyPlaybackMoves {
  const ferries = source.resolvedFerryMoves ?? [];
  const humanMoves: PlaybackHumanMove[] = [...(source.humanMoves ?? [])];
  const aiMoves: PlaybackAiMove[] = [...(source.aiMoves ?? [])];
  for (const ferry of ferries) {
    if (ferry.player === HUMAN_SEAT_ID) {
      humanMoves.push(playbackRowFromFerry(ferry));
    } else if (isAiSeatId(ferry.player)) {
      aiMoves.push(playbackRowFromFerry(ferry));
    }
  }
  logDebug('buildReadyPlaybackMoves', {
    humanCount: humanMoves.length,
    aiCount: aiMoves.length,
    ferryCount: ferries.length,
  });
  return { humanMoves, aiMoves };
}
