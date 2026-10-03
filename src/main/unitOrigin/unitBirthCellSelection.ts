/**
 * Picks the res4 birth cell and origin for a new unit (pure; no database or terrain cache access).
 *
 * Purpose: Deterministic, testable core of unit birth-origin selection.
 * When to use: From `resolveUnitBirthOrigin` after it gathers the hex's res4 cells.
 * Expected outcome: The same input always yields the same origin.
 * Exceptions: None.
 */
import { hashStringToUint32 } from '../../shared/stableHash';
import type { BirthCountry, UnitOrigin } from '../../shared/unitOriginTypes';

/**
 * One res4 child of the birth hex that a unit could be born in.
 *
 * Purpose: The minimal terrain facts birth selection needs per cell.
 * When to use: Built by the caller for every res4 child of the birth hex.
 * Expected outcome: Plain data.
 * Exceptions: None.
 */
export interface Res4BirthCandidate {
  /**
   * The res4 cell's H3 index.
   *
   * Contract: A res4 child of the birth hex.
   * When to use: Sorting, the final pick, and the birth-country lookup.
   * Expected outcome: Unique within one input.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * The cell's pipeline terrain kind.
   *
   * Contract: `water` cells are never chosen.
   * When to use: Filtering land cells and the origin's terrain.
   * Expected outcome: For example `plains`, `forest`, or `water`.
   * Exceptions: None.
   */
  readonly terrainKind: string;
  /**
   * True for urban cells that are not rubble.
   *
   * Contract: The caller sets this to false for rubble.
   * When to use: Preferring urban birth cells.
   * Expected outcome: Intact urban cells are chosen whenever any exist.
   * Exceptions: None.
   */
  readonly isIntactUrban: boolean;
}

/**
 * Everything `selectUnitBirthOrigin` needs for one unit.
 *
 * Purpose: Keeps the selection function to one argument.
 * When to use: Built by `resolveUnitBirthOrigin`.
 * Expected outcome: Plain data plus one lookup callback.
 * Exceptions: None.
 */
export interface UnitBirthOriginSelectionInput {
  /**
   * The res1 hex the unit is created in.
   *
   * Contract: A res1 H3 index.
   * When to use: Copied into the origin.
   * Expected outcome: The unit's hex at creation.
   * Exceptions: None.
   */
  readonly birthH3Index: string;
  /**
   * The res1 hex's terrain kind, used when no res4 cell can be chosen.
   *
   * Contract: `null` when unknown.
   * When to use: Terrain fallback for hexes without land cells.
   * Expected outcome: Copied into the origin only on the fallback path.
   * Exceptions: None.
   */
  readonly res1TerrainKind: string | null;
  /**
   * Every res4 child of `birthH3Index`, in any order.
   *
   * Contract: Not mutated.
   * When to use: The pool to choose from.
   * Expected outcome: Sorted internally by `h3Index` so order does not matter.
   * Exceptions: None.
   */
  readonly res4Candidates: ReadonlyArray<Res4BirthCandidate>;
  /**
   * Stable per-unit key, `${gameSeed}:${unitId}`.
   *
   * Contract: The same key always picks the same cell from the same pool.
   * When to use: Hashed to choose a cell without touching gameplay random streams.
   * Expected outcome: Different units in the same hex usually get different cells.
   * Exceptions: None.
   */
  readonly seedKey: string;
  /**
   * Looks up the precomputed birth country of a res4 cell.
   *
   * Contract: Returns `null` for cells without a country.
   * When to use: Called once, for the chosen cell.
   * Expected outcome: Name and code for the origin.
   * Exceptions: None.
   */
  readonly birthCountryForRes4: (h3Index: string) => BirthCountry | null;
}

/**
 * Chooses a birth cell (intact urban first, then any land) and builds the unit's origin.
 *
 * Purpose: Gives each unit a plausible, stable place of birth inside its hex.
 * When to use: Once per unit insert, through `resolveUnitBirthOrigin`.
 * Expected outcome: A cell picked by hashing `seedKey` over the sorted pool; when the hex has no land cell, an origin with no cell, the res1 terrain, and no country.
 * Exceptions: None.
 */
export function selectUnitBirthOrigin(input: UnitBirthOriginSelectionInput): UnitOrigin {
  const sorted = [...input.res4Candidates].sort((a, b) => (a.h3Index < b.h3Index ? -1 : a.h3Index > b.h3Index ? 1 : 0));
  const urban = sorted.filter((candidate) => candidate.isIntactUrban);
  const pool = urban.length > 0 ? urban : sorted.filter((candidate) => candidate.terrainKind !== 'water');
  const cell = pool[hashStringToUint32(input.seedKey) % Math.max(pool.length, 1)];
  if (!cell) {
    return {
      birthH3Index: input.birthH3Index,
      birthRes4H3Index: null,
      birthTerrainKind: input.res1TerrainKind,
      birthIsUrban: false,
      birthCountryName: null,
      birthCountryCode: null,
    };
  }
  const country = input.birthCountryForRes4(cell.h3Index);
  return {
    birthH3Index: input.birthH3Index,
    birthRes4H3Index: cell.h3Index,
    birthTerrainKind: cell.terrainKind,
    birthIsUrban: cell.isIntactUrban,
    birthCountryName: country?.name ?? null,
    birthCountryCode: country?.code ?? null,
  };
}
