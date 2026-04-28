/**
 * Options for `refreshHoverRoutePreview`; only map pointer-hover passes `allowBlockingOrderTooltip`.
 *
 * Purpose: Keeps `#order-block-tooltip` (“Blocked: …”) from appearing when previews refresh due to clicks/selection/mode toggles.
 * When to use: Callers pass `{ allowBlockingOrderTooltip: true }` only from `#main-map` `pointermove` before recomputing hover preview.
 * Expected outcome: Blocking tooltip shows solely during active map hover with invalid preview; other refreshes clear or skip it.
 * Exceptions: None.
 */
export interface RefreshHoverRoutePreviewOptions {
  /**
   * Whether this refresh may surface the “Blocked: …” order tooltip when the hover preview is invalid.
   *
   * Contract: When `true`, march/ranged/air hover evaluation may show `#order-block-tooltip`; when omitted or `false`, that tooltip must not appear from this refresh.
   * When to use: Pass `true` only for `#main-map` `pointermove`-driven recomputation; omit or pass `false` for clicks, selection changes, or mode toggles.
   * Expected outcome: Blocking tooltips track genuine map hover only; other refresh causes skip or clear them.
   * Exceptions: None.
   */
  allowBlockingOrderTooltip?: boolean;
}
