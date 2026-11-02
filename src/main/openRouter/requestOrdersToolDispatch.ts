/**
 * Runs one model tool call and encodes the result for the next message.
 *
 * Purpose: The tool loop stays a transcript driver. The executor choice lives here.
 * When to use: After the loop has decoded the tool arguments.
 * Expected outcome: The same result the loop used to push, ready for `JSON.stringify`.
 * Exceptions: Executor failures propagate to the consult's catch.
 */

import type { AiSeatId } from '../../shared/seatIds';
import type { GameStateSnapshot } from '../gameDb';
import { logDebug } from '../logger';
import type { CoordinateContext } from '../briefing/map/coordinateContext';
import { executeAssessment } from '../tools/assessment';
import { executeCombatEstimation } from '../tools/combatEstimation';
import { executeMemory } from '../tools/memory';
import { executeMercenaryTools, isMercenaryToolName } from '../tools/mercenaryTools';
import { executePathfinding, type PathfindingSession } from '../tools/pathfinding';
import { executeProductionTools } from '../tools/productionTools';
import { executeStandingOrders } from '../tools/standingOrders';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { encodeOpenRouterToolResultForLlm } from './openRouterToolResultHex';

/**
 * Executes one decoded tool call.
 *
 * Purpose: Mercenary, standing orders, production, memory, combat, assessment, and pathfinding stay in one order.
 * When to use: The tool loop, once per enabled tool call that decoded.
 * Expected outcome: An object or other JSON value. Object results pass through hex encoding.
 * Exceptions: Propagates executor errors.
 */
export function executeRequestOrdersTool(args: {
  readonly toolName: string;
  readonly execArgs: unknown;
  readonly actingSeatId: AiSeatId;
  readonly toolState: GameStateSnapshot;
  readonly latLngByH3: Map<string, [number, number]>;
  readonly resolveToH3: (lat: number, lng: number) => string | undefined;
  readonly coordinateContext: CoordinateContext;
  readonly tacticalBattle: TacticalBattleSnapshot | undefined;
  readonly pathfindingSession: PathfindingSession | undefined;
}): unknown {
  const { toolName, execArgs, actingSeatId, toolState, latLngByH3, resolveToH3, tacticalBattle } = args;
  logDebug('requestOrdersToolDispatch executeRequestOrdersTool', { toolName, actingSeatId });
  const result = isMercenaryToolName(toolName)
    ? executeMercenaryTools(actingSeatId, toolName, execArgs, toolState, latLngByH3, resolveToH3)
    : toolName.includes('order') || toolName.includes('standing')
      ? executeStandingOrders(actingSeatId, toolName, execArgs, toolState, latLngByH3, resolveToH3)
      : toolName.includes('build') || toolName.includes('production') || toolName.includes('query_production')
        ? executeProductionTools(actingSeatId, toolName, execArgs, toolState, latLngByH3, resolveToH3)
        : toolName.includes('memory')
          ? executeMemory(actingSeatId, toolName, execArgs, toolState, latLngByH3, resolveToH3)
          : toolName.includes('estimate')
            ? executeCombatEstimation(toolName, execArgs, toolState, latLngByH3, resolveToH3, tacticalBattle)
            : toolName.includes('assess')
              ? executeAssessment(toolName, execArgs, toolState, latLngByH3, resolveToH3, tacticalBattle)
              : executePathfinding(
                  toolName,
                  execArgs,
                  toolState,
                  latLngByH3,
                  resolveToH3,
                  args.pathfindingSession,
                  tacticalBattle
                );
  if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
    return encodeOpenRouterToolResultForLlm(
      toolName,
      result as Record<string, unknown>,
      args.coordinateContext,
      resolveToH3
    );
  }
  return result;
}
