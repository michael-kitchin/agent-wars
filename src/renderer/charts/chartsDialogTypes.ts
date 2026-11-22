/**
 * The shapes the charts dialog keeps while it is open.
 *
 * Purpose: The dialog and its refresh loop share the chart entries and the view without one file holding everything.
 * When to use: `chartsDialog.ts`.
 * Expected outcome: Types only. This module has no runtime code.
 * Exceptions: None.
 */

import type { LineChartDefinition } from '../../shared/chartsDialogState';
import type { AgreementStripBlockHandle } from './agreementStripBlock';
import type { LineChartHandle } from './lineChart';
import type { PostureStripBlockHandle } from './postureStripBlock';
import type { RelationshipTimelineHandle } from './relationshipTimeline';

/**
 * One line chart block the dialog keeps so it can resize, refresh, and destroy it.
 *
 * Contract: Created when the body is built and dropped when the dialog closes.
 * When to use: The refresh and resize loops.
 * Expected outcome: The chart's definition, its handle, its selector, and its title row.
 * Exceptions: None.
 */
export interface LineChartEntry {
  /**
   * The chart's definition.
   *
   * Contract: From `LINE_CHART_DEFINITIONS`.
   * When to use: Reading the id and decimals.
   * Expected outcome: A definition.
   * Exceptions: None.
   */
  readonly definition: LineChartDefinition;
  /**
   * The chart.
   *
   * Contract: Alive until the dialog closes.
   * When to use: Update, resize, and destroy.
   * Expected outcome: A handle.
   * Exceptions: None.
   */
  readonly handle: LineChartHandle;
  /**
   * The unit-type selector, or null for a chart without one.
   *
   * Contract: Its value is an index into `definition.options`.
   * When to use: Reading the player's choice on refresh.
   * Expected outcome: A `select` or null.
   * Exceptions: None.
   */
  readonly select: HTMLSelectElement | null;
  /**
   * The block's title row.
   *
   * Contract: In the document while the dialog is open.
   * When to use: Measuring its height for the plot's height.
   * Expected outcome: An element.
   * Exceptions: None.
   */
  readonly titleRow: HTMLElement;
}

/**
 * Everything built for the open dialog.
 *
 * Contract: Null while closed or while the snapshot has no turns.
 * When to use: Refreshing and resizing.
 * Expected outcome: The stack host, the stance strip, its selector, the agreements block, and the line chart entries.
 * Exceptions: None.
 */
export interface ChartsView {
  /**
   * The grid that holds the relationship stacks.
   *
   * Contract: Replaced child by child on refresh.
   * When to use: Rebuilding the stacks.
   * Expected outcome: An element.
   * Exceptions: None.
   */
  readonly stackHost: HTMLElement;
  /**
   * The stance strip.
   *
   * Contract: Alive until the dialog closes.
   * When to use: Update, resize, and destroy.
   * Expected outcome: A handle.
   * Exceptions: None.
   */
  readonly strip: RelationshipTimelineHandle;
  /**
   * The strip's subject selector.
   *
   * Contract: Its value is a seat id.
   * When to use: Reading the subject on refresh.
   * Expected outcome: A `select`.
   * Exceptions: None.
   */
  readonly subjectSelect: HTMLSelectElement;
  /**
   * The strip's title row.
   *
   * Contract: In the document while the dialog is open.
   * When to use: Measuring its height.
   * Expected outcome: An element.
   * Exceptions: None.
   */
  readonly stripTitleRow: HTMLElement;
  /**
   * The agreements block under the stance strip.
   *
   * Contract: Alive until the dialog closes.
   * When to use: Update, resize, and destroy.
   * Expected outcome: A handle that also exposes its title row.
   * Exceptions: None.
   */
  readonly agreements: AgreementStripBlockHandle;
  /**
   * The posture block under the agreements block.
   *
   * Contract: Alive until the dialog closes.
   * When to use: Update, resize, and destroy.
   * Expected outcome: A handle that also exposes its title row.
   * Exceptions: None.
   */
  readonly postures: PostureStripBlockHandle;
  /**
   * The line charts.
   *
   * Contract: One per definition.
   * When to use: Update, resize, and destroy.
   * Expected outcome: The entries in order.
   * Exceptions: None.
   */
  readonly lines: readonly LineChartEntry[];
}
