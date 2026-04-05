import { executeTool6 } from '../tools/tool6Production';
import { MAX_UNITS_PER_TYPE, getMaxedUnitTypesForPlayer, getPlayerUnitCountsByType } from '../productionCaps';
import type { GameStateSnapshot } from '../gameDb';
import { AIR_FERRY_RANGE_HEXES, AIR_STRIKE_RANGE_HEXES } from '../../shared/tacticalRanges';
import { countRowsInStrikeRange, isInRange } from './rangeSupport';

/**
 * Why this exists:
 *     Builds the production-status section used in AI system prompts from live production tooling and game-state counts.
 * When to use:
 *     During system prompt assembly when production tools are enabled.
 * What to expect:
 *     Returns a stable multi-line block or an unavailable message when production data cannot be read.
 */
export function buildProductionBriefingBlock(args: {
  productionEnabled: boolean;
  state: GameStateSnapshot;
  latLngByH3: Map<string, [number, number]>;
  resolveToH3: (lat: number, lng: number) => string | undefined;
  formatLatLng: (ll: [number, number]) => string;
}): string {
  if (!args.productionEnabled) return '';
  const snapshot = executeTool6('query_production', { all: true }, args.state, args.latLngByH3, args.resolveToH3) as {
    status?: string;
    production?: { controlledHexQueues?: Array<Record<string, unknown>> };
    error?: string;
    unavailableReason?: string;
  };
  if (snapshot.status !== 'ok') {
    return `=== PRODUCTION STATUS ===\nProduction status unavailable: ${snapshot.error ?? 'unknown error'}\n`;
  }
  if (typeof snapshot.unavailableReason === 'string' && snapshot.unavailableReason.trim().length > 0) {
    return `=== PRODUCTION STATUS ===\nProduction status temporarily unavailable: ${snapshot.unavailableReason}\n`;
  }
  const queues = snapshot.production?.controlledHexQueues ?? [];
  const opponentCounts = getPlayerUnitCountsByType(args.state.units, 'opponent');
  const maxedTypes = getMaxedUnitTypesForPlayer(args.state.units, 'opponent');
  const lines: string[] = [];
  lines.push('=== PRODUCTION STATUS ===');
  lines.push(
    'Rules: infantry cost 10 (min urban 1), armor cost 20 (min urban 2), naval cost 50 (min urban 10 + min seaports 1), air cost 30 (min urban 5 + requires airport).'
  );
  lines.push(
    `Deployment caps (per side): infantry ${MAX_UNITS_PER_TYPE.infantry}, armor ${MAX_UNITS_PER_TYPE.armor}, naval ${MAX_UNITS_PER_TYPE.naval}, air ${MAX_UNITS_PER_TYPE.air}.`
  );
  lines.push(
    `Your current unit counts: infantry ${opponentCounts.infantry}/${MAX_UNITS_PER_TYPE.infantry}, armor ${opponentCounts.armor}/${MAX_UNITS_PER_TYPE.armor}, naval ${opponentCounts.naval}/${MAX_UNITS_PER_TYPE.naval}, air ${opponentCounts.air}/${MAX_UNITS_PER_TYPE.air}.`
  );
  if (maxedTypes.length > 0) {
    lines.push(`You are currently at maximum for: ${maxedTypes.join(', ')}.`);
  }
  lines.push('Production progress/spawn resolves after Ready, after combat and control resolution.');
  if (queues.length === 0) {
    lines.push('No currently controlled hexes with editable production queues.');
    return lines.join('\n');
  }
  lines.push('Controlled hex queues:');
  for (const row of queues) {
    const hex = Array.isArray(row.hex) ? (row.hex as [number, number]) : null;
    const urban = Number(row.urbanHexCount ?? 0);
    const seaports = Number(row.seaportCount ?? 0);
    const available = Array.isArray(row.availableUnitTypes)
      ? (row.availableUnitTypes as unknown[]).map((x) => String(x)).join(', ')
      : '';
    const entries = Array.isArray(row.entries)
      ? (row.entries as Array<Record<string, unknown>>)
          .map((entry) => `${entry.entryId}:${entry.unitType}x${entry.count}`)
          .join(', ')
      : '';
    lines.push(
      `- ${hex ? args.formatLatLng(hex) : '[unknown]'} urban=${urban} airports=${Number(row.airportCount ?? 0)} seaports=${seaports} available=[${available || 'none'}] queue=${entries || '(empty)'}`
    );
  }
  return lines.join('\n');
}

