/**
 * Airport-to-airport ferry search.
 *
 * Purpose: One chain for validation, the hover preview, and resolution, so those three never disagree.
 * When to use: Strategic ferry only. Callers supply grid distance and the per-hop range.
 * Expected outcome: A path of airports, or one reason the destination cannot be reached.
 * Exceptions: None. A null grid distance is not an edge.
 */

/**
 * One airport the ferry search may consider.
 *
 * Purpose: The graph node. Callers decide which hexes are airports.
 * When to use: Building `AirportFerryRouteRequest.nodes`.
 * Expected outcome: A hex the search can accept or reject.
 * Exceptions: None.
 */
export interface AirportFerryNode {
  /**
   * The airport hex.
   *
   * Contract: An H3 index the caller already treats as an airport candidate.
   * When to use: One node in the search graph.
   * Expected outcome: The search may accept or reject this hex.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * The side that controls the airport.
   *
   * Contract: Compared with the ferrying unit's owner.
   * When to use: Every node.
   * Expected outcome: A foreign airport is not a stop.
   * Exceptions: None.
   */
  readonly owner: string;
  /**
   * Whether the airport still exists.
   *
   * Contract: False means the hex is not a stop.
   * When to use: Every node.
   * Expected outcome: A wrecked airport is refused.
   * Exceptions: None.
   */
  readonly intact: boolean;
  /**
   * Whether the hex is a neutral border.
   *
   * Contract: True means the hex is not a destination.
   * When to use: Every node.
   * Expected outcome: A neutral-border destination is not intact for this search.
   * Exceptions: None.
   */
  readonly neutralBorder: boolean;
}

/**
 * Inputs for one airport-chain search.
 *
 * Purpose: Keeps distance and weather range outside this module.
 * When to use: `findAirportFerryRoute`, or `AirportFerryReachRequest` when the destination is not known yet.
 * Expected outcome: Origin, destination, owner, and the airports those two may hop between.
 * Exceptions: None.
 */
export interface AirportFerryRouteRequest {
  /**
   * The airport the air unit occupies.
   *
   * Contract: Must be one of `nodes` when a path exists.
   * When to use: Every search.
   * Expected outcome: The first hex of a reachable path.
   * Exceptions: None.
   */
  readonly originH3Index: string;
  /**
   * The airport the air unit is ordered to.
   *
   * Contract: Must be one of `nodes` when a path exists.
   * When to use: Every search.
   * Expected outcome: The last hex of a reachable path.
   * Exceptions: None.
   */
  readonly destinationH3Index: string;
  /**
   * The side that must control every stop.
   *
   * Contract: Compared with each node's `owner`.
   * When to use: Every search.
   * Expected outcome: A path uses only this owner's airports.
   * Exceptions: None.
   */
  readonly owner: string;
  /**
   * Airports the search may hop between.
   *
   * Contract: The caller decides which hexes are airports.
   * When to use: Every search.
   * Expected outcome: Stops come only from this list.
   * Exceptions: None.
   */
  readonly nodes: readonly AirportFerryNode[];
  /**
   * Grid distance between two hexes, or null when the pair cannot be measured.
   *
   * Contract: A null result is not an edge unless `unmeasuredHopWithinRange` accepts that hop.
   * When to use: Every candidate hop.
   * Expected outcome: A number of hexes, or null.
   * Exceptions: None.
   */
  readonly gridDistance: (fromH3Index: string, toH3Index: string) => number | null;
  /**
   * Whether an unmeasured hop is still inside the arrival range.
   *
   * Contract: Called only when `gridDistance` returns null. True means the hop is an edge.
   * When to use: Callers that can still see the hop with a disk when the distance API throws.
   * Expected outcome: Omitted means an unmeasured hop is not an edge.
   * Exceptions: None.
   */
  readonly unmeasuredHopWithinRange?: (fromH3Index: string, toH3Index: string, hopRangeHexes: number) => boolean;
  /**
   * How far one hop may reach when arriving at a hex.
   *
   * Contract: The caller applies weather. This module does not.
   * When to use: Every candidate hop.
   * Expected outcome: A positive hex count for that arrival hex.
   * Exceptions: None.
   */
  readonly hopRangeHexes: (destinationH3Index: string) => number;
}

/**
 * A ferry search that has not chosen a destination yet.
 *
 * Purpose: Listing every reachable airport is one search. Finding one path still uses `AirportFerryRouteRequest`.
 * When to use: `findReachableAirportFerryDestinations`.
 * Expected outcome: The same origin, owner, airports, and hop rules, without a destination.
 * Exceptions: None.
 */
export type AirportFerryReachRequest = Omit<AirportFerryRouteRequest, 'destinationH3Index'>;

/**
 * The chain, or the reason none exists.
 *
 * Purpose: Callers return this reason without rewriting it.
 * When to use: The result of `findAirportFerryRoute`.
 * Expected outcome: `reachable` with the origin through the destination, or `reachable: false` with one sentence.
 * Exceptions: None.
 */
export type AirportFerryRouteResult =
  | { readonly reachable: true; readonly pathH3Indexes: readonly string[] }
  | { readonly reachable: false; readonly reason: string };

/**
 * The air unit is already on the destination airport.
 *
 * Purpose: Same sentence the ferry validator already shows for that case.
 * When to use: `findAirportFerryRoute` when the two hexes are equal.
 * Expected outcome: The sentence itself.
 * Exceptions: None.
 */
const ALREADY_BASED_REASON = 'Air unit is already based at that airport';

