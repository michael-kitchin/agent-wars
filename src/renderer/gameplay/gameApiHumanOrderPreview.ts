/**
 * Returns `validateGroupRangedTarget` when the preload bridge exposed it (otherwise undefined).
 *
 * Purpose: Keeps hover-preview IPC availability checks in one place alongside related march/air helpers.
 * When to use: Before invoking ranged group validation from `refreshHoverRoutePreview`.
 * Expected outcome: Callable IPC or undefined when bridge not ready.
 * Exceptions: None.
 */
export function getValidateGroupRangedTarget() {
  return window.gameApi?.validateGroupRangedTarget;
}

/**
 * Returns `validateGroupAirStrikeTarget` when the preload bridge exposed it (otherwise undefined).
 *
 * Purpose: Same as `getValidateGroupRangedTarget` for air-strike hover validation.
 * When to use: Before invoking air group validation from `refreshHoverRoutePreview`.
 * Expected outcome: Callable IPC or undefined when bridge not ready.
 * Exceptions: None.
 */
export function getValidateGroupAirStrikeTarget() {
  return window.gameApi?.validateGroupAirStrikeTarget;
}

/**
 * Returns `validateGroupMissileLaunchTarget` when the preload bridge exposed it.
 *
 * Purpose: Same as `getValidateGroupAirStrikeTarget` for missile-launch hover validation.
 * When to use: Before invoking launch validation from `refreshHoverRoutePreview`.
 * Expected outcome: Callable IPC or undefined when the bridge is not ready.
 * Exceptions: None.
 */
export function getValidateGroupMissileLaunchTarget() {
  return window.gameApi?.validateGroupMissileLaunchTarget;
}

/**
 * Returns `previewHumanMarchOrders` when the preload bridge exposed it (otherwise undefined).
 *
 * Purpose: Centralizes strategic march hover preview IPC lookup.
 * When to use: Strategic (non-tactical) march branch in `refreshHoverRoutePreview`.
 * Expected outcome: Callable IPC or undefined when bridge not ready.
 * Exceptions: None.
 */
export function getPreviewHumanMarchOrders() {
  return window.gameApi?.previewHumanMarchOrders;
}
