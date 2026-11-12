/**
 * The model copies the engine's suggestions. Without a shared objective, every unit closed on the nearest visible enemy and no side massed for an attack.
 *
 * Purpose: These rules keep or replace the objective, decide the phase from unit positions, and assign each ground unit its campaign role. Target and staging choice are in `campaignTargetSelection`.
 * When to use: From campaignObjectiveFlow, which supplies inputs derived from the snapshot, and from tests.
 * Expected outcome: The same result for the same inputs. Nothing here reads the database or the terrain cache.
 * Exceptions: None.
 */

import type { CampaignObjective, CampaignPhase } from '../../shared/campaignTypes';
import { logDebug, logTrace } from '../logger';
import { chooseCampaignTarget, chooseStagingHex, type CampaignCity } from './campaignTargetSelection';

/**
 * Farthest a kept or commander target may be, in land steps.
 *
 * Purpose: The force can drift away from a target it already chose without the engine immediately replacing it.
 * When to use: `resolveCampaignObjective` and the commander override. The land-step map must be built to this depth so a target at 13 to 30 steps is still present.
 * Expected outcome: 30.
 * Exceptions: None.
 */
export const CAMPAIGN_REACH_LIMIT_STEPS = 30;

/**
 * Hops from the staging hex that count as massed.
 *
 * Purpose: Units a couple of hops apart can start the assault together.
 * When to use: The phase flip, the hold check, and the ready consult.
 * Expected outcome: 2.
 * Exceptions: None.
 */
export const CAMPAIGN_MASS_RADIUS = 2;

/**
 * Units needed to start the assault, capped by the force size.
 *
 * Purpose: A small side is not stuck in assemble forever.
 * When to use: `campaignAssaultThreshold`.
 * Expected outcome: 6.
 * Exceptions: None.
 */
export const CAMPAIGN_ASSAULT_MIN_UNITS = 6;

/**
 * Hops to an enemy that make a home unit a defender.
 *
 * Purpose: An enemy ground unit this close to a home unit is a threat, and each threat keeps one home unit home.
 * When to use: `chooseHomeDefenders`.
 * Expected outcome: 3.
 * Exceptions: None.
 */
export const CAMPAIGN_HOME_DEFENSE_RADIUS = 3;

/**
 * Largest share of the ground force that stays home as defenders.
 *
 * Purpose: A side whose home borders the enemy still sends a force to the campaign.
 * When to use: `chooseHomeDefenders`. The campaign rule text and the Campaign Objective defender bullet say "half"; change them when this changes.
 * Expected outcome: 0.5. The cap is the ground-unit count times this share, rounded down, so a side with one ground unit keeps no defender.
 * Exceptions: None.
 */
export const CAMPAIGN_HOME_DEFENDER_MAX_SHARE = 0.5;

/**
 * Hops to an enemy that leave a unit fighting.
 *
 * Purpose: A unit already in contact is not pulled off to the campaign.
 * When to use: `buildCampaignPlan`.
 * Expected outcome: 1.
 * Exceptions: None.
 */
export const CAMPAIGN_CONTACT_RADIUS = 1;

/**
 * Hop distance between two hexes, or null when the pair cannot be measured.
 *
 * Purpose: Phase and contact use hops, not land steps.
 * When to use: Pass `computeGridDistanceWithPathFallbackPure` from production code so a pair does not log.
 * Expected outcome: A non-negative hop count, or null.
 * Exceptions: None.
 */
export type HopDistance = (fromH3: string, toH3: string) => number | null;

/**
 * A ground unit the campaign may assign.
 *
 * Purpose: Role and order lookups need only the id and the hex.
 * When to use: `buildCampaignPlan` and `campaignOrderFor`.
 * Expected outcome: Infantry or armor that is not embarked.
 * Exceptions: None.
 */
export interface CampaignUnitInput {
  /**
   * The unit id.
   *
   * Contract: The roster id.
   * When to use: Campaign, hold, and defender sets.
   * Expected outcome: A non-empty id.
   * Exceptions: None.
   */
  readonly id: string;
  /**
   * The unit's current hex.
   *
   * Contract: The snapshot hex.
   * When to use: Contact, defense, and hold checks.
   * Expected outcome: An H3 index.
   * Exceptions: None.
   */
  readonly h3Index: string;
}

