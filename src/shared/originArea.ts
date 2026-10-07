import { COUNTRY_FLAG_CLASS_NAME, countryFlagAssetPath } from './countryFlags';
import { escapeHtmlText } from './htmlTextFormatting';
import { SUBDIVISION_FLAG_CODES } from './subdivisionFlagCodes';

/**
 * Picks the id that covers the most cells, with ties broken by id ascending.
 *
 * Purpose: A strategic hex needs one origin area, chosen the same way on every machine.
 * When to use: After counting origin ids on the hex's tactical land cells.
 * Expected outcome: The id with the highest count. Equal counts keep the id that sorts first. Null when the map is empty.
 * Exceptions: None.
 */
export function majorityOriginId(counts: ReadonlyMap<string, number>): string | null {
  let winner: string | null = null;
  let winnerCount = -1;
  for (const [id, count] of counts) {
    if (count > winnerCount || (count === winnerCount && winner !== null && id < winner)) {
      winner = id;
      winnerCount = count;
    }
  }
  return winner;
}

/**
 * Resolves the flag for an origin area.
 *
 * Purpose: Subdivision flags ship only for an allow-list. Everything else uses the national flag, then the placeholder.
 * When to use: Unit labels and the origin tooltip. Do not parse the area id for a code.
 * Expected outcome: `flags/subdivisions/<code>.svg` when `subdivisionCode` is allow-listed. Otherwise the national SVG for `countryCode`. Otherwise `flag-unknown.svg`.
 * Exceptions: None.
 */
export function originFlagAssetPath(input: {
  readonly subdivisionCode: string | null;
  readonly countryCode: string | null;
}): string {
  const subdivision = input.subdivisionCode?.trim().toLowerCase() ?? '';
  if (subdivision.length > 0 && SUBDIVISION_FLAG_CODES.has(subdivision)) {
    return `flags/subdivisions/${subdivision}.svg`;
  }
  return countryFlagAssetPath(input.countryCode);
}

/**
 * Builds the origin-area flag image for an HTML tooltip.
 *
 * Purpose: The unit tooltip uses the same flag the label uses.
 * When to use: Inside `formatUnitOriginTooltipHtml`.
 * Expected outcome: A decorative `<img>` whose source is `originFlagAssetPath`.
 * Exceptions: None.
 */
export function originFlagImgHtml(input: {
  readonly subdivisionCode: string | null;
  readonly countryCode: string | null;
}): string {
  const src = escapeHtmlText(originFlagAssetPath(input));
  return `<img class="${COUNTRY_FLAG_CLASS_NAME}" src="${src}" alt="" aria-hidden="true" draggable="false">`;
}
