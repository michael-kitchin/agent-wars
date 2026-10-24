/**
 * Whether the match is being watched, and which controls that leaves usable.
 *
 * Purpose: Observe, a fresh match with no human seat and a match whose human seat is out, share one decision.
 * When to use: The top bar, the console, map clicks, and the snapshot a watch requests.
 * Expected outcome: An active human seat plays. Any other loaded roster watches.
 * Exceptions: None.
 */

import { isSeatId, type SeatId, HUMAN_SEAT_ID } from './seatIds';
import { HUMAN_SEAT_KIND, type SeatKind } from './seatRoster';

/**
 * The roster fields that decide whether a seat is still playing.
 *
 * Contract: `outTurn` is null while the seat is in the match.
 * When to use: A seat snapshot or a stored seat row.
 * Expected outcome: Enough to tell an active human seat from every other roster.
 * Exceptions: None.
 */
export interface ObserveSeat {
  /**
   * The seat's id.
   *
   * Contract: A `SeatId` string.
   * When to use: Matching a requested view to a roster row.
   * Expected outcome: Unique within the roster.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * Whether the seat is the human player.
   *
   * Contract: `HUMAN_SEAT_KIND` or `AI_SEAT_KIND`.
   * When to use: Finding the seat that can still give orders.
   * Expected outcome: At most one human seat.
   * Exceptions: None.
   */
  readonly kind: SeatKind;
  /**
   * The turn the seat was knocked out, or null while it is still playing.
   *
   * Contract: Null means the seat is active.
   * When to use: A knocked-out human seat watches.
   * Expected outcome: A number once the seat is out.
   * Exceptions: None.
   */
  readonly outTurn: number | null;
}

/**
 * The seat that can still give orders.
 *
 * Purpose: Readouts and observe mode share one test for an active human seat.
 * When to use: Before treating a roster as a played match or a watch.
 * Expected outcome: The human seat id while that seat's `outTurn` is null, otherwise null. A missing `outTurn` counts as active.
 * Exceptions: None.
 */
export function activeHumanSeatId(seats: readonly ObserveSeat[]): string | null {
  return seats.find((seat) => seat.kind === HUMAN_SEAT_KIND && seat.outTurn == null)?.seatId ?? null;
}

/**
 * Whether a loaded roster has no human seat that can still give orders.
 *
 * Purpose: Observe labels and disabled play controls share one test. An empty roster is the start screen, not a watch.
 * When to use: The Commanders tab, reports, and the console subtitle.
 * Expected outcome: True when the roster has seats and `activeHumanSeatId` is null. False for an empty roster.
 * Exceptions: None.
 */
export function isObservingRoster(seats: readonly ObserveSeat[]): boolean {
  return seats.length > 0 && activeHumanSeatId(seats) === null;
}

/**
 * Play controls while a roster is showing.
 *
 * Contract: Build and Forces stay off. They are placeholders.
 * When to use: Enabling the Orders tab, unit selection, and battle markers.
 * Expected outcome: Watching turns orders, unit selection, and markers off, and the selection panel shows the hex only.
 * Exceptions: None.
 */
export interface ObserveControls {
  /**
   * True when the loaded roster has no active human seat.
   *
   * Contract: False when the roster is empty, so the start screen is not a watch.
   * When to use: The View as control, the auto-advance checkbox, and fog.
   * Expected outcome: True for Observe only and after the human seat is out.
   * Exceptions: None.
   */
  readonly observing: boolean;
  /**
   * Whether the Orders tab accepts a click.
   *
   * Contract: False while `observing` is true.
   * When to use: The console rail.
   * Expected outcome: The tab is disabled for a watch.
   * Exceptions: None.
   */
  readonly ordersEnabled: boolean;
  /**
   * Whether the Build placeholder accepts a click.
   *
   * Contract: Always false. Build is not in this version.
   * When to use: The console rail.
   * Expected outcome: The tab stays disabled.
   * Exceptions: None.
   */
  readonly buildEnabled: boolean;
  /**
   * Whether the Forces placeholder accepts a click.
   *
   * Contract: Always false. Forces is not in this version.
   * When to use: The console rail.
   * Expected outcome: The tab stays disabled.
   * Exceptions: None.
   */
  readonly forcesEnabled: boolean;
  /**
   * Whether a map click may select a unit.
   *
   * Contract: False while `observing` is true.
   * When to use: Map click and double-click.
   * Expected outcome: A watch cannot select a unit or queue an order.
   * Exceptions: None.
   */
  readonly unitSelectionEnabled: boolean;
  /**
   * Whether a contested hex shows a battle marker.
   *
   * Contract: False while `observing` is true.
   * When to use: The tactical-entry layer.
   * Expected outcome: A watch never shows the magnifier.
   * Exceptions: None.
   */
  readonly magnifierEnabled: boolean;
  /**
   * Whether the selection panel describes the hex and not its units.
   *
   * Contract: True while `observing` is true.
   * When to use: The selection panel.
   * Expected outcome: A click shows the hex caption and chips, with no unit rows.
   * Exceptions: None.
   */
  readonly hexOnlySelection: boolean;
}

