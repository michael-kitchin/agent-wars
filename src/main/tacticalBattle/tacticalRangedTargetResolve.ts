/**
 * Resolves tactical ranged targets for sub-units (closest in-range enemy cell with LOS) and generates per-beat DEFEND engagement orders.
 */

import type { TacticalOpponentPlanPayload } from '../../shared/ipc/consultationPushTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import {
  collectTacticalLegalRangedTargetHexes,
  tacticalMovementTerrainAnchorH3,
} from '../../shared/tacticalTerrainCombatModifiers';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import { gridHopDistanceBetween } from '../tools/assessUnitProximity';
import { logDebug, logTrace } from '../logger';

/**
 * Picks the closest enemy-occupied tactical cell the attacker may legally ranged-fire this beat.
 *
 * Purpose: Draft sanitization must not map strategic targets onto the footprint anchor when enemies occupy other tactical cells (e.g. naval vs land on a coastal hex).
 * When to use: `sanitizeOpponentTacticalDraftForReadyCommit` when a proposed ranged target is missing or invalid.
 * Expected outcome: An enemy sub-unit `h3Index` in the battle footprint that passes tactical range and mountain LOS, or `undefined` when none exist.
 * Exceptions: None. Legality is already settled by `collectTacticalLegalRangedTargetTacticalHexes`, so a cell whose distance
 * stays unmeasurable ranks last instead of being dropped; that keeps a legal shot rather than skipping the beat's fire.
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
  const legalHexes = collectTacticalLegalRangedTargetHexes(battle, attackerSubUnitId);
  const enemyHexes = legalHexes.filter((h3) =>
    battle.subUnits.some((s) => s.h3Index === h3 && s.player !== attacker.player)
  );
  if (enemyHexes.length === 0) return undefined;

  let best: { h3: string; dist: number } | null = null;
  for (const h3 of enemyHexes) {
    const dist = gridHopDistanceBetween(anchor, h3) ?? Number.POSITIVE_INFINITY;
    if (best === null || dist < best.dist) best = { h3, dist };
  }
  if (best) {
    logDebug('tacticalRangedTargetResolve pickClosestEnemyTacticalRangedTargetForSubUnit: selected', {
      battleId: battle.battleId,
      attackerSubUnitId,
      targetH3Index: best.h3,
      hopDistance: Number.isFinite(best.dist) ? best.dist : null,
    });
  }
  return best?.h3;
}

/**
 * Returns a valid tactical ranged target, preferring a proposed cell when it already hosts an enemy.
 *
 * Purpose: Defense-in-depth when upstream orders still carry a strategic-projected anchor or stale hex code.
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
    const legal = collectTacticalLegalRangedTargetHexes(battle, attackerSubUnitId);
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
 * Inputs for `collectTacticalTempoAttacks`, grouped so callers name each exclusion at the call site.
 *
 * Contract: `alreadyAttackingSubUnitIds` must hold every sub-unit that already has a ranged attack or air strike this
 * beat, and `holdFireParentUnitIds` every strategic parent under a `hold_fire` standing order.
 * When to use: Assembling the opponent's tactical attacks for a beat.
 * Expected outcome: Both sets may be empty; an empty `alreadyAttackingSubUnitIds` sweeps the whole force.
 * Exceptions: None.
 */
export type TacticalTempoAttackArgs = {
  /** Turn-start battle snapshot; tactical fire resolves before movement, so this must not be a post-move projection. */
  battle: TacticalBattleSnapshot;
  /** Player whose idle sub-units are swept. */
  playerId: string;
  /** Sub-units that already have an attack this beat, from the model or any earlier pass. */
  alreadyAttackingSubUnitIds: ReadonlySet<string>;
  /** Strategic parents told to hold fire; their sub-units are left alone. */
  holdFireParentUnitIds: ReadonlySet<string>;
};

/**
 * Emits one attack per idle sub-unit that has a legal shot, so a skipped beat does not forfeit tactical fire.
 *
 * Purpose: The tactical counterpart of the strategic tempo sweep. Tactical beats carry no standing orders, so before
 * this existed the model's reply was the only source of opponent attacks and a model that returned nothing simply did
 * not shoot. Targets come from `pickClosestEnemyTacticalRangedTargetForSubUnit`, which applies tactical range, terrain,
 * and mountain line of sight, so emitted rows are already legal.
 * When to use: Opponent tactical order assembly, after the model's own attacks are known.
 * Expected outcome: At most one row per sub-unit; air goes to `airStrikes` so the AA-defense phase applies, everything
 * else to `rangedAttacks`. No-op for sub-units with no legal enemy in reach.
 * Exceptions: None; target choice never throws.
 */
