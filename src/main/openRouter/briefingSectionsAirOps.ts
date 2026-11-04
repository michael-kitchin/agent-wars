/**
 * Air Operations Status briefing block for both consultation modes.
 *
 * Purpose: Moved out of `briefingSections.ts` so production, air, and naval each have one home.
 * When to use: `buildSystemPromptForTools` after the Commander's Briefing.
 * Expected outcome: Empty string when the opponent has no air units. Otherwise a heading, rules, and table.
 * Exceptions: None.
 */

import { briefingOwnSeatId } from '../briefing/briefingPerspective';
import type { GameStateSnapshot } from '../gameDb';
import { logDebug } from '../logger';
import { AIR_FERRY_RANGE_HEXES, AIR_STRIKE_RANGE_HEXES } from '../../shared/tacticalRanges';
import { buildPromptTableLines } from '../promptTableHelpers';
import { findAirportFerryRoute } from '../../shared/airportFerryRoute';
import { computeGridDistancePure, isWithinGridRangePure } from '../../shared/h3GridRangePure';
import { isNeutralBorderHex } from '../../shared/h3Resolutions';
import { strategicFerryRangeHexes } from '../../shared/weatherBonusRules';
import { strategicFerryRangeOnState } from '../weather/weatherMatch';
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
  infraRows: NonNullable<GameStateSnapshot['strategicInfrastructure']>;
  controllerByHex: Map<string, string | null | undefined>;
  ownSeatId: string;
}): { urban: number; airports: number; seaports: number } {
  let urban = 0;
  let airports = 0;
  let seaports = 0;
  for (const row of args.infraRows) {
    if (!args.strikeEnvelope.has(row.h3Index)) continue;
    const controller = args.controllerByHex.get(row.h3Index) ?? null;
    if (controller === null || controller === args.ownSeatId) continue;
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
 * Expected outcome: Empty string when the opponent has no air units. Otherwise a heading, rules, and table. Ferry
 * destinations use each unit's ferry range to that airport, which is shorter into snow the unit lacks when weather is on.
 * Exceptions: None.
 */
export function buildAirOperationsBriefingBlock(
  state: GameStateSnapshot,
  format: (h3: string) => string,
  mode: 'strategic' | 'tactical' = 'strategic'
): string {
  logDebug('briefingSections buildAirOperationsBriefingBlock', { turnNumber: state.turnNumber, mode });
  const ownSeat = briefingOwnSeatId(state);
  const opponentAir = state.units.filter((u) => u.player === ownSeat && u.unitType === 'air');
  const humanAir = state.units.filter((u) => u.player !== ownSeat && u.unitType === 'air');
  const humanUnits = state.units.filter((u) => u.player !== ownSeat);

  if (opponentAir.length === 0) return '';

  if (mode === 'tactical') {
    const lines: string[] = [];
    lines.push(topLevelHeading(SECTION_TITLE_AIR_OPERATIONS_STATUS));
    lines.push('');
    lines.push(
      'Air rules (tactical): strikes and drops cover this battle footprint; ferry is one hop between intact airport cells; an air sub-unit carries one infantry sub-unit.'
    );
    lines.push(`Air units: yours=${opponentAir.length}, enemy=${humanAir.length}.`);
    lines.push('');
    const airStatusRows: Array<Array<unknown>> = opponentAir.map((air) => {
      const targetableEnemyUnits = humanUnits.length;
      return [air.id, format(air.h3Index), infantryAboardLabel(state, air.id), targetableEnemyUnits];
    });
    lines.push(...buildPromptTableLines(['Unit ID', 'Hex', 'Aboard', 'Enemy Unit Targets'], airStatusRows));
    return lines.join('\n');
  }

  const infraRows = state.strategicInfrastructure ?? [];
  const hexUniverse = new Set(state.hexes.map((h) => h.h3Index));
  const controllerByHex = new Map((state.strategicControl ?? []).map((r) => [r.h3Index, r.controllerPlayerId]));
  const infraByHex = new Map(infraRows.map((r) => [r.h3Index, r]));
  const opponentAirports = infraRows.filter(
    (r) => Number(r.airportCount ?? 0) > 0 && controllerByHex.get(r.h3Index) === ownSeat
  );
  const humanAirports = infraRows.filter((r) => {
    const controller = controllerByHex.get(r.h3Index) ?? null;
    return Number(r.airportCount ?? 0) > 0 && controller !== null && controller !== ownSeat;
  });
  const humanSeaports = infraRows.filter((r) => {
    const controller = controllerByHex.get(r.h3Index) ?? null;
    return Number(r.seaportCount ?? 0) > 0 && controller !== null && controller !== ownSeat;
  });

  const lines: string[] = [];
  const rangeEnvelopeCache: RangeEnvelopeCache = new Map();
  lines.push(topLevelHeading(SECTION_TITLE_AIR_OPERATIONS_STATUS));
  lines.push('');
  lines.push(
    `Air rules: an air unit ferries any distance by hopping controlled intact airports. Each hop is at most ${AIR_FERRY_RANGE_HEXES} hexes, or ${strategicFerryRangeHexes({ weatherAtDestination: 'snow', tags: [], enabled: true })} into snow when the unit lacks the snow tag. It strikes and drops within ${AIR_STRIKE_RANGE_HEXES} of its current airport. Ferry Destinations lists at most 8 nearest reachable airports; any other airport you control may be legal, and plan_route confirms the chain. One air action per unit per turn.`
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
    const baseInfra = infraByHex.get(air.h3Index);
    const baseIntact = Number(baseInfra?.airportCount ?? 0) > 0;
    const baseControlled = controllerByHex.get(air.h3Index) === ownSeat;
    const targetableEnemyUnits = humanUnits.filter((u) => strikeEnvelope.has(u.h3Index)).length;
    const strikeable = countStrikeableEnemyInfrastructure({ strikeEnvelope, infraRows, controllerByHex, ownSeatId: ownSeat });
    airStatusRows.push([
      air.id,
      format(air.h3Index),
      infantryAboardLabel(state, air.id),
      baseIntact ? 'yes' : 'no',
      baseControlled ? 'yes' : 'no',
      targetableEnemyUnits,
      strikeable.urban,
      strikeable.airports,
      strikeable.seaports,
      nearestFerryAirportCodes(air, opponentAirports, state, format, ownSeat),
    ]);
  }
  lines.push(
    ...buildPromptTableLines(
      [
        'Unit ID',
        'Base Hex',
        'Aboard',
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

/**
 * The infantry id aboard an air unit, or `none`.
 *
 * Purpose: The Air Operations table names cargo the same way the naval table names a ship's cargo.
 * When to use: One air row in either consultation mode.
 * Expected outcome: One infantry id, or `none` when the air unit is empty.
 * Exceptions: None.
 */
function infantryAboardLabel(state: GameStateSnapshot, airUnitId: string): string {
  const aboard = state.units.find(
    (unit) =>
      unit.unitType === 'infantry' &&
      (unit.embarkedOnCarrierUnitId === airUnitId ||
        (unit as { embarkedOnSubUnitId?: string }).embarkedOnSubUnitId === airUnitId)
  );
  return aboard?.id ?? 'none';
}

/**
 * At most eight reachable airports, nearest first, ties broken by the hex id.
 *
 * Purpose: The ferry column stays short. A longer chain is confirmed with `plan_route`.
 * When to use: One strategic air row.
 * Expected outcome: Briefing hex codes separated by commas, or `none`.
 * Exceptions: None. An unreachable airport is omitted.
 */
function nearestFerryAirportCodes(
  air: GameStateSnapshot['units'][number],
  airports: readonly { h3Index: string }[],
  state: GameStateSnapshot,
  format: (h3: string) => string,
  owner: string
): string {
  const nodes = airports.map((airport) => ({
    h3Index: airport.h3Index,
    owner,
    intact: true,
    neutralBorder: isNeutralBorderHex(airport.h3Index),
  }));
  const reached: { h3Index: string; distance: number }[] = [];
  for (const airport of airports) {
    if (airport.h3Index === air.h3Index) continue;
    const route = findAirportFerryRoute({
      originH3Index: air.h3Index,
      destinationH3Index: airport.h3Index,
      owner,
      nodes,
      gridDistance: computeGridDistancePure,
      unmeasuredHopWithinRange: isWithinGridRangePure,
      hopRangeHexes: (destinationH3Index) => strategicFerryRangeOnState(air, destinationH3Index, state),
    });
    if (!route.reachable) continue;
    reached.push({
      h3Index: airport.h3Index,
      distance: computeGridDistancePure(air.h3Index, airport.h3Index) ?? Number.MAX_SAFE_INTEGER,
    });
  }
  reached.sort((left, right) => left.distance - right.distance || (left.h3Index < right.h3Index ? -1 : 1));
  const codes = reached.slice(0, 8).map((row) => format(row.h3Index));
  return codes.length > 0 ? codes.join(', ') : 'none';
}
