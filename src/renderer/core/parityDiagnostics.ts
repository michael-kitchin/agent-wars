/**
 * Optional parity diagnostics breadcrumbs for strategic/tactical renderer boundary decisions.
 *
 * Purpose: Adds low-noise, opt-in troubleshooting context for preview/selection parity regressions.
 * When to use: Call from parity-sensitive decision points only (double-click planning, draft-vs-committed source choice).
 * Expected outcome: No output unless diagnostics are explicitly enabled by setting localStorage key `agentWarsParityDiagnostics=1`.
 * Exceptions: None.
 */

const PARITY_DIAGNOSTICS_FLAG_KEY = 'agentWarsParityDiagnostics';

/**
 * Returns whether renderer parity diagnostics breadcrumbs are enabled for the current browser session.
 *
 * Purpose: Keeps parity logging opt-in to avoid noisy default console output for normal gameplay.
 * When to use: Internal guard for all parity breadcrumb emissions in this module.
 * Expected outcome: `true` only when `localStorage['agentWarsParityDiagnostics'] === '1'`.
 * Exceptions: Returns false when localStorage is unavailable.
 */
function parityDiagnosticsEnabled(): boolean {
  const storage = (globalThis as { localStorage?: Storage }).localStorage;
  if (!storage) return false;
  return storage.getItem(PARITY_DIAGNOSTICS_FLAG_KEY) === '1';
}

/**
 * Emits an opt-in parity breadcrumb with a stable event key and JSON payload.
 *
 * Purpose: Standardizes parity-sensitive diagnostic output so future regressions can be triaged quickly.
 * When to use: Selection/planning/position-source boundaries where strategic and tactical behavior must remain aligned.
 * Expected outcome: One `console.debug` line prefixed with `[parity]` when diagnostics are enabled; otherwise no-op.
 * Exceptions: None.
 */
export function emitParityDiagnosticsBreadcrumb(eventKey: string, details?: Record<string, unknown>): void {
  if (!parityDiagnosticsEnabled()) return;
  console.debug('[parity]', eventKey, details ?? {});
}
