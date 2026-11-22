/**
 * Which postures fit each enemy, as advice for the Posture section.
 *
 * Purpose: The commander picks the posture, so the briefing says how each active enemy can be reached and which postures fit it. The engine never changes a posture.
 * When to use: When the strategic briefing builds the Posture section for a region versus region match.
 * Expected outcome: Pure fit rules plus one flow that reads the seat's own view and returns a report the briefing lines are built from.
 * Exceptions: None. The flow logs a thrown error and returns no report.
 */

import type { GameStateSnapshot } from '../gameDb';
import { briefingOwnSeatId } from '../briefing/briefingPerspective';
import { getMaxUnitsPerType, parseGameSize } from '../../shared/gameSize';
import { getLandStepDistances, landUnitCanOccupyHex, STRATEGIC_LAND_MAX_WATER_PCT } from '../../shared/landTraversalStrategic';
import { isLandUnitType } from '../../shared/landUnitType';
import { POSTURE_SETTINGS, type Posture } from '../../shared/postureTypes';
import type { PostureFitFacts, PostureFitReport, PostureFitRow } from './postureFitTypes';
import { logDebug, logError, logTrace } from '../logger';
import { buildLiftTerrain } from '../operations/liftTerrain';
import { readActivePactPartnerSeatIds } from './campaignPactPartners';
import { loadCampaignLandMass } from './campaignObjectiveFlow';
import { CAMPAIGN_ASSAULT_MIN_UNITS, CAMPAIGN_REACH_LIMIT_STEPS } from './campaignRules';
import { CAMPAIGN_MAX_LAND_STEPS } from './campaignTargetSelection';
import { OPERATION_MIN_GROUND_UNITS } from '../operations/operationRules';
import { campaignLiftRequiredUnits } from './campaignSeaRules';

/**
 * The most ground units a home may hold and still count as lightly held.
 *
 * Purpose: Blitz fits a land-reachable enemy only while its home is this thin, since blitz assaults with half the usual mass.
 * When to use: `postureFitsFor`.
 * Expected outcome: A non-negative integer.
 * Exceptions: None.
 */
export const POSTURE_FIT_LIGHT_GARRISON_MAX = 3;

/**
 * A count of ground units with the noun in the singular or plural.
 *
 * Purpose: The Ships and Fit lines read naturally for one unit.
 * When to use: Any count these lines print with its noun.
 * Expected outcome: `1 ground unit`, otherwise `<n> ground units`.
 * Exceptions: None.
 */
function groundUnitCount(count: number): string {
  return `${count} ${count === 1 ? 'ground unit' : 'ground units'}`;
}

/**
 * The ground units a landing on an enemy home needs.
 *
 * Purpose: The fit list and the Fit line judge a landing by the same `campaignLiftRequiredUnits` figure.
 * When to use: For a sea-only home, with its garrison.
 * Expected outcome: The required force with no reinforcers and no friendly units counted, so at least `OPERATION_MIN_GROUND_UNITS`.
 * Exceptions: None.
 */
function landingRequiredUnits(garrison: number): number {
  return campaignLiftRequiredUnits({ defenders: garrison, reinforcers: 0, friendlyNearby: 0 });
}

/**
 * The land steps to the nearest force of units.
 *
 * Purpose: A lone straggler does not make a home reachable. The distance that counts is the one a whole force is within.
 * When to use: `buildPostureFitReport`, once per enemy.
 * Expected outcome: The `force`-th smallest distance, counting from one. Null when `force` is 0 or less, or when fewer than `force` distances are given. The input is not changed.
 * Exceptions: None.
 */
export function forceLandSteps(args: {
  /**
   * The land steps of each unit that was reached.
   *
   * Contract: Non-negative integers, in any order.
   * When to use: Pass the distances of the seat's ground units.
   * Expected outcome: Sorted on a copy.
   * Exceptions: None.
   */
  readonly distances: readonly number[];
  /**
   * The size of the force.
   *
   * Contract: An integer. 0 or less gives null.
   * When to use: Pass `landForce`.
   * Expected outcome: Picks the position in the sorted distances.
   * Exceptions: None.
   */
  readonly force: number;
}): number | null {
  if (args.force <= 0 || args.distances.length < args.force) return null;
  return [...args.distances].sort((a, b) => a - b)[args.force - 1] ?? null;
}

