/**
 * The building blocks of the charts dialog's body.
 *
 * Purpose: The titled blocks, the relationship stacks, and the line charts with their selectors, built and redrawn the same way at every open and refresh.
 * When to use: From `chartsDialog.ts`, which owns the dialog's state.
 * Expected outcome: Elements appended to the host each function is given. Text reaches the page through `textContent` only.
 * Exceptions: None.
 */

import { lineChartData, relationshipRows, relationshipSubjectSeatIds } from '../../shared/matchChartSeries';
import { chartPlotHeight, type LineChartDefinition } from '../../shared/chartsDialogState';
import type { MatchChartsSnapshot } from '../../shared/matchStatistics';
import { isHumanSeatId } from '../../shared/seatIds';
import type { SeatLookups } from './chartSeatLookups';
import type { LineChartEntry } from './chartsDialogTypes';
import { createLineChart } from './lineChart';
import { buildRelationshipStack } from './relationshipStack';

/**
 * The width the charts may use inside the body.
 *
 * Purpose: Every plot is as wide as the pane allows.
 * When to use: Building and resizing charts.
 * Expected outcome: The body's width less its padding, at least 200.
 * Exceptions: None.
 */
export function innerBodyWidth(body: HTMLElement): number {
  const style = getComputedStyle(body);
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  return Math.max(200, Math.floor(body.clientWidth - padding));
}

/**
 * The dialog's height.
 *
 * Purpose: A chart block is at most a quarter of it.
 * When to use: Building and resizing charts.
 * Expected outcome: The dialog's height in pixels, 0 when it is missing.
 * Exceptions: None.
 */
export function dialogHeight(): number {
  return document.getElementById('charts-dialog')?.clientHeight ?? 0;
}

/**
 * Builds a block with a title row and an empty plot host.
 *
 * Purpose: Every chart has a title row, then the plot.
 * When to use: The line charts and the stance strip.
 * Expected outcome: The block, its title row, and its plot host, appended to `parent`.
 * Exceptions: None.
 */
export function appendBlock(parent: HTMLElement, title: string): { readonly titleRow: HTMLElement; readonly plotHost: HTMLElement } {
  const block = document.createElement('section');
  block.className = 'charts-block';
  const titleRow = document.createElement('div');
  titleRow.className = 'charts-block-title';
  const heading = document.createElement('h3');
  heading.textContent = title;
  titleRow.appendChild(heading);
  const plotHost = document.createElement('div');
  plotHost.className = 'charts-plot-host';
  block.append(titleRow, plotHost);
  parent.appendChild(block);
  return { titleRow, plotHost };
}

/**
 * Fills the stack grid with one stack per side that at least one commander reports on.
 *
 * Purpose: The stacks sit in content-width columns, in side order. A side no commander reports on, such as the only AI seat, gets no stack.
 * When to use: Building the body and refreshing it.
 * Expected outcome: The host's children are replaced. With no reported side it holds `No AI commander reports on any side.`, which only a malformed snapshot reaches, because a real match always has an AI seat.
 * Exceptions: None.
 */
export function fillStacks(host: HTMLElement, snapshot: MatchChartsSnapshot, lookups: SeatLookups): void {
  const stacks = relationshipSubjectSeatIds(snapshot).map((seatId) =>
    buildRelationshipStack({
      subjectSeatId: seatId,
      rows: relationshipRows(snapshot, seatId),
      nameOf: lookups.nameOf,
      flagOf: lookups.flagOf,
      seatNumberOf: lookups.seatNumberOf,
      subjectIsViewer: isHumanSeatId(seatId),
    })
  );
  const empty = Object.assign(document.createElement('p'), { className: 'charts-empty', textContent: 'No AI commander reports on any side.' });
  host.replaceChildren(...(stacks.length > 0 ? stacks : [empty]));
}

/**
 * Builds one line chart block with its selector.
 *
 * Purpose: A title row with an optional unit-type selector, then the plot, at most a quarter of the dialog tall.
 * When to use: Building the body, once per definition.
 * Expected outcome: The chart's entry.
 * Exceptions: None.
 */
export function buildLineChartBlock(
  body: HTMLElement,
  definition: LineChartDefinition,
  snapshot: MatchChartsSnapshot,
  lookups: SeatLookups
): LineChartEntry {
  const { titleRow, plotHost } = appendBlock(body, definition.title);
  let select: HTMLSelectElement | null = null;
  if (definition.options.length > 0) {
    select = document.createElement('select');
    select.className = 'charts-select';
    select.setAttribute('aria-label', `${definition.title} unit type`);
    select.dataset.controlTooltip = `Show the total or one unit type for ${definition.title.toLowerCase()}.`;
    definition.options.forEach((option, index) => {
      const element = document.createElement('option');
      element.value = String(index);
      element.textContent = option.label;
      select?.appendChild(element);
    });
    titleRow.appendChild(select);
  }
  const handle = createLineChart({
    host: plotHost,
    data: lineChartData(snapshot, definition.id, null),
    width: innerBodyWidth(body),
    height: chartPlotHeight(dialogHeight(), titleRow.offsetHeight),
    colorOf: lookups.colorOf,
    nameOf: lookups.nameOf,
    decimals: definition.decimals,
  });
  return { definition, handle, select, titleRow };
}

/**
 * Reads a chart's chosen unit type.
 *
 * Purpose: A refresh keeps the player's selector choice.
 * When to use: Redrawing a chart with a selector.
 * Expected outcome: The unit type, or null for the total or a chart with no selector.
 * Exceptions: None.
 */
function chosenUnitType(entry: LineChartEntry): string | null {
  if (entry.select === null) return null;
  return entry.definition.options[Number(entry.select.value)]?.unitType ?? null;
}

/**
 * Redraws one line chart from a snapshot using its selector.
 *
 * Purpose: A selector change and a refresh share one path.
 * When to use: After the selector changes and after a refresh.
 * Expected outcome: The chart shows the snapshot.
 * Exceptions: None.
 */
export function updateLineChart(entry: LineChartEntry, snapshot: MatchChartsSnapshot): void {
  entry.handle.update(lineChartData(snapshot, entry.definition.id, chosenUnitType(entry)));
}
