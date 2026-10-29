/**
 * `game_config` keys that belong to this machine, not to a match.
 *
 * Purpose: These rows hold this machine's OpenRouter setup, including secrets, not the match. A save file never contains them. A load keeps this machine's values. A new row of this kind must be added here, or saves will carry it.
 * When to use: When a save is written, when a save is loaded, and when OpenRouter code names one of these rows.
 * Expected outcome: Six stable key names, listed in `MACHINE_LOCAL_CONFIG_KEYS`.
 * Exceptions: None.
 */

/**
 * `game_config` key for this machine's legacy OpenRouter API key.
 *
 * Purpose: The original single-commander key stays on this machine when a match is saved or loaded.
 * When to use: Reading and writing that encrypted row.
 * Expected outcome: The string `openrouter_api_key`.
 * Exceptions: None.
 */
export const OPENROUTER_API_KEY_CONFIG_KEY = 'openrouter_api_key';

/**
 * `game_config` key for this machine's legacy selected model.
 *
 * Purpose: The app-wide model choice is not part of a saved match.
 * When to use: Reading and writing that row.
 * Expected outcome: The string `openrouter_selected_model`.
 * Exceptions: None.
 */
export const OPENROUTER_SELECTED_MODEL_CONFIG_KEY = 'openrouter_selected_model';

/**
 * `game_config` key for this machine's legacy reasoning-effort override.
 *
 * Purpose: The app-wide effort choice is not part of a saved match.
 * When to use: Reading and writing that row.
 * Expected outcome: The string `openrouter_selected_reasoning_effort`.
 * Exceptions: None.
 */
export const OPENROUTER_SELECTED_REASONING_EFFORT_CONFIG_KEY = 'openrouter_selected_reasoning_effort';

/**
 * `game_config` key for the remembered commander array.
 *
 * Purpose: The new-game screen's remembered commanders stay on this machine.
 * When to use: Reading and writing that encrypted row.
 * Expected outcome: The string `openrouter_commander_memory`.
 * Exceptions: None.
 */
export const COMMANDER_MEMORY_CONFIG_KEY = 'openrouter_commander_memory';

/**
 * `game_config` key for the encrypted seat-key map.
 *
 * Purpose: Each seat's OpenRouter key stays on this machine.
 * When to use: Reading and writing that encrypted row.
 * Expected outcome: The string `openrouter_seat_api_keys`.
 * Exceptions: None.
 */
export const SEAT_API_KEYS_CONFIG_KEY = 'openrouter_seat_api_keys';

/**
 * `game_config` key for the seat-key flags.
 *
 * Purpose: The flags say which seats have a key without storing the secret.
 * When to use: Reading and writing that row.
 * Expected outcome: The string `openrouter_seat_api_key_flags`.
 * Exceptions: None.
 */
export const SEAT_API_KEY_FLAGS_CONFIG_KEY = 'openrouter_seat_api_key_flags';

/**
 * Every machine-local `game_config` key, in the order saves delete and restore them.
 *
 * Purpose: Save and load share one list so a new machine-local row cannot be forgotten.
 * When to use: Deleting those rows from a save, and copying this machine's rows into a load.
 * Expected outcome: The six key strings above.
 * Exceptions: None.
 */
export const MACHINE_LOCAL_CONFIG_KEYS: readonly string[] = [
  OPENROUTER_API_KEY_CONFIG_KEY,
  OPENROUTER_SELECTED_MODEL_CONFIG_KEY,
  OPENROUTER_SELECTED_REASONING_EFFORT_CONFIG_KEY,
  COMMANDER_MEMORY_CONFIG_KEY,
  SEAT_API_KEYS_CONFIG_KEY,
  SEAT_API_KEY_FLAGS_CONFIG_KEY,
];