/**
 * The snapshot a watch is allowed to request.
 *
 * Contract: `HUMAN_SEAT_ID` is the active human seat. `'all'` is every hex, with no fog. A `SeatId` is that seat's fog.
 * When to use: The result of `resolveMatchView`.
 * Expected outcome: One of those three.
 * Exceptions: None.
 */
export type MatchView = 'human' | 'all' | SeatId;

/**
 * How a requested view was resolved.
 *
 * Contract: `ignoredRequest` means a view arrived while the human seat is still playing. `rejected` means the view named no seat.
 * When to use: The main-process reader, which logs both cases.
 * Expected outcome: `view` is what the snapshot should show.
 * Exceptions: None.
 */
export interface MatchViewDecision {
  /**
   * The view the snapshot should use.
   *
   * Contract: A `MatchView`.
   * When to use: Choosing the fog path.
   * Expected outcome: `HUMAN_SEAT_ID` while that seat is active. Otherwise `'all'` or a seat id.
   * Exceptions: None.
   */
  readonly view: MatchView;
  /**
   * True when a view was sent while the human seat is still playing.
   *
   * Contract: The snapshot is still the human seat's.
   * When to use: Logging a stale request.
   * Expected outcome: False when no view was sent.
   * Exceptions: None.
   */
  readonly ignoredRequest: boolean;
  /**
   * True when the view named a seat that is not in the roster.
   *
   * Contract: The snapshot falls back to `'all'`.
   * When to use: Logging a bad request.
   * Expected outcome: False for `'all'` and for a known seat.
   * Exceptions: None.
   */
  readonly rejected: boolean;
}

/**
 * Decides which play controls a roster leaves on.
 *
 * Purpose: Observe and an active human seat disagree on orders, selection, and battle markers.
 * When to use: Before painting the console, the map, or the selection panel.
 * Expected outcome: Empty roster plays (the start screen). No active human seat watches. An active human seat plays.
 *   Build and Forces stay off.
 * Exceptions: None.
 */
export function observeModeControls(seats: readonly ObserveSeat[]): ObserveControls {
  const observing = isObservingRoster(seats);
  return {
    observing,
    ordersEnabled: !observing,
    buildEnabled: false,
    forcesEnabled: false,
    unitSelectionEnabled: !observing,
    magnifierEnabled: !observing,
    hexOnlySelection: observing,
  };
}

/**
 * The seat the home, Cities, and turn-report lines describe.
 *
 * Purpose: View as a seat uses that seat. All sides keeps the null-viewer readouts.
 * When to use: The top-bar stats and `reportViewerSeatId`, while a roster is loaded.
 * Expected outcome: Undefined when the roster is empty. The active human seat while one is playing.
 *   Null for All sides. The chosen seat while it is still active, otherwise null.
 * Exceptions: None.
 */
export function readoutViewerSeatId(seats: readonly ObserveSeat[], viewAs: 'all' | string): string | null | undefined {
  if (seats.length === 0) return undefined;
  if (!observeModeControls(seats).observing) {
    return activeHumanSeatId(seats);
  }
  if (viewAs === 'all') return null;
  const chosen = seats.find((seat) => seat.seatId === viewAs && seat.outTurn == null);
  return chosen?.seatId ?? null;
}

/**
 * Chooses the snapshot view for a renderer request.
 *
 * Purpose: A stale view must not hide the human seat's own fog, and a missing view watches every side.
 * When to use: `game:getState`, and the snapshot returned when a match starts or ends.
 * Expected outcome: An active human seat always yields `HUMAN_SEAT_ID`. A sent view in that case sets `ignoredRequest`.
 *   No active human seat yields `'all'` when the request is absent or `'all'`, the seat id when it is in the roster,
 *   and `'all'` with `rejected` when it is not.
 * Exceptions: None.
 */
export function resolveMatchView(args: {
  readonly seats: readonly ObserveSeat[];
  readonly requested: string | null | undefined;
}): MatchViewDecision {
  const requested = args.requested?.trim() ? args.requested.trim() : null;
  const humanActive = activeHumanSeatId(args.seats) !== null;
  if (humanActive) {
    return { view: HUMAN_SEAT_ID, ignoredRequest: requested != null, rejected: false };
  }
  if (requested == null || requested === 'all') {
    return { view: 'all', ignoredRequest: false, rejected: false };
  }
  const known = args.seats.some((seat) => seat.seatId === requested) && isSeatId(requested);
  if (!known) return { view: 'all', ignoredRequest: false, rejected: true };
  return { view: requested, ignoredRequest: false, rejected: false };
}

/**
 * The seat whose units are friendly for stale-intel markers.
 *
 * Purpose: A watched seat must not mark its own units as enemies, and All sides has no fog ghosts.
 * When to use: Client stale-intel tracking and the stale-token draw.
 * Expected outcome: `null` when `playerPerspective` is `'all'`. The named seat when it is a seat id. `HUMAN_SEAT_ID` when the perspective is missing or not a seat.
 * Exceptions: None.
 */
export function staleIntelViewer(playerPerspective: string | undefined): SeatId | null {
  if (playerPerspective === 'all') return null;
  if (playerPerspective !== undefined && isSeatId(playerPerspective)) return playerPerspective;
  return HUMAN_SEAT_ID;
}
