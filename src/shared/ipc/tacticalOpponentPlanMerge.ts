import type { AirStrikeOrder, EmbarkOrder, FerryOrder } from './ordersTypes';
import type { TacticalOpponentPlanPayload } from './consultationPushTypes';

/**
 * True when the opponent tactical plan carries at least one executable row across movement, support, or embark lists.
 *
 * Purpose: Distinguishes a real buffered plan from an all-empty object used only for UI latch bookkeeping so commit-return
 * merges do not treat “no rows” as a substantive plan.
 * When to use: Tactical Ready payload shaping and tactical post-beat consultation merge logic.
 * Expected outcome: False for null/undefined or every list empty; true if any list is non-empty.
 * Exceptions: None.
 */
export function tacticalOpponentPlanPayloadHasAnyOrders(
  plan: TacticalOpponentPlanPayload | null | undefined
): boolean {
  if (plan == null) return false;
  return (
    plan.movementOrders.length +
      plan.rangedAttacks.length +
      plan.airStrikes.length +
      plan.ferryOrders.length +
      plan.embarkOrders.length >
    0
  );
}

/**
 * Builds a buffered tactical opponent plan from a successful `requestOrders` / `requestOrdersFlow` payload.
 *
 * Purpose: `requestOrdersFlow` returns strategic-shaped `orders` arrays; tactical IPC and post-beat consultation need the
 * renderer `tacticalOpponentPlan` shape. Without this wrap, post-beat consult treated success as “missing plan” and dropped
 * `toolInvocationCounts` / strategy even though tools ran.
 * When to use: `handleRequestAiOrders` after a tactical consultation, and `afterTacticalBeatResolution` when the injected
 * `requestOrders` does not already attach `tacticalOpponentPlan`.
 * Expected outcome: All five plan lists populated (possibly empty) from the success result’s order arrays.
 * Exceptions: None.
 */
export function tacticalOpponentPlanFromRequestOrdersSuccess(raw: {
  orders: readonly { unitId: string; toH3Index: string }[];
  rangedAttacks?: readonly { unitId: string; targetH3Index: string }[];
  airStrikes?: readonly AirStrikeOrder[];
  ferryOrders?: readonly FerryOrder[];
  embarkOrders?: readonly EmbarkOrder[];
}): TacticalOpponentPlanPayload {
  return {
    movementOrders: [...raw.orders],
    rangedAttacks: [...(raw.rangedAttacks ?? [])],
    airStrikes: [...(raw.airStrikes ?? [])],
    ferryOrders: [...(raw.ferryOrders ?? [])],
    embarkOrders: [...(raw.embarkOrders ?? [])],
  };
}

/**
 * Says whether the next battle beat needs another consult.
 *
 * Purpose: A non-empty plan is already stored for the next beat. An empty plan means that beat has no orders yet.
 * When to use: After a tactical commit returns post-beat consultation fields.
 * Expected outcome: A non-empty plan returns `startBackgroundPrefetch` false. A missing or empty plan returns a null
 * draft and `startBackgroundPrefetch` true so the screen can start another battle consult.
 * Exceptions: None.
 */
export function nextTacticalOpponentDraftAfterPostBeatPlan(
  tacticalOpponentPlan: TacticalOpponentPlanPayload | null | undefined
): { draft: TacticalOpponentPlanPayload | null; startBackgroundPrefetch: boolean } {
  if (tacticalOpponentPlan != null && tacticalOpponentPlanPayloadHasAnyOrders(tacticalOpponentPlan)) {
    return { draft: tacticalOpponentPlan, startBackgroundPrefetch: false };
  }
  return { draft: null, startBackgroundPrefetch: true };
}

/**
 * IPC fragment for `committedOpponentTacticalDraft` after Ready consumes an incoming opponent draft.
 *
 * Purpose: Prevents the renderer from recycling applied marches into the next beat (every-other-beat / `already_at_destination` stagger).
 * When to use: `commitHumanTacticalDraftOrders` success return when `opponentTacticalDraft` was present on the request.
 * Expected outcome: `{ committedOpponentTacticalDraft: null }` when a draft was sent; `{}` when none was sent.
 * Exceptions: None.
 */
export function committedOpponentTacticalDraftFieldAfterConsume(
  hadIncomingOpponentDraft: boolean
): { committedOpponentTacticalDraft: null } | Record<string, never> {
  return hadIncomingOpponentDraft ? { committedOpponentTacticalDraft: null } : {};
}
