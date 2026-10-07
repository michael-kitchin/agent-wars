/**
 * Naval Transport Status briefing block for both consultation modes.
 *
 * Purpose: Moved out of `briefingSections.ts` so production, air, and naval each have one home.
 * When to use: `buildSystemPromptForTools` after the Commander's Briefing.
 * Expected outcome: Empty string when the opponent has no naval units. Otherwise a heading, rules, and table.
 * Exceptions: None.
 */

import type { GameStateSnapshot } from '../gameDb';
import { logDebug } from '../logger';
import { buildPromptTableLines } from '../promptTableHelpers';
import { canEmbarkAtHex } from '../../shared/sealiftEmbarkEligibility';
import { gridHopDistancesFrom } from '../tools/assessUnitProximity';
import { SECTION_TITLE_NAVAL_TRANSPORT_STATUS, topLevelHeading } from './promptSpec/sectionHeadings';

/**
 * Returns the closest hex where this player may embark, using the same rule as stack sealift.
 *
 * Purpose: Naval Transport Status "Nearest Embark Hex" must match `canEmbarkAtHex` (coastal and land seaports without control; water seaports only when controlled).
 * When to use: Strategic `buildSealiftBriefingBlock` for each opponent naval unit.
 * Expected outcome: Formatted hex plus hop count, or `—` when no eligible hex is in the snapshot. Hops use neighbor BFS so pentagon-crossing pairs still score.
 * Exceptions: Unreachable or invalid cells are omitted.
 */
function findNearestOpponentEmbarkHex(
  navalH3: string,
  state: GameStateSnapshot,
  format: (h3: string) => string
): string {
  const infraByHex = new Map((state.strategicInfrastructure ?? []).map((row) => [row.h3Index, row]));
  const controlByHex = new Map((state.strategicControl ?? []).map((row) => [row.h3Index, row.controllerPlayerId]));
  const legalH3: string[] = [];
  for (const hex of state.hexes) {
    const seaport = Number(infraByHex.get(hex.h3Index)?.seaportCount ?? 0);
    if (
      canEmbarkAtHex({
        nativeTerrain: hex.terrain,
        terrainKind: hex.terrainKind,
        hasSeaport: seaport > 0,
        hexControlledByPlayer: controlByHex.get(hex.h3Index) === 'opponent',
      })
    ) {
      legalH3.push(hex.h3Index);
    }
  }
  if (legalH3.length === 0) return '—';
  const hops = gridHopDistancesFrom(navalH3, legalH3);
  let best: { h3: string; d: number } | null = null;
  for (const h3 of legalH3) {
    const d = hops.get(h3);
    if (d === undefined) continue;
    if (best === null || d < best.d) best = { h3, d };
  }
  if (!best) return '—';
  return `${format(best.h3)} at hex distance ${best.d}`;
}

/**
 * Builds the Naval Transport Status briefing block (strategic embark table, or tactical embark links).
 *
 * Purpose: Shared shell sealift section; tactical uses `embarkedOnSubUnitId` and omits empty battles.
 * When to use: `buildSystemPromptForTools` for both modes.
 * Expected outcome: Empty string when the opponent has no naval units. Otherwise a heading, rules, and table.
 * Exceptions: None.
 */
export function buildSealiftBriefingBlock(
  state: GameStateSnapshot,
  format: (h3: string) => string,
  mode: 'strategic' | 'tactical' = 'strategic'
): string {
  const lines: string[] = [];
  const opponentNaval = state.units.filter((unit) => unit.player === 'opponent' && unit.unitType === 'naval');
  const opponentLand = state.units.filter(
    (unit) => unit.player === 'opponent' && (unit.unitType === 'infantry' || unit.unitType === 'armor')
  );
  logDebug('briefingSections buildSealiftBriefingBlock', {
    turnNumber: state.turnNumber,
    mode,
    opponentNavalCount: opponentNaval.length,
  });

  if (opponentNaval.length === 0) return '';

  if (mode === 'tactical') {
    lines.push(topLevelHeading(SECTION_TITLE_NAVAL_TRANSPORT_STATUS));
    lines.push('');
    lines.push('Tactical sealift: capacity 1 armor or 2 infantry per naval sub-unit. Debark before independent land marches.');
    lines.push('');
    const navalRows: Array<Array<unknown>> = [];
    for (const naval of opponentNaval) {
      const embarked = opponentLand.filter(
        (land) => (land as { embarkedOnSubUnitId?: string }).embarkedOnSubUnitId === naval.id
      );
      const armor = embarked.filter((u) => u.unitType === 'armor').length;
      const infantry = embarked.filter((u) => u.unitType === 'infantry').length;
      const capacityUsed = armor >= 1 ? 2 : Math.min(infantry, 2);
      const aboardIds = embarked.map((u) => u.id).join(', ') || '—';
      navalRows.push([naval.id, format(naval.h3Index), aboardIds, `${capacityUsed}/2`]);
    }
    lines.push(...buildPromptTableLines(['Unit ID', 'Hex', 'Aboard', 'Capacity Used'], navalRows));
    return lines.join('\n');
  }

  const infraByHex = new Map((state.strategicInfrastructure ?? []).map((row) => [row.h3Index, row]));
  const controlByHex = new Map((state.strategicControl ?? []).map((row) => [row.h3Index, row.controllerPlayerId]));

  lines.push(topLevelHeading(SECTION_TITLE_NAVAL_TRANSPORT_STATUS));
  lines.push('');
  lines.push(
    'Embark: coastal or land seaport (control not required), or a water seaport you control. Capacity: 1 armor or 2 infantry per naval unit.'
  );
  lines.push('');
  const navalRows: Array<Array<unknown>> = [];
  for (const naval of opponentNaval) {
    const infra = infraByHex.get(naval.h3Index);
    const hasPort = (infra?.seaportCount ?? 0) > 0;
    const controlled = controlByHex.get(naval.h3Index) === 'opponent';
    const embarked = opponentLand.filter((land) => land.embarkedOnNavalUnitId === naval.id);
    const armor = embarked.filter((unit) => unit.unitType === 'armor').length;
    const infantry = embarked.filter((unit) => unit.unitType === 'infantry').length;
    const nearestEmbark = findNearestOpponentEmbarkHex(naval.h3Index, state, format);
    const capacityUsed = armor >= 1 ? 2 : Math.min(infantry, 2);
    const aboard = `infantry ${infantry}, armor ${armor}`;
    navalRows.push([
      naval.id,
      format(naval.h3Index),
      controlled ? 'yes' : 'no',
      hasPort ? 'yes' : 'no',
      aboard,
      `${capacityUsed}/2`,
      nearestEmbark,
    ]);
  }
  lines.push(
    ...buildPromptTableLines(
      ['Unit ID', 'Hex', 'Your control', 'Seaport Here', 'Aboard', 'Capacity Used', 'Nearest Embark Hex'],
      navalRows
    )
  );
  return lines.join('\n');
}
