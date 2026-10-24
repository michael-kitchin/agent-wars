/**
 * What the selection panel lists: the hex it describes, its count line, its unit rows, and its chips.
 *
 * Purpose: The panel's rules are easy to get wrong in DOM code, so they live here as pure functions with tests.
 * When to use: From the renderer's selection panel each time the selection, the units, or the orders change.
 * Expected outcome: Plain data and HTML strings; nothing touches the page.
 * Exceptions: None.
 */
import { escapeHtmlText } from './htmlTextFormatting';
import { formatTechTierHtml } from './featureIconHtml';
import type { TechLevel } from './techBonusTypes';
import { formatTerrainKindHtml } from './terrainSwatchHtml';
import type { WeatherState } from './weatherBonusTypes';
import { formatWeatherIconHtml } from './weatherIcons';
import { HUMAN_SEAT_ID } from './seatIds';

/**
 * One unit the panel may describe: a strategic unit, or a battle sub-unit during a battle.
 *
 * Purpose: Strategic units and battle sub-units share these fields.
 * When to use: Pass `state.units` on the world map and `battle.subUnits` in a battle.
 * Expected outcome: Only these fields are read.
 * Exceptions: None.
 */
export interface SelectionPanelUnitInput {
  /**
   * The unit's id.
   *
   * Contract: Unique within the list passed in.
   * When to use: Always.
   * Expected outcome: Matched against the selected ids.
   * Exceptions: None.
   */
  readonly id: string;
  /**
   * The unit's type, such as `armor`.
   *
   * Contract: One of the game's unit types.
   * When to use: Always.
   * Expected outcome: Chooses the row's type token.
   * Exceptions: None.
   */
  readonly unitType: string;
  /**
   * The hex or battle cell the unit stands in.
   *
   * Contract: An H3 index.
   * When to use: Always.
   * Expected outcome: Decides which hex the panel describes and which rows show another hex's code.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Which side owns the unit.
   *
   * Contract: `human` for the player's units.
   * When to use: Always.
   * Expected outcome: Only the player's units count toward the panel's total.
   * Exceptions: None.
   */
  readonly player: string;
}

/**
 * One row of the panel's unit list.
 *
 * Purpose: Says which unit the row shows and whether it stands in the hex the panel describes.
 * When to use: Returned by `summarizeSelectionPanel`.
 * Expected outcome: One row per selected unit, in selection order.
 * Exceptions: None.
 */
export interface SelectionPanelRow {
  /**
   * The selected unit's id.
   *
   * Contract: One of the selected ids.
   * When to use: Name, flag, and order lookups.
   * Expected outcome: Unique within the rows.
   * Exceptions: None.
   */
  readonly unitId: string;
  /**
   * The unit's type.
   *
   * Contract: Copied from the unit.
   * When to use: The row's type token.
   * Expected outcome: For example `infantry`.
   * Exceptions: None.
   */
  readonly unitType: string;
  /**
   * The hex or cell the unit stands in.
   *
   * Contract: Copied from the unit.
   * When to use: The code shown after the name when `inPanelHex` is false.
   * Expected outcome: An H3 index.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Whether the unit stands in the hex the panel describes.
   *
   * Contract: True for the first selected unit.
   * When to use: Deciding whether to show the unit's own hex code.
   * Expected outcome: False marks a unit selected in another hex.
   * Exceptions: None.
   */
  readonly inPanelHex: boolean;
}

/**
 * The panel's hex, count line, and rows.
 *
 * Purpose: One value the renderer draws from.
 * When to use: Returned by `summarizeSelectionPanel`.
 * Expected outcome: Null from that function means the panel hides.
 * Exceptions: None.
 */
export interface SelectionPanelSummary {
  /**
   * The hex or cell of the first selected unit, which the header and chips describe.
   *
   * Contract: An H3 index.
   * When to use: The header's code and caption, and the chips.
   * Expected outcome: The first selected unit's hex.
   * Exceptions: None.
   */
  readonly panelHex: string;
  /**
   * The count line, such as `3 selected of 3`.
   *
   * Contract: Counts only units in `panelHex`.
   * When to use: Shown above the rows.
   * Expected outcome: Selected units there, out of the player's selectable units there.
   * Exceptions: None.
   */
  readonly countText: string;
  /**
   * One row per selected unit that still exists, in selection order.
   *
   * Contract: Never empty.
   * When to use: The unit list.
   * Expected outcome: See `SelectionPanelRow`.
   * Exceptions: None.
   */
  readonly rows: readonly SelectionPanelRow[];
}

/**
 * Works out what the selection panel shows for the current selection.
 *
 * Purpose: The panel describes the first selected unit's hex and lists every selected unit.
 * When to use: Each time the panel is drawn. `isSelectable` says whether a unit can be selected now; embarked land
 *   units cannot.
 * Expected outcome: Null when no selected id matches a unit. Otherwise the first selected unit's hex, the count line
 *   "N selected of M" (N: selected units in that hex; M: the player's selectable units there), and the rows.
 * Exceptions: None.
 */
