import type { GameStateSnapshot } from './ipcTypes';
import { computeRoundedPercentage } from './progressFormatting';

export type HomeRegionOutlineState =
  | 'intersection'
  | 'contested'
  | 'controlledByHuman'
  | 'controlledByOpponent'
  | 'unknown';

export interface HomeRegionUnitPosition {
  player: string;
  h3Index: string;
}

function uniqueSortedHexes(hexes: readonly string[]): string[] {
  return [...new Set(hexes)].sort();
}

/**
 * Use this to determine which home-region hexes belong to both sides so renderer and fog logic can
 * apply shared intersection rules consistently.
 */
export function computeIntersectingHomeRegionHexes(
  humanHomeRegionHexes: readonly string[],
  aiHomeRegionHexes: readonly string[]
): string[] {
  const aiSet = new Set(aiHomeRegionHexes);
  return uniqueSortedHexes(humanHomeRegionHexes.filter((h3Index) => aiSet.has(h3Index)));
}

/**
 * Use this to mark home-region hexes that currently contain units from more than one player, which
 * are treated as contested for gray outlining.
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
 * Use this to apply the canonical outline-state precedence for home hexes:
 * intersection first, then contested, then controller-colored ownership.
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
 * Use this to derive always-visible home-region hexes for a player in region-vs-region scenarios.
 * The result includes that side's home hexes plus intersecting home hexes and is filtered to map cells.
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
 * Use this to produce count/percentage ownership summaries for a region from persisted control rows,
 * keeping prompt and UI ownership math aligned.
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
