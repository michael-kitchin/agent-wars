/**
 * The game menu under the top bar's menu button: New game, the placeholders, Offer tactical battles, and Quit.
 *
 * The menu is a disclosure popup. The button's `aria-expanded` and the menu's `hidden` attribute always agree.
 * New game and Offer tactical battles keep their own handlers in `openRouterControls.ts`; this module only opens
 * and closes the menu and handles Quit.
 */
import { dismissStaleControlTooltip } from './controlTooltip';

/**
 * Id of the menu element.
 *
 * Purpose: One place for the id shared with `static/index.html`.
 * When to use: Every lookup of the menu in this module.
 * Expected outcome: Matches the markup.
 * Exceptions: None.
 */
const GAME_MENU_ID = 'game-menu';

/**
 * Id of the top-bar button that opens the menu.
 *
 * Purpose: One place for the id shared with `static/index.html`.
 * When to use: Every lookup of the button in this module.
 * Expected outcome: Matches the markup.
 * Exceptions: None.
 */
const GAME_MENU_BUTTON_ID = 'game-menu-btn';

/**
 * Reports whether the game menu is open.
 *
 * Purpose: Key and pointer handlers act only while the menu shows.
 * When to use: Before handling Escape or an outside press.
 * Expected outcome: True when the menu element exists and is not hidden.
 * Exceptions: None.
 */
export function isGameMenuOpen(): boolean {
  const menu = document.getElementById(GAME_MENU_ID);
  return menu !== null && !menu.hidden;
}

/**
 * Opens the game menu.
 *
 * Purpose: Shows the menu under its button.
 * When to use: From the menu button's click handler.
 * Expected outcome: The menu shows and the button reports `aria-expanded="true"`.
 * Exceptions: None; does nothing when the markup is missing.
 */
export function openGameMenu(): void {
  const menu = document.getElementById(GAME_MENU_ID);
  const button = document.getElementById(GAME_MENU_BUTTON_ID);
  if (!menu || !button) return;
  menu.hidden = false;
  button.setAttribute('aria-expanded', 'true');
}

/**
 * Closes the game menu.
 *
 * Purpose: Every way of leaving the menu ends here, so the button and the menu never disagree.
 * When to use: After a menu item runs, on Escape, on a press outside the menu, and when pointer input is switched off.
 *   Pass `restoreFocus` only for Escape.
 * Expected outcome: The menu hides, the button reports `aria-expanded="false"`, and a tip for a hidden item is dismissed.
 *   With `restoreFocus`, focus returns to the menu button. Calling it while the menu is closed changes nothing.
 * Exceptions: None.
 */
export function closeGameMenu(options: { readonly restoreFocus?: boolean } = {}): void {
  const menu = document.getElementById(GAME_MENU_ID);
  const button = document.getElementById(GAME_MENU_BUTTON_ID);
  if (!menu || !button || menu.hidden) return;
  menu.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  dismissStaleControlTooltip();
  if (options.restoreFocus) button.focus();
}

/**
 * Wires the menu button, the menu items, Escape, outside presses, and Quit.
 *
 * Purpose: One bootstrap for the menu's own behavior.
 * When to use: Once during renderer startup, after the page markup exists.
 * Expected outcome: The button toggles the menu. It does not open while the top bar ignores the pointer. An enabled
 *   menu button closes it after its own handler runs; the checkbox leaves it open. Escape closes it first, before
 *   the map's Escape handling, and returns focus to the button. A press outside the menu and its button closes it.
 *   Quit closes the window.
 * Exceptions: None; does nothing when the markup is missing.
 */
export function wireGameMenu(): void {
  const menu = document.getElementById(GAME_MENU_ID);
  const button = document.getElementById(GAME_MENU_BUTTON_ID);
  if (!menu || !button) return;

  button.addEventListener('click', () => {
    const topbar = document.getElementById('app-topbar');
    if (topbar instanceof HTMLElement && topbar.style.pointerEvents === 'none') return;
    if (isGameMenuOpen()) closeGameMenu();
    else openGameMenu();
  });

  menu.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const item = target?.closest('button');
    if (item && !(item as HTMLButtonElement).disabled) closeGameMenu();
  });

  document.getElementById('game-menu-quit-btn')?.addEventListener('click', () => {
    window.close();
  });

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !isGameMenuOpen()) return;
      event.preventDefault();
      event.stopPropagation();
      closeGameMenu({ restoreFocus: true });
    },
    true
  );

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!isGameMenuOpen()) return;
      const target = event.target instanceof Node ? event.target : null;
      if (target && (menu.contains(target) || button.contains(target))) return;
      closeGameMenu();
    },
    true
  );
}