/**
 * Whether a force is within the campaign's own reach for a new target.
 *
 * Purpose: Overland fits only an enemy a campaign could march on.
 * When to use: `postureFitsFor` and the Fit line.
 * Expected outcome: True when `landSteps` is not null and at most `CAMPAIGN_MAX_LAND_STEPS`.
 * Exceptions: None.
 */
export function nearByLand(facts: Pick<PostureFitFacts, 'landSteps'>): boolean {
  return facts.landSteps !== null && facts.landSteps <= CAMPAIGN_MAX_LAND_STEPS;
}

/**
 * Names a list of fits in words.
 *
 * Purpose: The Fit line and the attention flag name the fits the same way.
 * When to use: Printing the fits of a `PostureFitRow`.
 * Expected outcome: `overland`, `overland, or blitz while its home is this lightly held`, `maritime`, `strangle, then maritime`, or `strangle`. Any other list is joined with commas.
 * Exceptions: None.
 */
export function postureFitsText(fits: readonly Posture[]): string {
  const key = fits.join(',');
  if (key === 'overland,blitz') return 'overland, or blitz while its home is this lightly held';
  if (key === 'strangle,maritime') return 'strangle, then maritime';
  return fits.join(', ');
}

/**
 * The Ships line of the Posture section.
 *
 * Purpose: The commander sees its naval units against its naval cap and what a maritime campaign lift could carry.
 * When to use: First of the lines `postureFitLinesFrom` returns.
 * Expected outcome: One bullet, with the carried count in the singular for one ground unit.
 * Exceptions: None.
 */
export function postureShipsLine(args: {
  /**
   * The seat's naval units.
   *
   * Contract: A non-negative integer.
   * When to use: Count the seat's own naval units.
   * Expected outcome: Printed as is.
   * Exceptions: None.
   */
  readonly naval: number;
  /**
   * The naval cap for this game size.
   *
   * Contract: The `naval` entry of `getMaxUnitsPerType`.
   * When to use: Pass the cap for the match's game size.
   * Expected outcome: Printed as is.
   * Exceptions: None.
   */
  readonly navalCap: number;
  /**
   * The most ground units a maritime posture could land at once.
   *
   * Contract: The same figure the Fit lines judge a landing by.
   * When to use: Pass the value given to the fit rules.
   * Expected outcome: Printed with its noun.
   * Exceptions: None.
   */
  readonly maritimeCapacity: number;
}): string {
  return `- Ships: ${args.naval} of your naval cap of ${args.navalCap}. On maritime a campaign lift could carry up to ${groundUnitCount(args.maritimeCapacity)}.`;
}

/**
 * The postures that fit one enemy, best first.
 *
 * Purpose: Overland fits an enemy a force can march on, blitz when its home is thin, maritime a sea-reachable enemy a landing can beat, overland again for a long march with no sea route, and strangle an enemy out of reach or too strong to land on.
 * When to use: For each active enemy when the Posture section is built.
 * Expected outcome: A non-empty list of postures.
 * Exceptions: None.
 */
export function postureFitsFor(facts: PostureFitFacts): readonly Posture[] {
  const { seaReachable, garrison, maritimeCapacity } = facts;
  let fits: readonly Posture[];
  if (nearByLand(facts)) {
    fits = garrison <= POSTURE_FIT_LIGHT_GARRISON_MAX ? ['overland', 'blitz'] : ['overland'];
  } else if (seaReachable) {
    fits = landingRequiredUnits(garrison) <= maritimeCapacity ? ['maritime'] : ['strangle', 'maritime'];
  } else if (facts.landSteps !== null) {
    fits = ['overland'];
  } else {
    fits = ['strangle'];
  }
  logTrace('postureFit postureFitsFor', { ...facts, fits });
  return fits;
}

/**
 * Describes how far the seat's force is from an enemy home.
 *
 * Purpose: The Fit line says how the enemy can be reached, with the step count.
 * When to use: `postureFitLine`.
 * Expected outcome: The reach clause: in its home, near by land, too far to march (with or without a sea route), only by sea, or not at all.
 * Exceptions: None.
 */
function reachText(facts: PostureFitFacts): string {
  const { landSteps, landForce, seaReachable } = facts;
  const force = landForce === 1 ? '1 of your ground units is' : `${landForce} of your ground units are`;
  if (landSteps === 0) return `${force} in its home`;
  if (landSteps !== null && nearByLand(facts)) return `${force} ${landSteps} ${landSteps === 1 ? 'land step' : 'land steps'} from its home`;
  if (landSteps !== null && seaReachable) return `${force} ${landSteps} land steps from its home, too far to march, but it can be reached by sea`;
  if (landSteps !== null) return `${force} ${landSteps} land steps from its home, too far to march, and it cannot be reached by sea`;
  if (seaReachable) return 'it can be reached only by sea';
  return 'it cannot be reached by land or sea';
}

