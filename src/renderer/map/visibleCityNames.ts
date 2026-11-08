/**
 * City names that count for the current frame.
 *
 * Purpose: A state of the same name is not drawn while one of these cities is in view.
 * When to use: The city pass fills the set. The label pass reads it later in the same frame.
 * Expected outcome: The set holds folded names. It is empty until the city pass records a city.
 * Exceptions: None.
 */

import { cityNamesInOverlayLabel, normalizedPlaceName } from '../../shared/mapLabelCityNames';

/**
 * Folded city names recorded for this frame.
 *
 * Purpose: The city pass fills it and the label pass reads it later in the same frame.
 * When to use: Through the three functions below.
 * Expected outcome: Empty after `clearVisibleCityNames`, then one key per city name that counted.
 * Exceptions: None.
 */
let visibleCityNameKeys = new Set<string>();

/**
 * Drops every city recorded for the previous frame.
 *
 * Purpose: A frame that draws no cities must not keep hiding state names.
 * When to use: The first statement of each paint, before any branch.
 * Expected outcome: The set is empty.
 * Exceptions: None.
 */
export function clearVisibleCityNames(): void {
  visibleCityNameKeys = new Set();
}

/**
 * Records every city name in one overlay label.
 *
 * Purpose: A tie lists more than one city. Each one can hide its state.
 * When to use: After the cell center is known to be in view and the cell would be drawn with inspection released.
 * Expected outcome: Each name is stored in folded form.
 * Exceptions: None.
 */
export function noteVisibleCityLabel(label: string): void {
  for (const name of cityNamesInOverlayLabel(label)) {
    visibleCityNameKeys.add(normalizedPlaceName(name));
  }
}

/**
 * The folded city names that count for this frame.
 *
 * Purpose: The label pass compares state names against this set.
 * When to use: After the city pass for the same frame.
 * Expected outcome: The set the city pass filled. Empty when no city counted.
 * Exceptions: None.
 */
export function getVisibleCityNameKeys(): ReadonlySet<string> {
  return visibleCityNameKeys;
}
