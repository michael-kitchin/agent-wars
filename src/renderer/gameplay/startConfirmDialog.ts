/**
 * Yes/no question before a match that has no models.
 *
 * Purpose: Start must not begin that match until the player says yes.
 * When to use: The Start click when `newGameHasAnyModel` is false.
 * Expected outcome: True for Yes. False for No, Escape, a backdrop click, or a missing dialog.
 * Exceptions: None. A missing dialog logs `console.error` and resolves false.
 */

/**
 * Resolves the dialog that is already open, if one is.
 *
 * Purpose: A second Start click must not leave the first promise hanging.
 * When to use: `confirmStartWithNoModels`.
 * Expected outcome: Null when no question is open.
 * Exceptions: None.
 */
let pendingAnswer: ((answer: boolean) => void) | null = null;

/**
 * Whether the buttons and the backdrop have listeners.
 *
 * Purpose: Binding twice would answer one click twice.
 * When to use: The first time the dialog is shown.
 * Expected outcome: Stays true after the first bind.
 * Exceptions: None.
 */
let buttonsBound = false;

/**
 * Asks whether to start with no models set.
 *
 * Purpose: The match epoch must not advance until this resolves true.
 * When to use: After a blocked start has already returned, and before `advanceRendererMatchEpoch`.
 * Expected outcome: The dialog shows and Yes takes focus, so Enter answers Yes. No, Escape, and the backdrop resolve false.
 * Exceptions: A missing dialog resolves false and logs `console.error`.
 */
export function confirmStartWithNoModels(): Promise<boolean> {
  const dialog = document.getElementById('start-confirm-dialog');
  if (!(dialog instanceof HTMLElement)) {
    console.error('start confirm dialog is missing');
    return Promise.resolve(false);
  }
  if (pendingAnswer) {
    const previous = pendingAnswer;
    pendingAnswer = null;
    previous(false);
  }
  bindStartConfirmDialog(dialog);
  dialog.classList.remove('hidden');
  const yes = document.getElementById('start-confirm-yes');
  if (yes instanceof HTMLElement) yes.focus();
  return new Promise((resolve) => {
    pendingAnswer = resolve;
  });
}

/**
 * Wires Yes, No, Escape, and the backdrop once.
 *
 * Purpose: The dialog has no other owner.
 * When to use: The first `confirmStartWithNoModels` call that finds the element.
 * Expected outcome: Later calls only show the dialog. Escape answers No and does not reach the map or the game menu.
 * Exceptions: None.
 */
function bindStartConfirmDialog(dialog: HTMLElement): void {
  if (buttonsBound) return;
  buttonsBound = true;
  document.getElementById('start-confirm-yes')?.addEventListener('click', () => {
    finishStartConfirm(true);
  });
  document.getElementById('start-confirm-no')?.addEventListener('click', () => {
    finishStartConfirm(false);
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) finishStartConfirm(false);
  });
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape') return;
      if (dialog.classList.contains('hidden')) return;
      event.preventDefault();
      event.stopPropagation();
      finishStartConfirm(false);
    },
    true
  );
}

/**
 * Hides the dialog and resolves the open question.
 *
 * Purpose: Every dismiss path shares one close.
 * When to use: Yes, No, Escape, and the backdrop.
 * Expected outcome: The overlay is hidden. The pending promise settles once.
 * Exceptions: None.
 */
function finishStartConfirm(answer: boolean): void {
  document.getElementById('start-confirm-dialog')?.classList.add('hidden');
  const resolve = pendingAnswer;
  pendingAnswer = null;
  resolve?.(answer);
}
