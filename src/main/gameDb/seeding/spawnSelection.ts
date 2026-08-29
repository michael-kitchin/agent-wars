import { logDebug, logError } from '../../logger';

/**
 * Documents the `SpawnCandidate` interface as a named contract surface (export interface SpawnCandidate).

 * Purpose: Supports maintainability by documenting why `SpawnCandidate` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface SpawnCandidate {
    /**
   * Specifies the contract for the `h3` member (h3: string;).

   * Contract: Describes stable behavior for callers of `h3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
h3: string;
    /**
   * Specifies the contract for the `lat` member (lat: number;).

   * Contract: Describes stable behavior for callers of `lat` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
lat: number;
    /**
   * Specifies the contract for the `lng` member (lng: number;).

   * Contract: Describes stable behavior for callers of `lng` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
lng: number;
    /**
   * Specifies the contract for the `terrain` member (terrain: string;).

   * Contract: Describes stable behavior for callers of `terrain` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrain: string;
}

/**
 * Defines the `lngDistanceDegrees` function shape (function lngDistanceDegrees(a: number, b: number): number).

 * Purpose: Supports maintainability by documenting why `lngDistanceDegrees` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function lngDistanceDegrees(a: number, b: number): number {
  const d = Math.abs(a - b);
  return d > 180 ? 360 - d : d;
}

/**
 * Defines the `squaredGeoDistance` function shape (function squaredGeoDistance(aLat: number, aLng: number, bLat: number, bLng: number): number).

 * Purpose: Supports maintainability by documenting why `squaredGeoDistance` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function squaredGeoDistance(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = aLat - bLat;
  const dLng = lngDistanceDegrees(aLng, bLng);
  return dLat * dLat + dLng * dLng;
}

/**
 * Defines the `northeastAsiaLandRegionStages` function shape (export function northeastAsiaLandRegionStages(): Array<(c: SpawnCandidate) => boolean>).

 * Purpose: Supports maintainability by documenting why `northeastAsiaLandRegionStages` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function northeastAsiaLandRegionStages(): Array<(c: SpawnCandidate) => boolean> {
  return [
    (c) => c.terrain === 'land' && c.lat >= 35 && c.lat <= 78 && c.lng >= 95 && c.lng <= 180,
    (c) => c.terrain === 'land' && c.lat >= 30 && c.lat <= 80 && c.lng >= 80 && c.lng <= 180,
    (c) => c.terrain === 'land' && c.lat >= 20 && c.lat <= 82 && c.lng >= 60 && c.lng <= 180,
  ];
}

/**
 * Defines the `southernAfricaLandRegionStages` function shape (export function southernAfricaLandRegionStages(): Array<(c: SpawnCandidate) => boolean>).

 * Purpose: Supports maintainability by documenting why `southernAfricaLandRegionStages` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function southernAfricaLandRegionStages(): Array<(c: SpawnCandidate) => boolean> {
  return [
    (c) => c.terrain === 'land' && c.lat >= -38 && c.lat <= -22 && c.lng >= 10 && c.lng <= 42,
    (c) => c.terrain === 'land' && c.lat >= -42 && c.lat <= -18 && c.lng >= 5 && c.lng <= 45,
    (c) => c.terrain === 'land' && c.lat >= -45 && c.lat <= -12 && c.lng >= -5 && c.lng <= 50,
    (c) => c.terrain === 'land' && c.lat >= -50 && c.lat <= -5 && c.lng >= -20 && c.lng <= 55,
  ];
}

/**
 * Defines the `isPacificOceanHex` function shape (export function isPacificOceanHex(c: SpawnCandidate): boolean).

 * Purpose: Supports maintainability by documenting why `isPacificOceanHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function isPacificOceanHex(c: SpawnCandidate): boolean {
  return c.terrain === 'water' && c.lat >= -55 && c.lat <= 55 && (c.lng >= 120 || c.lng <= -90);
}

/**
 * Defines the `isAtlanticOceanHex` function shape (export function isAtlanticOceanHex(c: SpawnCandidate): boolean).

 * Purpose: Supports maintainability by documenting why `isAtlanticOceanHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function isAtlanticOceanHex(c: SpawnCandidate): boolean {
  return c.terrain === 'water' && c.lat >= -55 && c.lat <= 60 && c.lng >= -75 && c.lng <= 20;
}

/**
 * Defines the `isIndianOceanHex` function shape (export function isIndianOceanHex(c: SpawnCandidate): boolean).

 * Purpose: Supports maintainability by documenting why `isIndianOceanHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function isIndianOceanHex(c: SpawnCandidate): boolean {
  return c.terrain === 'water' && c.lat >= -50 && c.lat <= 30 && c.lng >= 20 && c.lng <= 120;
}

/**
 * Defines the `pickClosestSpawnCandidates` function shape (export function pickClosestSpawnCandidates( candidates: ReadonlyArray<SpawnCandidate>, count: number, usedH3: Set<string>, targetLat: number, tar).

 * Purpose: Supports maintainability by documenting why `pickClosestSpawnCandidates` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function pickClosestSpawnCandidates(
  candidates: ReadonlyArray<SpawnCandidate>,
  count: number,
  usedH3: Set<string>,
  targetLat: number,
  targetLng: number
): SpawnCandidate[] {
  const ranked = candidates
    .filter((c) => !usedH3.has(c.h3))
    .map((c) => ({ c, d2: squaredGeoDistance(c.lat, c.lng, targetLat, targetLng) }))
    .sort((a, b) => a.d2 - b.d2);
  const picked: SpawnCandidate[] = [];
  for (const item of ranked) {
    if (picked.length >= count) break;
    if (usedH3.has(item.c.h3)) continue;
    picked.push(item.c);
    usedH3.add(item.c.h3);
  }
  return picked;
}

/**
 * Defines the `selectRegionalLandCandidates` function shape (export function selectRegionalLandCandidates( allCandidates: ReadonlyArray<SpawnCandidate>, requiredCount: number, regionName: string, stages: Array).

 * Purpose: Supports maintainability by documenting why `selectRegionalLandCandidates` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function selectRegionalLandCandidates(
  allCandidates: ReadonlyArray<SpawnCandidate>,
  requiredCount: number,
  regionName: string,
  stages: Array<(c: SpawnCandidate) => boolean>
): SpawnCandidate[] {
  logDebug('spawnSelection selectRegionalLandCandidates', { requiredCount, regionName, stageCount: stages.length });
  let last: SpawnCandidate[] = [];
  for (let i = 0; i < stages.length; i++) {
    const stageCandidates = allCandidates.filter(stages[i]!);
    if (stageCandidates.length >= requiredCount) {
      if (i > 0) {
        logDebug('spawnSelection selectRegionalLandCandidates: expanded staged search', {
          regionName,
          stage: i + 1,
          candidateCount: stageCandidates.length,
          requiredCount,
        });
      }
      return stageCandidates;
    }
    last = stageCandidates;
  }
  const err = new Error(`${regionName}: required ${requiredCount}, got ${last.length}`);
  logError('spawnSelection selectRegionalLandCandidates: insufficient regional candidates', err);
  throw new Error(`Could not find required ${regionName} land spawn hexes`);
}
