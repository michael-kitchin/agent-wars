import type { HumanStandingOrderSnapshot } from './ipc/humanOrderPreviewTypes';
import { HUMAN_SEAT_ID } from './seatIds';

/**
 * The settled hex of one unit after resolution.
 *
 * Purpose: An arrived march is one whose human unit already occupies the order's destination.
 * When to use: As the `units` argument of `ordersHeldUntilMovementEnds`.
 * Expected outcome: `player` is the side string on the snapshot, such as `human`. `h3Index` is the hex after the move.
 * Exceptions: None.
 */
export interface PlaybackMarchHoldUnit {
  /**
   * The unit this hold is about.
   *
   * Contract: Matches `HumanStandingOrderSnapshot.unitId`.
   * When to use: Finding the unit that owns a queued march.
   * Expected outcome: The snapshot id of that unit.
   * Exceptions: None.
   */
  id: string;
  /**
   * The side that owns the unit.
   *
   * Contract: A side string such as `human`.
   * When to use: Keeping opponent units out of the human march hold.
   * Expected outcome: Only a `human` unit can hold its march arrow.
   * Exceptions: None.
   */
  player: string;
  /**
   * The hex the unit occupies after resolution.
   *
   * Contract: Compared with the order destination to decide that the march has arrived.
   * When to use: After the resolution state is known and before movement playback.
   * Expected outcome: The settled cell, which is the destination for an arrived march.
   * Exceptions: None.
   */
  h3Index: string;
}

/**
 * The origin of one resolved march.
 *
 * Purpose: A march that starts on its destination has nothing to animate, so its arrow is not held.
 * When to use: As the `moves` argument of `ordersHeldUntilMovementEnds`.
 * Expected outcome: `fromH3Index` is the hex the unit occupied before this resolution.
 * Exceptions: None.
 */
export interface PlaybackMarchHoldMove {
  /**
   * The unit that moved.
   *
   * Contract: Matches `PlaybackMarchHoldUnit.id` and the standing order's unit id.
   * When to use: Pairing a resolved move with the march being held.
   * Expected outcome: The id of the unit whose origin hex is recorded.
   * Exceptions: None.
   */
  unitId: string;
  /**
   * The hex the unit left.
   *
   * Contract: A march that starts on its destination has nothing to animate.
   * When to use: Deciding whether the held arrow has a real origin.
   * Expected outcome: The cell occupied before this resolution.
   * Exceptions: None.
   */
  fromH3Index: string;
}

/**
 * Queued marches to keep drawing until movement playback finishes, plus the hex each one started from.
 *
 * Purpose: After resolution the unit is already on its destination, but the arrow should stay through the movement animation.
 * When to use: The result of `ordersHeldUntilMovementEnds`, stored on the playback and drawn while movement progress is below 1.
 * Expected outcome: `orders` are copies. `originH3ByUnitId` maps each held unit to the hex its march left.
 * Exceptions: None.
 */
export interface OrdersHeldUntilMovementEnds {
  /**
   * The marches whose arrows stay up through movement playback.
   *
   * Contract: Copies of the input orders, including copied route segments.
   * When to use: Drawing queued marches while movement progress is below 1.
   * Expected outcome: Later edits to the input orders do not change these copies.
   * Exceptions: None.
   */
  orders: HumanStandingOrderSnapshot[];
  /**
   * The hex each held march left.
   *
   * Contract: Keys are unit ids. Values are `fromH3Index` for that unit's move.
   * When to use: Drawing the held arrow from the pre-resolution cell.
   * Expected outcome: One origin for each held order.
   * Exceptions: None.
   */
  originH3ByUnitId: Record<string, string>;
}

/**
 * Copies the queued marches whose units have arrived, so their arrow can stay up through movement playback.
 *
 * Purpose: The live standing-order list is replaced with empty routes as soon as Ready returns, which is before the movement animation.
 * When to use: When strategic playback is created, while `orders` still has the pre-resolution routes.
 * Expected outcome: Marches whose human unit is on the destination, and whose move started on a different hex, are copied with their route segments.
 *   A march that has not arrived, has no destination, or did not move is left out. Later edits to the input orders do not change the copies.
 * Exceptions: None.
 */
export function ordersHeldUntilMovementEnds(
  orders: readonly HumanStandingOrderSnapshot[],
  units: readonly PlaybackMarchHoldUnit[],
  moves: readonly PlaybackMarchHoldMove[]
): OrdersHeldUntilMovementEnds {
  const originH3ByUnitId: Record<string, string> = {};
  const held: HumanStandingOrderSnapshot[] = [];
  for (const order of orders) {
    if (!order.destinationH3Index) continue;
    const unit = units.find((candidate) => candidate.id === order.unitId && candidate.player === HUMAN_SEAT_ID);
    if (!unit || unit.h3Index !== order.destinationH3Index) continue;
    const move = moves.find(
      (candidate) => candidate.unitId === order.unitId && candidate.fromH3Index !== order.destinationH3Index
    );
    if (!move) continue;
    originH3ByUnitId[order.unitId] = move.fromH3Index;
    held.push({
      ...order,
      routeSegments: order.routeSegments?.map((segment) => ({
        turn: segment.turn,
        hexes: segment.hexes.map((hex) => [hex[0], hex[1]] as [number, number]),
      })),
    });
  }
  return { orders: held, originH3ByUnitId };
}

