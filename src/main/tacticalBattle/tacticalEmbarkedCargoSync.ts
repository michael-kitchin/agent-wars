/**
 * Moves embarked land cargo onto its naval or air carrier's hex.
 *
 * Purpose: Embark, ferry, march projection, and plan-state projection share one snap from cargo to carrier.
 * When to use: After a phase has updated carrier or cargo rows and before the snapshot is returned.
 * Expected outcome: A new array. A row whose carrier exists and is naval or air gets that carrier's `h3Index`. Every other row is the same object. Carriers are read from the input, and the input is not mutated.
 * Exceptions: None.
 */

import type { KillEdge } from '../../shared/ipc/combatResultTypes';
import { tacticalLogQuery } from './tacticalLogging';

/**
 * Land sub-units whose carrier is in `carrierIds`.
 *
 * Purpose: Destroying a ship or an air unit destroys the land unit embarked on it.
 * When to use: Air-strike casualty expansion, ranged-fire removal, and melee removal of an air carrier.
 * Expected outcome: The ids of rows pointing at those carriers. The input is not changed.
 * Exceptions: None.
 */
export function embarkedLandIdsForCarriers(
  units: readonly { readonly id: string; readonly embarkedOnSubUnitId?: string | null }[],
  carrierIds: ReadonlySet<string>
): string[] {
  if (carrierIds.size === 0) return [];
  return units
    .filter((unit) => unit.embarkedOnSubUnitId != null && carrierIds.has(unit.embarkedOnSubUnitId))
    .map((unit) => unit.id);
}

/**
 * Kill rows for land units that die because their carrier died.
 *
 * Purpose: The loss summary classifies a unit from its kill row. Cargo that was not itself a target still belongs to the same cause as the carrier.
 * When to use: After ranged fire or melee has a kill row for a carrier that had embarked land.
 * Expected outcome: One row per cargo id that is not already a victim, copying that carrier's killers. The input lists are not changed.
 * Exceptions: None.
 */
export function cargoKillEdgesForRemovedCarriers(
  units: readonly { readonly id: string; readonly embarkedOnSubUnitId?: string | null }[],
  edges: readonly KillEdge[],
  carrierIds: ReadonlySet<string>,
  alreadyVictimIds: ReadonlySet<string>
): KillEdge[] {
  if (carrierIds.size === 0 || edges.length === 0) return [];
  const claimed = new Set(alreadyVictimIds);
  const extra: KillEdge[] = [];
  for (const edge of edges) {
    if (!carrierIds.has(edge.victimId)) continue;
    for (const cargoId of embarkedLandIdsForCarriers(units, new Set([edge.victimId]))) {
      if (claimed.has(cargoId)) continue;
      claimed.add(cargoId);
      extra.push({ victimId: cargoId, killerIds: [...edge.killerIds] });
    }
  }
  return extra;
}

/**
 * Returns rows with embarked cargo placed on a naval or air carrier's hex.
 *
 * Purpose: One projection replaces the copied cargo loops in tactical order application.
 * When to use: On a tactical sub-unit list or a plan-state unit list after movement, embark, or ferry.
 * Expected outcome: Cargo aboard a naval or air carrier shares the carrier hex from the input list. A missing carrier, or a land carrier, leaves the row unchanged.
 * Exceptions: None.
 */
export function syncEmbarkedLandToNavalHex<
  T extends {
    readonly id: string;
    readonly unitType: string;
    readonly h3Index: string;
    readonly embarkedOnSubUnitId?: string | null;
  },
>(units: readonly T[]): T[] {
  tacticalLogQuery('syncEmbarkedLandToNavalHex', { unitCount: units.length });
  const byId = new Map(units.map((u) => [u.id, u] as const));
  return units.map((u) => {
    if (!u.embarkedOnSubUnitId) return u;
    const carrier = byId.get(u.embarkedOnSubUnitId);
    if (!carrier || (carrier.unitType !== 'naval' && carrier.unitType !== 'air')) return u;
    return { ...u, h3Index: carrier.h3Index };
  });
}