/**
 * The objective plus the units that follow it this consult.
 *
 * Purpose: Briefing builders receive one plan and do not read the database.
 * When to use: After `buildCampaignPlan`.
 * Expected outcome: Campaign units head for `waypointH3`. Hold units defend where they are.
 * Exceptions: None.
 */
export interface CampaignPlan {
  /**
   * The objective after this consult's resolution.
   *
   * Contract: The stored shape, including a refreshed staging hex and phase.
   * When to use: The briefing and the override echo.
   * Expected outcome: A complete objective.
   * Exceptions: None.
   */
  readonly objective: CampaignObjective;
  /**
   * The hex campaign units head for now.
   *
   * Contract: The staging hex during assemble, otherwise the target.
   * When to use: Suggested destinations and advance rows.
   * Expected outcome: An H3 index.
   * Exceptions: None.
   */
  readonly waypointH3: string;
  /**
   * Ground units that follow the campaign this consult.
   *
   * Contract: Excludes home defenders, units in contact, and units that cannot reach the waypoint by land.
   * When to use: Best Options, and Campaign Orders for these units. A recalled home defender is listed from `defenderUnitIds` instead.
   * Expected outcome: A set of unit ids.
   * Exceptions: None.
   */
  readonly campaignUnitIds: ReadonlySet<string>;
  /**
   * Units already massed during assemble.
   *
   * Contract: A subset of `campaignUnitIds`. Empty during assault.
   * When to use: The hold order and the empty move row.
   * Expected outcome: A set of unit ids.
   * Exceptions: None.
   */
  readonly holdUnitIds: ReadonlySet<string>;
  /**
   * Home defenders, in roster order.
   *
   * Contract: The units `chooseHomeDefenders` keeps home. At most one per threat and at most `CAMPAIGN_HOME_DEFENDER_MAX_SHARE` of the ground force.
   * When to use: The briefing defender bullet and the Campaign Orders recall.
   * Expected outcome: Unit ids in the order they were given.
   * Exceptions: None.
   */
  readonly defenderUnitIds: readonly string[];
  /**
   * Enemy ground units near the home units.
   *
   * Contract: The `threatCount` from `chooseHomeDefenders`.
   * When to use: The Campaign Objective defender bullet.
   * Expected outcome: Zero or more. `defenderUnitIds` is never longer than this.
   * Exceptions: None.
   */
  readonly homeThreatCount: number;
  /**
   * Whether the half-force cap left a home unit out.
   *
   * Contract: True only when more home units were in range than the cap and that cap is smaller than the threat count.
   * When to use: The Campaign Objective defender bullet.
   * Expected outcome: False when every in-range home unit was kept, and false when the threat count was the limit rather than the share.
   * Exceptions: None.
   */
  readonly homeDefenseCapped: boolean;
  /**
   * Ground units near the mass centers.
   *
   * Contract: Counted across all ground units, including defenders and units in contact.
   * When to use: The phase sentence.
   * Expected outcome: A count from zero through the ground-unit count.
   * Exceptions: None.
   */
  readonly massedCount: number;
  /**
   * Units required to start or to hold the assault.
   *
   * Contract: From `campaignAssaultThreshold`.
   * When to use: The phase sentence and the ready check.
   * Expected outcome: At least 1.
   * Exceptions: None.
   */
  readonly threshold: number;
}

/**
 * True when any target is within the hop radius.
 *
 * Purpose: Contact, defense, hold, and mass share one measurement.
 * When to use: Inside the campaign rules. Do not log here; callers measure many pairs.
 * Expected outcome: True when some measured distance is non-null and no greater than `radius`.
 * Exceptions: None. An unmeasurable pair does not count.
 */
function anyWithinHops(fromH3: string, targets: readonly string[], radius: number, hopDistance: HopDistance): boolean {
  return targets.some((h3) => {
    const distance = hopDistance(fromH3, h3);
    return distance !== null && distance <= radius;
  });
}

/**
 * How many ground units must be massed.
 *
 * Purpose: The threshold is the smaller of the constant and the force, and at least one.
 * When to use: The phase flip and the ready check.
 * Expected outcome: `min(CAMPAIGN_ASSAULT_MIN_UNITS, groundUnitCount)`, or 1 when the force is empty.
 * Exceptions: None.
 */
