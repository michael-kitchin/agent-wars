import { escapeHtmlText } from './htmlTextFormatting';
import { isPipelineTerrainKind, type PipelineTerrainKind } from './pipelineTerrain';
import { formatTerrainKindLabel } from './terrainKindLabel';

/**
 * CSS class for a terrain chip beside a terrain name.
 *
 * Purpose: Hex, unit, and slower tooltips share the map key's fill at the size of a country flag.
 * When to use: On every terrain swatch `<span>`.
 * Expected outcome: `terrain-swatch`, styled in `static/index.html`.
 * Exceptions: None.
 */
export const TERRAIN_SWATCH_CLASS_NAME = 'terrain-swatch';

/**
 * Display labels for the eight map-key terrain kinds.
 *
 * Purpose: Tooltip copy title-cases the kind, and the swatch has to recognize that word in a longer phrase.
 * When to use: `formatTerrainNameListHtml`.
 * Expected outcome: One entry per pipeline kind. Urban and Rubble are chipped as overlay words. Other is absent.
 * Exceptions: None.
 */
const DISPLAY_LABEL_TO_KIND: Readonly<Record<string, PipelineTerrainKind>> = Object.freeze({
  Water: 'water',
  Coastal: 'coastal',
  Wetlands: 'wetlands',
  Plains: 'plains',
  Forest: 'forest',
  Mountain: 'mountain',
  Desert: 'desert',
  Arctic: 'arctic',
});

/**
 * Reads a pipeline kind from a raw terrain string.
 *
 * Purpose: Snapshot kinds are lowercase, and a few callers pass surrounding whitespace.
 * When to use: `formatTerrainKindHtml`.
 * Expected outcome: The eight map-key kinds, or null for unknown, empty, urban, and rubble.
 * Exceptions: None.
 */
function pipelineKindFromRaw(kind: string | null | undefined): PipelineTerrainKind | null {
  if (kind == null) return null;
  const normalized = kind.trim().toLowerCase();
  return isPipelineTerrainKind(normalized) ? normalized : null;
}

/**
 * Returns the empty swatch element for one map-key kind.
 *
 * Purpose: The color is applied when the tooltip is shown, from the terrain style active at that moment.
 * When to use: Before a terrain name in tooltip HTML.
 * Expected outcome: A span whose `data-terrain-kind` is the pipeline kind. No background yet.
 * Exceptions: None.
 */
export function formatTerrainSwatchHtml(kind: PipelineTerrainKind): string {
  return `<span class="${TERRAIN_SWATCH_CLASS_NAME}" data-terrain-kind="${kind}" aria-hidden="true"></span>`;
}

/**
 * Returns the empty Urban chip.
 *
 * Purpose: Urban is a map overlay, not one of the eight terrain kinds, so it is not a pipeline kind.
 * When to use: Before the word Urban in a tooltip.
 * Expected outcome: A span whose `data-terrain-kind` is `urban`. The color is applied when the tooltip opens.
 * Exceptions: None.
 */
export function formatUrbanSwatchHtml(): string {
  return `<span class="${TERRAIN_SWATCH_CLASS_NAME}" data-terrain-kind="urban" aria-hidden="true"></span>`;
}

/**
 * Returns the empty Rubble chip.
 *
 * Purpose: Rubble is a map overlay, not one of the eight terrain kinds, so it is not a pipeline kind.
 * When to use: Before the word Rubble in a tooltip.
 * Expected outcome: A span whose `data-terrain-kind` is `rubble`. The fill and hatch are applied when the tooltip opens.
 * Exceptions: None.
 */
export function formatRubbleSwatchHtml(): string {
  return `<span class="${TERRAIN_SWATCH_CLASS_NAME}" data-terrain-kind="rubble" aria-hidden="true"></span>`;
}

/**
 * Returns the crosshatch painted over the Rubble chip.
 *
 * Purpose: Rubble and Urban share one opaque fill. The hatch is what tells the two chips apart at flag size.
 * When to use: When assigning a Rubble swatch background. Do not use this for hex fills.
 * Expected outcome: Two diagonal repeating gradients in the map hatch's dark red, opaque enough to read on an 18 by 12 chip.
 * Exceptions: None.
 */
export function rubbleSwatchBackgroundImage(): string {
  const line = 'rgba(110, 22, 18, 0.95)';
  const slash = `repeating-linear-gradient(45deg, transparent 0 2px, ${line} 2px 3px)`;
  const backslash = `repeating-linear-gradient(-45deg, transparent 0 2px, ${line} 2px 3px)`;
  return `${slash}, ${backslash}`;
}

/**
 * Returns a terrain name, with a swatch when the kind is one the map key draws.
 *
 * Purpose: Unit tooltips and single-kind hex lines share one markup rule.
 * When to use: When the whole value is one terrain kind.
 * Expected outcome: Swatch plus escaped label for a pipeline kind. `Unknown`, with no swatch, for null or an unrecognized kind.
 * Exceptions: None.
 */
export function formatTerrainKindHtml(kind: string | null | undefined): string {
  const label = formatTerrainKindLabel(kind ?? null);
  const pipeline = pipelineKindFromRaw(kind);
  if (!pipeline) return escapeHtmlText(label);
  return `${formatTerrainSwatchHtml(pipeline)}${escapeHtmlText(label)}`;
}

/**
 * Puts a swatch before each map-key terrain name in a comma-separated phrase.
 *
 * Purpose: A world hex can name several kinds, and a slower notice can name several reasons.
 * When to use: For `Plains (60%), Forest (40%)` and `Forest, Urban, Rubble`.
 * Expected outcome: A swatch before Water, Coastal, Wetlands, Plains, Forest, Mountain, Desert, Arctic, Urban, and Rubble. Other words stay text.
 * Exceptions: None.
 */
export function formatTerrainNameListHtml(text: string): string {
  return text.split(', ').map(formatTerrainNameTokenHtml).join(', ');
}

/**
 * Swatches the leading word of one comma-separated token when that word is a map-key kind.
 *
 * Purpose: Percentages and extra words stay attached to the name they follow.
 * When to use: From `formatTerrainNameListHtml`.
 * Expected outcome: `Forest (12%)` gains a forest swatch. `Rubble (2)` gains a rubble swatch and keeps the suffix. `Other (12%)` and `a<b` stay escaped text.
 * Exceptions: None.
 */
function formatTerrainNameTokenHtml(token: string): string {
  const match = /^([A-Za-z]+)([\s\S]*)$/.exec(token);
  const word = match?.[1] ?? '';
  if (match && word === 'Urban') {
    return `${formatUrbanSwatchHtml()}${escapeHtmlText(word)}${escapeHtmlText(match[2] ?? '')}`;
  }
  if (match && word === 'Rubble') {
    return `${formatRubbleSwatchHtml()}${escapeHtmlText(word)}${escapeHtmlText(match[2] ?? '')}`;
  }
  const kind = DISPLAY_LABEL_TO_KIND[word];
  if (!match || !kind) return escapeHtmlText(token);
  return `${formatTerrainSwatchHtml(kind)}${escapeHtmlText(word)}${escapeHtmlText(match[2] ?? '')}`;
}
