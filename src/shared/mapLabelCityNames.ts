/**
 * Decides which state names a city on screen should hide.
 *
 * Purpose: A city and the state of the same name should not both be labeled. Country and continent names stay.
 * When to use: The city pass records normalized names. The label pass filters with them.
 * Expected outcome: Accent and case differences match. A longer name does not match a shorter one.
 * Exceptions: None.
 */

import type { MapLabelKind } from './mapLabelRules';

/**
 * The folded form of a place name.
 *
 * Purpose: Québec and Quebec, and M'Sila and M'sila, are the same name. Aichi Prefecture is not Aichi.
 * When to use: Before putting a city into the set, and before testing a state name against that set.
 * Expected outcome: Accents removed, English lower case, surrounding space removed. Other characters stay.
 * Exceptions: None.
 */
export function normalizedPlaceName(name: string): string {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en').trim();
}

/**
 * City names carried by one overlay label.
 *
 * Purpose: A tie is joined with ` / `. A slash that is part of one name is not a tie.
 * When to use: When recording the label stored for a tactical cell.
 * Expected outcome: One trimmed name per part. Empty parts are dropped.
 * Exceptions: None.
 */
export function cityNamesInOverlayLabel(label: string): string[] {
  return label.split(' / ').map((part) => part.trim()).filter((part) => part.length > 0);
}

/**
 * Whether a cell center is inside the view, including the edges.
 *
 * Purpose: A hex that only touches the view does not count when its center is outside.
 * When to use: After the city pass has accepted the cell and projected its center.
 * Expected outcome: True when `x` is from 0 through `width` and `y` is from 0 through `height`.
 * Exceptions: None.
 */
export function cityCenterIsInView(
  center: { readonly x: number; readonly y: number },
  view: { readonly width: number; readonly height: number },
): boolean {
  return center.x >= 0 && center.x <= view.width && center.y >= 0 && center.y <= view.height;
}

/**
 * Drops state names that match a city recorded for this frame.
 *
 * Purpose: The match is the whole view. The city does not have to lie inside the state. Country and continent names stay.
 * When to use: After the ordinary kind, zoom, and bounds filters, with the cities recorded earlier in the frame.
 * Expected outcome: An empty set returns a copy of every feature. Otherwise a state is removed when its folded name is in the set.
 * Exceptions: None.
 */
export function withoutStatesNamedForCities<T extends { readonly kind: MapLabelKind; readonly name: string }>(
  features: readonly T[],
  cityNameKeys: ReadonlySet<string>,
): T[] {
  if (cityNameKeys.size === 0) return features.slice();
  return features.filter((feature) => feature.kind !== 'state' || !cityNameKeys.has(normalizedPlaceName(feature.name)));
}