export function summarizeSelectionPanel(
  selectedIds: readonly string[],
  units: readonly SelectionPanelUnitInput[],
  isSelectable: (unitId: string) => boolean
): SelectionPanelSummary | null {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const selected = selectedIds.map((id) => byId.get(id)).filter((unit): unit is SelectionPanelUnitInput => unit !== undefined);
  if (selected.length === 0) return null;
  const panelHex = selected[0].h3Index;
  const selectedHere = selected.filter((unit) => unit.h3Index === panelHex).length;
  const selectableHere = units.filter((unit) => unit.h3Index === panelHex && unit.player === HUMAN_SEAT_ID && isSelectable(unit.id)).length;
  return {
    panelHex,
    countText: `${selectedHere} selected of ${Math.max(selectableHere, selectedHere)}`,
    rows: selected.map((unit) => ({
      unitId: unit.id,
      unitType: unit.unitType,
      h3Index: unit.h3Index,
      inPanelHex: unit.h3Index === panelHex,
    })),
  };
}

/**
 * What the panel's chips describe about its hex.
 *
 * Purpose: The renderer gathers these from the snapshot; this file decides which chips show and how they read.
 * When to use: The argument of `buildSelectionPanelChips`.
 * Expected outcome: A null field shows no chip.
 * Exceptions: None.
 */
export interface SelectionPanelChipInput {
  /**
   * The hex's terrain kind, such as `wetlands`.
   *
   * Contract: Null when unknown.
   * When to use: Always.
   * Expected outcome: A terrain chip with the map key's swatch.
   * Exceptions: None.
   */
  readonly terrainKind: string | null;
  /**
   * The hex's weather.
   *
   * Contract: Null while the weather bonus is off or the weather is not known.
   * When to use: Always.
   * Expected outcome: A weather chip with its icon.
   * Exceptions: None.
   */
  readonly weather: WeatherState | null;
  /**
   * The tech tier of units built in the hex.
   *
   * Contract: Null while the tech bonus is off, in a battle, or when the hex builds nothing.
   * When to use: Always.
   * Expected outcome: A Basic or Advanced chip with its icon.
   * Exceptions: None.
   */
  readonly techLevel: TechLevel | null;
  /**
   * The production the hex adds each turn.
   *
   * Contract: Null or zero shows no chip.
   * When to use: World hexes with urban cells, off the neutral border.
   * Expected outcome: A chip such as `$94/turn`.
   * Exceptions: None.
   */
  readonly productionPerTurn: number | null;
  /**
   * The home or Neutral chip, already worded.
   *
   * Contract: Null outside a home and off Neutral land, and in a battle.
   * When to use: Always. Build it with `formatHomeChip`.
   * Expected outcome: A `Home`, `{short name} home`, or `Neutral` chip.
   * Exceptions: None.
   */
  readonly homeChip: { readonly kind: 'home' | 'enemy-home'; readonly text: string } | null;
}

/**
 * One chip: what it describes, and its HTML.
 *
 * Purpose: The kind lets the stylesheet mark the home chips by side.
 * When to use: Returned by `buildSelectionPanelChips`.
 * Expected outcome: `html` is safe to assign as inner HTML.
 * Exceptions: None.
 */
export interface SelectionPanelChip {
  /**
   * Which fact the chip shows.
   *
   * Contract: `home` and `enemy-home` are the two home chips.
   * When to use: The chip's class name.
   * Expected outcome: For example `production`.
   * Exceptions: None.
   */
  readonly kind: 'terrain' | 'weather' | 'tech' | 'production' | 'home' | 'enemy-home';
  /**
   * The chip's content.
   *
   * Contract: Escaped HTML; swatches and icons come from the shared tooltip helpers.
   * When to use: Assign as the chip's inner HTML.
   * Expected outcome: Matches the words the hex tooltip uses.
   * Exceptions: None.
   */
  readonly html: string;
}

/**
 * Builds the panel's chips in display order: terrain, weather, tech, production, then home.
 *
 * Purpose: The panel shows the same facts as the hex tooltip, in short form.
 * When to use: Each time the panel's hex or the snapshot changes.
 * Expected outcome: One chip per known fact; unknown facts are left out.
 * Exceptions: None.
 */
export function buildSelectionPanelChips(input: SelectionPanelChipInput): SelectionPanelChip[] {
  const chips: SelectionPanelChip[] = [];
  if (input.terrainKind) chips.push({ kind: 'terrain', html: formatTerrainKindHtml(input.terrainKind) });
  if (input.weather) chips.push({ kind: 'weather', html: formatWeatherIconHtml(input.weather) });
  if (input.techLevel) chips.push({ kind: 'tech', html: formatTechTierHtml(input.techLevel) });
  if (input.productionPerTurn != null && input.productionPerTurn > 0) {
    chips.push({ kind: 'production', html: escapeHtmlText(`$${input.productionPerTurn.toLocaleString('en-US')}/turn`) });
  }
  if (input.homeChip) {
    chips.push({ kind: input.homeChip.kind, html: escapeHtmlText(input.homeChip.text) });
  }
  return chips;
}
