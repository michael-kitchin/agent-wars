/**
 * Callback event evaluation for event-driven AI consultation (Milestone 0.7).
 * Evaluates mandatory overrides and LLM-requested subscription events after each resolution
 * to decide whether to consult the LLM. Uses game state and persisted callback state.
 */

import { logDebug } from './logger';
import { dbGetAll } from './gameDb';
import type { GameStateSnapshot } from './gameDb';
import type { CallbackSubscription } from './callbackSubscriptions';
import { gridDistance } from 'h3-js';
import { getRange } from './combatConstants';

/**
 * Documents the `ResolutionContext` interface as a named contract surface (export interface ResolutionContext).

 * Purpose: Supports maintainability by documenting why `ResolutionContext` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface ResolutionContext {
    /**
   * Specifies the contract for the `opponentCombatParticipantUnitIds` member (opponentCombatParticipantUnitIds: string[];).

   * Contract: Describes stable behavior for callers of `opponentCombatParticipantUnitIds` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
opponentCombatParticipantUnitIds: string[];
    /**
   * Specifies the contract for the `removedUnitIds` member (removedUnitIds: string[];).

   * Contract: Describes stable behavior for callers of `removedUnitIds` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
removedUnitIds: string[];
    /**
   * Specifies the contract for the `removedOpponentUnitIds` member (removedOpponentUnitIds: string[];).

   * Contract: Describes stable behavior for callers of `removedOpponentUnitIds` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
removedOpponentUnitIds: string[];
    /**
   * Specifies the contract for the `infrastructureDestroyedEvents` member (infrastructureDestroyedEvents?: Array<{ h3Index: string; targetType: 'urban' | 'airport' | 'seaport'; changedRubbleCount: number; destroyedA).

   * Contract: Describes stable behavior for callers of `infrastructureDestroyedEvents` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
infrastructureDestroyedEvents?: Array<{
    h3Index: string;
    targetType: 'urban' | 'airport' | 'seaport';
    changedRubbleCount: number;
    destroyedAirUnitsCount: number;
  }>;
    /**
   * Specifies the contract for the `threatSeveritiesByUnit` member (threatSeveritiesByUnit?: Record<string, string[]>;).

   * Contract: Describes stable behavior for callers of `threatSeveritiesByUnit` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
threatSeveritiesByUnit?: Record<string, string[]>;
}

/**
 * Documents the `SubscriptionEventResult` interface as a named contract surface (export interface SubscriptionEventResult).

 * Purpose: Supports maintainability by documenting why `SubscriptionEventResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface SubscriptionEventResult {
    /**
   * Specifies the contract for the `event` member (event: string;).

   * Contract: Describes stable behavior for callers of `event` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
event: string;
    /**
   * Specifies the contract for the `params` member (params: Record<string, unknown>;).

   * Contract: Describes stable behavior for callers of `params` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
params: Record<string, unknown>;
    /**
   * Specifies the contract for the `unitId` member (unitId?: string;).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitId?: string;
}

/**
 * Documents the `MandatoryOverrideResult` type alias (export type MandatoryOverrideResult).

 * Purpose: Supports maintainability by documenting why `MandatoryOverrideResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type MandatoryOverrideResult =
  | {   /**
   * Specifies the contract for the `type` member (type: 'first_consultation').

   * Contract: Describes stable behavior for callers of `type` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
type: 'first_consultation' }
  | {   /**
   * Specifies the contract for the `type` member (type: 'first_combat';).

   * Contract: Describes stable behavior for callers of `type` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
type: 'first_combat';   /**
   * Specifies the contract for the `unitId` member (unitId: string).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitId: string }
  | {   /**
   * Specifies the contract for the `type` member (type: 'new_contact';).

   * Contract: Describes stable behavior for callers of `type` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
type: 'new_contact';   /**
   * Specifies the contract for the `unitId` member (unitId: string).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitId: string }
  | {   /**
   * Specifies the contract for the `type` member (type: 'unit_destroyed';).

   * Contract: Describes stable behavior for callers of `type` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
type: 'unit_destroyed';   /**
   * Specifies the contract for the `unitId` member (unitId: string).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitId: string }
  | {   /**
   * Specifies the contract for the `type` member (type: 'unordered_unit';).

   * Contract: Describes stable behavior for callers of `type` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
type: 'unordered_unit';   /**
   * Specifies the contract for the `unitId` member (unitId: string).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitId: string }
  | {   /**
   * Specifies the contract for the `type` member (type: 'standing_order_blocked';).

   * Contract: Describes stable behavior for callers of `type` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
type: 'standing_order_blocked';   /**
   * Specifies the contract for the `unitId` member (unitId: string).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitId: string }
  | {
            /**
       * Specifies the contract for the `type` member (type: 'attack_mix_changed';).

       * Contract: Describes stable behavior for callers of `type` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
type: 'attack_mix_changed';
            /**
       * Specifies the contract for the `aiAttackersBefore` member (aiAttackersBefore: number;).

       * Contract: Describes stable behavior for callers of `aiAttackersBefore` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
aiAttackersBefore: number;
            /**
       * Specifies the contract for the `aiAttackersAfter` member (aiAttackersAfter: number;).

       * Contract: Describes stable behavior for callers of `aiAttackersAfter` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
aiAttackersAfter: number;
            /**
       * Specifies the contract for the `hittableHumansBefore` member (hittableHumansBefore: number;).

       * Contract: Describes stable behavior for callers of `hittableHumansBefore` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
hittableHumansBefore: number;
            /**
       * Specifies the contract for the `hittableHumansAfter` member (hittableHumansAfter: number;).

       * Contract: Describes stable behavior for callers of `hittableHumansAfter` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
hittableHumansAfter: number;
    }
  | {   /**
   * Specifies the contract for the `type` member (type: 'deadman';).

   * Contract: Describes stable behavior for callers of `type` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
type: 'deadman';   /**
   * Specifies the contract for the `turnsSince` member (turnsSince: number).

   * Contract: Describes stable behavior for callers of `turnsSince` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
turnsSince: number };

/**
 * Documents the module-scope binding `WARNING_STATUSES` (WARNING_STATUSES).

 * Purpose: Supports maintainability by documenting why `WARNING_STATUSES` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const WARNING_STATUSES = new Set([
  'blocked',
  'target_lost',
  'target_out_of_range',
  'target_destroyed',
  'arrived',
  'contact',
]);

/**
 * Documents the module-scope binding `DEADMAN_TURNS` (DEADMAN_TURNS).

 * Purpose: Supports maintainability by documenting why `DEADMAN_TURNS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const DEADMAN_TURNS = 5;

/**
 * Documents the `AttackMixSnapshot` interface as a named contract surface (interface AttackMixSnapshot).

 * Purpose: Supports maintainability by documenting why `AttackMixSnapshot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface AttackMixSnapshot {
    /**
   * Specifies the contract for the `turnNumber` member (turnNumber: number;).

   * Contract: Describes stable behavior for callers of `turnNumber` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
turnNumber: number;
    /**
   * Specifies the contract for the `aiAttackers` member (aiAttackers: Set<string>;).

   * Contract: Describes stable behavior for callers of `aiAttackers` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
aiAttackers: Set<string>;
    /**
   * Specifies the contract for the `hittableHumans` member (hittableHumans: Set<string>;).

   * Contract: Describes stable behavior for callers of `hittableHumans` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hittableHumans: Set<string>;
}

/**
 * Documents the module-scope binding `lastAttackMixSnapshot` (lastAttackMixSnapshot: AttackMixSnapshot | null).

 * Purpose: Supports maintainability by documenting why `lastAttackMixSnapshot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let lastAttackMixSnapshot: AttackMixSnapshot | null = null;

/**
 * Defines the `canHitNow` function shape (function canHitNow().

 * Purpose: Supports maintainability by documenting why `canHitNow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function canHitNow(
  attacker: { unitType: string; h3Index: string },
  target: { h3Index: string }
): boolean {
  try {
    const dist = gridDistance(attacker.h3Index, target.h3Index);
    const range = getRange(attacker.unitType as 'infantry' | 'armor' | 'naval');
    return range > 0 ? dist <= range : dist === 0;
  } catch {
    return false;
  }
}

/**
 * Defines the `buildAttackMixSnapshot` function shape (function buildAttackMixSnapshot(state: GameStateSnapshot): AttackMixSnapshot).

 * Purpose: Supports maintainability by documenting why `buildAttackMixSnapshot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildAttackMixSnapshot(state: GameStateSnapshot): AttackMixSnapshot {
  const opponents = state.units.filter((u) => u.player === 'opponent');
  const humans = state.units.filter((u) => u.player === 'human');
  const aiAttackers = new Set<string>();
  const hittableHumans = new Set<string>();
  for (const ai of opponents) {
    for (const human of humans) {
      if (!canHitNow(ai, human)) continue;
      aiAttackers.add(ai.id);
      hittableHumans.add(human.id);
    }
  }
  return {
    turnNumber: state.turnNumber,
    aiAttackers,
    hittableHumans,
  };
}

/**
 * Defines the `setsEqual` function shape (function setsEqual(a: Set<string>, b: Set<string>): boolean).

 * Purpose: Supports maintainability by documenting why `setsEqual` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) {
    if (!b.has(v)) return false;
  }
  return true;
}

/**
 * Defines the `evaluateMandatoryOverrides` function shape (export function evaluateMandatoryOverrides( state: GameStateSnapshot, lastConsultationTurn: number, opponentUnitsInCombatSinceConsultation: string[],).

 * Purpose: Supports maintainability by documenting why `evaluateMandatoryOverrides` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function evaluateMandatoryOverrides(
  state: GameStateSnapshot,
  lastConsultationTurn: number,
  opponentUnitsInCombatSinceConsultation: string[],
  thisResolutionOpponentCombatants: string[],
  removedOpponentUnitIds: string[],
  newContactUnitIds: string[]
): MandatoryOverrideResult[] {
  const results: MandatoryOverrideResult[] = [];
  const opponentUnitIds = state.units.filter((u) => u.player === 'opponent').map((u) => u.id);
  const combatSinceSet = new Set(opponentUnitsInCombatSinceConsultation);

  if (lastConsultationTurn === 0) {
    results.push({ type: 'first_consultation' });
  }

  for (const unitId of thisResolutionOpponentCombatants) {
    if (!combatSinceSet.has(unitId)) {
      results.push({ type: 'first_combat', unitId });
      break;
    }
  }

  for (const unitId of newContactUnitIds) {
    results.push({ type: 'new_contact', unitId });
  }

  for (const unitId of removedOpponentUnitIds) {
    results.push({ type: 'unit_destroyed', unitId });
  }

  const orderRows = dbGetAll<{ unit_id: string; status: string }>(
    'SELECT unit_id, status FROM standing_orders WHERE player_id = ?',
    ['opponent']
  );
  const unitToStatus = new Map(orderRows.map((r) => [r.unit_id, r.status]));

  for (const unitId of opponentUnitIds) {
    const status = unitToStatus.get(unitId);
    if (status === undefined) {
      results.push({ type: 'unordered_unit', unitId });
    } else if (WARNING_STATUSES.has(status)) {
      results.push({ type: 'standing_order_blocked', unitId });
    }
  }

  if (lastConsultationTurn > 0 && state.turnNumber - lastConsultationTurn >= DEADMAN_TURNS) {
    results.push({ type: 'deadman', turnsSince: state.turnNumber - lastConsultationTurn });
  }

  // In-memory only: consult when the attack mix changes from one turn to the next.
  // Reset baseline naturally at game start/new game (turn 1) or non-sequential jumps.
  const currentAttackMix = buildAttackMixSnapshot(state);
  if (state.turnNumber <= 1) {
    lastAttackMixSnapshot = currentAttackMix;
  } else if (lastAttackMixSnapshot && lastAttackMixSnapshot.turnNumber === state.turnNumber - 1) {
    if (
      !setsEqual(lastAttackMixSnapshot.aiAttackers, currentAttackMix.aiAttackers) ||
      !setsEqual(lastAttackMixSnapshot.hittableHumans, currentAttackMix.hittableHumans)
    ) {
      results.push({
        type: 'attack_mix_changed',
        aiAttackersBefore: lastAttackMixSnapshot.aiAttackers.size,
        aiAttackersAfter: currentAttackMix.aiAttackers.size,
        hittableHumansBefore: lastAttackMixSnapshot.hittableHumans.size,
        hittableHumansAfter: currentAttackMix.hittableHumans.size,
      });
    }
    lastAttackMixSnapshot = currentAttackMix;
  } else {
    lastAttackMixSnapshot = currentAttackMix;
  }

  if (results.length > 0) {
    logDebug('callbackEvaluation evaluateMandatoryOverrides', { turnNumber: state.turnNumber, count: results.length, types: results.map((r) => r.type) });
  }
  return results;
}

/**
 * Mandatory re-consult triggers after a tactical WEGO beat (res4 sub-units), without strategic standing-order noise.
 *
 * Purpose: Event-driven tactical uses the same subscription machinery as strategic, but `evaluateMandatoryOverrides`
 * references strategic parent units and DB standing orders that do not apply to sub-unit ids.
 * When to use: `afterTacticalBeatResolution` only, after building a tactical `ResolutionContext` from playback.
 * Expected outcome: At least one `unit_destroyed` entry per removed opponent sub-unit so lossy beats can force consultation.
 * Exceptions: None.
 */
