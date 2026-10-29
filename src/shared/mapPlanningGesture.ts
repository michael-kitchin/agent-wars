import { isMissileUnitType } from './missileRules';

/**
 * How the human selection is composed for map planning gestures.
 *
 * Purpose: Lets double-click handling branch on air, non-air, and mixed selections without repeating type scans.
 * When to use: Build it from the unit types captured in the gesture-start snapshot, not the live selection.
 * Expected outcome: `empty` for no types, `mixed` when air and non-air are both present, otherwise `airOnly` or `nonAirOnly`.
 * Exceptions: None.
 */
export type MapSelectionComposition = 'empty' | 'airOnly' | 'nonAirOnly' | 'mixed' | 'missileOnly' | 'mixedMissile';

/**
 * What a main-map double-click should do once the selection snapshot and icon hit are known.
 *
 * Purpose: Keeps support-target, ferry, march, reject, ignore, and deselect outcomes in one table shared by both map modes.
 * When to use: Returned by `resolveMapDoubleClickAction`. On `needFerryValidation`, run the ferry check and resolve again.
 * Expected outcome: Exactly one outcome per call.
 * Exceptions: None.
 */
export type MapDoubleClickAction =
  | { kind: 'ignore' }
  | { kind: 'planSupportTarget' }
  | { kind: 'needFerryValidation' }
  | { kind: 'rejectMixed' }
  | { kind: 'rejectMissileMixed' }
  | { kind: 'planFerry' }
  | { kind: 'rejectFerry' }
  | { kind: 'deselect' }
  | { kind: 'planMarch' };

/**
 * Inputs for `resolveMapDoubleClickAction`.
 *
 * Purpose: Bundles gesture facts so the decision stays a pure function testable without a DOM.
 * When to use: Build one object per double-click. Leave `ferryEligible` null until the ferry check returns.
 * Expected outcome: Consumed only by `resolveMapDoubleClickAction`.
 * Exceptions: None.
 */
export type MapDoubleClickDecisionInput = {
  targetingModeActive: boolean;
  /**
   * Whether the double-click pointer was over a map hex.
   *
   * Purpose: Ranged and air-strike commits use only that hex. March and ferry planning may fall back to the hovered or selected hex, and must not lend that fallback to an attack.
   * When to use: Set from `clickHit !== null` before calling `resolveMapDoubleClickAction`.
   * Expected outcome: With targeting on, a true value and a non-empty selection plan a support target. A false value ignores the double-click.
   * Exceptions: None.
   */
  pointerHasHit: boolean;
  hasDestination: boolean;
  composition: MapSelectionComposition;
  allSelectedUnitsAlreadyAtDestination: boolean;
  iconHit: boolean;
  ferryEligible: boolean | null;
};

/**
 * Inputs for `resolveMapGesturePress`.
 *
 * Purpose: Carries everything needed to tell the second press of a double-click apart from an unrelated new click.
 * When to use: Build one object on each primary-button press on the main map.
 * Expected outcome: Consumed only by `resolveMapGesturePress`.
 * Exceptions: None.
 */
export type MapGesturePressInput = {
  snapshotAtMs: number;
  snapshotAnchorClientX: number;
  snapshotAnchorClientY: number;
  snapshotUnitCount: number;
  liveSelectionDiffersFromSnapshot: boolean;
  shiftKey: boolean;
  clientX: number;
  clientY: number;
  nowMs: number;
};

/**
 * What a primary-button press should do to the gesture selection snapshot.
 *
 * Purpose: One place to decide whether a press starts a new gesture or continues a double-click already underway.
 * When to use: Returned by `resolveMapGesturePress`. Keep `suppressIconRetarget` until the click that follows this press is handled.
 * Expected outcome: The three flags stay mutually consistent; a refreshing press never suppresses or restores.
 * Exceptions: None.
 */
export type MapGesturePressDecision = {
  refreshSnapshot: boolean;
  restoreSnapshotSelection: boolean;
  suppressIconRetarget: boolean;
};

/**
 * Milliseconds within which a second press can still belong to the first press's gesture.
 *
 * Purpose: Matches the usual operating system double-click threshold, so a genuine double-click is covered and two deliberate single clicks are not.
 * When to use: Only inside `resolveMapGesturePress`.
 * Expected outcome: A press later than this always starts a fresh snapshot.
 * Exceptions: None.
 */
export const MAP_DOUBLE_CLICK_SELECTION_FREEZE_MS = 500;

/**
 * Pixels of movement allowed between the two presses of one double-click.
 *
 * Purpose: Without a distance limit, clicking one unit and then quickly clicking a different unit would be treated as a double-click and the second unit would never get selected.
 * When to use: Only inside `resolveMapGesturePress`.
 * Expected outcome: A press further than this from the anchor starts a fresh snapshot.
 * Exceptions: None.
 */
