/**
 * The charts dialog: opens on the charts key, shows the relationship stacks, the stance strip, and nine line charts.
 *
 * Purpose: Shows how the match has gone for every side, whatever fog of war is set to.
 * When to use: `wireChartsDialog` once at start-up. The key handler calls `toggleChartsDialog`. The turn handler refreshes or closes it.
 * Expected outcome: A modal dialog over the whole window. Text reaches the page through `textContent` only.
 * Exceptions: A failed read shows `The charts could not be loaded.` in the body.
 */

import {
  lineChartData,
  relationshipRows,
  relationshipStrip,
  relationshipSubjectSeatIds,
} from '../../shared/matchChartSeries';
import {
  LINE_CHART_DEFINITIONS,
  chartPlotHeight,
  chartsDialogMayOpen,
  type LineChartDefinition,
} from '../../shared/chartsDialogState';
import type { MatchChartsSnapshot } from '../../shared/matchStatistics';
import { isHumanSeatId } from '../../shared/seatIds';
import { currentRendererMatchEpoch, rendererMatchEpochCurrent } from '../core/matchEpoch';
import { rendererSharedState as S } from '../core/state';
import { blockingDialogIsOpen } from '../chrome/blockingDialogGuards';
import { buildLegend, seatLookups, type SeatLookups } from './chartSeatLookups';
import type { ChartsView, LineChartEntry } from './chartsDialogTypes';
import { createLineChart } from './lineChart';
import { buildRelationshipStack } from './relationshipStack';
import { createRelationshipTimeline } from './relationshipTimeline';

/**
 * The view built for the open dialog, or null.
 *
 * Purpose: Refresh and resize reach the charts through it.
 * When to use: Every function that touches a chart.
 * Expected outcome: Null while closed or empty.
 * Exceptions: None.
 */
let view: ChartsView | null = null;

/**
 * The snapshot the chart controls last drew.
 *
 * Purpose: A selector change redraws from the snapshot most recently applied.
 * When to use: The selector handlers, and every apply.
 * Expected outcome: Null while there is no view.
 * Exceptions: None.
 */
let latestSnapshot: MatchChartsSnapshot | null = null;

/**
 * Whether the dialog is open.
 *
 * Purpose: The key handler and the turn handler ask.
 * When to use: `chartsDialogIsOpen` and every function that acts only while open.
 * Expected outcome: True between open and close.
 * Exceptions: None.
 */
let open = false;

/**
 * Counts openings, so a late reply cannot fill a closed or reopened dialog.
 *
 * Purpose: `renderCharts` compares it before and after its await.
 * When to use: Open and close.
 * Expected outcome: Moves on every open and every close.
 * Exceptions: None.
 */
let openCounter = 0;

/**
 * The renderer match epoch captured when the dialog opened.
 *
 * Purpose: A new match or a loaded save closes the dialog.
 * When to use: Before each refresh.
 * Expected outcome: An epoch number.
 * Exceptions: None.
 */
let openEpoch = 0;

/**
 * The element that had focus before the dialog opened.
 *
 * Purpose: Closing returns focus to it.
 * When to use: Open and close.
 * Expected outcome: An element or null.
 * Exceptions: None.
 */
let previousFocus: HTMLElement | null = null;

/**
 * Whether the last press inside the overlay started on the backdrop itself.
 *
 * Purpose: A click closes the dialog only when both the press and the release were on the backdrop, so a text selection dragged out of the dialog does not close it.
 * When to use: Set by the overlay's `pointerdown` listener, read and cleared by its `click` listener.
 * Expected outcome: True between a press on the backdrop and the click that follows it.
 * Exceptions: None.
 */
let pressStartedOnBackdrop = false;

/**
 * Finds the overlay element.
 *
 * Purpose: Every function reaches the dialog through its ids.
 * When to use: Opening, closing, and sizing.
 * Expected outcome: The overlay, or null when the markup is missing.
 * Exceptions: None.
 */
function overlayElement(): HTMLElement | null {
  return document.getElementById('charts-overlay');
}

/**
 * Finds the scrolling body.
 *
 * Purpose: The charts are built inside it.
 * When to use: Rendering and sizing.
 * Expected outcome: The body, or null when the markup is missing.
 * Exceptions: None.
 */
function bodyElement(): HTMLElement | null {
  return document.getElementById('charts-dialog-body');
}

