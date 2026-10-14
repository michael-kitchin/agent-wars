/**
 * The selection panel at the map's bottom-left: the selected units' hex, its chips, the units, and their orders.
 *
 * The panel replaces the Orders tab's "Selected unit" line. Its header keeps the id `sidebar-selected-unit`.
 */
import { isNeutralBorderHex } from '../../shared/h3Resolutions';
import { formatHexNamingCaptionHtml } from '../../shared/hexNamingCaption';
import { escapeHtmlText } from '../../shared/htmlTextFormatting';
import { orderTargetHexCode } from '../../shared/orderTargetHexCode';
import {
  buildSelectionPanelChips,
  summarizeSelectionPanel,
  type SelectionPanelChipInput,
  type SelectionPanelRow,
} from '../../shared/selectionPanelSummary';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { techLevelFromUrbanHexCount } from '../../shared/techBonusRules';
import { isEmbarkedLandUnitBlockedForSelection } from '../core/selection';
import { rendererSharedState as S } from '../core/state';
import { setUnitNameContent } from '../core/unitOriginFlags';
import { getCachedNamingLineForTarget } from '../map/terrainTooltipStrategicState';
import { baselineUrbanHexCountForStrategicHex } from '../rendererTacticalHydration';
import { paintTerrainSwatches } from '../rendering/terrainVisualStyles';
import { unitIconPathForUnitType } from '../rendering/unitDrawing';
import { onQueuedOrdersChanged, queuedOrderForUnit } from './queuedOrderRows';
import { wireSelectionPanelResize } from './selectionPanelResize';

/**
 * Renderer callbacks the panel needs.
 *
 * Purpose: Keeps the panel free of a dependency on the renderer entry module.
 * When to use: Pass to `renderSelectionPanel` and `wireSelectionPanel`.
 * Expected outcome: Names come from the shared display-name lookup.
 * Exceptions: None.
 */
export interface SelectionPanelDeps {
  /**
   * Returns a unit's display name.
   *
   * Contract: Same names the map and the stack callout show.
   * When to use: Each unit row.
   * Expected outcome: The name, or a fallback built from the id.
   * Exceptions: None.
   */
  readonly formatUnitDisplayName: (unitId: string) => string;
}

/**
 * Counts header redraws, so a slow caption lookup cannot overwrite a newer header.
 *
 * Purpose: The hex caption arrives asynchronously.
 * When to use: Incremented by `renderSelectionPanelHeader` only.
 * Expected outcome: Only the latest lookup writes the caption.
 * Exceptions: None.
 */
let headerRequestSeq = 0;

/**
 * Writes the header: the hex code in parentheses, then the hex caption once it arrives.
 *
 * Purpose: Names the hex the way the hex tooltip does.
 * When to use: From `renderSelectionPanel`.
 * Expected outcome: `#sidebar-selected-unit` shows `(D4)` at once, then `(D4)` and the caption. On the same hex the
 *   old caption stays until the new one is written, so the header does not flicker.
 * Exceptions: None; a failed lookup leaves the code alone.
 */
function renderSelectionPanelHeader(panelHex: string, battle: TacticalBattleSnapshot | null): void {
  const place = document.getElementById('sidebar-selected-unit');
  if (!place) return;
  const code = orderTargetHexCode(panelHex, battle);
  const codeHtml = code ? `<strong>(${escapeHtmlText(code)})</strong>` : '';
  const resolution = battle ? 4 : 1;
  const hexKey = `${resolution}:${panelHex}`;
  if (place.dataset.hexKey !== hexKey) {
    place.innerHTML = codeHtml;
    place.dataset.hexKey = hexKey;
  }
  const requestSeq = ++headerRequestSeq;
  void getCachedNamingLineForTarget({ h3Index: panelHex, resolution }).then((caption) => {
    if (requestSeq !== headerRequestSeq) return;
    const captionHtml = caption && caption.text.trim() !== '' ? ` ${formatHexNamingCaptionHtml(caption)}` : '';
    place.innerHTML = `${codeHtml}${captionHtml}`;
  });
}

/**
 * Gathers the chip facts for a world hex from the snapshot.
 *
 * Purpose: Uses the same sources as the hex tooltip and the top bar.
 * When to use: For the panel's hex outside a battle.
 * Expected outcome: Terrain kind, weather (present only while the weather bonus is on), the tech tier of units built
 *   there (only while the tech bonus is on), the production per turn (none on the neutral border), and the home side.
 * Exceptions: None.
 */
function worldChipInput(hex: string): SelectionPanelChipInput {
  const state = S.gameState;
  const row = state?.hexes.find((h) => h.h3Index === hex);
  const baselineUrban = baselineUrbanHexCountForStrategicHex(hex);
  const urban = state?.strategicInfrastructure?.find((r) => r.h3Index === hex)?.urbanHexCount ?? 0;
  const homeSide = state?.humanHomeRegionHexes?.includes(hex)
    ? 'human'
    : state?.aiHomeRegionHexes?.includes(hex)
      ? 'opponent'
      : null;
  return {
    terrainKind: row?.terrainKind ?? null,
    weather: row?.weather ?? null,
    techLevel: state?.techBonusEnabled === true && baselineUrban > 0 ? techLevelFromUrbanHexCount(baselineUrban) : null,
    productionPerTurn: isNeutralBorderHex(hex) ? null : Math.max(0, Math.trunc(urban)),
    homeSide,
  };
}

