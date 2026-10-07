import fs from 'fs';
import path from 'path';
import { strategicParentOf } from '../../shared/h3Resolutions';
import { majorityOriginId } from '../../shared/originArea';
import { logDebug, logError, logTrace } from '../logger';

/**
 * One origin area from the regional manifest.
 *
 * Purpose: Birth selection and flags need the area's display name, country, and subdivision code.
 * When to use: Values of the catalog loaded with a regional pack.
 * Expected outcome: `iso3166_2` is null when the area has no subdivision flag code.
 * Exceptions: None.
 */
export interface OriginArea {
  /**
   * Origin unit id.
   *
   * Contract: The id stored on tactical cells, such as `US-CA`. Not parsed as an ISO code.
   * When to use: `birth_area_id` and the bonus place id.
   * Expected outcome: A non-empty string.
   * Exceptions: None.
   */
  readonly id: string;
  /**
   * Player-facing area name.
   *
   * Contract: The manifest `name`.
   * When to use: `birth_area_name` and unit labels.
   * Expected outcome: A non-empty string.
   * Exceptions: None.
   */
  readonly name: string;
  /**
   * ISO 3166-1 alpha-2 country code.
   *
   * Contract: The origin unit's `country_code`, or null when the catalog omitted it.
   * When to use: The national flag when no subdivision flag applies.
   * Expected outcome: Not derived by splitting `id`.
   * Exceptions: None.
   */
  readonly countryCode: string | null;
  /**
   * ISO 3166-2 code when the area has one.
   *
   * Contract: The manifest `iso_3166_2`, or null.
   * When to use: The subdivision flag allow-list.
   * Expected outcome: Null uses the national flag.
   * Exceptions: None.
   */
  readonly iso3166_2: string | null;
}

/**
 * Origin area of each tactical land cell.
 *
 * Purpose: Birth selection reads the chosen cell's area.
 * When to use: Set by `loadTacticalOriginAreas`. Null on the global map.
 * Expected outcome: Keys are tactical H3 indexes.
 * Exceptions: None.
 */
let areaByTacticalH3: ReadonlyMap<string, OriginArea> | null = null;

/**
 * Majority origin id of each strategic hex.
 *
 * Purpose: The country bonus on a regional map compares this id with the unit's birth area.
 * When to use: Set with `areaByTacticalH3`.
 * Expected outcome: Ties keep the id that sorts first.
 * Exceptions: None.
 */
let majorityOriginIdByStrategicH3: ReadonlyMap<string, string> | null = null;

/**
 * Catalog of origin areas keyed by id.
 *
 * Purpose: A stored area id still needs its subdivision code when the snapshot is built.
 * When to use: `subdivisionCodeForAreaId`.
 * Expected outcome: Null on the global map.
 * Exceptions: None.
 */
let areaById: ReadonlyMap<string, OriginArea> | null = null;

/**
 * Loads one region's origin areas from its folder.
 *
 * Purpose: Regional births and the country bonus need the tactical origin file and the manifest catalog.
 * When to use: After the regional profile is active, so parent hexes use that resolution.
 * Expected outcome: Later lookups see this region until `clearTacticalOriginAreas`.
 * Exceptions: Logs and leaves the maps empty when a file is missing or unreadable. Does not throw.
 */
export function loadTacticalOriginAreas(directory: string): void {
  logDebug('tacticalOriginAreas loadTacticalOriginAreas', { directory });
  try {
    const catalog = readCatalog(path.join(directory, 'region_manifest.json'));
    const records = readCellRecords(path.join(directory, 'terrain_res_t_origin_units.json'));
    const byCell = new Map<string, OriginArea>();
    const countsByParent = new Map<string, Map<string, number>>();
    for (const record of records) {
      const area = catalog.get(record.originId) ?? {
        id: record.originId,
        name: record.originId,
        countryCode: null,
        iso3166_2: null,
      };
      byCell.set(record.h3Index, area);
      const parent = strategicParentOf(record.h3Index);
      const counts = countsByParent.get(parent) ?? new Map<string, number>();
      counts.set(area.id, (counts.get(area.id) ?? 0) + 1);
      countsByParent.set(parent, counts);
    }
    const majority = new Map<string, string>();
    for (const [parent, counts] of countsByParent) {
      const winner = majorityOriginId(counts);
      if (winner) majority.set(parent, winner);
    }
    areaByTacticalH3 = byCell;
    majorityOriginIdByStrategicH3 = majority;
    areaById = catalog;
    logDebug('tacticalOriginAreas loadTacticalOriginAreas: loaded', { cells: byCell.size, hexes: majority.size });
  } catch (err) {
    logError('tacticalOriginAreas loadTacticalOriginAreas: failed', err);
    areaByTacticalH3 = new Map();
    majorityOriginIdByStrategicH3 = new Map();
    areaById = new Map();
  }
}

/**
 * Forgets the loaded origin areas.
 *
 * Purpose: A global match must not keep a previous region's areas.
 * When to use: When installing the global pack.
 * Expected outcome: Lookups report that no regional areas are loaded.
 * Exceptions: None.
 */
