/**
 * Adds who was responsible, and where, to the units of a built loss summary.
 */

import { isBuildUnitType } from '../../shared/ipc/productionTypes';
import type { LossAttribution, LossKillerUnit } from '../../shared/lossAttributionTypes';
import {
  LOSS_CAUSE_KEYS,
  type LostUnit,
  type PlayerLossSummary,
  type TurnLossSummary,
} from '../../shared/lossSummary';
import { logDebug } from '../logger';

/**
 * The owner and type a unit had during the fight.
 *
 * Purpose: A killer that survived may have changed owner by the time the note is written, so owners come from fight-time rosters.
 * When to use: Values of `LossAttributionContext.unitFacts`.
 * Expected outcome: An owner id and a unit type string.
 * Exceptions: None.
 */
export interface LossUnitFact {
  /**
   * Owner of the unit during the fight.
   *
   * Contract: A seat id or the Neutral owner id. Never taken from an id prefix.
   * When to use: Deciding which side a killer belongs to.
   * Expected outcome: The `player` field of the roster row.
   * Exceptions: None.
   */
  readonly ownerId: string;
  /**
   * Unit type string of the unit.
   *
   * Contract: May not be a build type. Such a unit is not counted as a killer.
   * When to use: The type counts of a loss line.
   * Expected outcome: The `unitType` field of the roster row.
   * Exceptions: None.
   */
  readonly unitType: string;
}

/**
 * What to credit when a victim has no kill edge.
 *
 * Purpose: Missiles, anti-air fire, air-strike victims, and invalid air bases are credited from other records than kill edges.
 * When to use: Values of `LossAttributionContext.fallbackByVictimId`.
 * Expected outcome: The sides to name, and the units that fought, if any.
 * Exceptions: None.
 */
export interface LossAttributionFallback {
  /**
   * Owners to name.
   *
   * Contract: A list, which may be empty for no side responsible. Null when the game could not tell.
   * When to use: The `responsibleOwnerIds` of the result, after the victim's own owner is removed.
   * Expected outcome: Copied into the attribution.
   * Exceptions: None.
   */
  readonly responsibleOwnerIds: readonly string[] | null;
  /**
   * Units that fought the victim, when known.
   *
   * Contract: Unit ids. Ids with no fight-time fact are ignored.
   * When to use: The `killerUnits` of the result.
   * Expected outcome: Empty when no unit is known.
   * Exceptions: None.
   */
  readonly killerIds: readonly string[];
}

/**
 * Everything the attribution step reads besides the summary.
 *
 * Purpose: Strategic and tactical resolution build this from different records, and one pure step applies it.
 * When to use: Built by `buildStrategicLossAttributionContext` or `buildTacticalLossAttributionContext`.
 * Expected outcome: Maps keyed by unit id.
 * Exceptions: None.
 */
export interface LossAttributionContext {
  /**
   * Fight-time owner and type of every unit that took part.
   *
   * Contract: Includes survivors and casualties.
   * When to use: Resolving a killer id to a side and a type.
   * Expected outcome: A killer id with no entry is ignored.
   * Exceptions: None.
   */
  readonly unitFacts: ReadonlyMap<string, LossUnitFact>;
  /**
   * Killer ids from kill edges, by cause bucket and victim id.
   *
   * Contract: A cause with no entry has no kill edges.
   * When to use: Rule one of attribution.
   * Expected outcome: The ids the engine recorded for that victim.
   * Exceptions: None.
   */
  readonly killerIdsByCause: Readonly<Partial<Record<keyof PlayerLossSummary, ReadonlyMap<string, readonly string[]>>>>;
  /**
   * Hex where each victim was lost.
   *
   * Contract: H3 indexes. A victim with no entry has no recorded hex.
   * When to use: The `lossH3Index` of the result.
   * Expected outcome: Null in the result when missing.
   * Exceptions: None.
   */
  readonly lossH3ByVictimId: ReadonlyMap<string, string>;
  /**
   * The carrier each cargo victim was aboard.
   *
   * Contract: Keys are cargo ids. Values are carrier ids.
   * When to use: Rule two of attribution.
   * Expected outcome: Cargo is credited like its carrier.
   * Exceptions: None.
   */
  readonly carrierIdByCargoId: ReadonlyMap<string, string>;
  /**
   * Credit for victims with no kill edge.
   *
   * Contract: Used after kill edges and carriers.
   * When to use: Rule three of attribution.
   * Expected outcome: Copied into the result.
   * Exceptions: None.
   */
  readonly fallbackByVictimId: ReadonlyMap<string, LossAttributionFallback>;
}

