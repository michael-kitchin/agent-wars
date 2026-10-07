/**
 * Majority birth country per strategic hex.
 *
 * Purpose: Gives each strategic hex one country name for the origin bonus, derived from the same tactical countries units are born with.
 * When to use: Built once with the tactical birth-country cache; read through `getStrategicMajorityCountryNamesFromSnapshot`.
 * Expected outcome: Pure; the same inputs always give the same map.
 * Exceptions: None.
 */
import type { BirthCountry } from '../../shared/unitOriginTypes';
import { compareOrdinal } from './tacticalBirthCountry';

/**
 * Picks the country name that covers the most tactical cells of each parent strategic hex.
 *
 * Purpose: A strategic hex spans many tactical cells that can belong to different countries; the bonus needs one answer per hex.
 * When to use: When the tactical birth-country map is stored.
 * Expected outcome: Map from strategic `h3_index` to the name with the most cells; ties go to the name that sorts first by UTF-16 code units. Hexes with no counted cells have no entry.
 * Exceptions: Whatever `parentStrategicOf` throws for a malformed index.
 */
export function buildStrategicMajorityCountryNameByH3(
  tacticalCountryByH3: ReadonlyMap<string, BirthCountry>,
  parentStrategicOf: (tacticalH3Index: string) => string
): ReadonlyMap<string, string> {
  const countsByParent = new Map<string, Map<string, number>>();
  for (const [tacticalH3Index, country] of tacticalCountryByH3) {
    const parent = parentStrategicOf(tacticalH3Index);
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
