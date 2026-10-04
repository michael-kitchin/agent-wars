/**
 * Tactical air strikes against units, and the per-sub-unit casualty marking they share with infrastructure strikes.
 *
 * Purpose: Keeps air-vs-units dice and casualty rules out of the larger tactical order-phase module.
 * When to use: From `applyTacticalAirStrikeThenRangedPhaseOnBattle`.
 * Expected outcome: Mutates the caller's removal set and kill ledgers; never touches the database.
 * Exceptions: None.
 */
import type { KillEdge } from '../../shared/ipc/combatResultTypes';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { unitHasTacticalRangedBaseline } from '../../shared/tacticalRanges';
import { casualtyPriorityIndex, getDefense } from '../combatConstants';
import { attackHitThreshold } from '../combatHitThresholds';
import { weatherAttackPenalty, weatherBonusLevelOf } from '../../shared/weatherBonusRules';
import type { OriginHitBonusLookup } from '../originBonus/originHitBonusLookup';
import { tacticalEmbarkedLandExcludedFromRangedInput } from './tacticalCombatInput';
import { tacticalLogMutate } from './tacticalLogging';

/**
 * Inputs for one air-vs-units strike on a tactical snapshot.
 *
 * Purpose: Replaces a long positional parameter list.
 * When to use: `resolveTacticalAirStrikeAgainstUnitsOnSubUnits`.
 * Expected outcome: Plain data; `toRemove` and the two ledgers are mutated in place.
 * Exceptions: None.
 */
export interface TacticalAirStrikeOnUnitsInput {
  /**
   * Battle snapshot the strike step started from.
   *
   * Contract: Read for embarked-cargo rules; not mutated.
   * When to use: Always.
   * Expected outcome: Supplies cell context.
   * Exceptions: None.
   */
  readonly battle: TacticalBattleSnapshot;
  /**
   * Live sub-units of the strike step.
   *
   * Contract: Not mutated here; removals go into `toRemove`.
   * When to use: Always.
   * Expected outcome: Defenders and cargo are found in this list.
   * Exceptions: None.
   */
  readonly sub: readonly TacticalSubUnitSnapshot[];
  /**
   * The striking air sub-unit.
   *
   * Contract: Its `h3Index` is its base cell, which decides its origin bonus.
   * When to use: Always.
   * Expected outcome: Credited with victims; may be lost to counter-fire.
   * Exceptions: None.
   */
  readonly attacker: TacticalSubUnitSnapshot;
  /**
   * Cell being struck.
   *
   * Contract: Enemy sub-units on this cell are the defenders.
   * When to use: Always.
   * Expected outcome: Selects defenders.
   * Exceptions: None.
   */
  readonly targetH3Index: string;
  /**
   * d6 roller drawing from the shared tactical PRNG.
   *
   * Contract: Called once for the attack, then once per eligible defender until the attacker is lost.
   * When to use: Always.
   * Expected outcome: Integers 1–6.
   * Exceptions: None.
   */
  readonly rollD6: () => number;
  /**
   * Origin bonus per sub-unit at its own cell.
   *
   * Contract: Added to the attack threshold and to each counter-fire threshold.
   * When to use: Always; pass `noOriginHitBonus` when bonuses do not apply.
   * Expected outcome: 0, 1, or 2 per roll.
   * Exceptions: None.
   */
  readonly originHitBonusAt: OriginHitBonusLookup;
  /**
   * Sub-unit ids to remove after the strike.
   *
   * Contract: Mutated in place.
   * When to use: Always; the caller flushes it.
   * Expected outcome: Gains the victim and/or the attacker, plus cargo of a naval victim.
   * Exceptions: None.
   */
  readonly toRemove: Set<string>;
  /**
   * Ledger of air-strike kills.
   *
   * Contract: Mutated in place.
   * When to use: Always.
   * Expected outcome: Gains one row per removed victim id.
   * Exceptions: None.
   */
  readonly killsByAirStrike: KillEdge[];
  /**
   * Ledger of counter-fire kills.
   *
   * Contract: Mutated in place.
   * When to use: Always.
   * Expected outcome: Gains a row when the attacker is shot down.
   * Exceptions: None.
   */
  readonly killsByReturnFire: KillEdge[];
}

/**
 * Lists tactical sub-unit ids to remove for one casualty, including cargo embarked on that naval sub.
 *
 * Purpose: Keeps naval sub-unit loss aligned with sealift cargo without expanding to sibling sub-units.
 * When to use: `markTacticalSubUnitCasualty` when building the removal set for one strike victim.
 * Expected outcome: Victim id plus zero or more embarked land ids when the victim is naval.
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
 * Marks one tactical sub-unit (and land cargo embarked on that naval sub) for snapshot removal.
 *
 * Purpose: Enforces per-sub-unit tactical casualties without removing sibling sub-units of the same strategic parent.
 * When to use: Air strike and AA paths before `flushAirCasualties`; infra counterattacks pass empty killers to skip kill ledger rows.
 * Expected outcome: `toRemove` gains the victim id(s); kill ledger rows are added only when `killerSubUnitIds` is non-empty.
 * Exceptions: None.
 */
