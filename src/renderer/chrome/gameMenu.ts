/**
 * The game menu under the top bar's menu button: New game, Save and Load, the Playback and Charts checkboxes, Offer
 * tactical battles, How to play, and Quit.
 *
 * The menu is a disclosure popup. The button's `aria-expanded` and the menu's `hidden` attribute always agree.
 * New game and Offer tactical battles keep their own handlers in `openRouterControls.ts`; this module opens and
 * closes the menu, disables New game while the new-game screen is open or a Ready is resolving, and handles How to play
 * and Quit.
 */
import { rendererSharedState as S } from '../core/state';
import { onReplayChange, replayActive, requestReplayLeave } from '../replay/replayState';
import { newGameOverlayIsOpen } from '../gameplay/newGameDialogCollapse';
import { syncSaveLoadItems } from '../gameplay/saveLoadMenu';
import { showMapToast } from '../openRouter/openRouterUiHelpers';
import { dismissStaleControlTooltip } from './controlTooltip';
import { newGameItemBusyTooltipText, newGameItemOpenTooltipText } from './controlTooltipText';

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
 * Id of the menu's New game item.
 *
 * Purpose: One place for the id shared with `static/index.html`.
 * When to use: Every lookup of the New game item in this module.
 * Expected outcome: Matches the markup.
 * Exceptions: None.
 */
const NEW_GAME_ITEM_ID = 'openrouter-new-btn';

/**
 * Ids of the menu's buttons that run while replay stays on.
 *
 * Purpose: Every other button changes or saves the live match, so it first takes the player out of replay. These two
 *   do not touch the match.
 * When to use: The capture listener that leaves replay before a menu button runs.
 * Expected outcome: How to play and Quit.
 * Exceptions: None.
 */
const REPLAY_SAFE_BUTTON_IDS: ReadonlySet<string> = new Set(['game-menu-how-to-play-btn', 'game-menu-quit-btn']);

/**
 * The actions behind the menu, kept for `syncGameMenuViewItems`.
 *
 * Purpose: The menu opens outside `wireGameMenu`, so the checkbox states need the actions it was given.
 * When to use: `wireGameMenu` sets it. `syncGameMenuViewItems` reads it.
 * Expected outcome: Null until the menu is wired.
 * Exceptions: None.
 */
let menuActions: GameMenuActions | null = null;

/**
 * Whether a menu button click is held while replay leaves.
 *
 * Purpose: A second click during the leave would be held too and run its button twice, opening Save or Load twice.
 * When to use: The capture listener in `wireGameMenu` sets it while a held click waits and ignores menu button clicks
 *   until it clears.
 * Expected outcome: True from the held click until the leave settles and the click has run or been dropped.
 * Exceptions: None.
 */
let heldMenuClickPending = false;

/**
 * The sentence the map toast shows when the guide does not open.
 *
 * Purpose: The player learns that How to play did nothing, rather than waiting for a browser that never opens.
 * When to use: `reportHowToPlayFailure`.
 * Expected outcome: One short sentence.
 * Exceptions: None.
 */
const HOW_TO_PLAY_FAILED_TEXT = 'The How to play guide could not be opened in the browser.';

/**
 * Reports that How to play did not open the guide.
 *
 * Purpose: Main resolves false when the browser cannot be opened, and the call itself can reject. Neither may pass
 *   silently.
 * When to use: When `openHowToPlay` resolves false or rejects.
 * Expected outcome: The failure is logged with `console.error` and the map toast shows `HOW_TO_PLAY_FAILED_TEXT`.
 * Exceptions: None.
 */
function reportHowToPlayFailure(error?: unknown): void {
  console.error('How to play: the guide could not be opened', error ?? 'main reported false');
  showMapToast(HOW_TO_PLAY_FAILED_TEXT, { isError: true });
}

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
 * Disables the menu's New game item while the new-game screen is open or a Ready is resolving.
 *
 * Purpose: The menu also works on the new-game screen, where opening that screen again would only throw away the
 *   choices the player has made. While a Ready is being sent and answered, the match under the screen could not be
 *   returned to safely, so New game waits for it.
 * When to use: When the menu opens, and whenever pointer input for the match controls is switched on or off, which
 *   happens each time the new-game overlay opens or closes.
 * Expected outcome: New game is disabled while `#game-over-overlay` is open or `S.readyRequestInFlight` is set, and
 *   enabled otherwise. Its tip host names the reason that applies, the open screen first.
 * Exceptions: None; does nothing when the item is missing.
 */
