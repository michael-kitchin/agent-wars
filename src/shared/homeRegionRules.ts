import type { GameStateSnapshot } from './ipcTypes';
import { computeRoundedPercentage } from './progressFormatting';

/**
 * Documents the `HomeRegionOutlineState` type alias (export type HomeRegionOutlineState).

 * Purpose: Supports maintainability by documenting why `HomeRegionOutlineState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type HomeRegionOutlineState =
  | 'intersection'
  | 'contested'
  | 'controlledByHuman'
  | 'controlledByOpponent'
  | 'unknown';

/**
 * Identifies which side(s) declared a hex as home region for inner dashed border coloring.
 *
 * Purpose: Distinguishes home-region ownership from current control when rendering dual-line home borders.
 * When to use: Renderer inner-border pass after confirming the hex is a home-region outlined case.
 * Expected outcome: `human`, `opponent`, `both` (intersection), or `null` for non-home hexes.
 * Exceptions: None.
 */
export type HomeRegionOwnerIdentity = 'human' | 'opponent' | 'both' | null;

/**
 * Defines inputs for resolving which side's home region a strategic hex belongs to.
 *
 * Purpose: Separates home-region ownership (inner dashed border) from current control (outer solid border).
 * When to use: Renderer passes snapshot home-region lists when drawing outlined home hex borders.
 * Expected outcome: Exclusive human-home hexes resolve to `human`, exclusive opponent-home to `opponent`,
 * intersection hexes to `both`, and non-home hexes to `null`.
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
   * Human home-region hex list from snapshot metadata, when present.
   *
   * Contract: Read-only list of strategic H3 indexes declared as human home region.
   * When to use: Together with opponent home lists to classify intersection and sole ownership.
   * Expected outcome: Hexes in this list contribute to human home-region identity when matched.
   * Exceptions: None.
   */
  humanHomeRegionHexes?: readonly string[];
  /**
   * Opponent home-region hex list from snapshot metadata, when present.
   *
   * Contract: Read-only list of strategic H3 indexes declared as opponent home region.
   * When to use: Together with human home lists to classify intersection and sole ownership.
   * Expected outcome: Hexes in this list contribute to opponent home-region identity when matched.
   * Exceptions: None.
   */
  aiHomeRegionHexes?: readonly string[];
  /**
   * Precomputed intersection list; when omitted, derived from both home lists.
   *
   * Contract: Hexes appearing in both home lists; may be empty when regions do not overlap.
   * When to use: Optional optimization when snapshot already carries intersection metadata.
   * Expected outcome: Shared home hexes resolve to `both` owner identity without recomputing intersection.
   * Exceptions: None.
   */
  intersectingHomeRegionHexes?: readonly string[];
}

/**
 * Resolves which player(s) claim a hex as home region for inner dashed border coloring.
 *
 * Purpose: Outer ownership borders reflect current control; inner dashed borders reflect declared home-region
 * ownership so a hex controlled by X in Y's home shows X on the outside and Y on the inside.
 * When to use: Strategic renderer after classifying a hex as a home-region outlined border case.
 * Expected outcome: Intersection hexes return `both` (neutral inner color); exclusive lists return one side.
 * Exceptions: None.
 */
export function resolveHomeRegionOwnerIdentity(input: HomeRegionOwnerIdentityInput): HomeRegionOwnerIdentity {
  const inHuman = (input.humanHomeRegionHexes ?? []).includes(input.h3Index);
  const inAi = (input.aiHomeRegionHexes ?? []).includes(input.h3Index);
  if (!inHuman && !inAi) return null;
  const intersectionSet = new Set(
    input.intersectingHomeRegionHexes ??
      computeIntersectingHomeRegionHexes(input.humanHomeRegionHexes ?? [], input.aiHomeRegionHexes ?? [])
  );
  if (intersectionSet.has(input.h3Index) || (inHuman && inAi)) return 'both';
  if (inHuman) return 'human';
  return 'opponent';
}

/**
 * Formats the parenthetical home-region assignment suffix for strategic tooltip control lines.
 *
 * Purpose: Distinguishes declared home-region ownership from current hex control in tooltip copy.
 * When to use: After `resolveHomeRegionOwnerIdentity` returns a non-null identity for a strategic hex.
 * Expected outcome: `(Human Home Region)`, `(AI Home Region)`, or `(Human & AI Home Region)`.
 * Exceptions: None — callers must pass a non-null `HomeRegionOwnerIdentity`.
 */
