/**
 * The selection panel at the map's bottom-left: a summary bar with the selection's hex and count, a hint, and Ranged or
 * Strike, then the hex's caption and chips, the units, and their orders.
 *
 * The panel replaces the Orders tab's "Selected unit" line. The bar's first line keeps the id `sidebar-selected-unit`.
 */
import { isNeutralBorderHex } from '../../shared/h3Resolutions';
import { observeModeControls } from '../../shared/observeModeControls';
import { formatHexNamingCaptionHtml } from '../../shared/hexNamingCaption';
import { orderTargetHexCode } from '../../shared/orderTargetHexCode';
import { selectionElsewhereText } from '../../shared/selectionBarText';
import {
  buildSelectionPanelChips,
  summarizeSelectionPanel,
  type SelectionPanelChipInput,
  type SelectionPanelRow,
  type SelectionPanelSummary,
} from '../../shared/selectionPanelSummary';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { formatHomeChip, homeSeatIdsAtHex, viewerSeatIdForRoster } from '../../shared/sideLabels';
import { techLevelFromUrbanHexCount } from '../../shared/techBonusRules';
import { isEmbarkedLandUnitBlockedForSelection } from '../core/selection';
import { rendererSharedState as S } from '../core/state';
import { setUnitNameContent } from '../core/unitOriginFlags';
import { getCachedNamingLineForTarget } from '../map/terrainTooltipStrategicState';
import { baselineUrbanHexCountForStrategicHex } from '../rendererTacticalHydration';
import { paintTerrainSwatches } from '../rendering/terrainVisualStyles';
import { unitIconPathForUnitType } from '../rendering/unitDrawing';
import { onQueuedOrdersChanged, queuedOrderForUnit } from './queuedOrderRows';
import { renderSelectionBarState } from './selectionBar';
import {
  createMercenaryDismissCell,
  forgetDismissArmedExcept,
  selectionRowDismissShown,
} from './selectionPanelDismiss';
import { settleSelectionPanelSlide, wireSelectionPanelExpand } from './selectionPanelExpand';
import { wireSelectionPanelResize } from './selectionPanelResize';

/**
 * Renderer callbacks the panel needs.
 *
 * Purpose: Keeps the panel free of a dependency on the renderer entry module.
 * When to use: Pass once to `wireSelectionPanel`.
 * Expected outcome: Names, the dismiss toast, the snapshot reload, a map redraw, and a panel redraw.
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
  /**
   * Shows a short message on the map.
   *
   * Contract: `isError` styles a dismiss refusal.
   * When to use: A refused or thrown dismiss.
   * Expected outcome: The sentence stays up the way other map toasts do.
   * Exceptions: None.
   */
  readonly showMapToast: (message: string, options?: { readonly isError?: boolean }) => void;
  /**
   * Reloads the match after a dismiss that already succeeded.
   *
   * Contract: Resolves after the snapshot is applied, or after a logged failure.
   * When to use: From the dismiss confirm path only.
   * Expected outcome: The treasury, the tokens, an open Hire tab, and an open stack list match the board.
   * Exceptions: None. A failed reload does not reject.
   */
  readonly reloadAfterDismiss: () => Promise<void>;
  /**
   * Paints the map after a successful dismiss updates the selection.
   *
   * Contract: The same map paint the snapshot uses, run again after the selected hex moves or clears.
   * When to use: From the dismiss confirm path, after `removeUnitsFromSelection`.
   * Expected outcome: The highlighted hex matches the selection that remains.
   * Exceptions: None.
   */
  readonly redrawMap: () => void;
  /**
   * Draws the selection panel again from the stored deps.
   *
   * Contract: Calls `renderSelectionPanel`.
   * When to use: After the dismiss buttons change which row is armed or in flight.
   * Expected outcome: The panel matches the current selection and armed rows.
   * Exceptions: None.
   */
  readonly redrawSelectionPanel: () => void;
}

/**
 * Deps from the one `wireSelectionPanel` call.
 *
 * Purpose: Later redraws, including the sidebar, must not pass a new deps object.
 * When to use: `renderSelectionPanel`. Null until the panel is wired.
 * Expected outcome: The wiring callbacks, or null when a redraw arrives first.
 * Exceptions: None.
 */
let selectionPanelDeps: SelectionPanelDeps | null = null;

