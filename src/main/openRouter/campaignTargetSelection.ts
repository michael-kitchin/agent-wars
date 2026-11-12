/**
 * Which enemy city the campaign takes, and where the force gathers first.
 *
 * Purpose: Scores the cities the side may march on under the fog rule, picks the best one in reach, and picks the staging hex near it.
 * When to use: From `resolveCampaignObjective`, the commander override, campaignObjectiveFlow, and tests.
 * Expected outcome: The same result for the same inputs. Nothing here reads the database or the terrain cache.
 * Exceptions: None.
 */

import { logDebug, logTrace } from '../logger';

/**
 * Farthest target the engine picks, in land steps.
 *
 * Purpose: A farther city is left for a later campaign so the force can actually arrive.
 * When to use: `chooseCampaignTarget` only. A kept or commander target may be farther.
 * Expected outcome: 12.
 * Exceptions: None.
 */
export const CAMPAIGN_MAX_LAND_STEPS = 12;

/**
 * Closest a staging hex may be to the target, in land steps.
 *
 * Purpose: Gathering on the target's doorstep is the assault, not the assembly.
 * When to use: `chooseStagingHex`.
 * Expected outcome: 2.
 * Exceptions: None.
 */
export const CAMPAIGN_STAGING_MIN_STEPS = 2;

/**
 * Score multiplier for a city inside an enemy home.
 *
 * Purpose: Knocking a side out means taking its home cities.
 * When to use: `scoreCampaignCity` and the integer rank comparison.
 * Expected outcome: 2.
 * Exceptions: None.
 */
export const CAMPAIGN_ENEMY_HOME_WEIGHT = 2;

/**
 * Known fortified cells that halve a city's score.
 *
 * Purpose: Four known fortified cells double the denominator.
 * When to use: `scoreCampaignCity` and the integer rank comparison.
 * Expected outcome: 4.
 * Exceptions: None.
 */
export const CAMPAIGN_FORTIFICATIONS_PER_PENALTY_STEP = 4;

/**
 * One enemy city the campaign may take.
 *
 * Purpose: Scoring reads urban count, home membership, and known forts from one row.
 * When to use: The output of `knownCampaignCities`.
 * Expected outcome: `urbanHexCount` is at least 1 and `ownerSeatId` is an active enemy.
 * Exceptions: None.
 */
