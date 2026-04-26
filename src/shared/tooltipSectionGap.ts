/**
 * Shared HTML fragment between stacked tooltip sections (matches hex operational tooltip spacing).
 *
 * Purpose: Keeps `#hex-tooltip`, order-preview tooltips, and any future multi-line map transients visually aligned.
 * When to use: Join primary block lines in `formatTerrainTooltipHtml` and order-preview impact HTML builders.
 * Expected outcome: One `<br/>` plus a half-em spacer block between logical sections.
 * Exceptions: None; static trusted markup only.
 */
export const TOOLTIP_SECTION_GAP_HTML = '<br/><span style="display:block;height:0.5em"></span>';
