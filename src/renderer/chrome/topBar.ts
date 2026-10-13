/**
 * The top bar's match status: the two sides and the date block.
 */
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { formatTopBarDateBlock } from '../../shared/topBarDateBlock';
import { formatWeatherIconHtml } from '../../shared/weatherIcons';
import { rendererSharedState as S } from '../core/state';

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
 * Refreshes everything the top bar shows about the match.
 *
 * Purpose: One entry point, called wherever the old game-state lines were refreshed.
 * When to use: From `updateGameStateSidebar`, after snapshots, tactical entry and exit, Ready commits, and the end of beat playback.
 * Expected outcome: The sides and the date block match `state` and the current battle. Null shows em dashes.
 * Exceptions: None.
 */
export function renderTopBarStatus(state: GameStateSnapshot | null): void {
  renderTopBarSides(state);
  renderTopBarDateBlock(state);
}
