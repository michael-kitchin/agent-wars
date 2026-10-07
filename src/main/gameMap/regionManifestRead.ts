import * as fs from 'fs';
import { logDebug, logError } from '../logger';
import { pathCandidates } from '../terrainMetadataPaths';
import type { GameMapScaleranks } from '../../shared/gameMapTypes';

/**
 * One strategic hex recorded on a region manifest.
 *
 * Purpose: The match footprint and each side's land come from these rows.
 * When to use: After `readRegionManifest`.
 * Expected outcome: `h3Index` is on the map. `sideGroupId` is set for member land.
 * Exceptions: None.
 */
export interface RegionManifestHex {
  /**
   * Strategic H3 index.
   *
   * Contract: Present on every hex row.
   * When to use: The ordered footprint.
   * Expected outcome: A non-empty H3 string.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Role of the hex in the region.
   *
   * Contract: `land` or `member_land` for a side's home land, `sea`, or `neutral_border`.
   * When to use: Choosing home hexes and later map-role storage.
   * Expected outcome: One of those role strings.
   * Exceptions: None.
   */
  readonly role: string;
  /**
   * Side that owns this land hex.
   *
   * Contract: Present for member land. Absent for sea and neutral border.
   * When to use: Collecting a side group's home hexes.
   * Expected outcome: A group id, or null.
   * Exceptions: None.
   */
  readonly sideGroupId: string | null;
}

/**
 * One side group named by a region manifest.
 *
 * Purpose: The Regional tab and match seeding share these names.
 * When to use: Listing maps and installing home hexes.
 * Expected outcome: `id` and `displayName` are non-empty.
 * Exceptions: None.
 */
export interface RegionManifestSideGroup {
  /**
   * Stable group id.
   *
   * Contract: Matches `side_group_id` on that group's land hexes.
   * When to use: The new-game payload.
   * Expected outcome: A non-empty string.
   * Exceptions: None.
   */
  readonly id: string;
  /**
   * Player-facing group name.
   *
   * Contract: The manifest display name.
   * When to use: Select labels and the stored home-region name.
   * Expected outcome: A non-empty string.
   * Exceptions: None.
   */
  readonly displayName: string;
}

/**
 * The fields a match needs from `region_manifest.json`.
 *
 * Purpose: List and load share one parse and do not read tactical JSON.
 * When to use: `listGameMaps` and `ensureGameMapLoaded`.
 * Expected outcome: Schema 1.1.0 or newer, with resolutions, hexes, and side groups.
 * Exceptions: None.
 */
export interface RegionManifest {
  /**
   * Folder id of the region.
   *
   * Contract: Equals the directory name and the catalog id.
   * When to use: Profile id and pack lookup.
   * Expected outcome: A non-empty string.
   * Exceptions: None.
   */
  readonly regionId: string;
  /**
   * Player-facing map name.
   *
   * Contract: The manifest `display_name`.
   * When to use: The region selector.
   * Expected outcome: A non-empty string.
   * Exceptions: None.
   */
  readonly displayName: string;
  /**
   * Strategic H3 resolution.
   *
   * Contract: Must equal the catalog row for this region.
   * When to use: Building the profile.
   * Expected outcome: 2 or 3.
   * Exceptions: None.
   */
  readonly strategicResolution: number;
  /**
   * Tactical H3 resolution.
   *
   * Contract: Three levels below the strategic resolution.
   * When to use: Building the profile.
   * Expected outcome: 5 or 6.
   * Exceptions: None.
   */
  readonly tacticalResolution: number;
  /**
   * Scalerank maxima from the manifest.
   *
   * Contract: Urban, airport, seaport, and city-label cutoffs.
   * When to use: The profile passed into classification.
   * Expected outcome: The manifest policy numbers.
   * Exceptions: None.
   */
  readonly scaleranks: GameMapScaleranks;
  /**
   * Strategic hexes in file order.
   *
   * Contract: The match footprint. Order is the array order in the file.
   * When to use: Seeding and the ordered hex list.
   * Expected outcome: One entry per strategic hex.
   * Exceptions: None.
   */
  readonly hexes: readonly RegionManifestHex[];
  /**
   * Side groups named by the manifest.
   *
   * Contract: Each id has at least one land hex.
   * When to use: The dialog and home-area installation.
   * Expected outcome: Two or more groups.
   * Exceptions: None.
   */
  readonly sideGroups: readonly RegionManifestSideGroup[];
}

/**
 * Locates `data/generated/regions` in the dev tree or a packaged app.
 *
 * Purpose: Manifests and pack files share one directory.
 * When to use: Listing maps and opening one region's folder.
 * Expected outcome: The first existing regions directory, or null when none of the candidate roots has it.
 * Exceptions: None.
 */
