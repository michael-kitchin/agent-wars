import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { dbGetAll } from '../gameDb';
import { buildLatLngCoordinateMap } from '../mapData';
import { logDebug, logTrace } from '../logger';
import type { CoordinateContext } from '../briefing/map/coordinateContext';
import { ensureStrategicCoordinateRegistryInitialized } from '../briefing/map/hexCoordinates';
import { h3ToCode } from '../briefing/map/hexCodeTranslator';
import { buildPromptTableLines } from '../promptTableHelpers';
import { SECTION_TITLE_STANDING_ORDER_STATUS, topLevelHeading } from '../openRouter/promptSpec/sectionHeadings';
import { parseComputedRoute, parseOrderParams, type StandingOrderRow } from './standingOrdersShared';
import { suggestApproachDestinationsForOrderlessUnits } from './orderlessUnitSuggestions';
import { expireAndUpdateStatus } from './standingOrdersGeneration';
import { marchStepRecedesFromEnemy, nearestObservedEnemyH3 } from './standingMarchReceding';

/**
 * Documents the module-scope binding `WARNING_STATUSES` (WARNING_STATUSES).

 * Purpose: Supports maintainability by documenting why `WARNING_STATUSES` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const WARNING_STATUSES = new Set([
  'blocked',
  'target_lost',
  'target_out_of_range',
  'target_destroyed',
  'arrived',
  'contact',
]);

/**
 * Documents the `StandingOrderPromptRow` interface as a named contract surface (interface StandingOrderPromptRow).

 * Purpose: Supports maintainability by documenting why `StandingOrderPromptRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface StandingOrderPromptRow {
    /**
   * Specifies the contract for the `unitId` member (unitId: string;).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitId: string;
    /**
   * Specifies the contract for the `unitType` member (unitType: string;).

   * Contract: Describes stable behavior for callers of `unitType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitType: string;
    /**
   * Specifies the contract for the `orderType` member (orderType: string;).

   * Contract: Describes stable behavior for callers of `orderType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
orderType: string;
    /**
   * Specifies the contract for the `destination` member (destination: string;).

   * Contract: Describes stable behavior for callers of `destination` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
destination: string;
    /**
   * Specifies the contract for the `status` member (status: string;).

   * Contract: Describes stable behavior for callers of `status` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
status: string;
    /**
   * Specifies the contract for the `nextMove` member (nextMove: string;).

   * Contract: Describes stable behavior for callers of `nextMove` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
nextMove: string;
    /**
   * Specifies the contract for the `turnsRemaining` member (turnsRemaining: string | number;).

   * Contract: Describes stable behavior for callers of `turnsRemaining` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
turnsRemaining: string | number;
    /**
   * Specifies the contract for the `attention` member (attention: 'yes' | 'no';).

   * Contract: Describes stable behavior for callers of `attention` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
attention: 'yes' | 'no';
}

/**
 * Resolves a stored lat/lng tuple to the briefing hex code shown alongside rosters and maps.
 *
 * Purpose: Keeps standing-order status tables aligned with the JSON hex-code contract while DB rows remain lat/lng.
 * When to use: Only when formatting strategic `getInjectionText` rows.
 * Expected outcome: Two-character code when the tuple snaps to a registered cell; em dash when off-registry or unmapped.
 * Exceptions: None; failures downgrade to an em dash rather than throwing into the prompt builder.
 */
function latLngTupleToBriefingHexDisplay(
  ll: [number, number] | undefined,
  coordinateContext: CoordinateContext,
  resolveToH3: (lat: number, lng: number) => string | undefined
): string {
  if (!ll || ll.length < 2) return '—';
  const h3 = resolveToH3(ll[0], ll[1]);
  if (!h3) return '—';
  return h3ToBriefingHexDisplay(h3, coordinateContext);
}

/**
 * Renders one H3 index as a briefing hex code, downgrading to an em dash instead of throwing.
 *
 * Purpose: `h3ToCode` throws for cells outside the active coordinate registry, and a single unregistered hex must not
 * take down the whole prompt build; standing-order tables would rather show a gap than fail.
 * When to use: Any standing-order table cell that displays a hex the caller already holds as an H3 index.
 * Expected outcome: Two-character code when registered; em dash otherwise.
 * Exceptions: None.
 */
