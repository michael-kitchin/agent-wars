/**
 * Campaign Objective section for the situation message.
 *
 * Purpose: Names the campaign target, staging hex, phase, and home defenders in the situation message.
 * When to use: Strategic consults that resolved a campaign plan.
 * Expected outcome: An H1 section. `formatBriefing` shifts it to H2 under the briefing.
 * Exceptions: None.
 */

import type { GameStateSnapshot } from '../gameDb';
import { briefingOwnSeatId } from '../briefing/briefingPerspective';
import { CAMPAIGN_HOME_DEFENSE_RADIUS, CAMPAIGN_MASS_RADIUS, type CampaignPlan } from './campaignRules';
import { SECTION_TITLE_CAMPAIGN_OBJECTIVE, topLevelHeading } from './promptSpec/sectionHeadings';
import { logTrace } from '../logger';

/**
 * Home name of the side that holds the target, when that side is known.
 *
 * Purpose: The target line must match the fog rule used to pick the city.
 * When to use: `buildCampaignObjectiveSection`.
 * Expected outcome: The controller's home when the hex is explored. The single enemy home that contains an unexplored hex. Null when the owner is not known.
 * Exceptions: None.
 */
function targetOwnerName(state: GameStateSnapshot, targetH3: string): string | null {
  const explored = new Set(state.exploredHexes ?? []);
  const activeEnemySeatIds = new Set<string>(
    (state.seats ?? [])
      .filter((seat) => seat.seatId !== briefingOwnSeatId(state) && seat.outTurn == null)
      .map((seat) => seat.seatId)
  );
  let ownerSeatId: string | null = null;
  if (explored.has(targetH3)) {
    ownerSeatId = (state.strategicControl ?? []).find((row) => row.h3Index === targetH3)?.controllerPlayerId ?? null;
  } else {
    const homes = [...activeEnemySeatIds].filter((seatId) =>
      (state.homeRegionHexesBySeat?.[seatId] ?? []).includes(targetH3)
    );
    ownerSeatId = homes.length === 1 ? homes[0]! : null;
  }
  const seat = (state.seats ?? []).find((row) => row.seatId === ownerSeatId);
  logTrace('briefingSectionsCampaign targetOwnerName', { targetH3, ownerSeatId, homeRegion: seat?.homeRegion ?? null });
  return seat?.homeRegion ?? null;
}

/**
 * Known fortification count for the target line.
 *
 * Purpose: An unexplored city must not be described with fortifications the commander has not seen.
 * When to use: `buildCampaignObjectiveSection`.
 * Expected outcome: `no known fortifications`, or a count of fortified cells, and 0 when the hex is unexplored.
 * Exceptions: None.
 */
function fortificationPhrase(state: GameStateSnapshot, targetH3: string): string {
  const explored = new Set(state.exploredHexes ?? state.hexes.map((hex) => hex.h3Index));
  const fortified = explored.has(targetH3)
    ? Math.max(0, Math.trunc((state.strategicInfrastructure ?? []).find((row) => row.h3Index === targetH3)?.fortifiedCount ?? 0))
    : 0;
  const phrase = fortified === 0 ? 'no known fortifications' : fortified === 1 ? '1 known fortified cell' : `${fortified} known fortified cells`;
  logTrace('briefingSectionsCampaign fortificationPhrase', { targetH3, fortified });
  return phrase;
}

/**
 * Writes the Campaign Objective section.
 *
 * Purpose: The situation message names the city, the staging hex, and why the phase is what it is.
 * When to use: When a campaign plan exists. Omit the section when it does not.
 * Expected outcome: An H1 heading and one bullet per fact. A null staging hex says the assault has already started.
 * Exceptions: None.
 */
export function buildCampaignObjectiveSection(args: {
  readonly state: GameStateSnapshot;
  readonly plan: CampaignPlan;
  readonly format: (h3Index: string) => string;
}): string {
  const { state, plan, format } = args;
  const objective = plan.objective;
  const target = format(objective.targetH3);
  const urban = (state.strategicInfrastructure ?? []).find((row) => row.h3Index === objective.targetH3)?.urbanHexCount ?? 0;
  const owner = targetOwnerName(state, objective.targetH3);
  const cityNoun = owner ? `a ${owner} city` : 'an enemy city';
  const cellNoun = urban === 1 ? 'city cell' : 'city cells';
  const chooser = objective.source === 'commander' ? 'You chose' : 'The engine chose';
  const lines: string[] = [
    topLevelHeading(SECTION_TITLE_CAMPAIGN_OBJECTIVE),
    '',
    `- Target: ${target}, ${cityNoun} with ${urban} ${cellNoun} and ${fortificationPhrase(state, objective.targetH3)}. ${chooser} it on turn ${objective.chosenTurn}.`,
  ];
  if (objective.stagingH3 === null) {
    lines.push(`- Staging hex: none. No hex you control is far enough from ${target}, so campaign units march on it directly.`);
    lines.push(`- Phase: assault. There is no staging hex, so the assault continues until ${target} is taken.`);
  } else {
    const staging = format(objective.stagingH3);
    lines.push(`- Staging hex: ${staging}.`);
    if (objective.phase === 'assemble') {
      const verb = plan.massedCount === 1 ? 'is' : 'are';
      lines.push(
        `- Phase: assemble. ${plan.massedCount} of ${plan.threshold} ground units ${verb} within ${CAMPAIGN_MASS_RADIUS} hexes of ${staging}. The assault starts when ${plan.threshold} are.`
      );
    } else {
      const noun = plan.massedCount === 1 ? 'ground unit is' : 'ground units are';
      lines.push(
        `- Phase: assault. ${plan.massedCount} ${noun} within ${CAMPAIGN_MASS_RADIUS} hexes of ${staging} or ${target}. The campaign falls back to assemble below ${Math.ceil(plan.threshold / 2)}.`
      );
    }
  }
  if (plan.defenderUnitIds.length > 0) {
    lines.push(
      `- Home defenders: ${plan.defenderUnitIds.join(', ')}. Each has an enemy unit within ${CAMPAIGN_HOME_DEFENSE_RADIUS} hexes, so it stays home.`
    );
  }
  logTrace('briefingSectionsCampaign buildCampaignObjectiveSection', { target, phase: objective.phase });
  return lines.join('\n');
}
