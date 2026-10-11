/**
 * Developer-only hang stand-in for one OpenRouter chat completion.
 *
 * Purpose: Timeouts, retries, and cancel can be exercised without a slow model.
 * When to use: The chat transport, on every attempt, reading the environment again.
 * Expected outcome: `off` leaves the real request alone. `first` hangs only attempt 0. `all` hangs every attempt.
 * Exceptions: Any other value is off. The hang length is clamped to 100ms through the real request timeout.
 */

import { AI_MODEL_REQUEST_TIMEOUT_MS } from '../../shared/aiConsultationLimits';
import { logTrace } from '../logger';

/**
 * Which attempts replace the HTTPS call with a wait that ends only when the attempt is aborted.
 *
 * Purpose: Names the three simulator settings.
 * When to use: `shouldSimulateModelHang`.
 * Expected outcome: `off`, `first`, or `all`.
 * Exceptions: None.
 */
export type ModelHangSimulationMode = 'off' | 'first' | 'all';

/**
 * Reads `AGENT_WARS_SIMULATE_MODEL_HANG` for this attempt.
 *
 * Purpose: The flag can change between calls, including between a hang and the retry that should hit the network.
 * When to use: At the start of each transport attempt.
 * Expected outcome: `first` or `all` when the variable matches, ignoring case. Anything else is `off`.
 * Exceptions: None.
 */
export function readModelHangSimulationMode(): ModelHangSimulationMode {
  const raw = process.env.AGENT_WARS_SIMULATE_MODEL_HANG?.trim().toLowerCase();
  const mode: ModelHangSimulationMode = raw === 'first' || raw === 'all' ? raw : 'off';
  logTrace('modelHangSimulation readModelHangSimulationMode', { mode });
  return mode;
}

/**
 * Reads how long a simulated hang waits before the attempt abort timer fires.
 *
 * Purpose: A short hang reproduces the timeout path in tests; a longer hang leaves time to click Run off.
 * When to use: When `shouldSimulateModelHang` is true, as that attempt's abort deadline.
 * Expected outcome: An integer from 100 through `AI_MODEL_REQUEST_TIMEOUT_MS`. A missing or non-integer value is 15000.
 * Exceptions: None.
 */
export function readModelHangSimulationMs(): number {
  const raw = Number(process.env.AGENT_WARS_SIMULATE_MODEL_HANG_MS);
  const clamped = Number.isInteger(raw)
    ? Math.min(AI_MODEL_REQUEST_TIMEOUT_MS, Math.max(100, raw))
    : 15_000;
  logTrace('modelHangSimulation readModelHangSimulationMs', { ms: clamped });
  return clamped;
}

/**
 * True when this network attempt should wait on the abort timer instead of posting.
 *
 * Purpose: `first` still lets the retry call OpenRouter. `all` hangs every attempt.
 * When to use: Before `postChatViaHttps`, with the zero-based network attempt index (credit-cap retries do not advance it).
 * Expected outcome: True for `all`, or for `first` when `networkAttemptIndex` is 0.
 * Exceptions: None.
 */
export function shouldSimulateModelHang(networkAttemptIndex: number): boolean {
  const mode = readModelHangSimulationMode();
  const simulate = mode === 'all' || (mode === 'first' && networkAttemptIndex === 0);
  logTrace('modelHangSimulation shouldSimulateModelHang', { networkAttemptIndex, simulate });
  return simulate;
}
