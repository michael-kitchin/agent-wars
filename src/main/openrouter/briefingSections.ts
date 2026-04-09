import { gridDistance } from 'h3-js';
import { executeTool6 } from '../tools/tool6Production';
import { MAX_UNITS_PER_TYPE, getMaxedUnitTypesForPlayer, getPlayerUnitCountsByType } from '../productionCaps';
import type { GameStateSnapshot } from '../gameDb';
import { logDebug } from '../logger';
import { AIR_FERRY_RANGE_HEXES, AIR_STRIKE_RANGE_HEXES } from '../../shared/tacticalRanges';
import { buildPromptTableLines } from '../promptTableUtils';
import { getRangeEnvelopeByBase, type RangeEnvelopeCache } from './rangeSupport';

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
    if (args.controllerByHex.get(row.h3Index) === 'opponent') continue;
    if (Number(row.urbanHexCount ?? 0) > 0) urban += 1;
    if (Number(row.airportCount ?? 0) > 0) airports += 1;
    if (Number(row.seaportCount ?? 0) > 0) seaports += 1;
  }
  return { urban, airports, seaports };
}

interface ProductionQueueEntrySnapshot {
  entryId?: unknown;
  queueIndex?: unknown;
  unitType?: unknown;
  count?: unknown;
}

interface ControlledHexQueueSnapshot {
  hex?: unknown;
  urbanHexCount?: unknown;
  airportCount?: unknown;
  seaportCount?: unknown;
  availableUnitTypes?: unknown;
  entries?: unknown;
}

interface NormalizedControlledHexQueueRow {
  hexText: string;
  urban: number;
  airports: number;
  seaports: number;
  available: string;
  entries: string;
  hasQueuedEntries: boolean;
}

function normalizeControlledHexQueueRow(
  row: ControlledHexQueueSnapshot,
  formatLatLng: (ll: [number, number]) => string
): NormalizedControlledHexQueueRow {
  const hex = Array.isArray(row.hex) ? (row.hex as [number, number]) : null;
  const hexText = hex ? formatLatLng(hex) : '[unknown]';
  const urban = Number(row.urbanHexCount ?? 0);
  const airports = Number(row.airportCount ?? 0);
  const seaports = Number(row.seaportCount ?? 0);
  const available = Array.isArray(row.availableUnitTypes)
    ? (row.availableUnitTypes as unknown[]).map((x) => String(x)).join(', ')
    : '';
  const entriesList = Array.isArray(row.entries) ? (row.entries as ProductionQueueEntrySnapshot[]) : [];
  const nextEntry = [...entriesList].sort((a, b) => {
    const queueIndexA = Number(a.queueIndex);
    const queueIndexB = Number(b.queueIndex);
    if (Number.isFinite(queueIndexA) && Number.isFinite(queueIndexB) && queueIndexA !== queueIndexB) {
      return queueIndexA - queueIndexB;
    }
    const entryIdA = Number(a.entryId);
    const entryIdB = Number(b.entryId);
    if (Number.isFinite(entryIdA) && Number.isFinite(entryIdB) && entryIdA !== entryIdB) {
      return entryIdA - entryIdB;
    }
    return 0;
  })[0];
  const entries = nextEntry
    ? `${Number.isFinite(Number(nextEntry.count)) ? Number(nextEntry.count) : '?'} ${String(nextEntry.unitType ?? '?')}`
    : '—';
  return {
    hexText,
    urban,
    airports,
    seaports,
    available: available || '—',
    entries,
    hasQueuedEntries: entriesList.length > 0,
  };
}

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
  lines.push('');
  lines.push('**Controlled hex queues**');
  lines.push('');
  const normalizedRows = (queues as ControlledHexQueueSnapshot[]).map((row) =>
    normalizeControlledHexQueueRow(row, args.formatLatLng)
  );
  normalizedRows.sort((a, b) => {
    if (a.urban !== b.urban) return b.urban - a.urban;
    return a.hexText.localeCompare(b.hexText);
  });
  const topTen = normalizedRows.slice(0, 10);
  const selectedRows = [...topTen];
  const seen = new Set(topTen.map((r) => r.hexText));
  for (const row of normalizedRows.slice(10)) {
    if (!row.hasQueuedEntries) continue;
    if (seen.has(row.hexText)) continue;
    selectedRows.push(row);
    seen.add(row.hexText);
  }
  lines.push(
    ...buildPromptTableLines(
      ['Hex', 'Urban Hexes', 'Airports', 'Seaports', 'Available Unit Types', 'Current Queue'],
      selectedRows.map((row) => [row.hexText, row.urban, row.airports, row.seaports, row.available, row.entries]),
      ['—', '—', '—', '—', '—', '—']
    )
  );
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
  logDebug('briefingSections buildAirOperationsBriefingBlock', { turnNumber: state.turnNumber });
  const opponentAir = state.units.filter((u) => u.player === 'opponent' && u.unitType === 'air');
  const humanAir = state.units.filter((u) => u.player === 'human' && u.unitType === 'air');
  const humanUnits = state.units.filter((u) => u.player === 'human');
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
  lines.push('=== AIR OPERATIONS STATUS ===');
  lines.push(
    `Air rules: strike range ${AIR_STRIKE_RANGE_HEXES} from base, ferry range ${AIR_FERRY_RANGE_HEXES} airport-to-airport, one air action per unit per turn.`
  );
  lines.push(`Air units: yours=${opponentAir.length}, enemy=${humanAir.length}.`);
  lines.push('');
  const airStatusRows: Array<Array<unknown>> = [];

  if (opponentAir.length === 0) {
    // Keep explicit empty-state row for stable section shape.
    airStatusRows.push(['—', '—', '—', '—', '—', '—', '—', '—', '—']);
  } else {
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
  lines.push(
    `Enemy infrastructure in your current strike envelope: airports=${threatenedHumanAirports}, seaports=${threatenedHumanSeaports}.`
  );
  lines.push('Callback support: use callback event "infrastructure_destroyed" to be re-consulted after successful infra strikes.');
  return lines.join('\n');
}

