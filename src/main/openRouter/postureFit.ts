/**
 * Which postures fit each enemy, as advice for the Posture section.
 *
 * Purpose: The commander picks the posture, so the briefing says how each active enemy can be reached and which postures fit it. The engine never changes a posture.
 * When to use: When the strategic briefing builds the Posture section for a region versus region match.
 * Expected outcome: Pure fit rules plus one flow that reads the seat's own view and returns the briefing lines.
 * Exceptions: None. The flow logs a thrown error and returns no lines.
 */

import type { GameStateSnapshot } from '../gameDb';
import { briefingOwnSeatId } from '../briefing/briefingPerspective';
import { getMaxUnitsPerType, parseGameSize } from '../../shared/gameSize';
import { getLandStepDistances } from '../../shared/landTraversalStrategic';
import { isLandUnitType } from '../../shared/landUnitType';
import { POSTURE_SETTINGS, type Posture } from '../../shared/postureTypes';
import { logDebug, logError, logTrace } from '../logger';
import { buildLiftTerrain } from '../operations/liftTerrain';
import { readActivePactPartnerSeatIds } from './campaignPactPartners';
import { loadCampaignLandMass } from './campaignObjectiveFlow';
import { CAMPAIGN_REACH_LIMIT_STEPS } from './campaignRules';
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
 * What the fit rules need to know about one enemy.
 *
 * Purpose: One shape serves the fit list and the fit line.
 * When to use: As the argument of `postureFitsFor`, and as part of the argument of `postureFitLine`.
 * Expected outcome: Plain values.
 * Exceptions: None.
 */
