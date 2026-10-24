import type { GameStateSnapshot } from './ipcTypes';
import { HUMAN_SEAT_ID, type SeatId, isNeutralOwnerId, isSeatId } from './seatIds';
import { computeRoundedPercentage } from './progressFormatting';

/**
 * Identifies which side or sides declared a hex as home for the inner dashed border.
 *
 * Purpose: The inner ring uses one seat's color, or the shared stroke when two homes overlap.
 * When to use: The renderer inner-border pass after a hex is a home outline.
 * Expected outcome: One seat, shared, or null when the hex is not a home.
 * Exceptions: None.
 */
export type HomeRegionOwnerIdentity =
  | { readonly kind: 'single'; readonly seatId: string }
  | { readonly kind: 'shared' }
  | null;

/**
 * Defines inputs for resolving which side's home region a strategic hex belongs to.
 *
 * Purpose: Separates home-region ownership (inner dashed border) from current control (outer solid border).
 * When to use: Renderer passes snapshot home-region lists when drawing outlined home hex borders.
 * Expected outcome: One home returns that seat. Two or more homes, or a listed intersection, return shared.
 * A hex in no home list returns null.
 * Exceptions: None.
 */
export interface HomeRegionOwnerIdentityInput {
  /**
   * Strategic hex whose home-region membership is being resolved.
   *
   * Contract: strategic H3 index present in snapshot hex lists or border styling inputs.
   * When to use: Passed to `resolveHomeRegionOwnerIdentity` for inner dashed border coloring.
   * Expected outcome: Drives which player(s) are treated as home-region owners for the hex.
   * Exceptions: None.
   */
  h3Index: string;
  /**
   * Precomputed intersection list; when omitted, derived from the seat map.
   *
   * Contract: Hexes appearing in two or more home lists; may be empty when regions do not overlap.
   * When to use: Optional optimization when snapshot already carries intersection metadata.
   * Expected outcome: Shared home hexes resolve to a shared owner identity without recomputing intersection.
   * Exceptions: None.
   */
  intersectingHomeRegionHexes?: readonly string[];
  /**
   * Home hexes keyed by seat.
   *
   * Contract: Each value is that seat's home hexes. A hex in two or more values is shared.
   * When to use: Pass `homeRegionHexesBySeat` from the snapshot.
   * Expected outcome: Identity uses these lists.
   * Exceptions: None.
   */
  homeRegionHexesBySeat?: Readonly<Record<string, readonly string[]>>;
}

/**
 * Resolves which player(s) claim a hex as home region for inner dashed border coloring.
 *
 * Purpose: Outer ownership borders reflect current control; inner dashed borders reflect declared home-region
 * ownership so a hex controlled by X in Y's home shows X on the outside and Y on the inside.
 * When to use: Strategic renderer after classifying a hex as a home-region outlined border case.
 * Expected outcome: Two or more homes, or a listed intersection, return shared. One home returns that seat.
 * Exceptions: None.
 */
export function resolveHomeRegionOwnerIdentity(input: HomeRegionOwnerIdentityInput): HomeRegionOwnerIdentity {
  const owners = declaredHomeSeatIds(input);
  if (owners.length === 0) return null;
  const intersectionSet = new Set(
    input.intersectingHomeRegionHexes ??
      computeIntersectingHomeRegionHexes(homeListsForIntersection(input))
  );
  if (owners.length >= 2 || intersectionSet.has(input.h3Index)) return { kind: 'shared' };
  return { kind: 'single', seatId: owners[0]! };
}

/**
 * Seat ids that claim one hex as home.
 *
 * Purpose: Inner-ring color and home detection need every home, not only the first two lists.
 * When to use: Identity and ownership-border resolution.
 * Expected outcome: Seat ids whose home list contains the hex. Empty when the map is absent.
 * Exceptions: None.
 */
function declaredHomeSeatIds(input: {
  readonly h3Index: string;
  readonly homeRegionHexesBySeat?: Readonly<Record<string, readonly string[]>>;
}): string[] {
  const bySeat = input.homeRegionHexesBySeat;
  if (!bySeat) return [];
  return Object.entries(bySeat)
    .filter(([, hexes]) => hexes.includes(input.h3Index))
    .map(([seatId]) => seatId);
}

