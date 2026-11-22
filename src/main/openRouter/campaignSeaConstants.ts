/**
 * The numbers that govern a campaign target reached by sea.
 *
 * Purpose: One place holds the sea-route limits, the lift force ratio, and the expiry and skip clocks so the target choice, the lift launch, and the briefing text read the same values.
 * When to use: From the campaign sea rules, target selection, the briefing text, and tests.
 * Expected outcome: Constants only. This file imports nothing, so any campaign module can read it without a cycle.
 * Exceptions: None.
 */

/**
 * Turns added to a sea route for loading and landing.
 *
 * Purpose: A sea route costs more than its sailing time, because the force loads at the port and lands under fire.
 * When to use: Sea route length and the arrival estimate.
 * Expected outcome: 4.
 * Exceptions: None.
 */
export const CAMPAIGN_SEA_STEP_PENALTY = 4;

/**
 * Farthest new sea target, in sea steps.
 *
 * Purpose: Mirrors the land limit of 12 steps plus the sea penalty, so a sea target is no farther than a land one.
 * When to use: `chooseCampaignTarget`.
 * Expected outcome: 16.
 * Exceptions: None.
 */
export const CAMPAIGN_MAX_SEA_STEPS = 16;

/**
 * Farthest stored sea target that is kept, in sea steps.
 *
 * Purpose: Mirrors the land reach limit of 30 steps, so a target does not flip away at the edge of the choice limit.
 * When to use: Keeping a stored target and accepting a commander target.
 * Expected outcome: 30.
 * Exceptions: None.
 */
export const CAMPAIGN_SEA_REACH_LIMIT_STEPS = 30;

/**
 * Own ports tested for a sea route.
 *
 * Purpose: Bounds the routing work to the ports nearest the force.
 * When to use: Choosing which ports `campaignSeaRoutesForState` passes on.
 * Expected outcome: 3.
 * Exceptions: None.
 */
export const CAMPAIGN_SEA_PORT_LIMIT = 3;

/**
 * Sea-only cities whose routes are measured.
 *
 * Purpose: Bounds the routing work to the cities with the best optimistic score.
 * When to use: `chooseCampaignSeaRoutes`.
 * Expected outcome: 8.
 * Exceptions: None.
 */
export const CAMPAIGN_SEA_CITY_TEST_LIMIT = 8;

/**
 * Landing hexes tested per port and city.
 *
 * Purpose: Bounds the routing work to the landings nearest the port.
 * When to use: `chooseCampaignSeaRoutes`.
 * Expected outcome: 3.
 * Exceptions: None.
 */
export const CAMPAIGN_SEA_LANDING_TEST_LIMIT = 3;

/**
 * Ground units needed per enemy unit waiting at the target.
 *
 * Purpose: A landing needs a margin over the defenders, so a lift does not sail into a defeat.
 * When to use: `campaignLiftRequiredUnits` and the briefing text.
 * Expected outcome: 1.5.
 * Exceptions: None.
 */
export const CAMPAIGN_LIFT_FORCE_RATIO = 1.5;

/**
 * Turns a sea target may wait with no campaign lift before it is dropped.
 *
 * Purpose: A target no lift can serve should not hold the campaign forever.
 * When to use: `campaignSeaTargetExpired` and the briefing text.
 * Expected outcome: 10.
 * Exceptions: None.
 */
export const CAMPAIGN_SEA_LAUNCH_WAIT_TURNS = 10;

/**
 * Turns a dropped sea target is not picked again.
 *
 * Purpose: Stops the engine from choosing the same unserved target on the next consult.
 * When to use: `campaignSkipFor` and the briefing text.
 * Expected outcome: 20.
 * Exceptions: None.
 */
export const CAMPAIGN_SEA_SKIP_TURNS = 20;

/**
 * Land steps from the target within which a held hex may serve as a lift landing.
 *
 * Purpose: Later lifts land on the beachhead, and own ground units this close count toward the force a lift needs.
 * When to use: The lift landings and the lift's friendly-nearby count.
 * Expected outcome: 6.
 * Exceptions: None.
 */
export const CAMPAIGN_LIFT_LANDING_MAX_STEPS = 6;

/**
 * Turns after a commander cancels a campaign lift before the engine launches another.
 *
 * Purpose: A cancel is the commander's choice, so the engine does not relaunch the lift it just stopped on the next tick.
 * When to use: `campaignLiftForSeat` and the operation rules text.
 * Expected outcome: 10.
 * Exceptions: None.
 */
export const CAMPAIGN_LIFT_CANCEL_COOLDOWN_TURNS = 10;