export function formatHomeRegionAssignmentControlSuffix(
  identity: Exclude<HomeRegionOwnerIdentity, null>
): string {
  if (identity === 'both') return '(Human & AI Home Region)';
  if (identity === 'human') return '(Human Home Region)';
  return '(AI Home Region)';
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
  | 'none'
  | 'normalControlledByHuman'
  | 'normalControlledByOpponent'
  | 'outlinedControlledByHuman'
  | 'outlinedControlledByOpponent'
  | 'outlinedNeutral';

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
  playerPerspective: 'human' | 'opponent';
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
   * Lists human home-region hexes when scenario metadata exists.
   *
   * Contract: Optional home metadata source for own-home ownership exceptions.
   * When to use: Forward from snapshot metadata when available.
   * Expected outcome: Human-home membership checks remain deterministic.
   * Exceptions: None.
   */
  humanHomeRegionHexes?: readonly string[];
  /**
   * Lists opponent home-region hexes when scenario metadata exists.
   *
   * Contract: Optional home metadata source for cross-side and intersection checks.
   * When to use: Forward from snapshot metadata when available.
   * Expected outcome: Opponent-home membership checks remain deterministic.
   * Exceptions: None.
   */
  aiHomeRegionHexes?: readonly string[];
  /**
   * Lists intersecting home-region hexes; when omitted, helper derives them from both home sets.
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
   * Lists human home-region hexes when scenario metadata exists.
   *
   * Contract: Optional home metadata used to classify home-region borders.
   * When to use: Forward snapshot metadata for the active frame.
   * Expected outcome: Human-home membership decisions remain deterministic.
   * Exceptions: None.
   */
  humanHomeRegionHexes?: readonly string[];
  /**
   * Lists opponent home-region hexes when scenario metadata exists.
   *
   * Contract: Optional home metadata used to classify home-region borders.
   * When to use: Forward snapshot metadata for the active frame.
   * Expected outcome: Opponent-home membership decisions remain deterministic.
   * Exceptions: None.
   */
  aiHomeRegionHexes?: readonly string[];
  /**
   * Lists intersecting home-region hexes; when omitted, helper derives them from both home sets.
   *
   * Contract: Optional precomputed intersection override to keep classification fast.
   * When to use: Pass provided snapshot intersection metadata when available.
   * Expected outcome: Intersecting home hexes resolve to controller-colored outlines when a controller is known.
   * Exceptions: None.
   */
  intersectingHomeRegionHexes?: readonly string[];
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

 * Purpose: Supports maintainability by documenting why `computeIntersectingHomeRegionHexes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function computeIntersectingHomeRegionHexes(
  humanHomeRegionHexes: readonly string[],
  aiHomeRegionHexes: readonly string[]
): string[] {
  const aiSet = new Set(aiHomeRegionHexes);
  return uniqueSortedHexes(humanHomeRegionHexes.filter((h3Index) => aiSet.has(h3Index)));
}

/**
 * Defines the `computeHomeRegionHexPartitionsForPrompting` function shape (export function computeHomeRegionHexPartitionsForPrompting().

 * Purpose: Splits AI vs human declared home-region hex lists into exclusive subsets and intersection for Commander system-prompt bullets.
 * When to use: Only from strategic LLM context assembly when `scenarioId === 'region_vs_region'`.
 * Expected outcome: `equalAsSets` true when sorted unique lists match; `intersection` matches `computeIntersectingHomeRegionHexes` on the same inputs.
 * Exceptions: None; empty inputs yield empty arrays and `equalAsSets` true.
 */
export function computeHomeRegionHexPartitionsForPrompting(
  aiHomeRegionHexes: readonly string[] | undefined,
  humanHomeRegionHexes: readonly string[] | undefined
): {
  aiExclusive: string[];
  humanExclusive: string[];
  intersection: string[];
  equalAsSets: boolean;
} {
  const ai = uniqueSortedHexes(aiHomeRegionHexes ?? []);
  const human = uniqueSortedHexes(humanHomeRegionHexes ?? []);
  const aiSet = new Set(ai);
  const humanSet = new Set(human);
  const equalAsSets = ai.length === human.length && ai.every((h) => humanSet.has(h));
  const aiExclusive = ai.filter((h) => !humanSet.has(h));
  const humanExclusive = human.filter((h) => !aiSet.has(h));
  const intersection = computeIntersectingHomeRegionHexes(humanHomeRegionHexes ?? [], aiHomeRegionHexes ?? []);
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
 * Defines the `classifyHomeRegionOutlineState` function shape (export function classifyHomeRegionOutlineState( h3Index: string, intersectionHexes: ReadonlySet<string>, contestedHexes: ReadonlySet<string>, contro).

 * Purpose: Supports maintainability by documenting why `classifyHomeRegionOutlineState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function classifyHomeRegionOutlineState(
  h3Index: string,
  intersectionHexes: ReadonlySet<string>,
  contestedHexes: ReadonlySet<string>,
  controllerPlayerId: string | null | undefined
): HomeRegionOutlineState {
  if (intersectionHexes.has(h3Index)) return 'intersection';
  if (contestedHexes.has(h3Index)) return 'contested';
  if (controllerPlayerId === 'human') return 'controlledByHuman';
  if (controllerPlayerId === 'opponent') return 'controlledByOpponent';
  return 'unknown';
}

/**
 * Defines the `getForcedVisibleHomeRegionHexesForPlayer` function shape (export function getForcedVisibleHomeRegionHexesForPlayer( state: Pick<GameStateSnapshot, 'scenarioId' | 'humanHomeRegionHexes' | 'aiHomeRegionHexes' | 'inter).

 * Purpose: Supports maintainability by documenting why `getForcedVisibleHomeRegionHexesForPlayer` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getForcedVisibleHomeRegionHexesForPlayer(
  state: Pick<GameStateSnapshot, 'humanHomeRegionHexes' | 'aiHomeRegionHexes' | 'intersectingHomeRegionHexes'>,
  playerId: 'human' | 'opponent',
  mapHexSet: ReadonlySet<string>
): Set<string> {
  if (!hasHomeRegionMetadata(state)) return new Set<string>();
  const ownHomeHexes = playerId === 'human'
    ? (state.humanHomeRegionHexes ?? [])
    : (state.aiHomeRegionHexes ?? []);
  const intersectionHexes = state.intersectingHomeRegionHexes ??
    computeIntersectingHomeRegionHexes(state.humanHomeRegionHexes ?? [], state.aiHomeRegionHexes ?? []);
  return new Set(
    [...ownHomeHexes, ...intersectionHexes].filter((h3Index) => mapHexSet.has(h3Index))
  );
}

/**
 * Detects whether a snapshot carries home-region metadata that should activate home visibility rules.
 *
 * Purpose: Generalizes home-region behaviors across any scenario that provides home-region hex lists.
 * When to use: Use before applying forced-home visibility or ownership-display exceptions.
 * Expected outcome: `true` when either side has at least one home-region hex listed.
 * Exceptions: None.
 */
export function hasHomeRegionMetadata(
  state: { humanHomeRegionHexes?: readonly string[]; aiHomeRegionHexes?: readonly string[] }
): boolean {
  return (state.humanHomeRegionHexes?.length ?? 0) > 0 || (state.aiHomeRegionHexes?.length ?? 0) > 0;
}

/**
 * Determines whether ownership for one hex is visible to the current player perspective.
 *
 * Purpose: Centralizes ownership visibility contract across home exceptions and normal fog visibility.
 * When to use: Use before selecting owner-colored border styles in renderer draw passes.
 * Expected outcome: Own-home and intersecting home hexes remain ownership-visible even without proximity.
 * Exceptions: None.
 */
export function isHexOwnershipVisibleToPerspective(input: OwnershipVisibilityDecisionInput): boolean {
  if (input.visibleHexes.has(input.h3Index)) return true;
  if (!hasHomeRegionMetadata(input)) return false;
  const intersectionSet = new Set(
    input.intersectingHomeRegionHexes ??
      computeIntersectingHomeRegionHexes(input.humanHomeRegionHexes ?? [], input.aiHomeRegionHexes ?? [])
  );
  if (intersectionSet.has(input.h3Index)) return true;
  const ownHomeHexSet = new Set(
    input.playerPerspective === 'human'
      ? (input.humanHomeRegionHexes ?? [])
      : (input.aiHomeRegionHexes ?? [])
  );
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
  const humanHomeHexes = new Set(input.humanHomeRegionHexes ?? []);
  const aiHomeHexes = new Set(input.aiHomeRegionHexes ?? []);
  const isHomeHex = humanHomeHexes.has(input.h3Index) || aiHomeHexes.has(input.h3Index);
  if (isHomeHex) {
    // Home-region ownership outlines must always reflect current controller color, even when fog-hidden.
    if (input.controllerPlayerId === 'human') return 'outlinedControlledByHuman';
    if (input.controllerPlayerId === 'opponent') return 'outlinedControlledByOpponent';
    return 'outlinedNeutral';
  }
  if (!input.isOwnershipVisible) return 'none';
  if (input.controllerPlayerId === 'human') return 'normalControlledByHuman';
  if (input.controllerPlayerId === 'opponent') return 'normalControlledByOpponent';
  return 'none';
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
  playerId: 'human' | 'opponent'
): { controlled: number; total: number; pct: number } {
  const uniqueRegionHexes = uniqueSortedHexes(regionHexes ?? []);
  const controlByHex = new Map(controlRows.map((row) => [row.h3Index, row.controllerPlayerId]));
  const controlled = uniqueRegionHexes.filter((h3Index) => controlByHex.get(h3Index) === playerId).length;
  const total = uniqueRegionHexes.length;
  const pct = computeRoundedPercentage(controlled, total);
  return { controlled, total, pct };
}
