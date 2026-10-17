/**
 * Persists whether the human wants the pre-melee "Tactical battles" intercept dialog when multiple melee hexes exist.
 */

const STORAGE_KEY = 'agentWars.tacticalBattlesInterceptPrompt';

/**
 * Returns true when the melee-intercept modal should be shown; false means auto-resolve as Ignore.
 *
 * Purpose: Mirrors the game menu's Offer tactical battles checkbox default (on) while allowing a persistent opt-out for faster strategic play.
 * When to use: `handleReadyButtonClick` before `openMeleeInterceptModal`; `initOpenRouterUI` to seed the checkbox.
 * Expected outcome: `true` when unset or any value other than `0` / `false`; survives reloads via `localStorage`.
 * Exceptions: Swallows storage errors and returns `true`.
 */
export function readTacticalBattlesInterceptPromptEnabled(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === null) return true;
    return v !== '0' && v !== 'false';
  } catch {
    return true;
  }
}

/**
 * Persists the game menu's "Offer tactical battles" checkbox state.
 *
 * Purpose: Keeps auto-ignore behavior stable across sessions when the player disables tactical prompts.
 * When to use: Checkbox `change` handler in `initOpenRouterUI`.
 * Expected outcome: Stores `1` when enabled, `0` when disabled.
 * Exceptions: Swallows storage quota or privacy errors.
 */
export function writeTacticalBattlesInterceptPromptEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}
