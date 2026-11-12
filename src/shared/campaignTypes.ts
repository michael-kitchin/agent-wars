/**
 * One stored shape for an AI side's ground campaign, shared by the briefing, the response parser, and the stored game row.
 *
 * Purpose: The briefing, the response parser, and the stored game row share one shape so they cannot drift.
 * When to use: Anywhere a campaign target, staging hex, or phase is stored or passed across modules.
 * Expected outcome: Types only. This file imports nothing, so gameDb, openRouter, and tools can use it without a cycle.
 * Exceptions: None.
 */

/**
 * Whether ground units are still gathering or already attacking.
 *
 * Purpose: Callers branch on the two stored phases without stringly typed checks.
 * When to use: Stored objectives and the campaign plan.
 * Expected outcome: `assemble` while gathering, `assault` while attacking.
 * Exceptions: None.
 */
export type CampaignPhase = 'assemble' | 'assault';

/**
 * Who picked the current target.
 *
 * Purpose: The briefing says whether the engine or the commander chose the city.
 * When to use: Stored objectives.
 * Expected outcome: `engine` when the engine picked the target, `commander` when the model's campaignTarget did.
 * Exceptions: None.
 */
export type CampaignSource = 'engine' | 'commander';

/**
 * The phases a stored row may contain.
 *
 * Purpose: Parsing rejects anything outside this list.
 * When to use: When reading a stored objective.
 * Expected outcome: `assemble` then `assault`.
 * Exceptions: None.
 */
export const CAMPAIGN_PHASES: readonly CampaignPhase[] = ['assemble', 'assault'];

/**
 * The sources a stored row may contain.
 *
 * Purpose: Parsing rejects anything outside this list.
 * When to use: When reading a stored objective.
 * Expected outcome: `engine` and `commander`.
 * Exceptions: None.
 */
export const CAMPAIGN_SOURCES: readonly CampaignSource[] = ['engine', 'commander'];

/**
 * The target, staging hex, and phase kept between consults.
 *
 * Purpose: One row per AI seat, replaced once per strategic consult.
 * When to use: The game_config value and the campaign plan.
 * Expected outcome: A target that is still an enemy city the force can reach by land.
 * Exceptions: None.
 */
export interface CampaignObjective {
  /**
   * The enemy city the campaign takes.
   *
   * Contract: An H3 index of a candidate city, or a commander target that was a candidate when it was stored.
   * When to use: Scoring, briefing, and the override echo check.
   * Expected outcome: A non-empty H3 index.
   * Exceptions: None.
   */
  readonly targetH3: string;
  /**
   * Where ground units gather before the assault.
   *
   * Contract: Null when no controlled hex qualifies; the campaign then attacks directly.
   * When to use: The assemble waypoint and the mass check.
   * Expected outcome: A controlled land hex at least two land steps from the target, or null.
   * Exceptions: None.
   */
  readonly stagingH3: string | null;
  /**
   * Whether the force is gathering or attacking.
   *
   * Contract: `assemble` while gathering, `assault` while attacking.
   * When to use: The waypoint and the ready consult.
   * Expected outcome: One of `CAMPAIGN_PHASES`.
   * Exceptions: None.
   */
  readonly phase: CampaignPhase;
  /**
   * Who picked the current target.
   *
   * Contract: `engine` when the engine picked the target, `commander` when the model's campaignTarget did.
   * When to use: The briefing chooser sentence.
   * Expected outcome: One of `CAMPAIGN_SOURCES`.
   * Exceptions: None.
   */
  readonly source: CampaignSource;
  /**
   * The turn the current target was picked.
   *
   * Contract: The consult turn that stored this target. An echo does not change it.
   * When to use: The briefing target bullet.
   * Expected outcome: An integer turn number.
   * Exceptions: None.
   */
  readonly chosenTurn: number;
}