/**
 * Counts caption lookups, so a slow lookup cannot overwrite a newer caption.
 *
 * Purpose: The hex caption arrives asynchronously.
 * When to use: Incremented by `renderSelectionPanelCaption` only.
 * Expected outcome: Only the latest lookup writes the caption.
 * Exceptions: None.
 */
let captionRequestSeq = 0;

/**
 * Writes the bar's first line: the hex code in parentheses, then the count, or the unit's flag and name when one unit
 * is selected, then how many selected units stand in other hexes.
 *
 * Purpose: Says where the selection is and what it holds, even while the details are hidden.
 * When to use: From `renderSelectionPanel`.
 * Expected outcome: `#sidebar-selected-unit` reads like "(D4) · 3 selected of 3", "(D3) · 2nd Squadron" with the
 *   unit's flag, or "(D4) · 2 selected of 3 · +1 elsewhere". In a battle the code names the battle cell, such as
 *   "(E8.K3)". A code that cannot be found shows "?".
 * Exceptions: None.
 */
function renderSelectionPanelSummaryLine(
  summary: SelectionPanelSummary,
  battle: TacticalBattleSnapshot | null,
  deps: SelectionPanelDeps
): void {
  const line = document.getElementById('sidebar-selected-unit');
  if (!line) return;
  const code = document.createElement('strong');
  code.textContent = `(${orderTargetHexCode(summary.panelHex, battle) ?? '?'})`;
  const what = document.createElement('span');
  if (summary.rows.length === 1) {
    const unitId = summary.rows[0].unitId;
    setUnitNameContent(what, unitId, deps.formatUnitDisplayName(unitId));
  } else {
    what.textContent = summary.countText;
  }
  line.replaceChildren(code, ' · ', what);
  const elsewhere = selectionElsewhereText(summary.rows);
  if (elsewhere) line.append(` · ${elsewhere}`);
}

/**
 * Writes the hex's caption at the top of the details once it arrives.
 *
 * Purpose: Names the hex the way the hex tooltip does.
 * When to use: From `renderSelectionPanel`.
 * Expected outcome: `#selection-panel-caption` empties when the hex changes, then shows the caption with its flags. On
 *   the same hex the old caption stays until the new one is written, so it does not flicker.
 * Exceptions: None; a failed lookup leaves the caption as it was.
 */
