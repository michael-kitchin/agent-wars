/**
 * Which border groups a view draws.
 *
 * Purpose: National and state borders use the same zoom rule as the names they belong with.
 * When to use: Before showing or hiding a border layer.
 * Expected outcome: Country names bring both country groups. State names bring both state groups. Continents bring none.
 * Exceptions: None.
 */

import type { AdminBorderGroupId } from './vectorPackTypes';
import { visibleLabelKinds } from './mapLabelRules';

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
