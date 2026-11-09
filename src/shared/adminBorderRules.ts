/**
 * Which border groups a view draws, and how strongly each line is painted.
 *
 * Purpose: National and state borders use the same zoom rule as the names they belong with. Strength is the same on every theme.
 * When to use: Before showing or hiding a border layer.
 * Expected outcome: Country names bring both country groups. State names bring both state groups. Continents bring none.
 * Exceptions: None.
 */

import type { AdminBorderGroupId } from './vectorPackTypes';
import { visibleLabelKinds } from './mapLabelRules';

/**
 * Opacity of a national border, including a disputed national line.
 *
 * Purpose: National lines read stronger than state lines, on every theme.
 * When to use: `borderLineOpacity` for `country` and `country_disputed`.
 * Expected outcome: Four fifths.
 * Exceptions: None.
 */
export const NATIONAL_BORDER_OPACITY = 4 / 5;

/**
 * Opacity of a state or province border, including a disputed state line.
 *
 * Purpose: State lines stay visible under the national lines.
 * When to use: `borderLineOpacity` for `state` and `state_disputed`.
 * Expected outcome: Three fifths.
 * Exceptions: None.
 */
export const STATE_BORDER_OPACITY = 3 / 5;

/**
 * Border groups visible with the current names.
 *
 * Purpose: A border layer must not invent its own zoom cutoff.
 * When to use: From the border sync, once per view change.
 * Expected outcome: `country` and `country_disputed` when country names are visible.
 *   `state` and `state_disputed` when state names are visible. An empty list when only continents are visible.
 * Exceptions: None.
 */
export function adminBorderGroupsForView(zoom: number, tacticalView: boolean): AdminBorderGroupId[] {
  const kinds = visibleLabelKinds(zoom, tacticalView);
  const groups: AdminBorderGroupId[] = [];
  if (kinds.includes('country')) groups.push('country', 'country_disputed');
  if (kinds.includes('state')) groups.push('state', 'state_disputed');
  return groups;
}

/**
 * How strongly one border group is painted.
 *
 * Purpose: The theme supplies the ink. This share is the same for every theme.
 * When to use: When styling a border layer. Disputed lines use their level's share.
 * Expected outcome: `NATIONAL_BORDER_OPACITY` for a country group. `STATE_BORDER_OPACITY` for a state group.
 * Exceptions: None.
 */
export function borderLineOpacity(id: AdminBorderGroupId): number {
  return id === 'state' || id === 'state_disputed' ? STATE_BORDER_OPACITY : NATIONAL_BORDER_OPACITY;
}
