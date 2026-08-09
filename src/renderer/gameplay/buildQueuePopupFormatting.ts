/**
 * Normalizes a build count input to the one-to-99 digits-only contract.
 *
 * Purpose: Shared sanitizer for single-hex and multi-hex build popups so count clamps cannot drift.
 * When to use: Before persisting or displaying a changed build-count field value.
 * Expected outcome: Decimal string from 1 through 99; empty/non-digits become `'1'`; values above 99 become `'99'`.
 * Exceptions: None.
 */
export function sanitizeBuildCountInputText(raw: string): string {
  const digitsOnly = raw.replaceAll(/\D/g, '').slice(0, 2);
  if (digitsOnly.length === 0) return '1';
  const parsed = parseInt(digitsOnly, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return '1';
  if (parsed > 99) return '99';
  return String(parsed);
}

/**
 * Escapes text before inserting it into build-popup HTML fragments.
 *
 * Purpose: Centralizes markup safety for single- and multi-hex popup descriptions.
 * When to use: Any derived name or identifier rendered through `innerHTML`.
 * Expected outcome: HTML metacharacters are encoded without changing ordinary text.
 * Exceptions: None.
 */
export function escapeBuildPopupHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Emphasizes headings in a semicolon-delimited strategic naming line.
 *
 * Purpose: Preserves the existing grouped naming presentation without leaving parsing in the popup controller.
 * When to use: Single-hex build popup descriptions returned by the naming tooltip API.
 * Expected outcome: Escaped HTML with text before each colon wrapped in `strong`.
 * Exceptions: Malformed groups are safely escaped and displayed unchanged.
 */
export function formatGroupedBuildNamingLineHtml(namingLine: string): string {
  const groups = namingLine
    .split(';')
    .map((group) => group.trim())
    .filter((group) => group.length > 0);
  if (groups.length === 0) return escapeBuildPopupHtml(namingLine);
  return groups.map((group) => {
    const colonIndex = group.indexOf(':');
    if (colonIndex < 0) return escapeBuildPopupHtml(group);
    const heading = group.slice(0, colonIndex).trim();
    const remainder = group.slice(colonIndex + 1).trim();
    if (!heading) return escapeBuildPopupHtml(group);
    if (!remainder) return `<strong>${escapeBuildPopupHtml(heading)}:</strong>`;
    return `<strong>${escapeBuildPopupHtml(heading)}:</strong> ${escapeBuildPopupHtml(remainder)}`;
  }).join('; ');
}