/**
 * Reports whether the match has seats.
 *
 * Purpose: The dialog opens with a match loaded, and it stays loaded at game over.
 * When to use: `toggleChartsDialog`.
 * Expected outcome: True when the game state lists at least one seat.
 * Exceptions: None.
 */
function matchIsLoaded(): boolean {
  return (S.gameState?.seats?.length ?? 0) > 0;
}

/**
 * The width the charts may use inside the body.
 *
 * Purpose: Every plot is as wide as the pane allows.
 * When to use: Building and resizing charts.
 * Expected outcome: The body's width less its padding, at least 200.
 * Exceptions: None.
 */
function innerBodyWidth(body: HTMLElement): number {
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
function dialogHeight(): number {
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
function appendBlock(parent: HTMLElement, title: string): { readonly titleRow: HTMLElement; readonly plotHost: HTMLElement } {
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
function fillStacks(host: HTMLElement, snapshot: MatchChartsSnapshot, lookups: SeatLookups): void {
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
function buildLineChartBlock(
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
function updateLineChart(entry: LineChartEntry, snapshot: MatchChartsSnapshot): void {
  entry.handle.update(lineChartData(snapshot, entry.definition.id, chosenUnitType(entry)));
}

/**
 * Builds the whole body for a snapshot with turns.
 *
 * Purpose: In order: the relationship stacks, the stance strip, the legend, and the nine line charts.
 * When to use: Opening the dialog and the first refresh after an empty snapshot.
 * Expected outcome: `view` is set and the body is filled.
 * Exceptions: None.
 */
function buildBody(body: HTMLElement, snapshot: MatchChartsSnapshot): void {
  const lookups = seatLookups(snapshot);
  body.replaceChildren();
  const relationships = appendBlock(body, 'Relationships');
  relationships.plotHost.className = 'charts-stack-grid';
  fillStacks(relationships.plotHost, snapshot, lookups);

  const stripBlock = appendBlock(body, 'Stance over time');
  const subjectSelect = document.createElement('select');
  subjectSelect.className = 'charts-select';
  subjectSelect.setAttribute('aria-label', 'How they see');
  subjectSelect.dataset.controlTooltip = 'Choose the side whose standing with each commander the strip shows.';
  for (const seatId of relationshipSubjectSeatIds(snapshot)) {
    const option = document.createElement('option');
    option.value = seatId;
    option.textContent = lookups.nameOf(seatId);
    subjectSelect.appendChild(option);
  }
  const subjectLabel = document.createElement('label');
  subjectLabel.className = 'charts-select-label';
  subjectLabel.append('How they see ', subjectSelect);
  stripBlock.titleRow.appendChild(subjectLabel);
  const strip = createRelationshipTimeline({
    host: stripBlock.plotHost,
    width: innerBodyWidth(body),
    height: chartPlotHeight(dialogHeight(), stripBlock.titleRow.offsetHeight),
    nameOf: lookups.nameOf,
    flagOf: lookups.flagOf,
  });
  strip.update(relationshipStrip(snapshot, subjectSelect.value));

  body.appendChild(buildLegend(snapshot, lookups));
  const lines = LINE_CHART_DEFINITIONS.map((definition) => buildLineChartBlock(body, definition, snapshot, lookups));
  latestSnapshot = snapshot;
  subjectSelect.addEventListener('change', () => {
    if (latestSnapshot !== null) strip.update(relationshipStrip(latestSnapshot, subjectSelect.value));
  });
  for (const entry of lines) {
    entry.select?.addEventListener('change', () => {
      if (latestSnapshot !== null) updateLineChart(entry, latestSnapshot);
    });
  }
  view = { stackHost: relationships.plotHost, strip, subjectSelect, stripTitleRow: stripBlock.titleRow, lines };
}

/**
 * Destroys every chart and forgets the view.
 *
 * Purpose: Closing, and a refresh that finds no turns, release the charts' listeners.
 * When to use: Close and empty refresh.
 * Expected outcome: `view` is null.
 * Exceptions: None.
 */
function destroyView(): void {
  if (view === null) return;
  view.strip.destroy();
  for (const entry of view.lines) entry.handle.destroy();
  view = null;
  latestSnapshot = null;
}

/**
 * Shows one sentence in the body in place of the charts.
 *
 * Purpose: An empty snapshot and a failed read say so.
 * When to use: Rendering and error handling.
 * Expected outcome: The body holds one paragraph.
 * Exceptions: None.
 */
function showBodyMessage(body: HTMLElement, text: string): void {
  destroyView();
  const paragraph = document.createElement('p');
  paragraph.className = 'charts-empty';
  paragraph.textContent = text;
  body.replaceChildren(paragraph);
}

/**
 * Resizes every chart to the body and the dialog.
 *
 * Purpose: Every chart resizes with the window and none exceeds a quarter of the dialog.
 * When to use: The window `resize` listener.
 * Expected outcome: Each handle receives its new size.
 * Exceptions: None.
 */
function resizeCharts(): void {
  const body = bodyElement();
  if (!open || body === null || view === null) return;
  const width = innerBodyWidth(body);
  const height = dialogHeight();
  view.strip.resize(width, chartPlotHeight(height, view.stripTitleRow.offsetHeight));
  for (const entry of view.lines) {
    entry.handle.resize(width, chartPlotHeight(height, entry.titleRow.offsetHeight));
  }
}

/**
 * Applies a fresh snapshot to the open dialog.
 *
 * Purpose: A refresh keeps each chart's zoom, each selector's choice, and the body's scroll position. The first snapshot with turns builds the body.
 * When to use: Opening and refreshing.
 * Expected outcome: The charts show the snapshot, or `No turns have been recorded yet.` when it has none.
 * Exceptions: None.
 */
function applySnapshot(body: HTMLElement, snapshot: MatchChartsSnapshot): void {
  if (snapshot.turns.length === 0) {
    showBodyMessage(body, 'No turns have been recorded yet.');
    return;
  }
  if (view === null) {
    buildBody(body, snapshot);
    return;
  }
  const scrollTop = body.scrollTop;
  const lookups = seatLookups(snapshot);
  latestSnapshot = snapshot;
  fillStacks(view.stackHost, snapshot, lookups);
  view.strip.update(relationshipStrip(snapshot, view.subjectSelect.value));
  for (const entry of view.lines) updateLineChart(entry, snapshot);
  body.scrollTop = scrollTop;
}

/**
 * Reads the charts snapshot from the main process.
 *
 * Purpose: One place guards the missing bridge.
 * When to use: Opening and refreshing.
 * Expected outcome: The snapshot.
 * Exceptions: Throws when the bridge is missing, and rethrows a failed read.
 */
async function readSnapshot(): Promise<MatchChartsSnapshot> {
  if (!window.gameApi) throw new Error('readMatchCharts is unavailable');
  return window.gameApi.readMatchCharts();
}

/**
 * Reads the snapshot and fills the body.
 *
 * Purpose: The body is filled only when the dialog is still open and has not been reopened since the read began.
 * When to use: Opening the dialog.
 * Expected outcome: The charts, the empty message, or `The charts could not be loaded.`.
 * Exceptions: None. A rejected read is logged with `console.error`.
 */
async function renderCharts(): Promise<void> {
  const body = bodyElement();
  if (body === null) return;
  const counter = openCounter;
  try {
    const snapshot = await readSnapshot();
    if (!open || counter !== openCounter) return;
    applySnapshot(body, snapshot);
  } catch (error) {
    console.error('readMatchCharts failed', error);
    if (!open || counter !== openCounter) return;
    showBodyMessage(body, 'The charts could not be loaded.');
  }
}

/**
 * Keeps Tab inside the dialog.
 *
 * Purpose: From the last focusable element Tab returns to the close button, and Shift+Tab from the close button goes to the last.
 * When to use: The overlay's `keydown` listener.
 * Expected outcome: Focus never leaves the dialog while it is open.
 * Exceptions: None.
 */
function trapTabKey(event: KeyboardEvent): void {
  if (event.key !== 'Tab') return;
  const dialog = document.getElementById('charts-dialog');
  const close = document.getElementById('charts-dialog-close');
  if (dialog === null || close === null) return;
  const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button, select, input, [tabindex]')).filter(
    (element) => !(element as HTMLButtonElement).disabled && element.tabIndex >= 0 && element.getClientRects().length > 0
  );
  const last = focusable[focusable.length - 1] ?? close;
  const active = document.activeElement;
  if (event.shiftKey && (active === close || !dialog.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
    event.preventDefault();
    close.focus();
  }
}

/**
 * Opens the dialog and starts reading the charts.
 *
 * Purpose: Shows the overlay, remembers focus, and fills the body.
 * When to use: `toggleChartsDialog` when it may open.
 * Expected outcome: The overlay is visible, focus is on the close button, and the body fills when the read returns.
 * Exceptions: None.
 */
function openDialog(overlay: HTMLElement): void {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  open = true;
  openCounter += 1;
  openEpoch = currentRendererMatchEpoch();
  overlay.hidden = false;
  window.addEventListener('resize', resizeCharts);
  document.getElementById('charts-dialog-close')?.focus();
  void renderCharts();
}

/**
 * Closes the dialog.
 *
 * Purpose: Hides the overlay, empties the body, destroys the charts, and returns focus.
 * When to use: The close button, the backdrop, the key handler, and the turn handler.
 * Expected outcome: The overlay is hidden and the body is empty.
 * Exceptions: None.
 */
function closeDialog(overlay: HTMLElement): void {
  open = false;
  openCounter += 1;
  window.removeEventListener('resize', resizeCharts);
  destroyView();
  bodyElement()?.replaceChildren();
  overlay.hidden = true;
  previousFocus?.focus();
  previousFocus = null;
}

/**
 * Binds the close button, the backdrop, and the Tab trap.
 *
 * Purpose: The dialog closes from its button and from a click outside it that also started outside it, and keeps focus inside. The overlay stops pointer events from reaching the map.
 * When to use: Once at start-up.
 * Expected outcome: The listeners exist.
 * Exceptions: None.
 */
export function wireChartsDialog(): void {
  const overlay = overlayElement();
  if (overlay === null) return;
  document.getElementById('charts-dialog-close')?.addEventListener('click', () => closeDialog(overlay));
  overlay.addEventListener('pointerdown', (event) => {
    pressStartedOnBackdrop = event.target === overlay;
  });
  overlay.addEventListener('click', (event) => {
    event.stopPropagation();
    const fromBackdrop = pressStartedOnBackdrop;
    pressStartedOnBackdrop = false;
    if (event.target === overlay && fromBackdrop) closeDialog(overlay);
  });
  overlay.addEventListener('keydown', trapTabKey);
  for (const type of ['pointerdown', 'mousedown', 'dblclick', 'wheel']) {
    overlay.addEventListener(type, (event) => event.stopPropagation());
  }
}

/**
 * Reports whether the dialog is open.
 *
 * Purpose: The window key handler routes Escape and the charts key through it.
 * When to use: The key handler and the turn handler.
 * Expected outcome: True between open and close.
 * Exceptions: None.
 */
export function chartsDialogIsOpen(): boolean {
  return open;
}

/**
 * Opens the dialog when it is closed and may open, and closes it when it is open.
 *
 * Purpose: The charts key and Escape both toggle.
 * When to use: The window key handler.
 * Expected outcome: The dialog opens only with a match loaded and no other modal open.
 * Exceptions: None.
 */
export function toggleChartsDialog(): void {
  const overlay = overlayElement();
  if (overlay === null) return;
  if (open) {
    closeDialog(overlay);
    return;
  }
  if (chartsDialogMayOpen({ matchLoaded: matchIsLoaded(), otherModalOpen: blockingDialogIsOpen() })) {
    openDialog(overlay);
  }
}

/**
 * Closes the dialog when it is open.
 *
 * Purpose: A dialog that needs the player's choice, such as the melee intercept list or the knockout dialog, must not open under the charts.
 * When to use: Before the turn handler opens one of those dialogs.
 * Expected outcome: The dialog is closed. Nothing happens when it is already closed.
 * Exceptions: None.
 */
export function closeChartsDialogIfOpen(): void {
  const overlay = overlayElement();
  if (open && overlay !== null) closeDialog(overlay);
}

/**
 * Reads the charts again when the dialog is open.
 *
 * Purpose: The charts stay current after each turn resolves, with no timer. A new match or a loaded save closes the dialog instead.
 * When to use: After a resolved turn's state is on screen.
 * Expected outcome: Every chart gains the new turn and keeps its zoom, selector, and scroll position.
 * Exceptions: None. A rejected read is logged and the charts stay as they were.
 */
export async function refreshChartsDialogIfOpen(): Promise<void> {
  const overlay = overlayElement();
  const body = bodyElement();
  if (!open || overlay === null || body === null) return;
  if (!rendererMatchEpochCurrent(openEpoch)) {
    closeDialog(overlay);
    return;
  }
  const counter = openCounter;
  try {
    const snapshot = await readSnapshot();
    if (!open || counter !== openCounter || !rendererMatchEpochCurrent(openEpoch)) return;
    applySnapshot(body, snapshot);
  } catch (error) {
    console.error('readMatchCharts refresh failed', error);
  }
}
