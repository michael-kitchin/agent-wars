/**
 * Production Status briefing block and its table-cell formatters.
 *
 * Purpose: Production is the remaining occupant of this module after air and naval moved out.
 * When to use: `buildSystemPromptForTools` and `requestOrdersFlow` when production tools are on.
 * Expected outcome: A production section when `productionEnabled` is true, including the empty-queue form.
 * Exceptions: None.
 */

import { briefingOwnSeatId } from '../briefing/briefingPerspective';
import { executeProductionTools } from '../tools/productionTools';
import {
  getMaxedUnitTypesForPlayer,
  getPlayerUnitCountsByType,
  filterQueueableUnitTypes,
  isEveryAvailableTypeAtCap,
  ALL_AVAILABLE_TYPES_AT_CAP_NOTE,
  PRODUCTION_CAP_QUEUE_GUIDANCE,
} from '../productionCaps';
import { getMaxUnitsPerType, parseGameSize } from '../../shared/gameSize';
import { FORTIFIED_COLUMN_HEADER } from '../../shared/fortificationRules';
import { ALL_BUILD_UNIT_TYPES } from '../../shared/ipc/productionTypes';
import { isBuildQueueItemType, isBuildUnitType } from '../productionRules';
import type { ControlledHexQueueSnapshot, ProductionQueueEntrySnapshot } from './productionQueueSnapshotTypes';
import { findIdleProductionHexes, selectNextQueueEntry, type IdleProductionHex } from './productionAttention';
import type { GameStateSnapshot } from '../gameDb';
import { logDebug, logTrace } from '../logger';
import { buildPromptTableLines } from '../promptTableHelpers';
import {
  SECTION_TITLE_CONTROLLED_HEX_QUEUES,
  SECTION_TITLE_PRODUCTION_STATUS,
  subHeading,
  topLevelHeading,
} from './promptSpec/sectionHeadings';
import { buildProductionCostRulesLine, buildProductionIncomeRule } from './promptSpec/gameRuleText';
import { BUILD_STATUS_COLUMN_HEADER, buildBuildabilityRule } from './promptSpec/gameRuleMercenaryText';

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
 * Expected outcome: Comma-separated queueable unit types, then fortification and credits. The cap note is attached to the unit types only when every one of them is maxed. `—` when the hex has nothing available.
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
  const unitTypes = available.filter((item) => isBuildUnitType(item));
  const extras = available.filter((item) => isBuildQueueItemType(item) && !isBuildUnitType(item));
  const kept = filterQueueableUnitTypes(unitTypes, maxedTypes);
  if (kept.length === 0 && extras.length === 0) return '—';
  const unitLabel = kept.length === 0
    ? ''
    : isEveryAvailableTypeAtCap(kept, maxedTypes)
      ? `${kept.join(', ')} (${ALL_AVAILABLE_TYPES_AT_CAP_NOTE})`
      : kept.join(', ');
  return [unitLabel, extras.join(', ')].filter((part) => part.length > 0).join(', ');
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
   * Fortified cells over intact city cells, as text.
   *
   * Contract: `fortified/intact`.
   * When to use: The Fortified column.
   * Expected outcome: A fraction. Both zeros read `0/0`.
   * Exceptions: None.
   */
  fortified: string;
  /**
   * Whether this hex is building.
   *
   * Contract: `paused` or `yes`.
   * When to use: The Building column.
   * Expected outcome: `paused` only when the snapshot says building is paused.
   * Exceptions: None.
   */
  building: string;
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
  const fortifiedCount = Number(row.fortifiedCount ?? 0);
  const fortifiableCount = Number(row.fortifiableCount ?? 0);
  const availableList = Array.isArray(row.availableUnitTypes)
    ? (row.availableUnitTypes as unknown[]).map((x) => String(x)).filter((item) => isBuildQueueItemType(item))
    : [];
  const available = formatBriefingAvailableUnitTypes(availableList, maxedTypes);
  const entriesList = Array.isArray(row.entries) ? (row.entries as ProductionQueueEntrySnapshot[]) : [];
  const nextEntry = selectNextQueueEntry(entriesList);
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
    fortified: `${fortifiedCount}/${fortifiedCount + fortifiableCount}`,
    building: row.buildPaused === true ? 'paused' : 'yes',
    available,
    entries,
    hasQueuedEntries: entriesList.length > 0,
  };
}

/**
 * Production status text plus every idle controlled hex.
 *
 * Purpose: The section text is unchanged. The idle list feeds Attention Flags and is computed from every queue, including queues the table does not show.
 * When to use: `buildProductionBriefingBlock` and `buildStatusInjectionTexts`.
 * Expected outcome: `text` is the production section, or empty when production is off. `idleHexes` is empty when production is off, the snapshot failed, or no hex is idle.
 * Exceptions: None.
 */