/**
 * Keeps the first kill edge of each victim.
 *
 * Purpose: Strategic and tactical builders turn edge lists into the lookup that `LossAttributionContext` wants.
 * When to use: Once per edge list in a context builder.
 * Expected outcome: A map from victim id to its killer ids. A later edge for the same victim is ignored.
 * Exceptions: None.
 */
export function killerIdsByVictim(
  edges: readonly { readonly victimId: string; readonly killerIds?: readonly string[] }[] | undefined
): ReadonlyMap<string, readonly string[]> {
  logDebug('lossAttributionCore killerIdsByVictim', { edgeCount: edges?.length ?? 0 });
  const byVictim = new Map<string, readonly string[]>();
  for (const edge of edges ?? []) {
    if (!byVictim.has(edge.victimId)) byVictim.set(edge.victimId, edge.killerIds ?? []);
  }
  return byVictim;
}

/**
 * Keeps killers that belong to another side and have a known build type.
 *
 * Purpose: A unit of the victim's own side never destroyed it, and a unit with no fight-time fact cannot be named.
 * When to use: Rules one and three, on a list of killer ids.
 * Expected outcome: Distinct killers in first-seen order.
 * Exceptions: None.
 */
function foreignKillers(killerIds: readonly string[], victimOwnerId: string, context: LossAttributionContext): LossKillerUnit[] {
  const kept = new Map<string, LossKillerUnit>();
  for (const unitId of killerIds) {
    const fact = context.unitFacts.get(unitId);
    if (!fact || fact.ownerId === victimOwnerId || !isBuildUnitType(fact.unitType)) continue;
    if (!kept.has(unitId)) kept.set(unitId, { unitId, unitType: fact.unitType });
  }
  return [...kept.values()];
}

/**
 * Finds the kill-edge killers recorded for one victim.
 *
 * Purpose: A victim may be filed under one cause while its edge sits in another list, such as an air-strike victim filed as return fire.
 * When to use: Rule one of attribution.
 * Expected outcome: The ids from the victim's own cause list when it has them, otherwise from the first other list that names the victim, otherwise an empty list.
 * Exceptions: None.
 */
function edgeKillerIds(victimId: string, cause: keyof PlayerLossSummary, context: LossAttributionContext): readonly string[] {
  for (const key of [cause, ...LOSS_CAUSE_KEYS.filter((other) => other !== cause)]) {
    const ids = context.killerIdsByCause[key]?.get(victimId);
    if (ids !== undefined) return ids;
  }
  return [];
}

/**
 * Lists the distinct owners of some killers.
 *
 * Purpose: The responsible sides of a loss are the owners of the units that destroyed it.
 * When to use: Rule one.
 * Expected outcome: Owner ids in first-seen order.
 * Exceptions: None.
 */
function ownersOf(killers: readonly LossKillerUnit[], context: LossAttributionContext): string[] {
  const owners = new Set<string>();
  for (const killer of killers) {
    const fact = context.unitFacts.get(killer.unitId);
    if (fact) owners.add(fact.ownerId);
  }
  return [...owners];
}

/**
 * Where one victim sits in the summary.
 *
 * Purpose: Cargo looks up its carrier's cause and owner.
 * When to use: The index built at the start of `attributeTurnLosses`.
 * Expected outcome: One entry per victim with an id.
 * Exceptions: None.
 */
interface VictimPlace {
  /**
   * Owner bucket of the victim.
   *
   * Contract: A key of `TurnLossSummary.byOwner`.
   * When to use: The `ownerId` of the attribution.
   * Expected outcome: The victim's owner.
   * Exceptions: None.
   */
  readonly ownerId: string;
  /**
   * Cause bucket of the victim.
   *
   * Contract: A member of `LOSS_CAUSE_KEYS`.
   * When to use: Choosing kill edges and the no-data default.
   * Expected outcome: The bucket the victim was filed in.
   * Exceptions: None.
   */
  readonly cause: keyof PlayerLossSummary;
}