function findNearestOpponentEmbarkHex(
  navalH3: string,
  state: GameStateSnapshot,
  format: (h3: string) => string
): string {
  const infraByHex = new Map((state.res1Infrastructure ?? []).map((row) => [row.h3Index, row]));
  const controlByHex = new Map((state.res1Control ?? []).map((row) => [row.h3Index, row.controllerPlayerId]));
  let best: { h3: string; d: number } | null = null;
  for (const hex of state.hexes) {
    const h3 = hex.h3Index;
    if (controlByHex.get(h3) !== 'opponent') continue;
    const seaport = Number(infraByHex.get(h3)?.seaportCount ?? 0);
    const canEmbark = hex.terrain === 'coastal' || seaport > 0;
    if (!canEmbark) continue;
    try {
      const d = gridDistance(navalH3, h3);
      if (best === null || d < best.d) best = { h3, d };
    } catch {
      continue;
    }
  }
  if (!best) return '—';
  return `${format(best.h3)} at hex distance ${best.d}`;
}

/**
 * Why this exists:
 *     Surfaces sealift-ready facts per naval unit (capacity, co-located land, nearest embark hex) so the model can
 *     issue embark/transport_move/disembark without long doctrine prose.
 * When to use:
 *     During prompt assembly for opponent planning turns.
 * What to expect:
 *     Deterministic one-line rows per opponent naval unit plus a one-line capacity reminder.
 */
export function buildSealiftBriefingBlock(
  state: GameStateSnapshot,
  format: (h3: string) => string
): string {
  logDebug('briefingSections buildSealiftBriefingBlock', { turnNumber: state.turnNumber });
  const lines: string[] = [];
  const opponentNaval = state.units.filter((unit) => unit.player === 'opponent' && unit.unitType === 'naval');
  const opponentLand = state.units.filter(
    (unit) => unit.player === 'opponent' && (unit.unitType === 'infantry' || unit.unitType === 'armor')
  );
  const infraByHex = new Map((state.res1Infrastructure ?? []).map((row) => [row.h3Index, row]));
  const controlByHex = new Map((state.res1Control ?? []).map((row) => [row.h3Index, row.controllerPlayerId]));
  const landByHex = new Map<string, { infantry: number; armor: number }>();
  for (const unit of opponentLand) {
    const row = landByHex.get(unit.h3Index) ?? { infantry: 0, armor: 0 };
    if (unit.unitType === 'armor') row.armor += 1;
    else row.infantry += 1;
    landByHex.set(unit.h3Index, row);
  }

  lines.push('=== NAVAL TRANSPORT STATUS ===');
  lines.push('Embark: opponent-controlled coastal hex, or non-coastal with seaport+control. Capacity: 1 armor or 2 infantry per naval unit.');
  lines.push('');
  const navalRows: Array<Array<unknown>> = [];
  if (opponentNaval.length <= 0) {
    navalRows.push(['—', '—', '—', '—', '—', '—', '—']);
    lines.push(
      ...buildPromptTableLines(
        ['Unit ID', 'Hex', 'Opponent Controlled', 'Seaport Here', 'Aboard', 'Capacity Used', 'Nearest Embark Hex'],
        navalRows
      )
    );
    return lines.join('\n');
  }

  for (const naval of opponentNaval) {
    const infra = infraByHex.get(naval.h3Index);
    const hasPort = (infra?.seaportCount ?? 0) > 0;
    const controlled = controlByHex.get(naval.h3Index) === 'opponent';
    const coLocated = landByHex.get(naval.h3Index) ?? { infantry: 0, armor: 0 };
    const nearestEmbark = findNearestOpponentEmbarkHex(naval.h3Index, state, format);
    const capacityUsed = coLocated.armor >= 1 ? 2 : Math.min(coLocated.infantry, 2);
    const aboard = `infantry ${coLocated.infantry}, armor ${coLocated.armor}`;
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
      ['Unit ID', 'Hex', 'Opponent Controlled', 'Seaport Here', 'Aboard', 'Capacity Used', 'Nearest Embark Hex'],
      navalRows
    )
  );
  return lines.join('\n');
}