/**
 * Home lists used when a caller did not pass a precomputed intersection.
 *
 * Purpose: Shared-home detection uses the same lists as seat identity.
 * When to use: `resolveHomeRegionOwnerIdentity` when the caller did not pass an intersection.
 * Expected outcome: One list per seat. An absent map yields no lists.
 * Exceptions: None.
 */
function homeListsForIntersection(input: {
  readonly homeRegionHexesBySeat?: Readonly<Record<string, readonly string[]>>;
}): readonly (readonly string[])[] {
  const bySeat = input.homeRegionHexesBySeat;
  if (!bySeat) return [];
  return Object.values(bySeat);
}

/**
 * Classifies how a strategic hex border should communicate ownership to the current player.
 *
 * Purpose: Provides a single contract for renderer border style decisions so home/non-home visibility
 * and ownership coloring remain consistent across scenarios and draw passes.
 * When to use: Use when deriving per-hex border paint instructions from perspective, visibility, and control.
 * Expected outcome: Home hexes resolve to outlined variants, non-home visible ownership resolves to normal lines,
 * and hidden non-home ownership resolves to no owner-colored border.
 * Exceptions: None.
 */
export type OwnershipBorderStyle =
  | { readonly kind: 'none' }
  | { readonly kind: 'normal' | 'outlined'; readonly ownerId: string }
  | { readonly kind: 'outlinedNeutral' };

/**
 * Documents the `HomeRegionUnitPosition` interface as a named contract surface (export interface HomeRegionUnitPosition).

 * Purpose: Supports maintainability by documenting why `HomeRegionUnitPosition` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HomeRegionUnitPosition {
    /**
   * Specifies the contract for the `player` member (player: string;).

   * Contract: Describes stable behavior for callers of `player` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
player: string;
    /**
   * Specifies the contract for the `h3Index` member (h3Index: string;).

   * Contract: Describes stable behavior for callers of `h3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
h3Index: string;
}

/**
 * Defines the ownership-visibility decision inputs used by perspective-aware border helpers.
 *
 * Purpose: Bundles all state needed to decide whether a player should see ownership on one hex.
 * When to use: Build this parameter object from `GameStateSnapshot` fields and renderer visibility sets.
 * Expected outcome: Deterministic ownership visibility decisions for both home and non-home hexes.
 * Exceptions: None.
 */
export interface OwnershipVisibilityDecisionInput {
  /**
   * Identifies the queried strategic hex.
   *
   * Contract: Supplies the h3 index whose ownership visibility is being resolved.
   * When to use: Populate with the current loop hex before calling `isHexOwnershipVisibleToPerspective`.
   * Expected outcome: Visibility helper evaluates one deterministic hex at a time.
   * Exceptions: None.
   */
  h3Index: string;
  /**
   * Declares the viewer perspective used for own-home visibility exceptions.
   *
   * Contract: Must be the same perspective used for the surrounding snapshot/render flow.
   * When to use: Set from `GameStateSnapshot.playerPerspective` with a stable fallback.
   * Expected outcome: Own-home ownership exceptions map to the correct side.
   * Exceptions: None.
   */
  playerPerspective: 'all' | SeatId;
  /**
   * Supplies currently visible hexes from fog/proximity logic.
   *
   * Contract: Represents normal ownership visibility derived from fog/proximity systems.
   * When to use: Pass the perspective-specific `visibleHexes` set for the current frame/snapshot.
   * Expected outcome: Non-home ownership visibility follows existing fog contracts.
   * Exceptions: None.
   */
  visibleHexes: ReadonlySet<string>;
  /**
   * Home hexes keyed by seat.
   *
   * Contract: Each value is that seat's home. Omitted means no home metadata.
   * When to use: Forward `homeRegionHexesBySeat` from the snapshot.
   * Expected outcome: Own-home checks use the viewer's list.
   * Exceptions: None.
   */
  homeRegionHexesBySeat?: Readonly<Record<string, readonly string[]>>;
  /**
   * Lists intersecting home-region hexes; when omitted, helper derives them from the seat map.
   *
   * Contract: Optional precomputed intersection override to avoid recomputation.
   * When to use: Provide when caller already has intersection metadata on snapshot.
   * Expected outcome: Intersection visibility rules remain stable and perspective-independent.
   * Exceptions: None.
   */
  intersectingHomeRegionHexes?: readonly string[];
}