export function syncGameMenuNewGameItem(): void {
  const item = document.getElementById(NEW_GAME_ITEM_ID);
  if (!(item instanceof HTMLButtonElement)) return;
  const screenOpen = newGameOverlayIsOpen();
  item.disabled = screenOpen || S.readyRequestInFlight;
  item.parentElement?.setAttribute('data-control-tooltip', screenOpen ? newGameItemOpenTooltipText : newGameItemBusyTooltipText);
}

/**
 * Checks or unchecks the Playback… and Charts… items to match what is showing.
 *
 * Purpose: Each item is a checkbox that says whether its surface is visible.
 * When to use: When the menu opens, and after each replay change, so `p` with the menu open leaves the box right.
 * Expected outcome: Playback… is checked while replay is on, and Charts… while the charts dialog is open. Nothing
 *   changes before `wireGameMenu` has run.
 * Exceptions: None; does nothing when an item is missing.
 */
export function syncGameMenuViewItems(): void {
  if (menuActions === null) return;
  const playback = document.getElementById('game-menu-playback-check');
  const charts = document.getElementById('game-menu-charts-check');
  if (playback instanceof HTMLInputElement) playback.checked = menuActions.replayIsOpen();
  if (charts instanceof HTMLInputElement) charts.checked = menuActions.chartsIsOpen();
}

/**
 * Opens the game menu.
 *
 * Purpose: Shows the menu under its button.
 * When to use: From the menu button's click handler.
 * Expected outcome: The menu shows with New game enabled or disabled for the current screen, the Playback… and Charts…
 *   checkboxes matching what is showing, and the button reporting `aria-expanded="true"`. Replay stays on.
 * Exceptions: None; does nothing when the markup is missing.
 */
export function openGameMenu(): void {
  const menu = document.getElementById(GAME_MENU_ID);
  const button = document.getElementById(GAME_MENU_BUTTON_ID);
  if (!menu || !button) return;
  syncGameMenuNewGameItem();
  syncSaveLoadItems();
  syncGameMenuViewItems();
  menu.hidden = false;
  button.setAttribute('aria-expanded', 'true');
}

/**
 * Closes the game menu.
 *
 * Purpose: Every way of leaving the menu ends here, so the button and the menu never disagree.
 * When to use: After a menu item runs, on Escape, on a press outside the menu, and when pointer input is switched off.
 *   Pass `restoreFocus` for Escape and the Playback… and Charts… checkboxes.
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
 * The actions behind the menu's Playback… and Charts… checkboxes.
 *
 * Purpose: The menu cannot import replay or the charts dialog without an import cycle, so `renderer.ts` passes them in.
 * When to use: The argument of `wireGameMenu`.
 * Expected outcome: Checking an item opens its surface, unchecking closes it, and the state readers say which is showing.
 * Exceptions: None.
 */
export interface GameMenuActions {
  /**
   * Enters replay, after any leave that is running.
   *
   * Contract: Does nothing when replay is already on. A refusal shows its own sentence.
   * When to use: When the player checks Playback….
   * Expected outcome: Replay opens on the newest recorded step, or stays off with a sentence.
   * Exceptions: None.
   */
  readonly openReplay: () => void;
  /**
   * Leaves replay.
   *
   * Contract: Does nothing when replay is off.
   * When to use: When the player unchecks Playback….
   * Expected outcome: The live match shows again.
   * Exceptions: None.
   */
  readonly closeReplay: () => void;
  /**
   * Reports whether replay is on.
   *
   * Contract: Reads current state and changes nothing.
   * When to use: When the menu opens.
   * Expected outcome: True while replay is on.
   * Exceptions: None.
   */
  readonly replayIsOpen: () => boolean;
  /**
   * Opens the charts dialog when it is closed.
   *
   * Contract: Refuses as the charts key does.
   * When to use: When the player checks Charts….
   * Expected outcome: The charts dialog shows.
   * Exceptions: None.
   */
  readonly openCharts: () => void;
  /**
   * Closes the charts dialog when it is open.
   *
   * Contract: Does nothing when the dialog is closed.
   * When to use: When the player unchecks Charts….
   * Expected outcome: The charts dialog hides.
   * Exceptions: None.
   */
  readonly closeCharts: () => void;
  /**
   * Reports whether the charts dialog is open.
   *
   * Contract: Reads current state and changes nothing.
   * When to use: When the menu opens.
   * Expected outcome: True while the dialog shows.
   * Exceptions: None.
   */
  readonly chartsIsOpen: () => boolean;
}

