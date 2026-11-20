/**
 * The charts dialog: opens on the charts key, shows the relationship stacks, the stance strip, and nine line charts.
 *
 * Purpose: Shows how the match has gone for every side, whatever fog of war is set to.
 * When to use: `wireChartsDialog` once at start-up. The key handler calls `toggleChartsDialog`. The turn handler refreshes or closes it.
 * Expected outcome: A modal dialog over the whole window. Text reaches the page through `textContent` only.
 * Exceptions: A failed read shows `The charts could not be loaded.` in the body.
 */

import { relationshipStrip, relationshipSubjectSeatIds } from '../../shared/matchChartSeries';
import { LINE_CHART_DEFINITIONS, chartPlotHeight, chartsDialogMayOpen } from '../../shared/chartsDialogState';
import type { MatchChartsSnapshot } from '../../shared/matchStatistics';
import { capChartsSnapshot } from '../../shared/chartsTurnCap';
import { currentRendererMatchEpoch, rendererMatchEpochCurrent } from '../core/matchEpoch';
import { rendererSharedState as S } from '../core/state';
import { blockingDialogIsOpen } from '../chrome/blockingDialogGuards';
import { currentReplay, onReplayChange } from '../replay/replayState';
import { trapTabWithin, wireBackdropDismiss } from '../chrome/modalDialogKit';
import { buildLegend, seatLookups } from './chartSeatLookups';
import { appendBlock, buildLineChartBlock, dialogHeight, fillStacks, innerBodyWidth, updateLineChart } from './chartsDialogBlocks';
import type { ChartsView } from './chartsDialogTypes';
import { createAgreementStripBlock } from './agreementStripBlock';
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
 * The last snapshot read, before any replay cap.
 *
 * Purpose: Moving the replay slider redraws the charts from it with no new read.
 * When to use: Set by `applySnapshot`, cleared on close.
 * Expected outcome: The whole match's snapshot, or null while closed.
 * Exceptions: None.
 */
let rawSnapshot: MatchChartsSnapshot | null = null;

/**
 * The replay turn the charts were last drawn at.
 *
 * Purpose: A replay change that leaves the turn alone redraws nothing.
 * When to use: Set by `applySnapshot`, read by `followReplayTurn`.
 * Expected outcome: A turn number while replay caps the charts, otherwise null.
 * Exceptions: None.
 */
let appliedCap: number | null = null;

/**
 * The turn replay is showing.
 *
 * Purpose: While replay is on, the charts end at that turn.
 * When to use: Each time a snapshot is applied, and on each replay change.
 * Expected outcome: The shown step's strategic turn, or null when replay is off.
 * Exceptions: None.
 */
function replayTurnCap(): number | null {
  const state = currentReplay();
  return state?.timeline.steps[state.index]?.turnNumber ?? null;
}

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
 * Builds the whole body for a snapshot with turns.
 *
 * Purpose: In order: the relationship stacks, the stance strip, the agreements block, the legend, and the nine line charts.
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

  const agreementBlock = appendBlock(body, 'Agreements over time');
  const agreements = createAgreementStripBlock({
    ...agreementBlock,
    width: innerBodyWidth(body),
    plotHeightFor: (titleRowHeight) => chartPlotHeight(dialogHeight(), titleRowHeight),
    nameOf: lookups.nameOf,
    flagOf: lookups.flagOf,
    snapshot,
  });

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
  view = { stackHost: relationships.plotHost, strip, subjectSelect, stripTitleRow: stripBlock.titleRow, agreements, lines };
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
  view.agreements.destroy();
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
  view.agreements.resize(width, chartPlotHeight(height, view.agreements.titleRow.offsetHeight));
  for (const entry of view.lines) {
    entry.handle.resize(width, chartPlotHeight(height, entry.titleRow.offsetHeight));
  }
}

/**
 * Applies a fresh snapshot to the open dialog.
 *
 * Purpose: A refresh keeps each chart's zoom, each selector's choice, and the body's scroll position. The first snapshot with turns builds the body. While replay is on, the snapshot is cut off at the turn replay shows.
 * When to use: Opening, refreshing, and a replay turn change.
 * Expected outcome: The charts show the snapshot, or `No turns have been recorded yet.` when it has none.
 * Exceptions: None.
 */
function applySnapshot(body: HTMLElement, raw: MatchChartsSnapshot): void {
  rawSnapshot = raw;
  appliedCap = replayTurnCap();
  const snapshot = appliedCap === null ? raw : capChartsSnapshot(raw, appliedCap);
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
  view.agreements.update(snapshot);
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
  trapTabWithin(event, dialog, { firstStop: close });
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
  rawSnapshot = null;
  appliedCap = null;
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
  wireBackdropDismiss(overlay, () => closeDialog(overlay));
  overlay.addEventListener('keydown', trapTabKey);
  onReplayChange(followReplayTurn);
}

/**
 * Redraws the open charts when replay moves to another turn.
 *
 * Purpose: The charts show the match as it stood on the turn replay shows, following the slider as the map does, and return to the whole match when replay ends.
 * When to use: Subscribed with `onReplayChange` by `wireChartsDialog`.
 * Expected outcome: Nothing happens while the dialog is closed, before its first read, or when the turn is unchanged.
 * Exceptions: None.
 */
function followReplayTurn(): void {
  const body = bodyElement();
  if (!open || body === null || rawSnapshot === null || replayTurnCap() === appliedCap) return;
  applySnapshot(body, rawSnapshot);
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
