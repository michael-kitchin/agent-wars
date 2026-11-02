/**
 * Assembles the tactical Commander's Briefing override (strategic section parity, no production/memory).
 */

import type { GameStateSnapshot } from '../gameDb';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { briefingOwnSeatId } from '../briefing/briefingPerspective';
import { buildRecentTurnNotesSection } from '../briefing/recentTurnNotesSection';
import { buildTacticalOperationalMapSectionMarkdown } from '../briefing/map/briefingMapSection';
import type { CoordinateContext } from '../briefing/map/coordinateContext';
import { getSubscriptions } from '../callbackSubscriptions';
import { buildActiveCallbacksSection } from '../briefing/activeCallbacksSection';
import {
  buildAttentionFlags,
  buildUnitStatusTable,
  markdownHeading1,
  markdownHeading2,
} from '../briefingFormatter';
import { logDebug } from '../logger';
import {
  SECTION_TITLE_ACTIVE_CALLBACKS,
  SECTION_TITLE_ATTENTION_FLAGS,
  SECTION_TITLE_COMMANDERS_BRIEFING,
  SECTION_TITLE_OPERATIONAL_MAP,
  SECTION_TITLE_RECENT_TURN_NOTES,
  SECTION_TITLE_UNIT_STATUS_AND_THREATS,
} from './promptSpec/sectionHeadings';
import {
  buildLightweightTacticalUnitAssessments,
  buildTacticalBriefingNarrative,
} from './tacticalBriefingAssessments';
import { originBonusSettingsFromSnapshot } from '../../shared/originBonusRules';
import { tacticalWeatherApplies } from './promptSpec/gameRuleSituationGates';

/**
 * Builds the full tactical briefing override for `buildSystemPromptForTools`.
 *
 * Purpose: Parity with strategic `formatBriefing` sections that apply in-battle (map, status, callbacks), omitting Standing Order Status while assign_order/cancel_order stay blocked for sub-unit ids.
 * When to use: `requestOrdersFlow` when `tacticalAiBattle` is set.
 * Expected outcome: Markdown containing Commander's Briefing through Active Callbacks. Operational Map is an H2. Standing Order Status is omitted.
 * Exceptions: Returns empty string only if map generation yields empty content (caller treats as failure).
 */
export function formatTacticalBriefing(args: {
  planState: GameStateSnapshot;
  latLngByH3: Map<string, [number, number]>;
  tacticalBattle: TacticalBattleSnapshot;
  /**
   * Whether the cropped map may name `get_map`.
   *
   * Contract: True only when that tool is on the consult's enabled list.
   * When to use: `requestOrdersFlow` after the tool list is filtered.
   * Expected outcome: The Shown line gains the lookup sentence when the window is smaller than the footprint.
   * Exceptions: None.
   */
  mentionGetMap?: boolean;
}): string {
  const { planState, latLngByH3, tacticalBattle } = args;
  logDebug('formatTacticalBriefing', {
    battleId: tacticalBattle.battleId,
    beat: tacticalBattle.tacticalTurnNumber,
    subUnitCount: tacticalBattle.subUnits.length,
  });
  const coordCtx: CoordinateContext = {
    mode: 'tactical',
    battleId: tacticalBattle.battleId,
    tacticalTurnNumber: tacticalBattle.tacticalTurnNumber,
    battleWeather: tacticalBattle.weather,
    omitWeatherColumn:
      tacticalBattle.weatherBonusEnabled === true && !tacticalWeatherApplies(tacticalBattle.weather),
  };
  const ownSeat = briefingOwnSeatId(planState);
  const assessments = buildLightweightTacticalUnitAssessments(
    tacticalBattle,
    originBonusSettingsFromSnapshot(planState),
    ownSeat
  );
  const sections: string[] = [];

  sections.push(markdownHeading1(SECTION_TITLE_COMMANDERS_BRIEFING));
  sections.push(buildTacticalBriefingNarrative(tacticalBattle, assessments, ownSeat));
  sections.push(markdownHeading2(SECTION_TITLE_UNIT_STATUS_AND_THREATS));
  sections.push(
    buildUnitStatusTable(assessments, coordCtx, false, originBonusSettingsFromSnapshot(planState))
  );
  sections.push(markdownHeading2(SECTION_TITLE_ATTENTION_FLAGS));
  sections.push(buildAttentionFlags(assessments, 'tactical', false));

  const operational = buildTacticalOperationalMapSectionMarkdown({
    state: planState,
    latLngByH3,
    tacticalBattle,
    mentionGetMap: args.mentionGetMap === true,
  });
  if (operational.trim().length === 0) {
    logDebug('formatTacticalBriefing: empty operational map', { battleId: tacticalBattle.battleId });
    return '';
  }
  sections.push(markdownHeading2(SECTION_TITLE_OPERATIONAL_MAP));
  sections.push(operational.trim());

  const recentTurnNotes = buildRecentTurnNotesSection({
    scope: 'tactical',
    battleId: tacticalBattle.battleId,
    currentTurnNumber: tacticalBattle.tacticalTurnNumber,
    heading: SECTION_TITLE_RECENT_TURN_NOTES,
    seatId: ownSeat,
  });
  if (recentTurnNotes.trim().length > 0) {
    sections.push('\n\n' + recentTurnNotes.trim());
  }

  sections.push(markdownHeading2(SECTION_TITLE_ACTIVE_CALLBACKS));
  sections.push(buildActiveCallbacksSection(getSubscriptions(ownSeat), coordCtx));

  return sections.join('');
}
