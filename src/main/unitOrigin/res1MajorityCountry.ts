/**
 * Majority birth country per res1 hex.
 *
 * Purpose: Gives each strategic hex one country name for the country bonus, derived from the same res4 countries units are born with.
 * When to use: Built once with the res4 birth-country cache; read through `getRes1MajorityCountryNamesFromSnapshot`.
 * Expected outcome: Pure; the same inputs always give the same map.
 * Exceptions: None.
 */
import type { BirthCountry } from '../../shared/unitOriginTypes';
import { compareOrdinal } from './res4BirthCountry';

/**
 * Picks the country name that covers the most res4 cells of each parent res1 hex.
 *
 * Purpose: A res1 hex spans many res4 cells that can belong to different countries; the bonus needs one answer per hex.
 * When to use: When the res4 birth-country map is stored.
 * Expected outcome: Map from res1 `h3_index` to the name with the most cells; ties go to the name that sorts first by UTF-16 code units. Hexes with no counted cells have no entry.
 * Exceptions: Whatever `parentRes1Of` throws for a malformed index.
 */
export function buildRes1MajorityCountryNameByH3(
  res4CountryByH3: ReadonlyMap<string, BirthCountry>,
  parentRes1Of: (res4H3Index: string) => string
): ReadonlyMap<string, string> {
  const countsByParent = new Map<string, Map<string, number>>();
  for (const [res4H3Index, country] of res4CountryByH3) {
    const parent = parentRes1Of(res4H3Index);
    const counts = countsByParent.get(parent) ?? new Map<string, number>();
    counts.set(country.name, (counts.get(country.name) ?? 0) + 1);
    countsByParent.set(parent, counts);
  }
  const majorityByParent = new Map<string, string>();
  for (const [parent, counts] of countsByParent) {
    const [winner] = [...counts].sort(([nameA, countA], [nameB, countB]) => countB - countA || compareOrdinal(nameA, nameB));
    if (winner) majorityByParent.set(parent, winner[0]);
  }
  return majorityByParent;
}
