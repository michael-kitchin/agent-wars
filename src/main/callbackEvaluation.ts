/**
 * Callback event evaluation for event-driven AI consultation (Milestone 0.7).
 * Evaluates mandatory overrides and LLM-requested subscription events after each resolution
 * to decide whether to consult the LLM. Uses game state and persisted callback state.
 */

import { logDebug } from './logger';
import { dbGetAll } from './gameDb';
import type { GameStateSnapshot } from './gameDb';
import type { CallbackSubscription } from './callbackSubscriptions';

export interface ResolutionContext {
  opponentCombatParticipantUnitIds: string[];
  removedUnitIds: string[];
  removedOpponentUnitIds: string[];
  /** Optional: unitId -> list of threat severities (e.g. ['low','moderate']) from precomputation for threat_escalation. */
  threatSeveritiesByUnit?: Record<string, string[]>;
}

export interface SubscriptionEventResult {
  event: string;
  params: Record<string, unknown>;
  unitId?: string;
}

export type MandatoryOverrideResult =
  | { type: 'first_consultation' }
  | { type: 'first_combat'; unitId: string }
  | { type: 'unit_destroyed'; unitId: string }
  | { type: 'unordered_unit'; unitId: string }
  | { type: 'standing_order_blocked'; unitId: string }
  | { type: 'deadman'; turnsSince: number };

const WARNING_STATUSES = new Set([
  'blocked',
  'target_lost',
  'target_out_of_range',
  'target_destroyed',
  'arrived',
  'contact',
]);

const DEADMAN_TURNS = 5;

/**
 * Evaluates mandatory override conditions. Returns a list of reasons that fired.
 * Call after each resolution with the current state and resolution context.
 * First combat: any thisResolutionOpponentCombatants not yet in opponentUnitsInCombatSinceConsultation.
 * Unit destroyed: any opponent unit in removedOpponentUnitIds.
 * Unordered unit: any opponent unit with no standing order.
 * Standing order blocked: any opponent unit whose standing order has a warning status.
 * Deadman: no consultation for DEADMAN_TURNS turns.
 * First consultation: lastConsultationTurn is 0 or unset.
 */
export function evaluateMandatoryOverrides(
  state: GameStateSnapshot,
  lastConsultationTurn: number,
  opponentUnitsInCombatSinceConsultation: string[],
  thisResolutionOpponentCombatants: string[],
  removedOpponentUnitIds: string[]
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

  if (results.length > 0) {
    logDebug('callbackEvaluation evaluateMandatoryOverrides', { turnNumber: state.turnNumber, count: results.length, types: results.map((r) => r.type) });
  }
  return results;
}

/**
 * Evaluates LLM-requested subscription events. Returns which subscription events fired.
 * Call after each resolution with current subscriptions and resolution context.
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
    }
    // territory_changed: no-op for 0.7
  }

  if (fired.length > 0) {
    logDebug('callbackEvaluation evaluateSubscriptionEvents', { turnNumber: state.turnNumber, fired: fired.length });
  }
  return fired;
}