/**
 * Works out the attribution of one victim.
 *
 * Purpose: Applies the four rules in order: kill edges, carrier, fallback, then nothing known.
 * When to use: `attributeTurnLosses`, once per victim with an id.
 * Expected outcome: A full attribution. `responsibleOwnerIds` is `[]` for an `other` victim with no data, and null for any other cause.
 * Exceptions: None.
 */
function attributionFor(
  victimId: string,
  places: ReadonlyMap<string, VictimPlace>,
  context: LossAttributionContext,
  visited: ReadonlySet<string>
): LossAttribution {
  const place = places.get(victimId)!;
  const ownHex = context.lossH3ByVictimId.get(victimId) ?? null;
  const edgeKillers = foreignKillers(edgeKillerIds(victimId, place.cause, context), place.ownerId, context);
  if (edgeKillers.length > 0) {
    return { ownerId: place.ownerId, lossH3Index: ownHex, responsibleOwnerIds: ownersOf(edgeKillers, context), killerUnits: edgeKillers };
  }
  const carrierId = context.carrierIdByCargoId.get(victimId);
  if (carrierId !== undefined && places.has(carrierId) && !visited.has(carrierId)) {
    const carrier = attributionFor(carrierId, places, context, new Set([...visited, victimId]));
    const keepCarrierSides = carrier.responsibleOwnerIds?.filter((id) => id !== place.ownerId) ?? null;
    return {
      ownerId: place.ownerId,
      lossH3Index: carrier.lossH3Index ?? ownHex,
      responsibleOwnerIds: keepCarrierSides,
      killerUnits: carrier.killerUnits.filter((killer) => context.unitFacts.get(killer.unitId)?.ownerId !== place.ownerId),
    };
  }
  const fallback = context.fallbackByVictimId.get(victimId);
  if (fallback) {
    return {
      ownerId: place.ownerId,
      lossH3Index: ownHex,
      responsibleOwnerIds: fallback.responsibleOwnerIds?.filter((id) => id !== place.ownerId) ?? null,
      killerUnits: foreignKillers(fallback.killerIds, place.ownerId, context),
    };
  }
  return { ownerId: place.ownerId, lossH3Index: ownHex, responsibleOwnerIds: place.cause === 'other' ? [] : null, killerUnits: [] };
}

/**
 * Adds an attribution to every unit that has an id in a built loss summary.
 *
 * Purpose: Gives a commander's loss note who was responsible for each loss, without changing the popup's summary.
 * When to use: After `buildTurnLossSummary`, on the main process, before the note is serialized.
 * Expected outcome: A new summary with the same units in the same buckets. A unit with no id is copied without attribution. The input is not changed.
 * Exceptions: None.
 */
export function attributeTurnLosses(summary: TurnLossSummary, context: LossAttributionContext): TurnLossSummary {
  const places = new Map<string, VictimPlace>();
  for (const [ownerId, buckets] of Object.entries(summary.byOwner)) {
    for (const cause of LOSS_CAUSE_KEYS) {
      for (const unit of buckets[cause]) {
        if (unit.unitId) places.set(unit.unitId, { ownerId, cause });
      }
    }
  }
  let attributedCount = 0;
  const byOwner: Record<string, PlayerLossSummary> = {};
  for (const [ownerId, buckets] of Object.entries(summary.byOwner)) {
    const copy = { ranged: [], melee: [], returnFire: [], airStrike: [], missileStrike: [], other: [] } as PlayerLossSummary;
    for (const cause of LOSS_CAUSE_KEYS) {
      copy[cause] = buckets[cause].map((unit): LostUnit => {
        if (!unit.unitId) return { ...unit };
        attributedCount += 1;
        return { ...unit, attribution: attributionFor(unit.unitId, places, context, new Set()) };
      });
    }
    byOwner[ownerId] = copy;
  }
  logDebug('lossAttributionCore attributeTurnLosses', {
    ownerCount: Object.keys(byOwner).length,
    unitCount: places.size,
    attributedCount,
  });
  return { byOwner };
}
