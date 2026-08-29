/**
 * Renderer-facing HTML escaping and grouped naming-line formatting (leaf module, no imports).
 *
 * Purpose: One five-character escaper and semicolon-group formatter for build popups and terrain tooltips.
 * When to use: Renderer modules that insert GIS or naming strings into `innerHTML`.
 * Expected outcome: `& < > " '` encoded; grouped `Heading: rest` lines wrap headings in `strong`.
 * Exceptions: None. Does not replace `escapeHtmlForOrderPreviewTooltip`, which omits `'`.
 */

/**
 * Encodes HTML metacharacters for insertion into `innerHTML`.
 *
 * Purpose: Shared markup safety for renderer-facing text.
 * When to use: Before concatenating untrusted or GIS-derived strings into HTML.
 * Expected outcome: `&`, `<`, `>`, `"`, and `'` become entities (`&#39;` for apostrophe).
 * Exceptions: None.
 */
export function escapeHtmlText(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Emphasizes headings in a semicolon-delimited naming line.
 *
 * Purpose: Shared presentation for strategic naming tooltip and build-popup copy.
 * When to use: When a naming API returns semicolon-separated `Heading: remainder` groups.
 * Expected outcome: Escaped HTML with text before each colon wrapped in `strong`, groups joined by `'; '`.
 * Exceptions: Malformed groups are escaped and displayed unchanged.
 */
export function formatGroupedSemicolonNamingLineHtml(namingLine: string): string {
  const groups = namingLine
    .split(';')
    .map((group) => group.trim())
    .filter((group) => group.length > 0);
  if (groups.length === 0) return escapeHtmlText(namingLine);
  return groups.map((group) => {
    const colonIndex = group.indexOf(':');
    if (colonIndex < 0) return escapeHtmlText(group);
    const heading = group.slice(0, colonIndex).trim();
    const remainder = group.slice(colonIndex + 1).trim();
    if (!heading) return escapeHtmlText(group);
    if (!remainder) return `<strong>${escapeHtmlText(heading)}:</strong>`;
    return `<strong>${escapeHtmlText(heading)}:</strong> ${escapeHtmlText(remainder)}`;
  }).join('; ');
}
