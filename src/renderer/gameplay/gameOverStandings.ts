/**
 * Paints the standings at the top of the game-over panel.
 *
 * Purpose: The header sentence and the Result section come from `buildStandings`.
 * When to use: `updateGameOverUI` when the match is over, and when it is not.
 * Expected outcome: The section shows for a finished match and hides otherwise.
 * Exceptions: None. A missing section is ignored.
 */

import { countCityHexesBySeat } from '../../shared/victoryRules';
import { findHumanSeat } from '../../shared/seatRoster';
import { buildStandings, type Standings, type StandingsRow } from '../../shared/standings';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import type { SeatSnapshot } from '../../shared/seatRoster';

/**
 * Hides the standings section.
 *
 * Purpose: A new-game screen does not keep the previous match's result.
 * When to use: `updateGameOverUI` when the overlay is not showing a finished match, and `openNewGameOverlayFromModelTab`.
 * Expected outcome: `#game-over-standings` is hidden and empty.
 * Exceptions: None.
 */
export function hideGameOverStandings(): void {
  const section = document.getElementById('game-over-standings');
  if (!section) return;
  section.hidden = true;
  section.replaceChildren();
}

/**
 * Paints standings and returns the header sentence.
 *
 * Purpose: The header and the Result section stay in step.
 * When to use: `updateGameOverUI` when `gameOver` is set.
 * Expected outcome: The section lists every seat. The return value is the heading, or "The match is over." when the roster is missing.
 * Exceptions: None.
 */
export function renderGameOverStandings(state: GameStateSnapshot): string {
  const section = document.getElementById('game-over-standings');
  const seats = state.seats;
  if (!section || !seats || seats.length === 0 || !state.gameEndReason) {
    hideGameOverStandings();
    return 'The match is over.';
  }
  const standings = buildStandings({
    seats: seats.map((seat) => seatInput(seat, cityHexes(state))),
    viewerSeatId: findHumanSeat(seats)?.seatId ?? null,
    gameEndReason: state.gameEndReason,
    turnNumber: state.turnNumber,
    dateLabel: state.currentDateLabel ?? '',
    modelLabels: modelLabels(seats),
  });
  paint(section, standings);
  section.hidden = false;
  return standings.heading;
}

/**
 * City hexes held by each seat on the snapshot.
 *
 * Purpose: Active rows and a shared first place need the count the match ranked.
 * When to use: `renderGameOverStandings`.
 * Expected outcome: A count per seat id. A seat that holds none is absent.
 * Exceptions: None.
 */
function cityHexes(state: GameStateSnapshot): ReadonlyMap<string, number> {
  return countCityHexesBySeat(state.strategicControl ?? [], state.strategicInfrastructure ?? []);
}

/**
 * One roster row as standings reads it.
 *
 * Purpose: The snapshot's commander becomes the summary input.
 * When to use: `renderGameOverStandings`.
 * Expected outcome: A human seat has a null commander.
 * Exceptions: None.
 */
function seatInput(seat: SeatSnapshot, counts: ReadonlyMap<string, number>) {
  const commander = seat.commander;
  return {
    seatId: seat.seatId,
    seatOrder: seat.seatOrder,
    kind: seat.kind,
    homeRegion: seat.homeRegion,
    outTurn: seat.outTurn,
    outBy: seat.outBy,
    place: seat.place,
    consultationCount: seat.consultationCount,
    costUsd: seat.costUsd,
    cityHexes: counts.get(seat.seatId) ?? 0,
    commander: commander
      ? {
          modelId: commander.modelId,
          reasoningEffort: commander.reasoningEffort,
          doctrineChoice: commander.doctrineChoice,
          revealedDoctrine: commander.doctrine,
        }
      : null,
  };
}

/**
 * Model option text keyed by model id.
 *
 * Purpose: The summary uses the name on the model list, not the stored id, when the list has it.
 * When to use: `renderGameOverStandings`.
 * Expected outcome: Each AI model id maps to its option text, or to the id when the list is missing.
 * Exceptions: None.
 */
