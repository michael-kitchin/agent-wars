/**
 * Pure builders for hex-to-hex ranged resolution shot lines (direct fire + return-fire attempts).
 *
 * Purpose: Lets `runRangedPhase` and renderer fog filtering share one edge contract without Electron or DB.
 * When to use: Combat resolution emit and optional UI filtering of playback lines.
 * Expected outcome: Deduped `{ fromH3Index, toH3Index }` pairs; empty input yields empty output.
 */

import { gridDistance } from 'h3-js';

/**
 * One attacker→target or defender→attacker hex connector for resolution lightning playback.
 *
 * Purpose: IPC/anim payload row drawn with the same style as planned ranged-attack lines.
 * When to use: Elements of `rangedResolutionShotLines` on Ready / tactical commit / anim state.
 * Expected outcome: Both indexes are H3 cells at fire time; duplicates are collapsed by builders.
 * Exceptions: None.
 */
export type RangedResolutionShotLine = {
  fromH3Index: string;
  toH3Index: string;
};

/**
 * Stable key for deduplicating shot-line pairs.
 *
 * Purpose: Collapse identical hex pairs from overlapping orders and multi-defender return fire.
 * When to use: Inside `dedupeRangedResolutionShotLines` only.
 * Expected outcome: `from|to` string unique per directed pair.
 * Exceptions: None.
 */
function shotLineKey(line: RangedResolutionShotLine): string {
  return `${line.fromH3Index}|${line.toH3Index}`;
}

/**
 * Collapses duplicate directed hex pairs while preserving first-seen order.
 *
 * Purpose: Orders and return-fire eligibility can emit the same pair more than once.
 * When to use: After concatenating direct and return-fire line lists.
 * Expected outcome: Unique `fromH3Index`→`toH3Index` rows.
 * Exceptions: None.
 */
export function dedupeRangedResolutionShotLines(
  lines: readonly RangedResolutionShotLine[]
): RangedResolutionShotLine[] {
  const seen = new Set<string>();
  const out: RangedResolutionShotLine[] = [];
  for (const line of lines) {
    const key = shotLineKey(line);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ fromH3Index: line.fromH3Index, toH3Index: line.toH3Index });
  }
  return out;
}

/**
 * Builds direct-fire shot lines from submitted ranged orders.
 *
 * Purpose: Every order that beat (including misses / empty targets) gets a connector when the shooter hex is known.
 * When to use: `runRangedPhase` and tactical playback merge for infra-only orders not passed into combat.
 * Expected outcome: One line per order whose `unitId` exists in `unitById`; skipped when unit missing.
 * Exceptions: None.
 */
export function directShotLinesFromOrders(
  orders: readonly { unitId: string; targetH3Index: string }[],
  unitById: ReadonlyMap<string, { h3Index: string }>
): RangedResolutionShotLine[] {
  const out: RangedResolutionShotLine[] = [];
  for (const order of orders) {
    const unit = unitById.get(order.unitId);
    if (!unit) continue;
    out.push({ fromH3Index: unit.h3Index, toH3Index: order.targetH3Index });
  }
  return out;
}

/**
 * Builds return-fire shot lines for one engagement using the same range eligibility as combat resolution.
 *
 * Purpose: Show defender→attacker connectors for every return-fire attempt (including misses), not only kills.
 * When to use: Inside `runRangedPhase` for each engagement that runs with return fire enabled.
 * Expected outcome: Unique pairs from `defenderHex` to each attacker hex in range of at least one eligible defender.
 * Exceptions: None; invalid H3 distance checks are treated as out of range.
 */
export function returnFireShotLinesForEngagement(args: {
  defenderHex: string;
  attackerHexes: readonly string[];
  defenderUnits: readonly { unitType: string }[];
  getRange: (unitType: string) => number;
}): RangedResolutionShotLine[] {
  const { defenderHex, attackerHexes, defenderUnits, getRange } = args;
  if (attackerHexes.length === 0 || defenderUnits.length === 0) return [];
  const out: RangedResolutionShotLine[] = [];
  const seen = new Set<string>();
  for (const u of defenderUnits) {
    const range = getRange(u.unitType);
    if (range < 1) continue;
    for (const attackerHex of attackerHexes) {
      if (attackerHex === defenderHex) continue;
      let inRange = false;
      try {
        inRange = gridDistance(defenderHex, attackerHex) <= range;
      } catch {
        inRange = false;
      }
      if (!inRange) continue;
      const line = { fromH3Index: defenderHex, toH3Index: attackerHex };
      const key = shotLineKey(line);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(line);
    }
  }
  return out;
}

/**
 * Keeps only shot lines whose both endpoints are in the visible hex set.
 *
 * Purpose: Strategic fog must not reveal attacker/target via a connector when either end is hidden.
 * When to use: Renderer draw path when a visibility set is available; pass null/undefined to skip filtering.
 * Expected outcome: Subset of `lines`; empty when none fully visible.
 * Exceptions: None.
 */
export function filterShotLinesByVisibleEndpoints(
  lines: readonly RangedResolutionShotLine[],
  visibleHexes: ReadonlySet<string> | null | undefined
): RangedResolutionShotLine[] {
  if (!visibleHexes) return [...lines];
  return lines.filter(
    (line) => visibleHexes.has(line.fromH3Index) && visibleHexes.has(line.toH3Index)
  );
}
