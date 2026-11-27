/**
 * Tempo rule enforcement: makes a commander take legal shots the model declined to order.
 *
 * The strategic prompt tells the model "if a legal ranged_attack or air strike is available this turn, take it",
 * because these resolve from turn-start positions and cost nothing but the shot. A weaker model reads a very large
 * briefing and returns almost nothing, and the turn is silently forfeited: a captured turn 17 produced two no-op
 * march orders and no attacks at all while Best Options listed six legal shots.
 *
 * Standing orders only partly covered that, and only on strategic turns. DEFEND units auto-engaged, so which units
 * fought came down to which standing order they happened to be carrying rather than which had a target; tactical
 * beats had no auto-engagement at all, because standing orders do not reach sub-unit ids. This module closes both
 * gaps by sweeping every unit the player owns after the model's orders and the standing orders are both known.
 *
 * The sweep is a floor, never a ceiling. Anything the model ordered itself wins, and the briefing keeps flagging
 * every available shot so the model has no reason to leave target choice to the fallback.
 *
 * The sweep never chooses a unit of a side in the seat's `holdAutomaticFireAgainst` list. An attack the model
 * ordered against such a side is kept.
 */

import type { GameStateSnapshot } from '../../shared/ipcTypes';
import type { AiSeatId } from '../../shared/seatIds';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { collectTacticalTempoAttacks } from '../tacticalBattle/tacticalRangedTargetResolve';
import { logDebug } from '../logger';
import { appendNearestLegalEngagement, type StandingOrderGeneratedAirStrike } from './nearestLegalEngagement';
import { readHoldAutomaticFireAgainstSeatIds } from '../gameDb/holdAutomaticFireAgainstMemory';
import { stagePlanAttackPicks } from '../gameDb/holdAutomaticFireAgainstPlanPicks';
import { holdFireUnitIdsForPlayer } from './standingOrdersGeneration';

/**
 * Inputs for `collectTempoRuleAttacks`, grouped so the argument list stays short as callers add context.
 *
 * Contract: `alreadyAttackingUnitIds` must contain every unit that already has a ranged attack or air strike from
 * any source this turn, otherwise the sweep can emit a second attack for a unit that may only fire once.
 * When to use: Strategic opponent order assembly, after model orders and standing orders have been merged.
 * Expected outcome: Callers pass the same `state` snapshot used for the rest of order generation.
 * Exceptions: None.
 */
export type TempoRuleAttackArgs = {
  /** Player whose idle units are swept; only ever the opponent, since the human chooses their own shots. */
  playerId: string;
  /** Order-generation snapshot; enemy visibility already reflects fog for this player. */
  state: GameStateSnapshot;
  /** Units that already have an attack this turn, from the model or from standing orders. */
  alreadyAttackingUnitIds: ReadonlySet<string>;
};

/**
 * Returns extra attacks so no unit with a legal shot ends the turn without taking one.
 *
 * Purpose: Decouples the opponent's aggression from model compliance. Without this, whether a unit fires depends on
 * whether the model happened to mention it and on which standing order it carries.
 * When to use: Strategic opponent turns, after merging model and standing-order attacks. Not for the human, whose
 * attacks are theirs to choose, and not inside tactical battles — those use `collectTacticalTempoAttacks`, which
 * works on the tactical grid.
 * Expected outcome: At most one attack per swept unit, targeting its nearest legal enemy among the sides not in the
 * player's `holdAutomaticFireAgainst` list. Units already attacking, units under a `hold_fire` standing order, units
 * with no strategic range (infantry), and units with only listed sides in reach produce nothing.
 * Exceptions: None; an empty result is normal when every unit is already engaged or out of range.
 */