export interface PostureFitFacts {
  /**
   * Whether the seat's ground units can march to the enemy's home.
   *
   * Contract: True when some home hex is within `CAMPAIGN_REACH_LIMIT_STEPS` land steps of an own ground unit that is not embarked.
   * When to use: Choosing between overland and the sea postures.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  readonly landReachable: boolean;
  /**
   * Whether the seat could sail a force to the enemy's home.
   *
   * Contract: True when the seat holds an embark-legal port and the home has a city hex with a landing. No route is measured.
   * When to use: Choosing between maritime and strangle.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  readonly seaReachable: boolean;
  /**
   * The enemy's infantry and armor standing on its home hexes, from what the seat sees.
   *
   * Contract: A non-negative integer.
   * When to use: The blitz limit and the required force for a landing.
   * Expected outcome: A count.
   * Exceptions: None.
   */
  readonly garrison: number;
  /**
   * The most ground units a maritime posture could land at once.
   *
   * Contract: The smaller of twice the naval cap and the maritime lift share of the seat's ground units.
   * When to use: Judging whether a landing can beat the garrison.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly maritimeCapacity: number;
}

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
 * The Ships line of the Posture section.
 *
 * Purpose: The commander sees its naval units against its naval cap and what a maritime campaign lift could carry.
 * When to use: First of the lines `buildPostureFitLines` returns.
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
   * When to use: Pass the value given to `postureFitLine`.
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
 * Purpose: Overland fits a land-reachable enemy, blitz when its home is thin, maritime a sea-only enemy a landing can beat, and strangle an enemy out of reach or too strong to land on.
 * When to use: For each active enemy when the Posture section is built.
 * Expected outcome: A non-empty list of postures.
 * Exceptions: None.
 */
export function postureFitsFor(facts: PostureFitFacts): readonly Posture[] {
  const { landReachable, seaReachable, garrison, maritimeCapacity } = facts;
  let fits: readonly Posture[];
  if (landReachable) {
    fits = garrison <= POSTURE_FIT_LIGHT_GARRISON_MAX ? ['overland', 'blitz'] : ['overland'];
  } else if (seaReachable) {
    fits = landingRequiredUnits(garrison) <= maritimeCapacity ? ['maritime'] : ['strangle', 'maritime'];
  } else {
    fits = ['strangle'];
  }
  logTrace('postureFit postureFitsFor', { ...facts, fits });
  return fits;
}

/**
 * One Fit line of the Posture section.
 *
 * Purpose: The commander reads how an enemy can be reached, how many ground units hold its home, and which postures fit.
 * When to use: Once per active enemy, after the Ships line.
 * Expected outcome: A bullet naming the enemy, with `(active pact)` for a pact partner, then the reach, the garrison count when the home is reachable, and the fits. A sea-only home maritime cannot take says why: the landing its garrison needs, or, when that is only the minimum force, that maritime could not land even the minimum.
 * Exceptions: None.
 */
export function postureFitLine(args: PostureFitFacts & { readonly name: string; readonly pactPartner: boolean }): string {
  const fits = postureFitsFor(args);
  const pact = args.pactPartner ? ' (active pact)' : '';
  const count = groundUnitCount(args.garrison);
  const prefix = `- Fit, ${args.name}${pact}:`;
  let line: string;
  if (fits.includes('blitz')) {
    line = `${prefix} home reachable by land, ${count} at home. Fits: overland, or blitz while its home is this lightly held.`;
  } else if (args.landReachable) {
    line = `${prefix} home reachable by land, ${count} at home. Fits: overland.`;
  } else if (fits.includes('maritime') && fits.includes('strangle')) {
    const required = landingRequiredUnits(args.garrison);
    const reason =
      required === OPERATION_MIN_GROUND_UNITS
        ? `but maritime could land only ${args.maritimeCapacity}, fewer than the ${required} any landing needs`
        : `so a landing needs ${required}, more than the ${args.maritimeCapacity} maritime could land`;
    line = `${prefix} home reachable only by sea, ${count} at home, ${reason}. Fits: strangle, then maritime.`;
  } else if (fits.includes('maritime')) {
    line = `${prefix} home reachable only by sea, ${count} at home. Fits: maritime.`;
  } else {
    line = `${prefix} home not reachable by land or sea. Fits: strangle.`;
  }
  logTrace('postureFit postureFitLine', { name: args.name, fits });
  return line;
}

/**
 * Builds the Ships line and one Fit line per active enemy for the Posture section.
 *
 * Purpose: The commander sees its naval cap, what a maritime lift could carry, and how each enemy can be reached, using only what its own view shows.
 * When to use: When the briefing builds the Posture section. Pass the seat's own snapshot.
 * Expected outcome: The Ships line, then one Fit line per active enemy in seat order. An empty list when the scenario is not region versus region, the land mass is missing, or a thrown error was logged.
 * Exceptions: None. A thrown error is logged and gives an empty list.
 */
export function buildPostureFitLines(state: GameStateSnapshot): readonly string[] {
  logDebug('postureFit buildPostureFitLines', { turnNumber: state.turnNumber, scenarioId: state.scenarioId ?? null });
  if (state.scenarioId !== 'region_vs_region') return [];
  const seatId = briefingOwnSeatId(state);
  try {
    const landMass = loadCampaignLandMass(seatId);
    if (landMass === null) return [];
    const enemies = (state.seats ?? []).filter((seat) => seat.seatId !== seatId && seat.outTurn == null);
    const own = state.units.filter((unit) => unit.player === seatId);
    const ground = own.filter((unit) => isLandUnitType(unit.unitType));
    const navalCap = getMaxUnitsPerType(parseGameSize(state.gameSize)).naval;
    const maritimeCapacity = Math.min(2 * navalCap, Math.floor(ground.length * POSTURE_SETTINGS.maritime.liftGroundShare));
    const naval = own.filter((unit) => unit.unitType === 'naval').length;
    const terrain = buildLiftTerrain({ state, seatId, landMass });
    const hexSet = new Set(state.hexes.map((hex) => hex.h3Index));
    const marchable = getLandStepDistances({
      originH3s: ground.filter((unit) => !unit.embarkedOnCarrierUnitId).map((unit) => unit.h3Index),
      hexSet,
      data: landMass,
      maxDepth: CAMPAIGN_REACH_LIMIT_STEPS,
    });
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
    const lines = enemies.map((seat) => {
      const home = state.homeRegionHexesBySeat?.[seat.seatId] ?? [];
      const homeSet = new Set(home);
      return postureFitLine({
        name: seat.homeRegion ?? seat.seatId,
        pactPartner: partners.has(seat.seatId),
        landReachable: home.some((h3Index) => marchable.has(h3Index)),
        seaReachable:
          hasPort &&
          home.some((h3Index) => (seaportByHex.get(h3Index)?.urbanHexCount ?? 0) > 0 && terrain.landingHexes(h3Index).length > 0),
        garrison: state.units.filter(
          (unit) => unit.player === seat.seatId && isLandUnitType(unit.unitType) && homeSet.has(unit.h3Index),
        ).length,
        maritimeCapacity,
      });
    });
    return [postureShipsLine({ naval, navalCap, maritimeCapacity }), ...lines];
  } catch (err) {
    logError('postureFit buildPostureFitLines failed', { seatId }, err);
    return [];
  }
}
