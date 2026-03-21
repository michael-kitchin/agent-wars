/**
 * Hybrid AI turn pipeline (milestone 1.1): documents the logical sequence the main process follows
 * for WEGO + optional LLM consultation. This module does not replace existing handlers; it centralizes
 * the narrative for readers and agents. Order of operations in production:
 *
 * 1. **Resolution** — Human + AI orders apply; combat resolves (`ready` / `gameActions`).
 * 2. **Pre-computation** — When the AI is consulted, assessment/combat estimates may run before the LLM
 *    (`runPrecomputation` inside `requestOrders`, or equivalent briefing build).
 * 3. **Callbacks** — After resolution, mandatory overrides and subscriptions are evaluated (`afterResolution`).
 * 4. **Optional LLM** — If a consultation runs, read-only tools + final JSON (`orders[]`, `memoryUpdates`, `callbacks`).
 * 5. **Planning** — UI returns to human planning phase for the next turn.
 *
 * Event-driven mode defers step 4 until a callback fires or a deadman triggers; pending orders carry results to the next Ready.
 */

import { logTrace } from './logger';

/**
 * Emits a single trace when crossing a documented pipeline boundary (no behavior change).
 * Use sparingly at stable chokepoints (e.g. start of Ready handling).
 */
export function logHybridPipelineBoundary(stage: string, detail?: Record<string, unknown>): void {
  logTrace('hybridTurnPipeline boundary', { stage, ...detail });
}
