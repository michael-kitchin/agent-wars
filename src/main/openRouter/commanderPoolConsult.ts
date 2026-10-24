/**
 * The OpenRouter consult the commander pool runs for one seat.
 *
 * Purpose: The pool stays free of the request loop. This runner is the one-seat consult.
 * When to use: When the commander IPC handlers are registered.
 * Expected outcome: A finished plan, a timeout, or a failure. The pool stores the plan.
 * Exceptions: Logs and returns a failure outcome. Does not throw.
 */

import { tacticalOpponentPlanFromRequestOrdersSuccess } from '../../shared/ipc/tacticalOpponentPlanMerge';
import { commanderModelId, getGameStateForPlayer } from '../gameDb';
import { executeAbortableConsult } from '../ipc/modelConsultAttempt';
import { logDebug, logError } from '../logger';
import { setProductionCommanderConsultRunner } from './commanderPool';
import { emitCommanderConsultLog } from './commanderConsultLog';
import { emptyConsultOutcome, type CommanderConsultOutcome, type CommanderConsultRequest } from './commanderPoolSupport';
import { getSelectedModel, getToolNamesForEnabledGroups, hasKey, requestOrders, TOOL_GROUP_REGISTRY } from './openRouter';

/**
 * Installs this runner as the pool's production consult.
 *
 * Purpose: Tests can still replace it. The match screen does not call the pool until a later change.
 * When to use: `registerCommanderPoolIpcHandler`.
 * Expected outcome: Later starts with no test runner call OpenRouter through `executeAbortableConsult`.
 * Exceptions: None.
 */
export function installCommanderConsultRunner(): void {
  logDebug('commanderPoolConsult installCommanderConsultRunner');
  setProductionCommanderConsultRunner(runCommanderConsult);
}

/**
 * Consults one seat and returns the plan, or a failure the pool can store.
 *
 * Purpose: Strategic orders go back to the pool for `setAiPendingOrders`. A battle consult returns a tactical plan instead.
 * When to use: The production runner only.
 * Expected outcome: `finished` when the model returned a plan. `timedOut` when the wait race fired. Otherwise a logged failure and no plan.
 * Exceptions: Does not throw. A missing key or model returns a failure outcome.
 */
async function runCommanderConsult(request: CommanderConsultRequest): Promise<CommanderConsultOutcome> {
  logDebug('commanderPoolConsult runCommanderConsult', {
    seatId: request.seatId,
    theater: request.theater,
    turnNumber: request.turnNumber,
    battleId: request.battle?.battleId ?? null,
  });
  const stored = commanderModelId(request.seatId);
  const modelId = (stored === null ? getSelectedModel() : stored).trim();
  if (!modelId || !hasKey()) {
    const errorMessage = !hasKey() ? 'No API key set' : 'No model selected';
    logError('commanderPoolConsult skipped', new Error(errorMessage));
    return emptyConsultOutcome({ errorMessage, modelId: modelId || null });
  }
  let usedModelId = modelId;
  try {
    const state = getGameStateForPlayer(request.seatId, { maskUnexploredTerrain: false });
    const enabledToolNames = getToolNamesForEnabledGroups(TOOL_GROUP_REGISTRY.map((group) => group.id));
    const attempt = await executeAbortableConsult({
      label: `commander ${request.seatId}`,
      theater: request.theater,
      timeoutMs: request.waitTimeoutMs,
      fallbackModelId: modelId,
      errorLogMessage: `commander consult failed for ${request.seatId}`,
      seatId: request.seatId,
      run: ({ signal, modelId: live }) => {
        usedModelId = live || modelId;
        return requestOrders(state, usedModelId, {
          seatId: request.seatId,
          enabledToolNames,
          signal,
          usePrecomputation: request.theater === 'strategic',
          tacticalAiBattle: request.battle ?? undefined,
          onLog: (line, isError) => emitCommanderConsultLog(request.seatId, line, isError === true),
        });
      },
    });
    if (!attempt.ok) {
      return emptyConsultOutcome({ timedOut: attempt.timedOut, modelId: usedModelId });
    }
    if (!attempt.value.success) {
      return emptyConsultOutcome({ errorMessage: attempt.value.error, modelId: usedModelId });
    }
    const value = attempt.value;
    const prose = (text: string | undefined): string | null => {
      const trimmed = text?.trim() ?? '';
      return trimmed.length > 0 ? trimmed : null;
    };
    return {
      finished: true,
      timedOut: false,
      movementOrders: value.orders,
      rangedOrders: value.rangedAttacks ?? [],
      airStrikeOrders: value.airStrikes ?? [],
      ferryOrders: value.ferryOrders ?? [],
      embarkOrders: value.embarkOrders ?? [],
      message: prose(value.message),
      strategy: prose(value.strategy),
      costUsd: typeof value.cost === 'number' && Number.isFinite(value.cost) ? value.cost : 0,
      modelId: usedModelId,
      tacticalPlan: request.theater === 'tactical' ? tacticalOpponentPlanFromRequestOrdersSuccess(value) : null,
      errorMessage: null,
    };
  } catch (err) {
    logError('commanderPoolConsult runCommanderConsult failed', err);
    return emptyConsultOutcome({
      timedOut: request.signal.aborted,
      modelId: usedModelId,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
}
