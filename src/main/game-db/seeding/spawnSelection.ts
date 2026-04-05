import { logDebug, logError } from '../../logger';

export interface SpawnCandidate {
  h3: string;
  lat: number;
  lng: number;
  terrain: string;
}

function lngDistanceDegrees(a: number, b: number): number {
  const d = Math.abs(a - b);
  return d > 180 ? 360 - d : d;
}

function squaredGeoDistance(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = aLat - bLat;
  const dLng = lngDistanceDegrees(aLng, bLng);
  return dLat * dLat + dLng * dLng;
}

export function northeastAsiaLandRegionStages(): Array<(c: SpawnCandidate) => boolean> {
  return [
    (c) => c.terrain === 'land' && c.lat >= 35 && c.lat <= 78 && c.lng >= 95 && c.lng <= 180,
    (c) => c.terrain === 'land' && c.lat >= 30 && c.lat <= 80 && c.lng >= 80 && c.lng <= 180,
    (c) => c.terrain === 'land' && c.lat >= 20 && c.lat <= 82 && c.lng >= 60 && c.lng <= 180,
  ];
}

export function southernAfricaLandRegionStages(): Array<(c: SpawnCandidate) => boolean> {
  return [
    (c) => c.terrain === 'land' && c.lat >= -38 && c.lat <= -22 && c.lng >= 10 && c.lng <= 42,
    (c) => c.terrain === 'land' && c.lat >= -42 && c.lat <= -18 && c.lng >= 5 && c.lng <= 45,
    (c) => c.terrain === 'land' && c.lat >= -45 && c.lat <= -12 && c.lng >= -5 && c.lng <= 50,
    (c) => c.terrain === 'land' && c.lat >= -50 && c.lat <= -5 && c.lng >= -20 && c.lng <= 55,
  ];
}

export function isPacificOceanHex(c: SpawnCandidate): boolean {
  return c.terrain === 'water' && c.lat >= -55 && c.lat <= 55 && (c.lng >= 120 || c.lng <= -90);
}

export function isAtlanticOceanHex(c: SpawnCandidate): boolean {
  return c.terrain === 'water' && c.lat >= -55 && c.lat <= 60 && c.lng >= -75 && c.lng <= 20;
}

export function isIndianOceanHex(c: SpawnCandidate): boolean {
  return c.terrain === 'water' && c.lat >= -50 && c.lat <= 30 && c.lng >= 20 && c.lng <= 120;
}

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
 * Why this exists:
 *     Preserves deterministic staged regional land spawn selection while allowing the game DB module to stay smaller and focused.
 * When to use:
 *     During new-match unit seeding for region-constrained land-unit placement.
 * What to expect:
 *     Returns the first stage with enough candidates, logs stage expansion details, and throws when no stage satisfies the requirement.
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
