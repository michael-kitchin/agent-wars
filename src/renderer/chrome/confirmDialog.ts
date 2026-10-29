/**
 * A yes-or-no question shown over the map.
 *
 * Purpose: Start and load share one dialog: the same dismiss paths, and a second ask that settles the question already open.
 * When to use: Building `confirmStartWithNoModels` and `confirmLoadOverMatch`.
 * Expected outcome: A function that resolves true for the confirm button and false for cancel, Escape, the backdrop, or a missing dialog.
 * Exceptions: None. A missing dialog logs `console.error` and resolves false.
 */

/**
 * The elements and the button that takes focus.
 *
 * Purpose: Each question has its own markup and its own first button.
 * When to use: `createConfirmDialog`.
 * Expected outcome: Ids of the overlay, the confirm button, and the cancel button, plus which one is focused.
 * Exceptions: None.
 */
export interface ConfirmDialogIds {
  /**
   * The overlay element id.
   *
   * Contract: Matches an element in the page.
   * When to use: Showing and hiding the question.
   * Expected outcome: That element gains or loses `hidden`.
   * Exceptions: None.
   */
  readonly dialogId: string;
  /**
   * The confirm button id.
   *
   * Contract: Matches a button inside the overlay.
   * When to use: A click resolves true. It takes focus when `initialFocus` is `confirm`.
   * Expected outcome: One true answer.
   * Exceptions: None.
   */
  readonly confirmId: string;
  /**
   * The cancel button id.
   *
   * Contract: Matches a button inside the overlay.
   * When to use: A click resolves false. It takes focus when `initialFocus` is `cancel`.
   * Expected outcome: One false answer.
   * Exceptions: None.
   */
  readonly cancelId: string;
  /**
   * Which button is focused when the question opens.
   *
   * Contract: `confirm` or `cancel`.
   * When to use: After the overlay is shown.
   * Expected outcome: Enter activates that button.
   * Exceptions: None.
   */
  readonly initialFocus: 'confirm' | 'cancel';
}

/**
 * Builds a confirm function for one dialog.
 *
 * Purpose: The question, its pending answer, and its listeners stay with that dialog.
 * When to use: Once per dialog, at module level.
 * Expected outcome: A function that shows the dialog and resolves true only for the confirm button. An already-open question resolves false before the new one is asked. Escape does not reach the map or the game menu.
 * Exceptions: None.
 */
export function createConfirmDialog(ids: ConfirmDialogIds): () => Promise<boolean> {
  let pendingAnswer: ((answer: boolean) => void) | null = null;
  let buttonsBound = false;

  /**
   * Hides the dialog and settles the open question.
   *
   * Purpose: Confirm, cancel, Escape, and the backdrop share one close.
   * When to use: From the listeners bound below.
   * Expected outcome: The overlay is hidden and the pending promise settles once.
   * Exceptions: None.
   */
  function finish(answer: boolean): void {
    document.getElementById(ids.dialogId)?.classList.add('hidden');
    const resolve = pendingAnswer;
    pendingAnswer = null;
    resolve?.(answer);
  }

  /**
   * Wires the buttons, the backdrop, and Escape once.
   *
   * Purpose: Binding twice would answer one click twice.
   * When to use: The first time this dialog is shown.
   * Expected outcome: Later calls only show the dialog. Escape answers cancel and does not propagate.
   * Exceptions: None.
   */
  function bind(dialog: HTMLElement): void {
    if (buttonsBound) return;
    buttonsBound = true;
    document.getElementById(ids.confirmId)?.addEventListener('click', () => {
      finish(true);
    });
    document.getElementById(ids.cancelId)?.addEventListener('click', () => {
      finish(false);
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) finish(false);
    });
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Escape') return;
        if (dialog.classList.contains('hidden')) return;
        event.preventDefault();
        event.stopPropagation();
        finish(false);
      },
      true,
    );
  }

  return function ask(): Promise<boolean> {
    const dialog = document.getElementById(ids.dialogId);
    if (!(dialog instanceof HTMLElement)) {
      console.error(`${ids.dialogId} is missing`);
      return Promise.resolve(false);
    }
    if (pendingAnswer) {
      const previous = pendingAnswer;
      pendingAnswer = null;
      previous(false);
    }
    bind(dialog);
    dialog.classList.remove('hidden');
    const focusId = ids.initialFocus === 'confirm' ? ids.confirmId : ids.cancelId;
    const focusTarget = document.getElementById(focusId);
    if (focusTarget instanceof HTMLElement) focusTarget.focus();
    return new Promise((resolve) => {
      pendingAnswer = resolve;
    });
  };
}