export function markTacticalSubUnitCasualty(
  subUnits: readonly TacticalSubUnitSnapshot[],
  toRemove: Set<string>,
  victimSubUnitId: string,
  killerSubUnitIds: string[],
  killLedger: KillEdge[]
): void {
  for (const id of expandedRemovalIdsForVictim(subUnits, victimSubUnitId)) {
    if (toRemove.has(id)) continue;
    toRemove.add(id);
    if (killerSubUnitIds.length > 0) {
      killLedger.push({ victimId: id, killerIds: killerSubUnitIds });
    }
  }
}

/**
 * Resolves one air-vs-`units` strike on a tactical snapshot using per-sub-unit casualty rules.
 *
 * Purpose: Keeps tactical air casualties and AA return fire aligned with strategic dice while only removing the struck sub-unit (plus cargo on that naval sub).
 * When to use: Inside `applyTacticalAirStrikeThenRangedPhaseOnBattle` for each `targetType === 'units'` order.
 * Expected outcome: Mutates `toRemove` and kill ledgers; strategic parent delete is deferred to `syncStrategicUnitsDbWhenTacticalParentsEliminated`.
 *   The attack roll and each counter-fire roll add the roller's origin bonus at its own cell; the victim pick keeps printed defense values.
 * Exceptions: None.
 */
export function resolveTacticalAirStrikeAgainstUnitsOnSubUnits(input: TacticalAirStrikeOnUnitsInput): void {
  const { battle, sub, attacker, targetH3Index, rollD6, originHitBonusAt, toRemove, killsByAirStrike, killsByReturnFire } =
    input;
  tacticalLogMutate('resolveTacticalAirStrikeAgainstUnitsOnSubUnits', {
    attackerSubUnitId: attacker.id,
    targetH3Index,
  });
  const defenders = sub.filter((u) => u.h3Index === targetH3Index && u.player !== attacker.player);
  const eligibleForAa = defenders.filter(
    (d) =>
      (d.unitType !== 'infantry' && d.unitType !== 'armor') ||
      !tacticalEmbarkedLandExcludedFromRangedInput(battle, sub, d)
  );
  const attackHit = rollD6() <= attackHitThreshold({
    unitType: 'air',
    originHitBonus: originHitBonusAt(attacker.id, attacker.h3Index),
    weatherAttackPenalty: weatherAttackPenalty({
      unitType: 'air',
      kind: 'airStrike',
      weatherAtUnit: battle.weather,
      weatherAtTarget: battle.weather,
      tags: attacker.weatherTags,
      level: weatherBonusLevelOf(battle),
    }),
  });
  if (attackHit && defenders.length > 0) {
    const victim = [...defenders].sort(
      (a, b) =>
        getDefense(a.unitType) - getDefense(b.unitType) ||
        casualtyPriorityIndex(a.unitType) - casualtyPriorityIndex(b.unitType)
    )[0]!;
    markTacticalSubUnitCasualty(sub, toRemove, victim.id, [attacker.id], killsByAirStrike);
    tacticalLogMutate('resolveTacticalAirStrikeAgainstUnitsOnSubUnits ground target destroyed', {
      targetH3Index,
      victimSubUnitId: victim.id,
      victimParentUnitId: victim.parentUnitId,
      attackerSubUnitId: attacker.id,
    });
  }
  for (const defender of eligibleForAa) {
    if (toRemove.has(attacker.id)) break;
    if (toRemove.has(defender.id)) continue;
    if (!unitHasTacticalRangedBaseline(defender.unitType)) continue;
    if (rollD6() > attackHitThreshold({
      unitType: defender.unitType,
      originHitBonus: originHitBonusAt(defender.id, defender.h3Index),
      weatherAttackPenalty: weatherAttackPenalty({
        unitType: defender.unitType,
        kind: 'ranged',
        weatherAtUnit: battle.weather,
        tags: defender.weatherTags,
        level: weatherBonusLevelOf(battle),
      }),
    })) continue;
    markTacticalSubUnitCasualty(sub, toRemove, attacker.id, [defender.id], killsByReturnFire);
    tacticalLogMutate('resolveTacticalAirStrikeAgainstUnitsOnSubUnits attacker lost to AA', {
      targetH3Index,
      attackerSubUnitId: attacker.id,
      defenderSubUnitId: defender.id,
    });
    break;
  }
}
