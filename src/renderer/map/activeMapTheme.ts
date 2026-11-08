/**
 * The map theme selected for this session.
 *
 * Purpose: The choice is not saved. It starts at Standard and changes only from the legend.
 * When to use: Read with `getActiveMapTheme`. Write with `setActiveMapThemeId`.
 * Expected outcome: One of the four themes.
 * Exceptions: None.
 */

import { DEFAULT_MAP_THEME_ID, type MapTheme, mapThemeById } from '../../shared/mapThemes';

let activeTheme = mapThemeById(DEFAULT_MAP_THEME_ID);

/**
 * Returns the theme currently painting the map.
 *
 * Purpose: Hexes, tiles, and labels all read one theme.
 * When to use: Any paint that depends on the player's choice.
 * Expected outcome: The active theme. Standard until the player picks another.
 * Exceptions: None.
 */
export function getActiveMapTheme(): MapTheme {
  return activeTheme;
}

/**
 * Selects a theme by id.
 *
 * Purpose: The legend reports the option value, which may not be a known id.
 * When to use: From the legend's change listener, before the theme is applied.
 * Expected outcome: True when the theme changed. False when the id resolves to the theme already selected.
 *   An unknown id resolves to Standard.
 * Exceptions: None.
 */
export function setActiveMapThemeId(id: string): boolean {
  const next = mapThemeById(id);
  if (next.id === activeTheme.id) return false;
  activeTheme = next;
  return true;
}
