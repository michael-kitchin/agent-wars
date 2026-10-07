/**
 * Shared hex and database setup for grouped human-order tests.
 *
 * Purpose: Keeps multi-select order tests under the file size cap without copying fixture queries.
 * When to use: Import from gameActionsMultiSelect tests that seed a temporary game database.
 * Expected outcome: Helpers mutate the temp database and return hex ids the tests assert on.
 * Exceptions: `findOpenOceanHexPair` throws when the seeded map has no adjacent open-ocean pair.
 */

import { gridDistance } from 'h3-js';
import { dbGetOne, dbRun, getGameState } from '../gameDb';
import { getStrategicLandMassByH3 } from '../terrainClassificationCache';
import { hexHasSeaport } from '../movementTerrain';
import { resetHumanMarchPreviewDiagnosticsForTests } from '../gameActions/humanMarchPreview';
import { withTempGameDb } from './withTempGameDb';
import { canLandUnitTraverseEdge, landUnitCanOccupyHex } from '../../shared/landTraversalStrategic';
import { hexSupportsMixedLandAndNaval } from '../gameActions/humanMarchPreviewMixedSelection';

/**
 * Defines the `withTempDb` function shape (function withTempDb(runCase: () => void): void).

 * Purpose: Supports maintainability by documenting why `withTempDb` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function withTempDb(runCase: () => void): void {
  withTempGameDb('aw-gameactions-multi-', () => {
    resetHumanMarchPreviewDiagnosticsForTests();
    runCase();
  });
}

/**
 * Defines the `findNearestLandSeaportHex` function shape (function findNearestLandSeaportHex(state: ReturnType<typeof getGameState>, originH3: string): string | null).

 * Purpose: Supports maintainability by documenting why `findNearestLandSeaportHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function findNearestLandSeaportHex(state: ReturnType<typeof getGameState>, originH3: string): string | null {
  const landMass = getStrategicLandMassByH3();
  const landSeaportHexes = state.hexes
    .filter(
      (hex) =>
        hex.terrain === 'land' &&
        landUnitCanOccupyHex(hex.h3Index, landMass) &&
        hexHasSeaport(hex.h3Index) &&
        findAdjacentNonArcticLandHex(state, hex.h3Index) !== null
    )
    .sort((a, b) => {
      try {
        return gridDistance(originH3, a.h3Index) - gridDistance(originH3, b.h3Index);
      } catch {
        return a.h3Index.localeCompare(b.h3Index);
      }
    });
  return landSeaportHexes[0]?.h3Index ?? null;
}

/**
 * Defines the `findAdjacentNavalPassableHex` function shape (function findAdjacentNavalPassableHex(state: ReturnType<typeof getGameState>, centerH3: string): string | null).

 * Purpose: Supports maintainability by documenting why `findAdjacentNavalPassableHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function findAdjacentNavalPassableHex(state: ReturnType<typeof getGameState>, centerH3: string): string | null {
  const adjacentNavalHex = state.hexes.find((hex) => {
    const isNavalPassable = hex.terrain === 'water' || hex.terrain === 'coastal' || hex.terrainKind === 'coastal';
    if (!isNavalPassable) return false;
    try {
      return gridDistance(hex.h3Index, centerH3) === 1;
    } catch {
      return false;
    }
  });
  return adjacentNavalHex?.h3Index ?? null;
}

/**
 * Defines the `isOpenOceanLandMass` function shape (function isOpenOceanLandMass(h3Index: string): boolean).

 * Purpose: Detects hexes with no continent or qualifying island membership for land-unit rejection tests.
 * When to use: Filtering candidate hexes in `findOpenOceanHexPair`.
 * Expected outcome: True when land-mass data lists empty continent and island id arrays.
 * Exceptions: None.
 */
export function isOpenOceanLandMass(h3Index: string): boolean {
  const record = getStrategicLandMassByH3().get(h3Index);
  return !!record && record.continentIds.length === 0 && record.islandIds.length === 0;
}

/**
 * Locates a land hex that does not support both land and naval movement domains.
 *
 * Purpose: Finds a pure-land destination for mixed-stack rejection integration tests.
 * When to use: From grouped mixed land/naval preview and assign regression tests.
 * Expected outcome: Returns the first land hex that fails `hexSupportsMixedLandAndNaval`, or null.
 * Exceptions: None.
 */
export function findPureLandDestinationHex(state: ReturnType<typeof getGameState>): string | null {
  for (const hex of state.hexes) {
    if (hex.terrain !== 'land') continue;
    const hasSeaport = hexHasSeaport(hex.h3Index);
    if (hexSupportsMixedLandAndNaval({ ...hex, hasSeaport })) continue;
    return hex.h3Index;
  }
  return null;
}