/**
 * Why this exists:
 *     Builds the air-operations briefing section so prompt assembly can stay focused on orchestration.
 * When to use:
 *     During system prompt creation for opponent planning turns.
 * What to expect:
 *     Returns deterministic air status lines including strike/ferry opportunity counts and threatened enemy infrastructure.
 */
export function buildAirOperationsBriefingBlock(
  state: GameStateSnapshot,
  format: (h3: string) => string
): string {
  const opponentAir = state.units.filter((u) => u.player === 'opponent' && u.unitType === 'air');
  const humanAir = state.units.filter((u) => u.player === 'human' && u.unitType === 'air');
  const humanUnits = state.units.filter((u) => u.player === 'human');
  const infraRows = state.res1Infrastructure ?? [];
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
  lines.push('=== AIR OPERATIONS STATUS ===');
  lines.push(
    `Air rules: strike range ${AIR_STRIKE_RANGE_HEXES} from base, ferry range ${AIR_FERRY_RANGE_HEXES} airport-to-airport, one air action per unit per turn.`
  );
  lines.push(`Air units: yours=${opponentAir.length}, enemy=${humanAir.length}.`);

  if (opponentAir.length === 0) {
    lines.push('No opponent air units currently deployed.');
  } else {
    lines.push('Your air unit options this turn:');
    for (const air of opponentAir) {
      const baseInfra = infraByHex.get(air.h3Index);
      const baseIntact = Number(baseInfra?.airportCount ?? 0) > 0;
      const baseControlled = controllerByHex.get(air.h3Index) === 'opponent';
      const targetableEnemyUnits = humanUnits.filter((u) => isInRange(air.h3Index, u.h3Index, 3)).length;
      const strikeableUrban = countRowsInStrikeRange(air.h3Index, infraRows, (r) =>
        controllerByHex.get(r.h3Index) !== 'opponent' && Number(r.urbanHexCount ?? 0) > 0
      );
      const strikeableAirports = countRowsInStrikeRange(air.h3Index, infraRows, (r) =>
        controllerByHex.get(r.h3Index) !== 'opponent' && Number(r.airportCount ?? 0) > 0
      );
      const strikeableSeaports = countRowsInStrikeRange(air.h3Index, infraRows, (r) =>
        controllerByHex.get(r.h3Index) !== 'opponent' && Number(r.seaportCount ?? 0) > 0
      );
      const ferryDestinations = opponentAirports.filter((ap) => {
        if (ap.h3Index === air.h3Index) return false;
        return isInRange(air.h3Index, ap.h3Index, 4);
      }).length;
      lines.push(
        `- ${air.id} @ ${format(air.h3Index)} baseIntact=${baseIntact} baseControlled=${baseControlled} unitTargets=${targetableEnemyUnits} strikeable[urban=${strikeableUrban},airport=${strikeableAirports},seaport=${strikeableSeaports}] ferryDestinations=${ferryDestinations}`
      );
    }
  }

  const threatenedHumanAirports = humanAirports.filter((ap) => opponentAir.some((air) => isInRange(air.h3Index, ap.h3Index, 3))).length;
  const threatenedHumanSeaports = humanSeaports.filter((sp) => opponentAir.some((air) => isInRange(air.h3Index, sp.h3Index, 3))).length;
  lines.push(
    `Enemy infrastructure in your current strike envelope: airports=${threatenedHumanAirports}, seaports=${threatenedHumanSeaports}.`
  );
  lines.push('Callback support: use callback event "infrastructure_destroyed" to be re-consulted after successful infra strikes.');
  return lines.join('\n');
}
