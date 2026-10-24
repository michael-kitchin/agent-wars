/**
 * Validates and merges parsed opponent orders after a successful JSON parse.
 *
 * Purpose: Keeps `requestOrdersFlow` under the file-size limit without changing merge or drop behavior.
 * When to use: After `parseOrdersResponse` (and optional repair) returns a non-null parse.
 * Expected outcome: A success result with validated movement, fire, air, ferry, and embark rows.
 * Exceptions: None; invalid rows are dropped with reasons rather than thrown.
 */

import type { AirStrikeOrder, EmbarkOrder, FerryOrder } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import type { GameStateSnapshot } from '../gameDb';
import { logDebug } from '../logger';
import type { AiSeatId } from '../../shared/seatIds';
import { applyParsedCallbackSubscriptions } from './applyParsedCallbackSubscriptions';
import { createPathfindingSession } from '../tools/pathfinding';
import { executeStandingOrders, generateOrdersForStandingOrders } from '../tools/standingOrders';
import { mergeCommanderAttackOrders } from '../tools/tempoRuleAttacks';
import { buildStrategicOpponentFerryOrders } from '../tools/tempoRuleAirFerry';
import { applyMovementOrdersToPlanState } from '../tacticalBattle/tacticalPlanStateMovement';
import { projectTacticalSnapshotAfterOpponentMovementOrders } from '../tacticalBattle/tacticalMovementApply';
import {
  validateTacticalOpponentAirStrikeOrder,
  validateTacticalOpponentEmbarkOrder,
  validateTacticalOpponentFerryOrder,
} from '../tacticalBattle/tacticalOpponentOrderValidation';
import { tacticalComputeMovementOrderOutcome } from '../tacticalBattle/tacticalSnapshotGuards';
import type { RequestOrdersFlowDeps } from './requestOrdersFlowDepsTypes';
import type { RequestOrdersResult } from './requestOrdersFlowTypes';
import { parseOrdersResponse } from './orderResponseParsing';
import { dedupeByUnitKeepLast } from './requestOrdersFlowSupport';
import type { RequestOrdersUsageTotals } from './requestOrdersToolLoop';

/**
 * Parsed envelope accepted by `parseOrdersResponse`.
 *
 * Purpose: Avoid repeating the parser's inline return type at the apply boundary.
 * When to use: Argument to `applyParsedRequestOrders`.
 * Expected outcome: Same shape as a non-null `parseOrdersResponse` result.
 * Exceptions: None.
 */
export type ParsedRequestOrders = NonNullable<ReturnType<typeof parseOrdersResponse>>;

/**
 * Inputs for validating and merging a parsed envelope into a success result.
 *
 * Purpose: One object so apply cannot be called with a mismatched snapshot and validator pair.
 * When to use: Built in `requestOrdersFlow` after a successful parse.
 * Expected outcome: Same drops and merges as the previous inline block.
 * Exceptions: None.
 */