/**
 * Defines the border-style classification inputs used by ownership border rendering.
 *
 * Purpose: Carries the visibility and control context required to map one hex to a stable style token.
 * When to use: Pass this object after computing ownership visibility for the current perspective.
 * Expected outcome: Shared style categories usable by renderer passes without duplicating business rules.
 * Exceptions: None.
 */
export interface OwnershipBorderStyleDecisionInput {
  /**
   * Identifies the strategic hex whose border style is being resolved.
   *
   * Contract: Supplies the h3 index whose border style token must be computed.
   * When to use: Populate while iterating strategic hexes before painting borders.
   * Expected outcome: Style resolver returns one deterministic token per hex.
   * Exceptions: None.
   */
  h3Index: string;
  /**
   * Reports who currently controls the hex, if known in state.
   *
   * Contract: Uses current authoritative control owner from `strategicControl`.
   * When to use: Pass through control-map lookup result for this hex.
   * Expected outcome: Owner-colored styles reflect current control state when visible.
   * Exceptions: None.
   */
  controllerPlayerId: string | null | undefined;
  /**
   * States whether the current perspective is allowed to see ownership for this hex.
   *
   * Contract: Indicates if ownership may be shown without violating fog contracts.
   * When to use: Use output from `isHexOwnershipVisibleToPerspective`.
   * Expected outcome: Hidden ownership does not leak via border colors.
   * Exceptions: None.
   */
  isOwnershipVisible: boolean;
  /**
   * Lists intersecting home-region hexes; when omitted, helper derives them from the seat map.
   *
   * Contract: Optional precomputed intersection override to keep classification fast.
   * When to use: Pass provided snapshot intersection metadata when available.
   * Expected outcome: Intersecting home hexes resolve to controller-colored outlines when a controller is known.
   * Exceptions: None.
   */
  intersectingHomeRegionHexes?: readonly string[];
  /**
   * Home hexes keyed by seat.
   *
   * Contract: Each value is that seat's home hexes.
   * When to use: Pass `homeRegionHexesBySeat` from the snapshot.
   * Expected outcome: A hex in any of these lists is a home hex for the outer outline.
   * Exceptions: None.
   */
  homeRegionHexesBySeat?: Readonly<Record<string, readonly string[]>>;
}

/**
 * Defines the `uniqueSortedHexes` function shape (function uniqueSortedHexes(hexes: readonly string[]): string[]).

 * Purpose: Supports maintainability by documenting why `uniqueSortedHexes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function uniqueSortedHexes(hexes: readonly string[]): string[] {
  return [...new Set(hexes)].sort();
}

/**
 * Defines the `computeIntersectingHomeRegionHexes` function shape (export function computeIntersectingHomeRegionHexes().

 * Purpose: A hex claimed by two or more homes is shared, including when more than two sides are playing.
 * When to use: Snapshot metadata and any caller that used to pass the human list and the AI list.
 * Expected outcome: Each shared hex once, sorted. A hex listed twice inside one home counts as one home.
 * Exceptions: None.
 */
export function computeIntersectingHomeRegionHexes(homeHexLists: readonly (readonly string[])[]): string[] {
  const counts = new Map<string, number>();
  for (const list of homeHexLists) {
    for (const h3Index of new Set(list)) {
      counts.set(h3Index, (counts.get(h3Index) ?? 0) + 1);
    }
  }
  const shared = [...counts.entries()].filter(([, count]) => count >= 2).map(([h3Index]) => h3Index);
  return uniqueSortedHexes(shared);
}