export function campaignAssaultThreshold(groundUnitCount: number): number {
  const threshold = Math.max(1, Math.min(CAMPAIGN_ASSAULT_MIN_UNITS, groundUnitCount));
  logTrace('campaignRules campaignAssaultThreshold', { groundUnitCount, threshold });
  return threshold;
}

/**
 * Hexes that count toward the mass.
 *
 * Purpose: Assemble counts the staging hex. Assault counts the staging hex or the target. No staging hex counts the target.
 * When to use: `nextCampaignPhase` and `buildCampaignPlan`.
 * Expected outcome: One or two H3 indexes.
 * Exceptions: None.
 */
export function campaignMassCenters(objective: CampaignObjective): string[] {
  const centers =
    objective.stagingH3 === null
      ? [objective.targetH3]
      : objective.phase === 'assemble'
        ? [objective.stagingH3]
        : [objective.stagingH3, objective.targetH3];
  logTrace('campaignRules campaignMassCenters', { phase: objective.phase, centerCount: centers.length });
  return centers;
}

/**
 * How many of the given hexes stand near a center.
 *
 * Purpose: The phase and the briefing share one count.
 * When to use: Pass every ground-unit hex, not only campaign units.
 * Expected outcome: The number of hexes within `CAMPAIGN_MASS_RADIUS` hops of any center.
 * Exceptions: None.
 */
export function countMassedUnits(
  unitHexes: readonly string[],
  centerH3s: readonly string[],
  hopDistance: HopDistance
): number {
  const massed = unitHexes.filter((unitH3) => anyWithinHops(unitH3, centerH3s, CAMPAIGN_MASS_RADIUS, hopDistance)).length;
  logTrace('campaignRules countMassedUnits', { unitCount: unitHexes.length, massed });
  return massed;
}

/**
 * The phase after this consult's positions.
 *
 * Purpose: Assemble becomes assault at the threshold. Assault falls back below half the threshold, rounded up. No staging hex stays in assault.
 * When to use: When a stored target is kept.
 * Expected outcome: The next phase.
 * Exceptions: None.
 */
export function nextCampaignPhase(args: {
  readonly phase: CampaignPhase;
  readonly stagingH3: string | null;
  readonly massedCount: number;
  readonly threshold: number;
}): CampaignPhase {
  const phase: CampaignPhase =
    args.stagingH3 === null
      ? 'assault'
      : args.phase === 'assemble'
        ? args.massedCount >= args.threshold
          ? 'assault'
          : 'assemble'
        : args.massedCount < Math.ceil(args.threshold / 2)
          ? 'assemble'
          : 'assault';
  logDebug('campaignRules nextCampaignPhase', {
    from: args.phase,
    phase,
    massedCount: args.massedCount,
    threshold: args.threshold,
  });
  return phase;
}

/**
 * The hex campaign units march toward.
 *
 * Purpose: The Suggested Destination column and the Campaign Orders table must name the same hex.
 * When to use: After the phase is known.
 * Expected outcome: The staging hex during assemble when one exists, otherwise the target.
 * Exceptions: None.
 */
export function campaignWaypoint(objective: CampaignObjective): string {
  const waypointH3 =
    objective.phase === 'assemble' && objective.stagingH3 !== null ? objective.stagingH3 : objective.targetH3;
  logTrace('campaignRules campaignWaypoint', { phase: objective.phase, waypointH3 });
  return waypointH3;
}

/**
 * Hops from one hex to the nearest of the targets.
 *
 * Purpose: Defenders are ranked by how close the nearest threat is.
 * When to use: `chooseHomeDefenders`. Do not log here; it runs once per home unit.
 * Expected outcome: The smallest measured distance, or null when no pair can be measured or the list is empty.
 * Exceptions: None. An unmeasurable pair is skipped.
 */
function nearestHops(fromH3: string, targets: readonly string[], hopDistance: HopDistance): number | null {
  return targets.reduce<number | null>((nearest, h3) => {
    const distance = hopDistance(fromH3, h3);
    return distance !== null && (nearest === null || distance < nearest) ? distance : nearest;
  }, null);
}

