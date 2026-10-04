/**
 * Attacker and defender side builders for `estimate_combat`.
 *
 * Purpose: Turns the model's attacker and defender arguments into combat rows using one theater's unit filters and
 * reach rules, so the estimator itself only does math and formatting.
 * When to use: From `executeEstimateCombat`, attackers first, then defenders.
 * Expected outcome: Combat rows plus model-facing summary rows, or a model-facing error.
 * Exceptions: None; failures are returned as `error` values.
 */

import { attackHitThreshold, defenseHitThreshold } from '../combatHitThresholds';
import type { CombatUnit } from '../combatUnitTypes';
import type { OriginHitBonus } from '../../shared/originBonusTypes';
import { gridHopDistanceBetween } from './assessUnitProximity';
import type { CombatEstimationEngagementType, CombatEstimationTheater } from './combatEstimationTheater';
import { h3ToLatLng, type LatLng, type LatLngMap } from './h3LatLng';
import { logDebug, logTrace } from '../logger';

/**
 * Player id of the AI side.
 *
 * Purpose: Assumed attackers belong to the AI, and automatic defenders are every non-AI unit on the target cell.
 * When to use: Building attacker and defender lists.
 * Expected outcome: Matches the `player` value of AI units in both theaters.
 * Exceptions: None.
 */
const AI_PLAYER_ID = 'opponent';

/**
 * Unit list argument shape for attackers and defenders.
 *
 * Purpose: Typed view of the model's `attackers` / `defenders` objects.
 * When to use: Parsing `estimate_combat` arguments.
 * Expected outcome: Either real unit ids or assumed type counts.
 * Exceptions: None.
 */
export interface CombatSideArgs {
  /**
   * Real unit ids.
   *
   * Contract: Used when non-empty; takes precedence over `assumed`.
   * When to use: Known units on the map.
   * Expected outcome: Each id is looked up through the theater.
   * Exceptions: None.
   */
  readonly units?: string[];
  /**
   * Hypothetical units by type and count.
   *
   * Contract: Used when `units` is empty or missing.
   * When to use: What-if forecasts.
   * Expected outcome: Placed on the target cell.
   * Exceptions: None.
   */
  readonly assumed?: { type: string; count: number }[];
}

/**
 * Validates one raw `attackers` / `defenders` argument from the model.
 *
 * Purpose: Model arguments are untrusted JSON; builders rely on real arrays, string ids, and whole-number counts.
 * When to use: Parsing `estimate_combat` arguments, before any builder runs.
 * Expected outcome: Undefined for a non-object. Otherwise `units` keeps only string ids and is dropped unless it is a
 * non-empty array; `assumed` keeps only entries with a string `type` and a finite `count`, floored and clamped at zero,
 * and is dropped unless one entry remains. Numeric strings are accepted as counts.
 * Exceptions: None.
 */
export function normalizeCombatSideArgs(raw: unknown): CombatSideArgs | undefined {
  if (!raw || typeof raw !== 'object') {
    logTrace('combatEstimationSides normalizeCombatSideArgs', { accepted: false });
    return undefined;
  }
  const r = raw as { units?: unknown; assumed?: unknown };
  const units = Array.isArray(r.units) ? r.units.filter((id): id is string => typeof id === 'string') : [];
  const assumed = Array.isArray(r.assumed)
    ? r.assumed.flatMap((entry: unknown) => {
        const e = entry as { type?: unknown; count?: unknown } | null;
        if (!e || typeof e.type !== 'string') return [];
        const count = typeof e.count === 'number' || typeof e.count === 'string' ? Number(e.count) : Number.NaN;
        return Number.isFinite(count) ? [{ type: e.type, count: Math.max(0, Math.floor(count)) }] : [];
      })
    : [];
  const normalized: CombatSideArgs = {
    ...(units.length > 0 ? { units } : {}),
    ...(assumed.length > 0 ? { assumed } : {}),
  };
  logTrace('combatEstimationSides normalizeCombatSideArgs', {
    accepted: true,
    unitIdCount: normalized.units?.length ?? 0,
    assumedGroupCount: normalized.assumed?.length ?? 0,
  });
  return normalized;
}

/**
 * Summary row for one attacker in results.
 *
 * Purpose: Model-facing attacker list with attack values.
 * When to use: `attackerSummary.units`.
 * Expected outcome: Position only for real units.
 * Exceptions: None.
 */
