/**
 * Shared naval-movement contract wording for validators, planners, and prompt guidance.
 */

export const NAVAL_DESTINATION_MUST_BE_WATER_COASTAL = 'Naval units must move to water or coastal hexes';
export const NAVAL_START_MUST_BE_WATER_COASTAL = 'Naval units must start in water or coastal hexes';
export const NAVAL_SEAPORT_EGRESS_REQUIRED =
  'Naval units on seaport land hexes must move to an adjacent water/coastal hex';

export const PLAN_ROUTE_ERR_NAVAL_START = 'No path exists - naval units must start on water/coastal hexes.';
export const PLAN_ROUTE_ERR_SEAPORT_EGRESS =
  'No path exists - seaport naval units require an adjacent water/coastal hex.';

export const PLAN_ROUTE_HINT_DESTINATION_LAND =
  ' Destination is land; naval units cannot move onto pure land. Use a land unit\'s position as destination to get a route to the nearest water/coastal hex.';
export const PLAN_ROUTE_HINT_NO_PATH_WATER_COASTAL =
  ' No path to that water/coastal hex (may be in a different water body).';

export const PLAN_ROUTE_WARNING_LAND_REDIRECT =
  'Destination was land; route is to the nearest reachable water/coastal hex to that position (naval cannot move onto pure land).';
export const PLAN_ROUTE_WARNING_WATER_BODY_FALLBACK =
  'Requested destination is in a different water body; route is to the nearest reachable water/coastal hex toward it.';
export const PLAN_ROUTE_WARNING_ALREADY_AT_REDIRECTED_HEX =
  'Unit is already at the nearest water/coastal hex to that land position; no movement this turn.';
export const PLAN_ROUTE_WARNING_SEAPORT_EGRESS =
  'Naval unit starts on a seaport land hex; first step is an adjacent water/coastal egress.';

export const NAVAL_MOVEMENT_PROMPT_RULE = 'Naval units move on water/coastal hexes.';
export const NAVAL_PLAN_ROUTE_LAND_TARGET_HINT =
  ' To move a naval unit toward a land target, call plan_route with that land unit\'s [lat,lng] as the destination.';
export const NAVAL_PLAN_ROUTE_PROMPT_SUFFIX =
  ' For naval units, you may pass a land unit\'s [lat, lng] as destination; the route will be to the nearest water/coastal hex to that position so the naval can get in range.';
