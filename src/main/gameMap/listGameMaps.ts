import * as fs from 'fs';
import * as path from 'path';
import { logDebug, logError } from '../logger';
import { GLOBAL_GAME_MAP } from '../../shared/activeGameMap';
import type { GameMapListEntry } from '../../shared/gameMapList';
import { REGIONAL_RULES_BY_ID, type RegionalGameMapId } from '../../shared/regionalRulesCatalog';
import { readRegionManifest, readRegionManifestText, resolveGeneratedRegionsDirectory, type RegionManifest } from './regionManifestRead';
import { regionManifestTextFromZip } from './regionPackExtract';

/**
 * Lists the global map and every extracted regional pack for the start screen.
 *
 * Purpose: The dialog needs names, sides, and prices without reading tactical terrain.
 * When to use: `game:listGameMaps` when the new-game overlay opens.
 * Expected outcome: Maps and side groups sorted by display name. A missing regions directory still returns the global row. A region that only has zips is still listed.
 * Exceptions: A manifest that cannot be parsed is logged and skipped.
 */
export function listGameMaps(): GameMapListEntry[] {
  logDebug('listGameMaps');
  const rows: GameMapListEntry[] = [
    {
      id: 'global',
      displayName: GLOBAL_GAME_MAP.displayName,
      sideGroups: [],
      costs: costsFromRules(GLOBAL_GAME_MAP.rules),
      advancedMinUrbanCells: GLOBAL_GAME_MAP.rules.advancedMinUrbanCells,
    },
  ];
  const root = resolveGeneratedRegionsDirectory();
  if (!root) {
    logError('listGameMaps: regions directory is missing', new Error('data/generated/regions was not found'));
    return rows;
  }
  for (const name of fs.readdirSync(root, { withFileTypes: true })) {
    if (!name.isDirectory() || name.name === 'qa') continue;
    if (!(name.name in REGIONAL_RULES_BY_ID)) continue;
    const regionId = name.name as RegionalGameMapId;
    try {
      const manifest = readListedRegionManifest(path.join(root, name.name));
      if (!manifest) continue;
      const rules = manifest.rules;
      const sideGroups = [...manifest.sideGroups].sort((a, b) => a.displayName.localeCompare(b.displayName));
      rows.push({
        id: regionId,
        displayName: manifest.displayName,
        sideGroups,
        costs: costsFromRules(rules),
        advancedMinUrbanCells: rules.advancedMinUrbanCells,
      });
    } catch (err) {
      logError('listGameMaps: skipped unreadable manifest', { regionId, err });
    }
  }
  rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
  logDebug('listGameMaps: done', { count: rows.length });
  return rows;
}

/**
 * Copies a rules column into the list's cost object.
 *
 * Purpose: The dialog does not import the whole profile.
 * When to use: For the global row and each catalog row.
 * Expected outcome: The five purchase prices.
 * Exceptions: None.
 */
function costsFromRules(rules: { infantryCost: number; armorCost: number; navalCost: number; airCost: number; missileCost: number }): GameMapListEntry['costs'] {
  return {
    infantry: rules.infantryCost,
    armor: rules.armorCost,
    naval: rules.navalCost,
    air: rules.airCost,
    missile: rules.missileCost,
  };
}

/**
 * Reads one region's manifest from extracted JSON or from its zip.
 *
 * Purpose: The dialog lists a region before that region's terrain JSON is unpacked.
 * When to use: For each catalog folder under the regions directory.
 * Expected outcome: The parsed manifest, or null when neither the JSON nor the zip is present.
 * Exceptions: Throws when a present file cannot be parsed. The caller logs that and skips the region.
 */
function readListedRegionManifest(directory: string): RegionManifest | null {
  const jsonPath = path.join(directory, 'region_manifest.json');
  if (fs.existsSync(jsonPath)) return readRegionManifest(jsonPath);
  const zipPath = path.join(directory, 'region_manifest.json.zip');
  if (!fs.existsSync(zipPath)) return null;
  return readRegionManifestText(regionManifestTextFromZip(zipPath), zipPath);
}