/**
 * One Fit line of the Posture section.
 *
 * Purpose: The commander reads how an enemy can be reached, how many ground units hold its home, and which postures fit.
 * When to use: Once per active enemy, after the Ships line.
 * Expected outcome: A bullet naming the enemy, with `(active pact)` for a pact partner, then the reach with its land step count, the garrison count, and the fits. A home that needs a landing maritime cannot make says why: the landing its garrison needs, or, when that is only the minimum force, that maritime could not land even the minimum.
 * Exceptions: None.
 */
export function postureFitLine(row: PostureFitRow): string {
  const { name, pactPartner, facts, fits } = row;
  const pact = pactPartner ? ' (active pact)' : '';
  let reason = '';
  if (fits.length === 2 && fits[0] === 'strangle' && fits[1] === 'maritime') {
    const required = landingRequiredUnits(facts.garrison);
    reason =
      required === OPERATION_MIN_GROUND_UNITS
        ? `, but maritime could land only ${facts.maritimeCapacity}, fewer than the ${required} any landing needs`
        : `, so a landing needs ${required}, more than the ${facts.maritimeCapacity} maritime could land`;
  }
  logTrace('postureFit postureFitLine', { name, fits });
  return `- Fit, ${name}${pact}: ${reachText(facts)}. Its home holds ${groundUnitCount(facts.garrison)}${reason}. Fits: ${postureFitsText(fits)}.`;
}

/**
 * The Ships line and the Fit lines of a report.
 *
 * Purpose: The Posture section prints the report as bullets.
 * When to use: When the briefing builds the Posture section.
 * Expected outcome: An empty list for a null report, otherwise the Ships line then one Fit line per row.
 * Exceptions: None.
 */
export function postureFitLinesFrom(report: PostureFitReport | null): readonly string[] {
  if (report === null) return [];
  return [report.shipsLine, ...report.rows.map(postureFitLine)];
}

/**
 * Builds the posture advice for one seat.
 *
 * Purpose: The commander sees its naval cap, what a maritime lift could carry, and how each enemy can be reached, using only what its own view shows. Reach is measured from the enemy's home outward, so each own ground unit gets its steps from one search. A unit on a hex at or above the water cap is not counted, though a march could cross one, so a home can only look farther than it is.
 * When to use: When the briefing builds the Posture section. Pass the seat's own snapshot.
 * Expected outcome: A report with the Ships line and one row per active enemy in seat order. Null when the scenario is not region versus region, the land mass is missing, or a thrown error was logged.
 * Exceptions: None. A thrown error is logged and gives null.
 */
