/**
 * Applies validated opponent tactical orders (movement, embark, ferry, air vs units, ranged) onto a tactical battle snapshot.
 */

import type { AirStrikeOrder, EmbarkOrder, FerryOrder } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { tacticalLogQuery } from './tacticalLogging';
import {
  tacticalFindSubUnitIndexById,
  tacticalGuardOpponentAirSubUnitForFerry,
  tacticalRes4FootprintContains,
} from './tacticalSnapshotGuards';
import { projectTacticalSnapshotAfterOpponentMovementOrders } from './tacticalMovementApply';

/**
 * Picks a deterministic enemy sub-unit on a hex for a one-step tactical casualty (lowest id).
 *
 * Purpose: Keeps milestone 2.1 casualties predictable without strategic combat resolution.
 * When to use: Ranged and air-strike-vs-units projection when strategic dice resolution is out of scope.
 * Expected outcome: Undefined when no enemy occupies the hex; otherwise the lexicographically smallest matching id.
 * Exceptions: None.
 */
function pickEnemySubUnitIdAtHex(
  subUnits: readonly TacticalSubUnitSnapshot[],
  targetH3: string,
  attackerPlayer: string
): string | undefined {
  const ids = subUnits
    .filter((u) => u.h3Index === targetH3 && u.player !== attackerPlayer)
    .map((u) => u.id)
    .sort((a, b) => a.localeCompare(b));
  return ids[0];
}

/**
 * Expands a direct kill to include embarked cargo when a naval sub-unit is destroyed.
 *
 * Purpose: Mirrors strategic sealift loss behavior at tactical snapshot granularity.
 * When to use: After choosing a ranged or air victim that may be a carrier.
 * Expected outcome: Returns the victim id plus every land sub-unit embarked on that naval id.
 * Exceptions: None.
 */
function expandedRemovalIdsForVictim(subUnits: readonly TacticalSubUnitSnapshot[], victimId: string): string[] {
  const victim = subUnits.find((u) => u.id === victimId);
  const out = new Set<string>([victimId]);
  if (victim?.unitType === 'naval') {
    for (const u of subUnits) {
      if (u.embarkedOnSubUnitId === victimId) out.add(u.id);
    }
  }
  return [...out];
}

/**
 * Returns a new tactical snapshot after applying opponent-only validated orders in milestone 2.1 order: march, embark, ferry, air (unit targets), ranged.
 *
 * Contract: Inputs are assumed already validated; invalid rows are ignored defensively when ids or hexes mismatch.
 * When to use: `applyValidatedOpponentTacticalOrders` after `requestOrdersFlow` tactical validation passes.
 * Expected outcome: Sub-units move, sealift state updates, air ferries reposition, then casualties remove victims (and naval cargo) from `subUnits`.
 * Exceptions: None; logs trace skips for inconsistent rows.
 */
export function projectTacticalSnapshotAfterValidatedOpponentOrders(
  battle: TacticalBattleSnapshot,
  opts: {
    movementOrders: readonly { unitId: string; toH3Index: string }[];
    rangedAttacks?: readonly { unitId: string; targetH3Index: string }[];
    airStrikes?: readonly AirStrikeOrder[];
    ferryOrders?: readonly FerryOrder[];
    embarkOrders?: readonly EmbarkOrder[];
  }
): TacticalBattleSnapshot {
  tacticalLogQuery('projectTacticalSnapshotAfterValidatedOpponentOrders', {
    battleId: battle.battleId,
    movementCount: opts.movementOrders.length,
    rangedCount: opts.rangedAttacks?.length ?? 0,
    airCount: opts.airStrikes?.length ?? 0,
    ferryCount: opts.ferryOrders?.length ?? 0,
    embarkCount: opts.embarkOrders?.length ?? 0,
  });
  const next: TacticalBattleSnapshot =
    opts.movementOrders.length > 0
      ? projectTacticalSnapshotAfterOpponentMovementOrders(battle, opts.movementOrders)
      : battle;
  let sub: TacticalSubUnitSnapshot[] = next.subUnits.map((u) => ({ ...u }));
  const res4Set = new Set(next.res4ChildH3Indexes);

  const syncCargoToNavalHex = (): void => {
    const idTo = new Map(sub.map((u) => [u.id, u] as const));
    sub = sub.map((u) => {
      const e = u.embarkedOnSubUnitId;
      if (!e) return u;
      const n = idTo.get(e);
      return n && n.unitType === 'naval' ? { ...u, h3Index: n.h3Index } : u;
    });
  };

  for (const e of opts.embarkOrders ?? []) {
    const li = tacticalFindSubUnitIndexById(sub, e.unitId);
    if (li < 0) {
      tacticalLogQuery('projectTacticalSnapshotAfterValidatedOpponentOrders skip embark unknown land', { unitId: e.unitId });
      continue;
    }
    const land = sub[li]!;
    sub[li] = { ...land, embarkedOnSubUnitId: e.navalUnitId };
  }
  syncCargoToNavalHex();

  for (const f of opts.ferryOrders ?? []) {
    const fi = tacticalFindSubUnitIndexById(sub, f.unitId);
    if (fi < 0) continue;
    if (!tacticalGuardOpponentAirSubUnitForFerry(sub, fi)) continue;
    const air = sub[fi]!;
    if (!tacticalRes4FootprintContains(res4Set, f.destinationH3Index)) {
      tacticalLogQuery('projectTacticalSnapshotAfterValidatedOpponentOrders skip ferry outside footprint', {
        unitId: f.unitId,
        destinationH3Index: f.destinationH3Index,
      });
      continue;
    }
    sub[fi] = { ...air, h3Index: f.destinationH3Index };
  }
  syncCargoToNavalHex();

  const toRemove = new Set<string>();
  const markEnemyKillAtHex = (targetH3: string, attackerPlayer: string): void => {
    const vid = pickEnemySubUnitIdAtHex(sub, targetH3, attackerPlayer);
    if (!vid) return;
    for (const id of expandedRemovalIdsForVictim(sub, vid)) {
      toRemove.add(id);
    }
  };

  for (const s of opts.airStrikes ?? []) {
    if (s.targetType !== 'units') continue;
    const attacker = sub.find((u) => u.id === s.unitId);
    if (!attacker || attacker.player !== 'opponent') continue;
    markEnemyKillAtHex(s.targetH3Index, attacker.player);
  }

  for (const r of opts.rangedAttacks ?? []) {
    const attacker = sub.find((u) => u.id === r.unitId);
    if (!attacker || attacker.player !== 'opponent') continue;
    markEnemyKillAtHex(r.targetH3Index, attacker.player);
  }

  if (toRemove.size > 0) {
    sub = sub.filter((u) => !toRemove.has(u.id));
  }
  return { ...next, subUnits: sub };
}

