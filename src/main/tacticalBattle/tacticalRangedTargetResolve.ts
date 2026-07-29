/**
 * Resolves tactical res4 ranged targets for sub-units (closest in-range enemy cell with LOS) and generates per-beat DEFEND engagement orders.
 */

import { gridDistance } from 'h3-js';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import {
  collectTacticalLegalRangedTargetRes4Hexes,
  tacticalMovementTerrainAnchorH3,
} from '../../shared/tacticalTerrainCombatModifiers';
import { logDebug, logTrace } from '../logger';

/**
 * Picks the closest enemy-occupied res4 cell the attacker may legally ranged-fire this beat.
 *
 * Purpose: Draft sanitization must not map strategic res1 targets onto the footprint anchor when enemies occupy other res4 cells (e.g. naval vs land on a coastal hex).
 * When to use: `sanitizeOpponentTacticalDraftForReadyCommit` when a proposed ranged target is missing or invalid.
 * Expected outcome: An enemy sub-unit `h3Index` in the battle footprint that passes tactical range and mountain LOS, or `undefined` when none exist.
 * Exceptions: None; invalid grid pairs are skipped.
 */
export function pickClosestEnemyTacticalRangedTargetForSubUnit(
  battle: TacticalBattleSnapshot,
  attackerSubUnitId: string
): string | undefined {
  logTrace('tacticalRangedTargetResolve pickClosestEnemyTacticalRangedTargetForSubUnit', {
    battleId: battle.battleId,
    attackerSubUnitId,
  });
  const attacker = battle.subUnits.find((s) => s.id === attackerSubUnitId);
  if (!attacker) return undefined;
  const anchor = tacticalMovementTerrainAnchorH3(attacker, battle.subUnits);
  const legalHexes = collectTacticalLegalRangedTargetRes4Hexes(battle, attackerSubUnitId);
  const enemyHexes = legalHexes.filter((h3) =>
    battle.subUnits.some((s) => s.h3Index === h3 && s.player !== attacker.player)
  );
  if (enemyHexes.length === 0) return undefined;

  let best: { h3: string; dist: number } | null = null;
  for (const h3 of enemyHexes) {
    try {
      const dist = gridDistance(anchor, h3);
      if (best === null || dist < best.dist) best = { h3, dist };
    } catch {
      continue;
    }
  }
  if (best) {
    logDebug('tacticalRangedTargetResolve pickClosestEnemyTacticalRangedTargetForSubUnit: selected', {
      battleId: battle.battleId,
      attackerSubUnitId,
      targetH3Index: best.h3,
      gridDistance: best.dist,
    });
  }
  return best?.h3;
}

/**
 * Returns a valid tactical ranged target, preferring a proposed cell when it already hosts an enemy.
 *
 * Purpose: Defense-in-depth when upstream orders still carry a res1-projected anchor or stale hex code.
 * When to use: Opponent tactical draft sanitization before dropping a ranged row.
 * Expected outcome: `proposedTargetH3Index` when an enemy sub-unit occupies it and the shot is legal; otherwise the closest legal enemy cell from `pickClosestEnemyTacticalRangedTargetForSubUnit`.
 * Exceptions: None.
 */
export function resolveTacticalRangedTargetForSubUnit(
  battle: TacticalBattleSnapshot,
  attackerSubUnitId: string,
  proposedTargetH3Index: string | undefined
): string | undefined {
  logDebug('tacticalRangedTargetResolve resolveTacticalRangedTargetForSubUnit', {
    battleId: battle.battleId,
    attackerSubUnitId,
    proposedTargetH3Index,
  });
  const attacker = battle.subUnits.find((s) => s.id === attackerSubUnitId);
  if (!attacker) return undefined;

  if (proposedTargetH3Index) {
    const legal = collectTacticalLegalRangedTargetRes4Hexes(battle, attackerSubUnitId);
    const enemyAtProposed = battle.subUnits.some(
      (s) => s.h3Index === proposedTargetH3Index && s.player !== attacker.player
    );
    if (legal.includes(proposedTargetH3Index) && enemyAtProposed) {
      return proposedTargetH3Index;
    }
  }
  return pickClosestEnemyTacticalRangedTargetForSubUnit(battle, attackerSubUnitId);
}

/**
 * Generates DEFEND standing-order engagement rows for all in-battle sub-units of a player whose parent carries a DEFEND order.
 *
 * Purpose: Each tactical beat, DEFEND sub-units auto-fire at the closest legal enemy res4 cell — mirroring the strategic per-turn auto-engage added by `appendDefendStandingOrderEngagement`, but operating on the res4 grid inside the active tactical footprint.
 * When to use: Tests and any remaining caller that needs DEFEND auto-engagement rows for a player; human Ready no longer merges standing DEFEND in tactical.
 * Expected outcome: At most one ranged or air-strike row per sub-unit; air sub-units go into `airStrikes` (AA-defense phase applies); non-air go into `rangedAttacks`. No-op when no legal enemy exists for a given sub-unit.
 * Exceptions: None; grid errors on individual targets are silently skipped.
 */
export function generateTacticalDefendEngagementForPlayer(
  battle: TacticalBattleSnapshot,
  playerId: string,
  defendParentUnitIds: readonly string[]
): {
  rangedAttacks: { unitId: string; targetH3Index: string }[];
  airStrikes: { unitId: string; targetH3Index: string; targetType: 'units' }[];
} {
  logDebug('tacticalRangedTargetResolve generateTacticalDefendEngagementForPlayer', {
    battleId: battle.battleId,
    playerId,
    defendParentCount: defendParentUnitIds.length,
  });
  const defendSet = new Set(defendParentUnitIds);
  const rangedAttacks: { unitId: string; targetH3Index: string }[] = [];
  const airStrikes: { unitId: string; targetH3Index: string; targetType: 'units' }[] = [];
  for (const sub of battle.subUnits) {
    if (sub.player !== playerId) continue;
    if (!defendSet.has(sub.parentUnitId)) continue;
    const target = pickClosestEnemyTacticalRangedTargetForSubUnit(battle, sub.id);
    if (!target) continue;
    if (sub.unitType === 'air') {
      airStrikes.push({ unitId: sub.id, targetH3Index: target, targetType: 'units' });
    } else {
      rangedAttacks.push({ unitId: sub.id, targetH3Index: target });
    }
  }
  logDebug('tacticalRangedTargetResolve generateTacticalDefendEngagementForPlayer: result', {
    battleId: battle.battleId,
    playerId,
    rangedCount: rangedAttacks.length,
    airCount: airStrikes.length,
  });
  return { rangedAttacks, airStrikes };
}
