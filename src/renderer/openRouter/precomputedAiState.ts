import type { RequestAiOrdersResult } from '../../shared/ipcTypes';
import { rendererSharedState as S } from '../core/state';

type PrecomputedResetMode = 'null' | 'empty';

/**
 * Why this exists:
 *     Centralizes precomputed AI planning cache resets used by Run toggle, Ready, and new-game flows.
 * When to use:
 *     Any renderer transition that invalidates cached AI planning output.
 * What to expect:
 *     Resets movement/ranged/embark/strategy/tool-count caches consistently to null or empty-array mode.
 */
export function resetPrecomputedAiState(mode: PrecomputedResetMode): void {
  if (mode === 'empty') {
    S.precomputedAiOrders = [];
    S.precomputedAiRangedOrders = [];
    S.precomputedAiEmbarkOrders = [];
  } else {
    S.precomputedAiOrders = null;
    S.precomputedAiRangedOrders = null;
    S.precomputedAiEmbarkOrders = null;
  }
  S.precomputedAiStrategy = null;
  S.precomputedToolInvocationCounts = null;
}

/**
 * Why this exists:
 *     Stores successful background AI planning payloads into the shared precomputed cache.
 * When to use:
 *     After game:requestAiOrders returns success while Run is enabled.
 * What to expect:
 *     Precomputed movement/ranged/embark/strategy payloads are updated for the next Ready click.
 */
export function applySuccessfulPrecomputedAiResult(result: Extract<RequestAiOrdersResult, { success: true }>): void {
  S.precomputedAiOrders = result.orders;
  S.precomputedAiRangedOrders = result.rangedAttacks ?? [];
  S.precomputedAiEmbarkOrders = result.embarkOrders ?? [];
  S.precomputedAiStrategy = result.strategy ?? null;
}
