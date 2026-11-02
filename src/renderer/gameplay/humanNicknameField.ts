/**
 * The Nickname field at the top of Game Options.
 *
 * Purpose: The name is saved on this computer as the player types, and Start reads it without waiting for that save.
 * When to use: Once, from `registerNewGameButton`.
 * Expected outcome: The field shows the stored name. A missing field reads as Human.
 * Exceptions: A rejected save is logged. Blur still shows the cleaned name.
 */

import { HUMAN_NICKNAME_DEFAULT, normalizeSideNickname, SIDE_NICKNAME_MAX_LENGTH } from '../../shared/sideNicknames';
import { humanNicknameFieldTooltipText } from '../chrome/controlTooltipText';

/**
 * Loads the stored name and saves later edits.
 *
 * Purpose: Opening the overlay must not put a default back over a saved name.
 * When to use: `registerNewGameButton`, next to the other Game Options wiring.
 * Expected outcome: The input shows `getHumanNickname`. Each input writes the typed text. Blur writes the cleaned name and puts that name back in the field, or `Human` when the text is empty or rejected. A blur before that load finishes does not save.
 * Exceptions: A rejected load or save is logged. A failed save leaves the cleaned name in the field.
 */
export function wireHumanNicknameField(): void {
  const input = nicknameInput();
  if (!input || input.dataset.wired === 'true') return;
  input.dataset.wired = 'true';
  input.maxLength = SIDE_NICKNAME_MAX_LENGTH;
  input.dataset.controlTooltip = humanNicknameFieldTooltipText;
  input.title = humanNicknameFieldTooltipText;
  const api = window.gameApi;
  if (!api) return;
  void api.getHumanNickname().then((name) => {
    if (input.dataset.loaded === 'true') return;
    input.value = name;
    input.dataset.loaded = 'true';
  }).catch((err: unknown) => {
    console.error('human nickname load failed', err);
  });
  const save = (value: string): void => {
    input.dataset.loaded = 'true';
    void api.setHumanNickname(value).catch((err: unknown) => {
      console.error('human nickname save failed', err);
    });
  };
  input.addEventListener('input', () => save(input.value));
  input.addEventListener('blur', () => {
    if (input.dataset.loaded !== 'true') return;
    const accepted = acceptedHumanNickname(input.value);
    input.value = accepted;
    save(accepted);
  });
}

/**
 * The nickname Start should send.
 *
 * Purpose: Start cannot wait for the field's save to finish.
 * When to use: The `game:newGame` payload.
 * Expected outcome: The cleaned field text, or `Human` when the input is missing, blank, or rejected.
 * Exceptions: None. This does not call IPC.
 */
export function readHumanNicknameField(): string {
  return acceptedHumanNickname(nicknameInput()?.value ?? HUMAN_NICKNAME_DEFAULT);
}

/**
 * The nickname Start should put on the payload.
 *
 * Purpose: A start that races the field's first load must not replace the stored name with an empty field.
 * When to use: The `game:newGame` payload.
 * Expected outcome: The cleaned field text after it has loaded or the player has typed. Undefined until then, so main keeps the stored row.
 * Exceptions: None. This does not call IPC.
 */
export function readHumanNicknameForStart(): string | undefined {
  const input = nicknameInput();
  if (!input || input.dataset.loaded !== 'true') return undefined;
  return readHumanNicknameField();
}

/**
 * The name a typed value is allowed to keep.
 *
 * Purpose: The field and Start agree with the name the match will store.
 * When to use: Blur, and `readHumanNicknameField`.
 * Expected outcome: The cleaned text, or `Human` when that text is empty or rejected.
 * Exceptions: None.
 */
function acceptedHumanNickname(value: string): string {
  return normalizeSideNickname(value) || HUMAN_NICKNAME_DEFAULT;
}

/**
 * The Nickname input, when the page has one.
 *
 * Purpose: Both the wiring and the Start read use the same element.
 * When to use: Inside this module.
 * Expected outcome: The input, or null when the page has not got that id.
 * Exceptions: None.
 */
function nicknameInput(): HTMLInputElement | null {
  const input = document.getElementById('new-game-human-nickname');
  return input instanceof HTMLInputElement ? input : null;
}
