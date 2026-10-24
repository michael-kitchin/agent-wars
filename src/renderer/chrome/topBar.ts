/**
 * The top bar's match status: the sides, the readouts, and the date block. In a battle the bar shows the
 * battle header instead; see `battleHeader.ts`.
 */
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { readoutViewerSeatId } from '../../shared/observeModeControls';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { syncObserveChrome } from '../gameplay/observeChrome';
import { formatTopBarDateBlock } from '../../shared/topBarDateBlock';
import { buildTopBarSideChips, type TopBarSideChip, type TopBarSidesBlock } from '../../shared/topBarSides';
import { computeTopBarStats, formatForcesBreakdown, formatTopBarStatParts } from '../../shared/topBarStats';
import { rendererSharedState as S } from '../core/state';
import { commanderPoolStatuses, subscribeCommanderPool } from '../openRouter/commanderPoolClient';
import { renderBattleHeader } from './battleHeader';
import { forcesStatTooltipText } from './frameTooltipText';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Title-cases the strategic phase id from main (`planning`, `resolution`) for the date block.
 *
 * Purpose: Keeps raw enum-style ids out of the player-facing bar while staying stable if new phases are added.
 * When to use: Only from `renderTopBarDateBlock`.
 * Expected outcome: `Planning`, `Resolution`, or a similar single word. An empty string stays empty.
 * Exceptions: None.
 */
function formatStrategicPhaseLabel(phase: string): string {
  if (!phase) return phase;
  return phase.charAt(0).toUpperCase() + phase.slice(1).toLowerCase();
}

/**
 * Writes plain text into an element found by id.
 *
 * Purpose: The bar has many single-text elements; a missing one must not stop the others.
 * When to use: Every text write in this module.
 * Expected outcome: The element's text is replaced. A missing element is skipped.
 * Exceptions: None.
 */
function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/**
 * Shows or hides a readout.
 *
 * Purpose: Your home, Enemy homes, and Cities are not all on screen at once.
 * When to use: After the stats are computed, and when there is no snapshot.
 * Expected outcome: The host's `hidden` flag matches `hidden`.
 * Exceptions: None.
 */
function setHostHidden(id: string, hidden: boolean): void {
  const el = document.getElementById(id);
  if (el) el.hidden = hidden;
}

/**
 * The seat the readouts describe.
 *
 * Purpose: Until the player can choose a side, that seat is the active human, or nobody while observing.
 * When to use: The side chips and the home readouts.
 * Expected outcome: The human seat id, null when the roster has no active human, or omitted when the roster is empty.
 * Exceptions: None.
 */
function viewerSeatId(state: GameStateSnapshot): string | null | undefined {
  const seats = state.seats ?? [];
  if (seats.length === 0) return undefined;
  return seats.find((seat) => seat.kind === HUMAN_SEAT_ID && seat.outTurn == null)?.seatId ?? null;
}

/**
 * Writes the side chips.
 *
 * Purpose: The player sees every side, and whether each commander is planning or ready.
 * When to use: From `renderTopBarStatus`, and again when the commander pool changes.
 * Expected outcome: A human seat, "vs", and one chip per other side. Observing shows an eye and one chip per side.
 *   With no roster, the two name slots are em dashes.
 * Exceptions: None.
 */
function renderTopBarSides(state: GameStateSnapshot | null): void {
  const host = document.getElementById('topbar-sides');
  if (!host) return;
  host.replaceChildren();
  if (!state?.seats?.length) {
    host.append(sideName('topbar-human-side', '—'), vsLabel(), sideName('topbar-second-side', '—'));
    return;
  }
  const resolved = viewerSeatId(state);
  const viewer = resolved === undefined ? HUMAN_SEAT_ID : resolved;
  paintSides(host, buildTopBarSideChips(state.seats, commanderPoolStatuses(), viewer));
}

/**
 * Fills the sides block.
 *
 * Purpose: The layout differs for a human seat and for Observe.
 * When to use: `renderTopBarSides` once a roster exists.
 * Expected outcome: The human name keeps `#topbar-human-side`. The first other chip keeps `#topbar-second-side`.
 * Exceptions: None.
 */
function paintSides(host: HTMLElement, block: TopBarSidesBlock): void {
  if (block.observing) host.append(observingLabel());
  if (block.lead) host.append(chipElement(block.lead, 'topbar-human-side'));
  if (!block.observing) host.append(vsLabel());
  block.chips.forEach((chip, index) => {
    host.append(chipElement(chip, chipNameId(block.observing, index)));
  });
}

/**
 * Keeps the first two name slots findable after the chips are rebuilt.
 *
 * Purpose: Checks that read the human and first opponent names still have those elements.
 * When to use: Each chip after the lead.
 * Expected outcome: The human slot and the first other slot, and no id after that.
 * Exceptions: None.
 */