/**
 * The home units that stay home this consult.
 *
 * Purpose: One defender per enemy ground unit near home, nearest the enemy first, so a border fight does not hold back the whole force.
 * When to use: Once per consult, from `buildCampaignPlan`. Pass only enemy infantry and armor as `enemyGroundUnitHexes`, one entry per unit.
 * Expected outcome: `threatCount` is the number of entries within `CAMPAIGN_HOME_DEFENSE_RADIUS` hops of a ground unit on a home hex. Defenders are home units within that radius of a threat, ranked by hops to the nearest threat and then by unit id, limited to the threat count and to `CAMPAIGN_HOME_DEFENDER_MAX_SHARE` of all ground units, rounded down. Defenders come back in roster order. `homeDefenseCapped` is true only when more home units were in range than that limit and the limit is below the threat count.
 * Exceptions: None. An unmeasurable pair does not count.
 */
export function chooseHomeDefenders(args: {
  readonly groundUnits: readonly CampaignUnitInput[];
  readonly ownHomeHexes: ReadonlySet<string>;
  readonly enemyGroundUnitHexes: readonly string[];
  readonly hopDistance: HopDistance;
}): { readonly defenderUnitIds: readonly string[]; readonly threatCount: number; readonly homeDefenseCapped: boolean } {
  const homeUnits = args.groundUnits.filter((unit) => args.ownHomeHexes.has(unit.h3Index));
  const threatHexes = args.enemyGroundUnitHexes.filter((enemyH3) =>
    homeUnits.some((unit) => anyWithinHops(unit.h3Index, [enemyH3], CAMPAIGN_HOME_DEFENSE_RADIUS, args.hopDistance))
  );
  const ranked = homeUnits
    .flatMap((unit) => {
      const hops = nearestHops(unit.h3Index, threatHexes, args.hopDistance);
      return hops !== null && hops <= CAMPAIGN_HOME_DEFENSE_RADIUS ? [{ unit, hops }] : [];
    })
    .sort((a, b) => a.hops - b.hops || (a.unit.id < b.unit.id ? -1 : a.unit.id > b.unit.id ? 1 : 0));
  const cap = Math.min(threatHexes.length, Math.floor(args.groundUnits.length * CAMPAIGN_HOME_DEFENDER_MAX_SHARE));
  const chosen = new Set(ranked.slice(0, cap).map((entry) => entry.unit.id));
  const defenderUnitIds = args.groundUnits.filter((unit) => chosen.has(unit.id)).map((unit) => unit.id);
  const homeDefenseCapped = ranked.length > cap && cap < threatHexes.length;
  logDebug('campaignRules chooseHomeDefenders', {
    homeUnitCount: homeUnits.length,
    threatCount: threatHexes.length,
    cap,
    defenderCount: defenderUnitIds.length,
    homeDefenseCapped,
  });
  return { defenderUnitIds, threatCount: threatHexes.length, homeDefenseCapped };
}

/**
 * The objective to store for this consult.
 *
 * Purpose: Keeps a valid target, refreshes a lost staging hex, and retargets when the city is gone or out of land reach.
 * When to use: Once per strategic consult, before the briefing.
 * Expected outcome: Null with no ground units or no candidate. Otherwise the kept objective, with its staging hex refreshed only when it was lost, and the phase from `nextCampaignPhase`. A stored target is out of reach when its land steps are missing or greater than `CAMPAIGN_REACH_LIMIT_STEPS`. When the stored target is not a candidate or is out of reach, a new engine objective in assemble, or in assault without a staging hex.
 * Exceptions: None.
 */