export const MAP_DOUBLE_CLICK_ANCHOR_TOLERANCE_PX = 6;

/**
 * Classifies a selection by air and non-air membership.
 *
 * Purpose: Shared rule so strategic and tactical double-click handling cannot drift apart.
 * When to use: Pass the `unitType` of every human unit in the gesture-start snapshot.
 * Expected outcome: See `MapSelectionComposition`.
 * Exceptions: None. The literal `'air'` is the only air unit type.
 */
export function mapSelectionComposition(unitTypes: readonly string[]): MapSelectionComposition {
  if (unitTypes.length === 0) return 'empty';
  if (unitTypes.every((unitType) => isMissileUnitType(unitType))) return 'missileOnly';
  if (unitTypes.some((unitType) => isMissileUnitType(unitType))) return 'mixedMissile';
  let hasAir = false;
  let hasNonAir = false;
  for (const unitType of unitTypes) {
    if (unitType === 'air') hasAir = true;
    else hasNonAir = true;
  }
  if (hasAir && hasNonAir) return 'mixed';
  if (hasAir) return 'airOnly';
  return 'nonAirOnly';
}

/**
 * Chooses the double-click outcome from selection composition, icon hit, and ferry eligibility.
 *
 * Purpose: One table for both map modes so icon clicks and empty clicks cannot grow separate branches.
 * When to use: After the destination hex and the gesture-start selection are known.
 * Expected outcome: While targeting is on, a pointer hex and a non-empty selection plan a support target; anything else is ignored and movement is not considered. With targeting off, an empty click on the units' own hex clears, air units otherwise clear on an empty ineligible click and toast on an icon one, mixed selections reject, and non-air selections plan a march.
 * Exceptions: None.
 */
export function resolveMapDoubleClickAction(input: MapDoubleClickDecisionInput): MapDoubleClickAction {
  if (input.targetingModeActive) {
    if (input.pointerHasHit && input.composition !== 'empty') return { kind: 'planSupportTarget' };
    return { kind: 'ignore' };
  }
  if (!input.hasDestination || input.composition === 'empty') {
    return { kind: 'ignore' };
  }
  if (input.allSelectedUnitsAlreadyAtDestination) {
    return input.iconHit ? { kind: 'ignore' } : { kind: 'deselect' };
  }
  if (input.composition === 'mixedMissile') return { kind: 'rejectMissileMixed' };
  if (input.composition === 'missileOnly') return input.iconHit ? { kind: 'ignore' } : { kind: 'deselect' };
  if (input.composition === 'mixed') {
    return { kind: 'rejectMixed' };
  }
  if (input.composition === 'airOnly') {
    if (input.ferryEligible === null) return { kind: 'needFerryValidation' };
    if (input.ferryEligible) return { kind: 'planFerry' };
    if (!input.iconHit) return { kind: 'deselect' };
    return { kind: 'rejectFerry' };
  }
  return { kind: 'planMarch' };
}

/**
 * Decides whether a press starts a new gesture or continues a double-click already in progress.
 *
 * Purpose: The second press must plan for the units the player had selected, not for whatever icon sits under the cursor, while two separate clicks in different places keep behaving normally.
 * When to use: On every primary-button press on the main map. Pass `snapshotAtMs` `0` when no gesture is open.
 * Expected outcome: A press continues the gesture only when it is inside the time window, within the pixel tolerance, without Shift, and the snapshot holds at least one unit. Continuing presses suppress icon retarget and restore the snapshot when a deferred select already changed the live selection.
 * Exceptions: None.
 */
export function resolveMapGesturePress(input: MapGesturePressInput): MapGesturePressDecision {
  const withinWindow =
    input.snapshotAtMs !== 0 && input.nowMs - input.snapshotAtMs <= MAP_DOUBLE_CLICK_SELECTION_FREEZE_MS;
  const withinAnchor =
    Math.abs(input.clientX - input.snapshotAnchorClientX) <= MAP_DOUBLE_CLICK_ANCHOR_TOLERANCE_PX &&
    Math.abs(input.clientY - input.snapshotAnchorClientY) <= MAP_DOUBLE_CLICK_ANCHOR_TOLERANCE_PX;
  const continuesGesture = withinWindow && withinAnchor && !input.shiftKey && input.snapshotUnitCount > 0;
  if (!continuesGesture) {
    return { refreshSnapshot: true, restoreSnapshotSelection: false, suppressIconRetarget: false };
  }
  return {
    refreshSnapshot: false,
    restoreSnapshotSelection: input.liveSelectionDiffersFromSnapshot,
    suppressIconRetarget: true,
  };
}