export function buildProductionBriefing(args: {
  productionEnabled: boolean;
  state: GameStateSnapshot;
  latLngByH3: Map<string, [number, number]>;
  resolveToH3: (lat: number, lng: number) => string | undefined;
  formatHexLabel: (ll: [number, number]) => string;
}): { readonly text: string; readonly idleHexes: readonly IdleProductionHex[] } {
  logDebug('briefingSections buildProductionBriefing', {
    productionEnabled: args.productionEnabled,
    turnNumber: args.state.turnNumber,
  });
  if (!args.productionEnabled) return { text: '', idleHexes: [] };
  const ownSeat = briefingOwnSeatId(args.state);
  const snapshot = executeProductionTools(ownSeat, 'query_production', { all: true }, args.state, args.latLngByH3, args.resolveToH3) as {
    status?: string;
    production?: { controlledHexQueues?: Array<Record<string, unknown>> };
    error?: string;
    unavailableReason?: string;
  };
  if (snapshot.status !== 'ok') {
    return {
      text: `${topLevelHeading(SECTION_TITLE_PRODUCTION_STATUS)}\n\nProduction status unavailable: ${snapshot.error ?? 'unknown error'}\n`,
      idleHexes: [],
    };
  }
  if (typeof snapshot.unavailableReason === 'string' && snapshot.unavailableReason.trim().length > 0) {
    return {
      text: `${topLevelHeading(SECTION_TITLE_PRODUCTION_STATUS)}\n\nProduction status temporarily unavailable: ${snapshot.unavailableReason}\n`,
      idleHexes: [],
    };
  }
  const queues = snapshot.production?.controlledHexQueues ?? [];
  const opponentCounts = getPlayerUnitCountsByType(args.state.units, ownSeat);
  const gameSize = parseGameSize(args.state.gameSize);
  const caps = getMaxUnitsPerType(gameSize);
  const maxedTypes = getMaxedUnitTypesForPlayer(args.state.units, ownSeat, gameSize);
  const lines: string[] = [];
  lines.push(topLevelHeading(SECTION_TITLE_PRODUCTION_STATUS));
  lines.push('');
  lines.push(buildProductionCostRulesLine());
  lines.push(
    `Deployment caps (per side): ${ALL_BUILD_UNIT_TYPES.map((unitType) => `${unitType} ${caps[unitType]}`).join(', ')}.`
  );
  lines.push(
    `Your current unit counts: ${ALL_BUILD_UNIT_TYPES.map((unitType) => `${unitType} ${opponentCounts[unitType]}/${caps[unitType]}`).join(', ')}.`
  );
  lines.push(buildProductionIncomeRule());
  lines.push(buildBuildabilityRule());
  if (maxedTypes.length > 0) {
    lines.push(`You are currently at maximum for: ${maxedTypes.join(', ')}.`);
    lines.push(PRODUCTION_CAP_QUEUE_GUIDANCE);
  }
  lines.push('Production progress/spawn resolves after Ready, after combat and control resolution.');
  const maxedTypeSet = new Set(maxedTypes);
  const idleHexes = findIdleProductionHexes(queues as ControlledHexQueueSnapshot[], maxedTypeSet, args.formatHexLabel);
  if (queues.length === 0) {
    lines.push(PRODUCTION_EMPTY_QUEUES_SENTENCE);
    return { text: lines.join('\n'), idleHexes };
  }
  lines.push('');
  lines.push(subHeading(SECTION_TITLE_CONTROLLED_HEX_QUEUES));
  lines.push('');
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
      ['Hex', 'Urban Hexes', FORTIFIED_COLUMN_HEADER, 'Airports', 'Seaports', 'Available Unit Types', 'Current Queue', BUILD_STATUS_COLUMN_HEADER],
      selectedRows.map((row) => [row.hexText, row.urban, row.fortified, row.airports, row.seaports, row.available, row.entries, row.building]),
      ['—', '—', '—', '—', '—', '—', '—', '—']
    )
  );
  return { text: lines.join('\n'), idleHexes };
}

/**
 * Production status section text.
 *
 * Purpose: Callers that only insert the section do not need the idle-hex list.
 * When to use: Anywhere that previously called this function for the markdown alone.
 * Expected outcome: `buildProductionBriefing(args).text`.
 * Exceptions: None.
 */
export function buildProductionBriefingBlock(args: {
  productionEnabled: boolean;
  state: GameStateSnapshot;
  latLngByH3: Map<string, [number, number]>;
  resolveToH3: (lat: number, lng: number) => string | undefined;
  formatHexLabel: (ll: [number, number]) => string;
}): string {
  return buildProductionBriefing(args).text;
}

