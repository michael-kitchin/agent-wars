import type { DestroyedBattleParent } from './destroyedBattleParent';
import { isBuildUnitType, type BuildUnitType } from './ipc/productionTypes';
import { LOSS_TYPE_NAME_LIST_MAX } from './lossSummary';

/**
 * Popup labels for a collapsed type, in the same spelling the other loss lines use.
 *
 * Purpose: This sentence writes `6 Armored`, while cause lines write `6x Armored`.
 * When to use: `formatDestroyedInBattleLine`.
 * Expected outcome: The five build types, in naval, air, armor, infantry, missile order.
 * Exceptions: None.
 */
const GROUP_LABEL_BY_TYPE: Readonly<Record<BuildUnitType, string>> = {
  naval: 'Naval',
  air: 'Air',
  armor: 'Armored',
  infantry: 'Infantry',
  missile: 'Missile',
};

/**
 * The order collapsed types follow on the battle sentence.
 *
 * Purpose: Matches the order of the other loss lines.
 * When to use: `formatDestroyedInBattleLine`.
 * Expected outcome: Naval before air, then armor, infantry, and missile.
 * Exceptions: None.
 */
const GROUP_ORDER: readonly BuildUnitType[] = ['naval', 'air', 'armor', 'infantry', 'missile'];

/**
 * Keeps the destroyed units this viewer is allowed to see.
 *
 * Purpose: A seat does not learn about an enemy unit that died off the hexes it can see.
 * When to use: Before `formatDestroyedInBattleLine`, with the visible-hex set from that resolution.
 * Expected outcome: All sides (`viewerSeatId` null) keeps every unit. A seat keeps its own units and enemy units on a visible hex.
 * Exceptions: None.
 */
export function visibleDestroyedParents(
  units: readonly DestroyedBattleParent[],
  viewerSeatId: string | null,
  visibleHexes: ReadonlySet<string>
): DestroyedBattleParent[] {
  if (viewerSeatId == null) return [...units];
  return units.filter((unit) => unit.ownerId === viewerSeatId || visibleHexes.has(unit.h3Index));
}

/**
 * Writes one side's destroyed-in-battle sentence.
 *
 * Purpose: The loss section names the strategic units a battle removed, after the other causes.
 * When to use: Once per side, with that side's visible units in their original order.
 * Expected outcome: An empty string when `units` is empty. Otherwise names, then collapsed groups, then ` destroyed in battle.` A type with more than `LOSS_TYPE_NAME_LIST_MAX` units becomes `${count} ${label}`, such as `6 Armored`. Fewer stay named.
 * Exceptions: None.
 */
export function formatDestroyedInBattleLine(
  units: readonly Pick<DestroyedBattleParent, 'unitType' | 'displayName'>[]
): string {
  if (units.length === 0) return '';
  const counts = new Map<string, number>();
  for (const unit of units) counts.set(unit.unitType, (counts.get(unit.unitType) ?? 0) + 1);
  const named: string[] = [];
  const grouped = new Set<BuildUnitType>();
  for (const unit of units) {
    const count = counts.get(unit.unitType) ?? 0;
    if (count > LOSS_TYPE_NAME_LIST_MAX && isBuildUnitType(unit.unitType)) {
      grouped.add(unit.unitType);
    } else {
      named.push(unit.displayName);
    }
  }
  const groups = GROUP_ORDER
    .filter((unitType) => grouped.has(unitType))
    .map((unitType) => `${counts.get(unitType) ?? 0} ${GROUP_LABEL_BY_TYPE[unitType]}`);
  return `${[...named, ...groups].join(', ')} destroyed in battle.`;
}

/**
 * One sentence per side that has a visible destroyed unit.
 *
 * Purpose: The loss sections take a map, one line per owner.
 * When to use: After `visibleDestroyedParents`.
 * Expected outcome: Keys are owner ids. Values are the sentence, including the period. An owner with no units is absent.
 * Exceptions: None.
 */
export function destroyedInBattleLinesByOwner(
  units: readonly DestroyedBattleParent[]
): ReadonlyMap<string, string> {
  const byOwner = new Map<string, DestroyedBattleParent[]>();
  for (const unit of units) {
    const list = byOwner.get(unit.ownerId);
    if (list) list.push(unit);
    else byOwner.set(unit.ownerId, [unit]);
  }
  const lines = new Map<string, string>();
  for (const [ownerId, list] of byOwner) {
    const line = formatDestroyedInBattleLine(list);
    if (line.length > 0) lines.set(ownerId, line);
  }
  return lines;
}
