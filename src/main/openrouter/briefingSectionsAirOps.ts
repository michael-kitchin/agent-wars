/**
 * Air Operations Status briefing block for both consultation modes.
 *
 * Purpose: Moved out of `briefingSections.ts` so production, air, and naval each have one home.
 * When to use: `buildSystemPromptForTools` after the Commander's Briefing.
 * Expected outcome: Empty string when the opponent has no air units. Otherwise a heading, rules, and table.
 * Exceptions: None.
 */

import type { GameStateSnapshot } from '../gameDb';
import { logDebug } from '../logger';
import { AIR_FERRY_RANGE_HEXES, AIR_STRIKE_RANGE_HEXES } from '../../shared/tacticalRanges';
import { buildPromptTableLines } from '../promptTableUtils';
import { getRangeEnvelopeByBase, type RangeEnvelopeCache } from './rangeSupport';
import { SECTION_TITLE_AIR_OPERATIONS_STATUS, topLevelHeading } from './promptSpec/sectionHeadings';

/**
 * Counts human-controlled urban/airport/seaport hexes inside an air unit's strike envelope.
 *
 * Purpose: The strikeable-infra columns must not count uncontrolled cities the AI should capture instead of bombing.
 * When to use: Strategic air-operations briefing rows and the enemy-infra summary line.
 * Expected outcome: Uncontrolled and friendly-controlled hexes are omitted.
 * Exceptions: None.
 */
function countStrikeableEnemyInfrastructure(args: {
  strikeEnvelope: Set<string>;
  infraRows: NonNullable<GameStateSnapshot['res1Infrastructure']>;
  controllerByHex: Map<string, string | null | undefined>;
}): { urban: number; airports: number; seaports: number } {
  let urban = 0;
  let airports = 0;
  let seaports = 0;
  for (const row of args.infraRows) {
    if (!args.strikeEnvelope.has(row.h3Index)) continue;
    if (args.controllerByHex.get(row.h3Index) !== 'human') continue;
    if (Number(row.urbanHexCount ?? 0) > 0) urban += 1;
    if (Number(row.airportCount ?? 0) > 0) airports += 1;
    if (Number(row.seaportCount ?? 0) > 0) seaports += 1;
  }
  return { urban, airports, seaports };
}

/**
 * Builds the Air Operations Status briefing block (strategic full table, or tactical unit-target slice).
 *
 * Purpose: Shared shell section after the Commander's Briefing; tactical mode omits ferry/infra columns and empty battles.
 * When to use: `buildSystemPromptForTools` for both modes.
 * Expected outcome: Empty string when the opponent has no air units. Otherwise a heading, rules, and table.
 * Exceptions: None.
 */
