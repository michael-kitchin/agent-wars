/**
 * ASCII renderer for the operational hex map (2×2 cells, odd-row offset).
 *
 * Purpose: Phase 3 visualization for Commander briefings and tactical appendices.
 * When to use: After grid projection and per-hex game state assembly.
 * Expected outcome: Dense ASCII with legend-compatible symbology (`x`/`.`, overlays, `?` for undiscovered intel).
 * Exceptions: None for sparse cells; throws only on internal consistency bugs.
 */

import { logDebug, logTrace } from '../../logger';
import type { HexGrid, GridCell } from './hexGridProjection';

/**
 * Per-hex tactical/strategic snapshot fields required for map symbology.
 *
 * Purpose: Decouples rendering from full `GameStateSnapshot` to keep the renderer testable.
 * When to use: Built in `briefingMapSection` for each `h3Index` in the projected grid.
 * Expected outcome: Overlay character resolves deterministically from the priority table in the plan.
 * Exceptions: None.
 */
export interface HexMapCellState {
  /**
   * Land vs water classification for the res4 cell backing this map tile.
   *
   * Contract: `'water'` suppresses land-only overlays; `'land'` participates in structural and presence overlays when discovered.
   * When to use: Populated from terrain metadata for each projected grid cell before ASCII rendering.
   * Expected outcome: Consistent with engine terrain for that H3 child cell.
   * Exceptions: None.
   */
  terrain: 'land' | 'water';
  /**
   * Whether the active player has discovered this cell for briefing display.
   *
   * Contract: When false, renderer uses `?` and skips faction-specific overlays regardless of underlying truth.
   * When to use: Fog and intel gating for operational map sections.
   * Expected outcome: Undiscovered cells never leak hidden unit or infrastructure detail in the ASCII map.
   * Exceptions: None.
   */
  isDiscovered: boolean;
  /**
   * Infrastructure markers that compete for a single structural overlay character per cell.
   *
   * Contract: `urbanCount` is a non-negative count; airport/seaport flags are independent booleans used by the overlay priority table.
   * When to use: After resolving airports, seaports, and urban density for the cell from game state.
   * Expected outcome: Renderer can choose `A`/`S`/`U`/`B` variants without consulting full `GameStateSnapshot`.
   * Exceptions: None.
   */
  features: {
    hasAirport: boolean;
    hasSeaport: boolean;
    urbanCount: number;
  };
  /**
   * True when the cell is controlled by the AI side for upper/lower-case structural markers.
   *
   * Contract: Only consulted when the cell is discovered and structural overlay applies.
   * When to use: Territory tint in the operational briefing map.
   * Expected outcome: Uppercase vs lowercase airport/seaport/urban glyphs per design.
   * Exceptions: None.
   */
  controlledByAI: boolean;
  /**
   * Count of AI-owned units present in the cell for presence overlay selection.
   *
   * Contract: Non-negative integer; zero means no AI units for presence glyphs.
   * When to use: Stacking friendly markers vs structural infrastructure in dense cells.
   * Expected outcome: Presence layer defers to structural overlay rules when counts imply hidden infrastructure.
   * Exceptions: None.
   */
  aiUnitCount: number;
  /**
   * Count of human-side (enemy to AI) units in the cell for presence overlay selection.
   *
   * Contract: Non-negative integer; combined with `aiUnitCount` for `x` vs numeric markers.
   * When to use: Enemy presence visualization on the operational map.
   * Expected outcome: Deterministic presence character from the renderer’s priority rules.
   * Exceptions: None.
   */
  enemyUnitCount: number;
}

/**
 * Output bundle for prompt assembly (map text plus displaced infrastructure footnote data).
 *
 * Purpose: Lets the briefing section render footnotes when unit markers hide airport/seaport/urban codes.
 * When to use: After `renderHexAsciiMap`.
 * Expected outcome: `displacedFeatures` only contains entries that require recovery text.
 * Exceptions: None.
 */
