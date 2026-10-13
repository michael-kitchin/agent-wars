/**
 * The top bar's match status: the two sides, the four readouts, and the date block.
 */
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { formatTopBarDateBlock } from '../../shared/topBarDateBlock';
import { computeTopBarStats, formatForcesBreakdown, formatTopBarStatParts } from '../../shared/topBarStats';
import { formatWeatherIconHtml } from '../../shared/weatherIcons';
import { rendererSharedState as S } from '../core/state';
import { forcesStatTooltipText } from './frameTooltipText';

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
 * Writes the two side names.
 *
 * Purpose: The player always sees who is fighting whom.
 * When to use: From `renderTopBarStatus`.
 * Expected outcome: The human and opponent home names, or em dashes when missing.
 * Exceptions: None.
 */
function renderTopBarSides(state: GameStateSnapshot | null): void {
  setText('topbar-human-side', state?.humanHomeRegion || '—');
  setText('topbar-opponent-side', state?.aiHomeRegion || '—');
}

/**
 * Writes the date block, adding the battle's weather to the date line during a battle.
 *
 * Purpose: The player reads the date, and the turn or the beat, at a glance.
 * When to use: From `renderTopBarStatus`.
 * Expected outcome: See `formatTopBarDateBlock`. During a battle with weather, the date line ends with the weather icon and word.
 * Exceptions: None.
 */
function renderTopBarDateBlock(state: GameStateSnapshot | null): void {
  const battle = S.tacticalBattleSnapshot;
  const text = formatTopBarDateBlock({
    hasGameState: state != null,
    dateLabel: state?.currentDateLabel ?? '',
    turnNumber: state?.turnNumber ?? 0,
    strategicPhaseLabel: state ? formatStrategicPhaseLabel(state.phase) : '',
    battleBeat: battle ? battle.tacticalTurnNumber : null,
    beatPlaybackActive: S.resolutionMoveAnimation != null,
  });
  const dateEl = document.getElementById('topbar-date');
  if (dateEl) {
    dateEl.textContent = text.date;
    if (state && battle?.weather) dateEl.insertAdjacentHTML('beforeend', ` · ${formatWeatherIconHtml(battle.weather)}`);
  }
  setText('topbar-turn-phase', text.turnPhase);
}

/**
 * Writes the Production, Forces, Your home, and Enemy home readouts.
 *
 * Purpose: Shows the match's standing at a glance without opening a panel.
 * When to use: From `renderTopBarStatus`.
 * Expected outcome: Values and suffixes from `computeTopBarStats`. With no snapshot, em dashes and empty suffixes.
 *   The Forces tip lists each unit type against its cap.
 * Exceptions: None.
 */
function renderTopBarStats(state: GameStateSnapshot | null): void {
  if (!state) {
    for (const id of ['topbar-stat-production', 'topbar-stat-forces', 'topbar-stat-human-home', 'topbar-stat-opponent-home']) {
      setText(id, '—');
    }
    for (const id of ['topbar-stat-production-suffix', 'topbar-stat-forces-cap', 'topbar-stat-human-home-total', 'topbar-stat-opponent-home-total']) {
      setText(id, '');
    }
    return;
  }
  const stats = computeTopBarStats(state);
  const parts = formatTopBarStatParts(stats);
  setText('topbar-stat-production', parts.production);
  setText('topbar-stat-production-suffix', '/turn');
  setText('topbar-stat-forces', parts.forces);
  setText('topbar-stat-forces-cap', parts.forcesCap);
  setText('topbar-stat-human-home', parts.humanHome);
  setText('topbar-stat-human-home-total', parts.humanHomeTotal);
  setText('topbar-stat-opponent-home', parts.opponentHome);
  setText('topbar-stat-opponent-home-total', parts.opponentHomeTotal);
  document.getElementById('topbar-stat-forces-host')?.setAttribute('data-control-tooltip', forcesStatTooltipText(formatForcesBreakdown(stats)));
}

/**
 * Refreshes everything the top bar shows about the match.
 *
 * Purpose: One entry point, called wherever the old game-state lines were refreshed.
 * When to use: From `updateGameStateSidebar`, after snapshots, tactical entry and exit, Ready commits, and the end of beat playback.
 * Expected outcome: Sides, readouts, and the date block match `state` and the current battle. Null shows em dashes.
 * Exceptions: None.
 */
export function renderTopBarStatus(state: GameStateSnapshot | null): void {
  renderTopBarSides(state);
  renderTopBarStats(state);
  renderTopBarDateBlock(state);
}
