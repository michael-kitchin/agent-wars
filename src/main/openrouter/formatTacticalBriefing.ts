/**
 * Assembles the tactical Commander's Briefing override (strategic section parity, no production/memory).
 */

import type { GameStateSnapshot } from '../gameDb';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { buildRecentTurnNotesSection } from '../briefing/recentTurnNotesSection';
import { buildTacticalOperationalMapSectionMarkdown } from '../briefing/map/briefing-map-section';
import type { CoordinateContext } from '../briefing/map/coordinateContext';
import { getSubscriptions } from '../callbackSubscriptions';
import {
  buildActiveCallbacksSection,
  buildAttentionFlags,
  buildUnitStatusTable,
} from '../briefingFormatter';
import { logDebug } from '../logger';
import {
  buildLightweightTacticalUnitAssessments,
  buildTacticalBriefingNarrative,
} from './tacticalBriefingAssessments';

/**
 * Builds the full tactical briefing override for `buildSystemPromptForTools`.
 *
 * Purpose: Parity with strategic `formatBriefing` sections that apply in-battle (map, status, callbacks), omitting Standing Order Status while assign_order/cancel_order stay blocked for sub-unit ids.
 * When to use: `requestOrdersFlow` when `tacticalAiBattle` is set.
 * Expected outcome: Markdown containing Commander's Briefing through Active Callbacks; Operational Map uses `#` heading; no `# Standing Order Status`.
 * Exceptions: Returns empty string only if map generation yields empty content (caller treats as failure).
 */
export function formatTacticalBriefing(args: {
  planState: GameStateSnapshot;
  latLngByH3: Map<string, [number, number]>;
  tacticalBattle: TacticalBattleSnapshot;
}): string {
  const { planState, latLngByH3, tacticalBattle } = args;
  logDebug('formatTacticalBriefing', {
    battleId: tacticalBattle.battleId,
    beat: tacticalBattle.tacticalTurnNumber,
    subUnitCount: tacticalBattle.subUnits.length,
  });
  const coordCtx: CoordinateContext = { mode: 'tactical', battleId: tacticalBattle.battleId };
  const assessments = buildLightweightTacticalUnitAssessments(tacticalBattle);
  const sections: string[] = [];

  sections.push(`# Commander's Briefing\n\n`);
  sections.push(buildTacticalBriefingNarrative(tacticalBattle, assessments));
  sections.push(`\n\n## Unit Status and Threats\n\n`);
  sections.push(buildUnitStatusTable(assessments, coordCtx, false));
  sections.push(`\n\n## Attention Flags\n\n`);
  sections.push(buildAttentionFlags(assessments, 'tactical', false));

  const operational = buildTacticalOperationalMapSectionMarkdown({
    state: planState,
    latLngByH3,
    tacticalBattle,
  });
  if (operational.trim().length === 0) {
    logDebug('formatTacticalBriefing: empty operational map', { battleId: tacticalBattle.battleId });
    return '';
  }
  sections.push(`\n\n# Operational Map\n\n`);
  sections.push(operational.trim());

  const recentTurnNotes = buildRecentTurnNotesSection({
    scope: 'tactical',
    battleId: tacticalBattle.battleId,
    currentTurnNumber: tacticalBattle.tacticalTurnNumber,
    heading: 'Recent Turn Notes',
  });
  if (recentTurnNotes.trim().length > 0) {
    sections.push('\n\n' + recentTurnNotes.trim());
  }

  sections.push(`\n\n## Active Callbacks\n\n`);
  sections.push(buildActiveCallbacksSection(getSubscriptions('opponent'), coordCtx));

  return sections.join('');
}