/**
 * Defines the `computeHomeRegionHexPartitionsForPrompting` function shape (export function computeHomeRegionHexPartitionsForPrompting().

 * Purpose: Splits AI vs human declared home-region hex lists into exclusive subsets and intersection for Commander system-prompt bullets.
 * When to use: Only from strategic LLM context assembly when `scenarioId === 'region_vs_region'`.
 * Expected outcome: `equalAsSets` true when sorted unique lists match; `intersection` matches `computeIntersectingHomeRegionHexes` on the same inputs.
 * Exceptions: None; empty inputs yield empty arrays and `equalAsSets` true.
 */
export function computeHomeRegionHexPartitionsForPrompting(
  leftHomeHexes: readonly string[] | undefined,
  rightHomeHexes: readonly string[] | undefined
): {
  aiExclusive: string[];
  humanExclusive: string[];
  intersection: string[];
  equalAsSets: boolean;
} {
  const ai = uniqueSortedHexes(leftHomeHexes ?? []);
  const human = uniqueSortedHexes(rightHomeHexes ?? []);
  const aiSet = new Set(ai);
  const humanSet = new Set(human);
  const equalAsSets = ai.length === human.length && ai.every((h) => humanSet.has(h));
  const aiExclusive = ai.filter((h) => !humanSet.has(h));
  const humanExclusive = human.filter((h) => !aiSet.has(h));
  const intersection = computeIntersectingHomeRegionHexes([rightHomeHexes ?? [], leftHomeHexes ?? []]);
  return { aiExclusive, humanExclusive, intersection, equalAsSets };
}

/**
 * Defines the `computeContestedHomeRegionHexes` function shape (export function computeContestedHomeRegionHexes().

 * Purpose: Supports maintainability by documenting why `computeContestedHomeRegionHexes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function computeContestedHomeRegionHexes(
  units: readonly HomeRegionUnitPosition[],
  homeRegionHexes: readonly string[]
): string[] {
  const homeHexSet = new Set(homeRegionHexes);
  const playersByHomeHex = new Map<string, Set<string>>();
  for (const unit of units) {
    if (!homeHexSet.has(unit.h3Index)) continue;
    let players = playersByHomeHex.get(unit.h3Index);
    if (!players) {
      players = new Set<string>();
      playersByHomeHex.set(unit.h3Index, players);
    }
    players.add(unit.player);
  }
  return uniqueSortedHexes(
    [...playersByHomeHex.entries()]
      .filter(([, players]) => players.size > 1)
      .map(([h3Index]) => h3Index)
  );
}

/**
 * Defines the `getForcedVisibleHomeRegionHexesForPlayer` function shape (export function getForcedVisibleHomeRegionHexesForPlayer( state: Pick<GameStateSnapshot, 'intersectingHomeRegionHexes' | 'homeRegionHexesBySeat'>,).

 * Purpose: Supports maintainability by documenting why `getForcedVisibleHomeRegionHexesForPlayer` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getForcedVisibleHomeRegionHexesForPlayer(
  state: Pick<GameStateSnapshot, 'intersectingHomeRegionHexes' | 'homeRegionHexesBySeat'>,
  playerId: SeatId,
  mapHexSet: ReadonlySet<string>
): Set<string> {
  const ownHomeHexes = state.homeRegionHexesBySeat?.[playerId] ?? [];
  if (!hasHomeRegionMetadata(state) && ownHomeHexes.length === 0) return new Set<string>();
  const intersectionHexes = state.intersectingHomeRegionHexes ??
    computeIntersectingHomeRegionHexes(Object.values(state.homeRegionHexesBySeat ?? {}));
  return new Set(
    [...ownHomeHexes, ...intersectionHexes].filter((h3Index) => mapHexSet.has(h3Index))
  );
}

/**
 * Detects whether a snapshot carries home-region metadata that should activate home visibility rules.
 *
 * Purpose: Generalizes home-region behaviors across any scenario that provides home-region hex lists.
 * When to use: Use before applying forced-home visibility or ownership-display exceptions.
 * Expected outcome: `true` when any seat has at least one home-region hex listed.
 * Exceptions: None.
 */
export function hasHomeRegionMetadata(
  state: { homeRegionHexesBySeat?: Readonly<Record<string, readonly string[]>> }
): boolean {
  const lists = Object.values(state.homeRegionHexesBySeat ?? {});
  return lists.some((hexes) => hexes.length > 0);
}