/**
 * One queued ferry whose arrow stays up until movement playback finishes.
 *
 * Purpose: The live ferry list is cleared once playback starts, and the played-back move itself has no arrowhead.
 * When to use: The result of `ferriesHeldUntilMovementEnds`, stored on the playback and drawn while movement progress is below 1.
 * Expected outcome: `pathH3Indexes` is a copy of the airports the ferry flew, or the shorter fallback.
 * Exceptions: None.
 */
export interface HeldFerryLine {
  /**
   * The air unit that was ferried.
   *
   * Contract: Matches the queued ferry order and the playback move.
   * When to use: Telling one held line from another.
   * Expected outcome: The unit id from the order that succeeded.
   * Exceptions: None.
   */
  readonly unitId: string;
  /**
   * Airports from the origin through the destination.
   *
   * Contract: Length at least 2. A copy, so later edits to the order or the move do not change it.
   * When to use: Drawing the held line and its arrowhead.
   * Expected outcome: The path the ferry flew, the path stored on the order, or the origin and destination.
   * Exceptions: None.
   */
  readonly pathH3Indexes: readonly string[];
}

/**
 * One resolved move that may belong to a queued ferry.
 *
 * Purpose: A ferry is held only when playback actually glides that unit onto the ordered destination.
 * When to use: As the `moves` argument of `ferriesHeldUntilMovementEnds`.
 * Expected outcome: `fromH3Index` is the hex the unit left. `toH3Index` is where that move ended.
 * Exceptions: None.
 */
export interface PlaybackFerryHoldMove {
  /**
   * The unit that moved.
   *
   * Contract: Matches the ferry order's unit id.
   * When to use: Pairing a resolved move with the ferry being held.
   * Expected outcome: The id of the air unit, not of cargo riding inside it.
   * Exceptions: None.
   */
  readonly unitId: string;
  /**
   * The hex the unit left.
   *
   * Contract: Compared with `toH3Index`. A move that starts where it ends is not held.
   * When to use: Building the two-hex fallback path.
   * Expected outcome: The cell occupied before this resolution.
   * Exceptions: None.
   */
  readonly fromH3Index: string;
  /**
   * The hex the move ended on.
   *
   * Contract: The ferry is held only when this equals the order's destination.
   * When to use: Deciding that the queued ferry is the move being played.
   * Expected outcome: The settled cell for that move.
   * Exceptions: None.
   */
  readonly toH3Index: string;
  /**
   * Airports the unit actually flew, when resolution recorded them.
   *
   * Contract: Used only when length is at least 2. Otherwise the order path, then the two ends, is used.
   * When to use: Preferring the flown chain over the path stored with the draft.
   * Expected outcome: Origin through destination, including stops.
   * Exceptions: None.
   */
  readonly pathH3Indexes?: readonly string[];
}

/**
 * Copies the queued ferries that playback will glide, so their arrow can stay up through movement.
 *
 * Purpose: A played-back move has no arrowhead, and the live ferry list is cleared once playback starts.
 * When to use: When strategic playback is created, with the ferry orders captured before Ready cleared them.
 * Expected outcome: One line per ferry whose first move left one hex and ended on the ordered destination.
 *   The path is the move's chain, then the order's chain, then the origin and destination. Each path is a copy.
 *   A ferry with no such move is left out.
 * Exceptions: None.
 */
export function ferriesHeldUntilMovementEnds(
  ferryOrders: readonly {
    readonly unitId: string;
    readonly destinationH3Index: string;
    readonly pathH3Indexes?: readonly string[];
  }[],
  moves: readonly PlaybackFerryHoldMove[]
): HeldFerryLine[] {
  const held: HeldFerryLine[] = [];
  for (const order of ferryOrders) {
    const move = moves.find((candidate) => candidate.unitId === order.unitId);
    if (!move || move.fromH3Index === move.toH3Index || move.toH3Index !== order.destinationH3Index) continue;
    const flown = move.pathH3Indexes && move.pathH3Indexes.length >= 2 ? move.pathH3Indexes : undefined;
    const ordered = order.pathH3Indexes && order.pathH3Indexes.length >= 2 ? order.pathH3Indexes : undefined;
    const path = flown ?? ordered ?? [move.fromH3Index, move.toH3Index];
    held.push({ unitId: order.unitId, pathH3Indexes: [...path] });
  }
  return held;
}
