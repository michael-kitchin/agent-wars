/**
 * Combat resolution per combat spec: participant IDs, ranged phase (declared attacks;
 * defenders with range may return fire when attackers are in range), then melee phase.
 * One d6 per unit, hit when roll ≤ attack/defense; casualty priority lowest defense first,
 * then infantry → armor → naval. Uses seeded RNG for determinism.
 */

import { gridDistance } from 'h3-js';
import { getAttack, getDefense, getRange, casualtyPriorityIndex } from './combatConstants';
import { createSeededRng } from './seededRng';
import { logDebug } from './logger';
import type { RangedAttackOrder } from './gameActions';
import type { CombatUnit } from './combatUnitTypes';

export type { CombatUnit } from './combatUnitTypes';

/**
 * Documents the `OneEngagementResult` interface as a named contract surface (export interface OneEngagementResult).

 * Purpose: Supports maintainability by documenting why `OneEngagementResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface OneEngagementResult {
    /**
   * Specifies the contract for the `attackerRemovedIds` member (attackerRemovedIds: string[];).

   * Contract: Describes stable behavior for callers of `attackerRemovedIds` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
attackerRemovedIds: string[];
    /**
   * Specifies the contract for the `defenderRemovedIds` member (defenderRemovedIds: string[];).

   * Contract: Describes stable behavior for callers of `defenderRemovedIds` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
defenderRemovedIds: string[];
}

/**
 * Defines the `resolveOneRangedEngagement` function shape (export function resolveOneRangedEngagement( attackerUnits: CombatUnit[], defenderUnits: CombatUnit[], defenderHexH3: string, rollD6: () => number,).

 * Purpose: Supports maintainability by documenting why `resolveOneRangedEngagement` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function resolveOneRangedEngagement(
  attackerUnits: CombatUnit[],
  defenderUnits: CombatUnit[],
  defenderHexH3: string,
  rollD6: () => number,
  options?: { skipReturnFire?: boolean }
): OneEngagementResult {
  const attackerRemovedIds: string[] = [];
  const defenderRemovedIds: string[] = [];
  const removedAtk = new Set<string>();

  const attackerHexes = [...new Set(attackerUnits.map((u) => u.h3Index))];
  let attackerHits = 0;
  for (const u of attackerUnits) {
    if (rollD6() <= getAttack(u.unitType)) attackerHits++;
  }
  let defenderHits = 0;
  if (!options?.skipReturnFire) {
    for (const u of defenderUnits) {
      const range = getRange(u.unitType);
      if (range < 1) continue;
      const canReturnFire = attackerHexes.some((h) => {
        try {
          return gridDistance(defenderHexH3, h) <= range;
        } catch {
          return false;
        }
      });
      if (canReturnFire && rollD6() <= getAttack(u.unitType)) defenderHits++;
    }
  }

  const defSorted = [...defenderUnits].sort(
    (a, b) =>
      getDefense(a.unitType) - getDefense(b.unitType) ||
      casualtyPriorityIndex(a.unitType) - casualtyPriorityIndex(b.unitType)
  );
  for (let h = 0; h < attackerHits && h < defSorted.length; h++) {
    defenderRemovedIds.push(defSorted[h]!.id);
  }

  for (let h = 0; h < defenderHits; h++) {
    const atkAlive = attackerUnits.filter((u) => !removedAtk.has(u.id));
    const byHex = new Map<string, CombatUnit[]>();
    for (const u of atkAlive) {
      const list = byHex.get(u.h3Index) ?? [];
      list.push(u);
      byHex.set(u.h3Index, list);
    }
    let bestHex: string | null = null;
    let bestCount = -1;
    for (const [hex, list] of byHex) {
      if (list.length > bestCount || (list.length === bestCount && (bestHex === null || hex < bestHex!))) {
        bestCount = list.length;
        bestHex = hex;
      }
    }
    if (!bestHex) break;
    const unitsAtHex = (byHex.get(bestHex) ?? []).sort(
      (a, b) =>
        getDefense(a.unitType) - getDefense(b.unitType) ||
        casualtyPriorityIndex(a.unitType) - casualtyPriorityIndex(b.unitType)
    );
    const u = unitsAtHex.find((x) => !removedAtk.has(x.id));
    if (u) {
      removedAtk.add(u.id);
      attackerRemovedIds.push(u.id);
    }
  }

  return { attackerRemovedIds, defenderRemovedIds };
}

/**
 * Defines the `resolveOneMeleeEngagement` function shape (export function resolveOneMeleeEngagement().

 * Purpose: Supports maintainability by documenting why `resolveOneMeleeEngagement` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function resolveOneMeleeEngagement(
  attackerUnits: CombatUnit[],
  defenderUnits: CombatUnit[],
  rollD6: () => number
): OneEngagementResult {
  const attackerRemovedIds: string[] = [];
  const defenderRemovedIds: string[] = [];

  let atkHits = 0;
  for (const u of attackerUnits) {
    if (rollD6() <= getAttack(u.unitType)) atkHits++;
  }
  let defHits = 0;
  for (const u of defenderUnits) {
    if (rollD6() <= getDefense(u.unitType)) defHits++;
  }

  const defSorted = [...defenderUnits].sort(
    (a, b) =>
      getDefense(a.unitType) - getDefense(b.unitType) ||
      casualtyPriorityIndex(a.unitType) - casualtyPriorityIndex(b.unitType)
  );
  for (let i = 0; i < atkHits && i < defSorted.length; i++) {
    defenderRemovedIds.push(defSorted[i]!.id);
  }
  const atkSorted = [...attackerUnits].sort(
    (a, b) =>
      getDefense(a.unitType) - getDefense(b.unitType) ||
      casualtyPriorityIndex(a.unitType) - casualtyPriorityIndex(b.unitType)
  );
  for (let i = 0; i < defHits && i < atkSorted.length; i++) {
    attackerRemovedIds.push(atkSorted[i]!.id);
  }

  return { attackerRemovedIds, defenderRemovedIds };
}

/**
 * Documents the `KillRecord` interface as a named contract surface (export interface KillRecord).

 * Purpose: Supports maintainability by documenting why `KillRecord` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface KillRecord {
    /**
   * Specifies the contract for the `victimId` member (victimId: string;).

   * Contract: Describes stable behavior for callers of `victimId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
victimId: string;
    /**
   * Specifies the contract for the `killerIds` member (killerIds: string[];).

   * Contract: Describes stable behavior for callers of `killerIds` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
killerIds: string[];
}

/**
 * Documents the `CombatResolutionResult` interface as a named contract surface (export interface CombatResolutionResult).

 * Purpose: Supports maintainability by documenting why `CombatResolutionResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface CombatResolutionResult {
    /**
   * Specifies the contract for the `combatHexes` member (combatHexes: string[];).

   * Contract: Describes stable behavior for callers of `combatHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
combatHexes: string[];
    /**
   * Specifies the contract for the `removedUnitIds` member (removedUnitIds: string[];).

   * Contract: Describes stable behavior for callers of `removedUnitIds` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
removedUnitIds: string[];
    /**
   * Specifies the contract for the `casualtyHexes` member (casualtyHexes: string[];).

   * Contract: Describes stable behavior for callers of `casualtyHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
casualtyHexes: string[];
    /**
   * Specifies the contract for the `removedUnits` member (removedUnits: CombatUnit[];).

   * Contract: Describes stable behavior for callers of `removedUnits` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
removedUnits: CombatUnit[];
    /**
   * Specifies the contract for the `kills` member (kills: KillRecord[];).

   * Contract: Describes stable behavior for callers of `kills` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
kills: KillRecord[];
    /**
   * Specifies the contract for the `killsByDirectFire` member (killsByDirectFire?: KillRecord[];).

   * Contract: Describes stable behavior for callers of `killsByDirectFire` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
killsByDirectFire?: KillRecord[];
    /**
   * Specifies the contract for the `killsByReturnFire` member (killsByReturnFire?: KillRecord[];).

   * Contract: Describes stable behavior for callers of `killsByReturnFire` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
killsByReturnFire?: KillRecord[];
}

/**
 * Documents the `RangedEngagementGroup` interface as a named contract surface (interface RangedEngagementGroup).

 * Purpose: Supports maintainability by documenting why `RangedEngagementGroup` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface RangedEngagementGroup {
    /**
   * Specifies the contract for the `defenderHex` member (defenderHex: string;).

   * Contract: Describes stable behavior for callers of `defenderHex` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
defenderHex: string;
    /**
   * Specifies the contract for the `attackerPlayer` member (attackerPlayer: string;).

   * Contract: Describes stable behavior for callers of `attackerPlayer` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
attackerPlayer: string;
    /**
   * Specifies the contract for the `attackerUnitIds` member (attackerUnitIds: string[];).

   * Contract: Describes stable behavior for callers of `attackerUnitIds` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
attackerUnitIds: string[];
}

/**
 * Defines the `recordRemovedUnit` function shape (function recordRemovedUnit(payload: { removed: Set<string>; removedUnits: CombatUnit[]; casualtyHexSet: Set<string>; kills: KillRecord[]; victim:).

 * Purpose: Supports maintainability by documenting why `recordRemovedUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function recordRemovedUnit(payload: {
  removed: Set<string>;
  removedUnits: CombatUnit[];
  casualtyHexSet: Set<string>;
  kills: KillRecord[];
  victim: CombatUnit;
  casualtyHex: string;
  killerIds: string[];
}): void {
  payload.removed.add(payload.victim.id);
  payload.removedUnits.push({
    id: payload.victim.id,
    player: payload.victim.player,
    unitType: payload.victim.unitType,
    h3Index: payload.casualtyHex,
    displayOrder: payload.victim.displayOrder,
  });
  payload.casualtyHexSet.add(payload.casualtyHex);
  payload.kills.push({ victimId: payload.victim.id, killerIds: payload.killerIds });
}

/**
 * Defines the `buildRangedEngagementGroups` function shape (function buildRangedEngagementGroups( rangedOrders: RangedAttackOrder[], unitById: ReadonlyMap<string, CombatUnit>, removed: ReadonlySet<string> ): Ra).

 * Purpose: Supports maintainability by documenting why `buildRangedEngagementGroups` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildRangedEngagementGroups(
  rangedOrders: RangedAttackOrder[],
  unitById: ReadonlyMap<string, CombatUnit>,
  removed: ReadonlySet<string>
): RangedEngagementGroup[] {
  const grouped = new Map<string, { defenderHex: string; attackerPlayer: string; attackerUnitIds: Set<string> }>();
  for (const order of rangedOrders) {
    const unit = unitById.get(order.unitId);
    if (!unit || removed.has(unit.id)) continue;
    const key = `${order.targetH3Index}::${unit.player}`;
    const group = grouped.get(key) ?? {
      defenderHex: order.targetH3Index,
      attackerPlayer: unit.player,
      attackerUnitIds: new Set<string>(),
    };
    group.attackerUnitIds.add(unit.id);
    grouped.set(key, group);
  }
  return Array.from(grouped.values())
    .map((g) => ({
      defenderHex: g.defenderHex,
      attackerPlayer: g.attackerPlayer,
      attackerUnitIds: Array.from(g.attackerUnitIds),
    }))
    .sort((a, b) => a.defenderHex.localeCompare(b.defenderHex) || a.attackerPlayer.localeCompare(b.attackerPlayer));
}

/**
 * Defines the `runRangedPhase` function shape (export function runRangedPhase( units: CombatUnit[], hexList: string[], rangedOrders: RangedAttackOrder[], next: () => number ): CombatResolutionRe).

 * Purpose: Supports maintainability by documenting why `runRangedPhase` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function runRangedPhase(
  units: CombatUnit[],
  hexList: string[],
  rangedOrders: RangedAttackOrder[],
  next: () => number
): CombatResolutionResult {
  logDebug('runRangedPhase', { unitCount: units.length, rangedOrderCount: rangedOrders.length });
  const removed = new Set<string>();
  const removedUnits: CombatUnit[] = [];
  const casualtyHexSet = new Set<string>();
  const combatHexes: string[] = [];
  const unitList = units.filter((u) => !removed.has(u.id));
  const unitById = new Map(unitList.map((u) => [u.id, u] as const));
  const getUnitsAtHex = (h3: string) => unitList.filter((u) => !removed.has(u.id) && u.h3Index === h3);
  const rollD6 = () => Math.floor(next() * 6) + 1;

  const kills: KillRecord[] = [];
  const killsByDirectFire: KillRecord[] = [];
  const killsByReturnFire: KillRecord[] = [];

  const engagementGroups = buildRangedEngagementGroups(rangedOrders, unitById, removed);
  for (const group of engagementGroups) {
    const attackerUnits = group.attackerUnitIds
      .map((unitId) => unitById.get(unitId))
      .filter((u): u is CombatUnit => u != null && !removed.has(u.id));
    // Ranged engagements are side-vs-side: only enemy units in the target hex can be hit or return fire.
    const defenderUnits = getUnitsAtHex(group.defenderHex).filter((u) => u.player !== group.attackerPlayer);
    if (attackerUnits.length === 0 || defenderUnits.length === 0) continue;

    const attackerHexes = [...new Set(attackerUnits.map((u) => u.h3Index))];
    combatHexes.push(group.defenderHex);
    for (const ah of attackerHexes) combatHexes.push(ah);

    const { attackerRemovedIds, defenderRemovedIds } = resolveOneRangedEngagement(
      attackerUnits,
      defenderUnits,
      group.defenderHex,
      rollD6,
      {}
    );
    const attackerUnitIds = attackerUnits.map((u) => u.id);
    const defenderUnitIds = defenderUnits.map((u) => u.id);
    for (const id of defenderRemovedIds) {
      const u = unitById.get(id);
      if (u) {
        recordRemovedUnit({
          removed,
          removedUnits,
          casualtyHexSet,
          kills,
          victim: u,
          casualtyHex: u.h3Index,
          killerIds: attackerUnitIds,
        });
        killsByDirectFire.push({ victimId: id, killerIds: attackerUnitIds });
      }
    }
    for (const id of attackerRemovedIds) {
      const u = unitById.get(id);
      if (u) {
        recordRemovedUnit({
          removed,
          removedUnits,
          casualtyHexSet,
          kills,
          victim: u,
          casualtyHex: u.h3Index,
          killerIds: defenderUnitIds,
        });
        killsByReturnFire.push({ victimId: id, killerIds: defenderUnitIds });
      }
    }
  }

  const combatHexSet = new Set(combatHexes);
  const removedIds = Array.from(removed);
  const casualtyHexes = Array.from(casualtyHexSet);
  logDebug('runRangedPhase complete', { combatHexCount: combatHexes.length, removedCount: removedIds.length });
  return {
    combatHexes: hexList.filter((h) => combatHexSet.has(h)),
    removedUnitIds: removedIds,
    casualtyHexes,
    removedUnits,
    kills,
    killsByDirectFire: killsByDirectFire.length > 0 ? killsByDirectFire : undefined,
    killsByReturnFire: killsByReturnFire.length > 0 ? killsByReturnFire : undefined,
  };
}

/**
 * Defines the `runMeleePhase` function shape (export function runMeleePhase().

 * Purpose: Supports maintainability by documenting why `runMeleePhase` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function runMeleePhase(
  units: CombatUnit[],
  hexList: string[],
  next: () => number
): CombatResolutionResult {
  logDebug('runMeleePhase', { unitCount: units.length });
  const removed = new Set<string>();
  const removedUnits: CombatUnit[] = [];
  const kills: KillRecord[] = [];
  const casualtyHexSet = new Set<string>();
  const combatHexes: string[] = [];
  const unitList = units.filter((u) => !removed.has(u.id));
  const getUnitsAtHex = (h3: string) => unitList.filter((u) => !removed.has(u.id) && u.h3Index === h3);
  const rollD6 = () => Math.floor(next() * 6) + 1;

  const combatSides = new Set<string>();
  for (const h of hexList) {
    const unitsHere = getUnitsAtHex(h);
    const sides = new Set(unitsHere.map((u) => u.player));
    if (sides.size >= 2) sides.forEach((p) => combatSides.add(p));
  }
  const sideList = Array.from(combatSides).sort();
  const shuffled = [...sideList];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const participantIdByPlayer: Record<string, number> = {};
  shuffled.forEach((p, i) => {
    participantIdByPlayer[p] = i;
  });

  for (const hex of hexList) {
    const unitsHere = getUnitsAtHex(hex);
    const sides = new Set(unitsHere.map((u) => u.player));
    if (sides.size < 2) continue;

    combatHexes.push(hex);
    const sidesOrdered = Array.from(sides).sort(
      (a, b) => (participantIdByPlayer[a] ?? 99) - (participantIdByPlayer[b] ?? 99)
    );

    if (sidesOrdered.length === 2) {
      const [attackerSide, defenderSide] = sidesOrdered;
      const atkUnits = unitsHere.filter((u) => u.player === attackerSide);
      const defUnits = unitsHere.filter((u) => u.player === defenderSide);
      const { attackerRemovedIds, defenderRemovedIds } = resolveOneMeleeEngagement(atkUnits, defUnits, rollD6);
      const atkUnitIds = atkUnits.map((u) => u.id);
      const defUnitIds = defUnits.map((u) => u.id);
      for (const id of defenderRemovedIds) {
        const removedUnit = defUnits.find((u) => u.id === id)!;
        recordRemovedUnit({
          removed,
          removedUnits,
          casualtyHexSet,
          kills,
          victim: removedUnit,
          casualtyHex: hex,
          killerIds: atkUnitIds,
        });
      }
      for (const id of attackerRemovedIds) {
        const removedUnit = atkUnits.find((u) => u.id === id)!;
        recordRemovedUnit({
          removed,
          removedUnits,
          casualtyHexSet,
          kills,
          victim: removedUnit,
          casualtyHex: hex,
          killerIds: defUnitIds,
        });
      }
    } else {
      for (let k = 0; k < sidesOrdered.length; k++) {
        const attackerSide = sidesOrdered[k]!;
        const defenderSide = sidesOrdered[(k + 1) % sidesOrdered.length]!;
        const atkUnits = getUnitsAtHex(hex).filter((u) => u.player === attackerSide);
        const defUnits = getUnitsAtHex(hex).filter((u) => u.player === defenderSide);
        if (atkUnits.length === 0 || defUnits.length === 0) continue;
        const { attackerRemovedIds, defenderRemovedIds } = resolveOneMeleeEngagement(atkUnits, defUnits, rollD6);
        const atkUnitIds = atkUnits.map((u) => u.id);
        const defUnitIds = defUnits.map((u) => u.id);
        for (const id of defenderRemovedIds) {
          const u = defUnits.find((x) => x.id === id)!;
          recordRemovedUnit({
            removed,
            removedUnits,
            casualtyHexSet,
            kills,
            victim: u,
            casualtyHex: hex,
            killerIds: atkUnitIds,
          });
        }
        for (const id of attackerRemovedIds) {
          const u = atkUnits.find((x) => x.id === id)!;
          recordRemovedUnit({
            removed,
            removedUnits,
            casualtyHexSet,
            kills,
            victim: u,
            casualtyHex: hex,
            killerIds: defUnitIds,
          });
        }
      }
    }
  }

  const combatHexSet = new Set(combatHexes);
  const removedIds = Array.from(removed);
  const casualtyHexes = Array.from(casualtyHexSet);
  logDebug('runMeleePhase complete', { combatHexCount: combatHexes.length, removedCount: removedIds.length });
  return {
    combatHexes: hexList.filter((h) => combatHexSet.has(h)),
    removedUnitIds: removedIds,
    casualtyHexes,
    removedUnits,
    kills,
  };
}

/**
 * Defines the `createCombatRng` function shape (export function createCombatRng(seed: number): () => number).

 * Purpose: Supports maintainability by documenting why `createCombatRng` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function createCombatRng(seed: number): () => number {
  return createSeededRng(seed);
}
