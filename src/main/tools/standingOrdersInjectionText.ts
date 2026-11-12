import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { dbGetAll } from '../gameDb';
import { buildLatLngCoordinateMap } from '../mapData';
import { logDebug, logTrace } from '../logger';
import type { CoordinateContext } from '../briefing/map/coordinateContext';
import { ensureStrategicCoordinateRegistryInitialized } from '../briefing/map/hexCoordinates';
import { h3ToCode } from '../briefing/map/hexCodeTranslator';
import { buildPromptTableLines } from '../promptTableHelpers';
import {
  SECTION_TITLE_CAMPAIGN_ORDERS,
  SECTION_TITLE_STANDING_ORDER_STATUS,
  SECTION_TITLE_UNITS_WITHOUT_STANDING_ORDERS,
  subHeading,
  topLevelHeading,
} from '../openRouter/promptSpec/sectionHeadings';
import {
  parseComputedRoute,
  parseOrderParams,
  STANDING_ORDER_WARNING_STATUSES,
  type StandingOrderRow,
} from './standingOrdersShared';
import {
  collectOrderlessMissionContext,
  type OrderlessMissionSuggestion,
} from './orderlessUnitSuggestions';
import { expireAndUpdateStatus } from './standingOrdersGeneration';
import { campaignOrderFor, type CampaignPlan } from '../openRouter/campaignRules';
import { marchStepRecedesFromEnemy, nearestObservedEnemyH3 } from './standingMarchReceding';

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
    attention: STANDING_ORDER_WARNING_STATUSES.has(row.status) || receding ? 'yes' : 'no',
  };
}

/**
 * True when this standing-order row's next step increases hop distance to the nearest enemy.
 *
 * Purpose: Attention column must flag receding marches and defend walk-backs, not only stalled statuses.
 * When to use: `toStandingOrderPromptRow` after next-move and destination text are computed.
 * Expected outcome: False for air units, orders other than march, pursue, and defend, a defend order that is not `en_route`, a defend order with no stored next step, and unmeasurable geometry.
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
  if (row.order_type !== 'march' && row.order_type !== 'pursue' && row.order_type !== 'defend') return false;
  if (row.order_type === 'defend' && row.status !== 'en_route') return false;
  const enemyH3 = nearestObservedEnemyH3(unitH3, enemyH3s);
  if (!enemyH3) return false;
  const computed = parseComputedRoute(row);
  const nextMove = computed?.nextMoveHex;
  const params = parseOrderParams(row);
  const dest =
    row.order_type === 'defend'
      ? null
      : Array.isArray(params.destination)
        ? (params.destination as [number, number])
        : null;
  const stepLl = (Array.isArray(nextMove) ? nextMove : dest) as [number, number] | null;
  if (!stepLl || stepLl.length < 2) return false;
  const stepH3 = resolveToH3(Number(stepLl[0]), Number(stepLl[1]));
  if (!stepH3) return false;
  return marchStepRecedesFromEnemy(unitH3, stepH3, enemyH3);
}

/**
 * Renders one Suggested Destination cell.
 *
 * Purpose: A march and a defend order share one column, and the coaching text tells the model to read the shape of
 * the cell rather than guess. A bare hex is a march. `defend` plus a hex is defend. An em dash means no mission.
 * When to use: Each orderless row inside `getInjectionText`.
 * Expected outcome: The briefing hex, `defend` and that hex separated by one space, or `—`.
 * Exceptions: `h3ToBriefingHexDisplay` throws when the hex has no briefing code. That is a registry failure, not a missing mission.
 */
function suggestedDestinationCell(
  suggestion: OrderlessMissionSuggestion | undefined,
  coordinateContext: CoordinateContext
): string {
  if (!suggestion) return '—';
  const code = h3ToBriefingHexDisplay(suggestion.destinationH3, coordinateContext);
  return suggestion.orderType === 'defend' ? `defend ${code}` : code;
}

