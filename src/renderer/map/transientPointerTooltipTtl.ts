/**
 * Creates an independent auto-dismiss timer pair for pointer-follow tooltips sharing `ORDER_BLOCK_HEX_TOOLTIP_TTL_MS` semantics.
 *
 * Purpose: Deduplicates timer lifecycle between `#order-block-tooltip` and `#order-slower-tooltip` without sharing one timer across both elements.
 * When to use: Module-scope `const ttl = createTransientPointerTooltipTtl(ttlMs)` per tooltip kind.
 * Expected outcome: `clear` drops pending expiry; `schedule` replaces the timer and invokes `onExpire` after `ttlMs`.
 * Exceptions: None.
 */
export function createTransientPointerTooltipTtl(ttlMs: number): {
  clear: () => void;
  schedule: (onExpire: () => void) => void;
} {
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  return {
    clear(): void {
      if (hideTimer !== null) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    },
    schedule(onExpire: () => void): void {
      if (hideTimer !== null) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      hideTimer = setTimeout(() => {
        hideTimer = null;
        onExpire();
      }, ttlMs);
    },
  };
}
