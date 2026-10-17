import { isNeutralBorderHex } from './h3Resolutions';
import { getMaxUnitsPerType, parseGameSize } from './gameSize';
import { countControlledHexesInRegion } from './homeRegionRules';
import { ALL_BUILD_UNIT_TYPES, type BuildUnitType } from './ipc/productionTypes';
import { getPlayerUnitCountsByType } from './unitCountsByType';

/**
 * The parts of a game-state snapshot that the top-bar readouts read.
 *
 * Purpose: A narrow input keeps the totals testable without building a whole snapshot.
 * When to use: Pass the renderer's `GameStateSnapshot`; it satisfies this shape.
 * Expected outcome: Optional lists may be missing on early or partial snapshots and count as empty.
 * Exceptions: None.
 */
export interface TopBarStatsInput {
  /**
   * Every unit in the snapshot.
   *
   * Contract: Each unit names its player and its unit type.
   * When to use: Pass `state.units`.
   * Expected outcome: Units whose player is `human` count toward Forces.
   * Exceptions: None.
   */
  readonly units: ReadonlyArray<{ readonly player: string; readonly unitType: string }>;
  /**
   * The match's game size.
   *
   * Contract: Any value `parseGameSize` accepts; unknown values mean Small.
   * When to use: Pass `state.gameSize`.
   * Expected outcome: Sets the per-type caps.
   * Exceptions: None.
   */
  readonly gameSize?: unknown;
  /**
   * Which player controls each strategic hex.
   *
   * Contract: One row per hex the player knows about.
   * When to use: Pass `state.strategicControl`.
   * Expected outcome: Drives Production and both home readouts.
   * Exceptions: None.
   */
  readonly strategicControl?: ReadonlyArray<{ readonly h3Index: string; readonly controllerPlayerId: string | null }>;
  /**
   * Current urban cell counts per strategic hex.
   *
   * Contract: `urbanHexCount` is the hex's present urban count, after any destruction.
   * When to use: Pass `state.strategicInfrastructure`.
   * Expected outcome: Summed for Production.
   * Exceptions: None.
   */
  readonly strategicInfrastructure?: ReadonlyArray<{ readonly h3Index: string; readonly urbanHexCount: number }>;
  /**
   * The human home region's hexes.
   *
   * Contract: May repeat a hex; repeats count once.
   * When to use: Pass `state.humanHomeRegionHexes`.
   * Expected outcome: The total for Your home.
   * Exceptions: None.
   */
  readonly humanHomeRegionHexes?: readonly string[];
  /**
   * The opponent home region's hexes.
   *
   * Contract: May repeat a hex; repeats count once.
   * When to use: Pass `state.aiHomeRegionHexes`.
   * Expected outcome: The total for Enemy home.
   * Exceptions: None.
   */
  readonly aiHomeRegionHexes?: readonly string[];
}

/**
 * Held and total hex counts for one home region.
 *
 * Purpose: Both home readouts share this shape.
 * When to use: Read from `TopBarStats`.
 * Expected outcome: `held` never exceeds `total`.
 * Exceptions: None.
 */
export interface HomeHold {
  /**
   * Hexes of the region the human player controls.
   *
   * Contract: Counts each hex once.
   * When to use: The readout's main number.
   * Expected outcome: Zero or more.
   * Exceptions: None.
   */
  readonly held: number;
  /**
   * Hexes in the region.
   *
   * Contract: Counts each hex once.
   * When to use: The readout's suffix.
   * Expected outcome: Zero when the snapshot has no region list.
   * Exceptions: None.
   */
  readonly total: number;
}

/**
 * Totals shown in the top bar.
 *
 * Purpose: One computed record that the renderer formats and the tests check.
 * When to use: Returned by `computeTopBarStats`.
 * Expected outcome: Plain numbers; formatting happens in `formatTopBarStatParts`.
 * Exceptions: None.
 */