function chipNameId(observing: boolean, index: number): string | undefined {
  if (observing && index === 0) return 'topbar-human-side';
  if (index === 0 || (observing && index === 1)) return 'topbar-second-side';
  return undefined;
}

/**
 * The "vs" between the human seat and the others.
 *
 * Purpose: The same word the two-side bar used.
 * When to use: A match that has a human viewer.
 * Expected outcome: A muted "vs".
 * Exceptions: None.
 */
function vsLabel(): HTMLElement {
  const vs = document.createElement('span');
  vs.className = 'topbar-vs';
  vs.textContent = 'vs';
  return vs;
}

/**
 * The Observe heading.
 *
 * Purpose: A match with no human seat says so before the chips.
 * When to use: `paintSides` when `observing` is true.
 * Expected outcome: An eye icon and the word "Observing".
 * Exceptions: None.
 */
function observingLabel(): HTMLElement {
  const label = document.createElement('span');
  label.className = 'topbar-observing';
  const eye = document.createElementNS(SVG_NS, 'svg');
  eye.setAttribute('viewBox', '0 0 16 16');
  eye.setAttribute('class', 'topbar-status-icon');
  eye.setAttribute('aria-hidden', 'true');
  const outline = document.createElementNS(SVG_NS, 'path');
  outline.setAttribute('d', 'M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z');
  outline.setAttribute('fill', 'none');
  outline.setAttribute('stroke', 'currentColor');
  outline.setAttribute('stroke-width', '1.4');
  const pupil = document.createElementNS(SVG_NS, 'circle');
  pupil.setAttribute('cx', '8');
  pupil.setAttribute('cy', '8');
  pupil.setAttribute('r', '1.6');
  pupil.setAttribute('fill', 'currentColor');
  eye.append(outline, pupil);
  const text = document.createElement('span');
  text.textContent = 'Observing';
  label.append(eye, text);
  return label;
}

/**
 * One side chip.
 *
 * Purpose: The dot, the name, the knockout mark, and the status icon stay together.
 * When to use: The lead chip and each other chip.
 * Expected outcome: A knocked-out name is struck through and reads "out T{N}". Planning and ready add an icon.
 * Exceptions: None.
 */
function chipElement(chip: TopBarSideChip, nameId: string | undefined): HTMLElement {
  const row = document.createElement('span');
  row.className = chip.outTurn === null ? 'topbar-side-chip' : 'topbar-side-chip is-out';
  const dot = document.createElement('span');
  dot.className = 'topbar-side-mark';
  dot.style.background = chip.dotColor;
  dot.setAttribute('aria-hidden', 'true');
  row.append(dot, sideName(nameId, chip.label));
  if (chip.outTurn !== null) {
    const out = document.createElement('span');
    out.className = 'topbar-side-out';
    out.textContent = `out T${chip.outTurn}`;
    row.append(out);
  }
  const icon = statusIcon(chip);
  if (icon) row.append(icon);
  return row;
}

/**
 * A side name.
 *
 * Purpose: The smoke checks still find the first two names by id.
 * When to use: A chip, and the empty bar.
 * Expected outcome: Text only. The id is set when one was given.
 * Exceptions: None.
 */
function sideName(id: string | undefined, label: string): HTMLElement {
  const name = document.createElement('span');
  name.className = 'topbar-side-name';
  if (id) name.id = id;
  name.textContent = label;
  return name;
}

/**
 * The planning arc or the ready check.
 *
 * Purpose: The icon is the only place a chip says the commander is working or done.
 * When to use: A chip whose status icon is set.
 * Expected outcome: An arc labeled "Planning", or a check labeled "Orders ready". Null when the chip has no icon.
 * Exceptions: None.
 */
function statusIcon(chip: TopBarSideChip): SVGElement | null {
  if (!chip.statusIcon || !chip.statusColor) return null;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'topbar-status-icon');
  svg.setAttribute('aria-label', chip.statusIcon === 'planning' ? 'Planning' : 'Orders ready');
  if (chip.statusIcon === 'planning') {
    const arc = document.createElementNS(SVG_NS, 'circle');
    arc.setAttribute('cx', '8');
    arc.setAttribute('cy', '8');
    arc.setAttribute('r', '5.2');
    arc.setAttribute('fill', 'none');
    arc.setAttribute('stroke', chip.statusColor);
    arc.setAttribute('stroke-width', '2');
    arc.setAttribute('stroke-dasharray', '18 12');
    arc.setAttribute('stroke-linecap', 'round');
    svg.append(arc);
    return svg;
  }
  const check = document.createElementNS(SVG_NS, 'path');
  check.setAttribute('d', 'M3.2 8.4l3 3.1 6.6-7');
  check.setAttribute('fill', 'none');
  check.setAttribute('stroke', chip.statusColor);
  check.setAttribute('stroke-width', '2');
  check.setAttribute('stroke-linecap', 'round');
  check.setAttribute('stroke-linejoin', 'round');
  svg.append(check);
  return svg;
}