export function collectTacticalTempoAttacks(args: TacticalTempoAttackArgs): {
  rangedAttacks: { unitId: string; targetH3Index: string }[];
  airStrikes: { unitId: string; targetH3Index: string; targetType: 'units' }[];
} {
  const { battle, playerId, alreadyAttackingSubUnitIds, holdFireParentUnitIds } = args;
  logDebug('tacticalRangedTargetResolve collectTacticalTempoAttacks', {
    battleId: battle.battleId,
    playerId,
    alreadyAttackingCount: alreadyAttackingSubUnitIds.size,
    holdFireParentCount: holdFireParentUnitIds.size,
  });
  const rangedAttacks: { unitId: string; targetH3Index: string }[] = [];
  const airStrikes: { unitId: string; targetH3Index: string; targetType: 'units' }[] = [];
  for (const sub of battle.subUnits) {
    if (sub.player !== playerId) continue;
    if (alreadyAttackingSubUnitIds.has(sub.id)) continue;
    if (holdFireParentUnitIds.has(sub.parentUnitId)) continue;
    const target = pickClosestEnemyTacticalRangedTargetForSubUnit(battle, sub.id);
    if (!target) continue;
    if (sub.unitType === 'air') {
      airStrikes.push({ unitId: sub.id, targetH3Index: target, targetType: 'units' });
    } else {
      rangedAttacks.push({ unitId: sub.id, targetH3Index: target });
    }
  }
  logDebug('tacticalRangedTargetResolve collectTacticalTempoAttacks: result', {
    battleId: battle.battleId,
    playerId,
    rangedCount: rangedAttacks.length,
    airCount: airStrikes.length,
  });
  return { rangedAttacks, airStrikes };
}

/**
 * Adds tempo attacks to a buffered opponent tactical plan, creating one when the beat produced no plan at all.
 *
 * Purpose: A tactical beat only gets a plan when the post-beat policy decides to consult the model. On every other
 * beat the buffer is empty and the opponent used to sit out the beat entirely — a larger forfeiture than the model
 * inactivity the strategic sweep was written for. Running at commit rather than only at consultation makes the
 * guarantee hold for unconsulted beats, matching how the strategic fallback covers unconsulted turns.
 * When to use: `commitHumanTacticalDraftOrders`, against the pre-battle snapshot and before draft sanitization, so
 * added rows go through exactly the same validation as everything the model asked for.
 * Expected outcome: The draft's own rows are untouched and keep the targets the model chose; sub-units it never
 * mentioned gain at most one attack each. Returns the draft unchanged when there is nothing legal to add, which
 * includes returning `undefined` when there was no draft either.
 * Exceptions: None.
 */
export function withTacticalTempoAttacks(
  preBattle: TacticalBattleSnapshot,
  draft: TacticalOpponentPlanPayload | undefined,
  holdFireParentUnitIds: ReadonlySet<string>,
  playerId: string = AI_SEAT_IDS[0]
): TacticalOpponentPlanPayload | undefined {
  const sweep = collectTacticalTempoAttacks({
    battle: preBattle,
    playerId,
    alreadyAttackingSubUnitIds: new Set([
      ...(draft?.rangedAttacks ?? []).map((r) => r.unitId),
      ...(draft?.airStrikes ?? []).map((s) => s.unitId),
    ]),
    holdFireParentUnitIds,
  });
  logDebug('tacticalRangedTargetResolve withTacticalTempoAttacks', {
    battleId: preBattle.battleId,
    hadDraft: Boolean(draft),
    draftRanged: draft?.rangedAttacks.length ?? 0,
    draftAir: draft?.airStrikes.length ?? 0,
    sweepRanged: sweep.rangedAttacks.length,
    sweepAir: sweep.airStrikes.length,
  });
  if (sweep.rangedAttacks.length === 0 && sweep.airStrikes.length === 0) return draft;
  return {
    movementOrders: draft?.movementOrders ?? [],
    rangedAttacks: [...(draft?.rangedAttacks ?? []), ...sweep.rangedAttacks],
    airStrikes: [...(draft?.airStrikes ?? []), ...sweep.airStrikes],
    ferryOrders: draft?.ferryOrders ?? [],
    embarkOrders: draft?.embarkOrders ?? [],
  };
}
