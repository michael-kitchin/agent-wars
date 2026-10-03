/**
 * Country flag asset lookup and markup shared by hex naming captions and unit labels.
 *
 * Purpose: One place decides which vendored SVG a country code uses and how the flag `<img>` looks.
 * When to use: Any UI that prefixes a country or unit name with a flag.
 * Expected outcome: Paths relative to `static/` (`flags/fr.svg`), with a placeholder for unknown codes.
 * Exceptions: None.
 */
import { escapeHtmlText } from './htmlTextFormatting';

/**
 * Uppercase ISO 3166-1 alpha-2 codes that have a vendored file in `static/flags/`.
 *
 * Purpose: Lets callers fall back to the placeholder instead of requesting a missing file.
 * When to use: Through `countryFlagAssetPath`; keep in sync with `static/flags/` (a test enforces it).
 * Expected outcome: Exactly one entry per `static/flags/<code>.svg`.
 * Exceptions: None.
 */
export const AVAILABLE_COUNTRY_FLAG_CODES: ReadonlySet<string> = new Set([
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
  'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS',
  'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN',
  'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE',
  'EG', 'EH', 'ER', 'ES', 'ET', 'EU', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE',
  'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK',
  'HM', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE',
  'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB',
  'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH',
  'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ',
  'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF',
  'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU',
  'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR',
  'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN',
  'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG',
  'VI', 'VN', 'VU', 'WF', 'WS', 'XK', 'YE', 'YT', 'ZA', 'ZM', 'ZW',
]);

/**
 * Placeholder flag path for a missing or unknown country code.
 *
 * Purpose: Keeps flag slots the same size when no real flag applies.
 * When to use: Returned by `countryFlagAssetPath`; do not reference directly in UI code.
 * Expected outcome: A repo-authored gray 3:2 SVG with a question mark.
 * Exceptions: None.
 */
export const UNKNOWN_COUNTRY_FLAG_PATH = 'flag-unknown.svg';

/**
 * CSS class shared by every flag image (styled in `static/index.html`).
 *
 * Purpose: One class gives hex-caption and unit-label flags the same size and outline.
 * When to use: On every flag `<img>`, whether built as HTML or as a DOM element.
 * Expected outcome: The flag scales with the surrounding text.
 * Exceptions: None.
 */
export const COUNTRY_FLAG_CLASS_NAME = 'country-flag';

/**
 * Resolves the flag asset path for a country code.
 *
 * Purpose: Maps an ISO alpha-2 code to its vendored SVG, falling back to the placeholder.
 * When to use: Before setting a flag `<img>` source.
 * Expected outcome: `flags/<lowercase>.svg` when the code is available, else `UNKNOWN_COUNTRY_FLAG_PATH`.
 * Exceptions: None; case and surrounding spaces in `countryCode` are ignored.
 */
export function countryFlagAssetPath(countryCode: string | null): string {
  const code = countryCode?.trim().toUpperCase() ?? '';
  return AVAILABLE_COUNTRY_FLAG_CODES.has(code) ? `flags/${code.toLowerCase()}.svg` : UNKNOWN_COUNTRY_FLAG_PATH;
}

/**
 * Builds the flag `<img>` markup for HTML-string surfaces (hex tooltips and popups).
 *
 * Purpose: Lets HTML formatters embed a decorative flag without DOM access.
 * When to use: Inside strings assigned to `innerHTML`; DOM code should build an element instead.
 * Expected outcome: A decorative, non-draggable `<img>` with the shared class and an escaped source.
 * Exceptions: None.
 */
export function countryFlagImgHtml(countryCode: string | null): string {
  const src = escapeHtmlText(countryFlagAssetPath(countryCode));
  return `<img class="${COUNTRY_FLAG_CLASS_NAME}" src="${src}" alt="" aria-hidden="true" draggable="false">`;
}