export interface AttackerSummaryRow {
  /**
   * Real unit id, or a generated `assumed-attacker-N` id.
   *
   * Contract: Matches the combat row id.
   * When to use: Result payloads.
   * Expected outcome: Non-empty.
   * Exceptions: None.
   */
  readonly unitId: string;
  /**
   * Unit type.
   *
   * Contract: Same vocabulary as unit rows.
   * When to use: Result payloads.
   * Expected outcome: Non-empty.
   * Exceptions: None.
   */
  readonly type: string;
  /**
   * Attack value used for hit chances.
   *
   * Contract: From `attackHitThreshold`, so it includes any origin bonus.
   * When to use: Result payloads.
   * Expected outcome: Non-negative integer.
   * Exceptions: None.
   */
  readonly attackValue: number;
  /**
   * Origin bonus included in `attackValue`.
   *
   * Contract: Present only when the attacker qualifies where it would roll; never on assumed attackers.
   * When to use: Result payloads.
   * Expected outcome: Always 1 when present.
   * Exceptions: None.
   */
  readonly originBonus?: OriginHitBonus;
  /**
   * Combat cell center of a real attacker.
   *
   * Contract: Omitted for assumed attackers.
   * When to use: Result payloads.
   * Expected outcome: Lat/lng tuple, encoded as a hex code for the model.
   * Exceptions: None.
   */
  readonly position?: LatLng;
}

/**
 * Summary row for one defender in results.
 *
 * Purpose: Model-facing defender list with defense values.
 * When to use: `defenderSummary.units`.
 * Expected outcome: One row per defender combat row.
 * Exceptions: None.
 */
export interface DefenderSummaryRow {
  /**
   * Real unit id, or a generated `assumed-defender-N` id.
   *
   * Contract: Matches the combat row id.
   * When to use: Result payloads.
   * Expected outcome: Non-empty.
   * Exceptions: None.
   */
  readonly unitId: string;
  /**
   * Unit type.
   *
   * Contract: Same vocabulary as unit rows.
   * When to use: Result payloads.
   * Expected outcome: Non-empty.
   * Exceptions: None.
   */
  readonly type: string;
  /**
   * Defense value shown to the model.
   *
   * Contract: From `defenseHitThreshold`, so it includes any origin bonus.
   * When to use: Result payloads.
   * Expected outcome: Non-negative integer.
   * Exceptions: None.
   */
  readonly defenseValue: number;
  /**
   * Origin bonus included in `defenseValue` and in this defender's return-fire chance.
   *
   * Contract: Present only when the defender qualifies at the target; never on assumed defenders.
   * When to use: Result payloads.
   * Expected outcome: Always 1 when present.
   * Exceptions: None.
   */
  readonly originBonus?: OriginHitBonus;
}

/**
 * Sets a real unit's origin bonus as judged at the cell where it would roll.
 *
 * Purpose: Melee attackers roll at the target, unlike their current cell, so the estimate cannot reuse `withOriginHitBonus`.
 * When to use: Real attackers and defenders only; assumed units never qualify.
 * Expected outcome: The same object when the bonus is 0, otherwise a copy with `originHitBonus: 1`; `h3Index` is unchanged.
 * Exceptions: None.
 */
function withEstimateOriginBonus(unit: CombatUnit, theater: CombatEstimationTheater, rollH3Index: string): CombatUnit {
  const bonus = theater.originHitBonusAt(unit.id, rollH3Index);
  return bonus === 0 ? unit : { ...unit, originHitBonus: bonus };
}

/**
 * Builds the optional `originBonus` field of a summary row.
 *
 * Purpose: Keeps bonus-free rows byte-for-byte unchanged.
 * When to use: Spread into attacker and defender summary rows.
 * Expected outcome: `{ originBonus: 1 }` or `{}`.
 * Exceptions: None.
 */
function originBonusSummaryField(unit: CombatUnit): { readonly originBonus?: OriginHitBonus } {
  return unit.originHitBonus === 1 ? { originBonus: 1 } : {};
}

/**
 * Built attacker side, or a model-facing error.
 *
 * Purpose: Lets attacker parsing fail early without throwing.
 * When to use: Returned by `buildAttackers`.
 * Expected outcome: Combat rows plus summary rows, or `error`.
 * Exceptions: None.
 */
export type AttackerSide =
  | { readonly combat: CombatUnit[]; readonly summary: AttackerSummaryRow[]; readonly error?: undefined }
  | { readonly error: string };

/**
 * Built defender side, or a model-facing error.
 *
 * Purpose: Lets defender parsing fail early without throwing.
 * When to use: Returned by `buildDefenders`.
 * Expected outcome: Combat rows, summary rows, and whether the list came from the target cell.
 * Exceptions: None.
 */