export function collectTempoRuleAttacks(args: TempoRuleAttackArgs): {
  rangedAttacks: { unitId: string; targetH3Index: string }[];
  airStrikes: StandingOrderGeneratedAirStrike[];
} {
  const { playerId, state, alreadyAttackingUnitIds } = args;
  logDebug('tempoRuleAttacks collectTempoRuleAttacks', {
    playerId,
    turnNumber: state.turnNumber,
    alreadyAttackingCount: alreadyAttackingUnitIds.size,
  });

  const rangedAttacks: { unitId: string; targetH3Index: string }[] = [];
  const airStrikes: StandingOrderGeneratedAirStrike[] = [];
  const enemyCount = state.units.filter((u) => u.player !== playerId).length;
  if (enemyCount === 0) {
    logDebug('tempoRuleAttacks collectTempoRuleAttacks: no visible enemies', { playerId });
    return { rangedAttacks, airStrikes };
  }

  const holdFireUnitIds = holdFireUnitIdsForPlayer(playerId);
  const sparedOwnerIds = readHoldAutomaticFireAgainstSeatIds(playerId);

  for (const unit of state.units) {
    if (unit.player !== playerId) continue;
    if (alreadyAttackingUnitIds.has(unit.id)) continue;
    if (holdFireUnitIds.has(unit.id)) continue;
    appendNearestLegalEngagement({ unit, playerId, unitId: unit.id, state, sparedOwnerIds, rangedAttacks, airStrikes });
  }

  logDebug('tempoRuleAttacks collectTempoRuleAttacks: result', {
    playerId,
    rangedAdded: rangedAttacks.length,
    airStrikesAdded: airStrikes.length,
    holdFireSkipped: holdFireUnitIds.size,
    sparedOwnerCount: sparedOwnerIds.size,
  });
  return { rangedAttacks, airStrikes };
}

/**
 * Inputs for `mergeCommanderAttackOrders`, kept as one object so the three attack sources stay named at call sites.
 *
 * Contract: `modelRanged` and `modelAirStrikes` must already be deduplicated per unit; this merge only resolves
 * conflicts *between* sources, not within one. Ids must all be in the same namespace: strategic unit ids on a
 * strategic turn, tactical sub-unit ids when `tacticalBattle` is set.
 * When to use: Assembling one commander's attacks on a consulted turn or beat.
 * Expected outcome: Passing `tacticalBattle` selects the tactical sweep; omitting it selects the strategic sweep.
 * Exceptions: None.
 */
export type MergeCommanderAttackOrdersArgs = {
  /**
   * Commander whose idle units the sweep may fire.
   *
   * Contract: An AI seat. The sweep, the `hold_fire` orders, and the `holdAutomaticFireAgainst` list use this seat.
   * When to use: Every consulted merge.
   * Expected outcome: Another seat's units are not swept.
   * Exceptions: None.
   */
  seatId: AiSeatId;
  /** Order-generation snapshot, used by the strategic sweep to find targets. */
  state: GameStateSnapshot;
  /**
   * Turn-start battle snapshot when this is a tactical beat. Tactical fire resolves before movement, so a post-move
   * projection would pick targets the resolution phase never sees.
   */
  tacticalBattle?: TacticalBattleSnapshot | null;
  /** Attacks produced by DEFEND, PURSUE, and engage-en-route standing orders; always empty in tactical. */
  standingOrderRanged: readonly { unitId: string; targetH3Index: string }[];
  /** Air strikes produced by DEFEND standing orders; always empty in tactical. */
  standingOrderAirStrikes: readonly StandingOrderGeneratedAirStrike[];
  /** Ranged attacks the model asked for, already deduplicated per unit. */
  modelRanged: readonly { unitId: string; targetH3Index: string }[];
  /** Air strikes the model asked for, already deduplicated per unit. */
  modelAirStrikes: readonly StandingOrderGeneratedAirStrike[];
  /**
   * Units the model is ferrying.
   *
   * Contract: Optional. A unit in this list keeps its ferry when the model did not also strike.
   * When to use: After the model's ferry rows are deduplicated.
   * Expected outcome: A standing-order strike and a tempo strike are not added for these units.
   * Exceptions: None.
   */
  modelFerryUnitIds?: readonly string[];
  /**
   * Units the model is dropping.
   *
   * Contract: Optional. A unit in this list keeps its drop when the model did not also strike.
   * When to use: After the model's drop rows are deduplicated.
   * Expected outcome: A standing-order strike and a tempo strike are not added for these units.
   * Exceptions: None.
   */
  modelAirDropUnitIds?: readonly string[];
};