export interface TopBarStats {
  /**
   * Production the human player's cities can add each turn.
   *
   * Contract: Matches the per-turn credit rule: current urban count, human control, no neutral-border hexes.
   * When to use: The Production readout.
   * Expected outcome: Zero or more.
   * Exceptions: None.
   */
  readonly productionPerTurn: number;
  /**
   * Human units fielded, by type.
   *
   * Contract: Only the four buildable types are counted.
   * When to use: The Forces tip.
   * Expected outcome: Zero for a type with no units.
   * Exceptions: None.
   */
  readonly fieldedByType: Readonly<Record<BuildUnitType, number>>;
  /**
   * The game size's cap for each type.
   *
   * Contract: From `getMaxUnitsPerType`.
   * When to use: The Forces tip.
   * Expected outcome: Positive numbers.
   * Exceptions: None.
   */
  readonly capByType: Readonly<Record<BuildUnitType, number>>;
  /**
   * Sum of `fieldedByType`.
   *
   * Contract: Equals the sum of the per-type counts.
   * When to use: The Forces readout's main number.
   * Expected outcome: Zero or more.
   * Exceptions: None.
   */
  readonly unitsFielded: number;
  /**
   * Sum of `capByType`.
   *
   * Contract: Equals the sum of the per-type caps.
   * When to use: The Forces readout's suffix.
   * Expected outcome: 34 for a Small game.
   * Exceptions: None.
   */
  readonly unitCap: number;
  /**
   * The human player's hold on their own home region.
   *
   * Contract: Human control only.
   * When to use: The Your home readout.
   * Expected outcome: See `HomeHold`.
   * Exceptions: None.
   */
  readonly humanHome: HomeHold;
  /**
   * The human player's hold on the opponent's home region.
   *
   * Contract: Human control only.
   * When to use: The Enemy home readout.
   * Expected outcome: See `HomeHold`.
   * Exceptions: None.
   */
  readonly opponentHome: HomeHold;
}

/**
 * Computes the top-bar totals from a snapshot.
 *
 * Purpose: Display-only totals derived in the renderer; nothing here changes game state.
 * When to use: On every top-bar refresh with a snapshot. Pass `isNeutralBorder` only in tests.
 * Expected outcome: Production sums `urbanHexCount` (truncated, at least zero) over hexes the human controls,
 *   skipping neutral-border hexes, as the per-turn credit does. Forces counts human units against the size caps.
 *   Each home readout counts the region's hexes the human controls.
 * Exceptions: None; missing lists count as empty.
 */
export function computeTopBarStats(
  input: TopBarStatsInput,
  isNeutralBorder: (h3Index: string) => boolean = isNeutralBorderHex
): TopBarStats {
  const control = input.strategicControl ?? [];
  const humanHexes = new Set(control.filter((row) => row.controllerPlayerId === 'human').map((row) => row.h3Index));
  const productionPerTurn = (input.strategicInfrastructure ?? [])
    .filter((row) => humanHexes.has(row.h3Index) && !isNeutralBorder(row.h3Index))
    .reduce((sum, row) => sum + Math.max(0, Math.trunc(row.urbanHexCount)), 0);
  const fieldedByType = getPlayerUnitCountsByType(Array.from(input.units), 'human');
  const capByType = getMaxUnitsPerType(parseGameSize(input.gameSize));
  const unitsFielded = ALL_BUILD_UNIT_TYPES.reduce((sum, unitType) => sum + fieldedByType[unitType], 0);
  const unitCap = ALL_BUILD_UNIT_TYPES.reduce((sum, unitType) => sum + capByType[unitType], 0);
  const controlRows = Array.from(control);
  const humanHome = countControlledHexesInRegion(controlRows, input.humanHomeRegionHexes, 'human');
  const opponentHome = countControlledHexesInRegion(controlRows, input.aiHomeRegionHexes, 'human');
  return {
    productionPerTurn,
    fieldedByType,
    capByType,
    unitsFielded,
    unitCap,
    humanHome: { held: humanHome.controlled, total: humanHome.total },
    opponentHome: { held: opponentHome.controlled, total: opponentHome.total },
  };
}

