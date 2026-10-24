import { logDebug, logError } from '../../logger';
import { trySeedScenarioRegionVsRegion, type RegionScenarioSeedDeps } from './regionScenarioSeeding';

/**
 * Seeds every seat in its home region.
 *
 * Purpose: A new match always stores the region-versus-region scenario, and that seeder places every seat.
 * When to use: From a new-match reset after terrain rows exist.
 * Expected outcome: Each seat's opening units are inserted. A closed database does nothing.
 * Exceptions: Throws when the stored scenario is not region-versus-region, or when the region seeder throws.
 */
export function seedUnits(deps: RegionScenarioSeedDeps): void {
  logDebug('gameDb seedUnits');
  if (!deps.hasDb()) return;
  if (trySeedScenarioRegionVsRegion(deps)) return;
  const err = new Error('seedUnits expected a region-versus-region scenario');
  logError('seedUnits: no region-versus-region scenario', err);
  throw err;
}