function h3ToBriefingHexDisplay(h3: string, coordinateContext: CoordinateContext): string {
  try {
    return h3ToCode(h3, coordinateContext);
  } catch {
    return '—';
  }
}

/**
 * Defines the `toStandingOrderPromptRow` function shape (function toStandingOrderPromptRow().

 * Purpose: Supports maintainability by documenting why `toStandingOrderPromptRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function toStandingOrderPromptRow(
  row: StandingOrderRow,
  unitTypeById: Map<string, string>,
  coordinateContext: CoordinateContext,
  resolveToH3: (lat: number, lng: number) => string | undefined,
  unitH3: string | undefined,
  enemyH3s: readonly string[]
): StandingOrderPromptRow {
  const params = parseOrderParams(row);
  const computed = parseComputedRoute(row);
  const nextMove = computed?.nextMoveHex;
  const turnsRemaining = Number(computed?.turnsRemaining ?? 0);
  let destination = '—';
  if (row.order_type === 'march' && params.destination) {
    destination = latLngTupleToBriefingHexDisplay(params.destination as [number, number], coordinateContext, resolveToH3);
  }
  if (row.order_type === 'defend' && params.defendHex) {
    destination = latLngTupleToBriefingHexDisplay(params.defendHex as [number, number], coordinateContext, resolveToH3);
  }
  if (row.order_type === 'pursue' && params.targetUnitId) {
    destination = String(params.targetUnitId);
  }
  let nextMoveText = '—';
  let turnsRemainingText: string | number = '—';
  if (turnsRemaining > 0 && nextMove) {
    nextMoveText = latLngTupleToBriefingHexDisplay(nextMove as [number, number], coordinateContext, resolveToH3);
    turnsRemainingText = turnsRemaining;
  } else if (row.status === 'en_route' || row.status === 'closing') {
    if (nextMove) {
      nextMoveText = latLngTupleToBriefingHexDisplay(nextMove as [number, number], coordinateContext, resolveToH3);
    } else {
      nextMoveText = 'pending route refresh';
    }
    turnsRemainingText = 'pending';
  }
  const receding = standingOrderRowRecedesFromEnemy(row, unitTypeById.get(row.unit_id), unitH3, enemyH3s, resolveToH3);
  return {
    unitId: row.unit_id,
    unitType: unitTypeById.get(row.unit_id) ?? '—',
    orderType: row.order_type.toUpperCase(),
    destination,
    status: row.status,
    nextMove: nextMoveText,
    turnsRemaining: turnsRemainingText,
    attention: WARNING_STATUSES.has(row.status) || receding ? 'yes' : 'no',
  };
}

/**
 * True when this standing-order row's next step increases hop distance to the nearest enemy.
 *
 * Purpose: Attention column must flag receding marches, not only stalled statuses.
 * When to use: `toStandingOrderPromptRow` after next-move and destination text are computed.
 * Expected outcome: False for air units, non-march/pursue orders, and unmeasurable geometry.
 * Exceptions: None.
 */
function standingOrderRowRecedesFromEnemy(
  row: StandingOrderRow,
  unitType: string | undefined,
  unitH3: string | undefined,
  enemyH3s: readonly string[],
  resolveToH3: (lat: number, lng: number) => string | undefined
): boolean {
  if (unitType === 'air' || !unitH3) return false;
  if (row.order_type !== 'march' && row.order_type !== 'pursue') return false;
  const enemyH3 = nearestObservedEnemyH3(unitH3, enemyH3s);
  if (!enemyH3) return false;
  const computed = parseComputedRoute(row);
  const nextMove = computed?.nextMoveHex;
  const params = parseOrderParams(row);
  const dest = Array.isArray(params.destination) ? (params.destination as [number, number]) : null;
  const stepLl = (Array.isArray(nextMove) ? nextMove : dest) as [number, number] | null;
  if (!stepLl || stepLl.length < 2) return false;
  const stepH3 = resolveToH3(Number(stepLl[0]), Number(stepLl[1]));
  if (!stepH3) return false;
  return marchStepRecedesFromEnemy(unitH3, stepH3, enemyH3);
}

