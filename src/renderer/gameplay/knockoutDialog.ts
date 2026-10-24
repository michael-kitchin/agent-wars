/**
 * The dialog shown when the human seat is knocked out and the match goes on.
 *
 * Purpose: The player chooses to watch the rest or to end the match.
 * When to use: After Ready applies a knockout that names the human seat.
 * Expected outcome: Watch the rest records that choice. End game stores the early end and shows standings.
 * Exceptions: A missing dialog resolves as Watch the rest so Ready cannot wait forever.
 */

import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { activeGameMap } from '../../shared/activeGameMap';
import { formatHumanKnockoutDialog } from '../../shared/knockoutDialogCopy';
import { isHumanSeatId } from '../../shared/seatIds';
import { setMainUIControlsEnabled } from '../core/uiState';
import { chooseWatchTheRest } from './observeIntent';

/**
 * How the dialog closed.
 *
 * Purpose: Ready either keeps the match or stops before the next consult.
 * When to use: `offerHumanKnockoutChoice`.
 * Expected outcome: `'ended'` after End game succeeds. `'continue'` otherwise.
 * Exceptions: None.
 */
export type KnockoutDialogChoice = 'ended' | 'continue';

/**
 * A pending button choice.
 *
 * Purpose: One dialog is open at a time.
 * When to use: The button handlers.
 * Expected outcome: Null while the dialog is closed.
 * Exceptions: None.
 */
let pending: ((choice: 'watch' | 'end') => void) | null = null;

/**
 * Shows the dialog when this Ready knocked the human seat out and the match continues.
 *
 * Purpose: Game over already shows standings, so that finish does not open the dialog.
 * When to use: At the end of Ready, after the turn's state is on screen.
 * Expected outcome: `'ended'` after a successful End game. `'continue'` when the player watches, nobody was knocked out, or End game fails.
 * Exceptions: None. A failed End game is reported and the match continues.
 */
export async function offerHumanKnockoutChoice(
  state: GameStateSnapshot,
  knockouts: readonly { readonly seatId: string; readonly outBy: string | null; readonly reasons: readonly string[]; readonly place: number }[] | undefined,
  endMatch: () => Promise<GameStateSnapshot>,
  applyEndedMatch: (next: GameStateSnapshot) => Promise<void>,
  showError: (message: string) => void
): Promise<KnockoutDialogChoice> {
  const row = (knockouts ?? []).find((knockout) => isHumanSeatId(knockout.seatId));
  if (!row || state.gameOver) return 'continue';
  const seats = state.seats ?? [];
  const outBy = row.outBy === null ? null : seats.find((seat) => seat.seatId === row.outBy);
  const share = activeGameMap().controlWinMinUrbanShare;
  const choice = await openHumanKnockoutDialog(formatHumanKnockoutDialog({
    outByName: outBy?.homeRegion ?? (row.outBy ? 'A side' : null),
    turnNumber: state.turnNumber,
    place: row.place,
    seatCount: Math.max(seats.length, 1),
    reasons: row.reasons,
    globalHome: share === null,
    controlShareLabel: share === null ? '' : `${Math.round(share * 100)}%`,
  }));
  if (choice === 'watch') {
    chooseWatchTheRest();
    return 'continue';
  }
  try {
    const ended = await endMatch();
    await applyEndedMatch(ended);
    return 'ended';
  } catch (err) {
    console.error('endMatch failed', err);
    showError('Could not end the match.');
    return 'continue';
  }
}

/**
 * Opens the dialog and waits for a button.
 *
 * Purpose: The two buttons are the only way out.
 * When to use: `offerHumanKnockoutChoice`.
 * Expected outcome: `'watch'` or `'end'`. A missing dialog resolves `'watch'`.
 * Exceptions: None.
 */
function openHumanKnockoutDialog(copy: { title: string; lead: string; placeLine: string }): Promise<'watch' | 'end'> {
  const dialog = document.getElementById('knockout-dialog');
  const title = document.getElementById('knockout-dialog-title');
  const lead = document.getElementById('knockout-dialog-lead');
  const place = document.getElementById('knockout-dialog-place');
  if (!dialog || !title || !lead || !place) return Promise.resolve('watch');
  title.textContent = copy.title;
  lead.textContent = copy.lead;
  place.textContent = copy.placeLine;
  dialog.classList.remove('hidden');
  setMainUIControlsEnabled(false);
  return new Promise((resolve) => {
    pending = resolve;
  });
}

/**
 * Closes the dialog and resolves the pending choice.
 *
 * Purpose: The buttons share one close.
 * When to use: The button listeners, bound once.
 * Expected outcome: The dialog is hidden. Watch the rest enables the match controls. End game leaves them disabled until standings open.
 * Exceptions: None.
 */
function closeHumanKnockoutDialog(choice: 'watch' | 'end'): void {
  document.getElementById('knockout-dialog')?.classList.add('hidden');
  if (choice === 'watch') setMainUIControlsEnabled(true);
  const resolve = pending;
  pending = null;
  resolve?.(choice);
}

if (typeof document !== 'undefined') {
  document.getElementById('knockout-dialog-watch')?.addEventListener('click', () => closeHumanKnockoutDialog('watch'));
  document.getElementById('knockout-dialog-end')?.addEventListener('click', () => closeHumanKnockoutDialog('end'));
}