/**
 * Locates an adjacent native-coastal hex for mixed-stack destination tests.
 *
 * Purpose: From a land seaport, naval may only egress one transit step this turn, so mixed previews must use that rim.
 * When to use: Grouped mixed land/naval preview and assign acceptance tests.
 * Expected outcome: Adjacent coastal hex, or null so callers can hold on the origin seaport.
 * Exceptions: None.
 */
export function findAdjacentMixedTransitHex(state: ReturnType<typeof getGameState>, originH3: string): string | null {
  for (const hex of state.hexes) {
    try {
      if (gridDistance(hex.h3Index, originH3) !== 1) continue;
    } catch {
      continue;
    }
    const hasSeaport = hexHasSeaport(hex.h3Index);
    if (!hexSupportsMixedLandAndNaval({ ...hex, hasSeaport })) continue;
    if (hex.terrain === 'coastal' || hex.terrainKind === 'coastal') return hex.h3Index;
  }
  return null;
}

/**
 * Locates adjacent open-ocean hexes for land-unit movement rejection integration tests.
 *
 * Purpose: Finds a neighboring open-ocean strategic pair for land movement rejection scenarios.
 * When to use: From integration tests that require land units blocked from open-ocean hops.
 * Expected outcome: Returns adjacent hex ids with empty continent and island membership, or throws if none found.
 * Exceptions: None; callers assert when no pair exists in the seeded state.
 */
export function findOpenOceanHexPair(state: ReturnType<typeof getGameState>): { originH3: string; destinationH3: string } {
  for (const hex of state.hexes) {
    if (!isOpenOceanLandMass(hex.h3Index)) continue;
    for (const candidate of state.hexes) {
      if (candidate.h3Index === hex.h3Index || !isOpenOceanLandMass(candidate.h3Index)) continue;
      try {
        if (gridDistance(hex.h3Index, candidate.h3Index) === 1) {
          return { originH3: hex.h3Index, destinationH3: candidate.h3Index };
        }
      } catch {
        // Ignore malformed test pairs.
      }
    }
  }
  throw new Error('expected adjacent open-ocean hex pair in seeded map');
}

