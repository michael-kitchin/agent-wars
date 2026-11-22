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
 * How the campaign force reaches its target.
 *
 * Purpose: A target the ground units can walk to differs from one the engine ships them to.
 * When to use: Stored objectives, the briefing, the posture report, the keep rule, and the sea-target expiry. The campaign lift launch does not read it: it launches for any stored objective, land or sea, carrying the ground units that cannot walk to the waypoint.
 * Expected outcome: `land` when ground units march to the target, `sea` when the target is out of land reach and campaign lifts are expected to carry them.
 * Exceptions: None.
 */
export type CampaignApproach = 'land' | 'sea';

/**
 * The approaches a stored row may contain.
 *
 * Purpose: Parsing rejects anything outside this list.
 * When to use: When reading a stored objective.
 * Expected outcome: `land` and `sea`.
 * Exceptions: None.
 */
export const CAMPAIGN_APPROACHES: readonly CampaignApproach[] = ['land', 'sea'];

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
  /**
   * How the force reaches the target.
   *
   * Contract: Absent means `land`, which is what every earlier save holds. `sea` means the target is out of land reach and campaign lifts are expected to carry the force. The lift launch does not check it.
   * When to use: The briefing, the posture report, the keep rule, and the expiry rule. Read it with `campaignApproachOf`.
   * Expected outcome: One of `CAMPAIGN_APPROACHES`, or absent.
   * Exceptions: None.
   */
  readonly approach?: CampaignApproach;
  /**
   * The turn the last campaign lift for this target launched.
   *
   * Contract: Absent until a campaign lift launches for the current target. A new target starts without it.
   * When to use: The expiry rule counts the wait from this turn.
   * Expected outcome: An integer turn number, or absent.
   * Exceptions: None.
   */
  readonly liftLaunchedTurn?: number;
  /**
   * The turn the commander last cancelled a campaign lift for this target.
   *
   * Contract: Absent until the commander cancels a campaign lift for the current target. A new target starts without it. While fewer than `CAMPAIGN_LIFT_CANCEL_COOLDOWN_TURNS` turns have passed since this turn, the engine launches no new campaign lift.
   * When to use: The lift launch reads it to respect the commander's cancel.
   * Expected outcome: An integer turn number, or absent.
   * Exceptions: None.
   */
  readonly liftCancelledTurn?: number;
  /**
   * A sea target the engine dropped and will not pick again for a while.
   *
   * Contract: Present together with `skippedTurn`, or absent together with it.
   * When to use: Target choice leaves this city out while the skip is active.
   * Expected outcome: A non-empty H3 index, or absent.
   * Exceptions: None.
   */
  readonly skippedTargetH3?: string;
  /**
   * The turn the skipped target was dropped.
   *
   * Contract: Present together with `skippedTargetH3`, or absent together with it.
   * When to use: The skip stays active for a fixed number of turns after this one.
   * Expected outcome: An integer turn number, or absent.
   * Exceptions: None.
   */
  readonly skippedTurn?: number;
}

/**
 * Reads an objective's approach with the default applied.
 *
 * Purpose: A stored row without the field is a land campaign, so every reader applies the same default.
 * When to use: Wherever code branches on how the force reaches the target.
 * Expected outcome: `land` when the field is absent, otherwise the stored value.
 * Exceptions: None.
 */
export function campaignApproachOf(objective: Pick<CampaignObjective, 'approach'>): CampaignApproach {
  return objective.approach ?? 'land';
}


