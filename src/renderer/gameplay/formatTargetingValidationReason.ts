/**
 * Rewrites `unitId: reason` validation strings using friendly unit labels when possible.
 *
 * Purpose: Keeps map toast copy consistent whether IPC returns raw ids or plain messages.
 * When to use: Pass `resolveUnitDisplayName` bound to renderer state (`S.unitDisplayNameById`); supply `fallbackMessage` when reason is empty.
 * Expected outcome: Friendly label prefix when the reason matches `id: detail`; otherwise trimmed reason or fallback.
 * Exceptions: None.
 */
export function formatTargetingValidationReason(
  reason: string | undefined,
  fallbackMessage: string,
  resolveUnitDisplayName: (unitId: string) => string
): string {
  const trimmed = reason?.trim();
  if (!trimmed) return fallbackMessage;
  const prefixed = trimmed.match(/^([^:]+):\s+(.+)$/);
  if (!prefixed) return trimmed;
  const unitId = prefixed[1] ?? '';
  const unitReason = prefixed[2] ?? '';
  if (!unitId || !unitReason) return trimmed;
  return `${resolveUnitDisplayName(unitId)}: ${unitReason}`;
}