export interface CampaignCity {
  /**
   * The city hex.
   *
   * Contract: The infrastructure row's H3 index.
   * When to use: Target choice and reach.
   * Expected outcome: A non-empty H3 index.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Public urban cells on the hex.
   *
   * Contract: Greater than zero. Urban count is geography, not intel.
   * When to use: The score numerator.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly urbanHexCount: number;
  /**
   * The side treated as holding the city.
   *
   * Contract: An active enemy seat. Explored hexes use known control. An unexplored hex uses the single enemy home that contains it.
   * When to use: Candidate filtering.
   * Expected outcome: A seat id in the active-enemy set.
   * Exceptions: None.
   */
  readonly ownerSeatId: string;
  /**
   * Whether the hex sits in an active enemy home.
   *
   * Contract: True when the home seat is an active enemy, including an explored city whose controller is a different enemy.
   * When to use: The score weight.
   * Expected outcome: True or false.
   * Exceptions: None.
   */
  readonly inEnemyHome: boolean;
  /**
   * Fortified cells the side has seen.
   *
   * Contract: Zero on an unexplored hex. Explored hexes use the infrastructure count, never below zero.
   * When to use: The score penalty.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly knownFortifiedCount: number;
}

/**
 * Cities the side may march on, under the fog rule.
 *
 * Purpose: Urban count is public. Control and fortifications count only on explored hexes. An unexplored city inside exactly one active enemy home counts as held by that side, with no fortification penalty.
 * When to use: Once per consult, from inputs derived from the snapshot.
 * Expected outcome: Enemy cities only. A hex the caller omitted from `homeSeatByH3` because it lies in more than one enemy home is not a candidate. Neutral and knocked-out sides are never targets.
 * Exceptions: None.
 */
export function knownCampaignCities(args: {
  readonly activeEnemySeatIds: ReadonlySet<string>;
  readonly infrastructure: readonly { readonly h3Index: string; readonly urbanHexCount: number; readonly fortifiedCount?: number }[];
  readonly controllerByH3: ReadonlyMap<string, string | null>;
  readonly explored: ReadonlySet<string>;
  readonly homeSeatByH3: ReadonlyMap<string, string>;
}): CampaignCity[] {
  const cities: CampaignCity[] = [];
  for (const row of args.infrastructure) {
    if (row.urbanHexCount <= 0) continue;
    const explored = args.explored.has(row.h3Index);
    const homeSeat = args.homeSeatByH3.get(row.h3Index) ?? null;
    const owner = explored ? (args.controllerByH3.get(row.h3Index) ?? null) : homeSeat;
    if (owner === null || !args.activeEnemySeatIds.has(owner)) continue;
    cities.push({
      h3Index: row.h3Index,
      urbanHexCount: row.urbanHexCount,
      ownerSeatId: owner,
      inEnemyHome: homeSeat !== null && args.activeEnemySeatIds.has(homeSeat),
      knownFortifiedCount: explored ? Math.max(0, Math.trunc(row.fortifiedCount ?? 0)) : 0,
    });
  }
  logTrace('campaignTargetSelection knownCampaignCities', { rowCount: args.infrastructure.length, cityCount: cities.length });
  return cities;
}

/**
 * The published score of one city at a land distance.
 *
 * Purpose: Callers and tests can show the formula. Ranking uses `campaignScoreBeats` so an exact tie does not depend on float equality.
 * When to use: Tests and any display of the score. Target choice does not compare these numbers.
 * Expected outcome: `urban × home weight ÷ ((steps + 2) × (1 + known forts ÷ 4))`.
 * Exceptions: None.
 */
export function scoreCampaignCity(city: CampaignCity, landSteps: number): number {
  const homeWeight = city.inEnemyHome ? CAMPAIGN_ENEMY_HOME_WEIGHT : 1;
  const fortificationFactor = 1 + city.knownFortifiedCount / CAMPAIGN_FORTIFICATIONS_PER_PENALTY_STEP;
  logTrace('campaignTargetSelection scoreCampaignCity', { h3Index: city.h3Index, landSteps });
  return (city.urbanHexCount * homeWeight) / ((landSteps + 2) * fortificationFactor);
}

/**
 * True when the first city ranks strictly above the second.
 *
 * Purpose: Cross-multiplying `urban × home weight` and `(steps + 2) × (4 + known forts)` keeps ties exact.
 * When to use: `chooseCampaignTarget` only.
 * Expected outcome: True only when the first score is strictly greater. Equal scores return false so the caller can break the tie by steps, then H3 index.
 * Exceptions: None.
 */
function campaignScoreBeats(city: CampaignCity, steps: number, other: CampaignCity, otherSteps: number): boolean {
  const weight = city.inEnemyHome ? CAMPAIGN_ENEMY_HOME_WEIGHT : 1;
  const otherWeight = other.inEnemyHome ? CAMPAIGN_ENEMY_HOME_WEIGHT : 1;
  const left =
    city.urbanHexCount * weight * (otherSteps + 2) * (CAMPAIGN_FORTIFICATIONS_PER_PENALTY_STEP + other.knownFortifiedCount);
  const right =
    other.urbanHexCount *
    otherWeight *
    (steps + 2) *
    (CAMPAIGN_FORTIFICATIONS_PER_PENALTY_STEP + city.knownFortifiedCount);
  return left > right;
}

/**
 * The enemy city the engine would pick.
 *
 * Purpose: The highest score within `CAMPAIGN_MAX_LAND_STEPS` wins. Ties go to fewer steps, then the lower H3 index.
 * When to use: When the stored target is missing, not a candidate, or out of reach.
 * Expected outcome: The chosen H3 index, or null when no candidate is within the cap.
 * Exceptions: None.
 */
export function chooseCampaignTarget(
  cities: readonly CampaignCity[],
  landStepsFromForce: ReadonlyMap<string, number>
): string | null {
  let best: { readonly h3Index: string; readonly city: CampaignCity; readonly steps: number } | null = null;
  for (const city of cities) {
    const steps = landStepsFromForce.get(city.h3Index);
    if (steps === undefined || steps > CAMPAIGN_MAX_LAND_STEPS) continue;
    const better =
      best === null ||
      campaignScoreBeats(city, steps, best.city, best.steps) ||
      (!campaignScoreBeats(best.city, best.steps, city, steps) &&
        (steps < best.steps || (steps === best.steps && city.h3Index < best.h3Index)));
    if (better) best = { h3Index: city.h3Index, city, steps };
  }
  logDebug('campaignTargetSelection chooseCampaignTarget', {
    cityCount: cities.length,
    chosen: best?.h3Index ?? null,
    steps: best?.steps ?? null,
  });
  return best?.h3Index ?? null;
}

/**
 * The controlled hex where the force gathers.
 *
 * Purpose: The nearest controlled land hex the force can reach, at least `CAMPAIGN_STAGING_MIN_STEPS` from the target. Ties go to fewer steps from the force, then the lower H3 index.
 * When to use: A new target, or a kept target whose staging hex was lost.
 * Expected outcome: The hex, or null when none qualifies. Null starts the campaign in assault.
 * Exceptions: None.
 */
export function chooseStagingHex(args: {
  readonly ownControlledLandHexes: readonly string[];
  readonly landStepsFromTarget: ReadonlyMap<string, number>;
  readonly landStepsFromForce: ReadonlyMap<string, number>;
}): string | null {
  let best: { readonly h3Index: string; readonly toTarget: number; readonly fromForce: number } | null = null;
  for (const h3Index of args.ownControlledLandHexes) {
    const toTarget = args.landStepsFromTarget.get(h3Index);
    const fromForce = args.landStepsFromForce.get(h3Index);
    if (toTarget === undefined || fromForce === undefined || toTarget < CAMPAIGN_STAGING_MIN_STEPS) continue;
    const better =
      best === null ||
      toTarget < best.toTarget ||
      (toTarget === best.toTarget &&
        (fromForce < best.fromForce || (fromForce === best.fromForce && h3Index < best.h3Index)));
    if (better) best = { h3Index, toTarget, fromForce };
  }
  logDebug('campaignTargetSelection chooseStagingHex', {
    candidateCount: args.ownControlledLandHexes.length,
    chosen: best?.h3Index ?? null,
    steps: best?.toTarget ?? null,
  });
  return best?.h3Index ?? null;
}
