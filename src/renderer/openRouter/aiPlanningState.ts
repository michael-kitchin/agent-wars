import { rendererSharedState as S } from '../core/state';

/**
 * Use this to determine whether Run-mode planning must finish before Ready can proceed.
 * Returns true only while Run is enabled and no precomputed AI movement plan exists yet.
 */
export function isWaitingForPrecomputedAiOrders(): boolean {
  return S.runButtonOn && S.precomputedAiOrders === null;
}