export function resolveGeneratedRegionsDirectory(): string | null {
  logDebug('regionManifestRead resolveGeneratedRegionsDirectory');
  for (const candidate of pathCandidates('data', 'generated', 'regions')) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Reads one region manifest from an extracted pack folder.
 *
 * Purpose: The dialog and the loader need the same hex and side lists.
 * When to use: With the absolute path of `region_manifest.json`.
 * Expected outcome: A parsed manifest. Schema older than 1.1.0 throws.
 * Exceptions: Throws when the file is missing, unreadable, or not a 1.1.0 manifest.
 */
export function readRegionManifest(manifestPath: string): RegionManifest {
  logDebug('regionManifestRead readRegionManifest', { manifestPath });
  let text: string;
  try {
    text = fs.readFileSync(manifestPath, 'utf8');
  } catch (err) {
    logError('regionManifestRead readRegionManifest: unreadable', { manifestPath, err });
    throw err;
  }
  return readRegionManifestText(text, manifestPath);
}

/**
 * Parses a region manifest from its JSON text.
 *
 * Purpose: The start screen can read a zipped manifest without writing the whole pack.
 * When to use: After reading `region_manifest.json` or inflating that member from its zip.
 * Expected outcome: A parsed manifest. Schema older than 1.1.0 throws.
 * Exceptions: Throws when the text is not JSON or is not a 1.1.0 manifest.
 */
export function readRegionManifestText(text: string, label: string): RegionManifest {
  logDebug('regionManifestRead readRegionManifestText', { label });
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (err) {
    logError('regionManifestRead readRegionManifestText: unreadable', { label, err });
    throw err;
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`${label}: manifest must be an object`);
  }
  const document = parsed as Record<string, unknown>;
  const schema = document.schema_version;
  if (typeof schema !== 'string' || schema < '1.1.0') {
    throw new Error(`${label}: schema_version must be 1.1.0 or newer`);
  }
  const regionId = requiredString(document.region_id, label, 'region_id');
  const displayName = requiredString(document.display_name, label, 'display_name');
  const strategicResolution = requiredNumber(document.res_s, label, 'res_s');
  const tacticalResolution = requiredNumber(document.res_t, label, 'res_t');
  const policy = document.scalerank_policy;
  if (!policy || typeof policy !== 'object') {
    throw new Error(`${label}: scalerank_policy is missing`);
  }
  const ranks = policy as Record<string, unknown>;
  const hexes = parseHexes(document.hexes, label);
  const sideGroups = parseSideGroups(document.side_groups, label);
  return {
    regionId,
    displayName,
    strategicResolution,
    tacticalResolution,
    scaleranks: {
      urbanOverlay: requiredNumber(ranks.urban_overlay_max, label, 'urban_overlay_max'),
      airport: requiredNumber(ranks.major_airport_max, label, 'major_airport_max'),
      seaport: requiredNumber(ranks.major_seaport_max, label, 'major_seaport_max'),
      cityLabel: requiredNumber(ranks.city_label_max, label, 'city_label_max'),
    },
    hexes,
    sideGroups,
  };
}

/**
 * Reads a required string field.
 *
 * Purpose: Manifest mistakes fail before a match is seeded.
 * When to use: For id and display name fields.
 * Expected outcome: The trimmed string.
 * Exceptions: Throws when the field is missing or blank.
 */
function requiredString(value: unknown, manifestPath: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${manifestPath}: ${field} must be a non-empty string`);
  }
  return value.trim();
}

/**
 * Reads a required number field.
 *
 * Purpose: Resolutions and scaleranks must be real numbers.
 * When to use: For `res_s`, `res_t`, and scalerank maxima.
 * Expected outcome: A finite number.
 * Exceptions: Throws when the field is not a finite number.
 */
function requiredNumber(value: unknown, manifestPath: string, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${manifestPath}: ${field} must be a number`);
  }
  return value;
}

/**
 * Parses the manifest hex array.
 *
 * Purpose: File order becomes the footprint order.
 * When to use: From `readRegionManifest`.
 * Expected outcome: One row per object that has an H3 index.
 * Exceptions: Throws when `hexes` is not an array.
 */
function parseHexes(value: unknown, manifestPath: string): RegionManifestHex[] {
  if (!Array.isArray(value)) throw new Error(`${manifestPath}: hexes must be an array`);
  const hexes: RegionManifestHex[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const record = row as { h3_index?: unknown; role?: unknown; side_group_id?: unknown };
    if (typeof record.h3_index !== 'string' || record.h3_index.length === 0) continue;
    hexes.push({
      h3Index: record.h3_index,
      role: typeof record.role === 'string' ? record.role : '',
      sideGroupId: typeof record.side_group_id === 'string' ? record.side_group_id : null,
    });
  }
  return hexes;
}

/**
 * Parses the manifest side-group array.
 *
 * Purpose: The dialog lists these names.
 * When to use: From `readRegionManifest`.
 * Expected outcome: One group per object that has an id and a display name.
 * Exceptions: Throws when `side_groups` is not an array.
 */
function parseSideGroups(value: unknown, manifestPath: string): RegionManifestSideGroup[] {
  if (!Array.isArray(value)) throw new Error(`${manifestPath}: side_groups must be an array`);
  const groups: RegionManifestSideGroup[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const record = row as { id?: unknown; display_name?: unknown };
    if (typeof record.id !== 'string' || typeof record.display_name !== 'string') continue;
    groups.push({ id: record.id, displayName: record.display_name });
  }
  return groups;
}
