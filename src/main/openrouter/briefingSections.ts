import { executeTool6 } from '../tools/tool6Production';
import { getMaxedUnitTypesForPlayer, getPlayerUnitCountsByType } from '../productionCaps';
import { getMaxUnitsPerType, parseGameSize } from '../../shared/gameSize';
import type { GameStateSnapshot } from '../gameDb';
import { logDebug } from '../logger';
import { AIR_FERRY_RANGE_HEXES, AIR_STRIKE_RANGE_HEXES } from '../../shared/tacticalRanges';
import { buildPromptTableLines } from '../promptTableUtils';
import { getRangeEnvelopeByBase, type RangeEnvelopeCache } from './rangeSupport';
import { canEmbarkAtHex } from '../../shared/sealiftEmbarkEligibility';
import { gridHopDistancesFrom } from '../tools/assessUnitProximity';

/**
 * Defines the `countStrikeableEnemyInfrastructure` function shape (function countStrikeableEnemyInfrastructure(args: { strikeEnvelope: Set<string>; infraRows: NonNullable<GameStateSnapshot['res1Infrastructure']>; contr).

 * Purpose: Supports maintainability by documenting why `countStrikeableEnemyInfrastructure` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
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
    if (args.controllerByHex.get(row.h3Index) === 'opponent') continue;
    if (Number(row.urbanHexCount ?? 0) > 0) urban += 1;
    if (Number(row.airportCount ?? 0) > 0) airports += 1;
    if (Number(row.seaportCount ?? 0) > 0) seaports += 1;
  }
  return { urban, airports, seaports };
}

/**
 * Documents the `ProductionQueueEntrySnapshot` interface as a named contract surface (interface ProductionQueueEntrySnapshot).

 * Purpose: Supports maintainability by documenting why `ProductionQueueEntrySnapshot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface ProductionQueueEntrySnapshot {
    /**
   * Specifies the contract for the `entryId` member (entryId?: unknown;).

   * Contract: Describes stable behavior for callers of `entryId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
entryId?: unknown;
    /**
   * Specifies the contract for the `queueIndex` member (queueIndex?: unknown;).

   * Contract: Describes stable behavior for callers of `queueIndex` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
queueIndex?: unknown;
    /**
   * Specifies the contract for the `unitType` member (unitType?: unknown;).

   * Contract: Describes stable behavior for callers of `unitType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitType?: unknown;
    /**
   * Specifies the contract for the `count` member (count?: unknown;).

   * Contract: Describes stable behavior for callers of `count` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
count?: unknown;
}

/**
 * Documents the `ControlledHexQueueSnapshot` interface as a named contract surface (interface ControlledHexQueueSnapshot).

 * Purpose: Supports maintainability by documenting why `ControlledHexQueueSnapshot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface ControlledHexQueueSnapshot {
    /**
   * Specifies the contract for the `hex` member (hex?: unknown;).

   * Contract: Describes stable behavior for callers of `hex` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hex?: unknown;
    /**
   * Specifies the contract for the `urbanHexCount` member (urbanHexCount?: unknown;).

   * Contract: Describes stable behavior for callers of `urbanHexCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
urbanHexCount?: unknown;
    /**
   * Specifies the contract for the `airportCount` member (airportCount?: unknown;).

   * Contract: Describes stable behavior for callers of `airportCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airportCount?: unknown;
    /**
   * Specifies the contract for the `seaportCount` member (seaportCount?: unknown;).

   * Contract: Describes stable behavior for callers of `seaportCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
seaportCount?: unknown;
    /**
   * Specifies the contract for the `availableUnitTypes` member (availableUnitTypes?: unknown;).

   * Contract: Describes stable behavior for callers of `availableUnitTypes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
availableUnitTypes?: unknown;
    /**
   * Specifies the contract for the `entries` member (entries?: unknown;).

   * Contract: Describes stable behavior for callers of `entries` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
entries?: unknown;
}

/**
 * Documents the `NormalizedControlledHexQueueRow` interface as a named contract surface (interface NormalizedControlledHexQueueRow).

 * Purpose: Supports maintainability by documenting why `NormalizedControlledHexQueueRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface NormalizedControlledHexQueueRow {
    /**
   * Specifies the contract for the `hexText` member (hexText: string;).

   * Contract: Describes stable behavior for callers of `hexText` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hexText: string;
    /**
   * Specifies the contract for the `urban` member (urban: number;).

   * Contract: Describes stable behavior for callers of `urban` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
urban: number;
    /**
   * Specifies the contract for the `airports` member (airports: number;).

   * Contract: Describes stable behavior for callers of `airports` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airports: number;
    /**
   * Specifies the contract for the `seaports` member (seaports: number;).

   * Contract: Describes stable behavior for callers of `seaports` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
seaports: number;
    /**
   * Specifies the contract for the `available` member (available: string;).

   * Contract: Describes stable behavior for callers of `available` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
available: string;
    /**
   * Specifies the contract for the `entries` member (entries: string;).

   * Contract: Describes stable behavior for callers of `entries` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
entries: string;
    /**
   * Specifies the contract for the `hasQueuedEntries` member (hasQueuedEntries: boolean;).

   * Contract: Describes stable behavior for callers of `hasQueuedEntries` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hasQueuedEntries: boolean;
}

/**
 * Defines the `normalizeControlledHexQueueRow` function shape (function normalizeControlledHexQueueRow( row: ControlledHexQueueSnapshot, formatHexLabel: (ll: [number, number]) => string ): NormalizedControlledHexQueueR).

 * Purpose: Supports maintainability by documenting why `normalizeControlledHexQueueRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function normalizeControlledHexQueueRow(
  row: ControlledHexQueueSnapshot,
  formatHexLabel: (ll: [number, number]) => string
): NormalizedControlledHexQueueRow {
  const hex = Array.isArray(row.hex) ? (row.hex as [number, number]) : null;
  const hexText = hex ? formatHexLabel(hex) : '[unknown]';
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
 * Defines the `buildProductionBriefingBlock` function shape (export function buildProductionBriefingBlock(args: { productionEnabled: boolean; state: GameStateSnapshot; latLngByH3: Map<string, [number, number]>;).

 * Purpose: Supports maintainability by documenting why `buildProductionBriefingBlock` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildProductionBriefingBlock(args: {
  productionEnabled: boolean;
  state: GameStateSnapshot;
  latLngByH3: Map<string, [number, number]>;
  resolveToH3: (lat: number, lng: number) => string | undefined;
  formatHexLabel: (ll: [number, number]) => string;
}): string {
  if (!args.productionEnabled) return '';
  const snapshot = executeTool6('query_production', { all: true }, args.state, args.latLngByH3, args.resolveToH3) as {
    status?: string;
    production?: { controlledHexQueues?: Array<Record<string, unknown>> };
    error?: string;
    unavailableReason?: string;
  };
  if (snapshot.status !== 'ok') {
    return `# Production Status\n\nProduction status unavailable: ${snapshot.error ?? 'unknown error'}\n`;
  }
  if (typeof snapshot.unavailableReason === 'string' && snapshot.unavailableReason.trim().length > 0) {
    return `# Production Status\n\nProduction status temporarily unavailable: ${snapshot.unavailableReason}\n`;
  }
  const queues = snapshot.production?.controlledHexQueues ?? [];
  const opponentCounts = getPlayerUnitCountsByType(args.state.units, 'opponent');
  const gameSize = parseGameSize(args.state.gameSize);
  const caps = getMaxUnitsPerType(gameSize);
  const maxedTypes = getMaxedUnitTypesForPlayer(args.state.units, 'opponent', gameSize);
  const lines: string[] = [];
  lines.push('# Production Status');
  lines.push('');
  lines.push(
    'Rules: infantry cost 20 (min urban 1), armor cost 40 (min urban 2), naval cost 100 (min urban 10 + min seaports 1), air cost 60 (min urban 5 + requires airport).'
  );
  lines.push(
    `Deployment caps (per side): infantry ${caps.infantry}, armor ${caps.armor}, naval ${caps.naval}, air ${caps.air}.`
  );
  lines.push(
    `Your current unit counts: infantry ${opponentCounts.infantry}/${caps.infantry}, armor ${opponentCounts.armor}/${caps.armor}, naval ${opponentCounts.naval}/${caps.naval}, air ${opponentCounts.air}/${caps.air}.`
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
  lines.push('## Controlled Hex Queues');
  lines.push('');
  const normalizedRows = (queues as ControlledHexQueueSnapshot[]).map((row) =>
    normalizeControlledHexQueueRow(row, args.formatHexLabel)
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
 * Builds the Air Operations Status briefing block (strategic full table, or tactical unit-target slice).
 *
 * Purpose: Shared shell section after the Commander's Briefing; tactical mode omits ferry/infra columns and empty battles.
 * When to use: `buildSystemPromptForTools` for both modes.
 * Expected outcome: Strategic always returns a section (empty-state rows when no air). Tactical returns '' when no opponent air.
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

  if (mode === 'tactical') {
    if (opponentAir.length === 0) return '';
    const lines: string[] = [];
    lines.push('# Air Operations Status');
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
  lines.push('# Air Operations Status');
  lines.push('');
  lines.push(
    `Air rules: strike range ${AIR_STRIKE_RANGE_HEXES} from base, ferry range ${AIR_FERRY_RANGE_HEXES} airport-to-airport, one air action per unit per turn.`
  );
  lines.push(`Air units: yours=${opponentAir.length}, enemy=${humanAir.length}.`);
  lines.push('');
  const airStatusRows: Array<Array<unknown>> = [];

  if (opponentAir.length === 0) {
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
  lines.push('');
  lines.push(
    `Enemy infrastructure in your current strike envelope: airports=${threatenedHumanAirports}, seaports=${threatenedHumanSeaports}.`
  );
  lines.push('Callback support: use callback event "infrastructure_destroyed" to be re-consulted after successful infra strikes.');
  return lines.join('\n');
}

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
  const infraByHex = new Map((state.res1Infrastructure ?? []).map((row) => [row.h3Index, row]));
  const controlByHex = new Map((state.res1Control ?? []).map((row) => [row.h3Index, row.controllerPlayerId]));
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
 * Expected outcome: Strategic always returns a section. Tactical returns '' when no opponent naval.
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

  if (mode === 'tactical') {
    if (opponentNaval.length === 0) return '';
    lines.push('# Naval Transport Status');
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

  const infraByHex = new Map((state.res1Infrastructure ?? []).map((row) => [row.h3Index, row]));
  const controlByHex = new Map((state.res1Control ?? []).map((row) => [row.h3Index, row.controllerPlayerId]));

  lines.push('# Naval Transport Status');
  lines.push('');
  lines.push(
    'Embark: coastal or land seaport (control not required), or a water seaport you control. Capacity: 1 armor or 2 infantry per naval unit.'
  );
  lines.push('');
  const navalRows: Array<Array<unknown>> = [];
  if (opponentNaval.length <= 0) {
    navalRows.push(['—', '—', '—', '—', '—', '—', '—']);
    lines.push(
      ...buildPromptTableLines(
        ['Unit ID', 'Hex', 'Your control', 'Seaport Here', 'Aboard', 'Capacity Used', 'Nearest Embark Hex'],
        navalRows
      )
    );
    return lines.join('\n');
  }

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
