/**
 * Stable fingerprint of the human’s in-progress tactical draft lists for prefetch staleness checks.
 *
 * Purpose: Lets the renderer detect when a background `requestAiOrders` started against a different human draft than
 * the one now shown, so stale opponent plans are discarded and in-flight work can be cancelled early (Phase 4).
 * When to use: Capture at tactical prefetch start; compare after edits while `backgroundRequestInFlight` or when the
 * IPC result arrives.
 * Expected outcome: Deterministic string for equal drafts; any change to march targets, ranged/air rows, ferry, or
 * embark rows changes the fingerprint (order within a list normalized by sort).
 * Exceptions: None; pure function over plain arrays.
 */
export type TacticalHumanDraftPrefetchFingerprintSource = {
  tacticalPendingMarches: readonly { subUnitId: string; destinationH3Index: string }[];
  pendingRangedAttacks: readonly { unitId: string; targetH3Index: string }[];
  pendingAirStrikes: readonly { unitId: string; targetH3Index: string; targetType: string }[];
  pendingFerryOrders: readonly { unitId: string; destinationH3Index: string }[];
  pendingEmbarkOrders: readonly { unitId: string; navalUnitId: string }[];
};

/**
 * Serializes each row to a stable string, sorts, and joins with `|` for one fingerprint segment.
 *
 * Purpose: DRY for the five draft lists in `buildTacticalHumanDraftPrefetchFingerprint` without changing the v1 wire format.
 * When to use: Only inside `buildTacticalHumanDraftPrefetchFingerprint`.
 * Expected outcome: Deterministic segment for equal logical rows regardless of input order.
 * Exceptions: None.
 */
function sortedPipeSegment<T>(rows: readonly T[], rowKey: (row: T) => string): string {
  return [...rows].map(rowKey).sort().join('|');
}

/**
 * Builds a compact, deterministic fingerprint string for tactical human draft rows.
 *
 * Purpose: Cheap equality check without deep snapshot comparison; suitable for every edit hook.
 * When to use: `openRouterRuntime` prefetch lifecycle and `withTacticalHumanDraftPrefetchInvalidation` / `invalidateTacticalPrefetchIfHumanDraftChangedSinceRequestStart`.
 * Expected outcome: Same logical draft → same string; different destinations or unit rows → different string.
 * Exceptions: None.
 */
export function buildTacticalHumanDraftPrefetchFingerprint(
  src: TacticalHumanDraftPrefetchFingerprintSource
): string {
  const mar = sortedPipeSegment(src.tacticalPendingMarches, (r) => `${r.subUnitId}\t${r.destinationH3Index}`);
  const rng = sortedPipeSegment(src.pendingRangedAttacks, (r) => `${r.unitId}\t${r.targetH3Index}`);
  const air = sortedPipeSegment(src.pendingAirStrikes, (r) => `${r.unitId}\t${r.targetH3Index}\t${r.targetType}`);
  const fer = sortedPipeSegment(src.pendingFerryOrders, (r) => `${r.unitId}\t${r.destinationH3Index}`);
  const emb = sortedPipeSegment(src.pendingEmbarkOrders, (r) => `${r.unitId}\t${r.navalUnitId}`);
  return `v1|m=${mar}|r=${rng}|a=${air}|f=${fer}|e=${emb}`;
}