export function buildPostureFitReport(state: GameStateSnapshot): PostureFitReport | null {
  logDebug('postureFit buildPostureFitReport', { turnNumber: state.turnNumber, scenarioId: state.scenarioId ?? null });
  if (state.scenarioId !== 'region_vs_region') return null;
  const seatId = briefingOwnSeatId(state);
  try {
    const landMass = loadCampaignLandMass(seatId);
    if (landMass === null) return null;
    const enemies = (state.seats ?? []).filter((seat) => seat.seatId !== seatId && seat.outTurn == null);
    const own = state.units.filter((unit) => unit.player === seatId);
    const ground = own.filter((unit) => isLandUnitType(unit.unitType));
    const marching = ground.filter((unit) => !unit.embarkedOnCarrierUnitId);
    const landForce = Math.min(CAMPAIGN_ASSAULT_MIN_UNITS, marching.length);
    const navalCap = getMaxUnitsPerType(parseGameSize(state.gameSize)).naval;
    const maritimeCapacity = Math.min(2 * navalCap, Math.floor(ground.length * POSTURE_SETTINGS.maritime.liftGroundShare));
    const naval = own.filter((unit) => unit.unitType === 'naval').length;
    const terrain = buildLiftTerrain({ state, seatId, landMass });
    const hexSet = new Set(state.hexes.map((hex) => hex.h3Index));
    const seaportByHex = new Map((state.strategicInfrastructure ?? []).map((row) => [row.h3Index, row]));
    const hasPort = (state.strategicControl ?? []).some(
      (row) =>
        row.controllerPlayerId === seatId &&
        (seaportByHex.get(row.h3Index)?.seaportCount ?? 0) > 0 &&
        terrain.embarkLegal(row.h3Index),
    );
    const partners = readActivePactPartnerSeatIds({
      seatId,
      turnNumber: state.turnNumber,
      activeSeatIds: new Set(enemies.map((seat) => seat.seatId)),
    });
    const rows = enemies.map((seat): PostureFitRow => {
      const home = state.homeRegionHexesBySeat?.[seat.seatId] ?? [];
      const homeSet = new Set(home);
      const fromHome = getLandStepDistances({
        originH3s: home.filter((h3) => landUnitCanOccupyHex(h3, landMass) && (landMass.get(h3)?.waterPct ?? 100) < STRATEGIC_LAND_MAX_WATER_PCT),
        hexSet,
        data: landMass,
        maxDepth: CAMPAIGN_REACH_LIMIT_STEPS,
      });
      const distances = marching.flatMap((unit) => {
        const steps = fromHome.get(unit.h3Index);
        return steps === undefined ? [] : [steps];
      });
      const facts: PostureFitFacts = {
        landSteps: forceLandSteps({ distances, force: landForce }),
        landForce,
        seaReachable:
          hasPort &&
          home.some((h3Index) => (seaportByHex.get(h3Index)?.urbanHexCount ?? 0) > 0 && terrain.landingHexes(h3Index).length > 0),
        garrison: state.units.filter(
          (unit) => unit.player === seat.seatId && isLandUnitType(unit.unitType) && homeSet.has(unit.h3Index),
        ).length,
        maritimeCapacity,
      };
      return {
        seatId: seat.seatId,
        name: seat.homeRegion ?? seat.seatId,
        pactPartner: partners.has(seat.seatId),
        facts,
        fits: postureFitsFor(facts),
      };
    });
    return { shipsLine: postureShipsLine({ naval, navalCap, maritimeCapacity }), rows };
  } catch (err) {
    logError('postureFit buildPostureFitReport failed', { seatId }, err);
    return null;
  }
}

/**
 * The Attention Flags bullet for a posture that does not fit the campaign target's holder.
 *
 * Purpose: The commander is told when the side holding its campaign target is one its current posture does not fit.
 * When to use: Each strategic consult that has a campaign plan.
 * Expected outcome: Null when there is no report or holder, when the holder has no row, or when the row's fits include the current posture. Otherwise one bullet naming the holder and the fits. It says how to change the posture when none is stored, and until which turn the hold lasts when one is.
 * Exceptions: None.
 */
export function postureAttentionBullet(args: {
  /**
   * The seat's posture advice.
   *
   * Contract: Null when no advice was built.
   * When to use: Pass the report the Fit lines came from.
   * Expected outcome: A null report gives no bullet.
   * Exceptions: None.
   */
  readonly report: PostureFitReport | null;
  /**
   * The seat that holds the campaign target.
   *
   * Contract: From `campaignTargetHolderSeatId`, or null.
   * When to use: Pass null when there is no campaign plan.
   * Expected outcome: Matched against the rows.
   * Exceptions: None.
   */
  readonly targetHolderSeatId: string | null;
  /**
   * The posture in force.
   *
   * Contract: The stored posture, or the default.
   * When to use: Compared with the row's fits.
   * Expected outcome: Printed as is.
   * Exceptions: None.
   */
  readonly current: Posture;
  /**
   * Whether the seat has declared a posture.
   *
   * Contract: True when a row is stored.
   * When to use: Chooses the ` by default` wording.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  readonly declared: boolean;
  /**
   * The turn the hold ends.
   *
   * Contract: The stored turn plus the hold, when later than the current turn. Otherwise null.
   * When to use: Chooses between the two wordings.
   * Expected outcome: A turn number or null.
   * Exceptions: None.
   */
  readonly holdUntilTurn: number | null;
}): string | null {
  const row = args.report?.rows.find((candidate) => candidate.seatId === args.targetHolderSeatId);
  if (row === undefined || row.fits.includes(args.current)) return null;
  logTrace('postureFit postureAttentionBullet', { holder: row.seatId, current: args.current, fits: row.fits });
  const lead = `Posture: your campaign target is held by ${row.name}, and ${postureFitsText(row.fits)} fits it.`;
  return args.holdUntilTurn === null
    ? `${lead} You are on ${args.current}${args.declared ? '' : ' by default'}. Set "posture" in your reply to change it.`
    : `${lead} You are on ${args.current} until turn ${args.holdUntilTurn}.`;
}
