/**
 * One-string view of a consultation prompt.
 *
 * Purpose: Callers and tests that search the whole prompt keep one function. The messages are built separately.
 * When to use: When a single string is enough. `requestOrdersFlow` uses `buildConsultMessages` instead.
 * Expected outcome: The system text, a blank line, and the situation text.
 * Exceptions: None. Home-control failures are logged inside the parts builder.
 */

import type { GameStateSnapshot } from '../gameDb';
import type { CoordinateContext } from '../briefing/map/coordinateContext';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { buildConsultPromptParts, joinConsultPromptParts } from './consultPromptParts';

/**
 * Assembles the system text and the situation, then joins them.
 *
 * Purpose: Existing call sites keep this signature.
 * When to use: Tests and any caller that wants the joined prompt.
 * Expected outcome: `joinConsultPromptParts` of the two parts.
 * Exceptions: None beyond the parts builder.
 */
export function buildSystemPromptForTools(
  state: GameStateSnapshot,
  coordMap: {
    latLngByH3: Map<string, [number, number]>;
    format: (h3: string) => string;
    resolveToH3: (lat: number, lng: number) => string | undefined;
  },
  enabledToolNames?: string[],
  briefingOverride?: string,
  coordinateContext: CoordinateContext = { mode: 'strategic' },
  includeExitBattle = false,
  /**
   * Battle whose sub-units still carry birth terrain.
   *
   * Contract: Omitted on a strategic consult. The plan-state units do not carry origin.
   * When to use: Tactical `requestOrders`, passing the same snapshot the briefing used.
   * Expected outcome: Naval terrain-entry reads birth terrain from these sub-units.
   * Exceptions: None.
   */
  tacticalBattle: TacticalBattleSnapshot | null = null
): string {
  return joinConsultPromptParts(buildConsultPromptParts({
    state,
    coordMap,
    enabledToolNames,
    briefingOverride,
    coordinateContext,
    includeExitBattle,
    tacticalBattle,
  }));
}