/**
 * Writes the date block.
 *
 * Purpose: The player reads the date, and the turn and its phase, at a glance.
 * When to use: From `renderTopBarStatus`.
 * Expected outcome: See `formatTopBarDateBlock`. A turn-limit match names the limit. In a battle the block is hidden.
 * Exceptions: None.
 */
function renderTopBarDateBlock(state: GameStateSnapshot | null): void {
  const text = formatTopBarDateBlock({
    hasGameState: state != null,
    dateLabel: state?.currentDateLabel ?? '',
    turnNumber: state?.turnNumber ?? 0,
    strategicPhaseLabel: state ? formatStrategicPhaseLabel(state.phase) : '',
    turnLimit: state?.victory?.rule === 'most_city_hexes_at_turn_limit' ? state.victory.turnLimit : null,
  });
  setText('topbar-date', text.date);
  setText('topbar-turn-phase', text.turnPhase);
}

/**
 * Writes Production, Forces, Your home, Enemy homes, and Cities.
 *
 * Purpose: Shows the match's standing at a glance without opening a panel.
 * When to use: From `renderTopBarStatus`.
 * Expected outcome: A turn-limit match shows Cities and hides Enemy homes. A null viewer hides both home readouts.
 *   The Forces tip lists each unit type against its cap.
 * Exceptions: None.
 */
function renderTopBarStats(state: GameStateSnapshot | null): void {
  if (!state) {
    for (const id of ['topbar-stat-production', 'topbar-stat-forces', 'topbar-stat-human-home', 'topbar-stat-enemy-home', 'topbar-stat-cities']) {
      setText(id, '—');
    }
    for (const id of ['topbar-stat-production-suffix', 'topbar-stat-forces-cap', 'topbar-stat-human-home-total', 'topbar-stat-enemy-home-total']) {
      setText(id, '');
    }
    setHostHidden('topbar-stat-human-home-host', false);
    setHostHidden('topbar-stat-enemy-home-host', false);
    setHostHidden('topbar-stat-cities-host', true);
    return;
  }
  const viewer = readoutViewerSeatId(state.seats ?? [], S.viewAs);
  const stats = computeTopBarStats(viewer === undefined ? state : { ...state, viewerSeatId: viewer });
  const parts = formatTopBarStatParts(stats);
  setText('topbar-stat-production', parts.production);
  setText('topbar-stat-production-suffix', '/turn');
  setText('topbar-stat-forces', parts.forces);
  setText('topbar-stat-forces-cap', parts.forcesCap);
  setText('topbar-stat-human-home', parts.humanHome);
  setText('topbar-stat-human-home-total', parts.humanHomeTotal);
  setText('topbar-stat-enemy-home', parts.enemyHome);
  setText('topbar-stat-enemy-home-total', parts.enemyHomeTotal);
  setText('topbar-stat-cities', parts.cities || '—');
  setHostHidden('topbar-stat-human-home-host', stats.yourHome === null);
  setHostHidden('topbar-stat-enemy-home-host', stats.enemyHomes === null);
  setHostHidden('topbar-stat-cities-host', stats.cities === null);
  document.getElementById('topbar-stat-cities-host')?.setAttribute('data-control-tooltip', parts.citiesTooltip);
  document.getElementById('topbar-stat-forces-host')?.setAttribute('data-control-tooltip', forcesStatTooltipText(formatForcesBreakdown(stats)));
}

/**
 * Refreshes everything the top bar shows about the match, or about the battle while one is open.
 *
 * Purpose: One entry point, called wherever the old game-state lines were refreshed.
 * When to use: From `updateGameStateSidebar`, after snapshots, tactical entry and exit, Ready commits, and the end of beat playback.
 * Expected outcome: Sides, readouts, and the date block match `state` and the current battle. Null shows em dashes.
 *   While a battle is open the bar shows the battle header instead, from `renderBattleHeader`.
 * Exceptions: None.
 */
export function renderTopBarStatus(state: GameStateSnapshot | null): void {
  syncObserveChrome();
  renderTopBarSides(state);
  renderTopBarStats(state);
  renderTopBarDateBlock(state);
  renderBattleHeader(state, S.tacticalBattleSnapshot);
}

subscribeCommanderPool(() => {
  renderTopBarSides(S.gameState);
});