/**
 * The destination is not an intact airport the search can land on.
 *
 * Purpose: Missing, wrecked, and neutral-border destinations share one reason.
 * When to use: Before the owner check.
 * Expected outcome: The sentence itself.
 * Exceptions: None.
 */
const DESTINATION_NOT_INTACT_REASON = 'Destination airport is not intact';

/**
 * The destination airport belongs to someone else.
 *
 * Purpose: A foreign intact airport is not a ferry stop.
 * When to use: After the intact check.
 * Expected outcome: The sentence itself.
 * Exceptions: None.
 */
const DESTINATION_NOT_OWNED_REASON = 'Destination airport must be controlled by unit owner';

/**
 * No sequence of owned airports stays inside the per-hop range.
 *
 * Purpose: The refusal when the graph has no path.
 * When to use: After the search finishes without reaching the destination.
 * Expected outcome: The sentence itself.
 * Exceptions: None.
 */
const NO_CHAIN_REASON = 'No chain of your airports stays within ferry range.';

/**
 * Finds the shortest chain of the owner's airports from the origin to the destination.
 *
 * Purpose: Strategic ferry treats airports as the nodes and the single-hop range as the edge limit.
 * When to use: Validation, the main-process hover preview, and resolution. Not tactical ferry.
 * Expected outcome: The origin, each intermediate airport, and the destination. Equal-length paths pick the smaller H3 at the first choice.
 * Exceptions: None. A null distance is not an edge unless `unmeasuredHopWithinRange` accepts it. A non-positive distance is not an edge.
 */
export function findAirportFerryRoute(request: AirportFerryRouteRequest): AirportFerryRouteResult {
  if (request.originH3Index === request.destinationH3Index) {
    return { reachable: false, reason: ALREADY_BASED_REASON };
  }
  const destination = request.nodes.find((node) => node.h3Index === request.destinationH3Index);
  if (!destination || !destination.intact || destination.neutralBorder) {
    return { reachable: false, reason: DESTINATION_NOT_INTACT_REASON };
  }
  if (destination.owner !== request.owner) {
    return { reachable: false, reason: DESTINATION_NOT_OWNED_REASON };
  }

  const usable = request.nodes
    .filter((node) => node.intact && node.owner === request.owner && !node.neutralBorder)
    .map((node) => node.h3Index);
  const previous = new Map<string, string>();
  const seen = new Set<string>([request.originH3Index]);
  const queue: string[] = [request.originH3Index];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    const neighbors = usable
      .filter((hex) => hex !== current && !seen.has(hex) && hopAllowed(request, current, hex))
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    for (const next of neighbors) {
      seen.add(next);
      previous.set(next, current);
      if (next === request.destinationH3Index) {
        return { reachable: true, pathH3Indexes: pathFrom(previous, request.originH3Index, next) };
      }
      queue.push(next);
    }
  }
  return { reachable: false, reason: NO_CHAIN_REASON };
}

/**
 * Lists every airport the owner can reach from the origin, except the origin itself.
 *
 * Purpose: Briefings and possible-action rows only need membership. One search replaces a search per destination.
 * When to use: Strategic ferry lists. Validation, hover preview, and resolution still use `findAirportFerryRoute` because they need the path.
 * Expected outcome: For any hex other than the origin, membership matches `findAirportFerryRoute` with that hex as the destination.
 *   The origin is never included. A foreign, wrecked, or neutral-border airport is never included. Each hop asks `hopRangeHexes` for that arrival hex.
 * Exceptions: None. A null distance is not an edge unless `unmeasuredHopWithinRange` accepts it.
 */
export function findReachableAirportFerryDestinations(request: AirportFerryReachRequest): ReadonlySet<string> {
  const usable = request.nodes
    .filter((node) => node.intact && node.owner === request.owner && !node.neutralBorder)
    .map((node) => node.h3Index);
  const seen = new Set<string>([request.originH3Index]);
  const queue: string[] = [request.originH3Index];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const hex of usable) {
      if (hex === current || seen.has(hex) || !hopAllowed(request, current, hex)) continue;
      seen.add(hex);
      queue.push(hex);
    }
  }
  seen.delete(request.originH3Index);
  return seen;
}

/**
 * A hop is legal when the grid distance is a positive number inside the arrival range, or when that distance is missing and the disk fallback accepts the hop.
 *
 * Purpose: The edge test for airport ferry searches.
 * When to use: While expanding one airport.
 * Expected outcome: True only for a hop the caller would allow.
 * Exceptions: None.
 */
function hopAllowed(
  request: Pick<AirportFerryRouteRequest, 'gridDistance' | 'unmeasuredHopWithinRange' | 'hopRangeHexes'>,
  fromH3Index: string,
  toH3Index: string
): boolean {
  const range = request.hopRangeHexes(toH3Index);
  const distance = request.gridDistance(fromH3Index, toH3Index);
  if (distance == null) return request.unmeasuredHopWithinRange?.(fromH3Index, toH3Index, range) ?? false;
  if (distance <= 0) return false;
  return distance <= range;
}

/**
 * Walks parent links back to the origin.
 *
 * Purpose: The successful path includes every airport the search entered.
 * When to use: When the destination is first reached.
 * Expected outcome: Origin through destination, with no repeated hex.
 * Exceptions: None. The destination was recorded, so the walk ends at the origin.
 */
function pathFrom(previous: ReadonlyMap<string, string>, originH3Index: string, destinationH3Index: string): readonly string[] {
  const reversed: string[] = [destinationH3Index];
  let cursor = destinationH3Index;
  while (cursor !== originH3Index) {
    const prior = previous.get(cursor);
    if (prior === undefined) break;
    reversed.push(prior);
    cursor = prior;
  }
  return reversed.reverse();
}
