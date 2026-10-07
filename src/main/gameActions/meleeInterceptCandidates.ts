/**
 * Pre-melee hex detection and modal row summaries for tactical melee intercept.
 */

import type { CombatUnit } from '../combatUnitTypes';
import type { MeleeCandidateRow } from '../../shared/ipcTypes';
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
 * Builds IPC rows for every melee candidate hex using live combat unit snapshots.
 *
 * Purpose: Centralizes row assembly for ready pause and unit tests.
 * When to use: After `listMeleeCandidateHexes` returns a non-empty list.
 * Expected outcome: One `MeleeCandidateRow` per candidate hex with human/AI summaries counting only units **on that hex** (not global totals repeated per row).
 * Exceptions: None.
 */
export function buildMeleeInterceptCandidateRows(candidateHexes: string[], combatUnitsAfter: CombatUnit[]): MeleeCandidateRow[] {
  logTrace('buildMeleeInterceptCandidateRows', { candidateCount: candidateHexes.length, unitCount: combatUnitsAfter.length });
  return candidateHexes.map((h3Index) => {
    const atHex = combatUnitsAfter.filter((u) => u.h3Index === h3Index);
    return {
      h3Index,
      humanUnitSummary: formatMeleeUnitCategorySummary(atHex, 'human'),
      aiUnitSummary: formatMeleeUnitCategorySummary(atHex, 'opponent'),
    };
  });
}