export function clearTacticalOriginAreas(): void {
  logDebug('tacticalOriginAreas clearTacticalOriginAreas');
  areaByTacticalH3 = null;
  majorityOriginIdByStrategicH3 = null;
  areaById = null;
}

/**
 * Whether a regional origin file is loaded.
 *
 * Purpose: Place ids stay country names until a regional pack publishes origin ids.
 * When to use: Before choosing which place-id map the bonus reads.
 * Expected outcome: True after a successful or failed regional load, false after a clear.
 * Exceptions: None.
 */
export function tacticalOriginAreasLoaded(): boolean {
  logTrace('tacticalOriginAreas tacticalOriginAreasLoaded', { loaded: areaByTacticalH3 !== null });
  return areaByTacticalH3 !== null;
}

/**
 * Returns the origin area of one tactical cell.
 *
 * Purpose: Birth selection copies this area onto the unit.
 * When to use: From `selectUnitBirthOrigin` while a regional pack is loaded.
 * Expected outcome: Null when the cell has no origin or no pack is loaded.
 * Exceptions: None.
 */
export function originAreaForTacticalCell(h3Index: string): OriginArea | null {
  logTrace('tacticalOriginAreas originAreaForTacticalCell', { h3Index });
  return areaByTacticalH3?.get(h3Index) ?? null;
}

/**
 * Returns the majority origin id of one strategic hex.
 *
 * Purpose: The strategic country-bonus place is this id on a regional map.
 * When to use: When `tacticalOriginAreasLoaded` is true.
 * Expected outcome: Null when the hex has no origin cells.
 * Exceptions: None.
 */
export function strategicMajorityOriginId(h3Index: string): string | null {
  logTrace('tacticalOriginAreas strategicMajorityOriginId', { h3Index });
  return majorityOriginIdByStrategicH3?.get(h3Index) ?? null;
}

/**
 * Returns the majority origin id of every strategic hex that has one.
 *
 * Purpose: Snapshot hexes carry the place id the bonus compares.
 * When to use: From fog assembly when origin areas are loaded.
 * Expected outcome: The map built at load. Empty when the load failed.
 * Exceptions: None.
 */
export function strategicMajorityOriginIds(): ReadonlyMap<string, string> {
  logTrace('tacticalOriginAreas strategicMajorityOriginIds', { loaded: majorityOriginIdByStrategicH3 !== null });
  return majorityOriginIdByStrategicH3 ?? new Map();
}

/**
 * Returns the subdivision code stored for an area id.
 *
 * Purpose: Flag lookup needs `iso_3166_2` after the unit row is read back.
 * When to use: When mapping a unit row into a snapshot origin.
 * Expected outcome: The catalog code, or null when the area has none or the catalog is not loaded.
 * Exceptions: None.
 */
export function subdivisionCodeForAreaId(areaId: string | null): string | null {
  logTrace('tacticalOriginAreas subdivisionCodeForAreaId', { areaId });
  if (!areaId || !areaById) return null;
  return areaById.get(areaId)?.iso3166_2 ?? null;
}

/**
 * Reads the manifest origin catalog.
 *
 * Purpose: Cell records store only an id. The name and codes live on the manifest.
 * When to use: From `loadTacticalOriginAreas`.
 * Expected outcome: A map keyed by origin id. Entries without an id are skipped.
 * Exceptions: Throws when the file cannot be read. The caller logs that and clears the maps.
 */
function readCatalog(manifestPath: string): Map<string, OriginArea> {
  const document = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { origin_units?: unknown };
  const catalog = new Map<string, OriginArea>();
  if (!Array.isArray(document.origin_units)) return catalog;
  for (const entry of document.origin_units) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== 'string' || row.id.length === 0) continue;
    catalog.set(row.id, {
      id: row.id,
      name: typeof row.name === 'string' && row.name.length > 0 ? row.name : row.id,
      countryCode: typeof row.country_code === 'string' && row.country_code.length > 0 ? row.country_code : null,
      iso3166_2: typeof row.iso_3166_2 === 'string' && row.iso_3166_2.length > 0 ? row.iso_3166_2 : null,
    });
  }
  return catalog;
}

/**
 * Reads tactical cell origin ids.
 *
 * Purpose: Those rows are the land cells the majority and the birth pick use.
 * When to use: From `loadTacticalOriginAreas`.
 * Expected outcome: One record per cell that has an origin.
 * Exceptions: Throws when the file cannot be read.
 */
function readCellRecords(filePath: string): { h3Index: string; originId: string }[] {
  const document = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { records?: unknown };
  if (!Array.isArray(document.records)) return [];
  const records: { h3Index: string; originId: string }[] = [];
  for (const entry of document.records) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.h3_index !== 'string' || typeof row.origin_id !== 'string') continue;
    records.push({ h3Index: row.h3_index, originId: row.origin_id });
  }
  return records;
}
