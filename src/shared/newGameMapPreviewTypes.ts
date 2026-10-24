import type { BonusLevel } from './bonusLevel';
import type { SeatId } from './seatIds';
import type { HomeRegionOwnerIdentity } from './homeRegionRules';
import type { MapExtentBox } from './mapExtent';
import type { WeatherState } from './weatherBonusTypes';

/**
 * What the new-game dialog is asking the map to preview.
 *
 * Purpose: Global and Regional send different ids, and the builder must not guess which tab is showing.
 * When to use: The argument to `buildNewGameMapPreview` and the IPC payload.
 * Expected outcome: `scope` selects one branch. The other branch's fields are absent.
 * Exceptions: None.
 */
export type NewGameMapPreviewRequest =
  | {
      /**
       * Selects the world map.
       *
       * Contract: Always `global` on this branch.
       * When to use: The Global tab.
       * Expected outcome: The builder uses resolution 1 and the world extent.
       * Exceptions: None.
       */
      readonly scope: 'global';
      /**
       * Homes in side-row order.
       *
       * Contract: UN subregion names. Empty entries are allowed and outline nothing.
       * When to use: The new-game screen.
       * Expected outcome: One home list per entry, in the same order.
       * Exceptions: None.
       */
      readonly homeKeys?: readonly string[];
    }
  | {
      /**
       * Selects one extracted region.
       *
       * Contract: Always `regional` on this branch.
       * When to use: The Regional tab.
       * Expected outcome: The builder uses that pack's resolution and footprint.
       * Exceptions: None.
       */
      readonly scope: 'regional';
      /**
       * Regional pack id.
       *
       * Contract: A catalog id, not `global`.
       * When to use: The region combo value.
       * Expected outcome: The manifest and terrain files for that folder.
       * Exceptions: None.
       */
      readonly gameMapId: string;
      /**
       * Homes in side-row order.
       *
       * Contract: Side-group ids on that manifest. Empty entries are allowed and outline nothing.
       * When to use: The new-game screen.
       * Expected outcome: One home list per entry, in the same order.
       * Exceptions: None.
       */
      readonly homeKeys?: readonly string[];
    };

/**
 * One strategic hex the preview can paint.
 *
 * Purpose: Terrain fill and the twelve-month weather travel together so a month change does not reload the grid.
 * When to use: Each entry of `NewGameMapPreview.hexes`.
 * Expected outcome: `terrainKind` is a pipeline kind. `weatherByMonth` has twelve display states.
 * Exceptions: None.
 */
export interface NewGameMapPreviewHex {
  /**
   * Strategic H3 index.
   *
   * Contract: Resolution matches `NewGameMapPreview.strategicResolution`.
   * When to use: Projecting the hex and joining home lists.
   * Expected outcome: A non-empty H3 string.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Dominant terrain kind, the same kind a started match stores for this hex.
   *
   * Contract: A pipeline terrain kind.
   * When to use: `fillHexTerrain`.
   * Expected outcome: The kind the classification cache would write for this cell.
   * Exceptions: None.
   */
  readonly terrainKind: string;
  /**
   * Display weather for January through December.
   *
   * Contract: Length 12. Index 0 is January. Values are `mild`, `rain`, `snow`, or `heat`.
   * When to use: `previewWeatherIcon` with the selected start month.
   * Expected outcome: The pack's year, or twelve mild months when the pack has no row.
   * Exceptions: None.
   */
  readonly weatherByMonth: readonly WeatherState[];
  /**
   * Generated urban tactical cells inside this hex.
   *
   * Contract: Zero when the hex has no urban child at the preview map's scalerank. The count does not follow the loaded match.
   * When to use: `previewTechIcon` with this map's Advanced threshold.
   * Expected outcome: The same baseline a started match on this map would store.
   * Exceptions: None.
   */
  readonly baselineUrbanHexCount: number;
}

/**
 * The grid, homes, and extent for the dialog's current map.
 *
 * Purpose: The renderer paints this instead of the loaded match while the new-game overlay is open.
 * When to use: The result of `buildNewGameMapPreview`.
 * Expected outcome: Hexes cover that map. Home lists are the two selected areas, and may overlap.
 * Exceptions: None.
 */
export interface NewGameMapPreview {
  /**
   * Map the hexes belong to.
   *
   * Contract: `global` or a regional pack id.
   * When to use: Dropping a payload after the player switches maps.
   * Expected outcome: Matches the request that built it.
   * Exceptions: None.
   */
  readonly gameMapId: string;
  /**
   * H3 resolution of every hex in `hexes`.
   *
   * Contract: 1 on the world map. 2 or 3 on a regional pack.
   * When to use: Checking that the grid is the strategic grid, not the battle grid.
   * Expected outcome: The map's strategic resolution.
   * Exceptions: None.
   */
  readonly strategicResolution: number;
  /**
   * Urban-cell count that makes a hex Advanced on this map.
   *
   * Contract: 21 on the world map. The catalog threshold on a regional pack.
   * When to use: `previewTechIcon`. Do not use the loaded match's threshold.
   * Expected outcome: A count at or above this number is Advanced. A smaller positive count is Basic.
   * Exceptions: None.
   */
  readonly advancedMinUrbanCells: number;
  /**
   * Camera and pan limit for this map.
   *
   * Contract: `'world'` frames the Mercator world. A box frames that region's hexes.
   * When to use: `applyLoadedMapExtent`.
   * Expected outcome: The same extent a started match on this map uses.
   * Exceptions: None.
   */
  readonly extent: 'world' | MapExtentBox;
  /**
   * Strategic hexes in stable order.
   *
   * Contract: Every cell of the footprint, including sea and neutral border on a region.
   * When to use: The preview draw loop.
   * Expected outcome: Non-empty for a known map.
   * Exceptions: None.
   */
  readonly hexes: readonly NewGameMapPreviewHex[];
  /**
   * Home hexes in side-row order.
   *
   * Contract: One list per requested home.
   * When to use: Coloring each preview ring by seat order.
   * Expected outcome: Lists may overlap. An unknown or empty home is an empty list.
   * Exceptions: None.
   */
  readonly homeRegionHexesBySeatOrder: readonly (readonly string[])[];
}