export function resolveCampaignObjective(args: {
  readonly stored: CampaignObjective | null;
  readonly turnNumber: number;
  readonly cities: readonly CampaignCity[];
  readonly landStepsFromForce: ReadonlyMap<string, number>;
  readonly ownControlledLandHexes: readonly string[];
  readonly landStepsFromTarget: (targetH3: string) => ReadonlyMap<string, number>;
  readonly groundUnitHexes: readonly string[];
  readonly hopDistance: HopDistance;
}): CampaignObjective | null {
  if (args.groundUnitHexes.length === 0) {
    logDebug('campaignRules resolveCampaignObjective', { storedTarget: args.stored?.targetH3 ?? null, target: null, steps: null, phase: null });
    return null;
  }
  const candidateH3s = new Set(args.cities.map((city) => city.h3Index));
  const stored = args.stored;
  const storedSteps = stored === null ? undefined : args.landStepsFromForce.get(stored.targetH3);
  let objective: CampaignObjective;
  if (
    stored === null ||
    !candidateH3s.has(stored.targetH3) ||
    storedSteps === undefined ||
    storedSteps > CAMPAIGN_REACH_LIMIT_STEPS
  ) {
    const targetH3 = chooseCampaignTarget(args.cities, args.landStepsFromForce);
    if (targetH3 === null) {
      logDebug('campaignRules resolveCampaignObjective', { storedTarget: stored?.targetH3 ?? null, target: null, steps: null, phase: null });
      return null;
    }
    const stagingH3 = chooseStagingHex({
      ownControlledLandHexes: args.ownControlledLandHexes,
      landStepsFromTarget: args.landStepsFromTarget(targetH3),
      landStepsFromForce: args.landStepsFromForce,
    });
    objective = {
      targetH3,
      stagingH3,
      phase: stagingH3 === null ? 'assault' : 'assemble',
      source: 'engine',
      chosenTurn: args.turnNumber,
    };
  } else {
    const stagingStillHeld = stored.stagingH3 !== null && args.ownControlledLandHexes.includes(stored.stagingH3);
    const stagingH3 =
      stored.stagingH3 === null || stagingStillHeld
        ? stored.stagingH3
        : chooseStagingHex({
            ownControlledLandHexes: args.ownControlledLandHexes,
            landStepsFromTarget: args.landStepsFromTarget(stored.targetH3),
            landStepsFromForce: args.landStepsFromForce,
          });
    const withStaging: CampaignObjective = { ...stored, stagingH3 };
    const phase = nextCampaignPhase({
      phase: stored.phase,
      stagingH3,
      massedCount: countMassedUnits(args.groundUnitHexes, campaignMassCenters(withStaging), args.hopDistance),
      threshold: campaignAssaultThreshold(args.groundUnitHexes.length),
    });
    objective = { ...withStaging, phase };
  }
  logDebug('campaignRules resolveCampaignObjective', {
    storedTarget: stored?.targetH3 ?? null,
    target: objective.targetH3,
    steps: args.landStepsFromForce.get(objective.targetH3) ?? null,
    phase: objective.phase,
  });
  return objective;
}

/**
 * Whether an assembling force is ready for the assault.
 *
 * Purpose: The post-resolution runner consults on the turn the assembly completes, so the assault is not delayed.
 * When to use: After resolution, for a stored assemble objective.
 * Expected outcome: True when the phase is assemble, a staging hex exists, and enough ground units stand within `CAMPAIGN_MASS_RADIUS` hops of it.
 * Exceptions: None.
 */
export function campaignAssaultReady(args: {
  readonly objective: CampaignObjective;
  readonly groundUnitHexes: readonly string[];
  readonly hopDistance: HopDistance;
}): boolean {
  const { objective } = args;
  if (objective.phase !== 'assemble' || objective.stagingH3 === null || args.groundUnitHexes.length === 0) {
    logTrace('campaignRules campaignAssaultReady', { ready: false, phase: objective.phase });
    return false;
  }
  const massed = countMassedUnits(args.groundUnitHexes, [objective.stagingH3], args.hopDistance);
  const ready = massed >= campaignAssaultThreshold(args.groundUnitHexes.length);
  logTrace('campaignRules campaignAssaultReady', { ready, massed, phase: objective.phase });
  return ready;
}

/**
 * The units that follow the objective this consult.
 *
 * Purpose: `chooseHomeDefenders` keeps defenders home, and units in contact keep today's suggestions. Every other ground unit that can reach the waypoint by land is a campaign unit. During assemble, a campaign unit already within the mass radius holds.
 * When to use: Once per consult, after the objective is stored.
 * Expected outcome: A plan whose orders match `campaignOrderFor`.
 * Exceptions: None.
 */
