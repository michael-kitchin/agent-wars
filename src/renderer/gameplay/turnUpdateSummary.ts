/**
 * Re-exports consolidated map-toast builders from shared code for renderer Ready handlers.
 *
 * Purpose: Keeps a stable import path (`./turnUpdateSummary`) while formatters live in `src/shared`.
 * When to use: Import from `readyHandler` when assembling `#map-toast` update messages after resolution.
 * Expected outcome: Same symbols as `consolidatedTurnUpdateToast.ts` without duplicating logic in the renderer tree.
 * Exceptions: None.
 */
export {
  buildConsolidatedTurnUpdateToastMessage,
  buildOtherTurnUpdatePrimaryLines,
  MAP_TOAST_SECTION_HEADER_PREFIX,
  MAP_TOAST_UPDATES_SECTION_TITLE,
} from '../../shared/consolidatedTurnUpdateToast';
export type { ConsolidatedTurnUpdateToastArgs } from '../../shared/consolidatedTurnUpdateToast';