export interface HexAsciiMapResult {
  /**
   * Full multi-line ASCII map text for prompt or UI embedding.
   *
   * Contract: Newline-separated rows matching `HexGrid` dimensions; no trailing requirements beyond caller display.
   * When to use: After `renderHexAsciiMap` completes successfully.
   * Expected outcome: String suitable for markdown code fences or plain-text appendices.
   * Exceptions: None.
   */
  mapString: string;
  /**
   * Infrastructure labels displaced because unit presence glyphs occupied the cell.
   *
   * Contract: Each entry ties a briefing hex `code` to a short `feature` label for footnote recovery text.
   * When to use: When callers must append footnotes so airports/seaports are not silently dropped.
   * Expected outcome: Empty array when no displacement occurred.
   * Exceptions: None.
   */
  displacedFeatures: Array<{ code: string; feature: string }>;
}

/**
 * Renders `HexGrid` into the operational ASCII map string.
 *
 * Purpose: Main Phase 3 entry point.
 * When to use: Strategic and tactical briefing generation.
 * Expected outcome: Two text lines per grid row with per-cell 2×2 blocks and odd-row indentation.
 * Exceptions: Throws if a grid cell lacks `HexMapCellState` (caller must supply defaults).
 */
export function renderHexAsciiMap(grid: HexGrid, gameState: Map<string, HexMapCellState>): HexAsciiMapResult {
  logDebug('hex-map-renderer renderHexAsciiMap', {
    rows: grid.numRows,
    cols: grid.numCols,
    occupied: grid.cells.length,
  });
  const occupied = new Map<string, GridCell>();
  for (const c of grid.cells) {
    occupied.set(`${c.row},${c.col}`, c);
  }
  const displacedFeatures: Array<{ code: string; feature: string }> = [];

  const structuralOverlay = (st: HexMapCellState): string => {
    if (!st.isDiscovered) return '?';
    const u = st.features.urbanCount > 0;
    const a = st.features.hasAirport;
    const s = st.features.hasSeaport;
    const upper = st.controlledByAI;
    if (a && s) return upper ? 'B' : 'b';
    if (a) return upper ? 'A' : 'a';
    if (s) return upper ? 'S' : 's';
    if (u) return upper ? 'U' : 'u';
    return '.';
  };

  const presenceOverlay = (st: HexMapCellState): string | null => {
    if (st.aiUnitCount > 0 && st.enemyUnitCount > 0) return '#';
    if (st.aiUnitCount > 0) return '*';
    if (st.enemyUnitCount > 0) return '!';
    return null;
  };

  const linesTop: string[] = [];
  const linesBot: string[] = [];
  for (let r = 0; r < grid.numRows; r++) {
    let top = '';
    let bot = '';
    if (r % 2 === 1) {
      top += ' ';
      bot += ' ';
    }
    for (let c = 0; c < grid.numCols; c++) {
      const key = `${r},${c}`;
      const cell = occupied.get(key);
      if (!cell) {
        top += '  ';
        bot += '  ';
      } else {
        const st = gameState.get(cell.h3Index);
        if (!st) {
          throw new Error(`hex-map-renderer: missing HexMapCellState for ${cell.h3Index}`);
        }
        const terrainCh = st.terrain === 'water' ? '.' : 'x';
        const presence = presenceOverlay(st);
        const struct = structuralOverlay(st);
        const overlayCh = presence ?? struct;
        if (presence && struct !== '?' && struct !== '.') {
          displacedFeatures.push({ code: cell.code, feature: struct });
        }
        top += `${cell.code}`;
        bot += `${terrainCh}${overlayCh}`;
      }
      if (c < grid.numCols - 1) {
        top += ' ';
        bot += ' ';
      }
    }
    linesTop.push(top);
    linesBot.push(bot);
  }
  const mapString = linesTop.map((t, i) => `${t}\n${linesBot[i]}`).join('\n');
  logTrace('hex-map-renderer renderHexAsciiMap: done', { lines: linesTop.length * 2, displaced: displacedFeatures.length });
  return { mapString, displacedFeatures };
}