/**
 * Maps a snapshot perspective onto the three ownership views.
 *
 * Purpose: Drawing and tooltips must not treat All sides as the human seat.
 * When to use: Before `isHexOwnershipVisibleToPerspective`.
 * Expected outcome: `all` and a seat id pass through. Anything else is the human seat.
 * Exceptions: None.
 */
export function ownershipPerspective(value: string | undefined): 'all' | SeatId {
  if (value === 'all') return 'all';
  if (value !== undefined && isSeatId(value)) return value;
  return HUMAN_SEAT_ID;
}

/**
 * Determines whether ownership for one hex is visible to the current player perspective.
 *
 * Purpose: Centralizes ownership visibility contract across home exceptions and normal fog visibility.
 * When to use: Use before selecting owner-colored border styles in renderer draw passes.
 * Expected outcome: `'all'` shows every owner. Own-home and intersecting home hexes remain ownership-visible even without proximity.
 * Exceptions: None.
 */
export function isHexOwnershipVisibleToPerspective(input: OwnershipVisibilityDecisionInput): boolean {
  if (input.playerPerspective === 'all') return true;
  if (input.visibleHexes.has(input.h3Index)) return true;
  if (!hasHomeRegionMetadata(input)) return false;
  const intersectionSet = new Set(
    input.intersectingHomeRegionHexes ??
      computeIntersectingHomeRegionHexes(Object.values(input.homeRegionHexesBySeat ?? {}))
  );
  if (intersectionSet.has(input.h3Index)) return true;
  const ownHomeHexSet = new Set(input.homeRegionHexesBySeat?.[input.playerPerspective] ?? []);
  return ownHomeHexSet.has(input.h3Index);
}

/**
 * Resolves border style token for one strategic hex using ownership visibility and home-region context.
 *
 * Purpose: Encodes the shared contract required by home outlined borders and normal non-home borders.
 * When to use: Use for every strategic hex before rendering ownership borders.
 * Expected outcome: Home hexes resolve to outlined variants keyed by current controller for the outer solid
 * border; renderer pairs these with `resolveHomeRegionOwnerIdentity` for the inner dashed home-owner color.
 * Intersecting home hexes resolve to controller-colored outlines when controlled; uncontrolled home hexes use
 * neutral outer outlines.
 * Exceptions: None.
 */
export function resolveOwnershipBorderStyle(input: OwnershipBorderStyleDecisionInput): OwnershipBorderStyle {
  const isHomeHex = declaredHomeSeatIds(input).length > 0;
  const controller = input.controllerPlayerId ?? null;
  if (isHomeHex) {
    if (controller != null && isSeatId(controller)) return { kind: 'outlined', ownerId: controller };
    return { kind: 'outlinedNeutral' };
  }
  if (!input.isOwnershipVisible) return { kind: 'none' };
  if (controller != null && isSeatId(controller)) return { kind: 'normal', ownerId: controller };
  if (controller != null && isNeutralOwnerId(controller)) return { kind: 'outlinedNeutral' };
  return { kind: 'none' };
}

/**
 * Defines the `countControlledHexesInRegion` function shape (export function countControlledHexesInRegion( controlRows: ReadonlyArray<{ h3Index: string; controllerPlayerId: string | null }>, regionHexes: readonly st).

 * Purpose: Supports maintainability by documenting why `countControlledHexesInRegion` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function countControlledHexesInRegion(
  controlRows: ReadonlyArray<{ h3Index: string; controllerPlayerId: string | null }>,
  regionHexes: readonly string[] | undefined,
  playerId: string
): { controlled: number; total: number; pct: number } {
  const uniqueRegionHexes = uniqueSortedHexes(regionHexes ?? []);
  const controlByHex = new Map(controlRows.map((row) => [row.h3Index, row.controllerPlayerId]));
  const controlled = uniqueRegionHexes.filter((h3Index) => controlByHex.get(h3Index) === playerId).length;
  const total = uniqueRegionHexes.length;
  const pct = computeRoundedPercentage(controlled, total);
  return { controlled, total, pct };
}
