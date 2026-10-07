import * as fs from 'fs';
import * as path from 'path';
import { strFromU8, unzipSync } from 'fflate';
import { logDebug, logError, logTrace } from '../logger';
import { resolveGeneratedRegionsDirectory } from './regionManifestRead';

/**
 * JSON members packed for one region.
 *
 * Purpose: Extraction writes these files and no others. The list matches `scripts/generated-regional-manifest.cjs`.
 * When to use: While unpacking one region's zips into user data.
 * Expected outcome: A missing zip is skipped. The manifest zip is required.
 * Exceptions: None.
 */
const REGIONAL_PACK_JSON_FILES = [
  'region_manifest.json',
  'terrain_res_s_metadata.json',
  'terrain_res_t_metadata.json',
  'terrain_res_s_naming.json',
  'terrain_res_t_naming.json',
  'terrain_res_s_landmass.json',
  'terrain_res_s_weather.json',
  'terrain_res_t_road_rail_sides.json',
  'terrain_res_t_road_rail_vectors.json',
  'terrain_res_t_origin_units.json',
] as const;

/**
 * File written after every present zip has been unpacked.
 *
 * Purpose: A later launch can trust the folder without unpacking again.
 * When to use: The last write before the temp directory is renamed into place.
 * Expected outcome: An empty file named `pack.ready`.
 * Exceptions: None.
 */
const PACK_READY_MARKER = 'pack.ready';

/**
 * Test override for the Electron user-data directory.
 *
 * Purpose: Node tests can extract into a temp folder without Electron.
 * When to use: Set by `setRegionPackUserDataRootForTests`.
 * Expected outcome: Null in the app, so the real user-data path is used.
 * Exceptions: None.
 */
let userDataRootOverride: string | null = null;

/**
 * Points region extraction at a stand-in for Electron user data.
 *
 * Purpose: Tests extract one region without writing into the real app folder.
 * When to use: Before a test that unpacks a zip, and with null afterward.
 * Expected outcome: The next extract uses this directory as user data.
 * Exceptions: None.
 */
export function setRegionPackUserDataRootForTests(root: string | null): void {
  logDebug('regionPackExtract setRegionPackUserDataRootForTests', { root });
  userDataRootOverride = root;
}

/**
 * Absolute path of one region's JSON folder.
 *
 * Purpose: Loading reads terrain files beside the manifest.
 * When to use: With a catalog folder id, when a match is about to use that region.
 * Expected outcome: Repo JSON when it is already extracted, otherwise a complete previous extract under user data, otherwise that one region's zip extracted into user data. A previous extract that is missing a shipped JSON file is unpacked again. Null when none of those exist.
 * Exceptions: Throws when a zip extract fails. The temp directory is removed first.
 */
export function regionPackDirectory(regionId: string): string | null {
  logDebug('regionPackExtract regionPackDirectory', { regionId });
  const root = resolveGeneratedRegionsDirectory();
  const zipDirectory = root ? path.join(root, regionId) : null;
  if (zipDirectory && fs.existsSync(path.join(zipDirectory, 'region_manifest.json'))) return zipDirectory;
  const cached = readyUserDataDirectory(regionId, zipDirectory);
  if (cached) return cached;
  if (!zipDirectory || !fs.existsSync(path.join(zipDirectory, 'region_manifest.json.zip'))) return null;
  return extractRegionPack(regionId, zipDirectory);
}

/**
 * Reads the manifest member of `region_manifest.json.zip`.
 *
 * Purpose: The start screen lists side groups before any region is extracted.
 * When to use: When the extracted JSON is absent and the zip is present.
 * Expected outcome: The JSON text of the manifest member.
 * Exceptions: Throws when the zip cannot be read or has no manifest member.
 */
export function regionManifestTextFromZip(zipPath: string): string {
  logDebug('regionPackExtract regionManifestTextFromZip', { zipPath });
  return strFromU8(unzipMember(zipPath, 'region_manifest.json'));
}

/**
 * Returns the JSON filenames a region pack may contain.
 *
 * Purpose: A test keeps this list aligned with the packaging manifest.
 * When to use: From that contract test.
 * Expected outcome: The same names the extractor writes.
 * Exceptions: None.
 */
export function regionalPackJsonFiles(): readonly string[] {
  logTrace('regionPackExtract regionalPackJsonFiles', { count: REGIONAL_PACK_JSON_FILES.length });
  return REGIONAL_PACK_JSON_FILES;
}

/**
 * Returns a finished extract under user data.
 *
 * Purpose: A previous play of this region should not unpack the zips again.
 * When to use: After the repo JSON was not found.
 * Expected outcome: The directory when the marker, the manifest, and every JSON file that has a zip are present. Null when the extract is missing or a shipped JSON file was removed.
 * Exceptions: None.
 */
function readyUserDataDirectory(regionId: string, zipDirectory: string | null): string | null {
  const root = userDataRoot();
  if (!root) return null;
  const directory = path.join(root, 'generated-regions', regionId);
  const ready = fs.existsSync(path.join(directory, PACK_READY_MARKER))
    && fs.existsSync(path.join(directory, 'region_manifest.json'));
  if (!ready) return null;
  if (zipDirectory && !extractedJsonMatchesZips(directory, zipDirectory)) {
    logDebug('regionPackExtract readyUserDataDirectory: incomplete extract', { regionId });
    return null;
  }
  return directory;
}