export function evaluateTacticalMandatoryOverrides(ctx: ResolutionContext): MandatoryOverrideResult[] {
  const results: MandatoryOverrideResult[] = [];
  for (const unitId of ctx.removedOpponentUnitIds) {
    results.push({ type: 'unit_destroyed', unitId });
  }
  if (results.length > 0) {
    logDebug('callbackEvaluation evaluateTacticalMandatoryOverrides', { count: results.length });
  }
  return results;
}

/**
 * Defines the `evaluateSubscriptionEvents` function shape (export function evaluateSubscriptionEvents( state: GameStateSnapshot, subscriptions: CallbackSubscription[], ctx: ResolutionContext ): SubscriptionEve).

 * Purpose: Supports maintainability by documenting why `evaluateSubscriptionEvents` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function evaluateSubscriptionEvents(
  state: GameStateSnapshot,
  subscriptions: CallbackSubscription[],
  ctx: ResolutionContext
): SubscriptionEventResult[] {
  const fired: SubscriptionEventResult[] = [];
  const opponentCombatSet = new Set(ctx.opponentCombatParticipantUnitIds);
  const removedSet = new Set(ctx.removedUnitIds);

  const orderRows = dbGetAll<{ unit_id: string; status: string }>(
    'SELECT unit_id, status FROM standing_orders WHERE player_id = ?',
    ['opponent']
  );
  const unitStatus = new Map(orderRows.map((r) => [r.unit_id, r.status]));

  for (const sub of subscriptions) {
    const { event, params = {}, subscribedTurn } = sub;
    if (event === 'turns') {
      const n = typeof params.n === 'number' ? params.n : 0;
      const subTurn = typeof subscribedTurn === 'number' ? subscribedTurn : state.turnNumber;
      if (state.turnNumber >= subTurn + n) {
        fired.push({ event, params });
      }
    } else if (event === 'unit_engaged') {
      const unitId = typeof params.unitId === 'string' ? params.unitId : '';
      if (unitId && opponentCombatSet.has(unitId)) {
        fired.push({ event, params, unitId });
      }
    } else if (event === 'unit_destroyed') {
      const side = params.side;
      if (side === 'own' && ctx.removedOpponentUnitIds.length > 0) {
        fired.push({ event, params });
      } else if (side === 'enemy' && ctx.removedUnitIds.some((id) => ctx.removedOpponentUnitIds.indexOf(id) < 0)) {
        const humanRemoved = ctx.removedUnitIds.filter((id) => !ctx.removedOpponentUnitIds.includes(id));
        if (humanRemoved.length > 0) fired.push({ event, params });
      } else if (typeof side === 'string' && removedSet.has(side)) {
        fired.push({ event, params, unitId: side });
      }
    } else if (event === 'unit_arrived') {
      const unitId = typeof params.unitId === 'string' ? params.unitId : '';
      if (unitId && unitStatus.get(unitId) === 'arrived') {
        fired.push({ event, params, unitId });
      }
    } else if (event === 'threat_escalation') {
      const unitId = typeof params.unitId === 'string' ? params.unitId : '';
      const severity = typeof params.severity === 'string' ? params.severity : '';
      const severities = ctx.threatSeveritiesByUnit?.[unitId];
      if (unitId && severity && severities?.includes(severity)) {
        fired.push({ event, params, unitId });
      }
    } else if (event === 'infrastructure_destroyed') {
      const targetType = typeof params.targetType === 'string' ? params.targetType : '';
      const h3Index = typeof params.h3Index === 'string' ? params.h3Index : '';
      const match = (ctx.infrastructureDestroyedEvents ?? []).find((e) => {
        const typeMatches = !targetType || e.targetType === targetType;
        const hexMatches = !h3Index || e.h3Index === h3Index;
        return typeMatches && hexMatches;
      });
      if (match) {
        fired.push({
          event,
          params: {
            ...params,
            matchedTargetType: match.targetType,
            matchedH3Index: match.h3Index,
            changedRubbleCount: match.changedRubbleCount,
            destroyedAirUnitsCount: match.destroyedAirUnitsCount,
          },
        });
      }
    }
    // territory_changed: no-op for 0.7
  }

  if (fired.length > 0) {
    logDebug('callbackEvaluation evaluateSubscriptionEvents', { turnNumber: state.turnNumber, fired: fired.length });
  }
  return fired;
}
