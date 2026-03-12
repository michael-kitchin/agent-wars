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

/** Minimal unit snapshot for resolution (positions are post-movement). */
export interface CombatUnit {
  id: string;
  player: string;
  unitType: string;
  h3Index: string;
}

/** Records which unit(s) caused a casualty (for kill announcements). */
export interface KillRecord {
  victimId: string;
  killerIds: string[];
}

export interface CombatResolutionResult {
  combatHexes: string[];
  removedUnitIds: string[];
  /** Hexes where at least one unit was removed (for casualty overlay). */
  casualtyHexes: string[];
  /** Snapshot of each removed unit at death (for display until death animation ends). */
  removedUnits: CombatUnit[];
  /** Per-casualty killer attribution for announcements. */
  kills: KillRecord[];
}

/**
 * Runs only the ranged phase: declared attacks at current positions, return fire, casualties.
 * Call before movement. Caller must delete returned removedUnitIds from DB.
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
  const getUnitsAtHex = (h3: string) => unitList.filter((u) => !removed.has(u.id) && u.h3Index === h3);
  const rollD6 = () => Math.floor(next() * 6) + 1;

  const kills: KillRecord[] = [];

  const assignAttackerHitsToDefenderHex = (
    defenderHex: string,
    numHits: number,
    attackerUnitIds: string[]
  ): void => {
    let unitsAtD = getUnitsAtHex(defenderHex).sort(
      (a, b) =>
        getDefense(a.unitType) - getDefense(b.unitType) ||
        casualtyPriorityIndex(a.unitType) - casualtyPriorityIndex(b.unitType)
    );
    for (let h = 0; h < numHits && unitsAtD.length > 0; h++) {
      const u = unitsAtD[0]!;
      removed.add(u.id);
      removedUnits.push({ id: u.id, player: u.player, unitType: u.unitType, h3Index: u.h3Index });
      casualtyHexSet.add(u.h3Index);
      kills.push({ victimId: u.id, killerIds: attackerUnitIds });
      unitsAtD = getUnitsAtHex(defenderHex).sort(
        (a, b) =>
          getDefense(a.unitType) - getDefense(b.unitType) ||
          casualtyPriorityIndex(a.unitType) - casualtyPriorityIndex(b.unitType)
      );
    }
  };

  const assignDefenderHitsToAttackerHexes = (
    attackerHexToCount: Map<string, number>,
    numHits: number,
    defenderUnitIds: string[]
  ): void => {
    for (let h = 0; h < numHits; h++) {
      let bestHex: string | null = null;
      let bestCount = -1;
      for (const [hex] of attackerHexToCount) {
        const alive = getUnitsAtHex(hex).length;
        if (alive <= 0) continue;
        if (alive > bestCount || (alive === bestCount && (bestHex === null || hex < bestHex!))) {
          bestCount = alive;
          bestHex = hex;
        }
      }
      if (!bestHex) break;
      const unitsAtHex = getUnitsAtHex(bestHex).sort(
        (a, b) =>
          getDefense(a.unitType) - getDefense(b.unitType) ||
          casualtyPriorityIndex(a.unitType) - casualtyPriorityIndex(b.unitType)
      );
      if (unitsAtHex.length > 0) {
        const u = unitsAtHex[0]!;
        removed.add(u.id);
        removedUnits.push({ id: u.id, player: u.player, unitType: u.unitType, h3Index: u.h3Index });
        casualtyHexSet.add(u.h3Index);
        kills.push({ victimId: u.id, killerIds: defenderUnitIds });
      }
    }
  };

  const rangedByDefender = new Map<string, { attackerHex: string; unitId: string }[]>();
  for (const order of rangedOrders) {
    const unit = unitList.find((u) => u.id === order.unitId && !removed.has(u.id));
    if (!unit) continue;
    const list = rangedByDefender.get(order.targetH3Index) ?? [];
    list.push({ attackerHex: unit.h3Index, unitId: unit.id });
    rangedByDefender.set(order.targetH3Index, list);
  }

  const sortedDefenderHexes = hexList.filter((h) => rangedByDefender.has(h));
  for (const defenderHex of sortedDefenderHexes) {
    const attackers = rangedByDefender.get(defenderHex)!;
    const attackerUnits = attackers
      .map((a) => unitList.find((u) => u.id === a.unitId))
      .filter((u): u is CombatUnit => u != null && !removed.has(u.id));
    const defenderUnits = getUnitsAtHex(defenderHex);
    if (attackerUnits.length === 0 || defenderUnits.length === 0) continue;

    const attackerHexes = [...new Set(attackerUnits.map((u) => u.h3Index))];
    combatHexes.push(defenderHex);
    for (const ah of attackerHexes) combatHexes.push(ah);

    let attackerHits = 0;
    for (const u of attackerUnits) {
      if (rollD6() <= getAttack(u.unitType)) attackerHits++;
    }
    let defenderHits = 0;
    for (const u of defenderUnits) {
      const range = getRange(u.unitType);
      if (range < 1) continue;
      const canReturnFire = attackerHexes.some((attackerHex) => {
        try {
          return gridDistance(defenderHex, attackerHex) <= range;
        } catch {
          return false;
        }
      });
      if (canReturnFire && rollD6() <= getAttack(u.unitType)) defenderHits++;
    }

    const attackerUnitIds = attackerUnits.map((u) => u.id);
    const defenderUnitIds = defenderUnits.map((u) => u.id);
    assignAttackerHitsToDefenderHex(defenderHex, attackerHits, attackerUnitIds);

    const attackerHexCount = new Map<string, number>();
    for (const u of attackerUnits) {
      if (removed.has(u.id)) continue;
      attackerHexCount.set(u.h3Index, (attackerHexCount.get(u.h3Index) ?? 0) + 1);
    }
    assignDefenderHitsToAttackerHexes(attackerHexCount, defenderHits, defenderUnitIds);
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
  };
}

/**
 * Runs only the melee phase: same-hex combats at given positions. Participant IDs from units' players.
 * Call after movement. Caller must delete returned removedUnitIds from DB.
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
      let atkHits = 0;
      for (const u of atkUnits) {
        if (rollD6() <= getAttack(u.unitType)) atkHits++;
      }
      let defHits = 0;
      for (const u of defUnits) {
        if (rollD6() <= getDefense(u.unitType)) defHits++;
      }
      const defSorted = [...defUnits].sort(
        (a, b) =>
          getDefense(a.unitType) - getDefense(b.unitType) ||
          casualtyPriorityIndex(a.unitType) - casualtyPriorityIndex(b.unitType)
      );
      const atkUnitIds = atkUnits.map((u) => u.id);
      const defUnitIds = defUnits.map((u) => u.id);
      for (let i = 0; i < atkHits && i < defSorted.length; i++) {
        const u = defSorted[i]!;
        removed.add(u.id);
        removedUnits.push({ id: u.id, player: u.player, unitType: u.unitType, h3Index: hex });
        casualtyHexSet.add(hex);
        kills.push({ victimId: u.id, killerIds: atkUnitIds });
      }
      const atkSorted = [...atkUnits].sort(
        (a, b) =>
          getDefense(a.unitType) - getDefense(b.unitType) ||
          casualtyPriorityIndex(a.unitType) - casualtyPriorityIndex(b.unitType)
      );
      for (let i = 0; i < defHits && i < atkSorted.length; i++) {
        const u = atkSorted[i]!;
        removed.add(u.id);
        removedUnits.push({ id: u.id, player: u.player, unitType: u.unitType, h3Index: hex });
        casualtyHexSet.add(hex);
        kills.push({ victimId: u.id, killerIds: defUnitIds });
      }
    } else {
      for (let k = 0; k < sidesOrdered.length; k++) {
        const attackerSide = sidesOrdered[k]!;
        const defenderSide = sidesOrdered[(k + 1) % sidesOrdered.length]!;
        const atkUnits = getUnitsAtHex(hex).filter((u) => u.player === attackerSide);
        const defUnits = getUnitsAtHex(hex).filter((u) => u.player === defenderSide);
        if (atkUnits.length === 0 || defUnits.length === 0) continue;
        let atkHits = 0;
        for (const u of atkUnits) {
          if (rollD6() <= getAttack(u.unitType)) atkHits++;
        }
        const defSorted = [...defUnits].sort(
          (a, b) =>
            getDefense(a.unitType) - getDefense(b.unitType) ||
            casualtyPriorityIndex(a.unitType) - casualtyPriorityIndex(b.unitType)
        );
        const atkUnitIds = atkUnits.map((u) => u.id);
        for (let i = 0; i < atkHits && i < defSorted.length; i++) {
          const u = defSorted[i]!;
          removed.add(u.id);
          removedUnits.push({ id: u.id, player: u.player, unitType: u.unitType, h3Index: hex });
          casualtyHexSet.add(hex);
          kills.push({ victimId: u.id, killerIds: atkUnitIds });
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
 * Creates a seeded RNG from the game seed for use in combat resolution.
 * Exported so ready() can pass the same RNG to runCombatResolution.
 */
export function createCombatRng(seed: number): () => number {
  return createSeededRng(seed);
}