/**
 * Gathers the chip facts for a battle cell.
 *
 * Purpose: A battle cell has its own terrain and the battle's weather; production, tech, and home belong to world hexes.
 * When to use: For the panel's cell during a battle.
 * Expected outcome: The cell's terrain kind (the battle hex's kind when the cell has none) and, while the weather bonus
 *   is on, the battle's weather.
 * Exceptions: None.
 */
function battleChipInput(cell: string, battle: TacticalBattleSnapshot): SelectionPanelChipInput {
  return {
    terrainKind: battle.tacticalTerrainKindByH3?.[cell] ?? battle.strategicHexTerrainKind ?? null,
    weather: battle.weatherBonusEnabled === true ? battle.weather ?? null : null,
    techLevel: null,
    productionPerTurn: null,
    homeSide: null,
  };
}

/**
 * Writes the chips for the panel's hex.
 *
 * Purpose: Shows the hex's facts in short form.
 * When to use: From `renderSelectionPanel`.
 * Expected outcome: `#selection-panel-chips` holds one chip per known fact, with terrain swatches painted.
 * Exceptions: None.
 */
function renderSelectionPanelChips(panelHex: string, battle: TacticalBattleSnapshot | null): void {
  const host = document.getElementById('selection-panel-chips');
  if (!host) return;
  const chips = buildSelectionPanelChips(battle ? battleChipInput(panelHex, battle) : worldChipInput(panelHex));
  host.replaceChildren(
    ...chips.map((chip) => {
      const span = document.createElement('span');
      span.className = `selection-panel-chip selection-panel-chip-${chip.kind}`;
      span.innerHTML = chip.html;
      return span;
    })
  );
  paintTerrainSwatches(host);
}

/**
 * Builds a unit row's order chip: the order's line and a cancel ×, or "No orders".
 *
 * Purpose: Shows each selected unit's queued order with the Orders tab's wording.
 * When to use: For each unit row.
 * Expected outcome: The × cancels the order exactly as the Orders tab's × does.
 * Exceptions: None.
 */
function createOrderChip(unitId: string, unitName: string): HTMLElement {
  const chip = document.createElement('span');
  const order = queuedOrderForUnit(unitId);
  if (!order) {
    chip.className = 'selection-panel-order selection-panel-order-none';
    chip.textContent = 'No orders';
    return chip;
  }
  chip.className = 'selection-panel-order';
  const detail = document.createElement('span');
  detail.textContent = order.detail;
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'selection-panel-order-cancel';
  cancel.setAttribute('aria-label', `Cancel the order for ${unitName}`);
  cancel.textContent = '×';
  cancel.addEventListener('click', order.cancel);
  chip.append(detail, cancel);
  return chip;
}

/**
 * Builds one unit row: the type token, the flag and name, the unit's hex when it differs, and the order chip.
 *
 * Purpose: Lists each selected unit with its order.
 * When to use: From `renderSelectionPanel`, once per row.
 * Expected outcome: An unattached list item.
 * Exceptions: None.
 */
function createUnitRow(row: SelectionPanelRow, battle: TacticalBattleSnapshot | null, deps: SelectionPanelDeps): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'selection-panel-unit';
  item.dataset.unitId = row.unitId;
  const token = document.createElement('img');
  token.className = 'selection-panel-unit-type';
  token.src = unitIconPathForUnitType(row.unitType);
  token.alt = '';
  const unitName = deps.formatUnitDisplayName(row.unitId);
  const name = document.createElement('span');
  name.className = 'selection-panel-unit-name';
  setUnitNameContent(name, row.unitId, unitName);
  item.append(token, name);
  if (!row.inPanelHex) {
    const where = document.createElement('span');
    where.className = 'selection-panel-unit-hex';
    where.textContent = `(${orderTargetHexCode(row.h3Index, battle) ?? '?'})`;
    item.append(where);
  }
  item.append(createOrderChip(row.unitId, unitName));
  return item;
}

/**
 * Redraws the selection panel from the current selection, units, and orders.
 *
 * Purpose: The panel follows every selection change on the map, in the stack callout, and in the Orders tab.
 * When to use: From `updateSidebar` after any selection change or snapshot, and whenever the queued orders change.
 * Expected outcome: Hidden when no selected unit exists. Otherwise the header, chips, count line, and one row per
 *   selected unit describe the first selected unit's hex. During a battle the panel describes battle cells.
 * Exceptions: None; missing elements are skipped.
 */
export function renderSelectionPanel(deps: SelectionPanelDeps): void {
  const panel = document.getElementById('selection-panel');
  if (!panel) return;
  const battle = S.tacticalBattleSnapshot;
  const units = battle ? battle.subUnits : S.gameState?.units ?? [];
  const summary = summarizeSelectionPanel(S.selectedUnitIds, units, (unitId) => !isEmbarkedLandUnitBlockedForSelection(unitId));
  panel.hidden = summary === null;
  if (!summary) return;
  renderSelectionPanelHeader(summary.panelHex, battle);
  renderSelectionPanelChips(summary.panelHex, battle);
  const count = document.getElementById('selection-panel-count');
  if (count) count.textContent = summary.countText;
  const list = document.getElementById('selection-panel-units');
  list?.replaceChildren(...summary.rows.map((row) => createUnitRow(row, battle, deps)));
}

/**
 * Keeps the panel's order chips in step with the Orders tab, and wires its resize grip.
 *
 * Purpose: A queued or cancelled order changes the panel without a selection change.
 * When to use: Once during renderer startup.
 * Expected outcome: The panel redraws after every change to the queued orders, and its grip resizes it.
 * Exceptions: None.
 */
export function wireSelectionPanel(deps: SelectionPanelDeps): void {
  onQueuedOrdersChanged(() => renderSelectionPanel(deps));
  wireSelectionPanelResize();
}
