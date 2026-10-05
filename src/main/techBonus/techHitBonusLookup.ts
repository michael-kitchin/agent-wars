/**
 * Per-unit tech bonuses for combat resolution.
 *
 * Purpose: Answers "how much does this unit add because of where it was born?" without reading the hex it stands on.
 * When to use: Build one lookup beside the origin lookup and pass it to every roll site.
 * Expected outcome: Attack and defense are each 0 or 2. Unknown ids add nothing.
 * Exceptions: None.
 */

import type { OriginBonusSettings } from '../../shared/originBonusTypes';
import { techHitBonusFor, techLevelFromUrbanHexCount } from '../../shared/techBonusRules';
import type { TechHitBonus } from '../../shared/techBonusTypes';
import { logDebug } from '../logger';

/**
 * Returns the tech bonus for one unit id.
 *
 * Contract: Keyed by strategic unit id or tactical sub-unit id. The hex where the unit stands is not an argument.
 * When to use: Inline hit rolls, and `withTechHitBonus` when a phase stamps a unit array.
 * Expected outcome: `{ attack: 0, defense: 0 }` for Basic, off, or an unknown id.
 * Exceptions: None.
 */
export type TechHitBonusLookup = (unitId: string) => TechHitBonus;

/**
 * Lookup that never gives a tech bonus.
 *
 * Purpose: Default for callers that predate the option, and for tests that ignore it.
 * When to use: Wherever a lookup is required but tech is off.
 * Expected outcome: Always zeros.
 * Exceptions: None.
 */
export const noTechHitBonus: TechHitBonusLookup = () => ({ attack: 0, defense: 0 });

/**
 * A unit the lookup can classify.
 *
 * Purpose: Strategic units and tactical sub-units both carry an origin.
 * When to use: The `units` argument of `createTechHitBonusLookup`.
 * Expected outcome: `origin` absent means Basic.
 * Exceptions: None.
 */
export interface TechLookupUnit {
  /**
   * Id the lookup will be asked for.
   *
   * Contract: Strategic unit id or tactical sub-unit id.
   * When to use: The key of the returned function.
   * Expected outcome: Stable for the phase.
   * Exceptions: None.
   */
  readonly id: string;
  /**
   * Birth place of the unit.
   *
   * Contract: Only `birthH3Index` is read. The hex the unit occupies now is ignored.
   * When to use: Copied from the snapshot unit or sub-unit.
   * Expected outcome: Missing birth is Basic.
   * Exceptions: None.
   */
  readonly origin?: { readonly birthH3Index?: string | null } | null;
}

/**
 * Builds a lookup from birth hexes and the generated urban counts.
 *
 * Purpose: One pass classifies every unit before the first roll of the phase.
 * When to use: Once next to `originHitBonusAt`. Tests pass `urbanHexCountAt` and do not load terrain metadata.
 * Expected outcome: Advanced units add 2 attack when tech is on, and 2 defense only at High.
 * Exceptions: None. `urbanHexCountAt` returning null classifies that hex as Basic.
 */
export function createTechHitBonusLookup(input: {
  readonly settings: OriginBonusSettings;
  readonly units: readonly TechLookupUnit[];
  readonly urbanHexCountAt: (h3Index: string) => number | null;
}): TechHitBonusLookup {
  const { settings, units, urbanHexCountAt } = input;
  logDebug('techHitBonusLookup createTechHitBonusLookup', {
    techBonusEnabled: settings.techBonusEnabled === true,
    techBonusLevel: settings.techBonusLevel ?? null,
    units: units.length,
  });
  const byId = new Map<string, TechHitBonus>();
  for (const unit of units) {
    const birth = unit.origin?.birthH3Index;
    const count = birth ? urbanHexCountAt(birth) : null;
    byId.set(unit.id, techHitBonusFor(settings, techLevelFromUrbanHexCount(count)));
  }
  return (unitId) => byId.get(unitId) ?? { attack: 0, defense: 0 };
}

/**
 * Copies tech points onto units that have any.
 *
 * Purpose: Ranged and melee phases read the points from the unit row, the way they read the origin bonus.
 * When to use: Once, when the phase builds its unit array, before the array is stored for a later resume.
 * Expected outcome: Units with both points at 0 are returned unchanged. The others gain both keys, including a 0 defense at Low.
 * Exceptions: None.
 */
export function withTechHitBonus<T extends { readonly id: string }>(
  units: readonly T[],
  lookup: TechHitBonusLookup
): T[] {
  logDebug('techHitBonusLookup withTechHitBonus', { units: units.length });
  return units.map((unit) => {
    const bonus = lookup(unit.id);
    if (bonus.attack === 0 && bonus.defense === 0) return unit;
    return { ...unit, techAttackBonus: bonus.attack, techDefenseBonus: bonus.defense };
  });
}
