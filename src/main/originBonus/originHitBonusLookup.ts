/**
 * Per-roll origin bonus lookups for combat resolution.
 *
 * Purpose: Answers "how much does this unit add rolling at this position?" without touching the database, so combat code stays testable.
 * When to use: Build one lookup per combat phase and pass it to the roll sites; the database-backed builders live in `originHitBonusLookupDb.ts`.
 * Expected outcome: Lookups return 0, 2, or 4 and never throw.
 * Exceptions: None.
 */
import type { OriginBonusSettings, OriginHitBonus } from '../../shared/originBonusTypes';
import { originBonusSources, originHitBonusFromSources, tacticalOriginBonusPlace } from '../../shared/originBonusRules';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import type { UnitOrigin } from '../../shared/unitOriginTypes';
import type { CombatUnit } from '../combatUnitTypes';
import { logDebug, logTrace } from '../logger';

/**
 * Returns the origin bonus for one unit rolling at one position.
 *
 * Contract: `unitId` is the strategic unit id or tactical sub-unit id; `h3Index` is where the unit stands for this roll. Unknown ids give 0.
 * When to use: At every hit roll that can get the bonus.
 * Expected outcome: `0` when the unit does not qualify; otherwise the larger amount among the bonuses it qualifies for.
 * Exceptions: None.
 */
export type OriginHitBonusLookup = (unitId: string, h3Index: string) => OriginHitBonus;

/**
 * Lookup that never gives a bonus.
 *
 * Purpose: Used when the relevant flags are off, and by tests that do not exercise bonuses.
 * When to use: Wherever a lookup is required but no bonus can apply.
 * Expected outcome: Always 0.
 * Exceptions: None.
 */
export const noOriginHitBonus: OriginHitBonusLookup = () => 0;

/**
 * Builds the strategic lookup, which applies the origin bonus against each hex's majority country.
 *
 * Purpose: Strategic ranged, melee, and air-strike rolls.
 * When to use: Once per strategic turn resolution.
 * Expected outcome: `noOriginHitBonus` when the origin bonus is off; otherwise a closure over an `id -> origin` map built once from `units`.
 * Exceptions: None.
 */
export function createStrategicOriginHitBonusLookup(input: {
  readonly settings: OriginBonusSettings;
  readonly units: ReadonlyArray<{ readonly id: string; readonly origin?: UnitOrigin }>;
  readonly countryNameAt: (strategicH3Index: string) => string | null;
}): OriginHitBonusLookup {
  const { settings, units, countryNameAt } = input;
  logDebug('originHitBonusLookup createStrategicOriginHitBonusLookup', { ...settings, units: units.length });
  if (!settings.originBonusEnabled) return noOriginHitBonus;
  const originById = new Map(units.map((u) => [u.id, u.origin] as const));
  return (unitId, h3Index) => {
    const sources = originBonusSources({
      settings,
      theater: 'strategic',
      origin: originById.get(unitId),
      place: { countryName: countryNameAt(h3Index), terrainKind: null },
    });
    const bonus = originHitBonusFromSources(sources, settings);
    logTrace('originHitBonusLookup strategic', { unitId, h3Index, bonus });
    return bonus;
  };
}

/**
 * Builds the tactical lookup, which applies both tests against the battle's frozen cell data.
 *
 * Purpose: Tactical ranged, melee, and air-strike rolls.
 * When to use: Once per tactical resolution step, with the battle snapshot that step starts from.
 * Expected outcome: `noOriginHitBonus` when both flags are off; otherwise a closure over an `id -> origin` map built once from `battle.subUnits`.
 * Exceptions: None.
 */
export function createTacticalOriginHitBonusLookup(input: {
  readonly settings: OriginBonusSettings;
  readonly battle: TacticalBattleSnapshot;
}): OriginHitBonusLookup {
  const { settings, battle } = input;
  logDebug('originHitBonusLookup createTacticalOriginHitBonusLookup', {
    ...settings,
    battleId: battle.battleId,
    subUnits: battle.subUnits.length,
  });
  if (!settings.originBonusEnabled && !settings.terrainBonusEnabled) return noOriginHitBonus;
  const originById = new Map(battle.subUnits.map((sub) => [sub.id, sub.origin] as const));
  return (unitId, h3Index) => {
    const sources = originBonusSources({
      settings,
      theater: 'tactical',
      origin: originById.get(unitId),
      place: tacticalOriginBonusPlace(battle, h3Index),
    });
    const bonus = originHitBonusFromSources(sources, settings);
    logTrace('originHitBonusLookup tactical', { unitId, h3Index, bonus });
    return bonus;
  };
}

/**
 * Copies combat units with their origin bonus set from their current positions.
 *
 * Purpose: Lets `combatResolution` read the bonus from each unit without knowing about origins.
 * When to use: When a `CombatUnit` array is built for a rolling phase.
 * Expected outcome: A new array of new objects; `originHitBonus` is set to the lookup's non-zero amount only on qualifying units, and no key is added otherwise, so deep comparisons of bonus-free units are unchanged.
 * Exceptions: None.
 */
export function withOriginHitBonus(units: ReadonlyArray<CombatUnit>, lookup: OriginHitBonusLookup): CombatUnit[] {
  let qualifying = 0;
  const stamped = units.map((u) => {
    const bonus = lookup(u.id, u.h3Index);
    if (bonus === 0) return { ...u };
    qualifying += 1;
    return { ...u, originHitBonus: bonus };
  });
  logDebug('originHitBonusLookup withOriginHitBonus', { units: units.length, qualifying });
  return stamped;
}
