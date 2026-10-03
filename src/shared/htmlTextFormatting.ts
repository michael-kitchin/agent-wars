/**
 * Renderer-facing HTML escaping (leaf module, no imports).
 *
 * Purpose: One five-character escaper for build popups, terrain tooltips, and naming captions.
 * When to use: Renderer modules that insert GIS or naming strings into `innerHTML`.
 * Expected outcome: `& < > " '` encoded.
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
