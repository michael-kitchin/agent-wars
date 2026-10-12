/**
 * Strategic hexes where armor must end its move, plus the rugged and city cover flags.
 *
 * Purpose: Path search, cover, and tooltips share one answer for each loaded hex.
 * When to use: After the terrain pack is classified, and again in the renderer from the snapshot.
 * Expected outcome: `armorMoveEndsOnHex` is true for rugged, arctic, or city. Cover reads rugged and city only.
 * Exceptions: None. An empty install means no hex stops armor.
 */

/**
 * Rugged strategic hexes in the loaded pack.
 *
 * Purpose: Armor stops on entry, and the ground cover column can rise to 2.
 * When to use: Only through the functions in this module.
 * Expected outcome: Hex indexes whose land cells are at least half mountain by the mountain test.
 * Exceptions: None.
 */
let ruggedHexes = new Set<string>();

/**
 * Arctic strategic hexes in the loaded pack.
 *
 * Purpose: Armor stops on entry. Arctic does not add a cover column.
 * When to use: Only through the functions in this module.
 * Expected outcome: Hex indexes whose land cells are at least half arctic.
 * Exceptions: None.
 */
let arcticHexes = new Set<string>();

/**
 * City strategic hexes in the loaded pack.
 *
 * Purpose: Armor stops on entry, and both cover columns can rise.
 * When to use: Only through the functions in this module.
 * Expected outcome: Hex indexes whose generated urban count is at least 86.
 * Exceptions: None.
 */
let cityHexes = new Set<string>();

/**
 * Replaces the three sets, or clears them.
 *
 * Purpose: A newly loaded pack must not keep the previous map's stops.
 * When to use: At the end of classification, when the renderer applies a snapshot, and when the cache is cleared.
 * Expected outcome: Later flag reads see only the hexes in `next`, or none when `next` is null.
 * Exceptions: None.
 */
export function setStrategicTerrainFlags(
  next: { rugged: Iterable<string>; arctic: Iterable<string>; city: Iterable<string> } | null
): void {
  if (!next) {
    ruggedHexes = new Set();
    arcticHexes = new Set();
    cityHexes = new Set();
    return;
  }
  ruggedHexes = new Set(next.rugged);
  arcticHexes = new Set(next.arctic);
  cityHexes = new Set(next.city);
}

/**
 * Sentence for an armor order that would pass a hex where the move must end.
 *
 * Purpose: The human order gate and the AI movement check share one explanation.
 * When to use: After range, occupancy, and the straight land-mass route have been allowed, when armor's destination is still outside the one-turn reachable set.
 * Expected outcome: The caller shows this sentence and does not store the order.
 * Exceptions: None.
 */
export const ARMOR_MOVE_ENDS_ON_ENTER_REASON =
  'Armor must end its move on entering a rugged, arctic, or city hex.';

/**
 * True when armor may enter this hex and may not leave it during the same move.
 *
 * Purpose: One predicate for path search, destination lists, and route tools.
 * When to use: For armor only. Infantry and naval ignore it. An armor unit that is already on the hex may still leave.
 * Expected outcome: True when the hex is rugged, arctic, or city in the loaded pack.
 * Exceptions: None.
 */
export function armorMoveEndsOnHex(h3Index: string): boolean {
  return ruggedHexes.has(h3Index) || arcticHexes.has(h3Index) || cityHexes.has(h3Index);
}

/**
 * Legend words for a world hex where armor must stop.
 *
 * Purpose: Planning `Slower:` names the legend kinds, not the flag words.
 * When to use: For each hex an armor route enters, after the origin.
 * Expected outcome: `Urban` when `city`, `Mountain` when `rugged`, `Arctic` when `arctic`, in that order. Empty when none are set.
 * Exceptions: None.
 */
export function armorStopTerrainLabels(flags: {
  readonly rugged: boolean;
  readonly arctic: boolean;
  readonly city: boolean;
}): readonly string[] {
  const labels: string[] = [];
  if (flags.city) labels.push('Urban');
  if (flags.rugged) labels.push('Mountain');
  if (flags.arctic) labels.push('Arctic');
  return labels;
}

/**
 * Cover and tooltip flags for one strategic hex.
 *
 * Purpose: The tooltip and the cover resolver must not each retest the cells.
 * When to use: When building a strategic cover place or an Effects line.
 * Expected outcome: Booleans from the loaded sets. Arctic is reported and does not change cover.
 * Exceptions: None.
 */
export function strategicTerrainFlagsFor(h3Index: string): { rugged: boolean; arctic: boolean; city: boolean } {
  return {
    rugged: ruggedHexes.has(h3Index),
    arctic: arcticHexes.has(h3Index),
    city: cityHexes.has(h3Index),
  };
}

/**
 * Decides the three flags from land-cell counts and an urban total.
 *
 * Purpose: The half-cell rule stays in one place so the pack walk and the tests share it.
 * When to use: After counting land, rugged, and arctic tactical cells in one strategic hex.
 * Expected outcome: Rugged or arctic when that count is at least half of `landCells`. City when `urbanCount` is at least 86.
 * Exceptions: None. Zero land cells are neither rugged nor arctic.
 */
export function strategicFlagsFromCounts(
  landCells: number,
  ruggedCells: number,
  arcticCells: number,
  urbanCount: number
): { rugged: boolean; arctic: boolean; city: boolean } {
  return {
    rugged: landCells > 0 && ruggedCells * 2 >= landCells,
    arctic: landCells > 0 && arcticCells * 2 >= landCells,
    city: urbanCount >= 86,
  };
}