/**
 * Builds the strategic Standing Order Status briefing block for the opponent AI.
 *
 * Purpose: Injects parent-unit standing-order tables into strategic Commander prompts only. Arrived marches are expired first so completed missions are not listed as active.
 * When to use: Strategic `formatBriefing` / `buildSystemPromptForTools` when Orders tools are enabled.
 * Expected outcome: Markdown `# Standing Order Status` (+ units without orders); empty string in tactical mode. Units already at their march destination appear under Units Without Standing Orders, each with a suggested closing destination so the model does not have to join that table against Best Options to find one.
 * Exceptions: None.
 */
export function getInjectionText(
  playerId: string,
  state: GameStateSnapshot,
  coordinateContext?: CoordinateContext
): string {
  const ctx: CoordinateContext = coordinateContext ?? { mode: 'strategic' };
  if (ctx.mode === 'tactical') {
    logDebug('standingOrders getInjectionText: omitted in tactical mode', {
      playerId,
      battleId: ctx.battleId ?? null,
    });
    return '';
  }
  expireAndUpdateStatus(playerId, state);
  ensureStrategicCoordinateRegistryInitialized();
  logDebug('standingOrders getInjectionText', {
    playerId,
    turnNumber: state.turnNumber,
    coordinateMode: ctx.mode,
  });

  const hexList = state.hexes.map((h) => h.h3Index);
  const { resolveToH3 } = buildLatLngCoordinateMap(hexList);
  logTrace('standingOrders getInjectionText: map context', { hexCount: hexList.length });

  const rows = dbGetAll<StandingOrderRow>(
    'SELECT * FROM standing_orders WHERE player_id = ? ORDER BY unit_id',
    [playerId]
  );
  const aiUnits = state.units.filter((u) => u.player === playerId);
  const aiUnitIds = aiUnits.map((u) => u.id);
  const aiUnitTypeById = new Map(aiUnits.map((u) => [u.id, u.unitType]));

  const lines: string[] = [];
  lines.push(topLevelHeading(SECTION_TITLE_STANDING_ORDER_STATUS));
  lines.push('');

  const aiUnitIdSet = new Set(aiUnitIds);
  const unitIdsWithOrders = new Set(rows.map((r) => r.unit_id));
  const unitIdsWithoutOrders = aiUnitIds.filter((id) => !unitIdsWithOrders.has(id));
  const unitH3ById = new Map(aiUnits.map((u) => [u.id, u.h3Index]));
  const enemyH3s = state.units.filter((u) => u.player !== playerId).map((u) => u.h3Index);

  const standingOrderRows = rows
    .filter((row) => aiUnitIdSet.has(row.unit_id))
    .map((row) =>
      toStandingOrderPromptRow(
        row,
        aiUnitTypeById,
        ctx,
        resolveToH3,
        unitH3ById.get(row.unit_id),
        enemyH3s
      )
    )
    .map((row) => [
      row.unitId,
      row.unitType,
      row.orderType,
      row.destination,
      row.status,
      row.nextMove,
      row.turnsRemaining,
      row.attention,
    ]);
  lines.push(
    ...buildPromptTableLines(
      ['Unit ID', 'Unit Type', 'Order Type', 'Destination / Target', 'Status', 'Next Move', 'Turns Remaining', 'Attention'],
      standingOrderRows,
      ['—', '—', '—', '—', '—', '—', '—', '—']
    )
  );
  lines.push('');
  lines.push('## Units Without Standing Orders');
  lines.push('');
  const suggestedDestinations = suggestApproachDestinationsForOrderlessUnits(
    playerId,
    state,
    unitIdsWithoutOrders
  );
  const withoutOrderHeaders = ['Unit ID', 'Unit Type', 'Suggested Destination'];
  const withoutOrderBlanks = ['—', '—', '—'];
  const withoutOrderRows = unitIdsWithoutOrders.map((unitId) => {
    const suggestion = suggestedDestinations.get(unitId);
    return [
      unitId,
      aiUnitTypeById.get(unitId) ?? '—',
      suggestion ? h3ToBriefingHexDisplay(suggestion, ctx) : '—',
    ];
  });
  lines.push(
    ...buildPromptTableLines(
      withoutOrderHeaders,
      aiUnitIds.length === 0 ? [] : withoutOrderRows,
      withoutOrderBlanks
    )
  );
  return lines.join('\n');
}
