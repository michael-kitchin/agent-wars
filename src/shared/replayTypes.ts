/**
 * Types for replaying a recorded match.
 *
 * Purpose: The main process builds these from the match history, and the renderer shows them.
 * When to use: The replay IPC channels, the replay reader, and the replay screen.
 * Expected outcome: One shared shape for the timeline and for one step's view.
 * Exceptions: None.
 */

import type { CommanderDispatch } from './commanderStatus';
import type { GameStateSnapshot } from './ipcTypes';
import type { TacticalSubUnitSnapshot } from './tacticalBattleTypes';

/**
 * Which picture of the match replay shows.
 *
 * Contract: `player` is the human seat's fogged view. `all` shows every hex and unit.
 * When to use: Choosing which recorded snapshots a timeline holds.
 * Expected outcome: One of the two names.
 * Exceptions: None.
 */
export type ReplayView = 'player' | 'all';

/**
 * One step a player can go to.
 *
 * Purpose: The panel and the slider list steps without loading their snapshots.
 * When to use: Building the timeline, and asking for one step's view.
 * Expected outcome: The record to load and the turn it shows.
 * Exceptions: None.
 */
export interface ReplayStepRef {
  /**
   * The `view_snapshot` record to show.
   *
   * Contract: A record id from the match history.
   * When to use: `game:readReplayStep`.
   * Expected outcome: The id the reader loads.
   * Exceptions: None.
   */
  readonly recordId: number;
  /**
   * The level of the step.
   *
   * Contract: `strategic` or `tactical`. A timeline holds one level only.
   * When to use: Keeping a timeline to one level.
   * Expected outcome: The recorded scope.
   * Exceptions: None.
   */
  readonly scope: 'strategic' | 'tactical';
  /**
   * The strategic turn.
   *
   * Contract: A positive whole number.
   * When to use: The panel label, the slider, and the turn field.
   * Expected outcome: The turn the step shows.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * The beat inside a battle.
   *
   * Contract: 0 for a strategic step.
   * When to use: A tactical timeline's slider, label, and turn field.
   * Expected outcome: The recorded beat number.
   * Exceptions: None.
   */
  readonly beatNumber: number;
}

/**
 * The steps replay can show for the current view.
 *
 * Purpose: The panel knows how far it can step without loading any snapshot.
 * When to use: Entering replay.
 * Expected outcome: Steps oldest first. The last one is the current step.
 * Exceptions: None.
 */
export interface ReplayTimeline {
  /**
   * Which view the steps were recorded for.
   *
   * Contract: `all` when no human seat is active or the match is over. `player` otherwise.
   * When to use: Deciding which viewer the dialogs use.
   * Expected outcome: The view name.
   * Exceptions: None.
   */
  readonly view: ReplayView;
  /**
   * The level every step belongs to.
   *
   * Contract: `strategic` in the strategic game, or `tactical` while a battle is open.
   * When to use: Keeping a timeline to one level.
   * Expected outcome: The scope.
   * Exceptions: None.
   */
  readonly scope: 'strategic' | 'tactical';
  /**
   * The steps in turn order.
   *
   * Contract: Oldest first. Empty when nothing was recorded.
   * When to use: Stepping, the slider, and the turn field.
   * Expected outcome: One entry per recorded turn.
   * Exceptions: None.
   */
  readonly steps: readonly ReplayStepRef[];
}

/**
 * Everything the screen needs to show one step.
 *
 * Purpose: Replay hands back what was shown, and recomputes nothing.
 * When to use: The reply of `game:readReplayStep`.
 * Expected outcome: The snapshot with its hexes restored, and what the two dialogs showed.
 * Exceptions: None.
 */
export interface ReplayStepView {
  /**
   * The step this view was built for.
   *
   * Contract: One entry of the timeline.
   * When to use: Matching a reply to a request.
   * Expected outcome: The requested step.
   * Exceptions: None.
   */
  readonly ref: ReplayStepRef;
  /**
   * The snapshot the screen was given.
   *
   * Contract: Its `hexes` are rebuilt from the open match, with the stored weather put back.
   * When to use: Drawing the map and the top bar.
   * Expected outcome: A full snapshot.
   * Exceptions: None.
   */
  readonly snapshot: GameStateSnapshot;
  /**
   * The result that led into this step.
   *
   * Contract: The recorded resolution result, or null on the first step.
   * When to use: The update dialog.
   * Expected outcome: A Ready-style result the renderer reads.
   * Exceptions: None.
   */
  readonly resolution: unknown | null;
  /**
   * The hexes the viewer could see before the turn resolved.
   *
   * Contract: From the step before. Null on the first step.
   * When to use: Deciding which moves the update dialog describes.
   * Expected outcome: A list of hex ids, or null.
   * Exceptions: None.
   */
  readonly visibleHexesBefore: readonly string[] | null;
  /**
   * The battle's sub-units before this beat resolved.
   *
   * Contract: For a tactical step, the `subUnits` of the previous tactical step's battle session. Null for the first beat and for every strategic step.
   * When to use: A beat's kill labels and march playback read the sub-units from before the commit. After a slider jump the live state belongs to another beat, so replay carries its own.
   * Expected outcome: A list of sub-units, or null.
   * Exceptions: None.
   */
  readonly subUnitsBefore: readonly TacticalSubUnitSnapshot[] | null;
  /**
   * What the message dialog showed when this step began.
   *
   * Contract: One entry per commander that has a strategy or a message at this step, in side order.
   * When to use: The message dialog.
   * Expected outcome: The dispatches, or an empty list.
   * Exceptions: None.
   */
  readonly dispatches: readonly CommanderDispatch[];
}
