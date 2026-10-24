/**
 * Pre-melee hex detection and modal row summaries for tactical melee intercept.
 */

import type { CombatUnit } from '../combatUnitTypes';
import type { MeleeCandidateRow } from '../../shared/ipcTypes';
import { HUMAN_SEAT_ID, isNeutralOwnerId } from '../../shared/seatIds';
import { logDebug, logTrace } from '../logger';
import { computeTacticalBattleSnapshot } from '../tacticalBattle/computeTacticalBattleSnapshot';

const UNIT_CATEGORY_ORDER = ['air', 'armor', 'infantry', 'naval'] as const;

/**
 * Lists strategic hexes where at least two players still have land-relevant combat units after movement and ranged.
 *
 * Purpose: Mirrors `runMeleePhase` eligibility without consuming RNG or mutating unit lists.
 * When to use: Immediately before melee during strategic ready to decide whether to pause for intercept.
 * Expected outcome: Deterministic ordering follows `hexList` iteration order.
 * Exceptions: None.
 */
export function listMeleeCandidateHexes(units: CombatUnit[], hexList: string[]): string[] {
  logTrace('listMeleeCandidateHexes', { unitCount: units.length, hexListCount: hexList.length });
  const getUnitsAtHex = (h3: string) => units.filter((u) => u.h3Index === h3);
  const out: string[] = [];
  for (const hex of hexList) {
    const unitsHere = getUnitsAtHex(hex);
    const sides = new Set(unitsHere.map((u) => u.player));
    if (sides.size >= 2) out.push(hex);
  }
  return out;
}

/**
 * Drops melee-candidate hexes where a tactical battle cannot be opened after the current ready (Fight would be impossible).
 *
 * Purpose: Ensures the intercept modal only lists hexes that can honor the Fight → tactical auto-start contract.
 * When to use: After `listMeleeCandidateHexes` and before building modal rows or pausing for a decision.
 * Expected outcome: Subset (possibly empty) of the input list; uses the same placement rules as `computeTacticalBattleSnapshot`.
 * Exceptions: None; probe failures for individual hexes simply omit that hex.
 */
export function filterMeleeCandidateHexesWithTacticalEntry(
  candidateHexes: readonly string[],
  options: { allowDuringStrategicResolution: boolean }
): string[] {
  logDebug('filterMeleeCandidateHexesWithTacticalEntry', {
    inputCount: candidateHexes.length,
    allowDuringStrategicResolution: options.allowDuringStrategicResolution,
  });
  const out: string[] = [];
  for (const hex of candidateHexes) {
    const probeBattleId = `melee-intercept-entry-probe|${hex}`;
    const { snapshot } = computeTacticalBattleSnapshot(hex, probeBattleId, {
      allowDuringStrategicResolution: options.allowDuringStrategicResolution,
    });
    if (snapshot) out.push(hex);
  }
  logDebug('filterMeleeCandidateHexesWithTacticalEntry complete', { outputCount: out.length });
  return out;
}

/**
 * Builds the "N type" summary string for one player stack at a hex, omitting zero categories in canonical order.
 *
 * Purpose: Stable human-readable counts for the intercept modal columns.
 * When to use: Once per player per melee candidate row.
 * Expected outcome: Example `2 infantry, 1 armor`; empty string when no units (should not occur for a candidate row).
 * Exceptions: None.
 */
export function formatMeleeUnitCategorySummary(units: CombatUnit[], playerId: string): string {
  const here = units.filter((u) => u.player === playerId);
  const counts: Record<(typeof UNIT_CATEGORY_ORDER)[number], number> = {
    air: 0,
    armor: 0,
    infantry: 0,
    naval: 0,
  };
  for (const u of here) {
    if (u.unitType in counts) counts[u.unitType as keyof typeof counts] += 1;
  }
  const parts: string[] = [];
  for (const key of UNIT_CATEGORY_ORDER) {
    const c = counts[key];
    if (c > 0) parts.push(`${c} ${key}`);
  }
  return parts.join(', ');
}

/**
 * A seat's order, used to name parties from left to right.
 *
 * Purpose: The row does not read the database.
 * When to use: `buildMeleeInterceptCandidateRows`.
 * Expected outcome: `seatOrder` matches the roster.
 * Exceptions: None.
 */
export interface MeleePartySeat {
  /**
   * The seat id.
   *
   * Contract: A seat id.
   * When to use: Matching a unit's owner.
   * Expected outcome: The roster id.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * Seat order, starting at 1.
   *
   * Contract: A positive integer.
   * When to use: Sorting parties after the human seat.
   * Expected outcome: Lower numbers come first.
   * Exceptions: None.
   */
  readonly seatOrder: number;
}

/**
 * Builds one row per contested hex.
 *
 * Purpose: The dialog lists every such hex, and marks which ones can be fought.
 * When to use: After the caller has kept the hexes the human can see.
 * Expected outcome: Parties are the human seat, then seat order, then Neutral. `tacticalEligible` is true only for the human seat and exactly one other owner. A later probe can clear that flag when a battle cannot be placed.
 * Exceptions: None.
 */
export function buildMeleeInterceptCandidateRows(
  candidateHexes: readonly string[],
  combatUnitsAfter: readonly CombatUnit[],
  seats: readonly MeleePartySeat[]
): MeleeCandidateRow[] {
  logTrace('buildMeleeInterceptCandidateRows', { candidateCount: candidateHexes.length, unitCount: combatUnitsAfter.length });
  return candidateHexes.map((h3Index) => {
    const atHex = combatUnitsAfter.filter((unit) => unit.h3Index === h3Index);
    const parties = partiesAtHex(atHex, seats);
    const tacticalEligible = parties.length === 2 && parties.some((party) => party.ownerId === HUMAN_SEAT_ID);
    return { h3Index, parties, tacticalEligible };
  });
}

/**
 * Owners on one hex, in display order, with their unit summaries.
 *
 * Purpose: The dialog and the tests share one order.
 * When to use: `buildMeleeInterceptCandidateRows`.
 * Expected outcome: Human, then seat order, then Neutral. Each summary counts only that owner's units on the hex.
 * Exceptions: None.
 */
function partiesAtHex(units: readonly CombatUnit[], seats: readonly MeleePartySeat[]): MeleeCandidateRow['parties'] {
  const owners = [...new Set(units.map((unit) => unit.player))];
  owners.sort((left, right) => partyRank(left, seats) - partyRank(right, seats) || left.localeCompare(right));
  return owners.map((ownerId) => ({
    ownerId,
    unitSummary: formatMeleeUnitCategorySummary([...units], ownerId),
  }));
}

/**
 * Sort rank for one owner.
 *
 * Purpose: Neutral stays last even when a seat order is high.
 * When to use: `partiesAtHex`.
 * Expected outcome: The human seat is 0. Neutral is last. Other seats use `seatOrder`.
 * Exceptions: None.
 */
function partyRank(ownerId: string, seats: readonly MeleePartySeat[]): number {
  if (ownerId === HUMAN_SEAT_ID) return 0;
  if (isNeutralOwnerId(ownerId)) return 1_000_000;
  return seats.find((seat) => seat.seatId === ownerId)?.seatOrder ?? 900_000;
}