/**
 * Display text for each readout: a main value and a muted suffix.
 *
 * Purpose: The renderer writes these strings into fixed elements.
 * When to use: Returned by `formatTopBarStatParts`.
 * Expected outcome: Plain text only.
 * Exceptions: None.
 */
export interface TopBarStatParts {
  /**
   * Production value, such as "+530".
   *
   * Contract: Always starts with "+".
   * When to use: `#topbar-stat-production`.
   * Expected outcome: Grouped with commas past 999.
   * Exceptions: None.
   */
  readonly production: string;
  /**
   * Units fielded, such as "10".
   *
   * Contract: Digits only, with commas past 999.
   * When to use: `#topbar-stat-forces`.
   * Expected outcome: Never negative.
   * Exceptions: None.
   */
  readonly forces: string;
  /**
   * The cap suffix, such as "/34".
   *
   * Contract: Starts with "/".
   * When to use: `#topbar-stat-forces-cap`.
   * Expected outcome: The game size's total cap.
   * Exceptions: None.
   */
  readonly forcesCap: string;
  /**
   * Your home held, such as "12".
   *
   * Contract: Digits only.
   * When to use: `#topbar-stat-human-home`.
   * Expected outcome: Never negative.
   * Exceptions: None.
   */
  readonly humanHome: string;
  /**
   * Your home total suffix, such as "/15".
   *
   * Contract: Starts with "/".
   * When to use: `#topbar-stat-human-home-total`.
   * Expected outcome: The region's hex count.
   * Exceptions: None.
   */
  readonly humanHomeTotal: string;
  /**
   * Enemy home held, such as "3".
   *
   * Contract: Digits only.
   * When to use: `#topbar-stat-opponent-home`.
   * Expected outcome: Never negative.
   * Exceptions: None.
   */
  readonly opponentHome: string;
  /**
   * Enemy home total suffix, such as "/24".
   *
   * Contract: Starts with "/".
   * When to use: `#topbar-stat-opponent-home-total`.
   * Expected outcome: The region's hex count.
   * Exceptions: None.
   */
  readonly opponentHomeTotal: string;
}

/**
 * Formats one whole number for a readout.
 *
 * Purpose: All readouts group thousands the same way, independent of the computer's locale.
 * When to use: Inside `formatTopBarStatParts` and `formatForcesBreakdown`.
 * Expected outcome: For example 1530 becomes "1,530".
 * Exceptions: None.
 */
function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * Formats the top-bar totals for display.
 *
 * Purpose: Keeps the number format in one place.
 * When to use: After `computeTopBarStats`.
 * Expected outcome: For example production "+530", forces "10" and "/34", homes "12" and "/15".
 * Exceptions: None.
 */
export function formatTopBarStatParts(stats: TopBarStats): TopBarStatParts {
  return {
    production: `+${formatCount(stats.productionPerTurn)}`,
    forces: formatCount(stats.unitsFielded),
    forcesCap: `/${formatCount(stats.unitCap)}`,
    humanHome: formatCount(stats.humanHome.held),
    humanHomeTotal: `/${formatCount(stats.humanHome.total)}`,
    opponentHome: formatCount(stats.opponentHome.held),
    opponentHomeTotal: `/${formatCount(stats.opponentHome.total)}`,
  };
}

/**
 * Lists fielded units against the cap for each type.
 *
 * Purpose: The Forces tip spells out the total.
 * When to use: Building the Forces tip.
 * Expected outcome: For example "infantry 3 of 12, armor 3 of 8, naval 2 of 8, air 2 of 6".
 * Exceptions: None.
 */
export function formatForcesBreakdown(stats: TopBarStats): string {
  return ALL_BUILD_UNIT_TYPES.map(
    (unitType) => `${unitType} ${formatCount(stats.fieldedByType[unitType])} of ${formatCount(stats.capByType[unitType])}`
  ).join(', ');
}
