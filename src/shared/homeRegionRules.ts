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
  state: Pick<GameStateSnapshot, 'scenarioId' | 'humanHomeRegionHexes' | 'aiHomeRegionHexes' | 'intersectingHomeRegionHexes'>,
  playerId: 'human' | 'opponent',
  mapHexSet: ReadonlySet<string>
): Set<string> {
  if (state.scenarioId !== 'region_vs_region') return new Set<string>();
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