/**
 * Wires the menu button, the menu items, Escape, outside presses, How to play, and Quit.
 *
 * Purpose: One bootstrap for the menu's own behavior.
 * When to use: Once during renderer startup, after the page markup exists.
 * Expected outcome: The button toggles the menu. It does not open while the top bar ignores the pointer. An enabled
 *   menu button closes it after its own handler runs; the Offer tactical battles checkbox leaves it open. Escape
 *   closes it first, before the map's Escape handling, and returns focus to the button. A press outside the menu and
 *   its button closes it.
 *   Checking or unchecking Playback… or Charts… closes the menu first, so the charts are not blocked by it, and returns
 *   focus to the menu button, then runs `actions` to open or close replay or the charts. Both checkboxes follow replay
 *   changes while the menu stays open. A button that changes or saves the match takes the player out of replay before
 *   it runs, once per click: other menu button clicks are ignored until the leave settles, and the held click is
 *   dropped when its button is then disabled or gone. How to play asks main to open the guide on GitHub in the system
 *   browser and shows a toast when it cannot. Quit closes the window.
 * Exceptions: None; does nothing when the markup is missing.
 *
 * @param actions The replay and charts actions, injected so this module imports neither.
 */
export function wireGameMenu(actions: GameMenuActions): void {
  const menu = document.getElementById(GAME_MENU_ID);
  const button = document.getElementById(GAME_MENU_BUTTON_ID);
  if (!menu || !button) return;
  menuActions = actions;
  onReplayChange(syncGameMenuViewItems);

  button.addEventListener('click', () => {
    const topbar = document.getElementById('app-topbar');
    if (topbar instanceof HTMLElement && topbar.style.pointerEvents === 'none') return;
    if (isGameMenuOpen()) closeGameMenu();
    else openGameMenu();
  });

  // Replay no longer ends when the menu opens, so a button that changes or saves the match leaves it first. The click
  // is held, replay leaves, and the same button is clicked again. The second click skips this listener. Other button
  // clicks while one is held are dropped, so two quick clicks cannot both run.
  let replayingClick = false;
  menu.addEventListener(
    'click',
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const item = target?.closest('button');
      if (replayingClick || !item) return;
      if (heldMenuClickPending) {
        event.stopImmediatePropagation();
        event.preventDefault();
        return;
      }
      if (item.disabled || REPLAY_SAFE_BUTTON_IDS.has(item.id) || !replayActive()) return;
      event.stopImmediatePropagation();
      event.preventDefault();
      heldMenuClickPending = true;
      requestReplayLeave()
        .then(() => {
          if (item.disabled || !item.isConnected) return;
          replayingClick = true;
          try {
            item.click();
          } finally {
            replayingClick = false;
          }
        })
        .catch((error: unknown) => {
          console.error('game menu: leaving replay before a menu item failed', error);
        })
        .finally(() => {
          heldMenuClickPending = false;
        });
    },
    true
  );

  // A disabled button gets no clicks, so a click that reaches the menu from a button came from an enabled item. That
  // item's own handler has already run and may have disabled it: New game does, by opening the new-game screen.
  menu.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('button')) closeGameMenu();
  });

  // The menu closes before the action runs: an open menu blocks the charts dialog, and replay opens over the map.
  const wireViewCheckbox = (id: string, open: () => void, close: () => void): void => {
    document.getElementById(id)?.addEventListener('change', (event) => {
      const box = event.target instanceof HTMLInputElement ? event.target : null;
      if (box === null) return;
      closeGameMenu({ restoreFocus: true });
      if (box.checked) open();
      else close();
    });
  };
  wireViewCheckbox('game-menu-playback-check', actions.openReplay, actions.closeReplay);
  wireViewCheckbox('game-menu-charts-check', actions.openCharts, actions.closeCharts);

  document.getElementById('game-menu-how-to-play-btn')?.addEventListener('click', () => {
    const opening = window.gameApi?.openHowToPlay();
    if (opening === undefined) return;
    opening.then((opened) => {
      if (!opened) reportHowToPlayFailure();
    }, reportHowToPlayFailure);
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
