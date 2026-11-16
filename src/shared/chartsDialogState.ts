/**
 * The charts dialog's pure choices.
 *
 * Purpose: When the dialog may open and how tall one chart block may be are decided here, with no DOM, so tests can check them.
 * When to use: The charts dialog and its chart modules.
 * Expected outcome: Pure functions over numbers and flags.
 * Exceptions: None.
 */

import type { LineChartId } from './matchChartSeries';
import { STATISTIC_MERCENARY_TYPES, STATISTIC_UNIT_TYPES } from './matchStatistics';

/**
 * What the open check needs to know.
 *
 * Contract: Two flags read from the page.
 * When to use: `chartsDialogMayOpen`.
 * Expected outcome: Enough to decide.
 * Exceptions: None.
 */
export interface ChartsDialogOpenInput {
  /**
   * Whether a match is loaded.
   *
   * Contract: True when the game state has seats. It stays true at game over.
   * When to use: Refusing to open with nothing to chart.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  readonly matchLoaded: boolean;
  /**
   * Whether another modal is showing.
   *
   * Contract: True when a dialog the charts must not open over is showing.
   * When to use: Refusing to stack on another dialog.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  readonly otherModalOpen: boolean;
}

/**
 * Decides whether the charts dialog may open.
 *
 * Purpose: The charts need a match, and they do not open over another dialog.
 * When to use: When the player presses the charts key.
 * Expected outcome: True only with a match loaded and no other modal open.
 * Exceptions: None.
 */
export function chartsDialogMayOpen(input: ChartsDialogOpenInput): boolean {
  return input.matchLoaded && !input.otherModalOpen;
}

/**
 * The whole height one chart block may take.
 *
 * Purpose: A line chart, its title, ticks, and labels are at most a quarter of the dialog.
 * When to use: Sizing every chart block.
 * Expected outcome: A quarter of `dialogHeight`, rounded down.
 * Exceptions: None.
 */
export function chartBlockHeight(dialogHeight: number): number {
  return Math.floor(dialogHeight / 4);
}

/**
 * The height left for a plot once its title row is placed.
 *
 * Purpose: The title row and the plot together never exceed `chartBlockHeight`.
 * When to use: Sizing a plot or a stance strip.
 * Expected outcome: The block height less the title row, never below 0.
 * Exceptions: None.
 */
export function chartPlotHeight(dialogHeight: number, titleRowHeight: number): number {
  return Math.max(0, chartBlockHeight(dialogHeight) - titleRowHeight);
}

/**
 * One option in a chart's unit-type selector.
 *
 * Contract: A null `unitType` means the total over every type.
 * When to use: Filling the selector and calling `lineChartData`.
 * Expected outcome: The option's label and the unit type it selects.
 * Exceptions: None.
 */
export interface ChartSelectorOption {
  /**
   * The text shown in the selector.
   *
   * Contract: Non-empty.
   * When to use: The option's visible text.
   * Expected outcome: `Total` or a capitalized unit type.
   * Exceptions: None.
   */
  readonly label: string;
  /**
   * The unit type the option selects.
   *
   * Contract: Null for the total.
   * When to use: The second argument of `lineChartData`.
   * Expected outcome: A unit type or null.
   * Exceptions: None.
   */
  readonly unitType: string | null;
}

/**
 * How the dialog presents one line chart.
 *
 * Contract: One entry per line chart, in the order the dialog shows them.
 * When to use: Building a chart block and its tooltip.
 * Expected outcome: The chart id, its title, its selector options, and the decimals its numbers print with.
 * Exceptions: None.
 */
export interface LineChartDefinition {
  /**
   * The chart's id.
   *
   * Contract: A `LineChartId`.
   * When to use: The first argument of `lineChartData`.
   * Expected outcome: One of the nine ids.
   * Exceptions: None.
   */
  readonly id: LineChartId;
  /**
   * The title shown above the chart.
   *
   * Contract: Non-empty.
   * When to use: The block's heading.
   * Expected outcome: Text.
   * Exceptions: None.
   */
  readonly title: string;
  /**
   * The selector options, or an empty list when the chart has no selector.
   *
   * Contract: The first option is the total.
   * When to use: Building the block's `select`.
   * Expected outcome: The options in order.
   * Exceptions: None.
   */
  readonly options: readonly ChartSelectorOption[];
  /**
   * How many decimals the tooltip prints.
   *
   * Contract: 0 for counts, 2 for money.
   * When to use: The fourth argument of `chartTooltip`.
   * Expected outcome: A whole number.
   * Exceptions: None.
   */
  readonly decimals: number;
}

/**
 * Builds a selector's options from a list of unit types.
 *
 * Purpose: The built and mercenary charts offer the total and each type.
 * When to use: Defining the two charts with selectors.
 * Expected outcome: `Total` first, then each type with its first letter in upper case.
 * Exceptions: None.
 */
function unitTypeOptions(types: readonly string[]): ChartSelectorOption[] {
  return [
    { label: 'Total', unitType: null },
    ...types.map((type) => ({ label: type.charAt(0).toUpperCase() + type.slice(1), unitType: type })),
  ];
}

/**
 * The nine line charts in the order the dialog shows them.
 *
 * Purpose: One list holds each chart's title, selector, and number format.
 * When to use: Building the dialog's chart blocks.
 * Expected outcome: Built units, mercenary units, hexes held, production, stored points, credits, upkeep, units lost, and model cost.
 * Exceptions: None.
 */
export const LINE_CHART_DEFINITIONS: readonly LineChartDefinition[] = [
  { id: 'built-units', title: 'Built units', options: unitTypeOptions(STATISTIC_UNIT_TYPES), decimals: 0 },
  { id: 'mercenary-units', title: 'Mercenary units', options: unitTypeOptions(STATISTIC_MERCENARY_TYPES), decimals: 0 },
  { id: 'hexes', title: 'Hexes held', options: [], decimals: 0 },
  { id: 'production', title: 'Production per turn', options: [], decimals: 0 },
  { id: 'stored-points', title: 'Stored production points', options: [], decimals: 0 },
  { id: 'treasury', title: 'Credits', options: [], decimals: 0 },
  { id: 'upkeep', title: 'Upkeep per turn', options: [], decimals: 0 },
  { id: 'units-lost', title: 'Units lost per turn', options: [], decimals: 0 },
  { id: 'model-cost', title: 'Model cost so far (USD)', options: [], decimals: 2 },
];