/**
 * Returns a new tactical snapshot after applying validated human support drafts (embark, ferry, air strikes, ranged).
 *
 * Purpose: Mirrors tactical opponent support-order projection so human tactical Ready can commit non-march drafts.
 * When to use: Main tactical Ready commit after movement projection has already been validated/applied.
 * Expected outcome: Human embark/ferry rows mutate positions, then human fire rows remove one enemy unit per target hex.
 * Exceptions: None; inconsistent rows are skipped defensively with trace logs.
 */
export function projectTacticalSnapshotAfterValidatedHumanSupportOrders(
  battle: TacticalBattleSnapshot,
  opts: {
    rangedAttacks?: readonly { unitId: string; targetH3Index: string }[];
    airStrikes?: readonly AirStrikeOrder[];
    ferryOrders?: readonly FerryOrder[];
    embarkOrders?: readonly EmbarkOrder[];
  }
): TacticalBattleSnapshot {
  tacticalLogQuery('projectTacticalSnapshotAfterValidatedHumanSupportOrders', {
    battleId: battle.battleId,
    rangedCount: opts.rangedAttacks?.length ?? 0,
    airCount: opts.airStrikes?.length ?? 0,
    ferryCount: opts.ferryOrders?.length ?? 0,
    embarkCount: opts.embarkOrders?.length ?? 0,
  });
  let sub: TacticalSubUnitSnapshot[] = battle.subUnits.map((u) => ({ ...u }));
  const res4Set = new Set(battle.res4ChildH3Indexes);

  const syncCargoToNavalHex = (): void => {
    const idTo = new Map(sub.map((u) => [u.id, u] as const));
    sub = sub.map((u) => {
      const e = u.embarkedOnSubUnitId;
      if (!e) return u;
      const n = idTo.get(e);
      return n && n.unitType === 'naval' ? { ...u, h3Index: n.h3Index } : u;
    });
  };

  for (const e of opts.embarkOrders ?? []) {
    const li = tacticalFindSubUnitIndexById(sub, e.unitId);
    if (li < 0) continue;
    const land = sub[li]!;
    if (land.player !== 'human') continue;
    sub[li] = { ...land, embarkedOnSubUnitId: e.navalUnitId };
  }
  syncCargoToNavalHex();

  for (const f of opts.ferryOrders ?? []) {
    const fi = tacticalFindSubUnitIndexById(sub, f.unitId);
    if (fi < 0) continue;
    const air = sub[fi]!;
    if (air.player !== 'human' || air.unitType !== 'air') continue;
    if (!tacticalRes4FootprintContains(res4Set, f.destinationH3Index)) continue;
    sub[fi] = { ...air, h3Index: f.destinationH3Index };
  }
  syncCargoToNavalHex();

  const toRemove = new Set<string>();
  const markEnemyKillAtHex = (targetH3: string, attackerPlayer: string): void => {
    const vid = pickEnemySubUnitIdAtHex(sub, targetH3, attackerPlayer);
    if (!vid) return;
    for (const id of expandedRemovalIdsForVictim(sub, vid)) {
      toRemove.add(id);
    }
  };

  for (const s of opts.airStrikes ?? []) {
    if (s.targetType !== 'units') continue;
    const attacker = sub.find((u) => u.id === s.unitId);
    if (!attacker || attacker.player !== 'human') continue;
    markEnemyKillAtHex(s.targetH3Index, attacker.player);
  }

  for (const r of opts.rangedAttacks ?? []) {
    const attacker = sub.find((u) => u.id === r.unitId);
    if (!attacker || attacker.player !== 'human') continue;
    markEnemyKillAtHex(r.targetH3Index, attacker.player);
  }

  if (toRemove.size > 0) {
    sub = sub.filter((u) => !toRemove.has(u.id));
  }
  return { ...battle, subUnits: sub };
}