export function buildCampaignPlan(args: {
  readonly objective: CampaignObjective;
  readonly groundUnits: readonly CampaignUnitInput[];
  readonly ownHomeHexes: ReadonlySet<string>;
  readonly enemyUnitHexes: readonly string[];
  readonly enemyGroundUnitHexes: readonly string[];
  readonly landStepsFromWaypoint: ReadonlyMap<string, number>;
  readonly hopDistance: HopDistance;
}): CampaignPlan {
  const waypointH3 = campaignWaypoint(args.objective);
  const assembling = args.objective.phase === 'assemble' && args.objective.stagingH3 !== null;
  const campaignUnitIds = new Set<string>();
  const holdUnitIds = new Set<string>();
  const homeDefense = chooseHomeDefenders({
    groundUnits: args.groundUnits,
    ownHomeHexes: args.ownHomeHexes,
    enemyGroundUnitHexes: args.enemyGroundUnitHexes,
    hopDistance: args.hopDistance,
  });
  const defenderIds = new Set(homeDefense.defenderUnitIds);
  for (const unit of args.groundUnits) {
    if (defenderIds.has(unit.id)) continue;
    if (anyWithinHops(unit.h3Index, args.enemyUnitHexes, CAMPAIGN_CONTACT_RADIUS, args.hopDistance)) continue;
    if (!args.landStepsFromWaypoint.has(unit.h3Index)) continue;
    campaignUnitIds.add(unit.id);
    if (assembling && anyWithinHops(unit.h3Index, [waypointH3], CAMPAIGN_MASS_RADIUS, args.hopDistance)) {
      holdUnitIds.add(unit.id);
    }
  }
  const unitHexes = args.groundUnits.map((unit) => unit.h3Index);
  const plan: CampaignPlan = {
    objective: args.objective,
    waypointH3,
    campaignUnitIds,
    holdUnitIds,
    defenderUnitIds: homeDefense.defenderUnitIds,
    homeThreatCount: homeDefense.threatCount,
    homeDefenseCapped: homeDefense.homeDefenseCapped,
    massedCount: countMassedUnits(unitHexes, campaignMassCenters(args.objective), args.hopDistance),
    threshold: campaignAssaultThreshold(unitHexes.length),
  };
  logTrace('campaignRules buildCampaignPlan', {
    waypointH3,
    campaignUnitCount: campaignUnitIds.size,
    holdCount: holdUnitIds.size,
    defenderCount: homeDefense.defenderUnitIds.length,
    homeThreatCount: homeDefense.threatCount,
    homeDefenseCapped: homeDefense.homeDefenseCapped,
  });
  return plan;
}

/**
 * The standing order a campaign unit should hold.
 *
 * Purpose: The Suggested Destination column and the Campaign Orders table must name the same order.
 * When to use: Suggestion and Campaign Orders builders.
 * Expected outcome: Defend on the unit's hex when it is holding or already on the waypoint. Otherwise march to the waypoint. Null when the unit is not a campaign unit.
 * Exceptions: None.
 */
export function campaignOrderFor(
  plan: CampaignPlan | null,
  unit: CampaignUnitInput
): { readonly orderType: 'march' | 'defend'; readonly destinationH3: string } | null {
  if (plan === null || !plan.campaignUnitIds.has(unit.id)) {
    logTrace('campaignRules campaignOrderFor', { unitId: unit.id, orderType: null });
    return null;
  }
  const order =
    plan.holdUnitIds.has(unit.id) || unit.h3Index === plan.waypointH3
      ? { orderType: 'defend' as const, destinationH3: unit.h3Index }
      : { orderType: 'march' as const, destinationH3: plan.waypointH3 };
  logTrace('campaignRules campaignOrderFor', { unitId: unit.id, orderType: order.orderType });
  return order;
}

/**
 * The Best Options filter for one unit.
 *
 * Purpose: Advance rows close on the campaign hex, and a holding unit gets no move row.
 * When to use: The Best Options move filter.
 * Expected outcome: The waypoint and whether the unit holds, or null when it is not a campaign unit.
 * Exceptions: None.
 */
export function campaignRoleForUnit(
  plan: CampaignPlan | null | undefined,
  unitId: string
): { readonly waypointH3: string; readonly hold: boolean } | null {
  if (!plan || !plan.campaignUnitIds.has(unitId)) {
    logTrace('campaignRules campaignRoleForUnit', { unitId, campaign: false });
    return null;
  }
  const role = { waypointH3: plan.waypointH3, hold: plan.holdUnitIds.has(unitId) };
  logTrace('campaignRules campaignRoleForUnit', { unitId, campaign: true, hold: role.hold });
  return role;
}