export type DefenderSide =
  | {
      readonly combat: CombatUnit[];
      readonly summary: DefenderSummaryRow[];
      readonly automatic: boolean;
      readonly error?: undefined;
    }
  | { readonly error: string };

/**
 * Inputs shared by the attacker and defender builders.
 *
 * Purpose: Parameter object so builders stay within argument limits.
 * When to use: `buildAttackers` and `buildDefenders`.
 * Expected outcome: Read-only view of one estimate call, plus a shared warning list.
 * Exceptions: None.
 */
export interface CombatSideContext {
  /**
   * Theater rules for unit lookup and reach.
   *
   * Contract: Built once per estimate.
   * When to use: Every unit lookup.
   * Expected outcome: Strategic or tactical rules.
   * Exceptions: None.
   */
  readonly theater: CombatEstimationTheater;
  /**
   * Engagement being estimated.
   *
   * Contract: `ranged` or `melee`.
   * When to use: Unit filters and reach checks.
   * Expected outcome: Unchanged for the call.
   * Exceptions: None.
   */
  readonly engagementType: CombatEstimationEngagementType;
  /**
   * Target cell.
   *
   * Contract: Present in the snapshot hexes.
   * When to use: Reach checks and defender placement.
   * Expected outcome: Valid H3 index.
   * Exceptions: None.
   */
  readonly targetHexH3: string;
  /**
   * Cell-center lookup for result positions.
   *
   * Contract: Covers snapshot hexes.
   * When to use: Attacker summary positions.
   * Expected outcome: Lat/lng tuples.
   * Exceptions: None.
   */
  readonly latLngByH3: LatLngMap;
  /**
   * Warning list returned to the model.
   *
   * Contract: Builders only append.
   * When to use: Dropped or excluded units.
   * Expected outcome: Short model-facing lines.
   * Exceptions: None.
   */
  readonly warnings: string[];
}

/**
 * Builds real attackers from unit ids.
 *
 * Purpose: Applies theater unit filters, attacker-type support, and (for ranged) the theater's fire reach.
 * When to use: Only from `buildAttackers` when ids are given.
 * Expected outcome: Ranged attackers that cannot fire are dropped with a warning; the call fails when none can.
 * Exceptions: None; returns `error` instead.
 */
function buildRealAttackers(ids: readonly string[], ctx: CombatSideContext): AttackerSide {
  const combat: CombatUnit[] = [];
  for (const id of ids) {
    const found = ctx.theater.findUnit(id, ctx.engagementType);
    if (!found.unit) return { error: found.error };
    const rejection = ctx.theater.rejectAttackerType(found.unit.unitType);
    if (rejection) return { error: rejection };
    combat.push(found.unit);
  }
  const usable = (
    ctx.engagementType === 'ranged'
      ? combat.filter((u) => ctx.theater.canFireAt(u.unitType, u.h3Index, ctx.targetHexH3))
      : combat
  ).map((u) => withEstimateOriginBonus(u, ctx.theater, ctx.engagementType === 'melee' ? ctx.targetHexH3 : u.h3Index))
    .map((u) => {
      const penalty = ctx.theater.weatherAttackPenaltyFor(u, ctx.targetHexH3, ctx.engagementType);
      return penalty === 0 ? u : { ...u, weatherAttackPenalty: penalty };
    });
  if (usable.length === 0) {
    const u = combat[0]!;
    const dist = gridHopDistanceBetween(u.h3Index, ctx.targetHexH3);
    const reach = dist === null ? 'an unmeasurable distance' : `distance ${dist}`;
    const fireReach = ctx.theater.describeFireReach(u.unitType, u.h3Index);
    return { error: `Attacker ${u.id} (${fireReach}) cannot reach target hex at ${reach}${ctx.theater.blockedShotRules}` };
  }
  const usableIds = new Set(usable.map((u) => u.id));
  const excluded = combat.filter((u) => !usableIds.has(u.id)).map((u) => u.id);
  if (excluded.length > 0) ctx.warnings.push(`Excluded out-of-range attackers: ${excluded.join(', ')}`);
  return {
    combat: usable,
    summary: usable.map((u) => ({
      unitId: u.id,
      type: u.unitType,
      attackValue: attackHitThreshold(u),
      ...originBonusSummaryField(u),
      position: h3ToLatLng(u.h3Index, ctx.latLngByH3, 'cellCenter'),
    })),
  };
}