/**
 * Defines the `setHumanControlledPort` function shape (function setHumanControlledPort(h3Index: string): void).

 * Purpose: Supports maintainability by documenting why `setHumanControlledPort` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setHumanControlledPort(h3Index: string): void {
  const childTactical = dbGetOne<{ h3Index: string }>(
    'SELECT h3_index AS h3Index FROM res_t_feature_overrides WHERE parent_h3_index = ? LIMIT 1',
    [h3Index]
  );
  if (childTactical) {
    dbRun('UPDATE res_t_feature_overrides SET is_seaport = 1 WHERE h3_index = ?', [childTactical.h3Index]);
  }
  dbRun('UPDATE res_s_infrastructure SET seaport_count = 1 WHERE h3_index = ?', [h3Index]);
  dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [h3Index, 'human']);
}

/**
 * Defines the `findAirportPairByDistance` function shape (function findAirportPairByDistance( state: ReturnType<typeof getGameState>, predicate: (distance: number) => boolean ): { originH3: string; destinationH3).

 * Purpose: Supports maintainability by documenting why `findAirportPairByDistance` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function findAirportPairByDistance(
  state: ReturnType<typeof getGameState>,
  predicate: (distance: number) => boolean
): { originH3: string; destinationH3: string } | null {
  const airportHexes = state.hexes
    .map((hex) => {
      const airportCount =
        dbGetOne<{ airportCount: number }>(
          'SELECT airport_count AS airportCount FROM res_s_infrastructure WHERE h3_index = ?',
          [hex.h3Index]
        )?.airportCount ?? 0;
      return airportCount > 0 ? hex.h3Index : null;
    })
    .filter((h3): h3 is string => !!h3);
  for (let i = 0; i < airportHexes.length; i++) {
    const originH3 = airportHexes[i]!;
    for (let j = 0; j < airportHexes.length; j++) {
      if (i === j) continue;
      const destinationH3 = airportHexes[j]!;
      try {
        const distance = gridDistance(originH3, destinationH3);
        if (predicate(distance)) return { originH3, destinationH3 };
      } catch {
        // Ignore malformed test pairs.
      }
    }
  }
  return null;
}

/**
 * Defines the `setArcticTerrain` function shape (function setArcticTerrain(h3Index: string): void).

 * Purpose: Supports maintainability by documenting why `setArcticTerrain` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setArcticTerrain(h3Index: string): void {
  dbRun('UPDATE hexes SET terrain = ?, terrain_kind = ? WHERE h3_index = ?', ['land', 'arctic', h3Index]);
}

/**
 * Defines the `positionLandUnitOnAdjacentWaterPorts` function shape (function positionLandUnitOnAdjacentWaterPorts( state: ReturnType<typeof getGameState>, landUnitId: string ): { originWaterHex: string; destinationWaterHe).

 * Purpose: Supports maintainability by documenting why `positionLandUnitOnAdjacentWaterPorts` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function positionLandUnitOnAdjacentWaterPorts(
  state: ReturnType<typeof getGameState>,
  landUnitId: string
): { originWaterHex: string; destinationWaterHex: string } {
  const { originH3, destinationH3 } = findOpenOceanHexPair(state);
  dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [originH3, landUnitId]);
  return { originWaterHex: originH3, destinationWaterHex: destinationH3 };
}

/**
 * Defines the `findAdjacentHex` function shape (function findAdjacentHex(state: ReturnType<typeof getGameState>, originH3: string): string | null).

 * Purpose: Supports maintainability by documenting why `findAdjacentHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function findAdjacentHex(state: ReturnType<typeof getGameState>, originH3: string): string | null {
  for (const hex of state.hexes) {
    if (hex.h3Index === originH3) continue;
    try {
      if (gridDistance(originH3, hex.h3Index) === 1) return hex.h3Index;
    } catch {
      // Ignore malformed test pairs.
    }
  }
  return null;
}

/**
 * Defines the `findAdjacentNonArcticLandHex` function shape (function findAdjacentNonArcticLandHex(state: ReturnType<typeof getGameState>, originH3: string): string | null).

 * Purpose: Supports maintainability by documenting why `findAdjacentNonArcticLandHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function findAdjacentNonArcticLandHex(state: ReturnType<typeof getGameState>, originH3: string): string | null {
  const landMass = getStrategicLandMassByH3();
  const originHex = state.hexes.find((hex) => hex.h3Index === originH3);
  const originIsWater = originHex?.terrain === 'water';
  for (const hex of state.hexes) {
    if (hex.h3Index === originH3 || hex.terrain !== 'land' || hex.terrainKind === 'arctic') continue;
    if (!landUnitCanOccupyHex(hex.h3Index, landMass)) continue;
    if (!originIsWater && !canLandUnitTraverseEdge(originH3, hex.h3Index, landMass)) continue;
    try {
      if (gridDistance(originH3, hex.h3Index) === 1) return hex.h3Index;
    } catch {
      // Ignore malformed test pairs.
    }
  }
  return null;
}

/**
 * Defines the `findWaterHexWithAdjacentLand` function shape (function findWaterHexWithAdjacentLand(state: ReturnType<typeof getGameState>): { waterHex: string; adjacentLandHex: string } | null { for (const hex of state).

 * Purpose: Supports maintainability by documenting why `findWaterHexWithAdjacentLand` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function findWaterHexWithAdjacentLand(state: ReturnType<typeof getGameState>): { waterHex: string; adjacentLandHex: string } | null {
  for (const hex of state.hexes) {
    if (hex.terrain !== 'water') continue;
    const hasTacticalChild =
      (dbGetOne<{ count: number }>(
        'SELECT COUNT(*) AS count FROM res_t_feature_overrides WHERE parent_h3_index = ?',
        [hex.h3Index]
      )?.count ?? 0) > 0;
    if (!hasTacticalChild) continue;
    const adjacentLandHex = findAdjacentNonArcticLandHex(state, hex.h3Index);
    if (!adjacentLandHex) continue;
    return { waterHex: hex.h3Index, adjacentLandHex };
  }
  return null;
}

/**
 * Finds a coastal hex that has an adjacent non-arctic land hex.
 *
 * Purpose: Embarked-land tests need a coastal setup next to land the unit could occupy after debark.
 * When to use: From embarked preview and assign cases that place a unit on coastal water.
 * Expected outcome: Coastal hex id plus an adjacent land hex, or null when the seeded map has none.
 * Exceptions: None.
 */
export function findCoastalHexWithAdjacentLand(
  state: ReturnType<typeof getGameState>
): { coastalHex: string; adjacentLandHex: string } | null {
  for (const hex of state.hexes) {
    const adjacentLandHex = findAdjacentNonArcticLandHex(state, hex.h3Index);
    if (!adjacentLandHex) continue;
    dbRun('UPDATE hexes SET terrain = ? WHERE h3_index = ?', ['coastal', hex.h3Index]);
    return { coastalHex: hex.h3Index, adjacentLandHex };
  }
  return null;
}
