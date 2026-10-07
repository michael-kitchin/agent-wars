/**
 * Resolves a new unit's birth origin from the database and the terrain cache.
 *
 * Purpose: Gathers the birth hex's tactical cells and delegates the pick to `selectUnitBirthOrigin`.
 * When to use: Once per unit insert, from seeding and production.
 * Expected outcome: Never throws and never touches gameplay random streams.
 * Exceptions: None; errors are logged and yield a minimal origin.
 */
import { isPipelineTerrainKind } from '../../shared/pipelineTerrain';
import type { UnitOrigin } from '../../shared/unitOriginTypes';
import { tacticalChildrenOf } from '../../shared/h3Resolutions';
import { getTacticalTerrainOverridesForRendererFromGame } from '../gameDb/controlInfrastructure';
import type { BasicDbOps } from '../gameDb/dbOps';
import { getGameSeedWithOps } from '../gameDb/gameConfigKv';
import { logDebug, logError } from '../logger';
import { getTacticalBirthCountryFromSnapshot } from './tacticalBirthCountryCache';
import { originAreaForTacticalCell, tacticalOriginAreasLoaded } from './tacticalOriginAreas';
import { selectUnitBirthOrigin, type TacticalBirthCandidate } from './unitBirthCellSelection';

/**
 * One row of the merged tactical terrain overrides.
 *
 * Purpose: Names the element type returned by `getTacticalTerrainOverridesForRendererFromGame`.
 * When to use: Indexing override rows by cell.
 * Expected outcome: Matches the function's return element type.
 * Exceptions: None.
 */
type TacticalOverrideRow = ReturnType<typeof getTacticalTerrainOverridesForRendererFromGame>[number];

/**
 * Override rows indexed by tactical cell, memoized per returned row array.
 *
 * Purpose: The override reader returns the same array while the database is unchanged, so the index is built once.
 * When to use: Through `overrideRowsByH3` only.
 * Expected outcome: Entries disappear with their arrays.
 * Exceptions: None.
 */
const overrideIndexByRows = new WeakMap<ReadonlyArray<TacticalOverrideRow>, ReadonlyMap<string, TacticalOverrideRow>>();

/**
 * Returns the current tactical overrides indexed by cell.
 *
 * Purpose: Constant-time lookups while building birth candidates.
 * When to use: Once per `resolveUnitBirthOrigin` call.
 * Expected outcome: The memoized index for the current override rows.
 * Exceptions: Propagates database errors.
 */
function overrideRowsByH3(ops: BasicDbOps): ReadonlyMap<string, TacticalOverrideRow> {
  const rows = getTacticalTerrainOverridesForRendererFromGame(ops);
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
    birthTacticalH3Index: null,
    birthTerrainKind: null,
    birthIsUrban: false,
    birthCountryName: null,
    birthCountryCode: null,
    birthAreaId: null,
    birthAreaName: null,
    birthSubdivisionCode: null,
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
    const strategicKind =
      ops.getOne<{ terrain_kind: string }>('SELECT terrain_kind FROM hexes WHERE h3_index = ?', [birthH3Index])
        ?.terrain_kind ?? null;
    const overrides = overrideRowsByH3(ops);
    const tacticalCandidates: TacticalBirthCandidate[] = tacticalChildrenOf(birthH3Index).map((h3Index) => {
      const row = overrides.get(h3Index);
      return {
        h3Index,
        terrainKind: row?.terrainKind ?? strategicKind ?? 'water',
        isIntactUrban: !!row?.isUrban && !row?.isRubble,
      };
    });
    const selected = selectUnitBirthOrigin({
      birthH3Index,
      strategicTerrainKind: strategicKind,
      tacticalCandidates,
      seedKey: `${seed}:${unitId}`,
      birthCountryForTactical: getTacticalBirthCountryFromSnapshot,
      originAreaForTactical: tacticalOriginAreasLoaded() ? originAreaForTacticalCell : undefined,
    });
    const terrainKind = selected.birthTerrainKind;
    const origin: UnitOrigin = {
      ...selected,
      birthTerrainKind: terrainKind !== null && isPipelineTerrainKind(terrainKind) ? terrainKind : null,
    };
    logDebug('unitBirthOrigin resolveUnitBirthOrigin', {
      unitId,
      birthH3Index,
      birthTacticalH3Index: origin.birthTacticalH3Index,
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