/**
 * Combines standing-order attacks, the model's attacks, and the tempo sweep into one attack set per unit.
 *
 * Purpose: Three sources can each name the same unit, and only one attack per unit resolves. Precedence is explicit
 * here rather than spread across the request flow, so that the model keeps full agency: anything it ordered wins
 * outright, standing orders fill units it ignored, and the sweep only reaches units no other source claimed. A unit
 * the model named is dropped from *both* standing-order lists, not just the matching one, so a model-ordered
 * ranged attack cannot be shadowed by an auto air strike for the same unit.
 * When to use: Consulted turns and beats, before the merged attacks go through order validation.
 * Expected outcome: At most one entry per unit across both lists, with the model's choice preserved wherever it made
 * one. The sweep adds no attack on a side in the seat's `holdAutomaticFireAgainst` list; an attack the model ordered
 * against such a side is kept. On a world-map turn, the rows the engine chose are staged with `stagePlanAttackPicks`, and saved if the plan is stored.
 * Exceptions: None.
 */
export function mergeCommanderAttackOrders(args: MergeCommanderAttackOrdersArgs): {
  rangedAttacks: { unitId: string; targetH3Index: string }[];
  airStrikes: StandingOrderGeneratedAirStrike[];
} {
  const modelClaimedUnitIds = new Set([
    ...args.modelRanged.map((r) => r.unitId),
    ...args.modelAirStrikes.map((s) => s.unitId),
  ]);
  const protectedFromGeneratedStrike = new Set([
    ...(args.modelFerryUnitIds ?? []),
    ...(args.modelAirDropUnitIds ?? []),
  ]);
  const keptStandingRanged = args.standingOrderRanged.filter((o) => !modelClaimedUnitIds.has(o.unitId));
  const keptStandingAirStrikes = args.standingOrderAirStrikes.filter(
    (strike) => !modelClaimedUnitIds.has(strike.unitId) && !protectedFromGeneratedStrike.has(strike.unitId)
  );
  const rangedBeforeSweep = [...keptStandingRanged, ...args.modelRanged];
  const airStrikesBeforeSweep = [...keptStandingAirStrikes, ...args.modelAirStrikes];
  const alreadyAttackingUnitIds = new Set([
    ...rangedBeforeSweep.map((r) => r.unitId),
    ...airStrikesBeforeSweep.map((s) => s.unitId),
    ...protectedFromGeneratedStrike,
  ]);
  const sweep = args.tacticalBattle
    ? collectTacticalTempoAttacks({
        battle: args.tacticalBattle,
        playerId: args.seatId,
        alreadyAttackingSubUnitIds: alreadyAttackingUnitIds,
        holdFireParentUnitIds: holdFireUnitIdsForPlayer(args.seatId),
        sparedOwnerIds: readHoldAutomaticFireAgainstSeatIds(args.seatId),
      })
    : collectTempoRuleAttacks({
        playerId: args.seatId,
        state: args.state,
        alreadyAttackingUnitIds,
      });
  const modelTotal = args.modelRanged.length + args.modelAirStrikes.length;
  logDebug('tempoRuleAttacks mergeCommanderAttackOrders', {
    seatId: args.seatId,
    tactical: args.tacticalBattle?.battleId ?? null,
    modelAttacks: modelTotal,
    unitsClaimedByModel: modelClaimedUnitIds.size,
    standingOrderAttacksKept:
      rangedBeforeSweep.length + airStrikesBeforeSweep.length - modelTotal,
    standingOrderAttacksDisplaced:
      args.standingOrderRanged.length +
      args.standingOrderAirStrikes.length -
      (rangedBeforeSweep.length + airStrikesBeforeSweep.length - modelTotal),
    sweepAdded: sweep.rangedAttacks.length + sweep.airStrikes.length,
  });
  if (!args.tacticalBattle) {
    stagePlanAttackPicks(
      args.seatId,
      [...keptStandingRanged, ...keptStandingAirStrikes],
      [...sweep.rangedAttacks, ...sweep.airStrikes]
    );
  }
  return {
    rangedAttacks: [...rangedBeforeSweep, ...sweep.rangedAttacks],
    airStrikes: [...airStrikesBeforeSweep, ...sweep.airStrikes],
  };
}