/**
 * Checks that each present zip still has its JSON beside the marker.
 *
 * Purpose: Deleting one extracted file should send the next launch back to the zip.
 * When to use: After the marker and the manifest are both present.
 * Expected outcome: True when every zip in the source folder has a JSON file in the extract.
 * Exceptions: None.
 */
function extractedJsonMatchesZips(directory: string, zipDirectory: string): boolean {
  for (const jsonFilename of REGIONAL_PACK_JSON_FILES) {
    if (!fs.existsSync(path.join(zipDirectory, `${jsonFilename}.zip`))) continue;
    if (!fs.existsSync(path.join(directory, jsonFilename))) return false;
  }
  return true;
}

/**
 * Resolves the directory that stands in for Electron user data.
 *
 * Purpose: Extracts must land in the per-user folder, not in the install directory.
 * When to use: Before reading or writing `generated-regions`.
 * Expected outcome: The test override, otherwise Electron's user-data path, otherwise null when Electron is absent.
 * Exceptions: None. A missing Electron install returns null.
 */
function userDataRoot(): string | null {
  if (userDataRootOverride) return userDataRootOverride;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as { app?: { getPath?: (name: string) => string } } | undefined;
    const getPath = electron?.app?.getPath;
    if (typeof getPath !== 'function') return null;
    return getPath('userData');
  } catch (err) {
    logTrace('regionPackExtract userDataRoot: Electron is unavailable', { err });
    return null;
  }
}

/**
 * Unpacks one region's zips into user data.
 *
 * Purpose: A packaged app ships zips and materializes one region the first time it is played.
 * When to use: When neither the repo JSON nor a finished user-data copy exists.
 * Expected outcome: `userData/generated-regions/<regionId>/` with the JSON files and `pack.ready`.
 * Exceptions: Throws after deleting the temp directory when a zip is unreadable or the manifest member is missing.
 */
function extractRegionPack(regionId: string, zipDirectory: string): string {
  logDebug('regionPackExtract extractRegionPack', { regionId, zipDirectory });
  const root = userDataRoot();
  if (!root) {
    const err = new Error(`Regional map ${regionId} cannot be extracted without a user-data directory`);
    logError('regionPackExtract extractRegionPack: no user data', err);
    throw err;
  }
  const parent = path.join(root, 'generated-regions');
  fs.mkdirSync(parent, { recursive: true });
  const temp = path.join(parent, `.${regionId}.extracting`);
  fs.rmSync(temp, { recursive: true, force: true });
  fs.mkdirSync(temp);
  try {
    for (const jsonFilename of REGIONAL_PACK_JSON_FILES) {
      const zipPath = path.join(zipDirectory, `${jsonFilename}.zip`);
      if (!fs.existsSync(zipPath)) continue;
      fs.writeFileSync(path.join(temp, jsonFilename), unzipMember(zipPath, jsonFilename));
    }
    if (!fs.existsSync(path.join(temp, 'region_manifest.json'))) {
      throw new Error(`Regional map ${regionId} zip has no manifest`);
    }
    fs.writeFileSync(path.join(temp, PACK_READY_MARKER), '');
    return publishExtract(parent, regionId, temp);
  } catch (err) {
    fs.rmSync(temp, { recursive: true, force: true });
    logError('regionPackExtract extractRegionPack: failed', err);
    throw err;
  }
}

/**
 * Renames a finished temp extract into the region's folder.
 *
 * Purpose: Readers never see a half-written pack.
 * When to use: After the marker file is written.
 * Expected outcome: The destination path. A previous folder is removed only after the rename succeeds.
 * Exceptions: Throws when the rename fails. A previous folder is put back when the new name is missing.
 */
function publishExtract(parent: string, regionId: string, temp: string): string {
  const destination = path.join(parent, regionId);
  const backup = path.join(parent, `.${regionId}.previous`);
  fs.rmSync(backup, { recursive: true, force: true });
  if (fs.existsSync(destination)) fs.renameSync(destination, backup);
  try {
    fs.renameSync(temp, destination);
  } catch (err) {
    if (!fs.existsSync(destination) && fs.existsSync(backup)) fs.renameSync(backup, destination);
    throw err;
  }
  fs.rmSync(backup, { recursive: true, force: true });
  logDebug('regionPackExtract publishExtract', { destination });
  return destination;
}

/**
 * Inflates one named member of a zip.
 *
 * Purpose: Each regional archive holds a single JSON file under its own name.
 * When to use: From the manifest reader and the full extract.
 * Expected outcome: The member bytes.
 * Exceptions: Throws when the archive cannot be read or the member name is absent.
 */
function unzipMember(zipPath: string, memberName: string): Uint8Array {
  const archive = unzipSync(new Uint8Array(fs.readFileSync(zipPath)));
  const member = archive[memberName];
  if (!member) throw new Error(`${zipPath}: missing ${memberName}`);
  return member;
}