export function buildAirOperationsBriefingBlock(
  state: GameStateSnapshot,
  format: (h3: string) => string,
  mode: 'strategic' | 'tactical' = 'strategic'
): string {
  logDebug('briefingSections buildAirOperationsBriefingBlock', { turnNumber: state.turnNumber, mode });
  const opponentAir = state.units.filter((u) => u.player === 'opponent' && u.unitType === 'air');
  const humanAir = state.units.filter((u) => u.player === 'human' && u.unitType === 'air');
  const humanUnits = state.units.filter((u) => u.player === 'human');

  if (opponentAir.length === 0) return '';

  if (mode === 'tactical') {
    const lines: string[] = [];
    lines.push(topLevelHeading(SECTION_TITLE_AIR_OPERATIONS_STATUS));
    lines.push('');
    lines.push(
      'Air rules (tactical): strikes may target enemy sub-units anywhere in this battle footprint; one air action per unit per beat.'
    );
    lines.push(`Air units: yours=${opponentAir.length}, enemy=${humanAir.length}.`);
    lines.push('');
    const airStatusRows: Array<Array<unknown>> = opponentAir.map((air) => {
      const targetableEnemyUnits = humanUnits.length;
      return [air.id, format(air.h3Index), targetableEnemyUnits];
    });
    lines.push(...buildPromptTableLines(['Unit ID', 'Hex', 'Enemy Unit Targets'], airStatusRows));
    return lines.join('\n');
  }

  const infraRows = state.res1Infrastructure ?? [];
  const hexUniverse = new Set(state.hexes.map((h) => h.h3Index));
  const controllerByHex = new Map((state.res1Control ?? []).map((r) => [r.h3Index, r.controllerPlayerId]));
  const infraByHex = new Map(infraRows.map((r) => [r.h3Index, r]));
  const opponentAirports = infraRows.filter(
    (r) => Number(r.airportCount ?? 0) > 0 && controllerByHex.get(r.h3Index) === 'opponent'
  );
  const humanAirports = infraRows.filter(
    (r) => Number(r.airportCount ?? 0) > 0 && controllerByHex.get(r.h3Index) === 'human'
  );
  const humanSeaports = infraRows.filter(
    (r) => Number(r.seaportCount ?? 0) > 0 && controllerByHex.get(r.h3Index) === 'human'
  );

  const lines: string[] = [];
  const rangeEnvelopeCache: RangeEnvelopeCache = new Map();
  lines.push(topLevelHeading(SECTION_TITLE_AIR_OPERATIONS_STATUS));
  lines.push('');
  lines.push(
    `Air rules: strike range ${AIR_STRIKE_RANGE_HEXES} from base, ferry range ${AIR_FERRY_RANGE_HEXES} airport-to-airport, one air action per unit per turn.`
  );
  lines.push(`Air units: yours=${opponentAir.length}, enemy=${humanAir.length}.`);
  lines.push('');
  const airStatusRows: Array<Array<unknown>> = [];
  for (const air of opponentAir) {
    const strikeEnvelope = getRangeEnvelopeByBase(
      air.h3Index,
      AIR_STRIKE_RANGE_HEXES,
      hexUniverse,
      rangeEnvelopeCache
    );
    const ferryEnvelope = getRangeEnvelopeByBase(
      air.h3Index,
      AIR_FERRY_RANGE_HEXES,
      hexUniverse,
      rangeEnvelopeCache
    );
    const baseInfra = infraByHex.get(air.h3Index);
    const baseIntact = Number(baseInfra?.airportCount ?? 0) > 0;
    const baseControlled = controllerByHex.get(air.h3Index) === 'opponent';
    const targetableEnemyUnits = humanUnits.filter((u) => strikeEnvelope.has(u.h3Index)).length;
    const strikeable = countStrikeableEnemyInfrastructure({ strikeEnvelope, infraRows, controllerByHex });
    const ferryDestinations = opponentAirports.filter((ap) => {
      if (ap.h3Index === air.h3Index) return false;
      return ferryEnvelope.has(ap.h3Index);
    }).length;
    airStatusRows.push([
      air.id,
      format(air.h3Index),
      baseIntact ? 'yes' : 'no',
      baseControlled ? 'yes' : 'no',
      targetableEnemyUnits,
      strikeable.urban,
      strikeable.airports,
      strikeable.seaports,
      ferryDestinations,
    ]);
  }
  lines.push(
    ...buildPromptTableLines(
      [
        'Unit ID',
        'Base Hex',
        'Base Intact',
        'Base Controlled',
        'Enemy Unit Targets',
        'Strikeable Urban',
        'Strikeable Airports',
        'Strikeable Seaports',
        'Ferry Destinations',
      ],
      airStatusRows
    )
  );

  const strikeEnvelopes = opponentAir.map((air) =>
    getRangeEnvelopeByBase(air.h3Index, AIR_STRIKE_RANGE_HEXES, hexUniverse, rangeEnvelopeCache)
  );
  const threatenedHumanAirports = humanAirports.filter((ap) => strikeEnvelopes.some((s) => s.has(ap.h3Index))).length;
  const threatenedHumanSeaports = humanSeaports.filter((sp) => strikeEnvelopes.some((s) => s.has(sp.h3Index))).length;
  lines.push('');
  lines.push(
    `Enemy infrastructure in your current strike envelope: airports=${threatenedHumanAirports}, seaports=${threatenedHumanSeaports}.`
  );
  lines.push(
    'Callback support: subscribe with event "infrastructure_destroyed" and parameters targetType plus the briefing hex code to be re-consulted after successful infra strikes.'
  );
  return lines.join('\n');
}