/**
 * Builds the strategic Standing Order Status briefing block for the opponent AI.
 *
 * Purpose: Injects parent-unit standing-order tables into strategic Commander prompts only. Arrived marches are expired first so completed missions are not listed as active.
 * When to use: Strategic `formatBriefing` / `buildSystemPromptForTools` when Orders tools are enabled.
 * Expected outcome: Markdown `# Standing Order Status` (+ units without orders); empty string in tactical mode. Units already at their march destination appear under Units Without Standing Orders. Suggested Destination is a bare briefing hex for a march, `defend` plus that hex for a striking air unit, or an em dash when no mission was chosen.
 * Exceptions: None.
 */
export function getInjectionText(
  playerId: string,
  state: GameStateSnapshot,
  coordinateContext?: CoordinateContext,
  /**
   * The consult's campaign plan.
   *
   * Contract: Omitted or null keeps today's suggested destinations.
   * When to use: Strategic consults that resolved a campaign.
   * Expected outcome: Orderless campaign units are offered the campaign order.
   * Exceptions: None.
   */
  campaignPlan?: CampaignPlan | null
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
  lines.push(subHeading(SECTION_TITLE_UNITS_WITHOUT_STANDING_ORDERS));
  lines.push('');
  const suggestedDestinations = collectOrderlessMissionContext({
    playerId,
    state,
    orderlessUnitIds: unitIdsWithoutOrders,
    campaignPlan,
  }).suggestions;
  const withoutOrderHeaders = ['Unit ID', 'Unit Type', 'Suggested Destination'];
  const withoutOrderBlanks = ['—', '—', '—'];
  const withoutOrderRows = unitIdsWithoutOrders.map((unitId) => [
    unitId,
    aiUnitTypeById.get(unitId) ?? '—',
    suggestedDestinationCell(suggestedDestinations.get(unitId), ctx),
  ]);
  lines.push(
    ...buildPromptTableLines(
      withoutOrderHeaders,
      aiUnitIds.length === 0 ? [] : withoutOrderRows,
      withoutOrderBlanks
    )
  );
  if (campaignPlan) {
    const campaignRows = buildCampaignOrderRows({ playerId, state, plan: campaignPlan, coordinateContext: ctx });
    lines.push('');
    lines.push(subHeading(SECTION_TITLE_CAMPAIGN_ORDERS));
    lines.push('');
    lines.push(
      ...buildPromptTableLines(
        ['Unit ID', 'Unit Type', 'Current Order', 'Campaign Order'],
        campaignRows.map((row) => [row.unitId, row.unitType, row.currentOrder, row.campaignOrder]),
        ['—', '—', '—', '—']
      )
    );
  }
  return lines.join('\n');
}

/**
 * One unit whose standing order does not match the campaign.
 *
 * Purpose: The Campaign Orders table and the attention count share one row shape.
 * When to use: The value of `buildCampaignOrderRows`.
 * Expected outcome: `campaignOrder` is the order to copy. `currentOrder` is what is stored now.
 * Exceptions: None.
 */
export interface CampaignOrderRow {
  /**
   * Unit the row orders.
   *
   * Contract: A campaign unit, or a home defender still marching on the campaign, that exists on the snapshot.
   * When to use: The Unit ID column.
   * Expected outcome: An id the model can put in assign_order.
   * Exceptions: None.
   */
  readonly unitId: string;
  /**
   * The unit's type.
   *
   * Contract: The snapshot type, such as infantry or armor.
   * When to use: The Unit Type column.
   * Expected outcome: The same type the roster uses.
   * Exceptions: None.
   */
  readonly unitType: string;
  /**
   * The standing order that is stored now.
   *
   * Contract: The order type plus its hex or pursue target when one is stored.
   * When to use: The Current Order column.
   * Expected outcome: A short label, not a second decoder of the route.
   * Exceptions: None.
   */
  readonly currentOrder: string;
  /**
   * The order the campaign wants.
   *
   * Contract: `march` or `defend` plus the briefing hex. A recalled home defender gets `defend` on its own hex.
   * When to use: The Campaign Order column.
   * Expected outcome: The text the model copies into assign_order.
   * Exceptions: None.
   */
  readonly campaignOrder: string;
}