export interface ApplyParsedRequestOrdersArgs {
  /**
   * Parsed envelope from the model (or repair).
   *
   * Contract: Non-null `parseOrdersResponse` result.
   * When to use: After parse/repair succeeded.
   * Expected outcome: Callbacks, movement, and optional tails are read from this object.
   * Exceptions: None.
   */
  readonly parsed: ParsedRequestOrders;
  /**
   * Whether standing-order tools are enabled.
   *
   * Contract: `flags.ordersEnabled` for this consultation.
   * When to use: Standing-order generation and invalid-standing cancel.
   * Expected outcome: False skips generation.
   * Exceptions: None.
   */
  readonly ordersEnabled: boolean;
  /**
   * Battle snapshot when this consultation is a tactical beat.
   *
   * Contract: Undefined on strategic turns.
   * When to use: Tactical validation and skip standing-order expansion.
   * Expected outcome: Strategic path runs when undefined.
   * Exceptions: None.
   */
  readonly tacticalBattle: TacticalBattleSnapshot | undefined;
  /**
   * Commander whose orders are being applied.
   *
   * Contract: An AI seat. Standing orders, ferries, callbacks, and validators use this seat.
   * When to use: Every successful parse.
   * Expected outcome: Another seat's unit is dropped.
   * Exceptions: None.
   */
  readonly seatId: AiSeatId;
  /**
   * World snapshot.
   *
   * Contract: Same `state` the orchestrator holds.
   * When to use: Standing-order generation and strategic ferry merge.
   * Expected outcome: Opponent standing orders mutate progress when generated.
   * Exceptions: None.
   */
  readonly state: GameStateSnapshot;
  /**
   * Plan snapshot used for validators.
   *
   * Contract: Battle plan state in tactical mode; world state otherwise.
   * When to use: Movement and ranged validators.
   * Expected outcome: Matches the prompt's plan state.
   * Exceptions: None.
   */
  readonly planState: GameStateSnapshot;
  /**
   * Hex centers.
   *
   * Contract: Same map as tool execution.
   * When to use: Standing-order generation and cancel_order.
   * Expected outcome: Round-trips with `resolveToH3`.
   * Exceptions: None.
   */
  readonly latLngByH3: Map<string, [number, number]>;
  /**
   * Lat/lng to H3 resolver.
   *
   * Contract: Same function as parse.
   * When to use: Standing-order generation.
   * Expected outcome: Destinations match briefing cells.
   * Exceptions: None.
   */
  readonly resolveToH3: (lat: number, lng: number) => string | undefined;
  /**
   * Lazy pathfinding session for standing-order expansion.
   *
   * Contract: Strategic only.
   * When to use: `generateOrdersForStandingOrders`.
   * Expected outcome: Session reuse is counted by the caller.
   * Exceptions: None.
   */
  readonly getOrCreateAiPlanningPathfindingSession: () => ReturnType<typeof createPathfindingSession>;
  /**
   * Display label for a unit id in drop reasons.
   *
   * Contract: Tactical sub-unit labels in battle; strategic display names otherwise.
   * When to use: Drop-reason strings.
   * Expected outcome: Human-readable ids.
   * Exceptions: None.
   */
  readonly aiOrderUnitLabel: (unitId: string) => string;
  /**
   * Strategic movement validator.
   *
   * Contract: Same `deps.validateAiOrder`.
   * When to use: Non-tactical movement rows.
   * Expected outcome: Invalid rows are dropped, not applied.
   * Exceptions: None.
   */
  readonly validateAiOrder: RequestOrdersFlowDeps['validateAiOrder'];
  /**
   * Ranged-attack validator.
   *
   * Contract: Same `deps.validateAiRangedOrder`.
   * When to use: Merged ranged rows.
   * Expected outcome: Invalid rows are dropped, not applied.
   * Exceptions: None.
   */
  readonly validateAiRangedOrder: RequestOrdersFlowDeps['validateAiRangedOrder'];
  /**
   * Per-group invocation counters, including the events key written here.
   *
   * Contract: Mutated in place.
   * When to use: Success result telemetry.
   * Expected outcome: `events` counts applied callback subscriptions.
   * Exceptions: None.
   */
  readonly toolInvocationCounts: Record<string, number>;
  /**
   * Cost and token totals for the success result.
   *
   * Contract: Already includes loop and repair usage.
   * When to use: Optional cost/token fields on the result.
   * Expected outcome: Zero totals become undefined on the result.
   * Exceptions: None.
   */
  readonly usage: RequestOrdersUsageTotals;
  /**
   * Consultation start time in epoch ms.
   *
   * Contract: Same value used by the tool loop.
   * When to use: `wallClockMs` on the result and the sidebar completion line.
   * Expected outcome: Elapsed ms from start to apply.
   * Exceptions: None.
   */
  readonly wallClockStart: number;
  /**
   * Sidebar log callback.
   *
   * Contract: Same callback as the orchestrator.
   * When to use: Completion summary line.
   * Expected outcome: Identical wording to the previous inline apply block.
   * Exceptions: None.
   */
  readonly onLog: ((line: string, isError?: boolean) => void) | undefined;
  /**
   * Records a successful consultation in persistence.
   *
   * Contract: Same helper the budget-exceeded path uses with nulls.
   * When to use: After validation, before returning success.
   * Expected outcome: Last-consultation turn and strategy note are written.
   * Exceptions: None.
   */
  readonly markSuccessfulConsultation: (strategyText?: string | null, messageText?: string | null) => void;
}

/**
 * Merges standing orders with the parsed envelope and validates every row.
 *
 * Purpose: The apply block is large enough that leaving it in the orchestrator would breach the size limit.
 * When to use: Once per consultation after a successful parse.
 * Expected outcome: `RequestOrdersResult` with the same drops as the previous inline implementation.
 * Exceptions: None.
 */