function renderSelectionPanelCaption(panelHex: string, battle: TacticalBattleSnapshot | null): void {
  const caption = document.getElementById('selection-panel-caption');
  if (!caption) return;
  const resolution = battle ? 4 : 1;
  const hexKey = `${resolution}:${panelHex}`;
  if (caption.dataset.hexKey !== hexKey) {
    caption.replaceChildren();
    caption.dataset.hexKey = hexKey;
  }
  const requestSeq = ++captionRequestSeq;
  void getCachedNamingLineForTarget({ h3Index: panelHex, resolution }).then((line) => {
    if (requestSeq !== captionRequestSeq) return;
    caption.innerHTML = line && line.text.trim() !== '' ? formatHexNamingCaptionHtml(line) : '';
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
  const seats = state?.seats ?? [];
  const controller = state?.strategicControl?.find((row) => row.h3Index === hex)?.controllerPlayerId ?? null;
  return {
    terrainKind: row?.terrainKind ?? null,
    weather: row?.weather ?? null,
    techLevel: state?.techBonusEnabled === true && baselineUrban > 0 ? techLevelFromUrbanHexCount(baselineUrban) : null,
    productionPerTurn: isNeutralBorderHex(hex) ? null : Math.max(0, Math.trunc(urban)),
    homeChip: state
      ? formatHomeChip({
          homeSeatIds: homeSeatIdsAtHex(hex, state),
          controllerId: controller,
          viewerSeatId: viewerSeatIdForRoster(seats),
          seats,
        })
      : null,
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
    homeChip: null,
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
 * Expected outcome: An unattached list item. When `dismissColumn` is set, the hex code sits in the name cell and a
 *   dismiss cell follows it. Otherwise the row stays the type token, the name, the hex code when it differs, and the order chip.
 * Exceptions: None.
 */
function createUnitRow(
  row: SelectionPanelRow,
  battle: TacticalBattleSnapshot | null,
  deps: SelectionPanelDeps,
  dismissColumn: boolean
): HTMLLIElement {
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
    if (dismissColumn) name.append(where);
    else item.append(where);
  }
  if (dismissColumn) item.append(createMercenaryDismissCell(row, unitName, deps));
  item.append(createOrderChip(row.unitId, unitName));
  return item;
}

/**
 * Shows the clicked hex without its units.
 *
 * Purpose: A watch can inspect a hex and cannot select a unit.
 * When to use: `renderSelectionPanel` while `hexOnlySelection` is set.
 * Expected outcome: The bar names the hex code. The caption and chips describe the hex. The unit list is empty.
 *   No hex hides the panel.
 * Exceptions: None. Missing elements are skipped.
 */
function renderObservedHexPanel(panel: HTMLElement): void {
  const hex = S.selectedHexIndex;
  panel.hidden = hex == null;
  if (!hex) {
    document.getElementById('selection-panel-units')?.classList.remove('selection-panel-units-dismiss');
    forgetDismissArmedExcept([]);
    settleSelectionPanelSlide();
    return;
  }
  const line = document.getElementById('sidebar-selected-unit');
  if (line) {
    const code = document.createElement('strong');
    code.textContent = `(${orderTargetHexCode(hex, null) ?? '?'})`;
    line.replaceChildren(code);
  }
  renderSelectionPanelCaption(hex, null);
  renderSelectionPanelChips(hex, null);
  const list = document.getElementById('selection-panel-units');
  list?.classList.remove('selection-panel-units-dismiss');
  list?.replaceChildren();
  forgetDismissArmedExcept([]);
  const hint = document.getElementById('selection-panel-hint');
  if (hint) hint.textContent = '';
}

/**
 * Redraws the selection panel from the current selection, units, and orders.
 *
 * Purpose: The panel follows every selection change on the map, in the stack callout, and in the Orders tab.
 * When to use: From `updateSidebar` after any selection change or snapshot, and whenever the queued orders change.
 * Expected outcome: Hidden when no selected unit exists, with any slide between its states settled. Otherwise the bar's
 *   first line, the caption, the chips, and one row per selected unit describe the first selected unit's hex, and the
 *   bar's hint and border follow targeting and playback. A selection that includes a dismissable mercenary aligns a
 *   dismiss column. During a battle the panel describes battle cells. A call before `wireSelectionPanel` changes nothing.
 * Exceptions: None; missing elements are skipped.
 */
export function renderSelectionPanel(): void {
  const deps = selectionPanelDeps;
  if (!deps) return;
  const panel = document.getElementById('selection-panel');
  if (!panel) return;
  if (observeModeControls(S.gameState?.seats ?? []).hexOnlySelection) {
    renderObservedHexPanel(panel);
    return;
  }
  const battle = S.tacticalBattleSnapshot;
  const units = battle ? battle.subUnits : S.gameState?.units ?? [];
  const summary = summarizeSelectionPanel(S.selectedUnitIds, units, (unitId) => !isEmbarkedLandUnitBlockedForSelection(unitId));
  panel.hidden = summary === null;
  if (!summary) {
    const list = document.getElementById('selection-panel-units');
    list?.classList.remove('selection-panel-units-dismiss');
    forgetDismissArmedExcept([]);
    settleSelectionPanelSlide();
    return;
  }
  renderSelectionPanelSummaryLine(summary, battle, deps);
  renderSelectionPanelCaption(summary.panelHex, battle);
  renderSelectionPanelChips(summary.panelHex, battle);
  const dismissUnitIds = summary.rows.filter((row) => selectionRowDismissShown(row)).map((row) => row.unitId);
  const dismissColumn = dismissUnitIds.length > 0;
  const list = document.getElementById('selection-panel-units');
  list?.classList.toggle('selection-panel-units-dismiss', dismissColumn);
  list?.replaceChildren(...summary.rows.map((row) => createUnitRow(row, battle, deps, dismissColumn)));
  forgetDismissArmedExcept(dismissUnitIds);
  renderSelectionBarState();
}

/**
 * Keeps the panel's order chips in step with the Orders tab, and wires its expand control and resize grip.
 *
 * Purpose: A queued or cancelled order changes the panel without a selection change.
 * When to use: Once during renderer startup.
 * Expected outcome: The panel redraws after every change to the queued orders, opens compact, expands and collapses
 *   from its expand control, and resizes from its grip while expanded.
 * Exceptions: None.
 */
export function wireSelectionPanel(deps: SelectionPanelDeps): void {
  selectionPanelDeps = deps;
  onQueuedOrdersChanged(() => renderSelectionPanel());
  wireSelectionPanelExpand();
  wireSelectionPanelResize();
}
