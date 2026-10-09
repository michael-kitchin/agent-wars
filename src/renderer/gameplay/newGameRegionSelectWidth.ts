/**
 * Home-region and region dropdowns whose longest option sets the shared width.
 *
 * Purpose: Global homes and the regional map picker stay the same size as each other.
 * When to use: Measuring closed-control width. Side dropdowns are not in this list.
 * Expected outcome: Three ids, global homes first.
 * Exceptions: None.
 */
const REGION_SELECT_IDS: readonly string[] = [
  'new-game-human-region-select',
  'new-game-ai-region-select',
  'new-game-region-select',
];

/**
 * Custom property that locks every place dropdown to one closed width.
 *
 * Purpose: Side dropdowns read the same width as the region dropdowns.
 * When to use: Set on `#game-over-dialog` after the region lists are known.
 * Expected outcome: A pixel length, or unset when no region option can be measured.
 * Exceptions: None.
 */
const REGION_SELECT_WIDTH_PROPERTY = '--new-game-region-select-width';

/**
 * Gives the new-game place dropdowns one closed width.
 *
 * Purpose: Home-region, region, and side selectors otherwise follow the selected label, so a short name shrinks one control and a long side name widens another.
 * When to use: After the global home lists or the regional map list are written.
 * Expected outcome: `#game-over-dialog` sets `--new-game-region-select-width` to the widest region option. Side selectors use that width and do not grow with their own labels. An empty region list leaves the property unchanged.
 * Exceptions: None.
 */
export function syncNewGameRegionSelectWidths(): void {
  const dialog = document.getElementById('game-over-dialog');
  if (!(dialog instanceof HTMLElement)) return;
  const width = measureWidestRegionOption();
  if (width <= 0) return;
  dialog.style.setProperty(REGION_SELECT_WIDTH_PROPERTY, `${width}px`);
}

/**
 * Finds the border-box width of the widest region option.
 *
 * Purpose: A closed select may size to the selected label, so each region label is measured on its own.
 * When to use: `syncNewGameRegionSelectWidths`.
 * Expected outcome: A positive pixel width, or 0 when no region select has an option.
 * Exceptions: None.
 */
function measureWidestRegionOption(): number {
  const labels = regionOptionLabels();
  const source = metricSourceSelect();
  if (labels.length === 0 || !source) return 0;
  const probe = document.createElement('select');
  probe.tabIndex = -1;
  probe.setAttribute('aria-hidden', 'true');
  copySelectMetrics(probe, source);
  for (const label of labels) {
    const option = document.createElement('option');
    option.textContent = label;
    probe.appendChild(option);
  }
  document.body.appendChild(probe);
  try {
    let widest = 0;
    for (let index = 0; index < probe.options.length; index += 1) {
      probe.selectedIndex = index;
      widest = Math.max(widest, Math.ceil(probe.getBoundingClientRect().width));
    }
    return widest;
  } finally {
    probe.remove();
  }
}

/**
 * Collects the labels of the global and regional region dropdowns.
 *
 * Purpose: The shared width comes from region names, not from side-group names.
 * When to use: `measureWidestRegionOption`.
 * Expected outcome: Unique non-empty labels. A missing select is skipped.
 * Exceptions: None.
 */
function regionOptionLabels(): string[] {
  const labels = new Set<string>();
  for (const id of REGION_SELECT_IDS) {
    const select = document.getElementById(id);
    if (!(select instanceof HTMLSelectElement)) continue;
    for (const option of select.options) {
      const label = option.textContent ?? '';
      if (label.trim()) labels.add(label);
    }
  }
  return [...labels];
}

/**
 * Returns a region dropdown to copy metrics from.
 *
 * Purpose: The probe must use the same font, padding, and border as the dialog controls.
 * When to use: `measureWidestRegionOption`.
 * Expected outcome: A select that is currently laid out, or the first region select when every panel is hidden. Null when none of those selects are in the document.
 * Exceptions: None.
 */
function metricSourceSelect(): HTMLSelectElement | null {
  let fallback: HTMLSelectElement | null = null;
  for (const id of REGION_SELECT_IDS) {
    const select = document.getElementById(id);
    if (!(select instanceof HTMLSelectElement)) continue;
    if (!fallback) fallback = select;
    if (select.getClientRects().length > 0) return select;
  }
  return fallback;
}

/**
 * Copies the metrics that change a select's closed width.
 *
 * Purpose: The probe must match the dialog dropdowns and still size to the selected option.
 * When to use: Before appending the probe.
 * Expected outcome: Inline font, padding, and border match `source`. Width stays `max-content`.
 * Exceptions: None.
 */
function copySelectMetrics(probe: HTMLSelectElement, source: HTMLSelectElement): void {
  const style = getComputedStyle(source);
  probe.style.position = 'fixed';
  probe.style.left = '0';
  probe.style.top = '0';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style.margin = '0';
  probe.style.fontStyle = style.fontStyle;
  probe.style.fontVariant = style.fontVariant;
  probe.style.fontWeight = style.fontWeight;
  probe.style.fontStretch = style.fontStretch;
  probe.style.fontSize = style.fontSize;
  probe.style.lineHeight = style.lineHeight;
  probe.style.fontFamily = style.fontFamily;
  probe.style.letterSpacing = style.letterSpacing;
  probe.style.padding = style.padding;
  probe.style.borderWidth = style.borderWidth;
  probe.style.borderStyle = style.borderStyle;
  probe.style.boxSizing = style.boxSizing;
  probe.style.width = 'max-content';
  probe.style.minWidth = '0';
  probe.style.maxWidth = 'none';
}