/**
 * Builds the attacker side from real ids or assumed counts.
 *
 * Purpose: Single entry point for attacker parsing in both theaters.
 * When to use: Once per estimate, before defenders; `raw` has non-empty `units` or `assumed`.
 * Expected outcome: Real attackers per `buildRealAttackers`. Assumed attackers belong to the AI, stand on the target
 * cell, and skip reach checks, but unsupported attacker types are still rejected.
 * Exceptions: None; returns `error` instead.
 */
export function buildAttackers(raw: CombatSideArgs, ctx: CombatSideContext): AttackerSide {
  logDebug('combatEstimationSides buildAttackers', {
    theater: ctx.theater.theater,
    engagementType: ctx.engagementType,
    unitIdCount: raw.units?.length ?? 0,
    assumedGroupCount: raw.assumed?.length ?? 0,
  });
  if (raw.units && raw.units.length > 0) return buildRealAttackers(raw.units, ctx);
  const assumed = raw.assumed ?? [];
  const rejection = assumed.map(({ type }) => ctx.theater.rejectAttackerType(type)).find((r) => r !== null);
  if (rejection) return { error: rejection };
  let idx = 0;
  const combat: CombatUnit[] = assumed.flatMap(({ type, count }) =>
    Array.from({ length: count }, () => ({
      id: `assumed-attacker-${idx++}`,
      player: AI_PLAYER_ID,
      unitType: type,
      h3Index: ctx.targetHexH3,
    }))
  ).map((unit) => {
    const penalty = ctx.theater.weatherAttackPenaltyFor(unit, ctx.targetHexH3, ctx.engagementType);
    return penalty === 0 ? unit : { ...unit, weatherAttackPenalty: penalty };
  });
  return {
    combat,
    summary: combat.map((u) => ({ unitId: u.id, type: u.unitType, attackValue: attackHitThreshold(u) })),
  };
}

/**
 * Builds the defender side from real ids, assumed counts, or the target cell.
 *
 * Purpose: Same theater unit filters as attackers; automatic defenders are every non-AI participant on the target.
 * When to use: Once per estimate, after attackers.
 * Expected outcome: Defenders positioned on the target cell. Units on the target that sit out the engagement (such
 * as cargo embarked at sea) are named in a warning instead of being counted.
 * Exceptions: None; returns `error` instead.
 */
export function buildDefenders(raw: CombatSideArgs | undefined, ctx: CombatSideContext): DefenderSide {
  logDebug('combatEstimationSides buildDefenders', {
    theater: ctx.theater.theater,
    engagementType: ctx.engagementType,
    targetHexH3: ctx.targetHexH3,
    unitIdCount: raw?.units?.length ?? 0,
    assumedGroupCount: raw?.assumed?.length ?? 0,
  });
  const toSummary = (u: CombatUnit): DefenderSummaryRow => ({
    unitId: u.id,
    type: u.unitType,
    defenseValue: defenseHitThreshold(u),
    ...originBonusSummaryField(u),
  });
  const atTarget = (u: CombatUnit): CombatUnit => withEstimateOriginBonus(u, ctx.theater, ctx.targetHexH3);
  if (raw?.units && raw.units.length > 0) {
    const combat: CombatUnit[] = [];
    for (const id of raw.units) {
      const found = ctx.theater.findUnit(id, ctx.engagementType);
      if (!found.unit) return { error: found.error };
      combat.push(atTarget({ ...found.unit, h3Index: ctx.targetHexH3 }));
    }
    return { combat, summary: combat.map(toSummary), automatic: false };
  }
  if (raw?.assumed && raw.assumed.length > 0) {
    let idx = 0;
    const combat: CombatUnit[] = raw.assumed.flatMap(({ type, count }) =>
      Array.from({ length: count }, () => ({
        id: `assumed-defender-${idx++}`,
        player: 'human',
        unitType: type,
        h3Index: ctx.targetHexH3,
      }))
    );
    return { combat, summary: combat.map(toSummary), automatic: false };
  }
  const cell = ctx.theater.listUnitsAt(ctx.targetHexH3, ctx.engagementType);
  const combat = cell.participants.filter((u) => u.player !== AI_PLAYER_ID).map(atTarget);
  const excludedIds = cell.excluded.filter((u) => u.player !== AI_PLAYER_ID).map((u) => u.id);
  if (excludedIds.length > 0) {
    ctx.warnings.push(`Excluded units that sit out ${ctx.engagementType} combat: ${excludedIds.join(', ')}`);
  }
  return { combat, summary: combat.map(toSummary), automatic: true };
}