/**
 * The order that recalls a home defender still marching on the campaign.
 *
 * Purpose: A unit sent toward the campaign can become a home defender later. Its old march would carry it away from home, so Campaign Orders tells it to stay.
 * When to use: `buildCampaignOrderRows`, for a unit that `campaignOrderFor` does not cover.
 * Expected outcome: Defend on the unit's hex when the unit is a home defender and its stored order is a march to the campaign target or staging hex. Otherwise null, so a defender's other orders are left alone.
 * Exceptions: None.
 */
function homeDefenderRecallOrder(args: {
  readonly plan: CampaignPlan;
  readonly unitId: string;
  readonly unitH3: string;
  readonly storedOrderType: string;
  readonly storedH3: string | undefined;
}): { readonly orderType: 'defend'; readonly destinationH3: string } | null {
  const { objective } = args.plan;
  const marchingOnCampaign =
    args.storedOrderType === 'march' &&
    args.storedH3 !== undefined &&
    (args.storedH3 === objective.targetH3 || args.storedH3 === objective.stagingH3);
  const recall = marchingOnCampaign && args.plan.defenderUnitIds.includes(args.unitId);
  logTrace('standingOrders homeDefenderRecallOrder', { unitId: args.unitId, recall });
  return recall ? { orderType: 'defend', destinationH3: args.unitH3 } : null;
}

/**
 * Lists campaign units whose stored standing order differs from the campaign order, and home defenders still marching on the campaign.
 *
 * Purpose: Units that already hold the campaign order must not be told to change it.
 * When to use: After `expireAndUpdateStatus`, from the standing-order injection and the attention count.
 * Expected outcome: One row per differing campaign order, and one `defend` row per home defender whose stored march goes to the target or staging hex. Units with no standing order are absent. An empty list means nothing needs to change.
 * Exceptions: None. A missing unit is skipped.
 */
export function buildCampaignOrderRows(args: {
  readonly playerId: string;
  readonly state: GameStateSnapshot;
  readonly plan: CampaignPlan;
  readonly coordinateContext: CoordinateContext;
}): CampaignOrderRow[] {
  const rows = dbGetAll<StandingOrderRow>('SELECT * FROM standing_orders WHERE player_id = ? ORDER BY unit_id', [
    args.playerId,
  ]);
  const { resolveToH3 } = buildLatLngCoordinateMap(args.state.hexes.map((hex) => hex.h3Index));
  const unitsById = new Map(args.state.units.map((unit) => [unit.id, unit]));
  const result: CampaignOrderRow[] = [];
  for (const row of rows) {
    const unit = unitsById.get(row.unit_id);
    if (!unit) continue;
    const params = parseOrderParams(row);
    const stored = row.order_type === 'march' ? params.destination : row.order_type === 'defend' ? params.defendHex : undefined;
    const storedH3 =
      Array.isArray(stored) && stored.length >= 2 ? resolveToH3(Number(stored[0]), Number(stored[1])) : undefined;
    const desired =
      campaignOrderFor(args.plan, { id: unit.id, h3Index: unit.h3Index }) ??
      homeDefenderRecallOrder({
        plan: args.plan,
        unitId: unit.id,
        unitH3: unit.h3Index,
        storedOrderType: row.order_type,
        storedH3,
      });
    if (desired === null) continue;
    if (row.order_type === desired.orderType && storedH3 === desired.destinationH3) continue;
    const currentTarget =
      storedH3 !== undefined
        ? ` ${h3ToBriefingHexDisplay(storedH3, args.coordinateContext)}`
        : row.order_type === 'pursue' && params.targetUnitId
          ? ` ${String(params.targetUnitId)}`
          : '';
    result.push({
      unitId: unit.id,
      unitType: unit.unitType,
      currentOrder: `${row.order_type}${currentTarget}`,
      campaignOrder: `${desired.orderType} ${h3ToBriefingHexDisplay(desired.destinationH3, args.coordinateContext)}`,
    });
  }
  logTrace('standingOrders buildCampaignOrderRows', { playerId: args.playerId, rowCount: result.length });
  return result;
}