export function applyParsedRequestOrders(args: ApplyParsedRequestOrdersArgs): RequestOrdersResult {
  logDebug('openRouter applyParsedRequestOrders', {
    turnNumber: args.state.turnNumber,
    tacticalBattleId: args.tacticalBattle?.battleId ?? null,
    movement: args.parsed.movementOrders?.length ?? 0,
  });
  const {
    parsed,
    ordersEnabled,
    tacticalBattle,
    seatId,
    state,
    planState,
    latLngByH3,
    resolveToH3,
    getOrCreateAiPlanningPathfindingSession,
    aiOrderUnitLabel,
    validateAiOrder,
    validateAiRangedOrder,
    toolInvocationCounts,
    usage,
    wallClockStart,
    onLog,
    markSuccessfulConsultation,
  } = args;
  const flags = { ordersEnabled };
  toolInvocationCounts['events'] = applyParsedCallbackSubscriptions({
    seatId,
    callbacks: parsed.callbacks,
    turnNumber: state.turnNumber,
    battleSubUnitIds: tacticalBattle ? new Set(tacticalBattle.subUnits.map((u) => u.id)) : null,
    battleId: tacticalBattle?.battleId,
  });

  // Tactical beats omit strategic standing-order expansion: assign_order/cancel_order are blocked for sub-unit ids,
  // so auto-generated pursue/march from parents must not substitute for explicit_move this beat.
  const standingGenerated =
    flags.ordersEnabled && !tacticalBattle
      ? generateOrdersForStandingOrders(seatId, state, latLngByH3, resolveToH3, {
          mutateProgress: true,
          pathfindingSession: getOrCreateAiPlanningPathfindingSession(),
        })
      : { movementOrders: [], rangedAttacks: [], airStrikes: [] };
  if (tacticalBattle && flags.ordersEnabled) {
    logDebug('openRouter requestOrdersFlow skipping standing-order generation for tactical opponent', {
      battleId: tacticalBattle.battleId,
    });
  }
  const llmMovementOrders = dedupeByUnitKeepLast(parsed.movementOrders ?? []);
  const llmRangedOrders = dedupeByUnitKeepLast(parsed.rangedAttacks ?? []);
  const llmAirStrikes = dedupeByUnitKeepLast(parsed.airStrikes ?? []);
  const llmFerryOrders = dedupeByUnitKeepLast(parsed.ferryOrders ?? []);
  const llmEmbarkOrders = dedupeByUnitKeepLast(parsed.embarkOrders ?? []);
  const llmMovementByUnit = new Map(llmMovementOrders.map((o) => [o.unitId, o.toH3Index]));
  const llmMovementUnitIds = new Set(llmMovementOrders.map((o) => o.unitId));
  const mergedMovement = [...standingGenerated.movementOrders.filter((o) => !llmMovementUnitIds.has(o.unitId)), ...llmMovementOrders];
  const { rangedAttacks: mergedRanged, airStrikes: mergedAirStrikes } = mergeCommanderAttackOrders({
    seatId,
    state,
    tacticalBattle,
    standingOrderRanged: standingGenerated.rangedAttacks,
    standingOrderAirStrikes: standingGenerated.airStrikes,
    modelRanged: llmRangedOrders,
    modelAirStrikes: llmAirStrikes,
  });

  const validated: { unitId: string; toH3Index: string }[] = [];
  const dropReasons: string[] = [...(parsed.dropReasons ?? [])];
  const invalidStandingMovementUnits = new Set<string>();
  const seenUnits = new Set<string>();
  for (const order of mergedMovement) {
    if (seenUnits.has(order.unitId)) {
      dropReasons.push(`Duplicate order for ${aiOrderUnitLabel(order.unitId)}`);
      continue;
    }
    if (tacticalBattle) {
      const tacticalSet = new Set(tacticalBattle.tacticalChildH3Indexes);
      const sub = [...tacticalBattle.subUnits];
      const byId = new Map(sub.map((u, i) => [u.id, i] as const));
      const tacticalOutcome = tacticalComputeMovementOrderOutcome({
        byId,
        sub,
        order,
        tacticalSet,
        battle: tacticalBattle,
      });
      if (!tacticalOutcome.ok) {
        const plannerReason =
          tacticalOutcome.reason === 'out_of_range' &&
          tacticalOutcome.context &&
          typeof (tacticalOutcome.context as { plannerReason?: unknown }).plannerReason === 'string'
            ? (tacticalOutcome.context as { plannerReason: string }).plannerReason
            : '';
        const suffix = plannerReason ? ` (${plannerReason})` : '';
        dropReasons.push(
          `Tactical march ${aiOrderUnitLabel(order.unitId)} -> ${order.toH3Index}: ${tacticalOutcome.reason}${suffix}`
        );
        continue;
      }
      const appliedTo = tacticalOutcome.appliedToH3Index;
      const unitRow = sub[tacticalOutcome.idx]!;
      if (appliedTo === unitRow.h3Index) {
        if (order.toH3Index !== unitRow.h3Index) {
          dropReasons.push(
            `Tactical march ${aiOrderUnitLabel(order.unitId)} -> ${order.toH3Index}: out_of_range (no_progress)`
          );
        }
        seenUnits.add(order.unitId);
        continue;
      }
      if (appliedTo !== order.toH3Index) {
        dropReasons.push(
          `Tactical march ${aiOrderUnitLabel(order.unitId)}: clamped explicit_move destination to first leg this beat (${order.toH3Index} → ${appliedTo})`
        );
      }
      validated.push({ unitId: order.unitId, toH3Index: appliedTo });
      seenUnits.add(order.unitId);
      continue;
    }
    const result = validateAiOrder(order, planState, { labelForUnitId: aiOrderUnitLabel, seatId });
    if (result.valid) {
      validated.push(order);
      seenUnits.add(order.unitId);
    } else {
      const sourceIsLlmOverride = llmMovementUnitIds.has(order.unitId);
      const hasStandingForUnit = standingGenerated.movementOrders.some((o) => o.unitId === order.unitId);
      if (!sourceIsLlmOverride && hasStandingForUnit && result.reason === 'Invalid distance') {
        invalidStandingMovementUnits.add(order.unitId);
        continue;
      }
      dropReasons.push(`${aiOrderUnitLabel(order.unitId)} -> ${order.toH3Index}: ${result.reason}`);
    }
  }
  if (flags.ordersEnabled && invalidStandingMovementUnits.size > 0 && !tacticalBattle) {
    for (const unitId of invalidStandingMovementUnits) {
      executeStandingOrders(seatId, 'cancel_order', { unitId }, state, latLngByH3, resolveToH3);
    }
  }

  const planAfterMove =
    tacticalBattle && validated.length > 0
      ? applyMovementOrdersToPlanState(planState, validated)
      : planState;

  const validatedRanged: { unitId: string; targetH3Index: string }[] = [];
  const seenRanged = new Set<string>();
  const rangedState = tacticalBattle ? planAfterMove : planState;
  for (const r of mergedRanged) {
    if (seenRanged.has(r.unitId)) {
      dropReasons.push(`Duplicate ranged for ${aiOrderUnitLabel(r.unitId)}`);
      continue;
    }
    const result = validateAiRangedOrder(r, rangedState, {
      labelForUnitId: aiOrderUnitLabel,
      tacticalBattle: tacticalBattle ?? undefined,
      seatId,
    });
    if (result.valid) {
      validatedRanged.push(r);
      seenRanged.add(r.unitId);
    } else {
      if (!tacticalBattle && result.reason === 'Target out of range') {
        const movedTo = llmMovementByUnit.get(r.unitId);
        if (movedTo && movedTo === r.targetH3Index) continue;
      }
      dropReasons.push(`Ranged ${aiOrderUnitLabel(r.unitId)} -> ${r.targetH3Index}: ${result.reason}`);
    }
  }

  let outAir = mergedAirStrikes;
  let outFerry = llmFerryOrders;
  let outEmbark = llmEmbarkOrders;
  if (tacticalBattle) {
    const movementProjected =
      validated.length > 0
        ? projectTacticalSnapshotAfterOpponentMovementOrders(tacticalBattle, validated)
        : tacticalBattle;
    const validatedAir: AirStrikeOrder[] = [];
    const seenStrike = new Set<string>();
    for (const s of mergedAirStrikes) {
      if (seenStrike.has(s.unitId)) {
        dropReasons.push(`Duplicate air strike for ${aiOrderUnitLabel(s.unitId)}`);
        continue;
      }
      const vr = validateTacticalOpponentAirStrikeOrder(s, planAfterMove, aiOrderUnitLabel, tacticalBattle);
      if (vr.valid) {
        validatedAir.push(s);
        seenStrike.add(s.unitId);
      } else {
        dropReasons.push(`Air strike ${aiOrderUnitLabel(s.unitId)}: ${vr.reason}`);
      }
    }
    const strikeIds = new Set(validatedAir.map((s) => s.unitId));
    const validatedFerry: FerryOrder[] = [];
    const seenFerry = new Set<string>();
    for (const f of llmFerryOrders) {
      if (seenFerry.has(f.unitId)) {
        dropReasons.push(`Duplicate ferry for ${aiOrderUnitLabel(f.unitId)}`);
        continue;
      }
      if (strikeIds.has(f.unitId)) {
        dropReasons.push(`Air unit ${aiOrderUnitLabel(f.unitId)} cannot strike and ferry in the same tactical turn`);
        continue;
      }
      const fr = validateTacticalOpponentFerryOrder(f, planAfterMove, aiOrderUnitLabel, movementProjected);
      if (fr.valid) {
        validatedFerry.push(f);
        seenFerry.add(f.unitId);
      } else {
        dropReasons.push(`Ferry ${aiOrderUnitLabel(f.unitId)}: ${fr.reason}`);
      }
    }
    const validatedEmb: EmbarkOrder[] = [];
    const seenEmbarkLand = new Set<string>();
    for (const e of llmEmbarkOrders) {
      if (seenEmbarkLand.has(e.unitId)) {
        dropReasons.push(`Duplicate embark for ${aiOrderUnitLabel(e.unitId)}`);
        continue;
      }
      const er = validateTacticalOpponentEmbarkOrder(
        e,
        movementProjected.subUnits,
        movementProjected.enclosingStrategicH3Index
      );
      if (er.valid) {
        validatedEmb.push(e);
        seenEmbarkLand.add(e.unitId);
      } else {
        dropReasons.push(`Embark ${aiOrderUnitLabel(e.unitId)}: ${er.reason}`);
      }
    }
    outAir = validatedAir;
    outFerry = validatedFerry;
    outEmbark = validatedEmb;
  } else {
    const strategicFerry = buildStrategicOpponentFerryOrders({
      playerId: seatId,
      state,
      modelFerryOrders: llmFerryOrders,
      airStrikeUnitIds: new Set(mergedAirStrikes.map((s) => s.unitId)),
      displayLabelForUnit: aiOrderUnitLabel,
    });
    outFerry = strategicFerry.ferryOrders;
    dropReasons.push(...strategicFerry.dropReasons);
  }

  markSuccessfulConsultation(parsed.strategy, parsed.message);
  logDebug('openRouter requestOrders: orders applied', {
    turnNumber: state.turnNumber,
    tacticalBattleId: tacticalBattle?.battleId ?? null,
    movement: validated.length,
    ranged: validatedRanged.length,
    airStrikes: outAir.length,
    ferry: outFerry.length,
    embark: outEmbark.length,
    dropped: dropReasons.length,
    dropReasons,
  });
  if (onLog) {
    const ms = Date.now() - wallClockStart;
    const bits: string[] = [
      `${validated.length} movement`,
      `${validatedRanged.length} ranged`,
    ];
    if (tacticalBattle) {
      bits.push(`${outAir.length} air strike(s)`);
      bits.push(`${outFerry.length} ferry`);
      bits.push(`${outEmbark.length} embark`);
    } else {
      bits.push(`${outAir.length} air strike(s)`);
      bits.push(`${outFerry.length} ferry`);
    }
    const dropNote = dropReasons.length > 0 ? `; ${dropReasons.length} validation note(s)` : '';
    const tokNote =
      usage.totalInputTokens > 0 || usage.totalOutputTokens > 0
        ? `; session tokens in/out ${usage.totalInputTokens}/${usage.totalOutputTokens}`
        : '';
    onLog(`AI planning complete in ${ms} ms: ${bits.join(', ')}${dropNote}${tokNote}.`);
  }
  return {
    success: true,
    orders: validated,
    rangedAttacks: validatedRanged.length > 0 ? validatedRanged : undefined,
    airStrikes: outAir.length > 0 ? outAir : undefined,
    ferryOrders: outFerry.length > 0 ? outFerry : undefined,
    embarkOrders: outEmbark.length > 0 ? outEmbark : undefined,
    strategy: parsed.strategy,
    message: parsed.message,
    dropped: dropReasons.length,
    dropReasons: dropReasons.length > 0 ? dropReasons : undefined,
    toolInvocationCounts,
    cost: usage.requestCost > 0 ? usage.requestCost : undefined,
    wallClockMs: Date.now() - wallClockStart,
    inputTokens: usage.totalInputTokens > 0 ? usage.totalInputTokens : undefined,
    outputTokens: usage.totalOutputTokens > 0 ? usage.totalOutputTokens : undefined,
  };
}

