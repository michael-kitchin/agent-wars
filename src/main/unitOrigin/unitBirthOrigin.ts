/**
 * Resolves a new unit's birth origin from the database and the terrain cache.
 *
 * Purpose: Gathers the birth hex's res4 cells and delegates the pick to `selectUnitBirthOrigin`.
 * When to use: Once per unit insert, from seeding and production.
 * Expected outcome: Never throws and never touches gameplay random streams.
 * Exceptions: None; errors are logged and yield a minimal origin.
 */
import { cellToChildren } from 'h3-js';
import { isPipelineTerrainKind } from '../../shared/pipelineTerrain';
import type { UnitOrigin } from '../../shared/unitOriginTypes';
import { getRes4TerrainOverridesForRendererFromGame } from '../gameDb/controlInfrastructure';
import type { BasicDbOps } from '../gameDb/dbOps';
import { getGameSeedWithOps } from '../gameDb/gameConfigKv';
import { logDebug, logError } from '../logger';
import { getRes4BirthCountryFromSnapshot } from './res4BirthCountryCache';
import { selectUnitBirthOrigin, type Res4BirthCandidate } from './unitBirthCellSelection';

/**
 * Resolution of the res4 cells a unit can be born in.
 *
 * Purpose: Matches the terrain cache's res4 naming and override data.
 * When to use: With `cellToChildren` on the birth hex.
 * Expected outcome: Always 4.
 * Exceptions: None.
 */
const BIRTH_CELL_RESOLUTION = 4;

/**
 * One row of the merged res4 terrain overrides.
 *
 * Purpose: Names the element type returned by `getRes4TerrainOverridesForRendererFromGame`.
 * When to use: Indexing override rows by cell.
 * Expected outcome: Matches the function's return element type.
 * Exceptions: None.
 */
type Res4OverrideRow = ReturnType<typeof getRes4TerrainOverridesForRendererFromGame>[number];

/**
 * Override rows indexed by res4 cell, memoized per returned row array.
 *
 * Purpose: The override reader returns the same array while the database is unchanged, so the index is built once.
 * When to use: Through `overrideRowsByH3` only.
 * Expected outcome: Entries disappear with their arrays.
 * Exceptions: None.
 */
const overrideIndexByRows = new WeakMap<ReadonlyArray<Res4OverrideRow>, ReadonlyMap<string, Res4OverrideRow>>();

/**
 * Returns the current res4 overrides indexed by cell.
 *
 * Purpose: Constant-time lookups while building birth candidates.
 * When to use: Once per `resolveUnitBirthOrigin` call.
 * Expected outcome: The memoized index for the current override rows.
 * Exceptions: Propagates database errors.
 */
function overrideRowsByH3(ops: BasicDbOps): ReadonlyMap<string, Res4OverrideRow> {
  const rows = getRes4TerrainOverridesForRendererFromGame(ops);
  const existing = overrideIndexByRows.get(rows);
  if (existing) return existing;
  const index = new Map(rows.map((row) => [row.h3Index, row] as const));
  overrideIndexByRows.set(rows, index);
  return index;
}

/**
 * Builds the minimal origin used when nothing better can be resolved.
 *
 * Purpose: Keeps the birth hex even when cells, terrain, and country are unknown.
 * When to use: On errors in `resolveUnitBirthOrigin`.
 * Expected outcome: Only `birthH3Index` is set.
 * Exceptions: None.
 */
function minimalOrigin(birthH3Index: string): UnitOrigin {
  return {
    birthH3Index,
    birthRes4H3Index: null,
    birthTerrainKind: null,
    birthIsUrban: false,
    birthCountryName: null,
    birthCountryCode: null,
  };
}

/**
 * Picks a birth cell in `birthH3Index` (intact urban first, then land) and returns the unit's origin.
 *
 * Purpose: Birth metadata for unit flags, the origin tooltip, and the origin bonuses when the match has them on.
 * When to use: Right before inserting a unit row; pass the result to `insertUnitRow`.
 * Expected outcome: Deterministic for the same game seed, unit id, and terrain; `birthTerrainKind` is a valid pipeline kind or `null`.
 * Exceptions: None; any error is logged and the minimal origin is returned so a spawn never fails.
 */
export function resolveUnitBirthOrigin(ops: BasicDbOps, args: { unitId: string; birthH3Index: string }): UnitOrigin {
  const { unitId, birthH3Index } = args;
  try {
    const seed = getGameSeedWithOps(ops);
    const res1Kind =
      ops.getOne<{ terrain_kind: string }>('SELECT terrain_kind FROM hexes WHERE h3_index = ?', [birthH3Index])
        ?.terrain_kind ?? null;
    const overrides = overrideRowsByH3(ops);
    const res4Candidates: Res4BirthCandidate[] = cellToChildren(birthH3Index, BIRTH_CELL_RESOLUTION).map((h3Index) => {
      const row = overrides.get(h3Index);
      return {
        h3Index,
        terrainKind: row?.terrainKind ?? res1Kind ?? 'water',
        isIntactUrban: !!row?.isUrban && !row?.isRubble,
      };
    });
    const selected = selectUnitBirthOrigin({
      birthH3Index,
      res1TerrainKind: res1Kind,
      res4Candidates,
      seedKey: `${seed}:${unitId}`,
      birthCountryForRes4: getRes4BirthCountryFromSnapshot,
    });
    const terrainKind = selected.birthTerrainKind;
    const origin: UnitOrigin = {
      ...selected,
      birthTerrainKind: terrainKind !== null && isPipelineTerrainKind(terrainKind) ? terrainKind : null,
    };
    logDebug('unitBirthOrigin resolveUnitBirthOrigin', {
      unitId,
      birthH3Index,
      birthRes4H3Index: origin.birthRes4H3Index,
      birthTerrainKind: origin.birthTerrainKind,
      birthIsUrban: origin.birthIsUrban,
      birthCountryCode: origin.birthCountryCode,
    });
    return origin;
  } catch (err) {
    logError(`unitBirthOrigin resolveUnitBirthOrigin: failed for unit ${unitId} in ${birthH3Index}`, err);
    return minimalOrigin(birthH3Index);
  }
}
