/**
 * Pure strategic naval edge rules: transit water/coastal vs land-seaport berth/egress.
 *
 * Purpose: Single predicate set so pathfinding, reachable sets, preview, commit, and AI validation
 * share berth-not-canal connectivity without promoting seaports to coastal.
 * When to use: Strategic naval movement only; tactical uses `tacticalNavalEnterNeighborCost`.
 * Expected outcome: Transit hexes form the sail graph; land seaports are occupy-only endpoints.
 * Exceptions: None; callers supply native terrain and seaport flags (no database access here).
 */

/**
 * Native terrain fields needed to classify a strategic hex for naval edges.
 *
 * Purpose: Avoid coupling edge rules to snapshot or DB row types.
 * When to use: Pass hex `terrain` / optional `terrainKind` plus whether the hex has a seaport.
 * Expected outcome: `hasSeaport` is a boolean already resolved by the caller.
 * Exceptions: None.
 */
export interface NavalStrategicHexAttrs {
  /**
   * Passability bucket from the hex row (`land`, `water`, `coastal`, `wetlands`, or a land-like label).
   *
   * Contract: Must be the native value, not seaport-promoted coastal.
   * When to use: Always set from `hexes.terrain` or an equivalent native field.
   * Expected outcome: Combined with `terrainKind` to decide transit vs land seaport.
   * Exceptions: Unknown strings are treated as non-transit land.
   */
  nativeTerrain: string;
  /**
   * Optional pipeline kind (`coastal`, `plains`, `water`, …).
   *
   * Contract: `coastal` is transit even when `nativeTerrain` is not `water`.
   * When to use: Pass `hexes.terrainKind` when present.
   * Expected outcome: Preserves coastline sailing that depends on kind rather than the terrain bucket.
   * Exceptions: Omitted kind does not block transit when `nativeTerrain` is water or coastal.
   */
  terrainKind?: string;
  /**
   * Whether the hex has at least one intact seaport.
   *
   * Contract: True when live `seaportCount > 0` (or equivalent).
   * When to use: Always set; false means the hex cannot be a land seaport.
   * Expected outcome: Seaport on transit stays transit; seaport on non-transit is a land seaport.
   * Exceptions: None.
   */
  hasSeaport: boolean;
}

/**
 * Returns whether a hex is native naval transit (open water or coastline).
 *
 * Purpose: Transit nodes may appear in the middle of a naval path; land seaports must not.
 * When to use: Before treating a hex as a sail-graph node.
 * Expected outcome: True for `water`/`coastal` passability or `terrainKind === 'coastal'`.
 * Exceptions: None.
 */
export function isNativeNavalTransitTerrain(nativeTerrain: string, terrainKind?: string): boolean {
  return nativeTerrain === 'water' || nativeTerrain === 'coastal' || terrainKind === 'coastal';
}

/**
 * Returns whether attrs describe a land seaport (seaport on non-transit terrain).
 *
 * Purpose: Distinguishes berth/egress hexes from coastline ports that remain transit.
 * When to use: Occupancy, last-step berth, and origin egress checks.
 * Expected outcome: True only when `hasSeaport` and the hex is not native transit.
 * Exceptions: None.
 */
export function isLandSeaportHex(attrs: NavalStrategicHexAttrs): boolean {
  if (!attrs.hasSeaport) return false;
  return !isNativeNavalTransitTerrain(attrs.nativeTerrain, attrs.terrainKind);
}

/**
 * Returns whether a naval unit may occupy the hex (stay, berth, or sail).
 *
 * Purpose: Hold-in-place and destination occupancy without implying the hex is transit.
 * When to use: Same-hex orders and destination filters before edge BFS.
 * Expected outcome: True for transit hexes and land seaports; false for seaport-less inland land.
 * Exceptions: None.
 */
export function navalMayOccupyHex(attrs: NavalStrategicHexAttrs): boolean {
  return isNativeNavalTransitTerrain(attrs.nativeTerrain, attrs.terrainKind) || isLandSeaportHex(attrs);
}

/**
 * Returns whether a naval unit may step from `from` into `to` in one strategic edge.
 *
 * Purpose: Encodes berth (transit → land seaport), egress (land seaport → transit), and the
 * ban on port→port or port→inland land. Callers must still treat land seaports as non-expandable
 * intermediates in BFS so a berth cannot be a through-node.
 * When to use: Each candidate neighbor during naval path search.
 * Expected outcome: True for transit↔transit, transit→land seaport, and land seaport→transit.
 * Exceptions: None; same-hex hold is not an edge (use `navalMayOccupyHex`).
 */
export function navalMayTraverseStrategicEdge(from: NavalStrategicHexAttrs, to: NavalStrategicHexAttrs): boolean {
  const fromTransit = isNativeNavalTransitTerrain(from.nativeTerrain, from.terrainKind);
  const toTransit = isNativeNavalTransitTerrain(to.nativeTerrain, to.terrainKind);
  const fromLandSeaport = isLandSeaportHex(from);
  const toLandSeaport = isLandSeaportHex(to);
  if (fromTransit && toTransit) return true;
  if (fromTransit && toLandSeaport) return true;
  if (fromLandSeaport && toTransit) return true;
  return false;
}

/**
 * Estimates strategic naval turns for a known berth/egress path length.
 *
 * Purpose: First-turn egress from a land seaport is one step, so `ceil(distance / budget)` undercounts
 * remaining sailing. `check_distance` and `assess_unit` must use this after a full-path search.
 * When to use: After counting edges on a full naval berth/egress path, not a same-turn egress-only search.
 * Expected outcome: 0 when distance is 0; `ceil(hexDistance / budget)` from transit; from a land seaport,
 * `1 + ceil((hexDistance - 1) / budget)` (egress turn plus remaining edges at the naval budget).
 * Exceptions: `movementBudget` below 1 is treated as 1.
 */
export function estimateNavalStrategicTurns(
  hexDistance: number,
  movementBudget: number,
  originIsLandSeaport: boolean
): number {
  if (hexDistance <= 0) return 0;
  const budget = Math.max(1, movementBudget);
  if (!originIsLandSeaport) return Math.ceil(hexDistance / budget);
  return 1 + Math.ceil((hexDistance - 1) / budget);
}
