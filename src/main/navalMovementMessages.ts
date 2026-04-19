/**
 * Documents the module-scope binding `NAVAL_DESTINATION_MUST_BE_WATER_COASTAL` (NAVAL_DESTINATION_MUST_BE_WATER_COASTAL).

 * Purpose: Supports maintainability by documenting why `NAVAL_DESTINATION_MUST_BE_WATER_COASTAL` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const NAVAL_DESTINATION_MUST_BE_WATER_COASTAL = 'Naval units must move to water or coastal hexes';
/**
 * Documents the module-scope binding `NAVAL_START_MUST_BE_WATER_COASTAL` (NAVAL_START_MUST_BE_WATER_COASTAL).

 * Purpose: Supports maintainability by documenting why `NAVAL_START_MUST_BE_WATER_COASTAL` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const NAVAL_START_MUST_BE_WATER_COASTAL = 'Naval units must start in water or coastal hexes';
/**
 * Documents the module-scope binding `NAVAL_SEAPORT_EGRESS_REQUIRED` (NAVAL_SEAPORT_EGRESS_REQUIRED).

 * Purpose: Supports maintainability by documenting why `NAVAL_SEAPORT_EGRESS_REQUIRED` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const NAVAL_SEAPORT_EGRESS_REQUIRED =
  'Naval units on seaport land hexes must move to an adjacent water/coastal hex';

/**
 * Documents the module-scope binding `PLAN_ROUTE_ERR_NAVAL_START` (PLAN_ROUTE_ERR_NAVAL_START).

 * Purpose: Supports maintainability by documenting why `PLAN_ROUTE_ERR_NAVAL_START` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const PLAN_ROUTE_ERR_NAVAL_START = 'No path exists - naval units must start on water/coastal hexes.';
/**
 * Documents the module-scope binding `PLAN_ROUTE_ERR_SEAPORT_EGRESS` (PLAN_ROUTE_ERR_SEAPORT_EGRESS).

 * Purpose: Supports maintainability by documenting why `PLAN_ROUTE_ERR_SEAPORT_EGRESS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const PLAN_ROUTE_ERR_SEAPORT_EGRESS =
  'No path exists - seaport naval units require an adjacent water/coastal hex.';

/**
 * Documents the module-scope binding `PLAN_ROUTE_HINT_DESTINATION_LAND` (PLAN_ROUTE_HINT_DESTINATION_LAND).

 * Purpose: Supports maintainability by documenting why `PLAN_ROUTE_HINT_DESTINATION_LAND` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const PLAN_ROUTE_HINT_DESTINATION_LAND =
  ' Destination is land; naval units cannot move onto pure land. Use a land unit\'s position as destination to get a route to the nearest water/coastal hex.';
/**
 * Documents the module-scope binding `PLAN_ROUTE_HINT_NO_PATH_WATER_COASTAL` (PLAN_ROUTE_HINT_NO_PATH_WATER_COASTAL).

 * Purpose: Supports maintainability by documenting why `PLAN_ROUTE_HINT_NO_PATH_WATER_COASTAL` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const PLAN_ROUTE_HINT_NO_PATH_WATER_COASTAL =
  ' No path to that water/coastal hex (may be in a different water body).';

/**
 * Documents the module-scope binding `PLAN_ROUTE_WARNING_LAND_REDIRECT` (PLAN_ROUTE_WARNING_LAND_REDIRECT).

 * Purpose: Supports maintainability by documenting why `PLAN_ROUTE_WARNING_LAND_REDIRECT` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const PLAN_ROUTE_WARNING_LAND_REDIRECT =
  'Destination was land; route is to the nearest reachable water/coastal hex to that position (naval cannot move onto pure land).';
/**
 * Documents the module-scope binding `PLAN_ROUTE_WARNING_WATER_BODY_FALLBACK` (PLAN_ROUTE_WARNING_WATER_BODY_FALLBACK).

 * Purpose: Supports maintainability by documenting why `PLAN_ROUTE_WARNING_WATER_BODY_FALLBACK` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const PLAN_ROUTE_WARNING_WATER_BODY_FALLBACK =
  'Requested destination is in a different water body; route is to the nearest reachable water/coastal hex toward it.';
/**
 * Documents the module-scope binding `PLAN_ROUTE_WARNING_ALREADY_AT_REDIRECTED_HEX` (PLAN_ROUTE_WARNING_ALREADY_AT_REDIRECTED_HEX).

 * Purpose: Supports maintainability by documenting why `PLAN_ROUTE_WARNING_ALREADY_AT_REDIRECTED_HEX` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const PLAN_ROUTE_WARNING_ALREADY_AT_REDIRECTED_HEX =
  'Unit is already at the nearest water/coastal hex to that land position; no movement this turn.';
/**
 * Documents the module-scope binding `PLAN_ROUTE_WARNING_SEAPORT_EGRESS` (PLAN_ROUTE_WARNING_SEAPORT_EGRESS).

 * Purpose: Supports maintainability by documenting why `PLAN_ROUTE_WARNING_SEAPORT_EGRESS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const PLAN_ROUTE_WARNING_SEAPORT_EGRESS =
  'Naval unit starts on a seaport land hex; first step is an adjacent water/coastal egress.';

/**
 * Documents the module-scope binding `NAVAL_MOVEMENT_PROMPT_RULE` (NAVAL_MOVEMENT_PROMPT_RULE).

 * Purpose: Supports maintainability by documenting why `NAVAL_MOVEMENT_PROMPT_RULE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const NAVAL_MOVEMENT_PROMPT_RULE = 'Naval units move on water/coastal hexes.';
/**
 * Documents the module-scope binding `NAVAL_PLAN_ROUTE_LAND_TARGET_HINT` (NAVAL_PLAN_ROUTE_LAND_TARGET_HINT).

 * Purpose: Supports maintainability by documenting why `NAVAL_PLAN_ROUTE_LAND_TARGET_HINT` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const NAVAL_PLAN_ROUTE_LAND_TARGET_HINT =
  ' To move a naval unit toward a land target, call plan_route with that land unit\'s briefing hex code as the destination.';
/**
 * Documents the module-scope binding `NAVAL_PLAN_ROUTE_PROMPT_SUFFIX` (NAVAL_PLAN_ROUTE_PROMPT_SUFFIX).

 * Purpose: Supports maintainability by documenting why `NAVAL_PLAN_ROUTE_PROMPT_SUFFIX` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const NAVAL_PLAN_ROUTE_PROMPT_SUFFIX =
  ' For naval units, you may pass a land unit\'s briefing hex code as destination; the route will be to the nearest water/coastal hex to that position so the naval can get in range.';