/**
 * How one preview hex's home border should be colored.
 *
 * Purpose: Exclusive homes look controlled by that side. Shared homes use the gray overlap rings.
 * When to use: The result of `previewHomeBorder`, passed to the ownership-border drawer.
 * Expected outcome: A null identity means the hex is not a home. A regional preview then keeps the plain grid stroke. A global preview does not draw that hex's terrain or grid. Weather and tech icons still follow the preview rules.
 * Exceptions: None.
 */
export interface PreviewHomeBorder {
  /**
   * Side treated as the current controller.
   *
   * Contract: The exclusive owner, or null when the hex is shared or not a home.
   * When to use: The solid outer ring.
   * Expected outcome: Null paints the neutral gray outer ring on a home hex.
   * Exceptions: None.
   */
  readonly controllerPlayerId: SeatId | null;
  /**
   * Declared home owner for the dashed inner ring.
   *
   * Contract: One seat, shared when the hex is in both homes, or null when it is in neither.
   * When to use: The ownership drawer. Do not resolve the identity again.
   * Expected outcome: A shared home paints the mixed-stack stroke on the inner ring.
   * Exceptions: None.
   */
  readonly homeOwnerIdentity: HomeRegionOwnerIdentity;
}

/**
 * Facts that choose the weather icon for one preview hex.
 *
 * Purpose: The month and the bonus live on the dialog, not in the payload.
 * When to use: Once per hex per frame while the overlay is open.
 * Expected outcome: One object. A null result from `previewWeatherIcon` draws no weather icon.
 * Exceptions: None.
 */
export interface PreviewWeatherIconInput {
  /**
   * Weather bonus selected in the dialog.
   *
   * Contract: `off`, `low`, or `high`.
   * When to use: Read from the weather bonus control on each frame.
   * Expected outcome: `off` hides the icon. `low` and `high` show the same glyph.
   * Exceptions: None.
   */
  readonly weatherBonusLevel: BonusLevel;
  /**
   * Starting month selected in the dialog.
   *
   * Contract: 1 for January through 12 for December.
   * When to use: Turn 1 of the match this dialog would start.
   * Expected outcome: Selects one entry of `weatherByMonth`.
   * Exceptions: None.
   */
  readonly startMonth: number;
  /**
   * That hex's twelve display states.
   *
   * Contract: January at index 0. A length other than 12 draws no icon.
   * When to use: `NewGameMapPreviewHex.weatherByMonth`.
   * Expected outcome: The month index from `gameDateForTurn(1, startMonth, 'monthly')`.
   * Exceptions: None.
   */
  readonly weatherByMonth: readonly WeatherState[];
  /**
   * Whether the view is at battle-detail zoom.
   *
   * Contract: True when `shouldRenderTacticalHexes()` is true.
   * When to use: The same gate the live status-icon pass uses.
   * Expected outcome: True returns null.
   * Exceptions: None.
   */
  readonly tacticalZoom: boolean;
}

/**
 * Facts that choose the tech icon for one preview hex.
 *
 * Purpose: The tech bonus lives on the dialog. The urban count and Advanced threshold belong to the previewed map, not the loaded match.
 * When to use: Once per hex per frame while the overlay is open and T is held.
 * Expected outcome: One object. A null result from `previewTechIcon` draws no tech icon.
 * Exceptions: None.
 */
export interface PreviewTechIconInput {
  /**
   * Tech bonus selected in the dialog.
   *
   * Contract: `off`, `low`, or `high`.
   * When to use: Read from the tech bonus control on each frame.
   * Expected outcome: `off` hides the icon. `low` and `high` show the same glyph for a given hex.
   * Exceptions: None.
   */
  readonly techBonusLevel: BonusLevel;
  /**
   * Generated urban-cell count for this hex.
   *
   * Contract: Zero or a positive integer from the preview payload.
   * When to use: `NewGameMapPreviewHex.baselineUrbanHexCount`.
   * Expected outcome: Zero draws no icon. A positive count can be Basic or Advanced.
   * Exceptions: None.
   */
  readonly baselineUrbanHexCount: number;
  /**
   * Advanced threshold for the previewed map.
   *
   * Contract: `NewGameMapPreview.advancedMinUrbanCells`.
   * When to use: Comparing `baselineUrbanHexCount`.
   * Expected outcome: A count at or above this number is Advanced.
   * Exceptions: None.
   */
  readonly advancedMinUrbanCells: number;
  /**
   * Whether T is held.
   *
   * Contract: Tech is drawn only while this is true.
   * When to use: `isMapInspectionModeHeld`.
   * Expected outcome: False returns null.
   * Exceptions: None.
   */
  readonly mapInspectionHeld: boolean;
  /**
   * Whether the view is at battle-detail zoom.
   *
   * Contract: True when `shouldRenderTacticalHexes()` is true.
   * When to use: The same gate the live status-icon pass uses.
   * Expected outcome: True returns null.
   * Exceptions: None.
   */
  readonly tacticalZoom: boolean;
}
