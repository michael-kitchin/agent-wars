/**
 * ASCII renderer for the operational hex map (2×2 cells, odd-row offset).
 *
 * Purpose: Phase 3 visualization for Commander briefings and tactical appendices.
 * When to use: After grid projection and per-hex game state assembly.
 * Expected outcome: Dense ASCII with legend-compatible symbology (`x`/`.`, overlays, `?` for undiscovered intel).
 * Exceptions: None for sparse cells; throws only on internal consistency bugs.
 */

import { logDebug, logTrace } from '../../logger';
import type { HexGrid, GridCell } from './hex-grid-projection';

/**
 * Per-hex tactical/strategic snapshot fields required for map symbology.
 *
 * Purpose: Decouples rendering from full `GameStateSnapshot` to keep the renderer testable.
 * When to use: Built in `briefing-map-section` for each `h3Index` in the projected grid.
 * Expected outcome: Overlay character resolves deterministically from the priority table in the plan.
 * Exceptions: None.
 */
export interface HexMapCellState {
  terrain: 'land' | 'water';
  isDiscovered: boolean;
  features: {
    hasAirport: boolean;
    hasSeaport: boolean;
    urbanCount: number;
  };
  controlledByAI: boolean;
  aiUnitCount: number;
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
  mapString: string;
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
