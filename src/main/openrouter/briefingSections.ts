/**
 * Production Status briefing block and its table-cell formatters.
 *
 * Purpose: Production is the remaining occupant of this module after air and naval moved out.
 * When to use: `buildSystemPromptForTools` and `requestOrdersFlow` when production tools are on.
 * Expected outcome: A production section when `productionEnabled` is true, including the empty-queue form.
 * Exceptions: None.
 */

import { executeTool6 } from '../tools/tool6Production';
import {
  getMaxedUnitTypesForPlayer,
  getPlayerUnitCountsByType,
  filterQueueableUnitTypes,
  isEveryAvailableTypeAtCap,
  ALL_AVAILABLE_TYPES_AT_CAP_NOTE,
  PRODUCTION_CAP_QUEUE_GUIDANCE,
} from '../productionCaps';
import { getMaxUnitsPerType, parseGameSize } from '../../shared/gameSize';
import type { GameStateSnapshot } from '../gameDb';
import { logDebug, logTrace } from '../logger';
import { buildPromptTableLines } from '../promptTableUtils';
import {
  SECTION_TITLE_CONTROLLED_HEX_QUEUES,
  SECTION_TITLE_PRODUCTION_STATUS,
  subHeading,
  topLevelHeading,
} from './promptSpec/sectionHeadings';
import { buildProductionCostRulesLine, buildProductionIncomeRule } from './promptSpec/gameRuleText';

/**
 * Sentence used when production tools are on but no controlled hex has an editable queue.
 *
 * Purpose: The include/omit matrix requires a defined empty form rather than omitting the section.
 * When to use: `buildProductionBriefingBlock` and `buildEmptyProductionQueuesSection`.
 * Expected outcome: Exact briefing copy for the empty-queue case.
 * Exceptions: None.
 */
export const PRODUCTION_EMPTY_QUEUES_SENTENCE =
  'No currently controlled hexes with editable production queues.';

/**
 * Production Status section when the tool group is on but there is nothing to queue.
 *
 * Purpose: `formatBriefing` must not treat an empty production string as "tools off".
 * When to use: When production tools are enabled and the builder returned no body.
 * Expected outcome: Heading plus `PRODUCTION_EMPTY_QUEUES_SENTENCE`.
 * Exceptions: None.
 */
export function buildEmptyProductionQueuesSection(): string {
  logDebug('briefingSections buildEmptyProductionQueuesSection', {});
  return `${topLevelHeading(SECTION_TITLE_PRODUCTION_STATUS)}\n\n${PRODUCTION_EMPTY_QUEUES_SENTENCE}`;
}

/**
 * Formats the Available Unit Types cell, omitting types already at the player's deployment cap unless no alternative remains.
 *
 * Purpose: The production table must not list capped types as buildable when another type can still spawn; a hex that can only build capped types still lists them so pre-queue remains possible, but must say so or the cap guidance reads as an instruction to swap in a type the hex cannot build.
 * When to use: Production briefing rows after `getMaxedUnitTypesForPlayer`.
 * Expected outcome: Comma-separated queueable types, suffixed with the all-at-cap note when every listed type is maxed, or `—` when the hex has no available types at all.
 * Exceptions: None.
 */
export function formatBriefingAvailableUnitTypes(
  available: readonly string[],
  maxedTypes: ReadonlySet<string>
): string {
  logTrace('briefingSections formatBriefingAvailableUnitTypes', {
    availableCount: available.length,
    maxedCount: maxedTypes.size,
  });
  const kept = filterQueueableUnitTypes(available, maxedTypes);
  if (kept.length === 0) return '—';
  const label = kept.join(', ');
  return isEveryAvailableTypeAtCap(kept, maxedTypes) ? `${label} (${ALL_AVAILABLE_TYPES_AT_CAP_NOTE})` : label;
}

/**
 * Formats the Current Queue cell, marking entries whose unit type cannot spawn because the player is at cap.
 *
 * Purpose: Existing armor (etc.) queues look healthy in the briefing while spawn is blocked; the annotation tells the AI to replace them.
 * When to use: Production briefing rows after formatting the next queue entry.
 * Expected outcome: Unchanged label, or `${label} (blocked: at cap)` when `queuedUnitType` is maxed.
 * Exceptions: None.
 */