function modelLabels(seats: readonly SeatSnapshot[]): Record<string, string> {
  const select = document.getElementById('openrouter-model');
  const labels: Record<string, string> = {};
  for (const seat of seats) {
    const modelId = seat.commander?.modelId;
    if (!modelId || labels[modelId]) continue;
    labels[modelId] = optionLabel(select, modelId);
  }
  return labels;
}

/**
 * The model list's text for an id.
 *
 * Purpose: A missing list still leaves a name the summary can shorten.
 * When to use: `modelLabels`.
 * Expected outcome: The option text, or the id.
 * Exceptions: None.
 */
function optionLabel(select: HTMLElement | null, modelId: string): string {
  if (!(select instanceof HTMLSelectElement)) return modelId;
  const option = [...select.options].find((row) => row.value === modelId);
  return option?.textContent?.trim() || modelId;
}

/**
 * Fills the Result section.
 *
 * Purpose: Each refresh replaces the previous rows.
 * When to use: `renderGameOverStandings`.
 * Expected outcome: A label, the date, the result sentence, the rows, and the total.
 * Exceptions: None.
 */
function paint(section: HTMLElement, standings: Standings): void {
  section.replaceChildren();
  const head = document.createElement('div');
  head.className = 'game-over-standings-head';
  const kicker = document.createElement('p');
  kicker.className = 'game-over-standings-kicker';
  kicker.textContent = 'Result';
  const date = document.createElement('p');
  date.className = 'game-over-standings-date';
  date.textContent = standings.dateLine;
  head.append(kicker, date);
  const result = document.createElement('p');
  result.className = 'game-over-standings-result';
  result.textContent = standings.resultLine;
  const list = document.createElement('ol');
  list.className = 'game-over-standings-rows';
  for (const row of standings.rows) list.append(rowElement(row));
  const total = document.createElement('p');
  total.className = 'game-over-standings-total';
  const totalName = document.createElement('span');
  totalName.textContent = standings.totalLabel;
  const totalCost = document.createElement('span');
  totalCost.textContent = standings.totalCost;
  total.append(totalName, totalCost);
  section.append(head, result, list, total);
}

/**
 * One seat's row.
 *
 * Purpose: The place, the dot, the name, and the status stay on one line.
 * When to use: `paint`.
 * Expected outcome: A human row omits the commander line. A knockout line appears only when someone is credited.
 * Exceptions: None.
 */
function rowElement(row: StandingsRow): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'game-over-standings-row';
  const place = document.createElement('span');
  place.className = 'game-over-standings-place';
  place.textContent = row.place === null ? '–' : String(row.place);
  const dot = document.createElement('span');
  dot.className = 'game-over-standings-dot';
  dot.style.backgroundColor = row.dotColor;
  const body = document.createElement('div');
  body.className = 'game-over-standings-body';
  const title = document.createElement('div');
  title.className = 'game-over-standings-title';
  const name = document.createElement('span');
  name.className = 'game-over-standings-name';
  name.textContent = row.name;
  const status = document.createElement('span');
  status.className = 'game-over-standings-status';
  status.textContent = row.status;
  title.append(name, status);
  body.append(title);
  const meta = metaLine(row);
  if (meta) body.append(meta);
  if (row.knockedOutBy) {
    const knocked = document.createElement('p');
    knocked.className = 'game-over-standings-knockout';
    knocked.textContent = row.knockedOutBy;
    body.append(knocked);
  }
  item.append(place, dot, body);
  return item;
}

/**
 * The commander, consultation, and cost line.
 *
 * Purpose: A human row has none of those.
 * When to use: `rowElement`.
 * Expected outcome: Null when every part is null. Otherwise one line.
 * Exceptions: None.
 */
function metaLine(row: StandingsRow): HTMLParagraphElement | null {
  const parts = [row.commanderSummary, row.consultationsLabel, row.costLabel].filter((part): part is string => part !== null);
  if (parts.length === 0) return null;
  const meta = document.createElement('p');
  meta.className = 'game-over-standings-meta';
  meta.textContent = parts.join(' ');
  return meta;
}