export function formatBriefingProductionQueueCell(
  queueLabel: string,
  queuedUnitType: string | undefined,
  maxedTypes: ReadonlySet<string>
): string {
  logTrace('briefingSections formatBriefingProductionQueueCell', {
    queuedUnitType: queuedUnitType ?? null,
    maxedCount: maxedTypes.size,
  });
  if (queuedUnitType && maxedTypes.has(queuedUnitType) && queueLabel !== '—') {
    return `${queueLabel} (blocked: at cap)`;
  }
  return queueLabel;
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
  formatHexLabel: (ll: [number, number]) => string,
  maxedTypes: ReadonlySet<string>
): NormalizedControlledHexQueueRow {
  const hex = Array.isArray(row.hex) ? (row.hex as [number, number]) : null;
  const hexText = hex ? formatHexLabel(hex) : '[unknown]';
  const urban = Number(row.urbanHexCount ?? 0);
  const airports = Number(row.airportCount ?? 0);
  const seaports = Number(row.seaportCount ?? 0);
  const availableList = Array.isArray(row.availableUnitTypes)
    ? (row.availableUnitTypes as unknown[]).map((x) => String(x))
    : [];
  const available = formatBriefingAvailableUnitTypes(availableList, maxedTypes);
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
  const queuedUnitType = nextEntry ? String(nextEntry.unitType ?? '') : undefined;
  const entriesRaw = nextEntry
    ? `${Number.isFinite(Number(nextEntry.count)) ? Number(nextEntry.count) : '?'} ${queuedUnitType ?? '?'}`
    : '—';
  const entries = formatBriefingProductionQueueCell(entriesRaw, queuedUnitType, maxedTypes);
  return {
    hexText,
    urban,
    airports,
    seaports,
    available,
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
  logDebug('briefingSections buildProductionBriefingBlock', {
    productionEnabled: args.productionEnabled,
    turnNumber: args.state.turnNumber,
  });
  if (!args.productionEnabled) return '';
  const snapshot = executeTool6('query_production', { all: true }, args.state, args.latLngByH3, args.resolveToH3) as {
    status?: string;
    production?: { controlledHexQueues?: Array<Record<string, unknown>> };
    error?: string;
    unavailableReason?: string;
  };
  if (snapshot.status !== 'ok') {
    return `${topLevelHeading(SECTION_TITLE_PRODUCTION_STATUS)}\n\nProduction status unavailable: ${snapshot.error ?? 'unknown error'}\n`;
  }
  if (typeof snapshot.unavailableReason === 'string' && snapshot.unavailableReason.trim().length > 0) {
    return `${topLevelHeading(SECTION_TITLE_PRODUCTION_STATUS)}\n\nProduction status temporarily unavailable: ${snapshot.unavailableReason}\n`;
  }
  const queues = snapshot.production?.controlledHexQueues ?? [];
  const opponentCounts = getPlayerUnitCountsByType(args.state.units, 'opponent');
  const gameSize = parseGameSize(args.state.gameSize);
  const caps = getMaxUnitsPerType(gameSize);
  const maxedTypes = getMaxedUnitTypesForPlayer(args.state.units, 'opponent', gameSize);
  const lines: string[] = [];
  lines.push(topLevelHeading(SECTION_TITLE_PRODUCTION_STATUS));
  lines.push('');
  lines.push(buildProductionCostRulesLine());
  lines.push(
    `Deployment caps (per side): infantry ${caps.infantry}, armor ${caps.armor}, naval ${caps.naval}, air ${caps.air}.`
  );
  lines.push(
    `Your current unit counts: infantry ${opponentCounts.infantry}/${caps.infantry}, armor ${opponentCounts.armor}/${caps.armor}, naval ${opponentCounts.naval}/${caps.naval}, air ${opponentCounts.air}/${caps.air}.`
  );
  lines.push(buildProductionIncomeRule());
  if (maxedTypes.length > 0) {
    lines.push(`You are currently at maximum for: ${maxedTypes.join(', ')}.`);
    lines.push(PRODUCTION_CAP_QUEUE_GUIDANCE);
  }
  lines.push('Production progress/spawn resolves after Ready, after combat and control resolution.');
  if (queues.length === 0) {
    lines.push(PRODUCTION_EMPTY_QUEUES_SENTENCE);
    return lines.join('\n');
  }
  lines.push('');
  lines.push(subHeading(SECTION_TITLE_CONTROLLED_HEX_QUEUES));
  lines.push('');
  const maxedTypeSet = new Set(maxedTypes);
  const normalizedRows = (queues as ControlledHexQueueSnapshot[]).map((row) =>
    normalizeControlledHexQueueRow(row, args.formatHexLabel, maxedTypeSet)
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

