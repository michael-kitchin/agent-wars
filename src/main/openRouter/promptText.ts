import type { GameStateSnapshot } from '../gameDb';
import { activeGameMap } from '../../shared/activeGameMap';
import { computeRoundedPercentage } from '../../shared/progressFormatting';
import { getValidDestinations } from '../oneStepMoveDestinations';
import { canManualDebarkAtHex } from '../../shared/sealiftEmbarkEligibility';
import { logDebug, logTrace } from '../logger';
import { buildToolsIntroCopySentence } from './promptSpec/optionCopyText';
import { buildOpeningUserMessage } from './promptSpec/consultationText';
import { SECTION_TITLE_TOOL_USAGE_GUIDANCE, subHeading } from './promptSpec/sectionHeadings';

export { buildProductionSubmitClause } from './promptSpec/productionSubmitText';

/**
 * Documents the `PromptToolFlags` interface as a named contract surface (export interface PromptToolFlags).

 * Purpose: Supports maintainability by documenting why `PromptToolFlags` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface PromptToolFlags {
    /**
   * Specifies the contract for the `planningEnabled` member (planningEnabled: boolean;).

   * Contract: Describes stable behavior for callers of `planningEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
planningEnabled: boolean;
    /**
   * Specifies the contract for the `assessmentEnabled` member (assessmentEnabled: boolean;).

   * Contract: Describes stable behavior for callers of `assessmentEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
assessmentEnabled: boolean;
    /**
   * Specifies the contract for the `estimationEnabled` member (estimationEnabled: boolean;).

   * Contract: Describes stable behavior for callers of `estimationEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
estimationEnabled: boolean;
    /**
   * Specifies the contract for the `memoryEnabled` member (memoryEnabled: boolean;).

   * Contract: Describes stable behavior for callers of `memoryEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
memoryEnabled: boolean;
    /**
   * Specifies the contract for the `ordersEnabled` member (ordersEnabled: boolean;).

   * Contract: Describes stable behavior for callers of `ordersEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
ordersEnabled: boolean;
    /**
   * Specifies the contract for the `productionEnabled` member (productionEnabled: boolean;).

   * Contract: Describes stable behavior for callers of `productionEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
productionEnabled: boolean;
    /**
   * Specifies the contract for the `fallbackMovementEnabled` member (fallbackMovementEnabled: boolean;).

   * Contract: Describes stable behavior for callers of `fallbackMovementEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
fallbackMovementEnabled: boolean;
}

/**
 * Sentence appended when memory is on and the consult has no planning tools.
 *
 * Purpose: Those returns are the only place this sentence is taught, so the example must include content and tier.
 * When to use: Concatenated onto the orders-only and fallback returns of `getMovementOrderInstruction`.
 * Expected outcome: The model sees a write that names key, tier, and content. Planning returns do not append this.
 * Exceptions: None.
 */
const MOVEMENT_INSTRUCTION_MEMORY_SUFFIX =
  ' Include a memoryUpdates entry (e.g. write key "turn_objectives" tier "persistent" content "this turn\'s objectives") in your final JSON to record your plan.';

/**
 * Opening geography clause for strategic AI prompts.
 *
 * Purpose: The model must be told which map is loaded and which strategic H3 resolution that map uses.
 * When to use: `buildSystemPromptForTools` when the consultation is strategic.
 * Expected outcome: `Global Earth map` at `strategicResolution` when the profile id is `global`. Any other map is named by `displayName` at that same field. The second paragraph still forbids raw H3 and latitude/longitude.
 * Exceptions: None.
 */
export function buildLatLngPreamble(): string {
  const map = activeGameMap();
  const label = map.id === 'global' ? 'Global Earth map' : map.displayName;
  logDebug('promptText buildLatLngPreamble', {
    id: map.id,
    label,
    strategicResolution: map.strategicResolution,
  });
  return `${label}, H3 resolution ${map.strategicResolution}. Positions are two-character briefing hex codes (A–Z and 0–9) from the operational map and Unit Status table — copy exactly; never invent codes. Distances are hex counts where shown.

Final JSON: use briefing hex codes for cells; standing-order pursue uses enemy unit id (targetUnitId). Never emit raw H3 strings or latitude/longitude pairs.`;
}

/**
 * Opening geography clause for tactical AI prompts.
 *
 * Purpose: Avoids claiming a global strategic context when the operational map is the battle footprint.
 * When to use: `buildSystemPromptForTools` when `coordinateContext.mode === 'tactical'`.
 * Expected outcome: Two-character tactical codes and adjacency semantics aligned with the tactical operational map section. Cells beyond a regional map's edge are named as outside the battle.
 * Exceptions: None.
 */
export function buildTacticalLatLngPreamble(decimalPlaces: number): string {
  void decimalPlaces;
  return `Tactical battle map: the enclosing strategic hex's tactical cells plus up to three neighboring rings (cells beyond a regional map's edge are not part of the battle). Positions are two-character tactical briefing hex codes (A–Z and 0–9) from the operational map and Unit Status table — copy exactly; never invent codes. Distances are tactical hex steps where shown.

Final JSON: use tactical briefing hex codes for cells and enemy sub-unit ids for targetUnitId. Never emit raw H3 strings or latitude/longitude pairs.`;
}

/**
 * Defines the `formatControlProgressLine` function shape (export function formatControlProgressLine(label: string, controlled: number, total: number, subjectLabel = 'hexes'): string).

 * Purpose: Supports maintainability by documenting why `formatControlProgressLine` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function formatControlProgressLine(label: string, controlled: number, total: number, subjectLabel = 'hexes'): string {
  return `- ${label}: ${controlled} of ${total} ${subjectLabel} (${computeRoundedPercentage(controlled, total)}%)`;
}

/**
 * Defines the `formatLatLng` function shape (export function formatLatLng(ll: [number, number], decimalPlaces: number): string).

 * Purpose: Supports maintainability by documenting why `formatLatLng` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function formatLatLng(ll: [number, number], decimalPlaces: number): string {
  return `[${ll[0].toFixed(decimalPlaces)}, ${ll[1].toFixed(decimalPlaces)}]`;
}

/**
 * Roster and options-table gates for the Available Tools intro paragraph.
 *
 * Purpose: Air/ferry copy and options-table copy must match the rest of the prompt.
 * When to use: Fourth argument to `buildAvailableToolsIntro`.
 * Expected outcome: Omitted fields default to air-present and table-present-iff-briefing.
 * Exceptions: None.
 */
export interface ToolsIntroRosterGates {
  /**
   * Whether the opponent roster includes an air unit.
   *
   * Contract: False omits ferry and air-strike copy clauses.
   * When to use: From the same air check as the envelope.
   * Expected outcome: Defaults to true when omitted so older callers keep ferry copy.
   * Exceptions: None.
   */
  readonly hasAirUnits?: boolean;
  /**
   * Whether the briefing includes a Best Options table with rows.
   *
   * Contract: False replaces copy-row wording with the routing-tool instruction.
   * When to use: True only when the briefing contains the Best Options heading.
   * Expected outcome: Defaults to `hasPrecomputedBriefing` when omitted.
   * Exceptions: None.
   */
  readonly hasBestOptionsTable?: boolean;
}

/**
 * Separates the "Never copy" sentence from the Best Options copy sentence.
 *
 * Purpose: The tools intro gives that warning its own paragraph, matching the reading breaks before the numbered list.
 * When to use: A briefing intro that includes `buildToolsIntroCopySentence`.
 * Expected outcome: `lead` ends at "per action." `neverCopy` is the following sentence, or empty when that sentence is absent.
 * Exceptions: None.
 */
function splitNeverCopySentence(copy: string): { readonly lead: string; readonly neverCopy: string } {
  logTrace('promptText splitNeverCopySentence', { length: copy.length });
  const marker = ' Never copy a Target Hex';
  const at = copy.indexOf(marker);
  if (at < 0) return { lead: copy, neverCopy: '' };
  return { lead: copy.slice(0, at), neverCopy: copy.slice(at + 1) };
}

/**
 * Builds the intro sentence above the numbered `# Available Tools` list.
 *
 * Purpose: Tells the model when to rely on the briefing and when to call tools, naming only tools it can call.
 * When to use: `buildSystemPromptForTools` after computing flags, briefing presence, and roster gates.
 * Expected outcome: A generic "listed tools only" line when neither planning nor assessment is enabled; otherwise
 * mode- and briefing-specific guidance, with a blank line between paragraphs and before the numbered list.
 * A strategic briefing with standing-order tools on says standing-order status
 * is already present and limits `query_orders` to a rare detail. Battle intros name `plan_route` only when planning is on.
 * Exceptions: None.
 */
export function buildAvailableToolsIntro(
  flags: PromptToolFlags,
  hasPrecomputedBriefing = false,
  coordinateMode: 'strategic' | 'tactical' = 'strategic',
  roster: ToolsIntroRosterGates = {}
): string {
  const hasAirUnits = roster.hasAirUnits !== false;
  const hasBestOptionsTable = roster.hasBestOptionsTable ?? hasPrecomputedBriefing;
  logDebug('promptText buildAvailableToolsIntro', {
    coordinateMode,
    hasPrecomputedBriefing,
    hasBestOptionsTable,
    ordersEnabled: flags.ordersEnabled,
    memoryEnabled: flags.memoryEnabled,
    productionEnabled: flags.productionEnabled,
  });
  const toolsIntroPurpose = flags.planningEnabled
    ? 'plan movement and assess the battlefield'
    : flags.assessmentEnabled
      ? 'assess the tactical situation'
      : undefined;
  if (!toolsIntroPurpose) {
    return 'Use only the tools listed below. Do not call tools that are not in the list.\n';
  }
  if (!hasPrecomputedBriefing) {
    return (
      `Use these tools to ${toolsIntroPurpose} before submitting orders. You may use multiple rounds of tool calls and mix tool types if that helps.` +
      (flags.memoryEnabled ? ' Memory: use memory_read as needed; persist notes via memoryUpdates in your final JSON.' : '') +
      '\n'
    );
  }
  if (coordinateMode === 'tactical') {
    const briefingLead = 'Use the Commander\'s Briefing in the situation message for assessments and possible unit actions.';
    const { lead, neverCopy } = splitNeverCopySentence(
      buildToolsIntroCopySentence({ coordinateMode: 'tactical', hasAirUnits })
    );
    const paragraphs = [
      `${briefingLead} When Best Options This Turn lists a target for a sub-unit, copy it and do not call plan_route for it. When it lists none, call plan_route or leave the sub-unit idle. ${lead}`,
      neverCopy,
    ];
    if (!flags.planningEnabled) {
      return `${briefingLead} ${lead}\n\n${neverCopy}\n`;
    }
    return `${paragraphs.filter((paragraph) => paragraph.length > 0).join('\n\n')}\n`;
  }
  const selectiveTools: string[] = [];
  if (flags.memoryEnabled) selectiveTools.push('memory lookup (memory_read)');
  if (flags.productionEnabled) selectiveTools.push('production queue checks/sets');
  const paragraphs: string[] = [];
  const { lead, neverCopy } = splitNeverCopySentence(
    buildToolsIntroCopySentence({ coordinateMode: 'strategic', hasAirUnits })
  );
  const copyLead = flags.planningEnabled
    ? `When Best Options This Turn lists a target for a unit, copy it and do not call plan_route for it. When it lists none, call plan_route or leave the unit idle. ${lead}`
    : lead;
  paragraphs.push(
    `Use the Commander's Briefing in the situation message for assessments and possible unit actions. ${copyLead}`,
    neverCopy
  );
  if (flags.ordersEnabled) {
    paragraphs.push('Standing-order status is already in the briefing; call query_orders only for a rare detail.');
  }
  if (selectiveTools.length > 0) {
    paragraphs.push(`Use tools selectively for ${selectiveTools.join(' and ')} when needed.`);
  }
  return `${paragraphs.filter((paragraph) => paragraph.length > 0).join('\n\n')}\n`;
}

/**
 * Builds the tool-mechanic bullets.
 *
 * Purpose: The HOW TO USE header owns tool mechanics. Coaching lives in Orders Guidance.
 * When to use: `buildSystemPromptForTools` after computing flags and briefing presence.
 * Expected outcome: Markdown bullets under `## How to Use These Tools Effectively`. The briefing lines point at the situation message.
 * Exceptions: None.
 */
export function buildToolUsageGuidance(
  flags: PromptToolFlags,
  hasPrecomputedBriefing = false,
  coordinateMode: 'strategic' | 'tactical' = 'strategic'
): string {
  logDebug('promptText buildToolUsageGuidance', {
    coordinateMode,
    hasPrecomputedBriefing,
  });
  const lines: string[] = [];
  if (hasPrecomputedBriefing) {
    lines.push(
      coordinateMode === 'tactical'
        ? '- The Commander\'s Briefing in the situation message already contains unit status, attention flags, and possible unit actions for this tactical beat. Use the briefing to decide targets and priorities.'
        : '- The Commander\'s Briefing in the situation message already contains unit status, attention flags, possible unit actions, and supplemental hex intelligence for this turn. Use the briefing to decide targets and priorities.'
    );
    if (coordinateMode === 'tactical' && flags.assessmentEnabled) {
      lines.push('- assess_unit is optional. Call it only when the briefing does not show what that sub-unit can reach or shoot. On a shared cell, assess one sub-unit per parent.');
    }
  } else {
    if (flags.ordersEnabled || flags.memoryEnabled) {
      lines.push('- Start by reviewing your standing order statuses and persistent strategic memory (both are in the situation message).');
    }
    if (flags.assessmentEnabled) {
      lines.push('- assess_unit is optional. Call it only when you cannot tell what that unit can reach or shoot.');
    }
    if (flags.planningEnabled) {
      lines.push('- Use plan_route to understand multi-turn moves before issuing orders.');
    }
  }
  lines.push(
    '- Batch independent tool calls: when you need the same tool for several units or hexes, request all of those calls together in one reply as parallel tool calls instead of one call per reply. Wait for a result only when the next call\'s arguments depend on it.'
  );
  if (flags.memoryEnabled && coordinateMode !== 'tactical') {
    lines.push(
      '- memoryUpdates / tiers: "persistent" entries appear in every briefing (limit 5); "stored" are retrieved via memory_read (limit 15).'
    );
  }
  if (flags.productionEnabled && coordinateMode !== 'tactical') {
    lines.push(
      '- Production: use query_production to inspect controlled-hex queues and constraints; use set_build_queue to set one unit type/count for a queue (this replaces existing queue entries). If skipping tools, you may include productionOrders in final JSON.'
    );
  }
  if (lines.length === 0) return '';
  return '\n\n' + subHeading(SECTION_TITLE_TOOL_USAGE_GUIDANCE) + '\n\n' + lines.join('\n');
}

/**
 * Lists one-step move hexes for the mode with no planning tools and no standing orders.
 *
 * Purpose: That mode's only destination list must not offer the unit's current cell. An explicit_move there is ignored as already arrived, so staying is omitting the order.
 * When to use: When `fallbackMovementEnabled` is true, from the system-prompt builder.
 * Expected outcome: One line per own unit. A line with neighbours says `move to:` those codes and tells the model to omit explicit_move to stay. A line with none says to omit explicit_move. Naval cargo that cannot debark lists no neighbour. Air cargo is unchanged. Empty when no unit has a coordinate.
 * Exceptions: None.
 */
export function buildAdjacentCellsFallbackBlock(
  state: GameStateSnapshot,
  opponentUnits: { id: string; h3Index: string; unitType: string }[],
  coordMap: { latLngByH3: Map<string, [number, number]>; format: (h3: string) => string },
  getValidDestinationsUnoccupied: (unit: { h3Index: string; unitType: string }, state: GameStateSnapshot) => string[]
): string {
  logDebug('promptText buildAdjacentCellsFallbackBlock', { unitCount: opponentUnits.length });
  const { latLngByH3, format } = coordMap;
  const occupied = new Set(state.units.map((row) => row.h3Index));
  const lines: string[] = [];
  for (const u of opponentUnits.filter((unit) => latLngByH3.has(unit.h3Index))) {
    const current = format(u.h3Index);
    const snapshotUnit = state.units.find((row) => row.id === u.id);
    const assumeDebarkedForReachability = !!snapshotUnit?.embarkedOnCarrierUnitId;
    const carrier = snapshotUnit?.embarkedOnCarrierUnitId
      ? state.units.find((row) => row.id === snapshotUnit.embarkedOnCarrierUnitId)
      : undefined;
    const hex = state.hexes.find((row) => row.h3Index === u.h3Index);
    const seaportCount =
      (state.strategicInfrastructure ?? []).find((row) => row.h3Index === u.h3Index)?.seaportCount ?? 0;
    const controlled =
      (state.strategicControl ?? []).find((row) => row.h3Index === u.h3Index)?.controllerPlayerId ===
      snapshotUnit?.player;
    const navalCargoStaysAboard =
      carrier?.unitType === 'naval' &&
      (!hex ||
        !canManualDebarkAtHex({
          nativeTerrain: hex.terrain,
          terrainKind: hex.terrainKind,
          hasSeaport: Number(seaportCount) > 0,
          hexControlledByPlayer: controlled,
        }));
    const dests = (
      navalCargoStaysAboard
        ? []
        : assumeDebarkedForReachability
          ? getValidDestinations(
              { id: u.id, h3Index: u.h3Index, unitType: u.unitType },
              state,
              { assumeDebarkedForReachability: true }
            )
          : getValidDestinationsUnoccupied(u, state)
    )
      .filter((h3) => h3 === u.h3Index || !occupied.has(h3))
      .filter((h3) => latLngByH3.has(h3))
      .map((h3) => format(h3));
    const moves = dests.filter((code) => code !== current);
    const cells = moves.length
      ? `move to: ${moves.join(', ')}. Omit explicit_move to stay.`
      : 'Omit explicit_move to stay. No empty adjacent cell is listed.';
    lines.push(`${u.id}: ${cells}`);
  }
  if (lines.length === 0) return '';
  return `\nAdjacent cells (fallback for one-step moves when no planning/orders tools are available; prefer plan_route or standing orders when enabled):\n${lines.join('\n')}\n`;
}

/**
 * Builds the JSON-contract sentence that tells the model how to fill explicit_move.destination.

 * Purpose: When planning tools are on and a briefing is present, approach/move/melee dests may be copied from Best Options This Turn Target Hexes into explicit_move, or from plan_route orderToHexCode. Without a briefing, dests come from plan_route only.
 * When to use: `buildFinalJsonContractInstruction` after computing tool flags.
 * Expected outcome: One or more sentences appended to the final JSON schema block. Tactical mode tells the model which hex code to copy. The first-leg clamp stays in the combat rules. The fallback sentence tells the model to copy a listed move hex and to omit explicit_move to stay.
 * Exceptions: None.
 */
export function getMovementOrderInstruction(
  flags: PromptToolFlags,
  /**
   * When `tactical`, appends march reachability guidance so explicit_move rows match terrain-weighted tactical validation (same checks as Ready commit).
   */
  coordinateMode: 'strategic' | 'tactical' = 'strategic',
  /**
   * When false, this consultation has no briefing, so a destination comes from plan_route.
   * When true, a listed Best Options target is copied, and plan_route covers a destination the table does not list.
   * Whether that table has rows does not change this sentence.
   */
  hasPrecomputedBriefing = true
): string {
  logDebug('promptText getMovementOrderInstruction', {
    planningEnabled: flags.planningEnabled,
    ordersEnabled: flags.ordersEnabled,
    fallbackMovementEnabled: flags.fallbackMovementEnabled,
    coordinateMode,
    hasPrecomputedBriefing,
  });
  const memorySuffix = flags.memoryEnabled ? MOVEMENT_INSTRUCTION_MEMORY_SUFFIX : '';
  const tacticalMarchReachabilityClause =
    coordinateMode === 'tactical'
      ? hasPrecomputedBriefing
        ? " Copy a Best Options This Turn approach or move/melee Target Hex for that unit, or plan_route's orderToHexCode, not a guessed adjacent code."
        : " Copy plan_route's orderToHexCode exactly, not a guessed adjacent code."
      : '';
  if (flags.planningEnabled) {
    if (!hasPrecomputedBriefing) {
      return (
        ' For each explicit_move entry: set "destination" to the exact orderToHexCode from that unit\'s plan_route result (copy the two-character code exactly).' +
        tacticalMarchReachabilityClause
      );
    }
    const moveKinds = coordinateMode === 'strategic' ? 'approach, advance, or move/melee' : 'approach or move/melee';
    return (
      ` For each explicit_move entry: set "destination" to a Target Hex from that unit's Best Options This Turn ${moveKinds} row (copy the two-character code exactly), or to the exact orderToHexCode from that unit's plan_route result when the dest is not listed there.` +
      tacticalMarchReachabilityClause
    );
  }
  if (flags.ordersEnabled) {
    return (
      ' You have no movement planning tools: you cannot compute valid one-step explicit_move destinations yourself. Use assign_order in orders[] for standing missions; leave explicit_move / ranged_attack out unless you can copy valid briefing hex codes from the operational map only.' +
      memorySuffix
    );
  }
  if (flags.fallbackMovementEnabled) {
    const memoryHint = flags.memoryEnabled ? ' After your analysis, add memoryUpdates in final JSON if needed. ' : '';
    return (
      memoryHint +
      'Without planning/standing-order tools, use explicit_move with "destination" set only to a move hex from the "Adjacent cells (fallback)" list. Omit explicit_move to stay; a destination on the unit\'s current cell is ignored as already arrived; the unit holds.' +
      memorySuffix
    );
  }
  return (
    ' You have no movement planning tools: submit orders[] without explicit_move unless coordinates are trivially valid from the briefing.' +
    memorySuffix
  );
}

/**
 * One side's observed units, already formatted as id, type, and cell.
 *
 * Purpose: The roster line groups those summaries under the side's home name, then Neutral.
 * When to use: `buildEnemyUnitsPromptLine`.
 * Expected outcome: `roster` is empty when that side has nothing observed. The line omits empty groups.
 * Exceptions: None.
 */
export type EnemyRosterGroup = {
  /**
   * Home display name, or `Neutral`.
   *
   * Contract: The side's `homeRegion`. Neutral uses the word Neutral.
   * When to use: The group label before the colon.
   * Expected outcome: A non-empty name.
   * Exceptions: None.
   */
  readonly name: string;
  /**
   * Semicolon-joined unit summaries for this group.
   *
   * Contract: Each summary is `id (type) at cell`. Empty when nothing of this side is observed.
   * When to use: After the colon. Empty groups are omitted.
   * Expected outcome: An empty string or a semicolon-joined list.
   * Exceptions: None.
   */
  readonly roster: string;
};

/**
 * Observed-enemy line, grouped by side and then Neutral.
 *
 * Purpose: The commander sees which enemy each observed unit belongs to.
 * When to use: The system prompt after the tools section. Pass groups in seat order, with Neutral last.
 * Expected outcome: `Enemy units (currently observed): {name}: {roster}; ...`, or the none sentence when every roster is empty.
 * Exceptions: None.
 */
export function buildEnemyUnitsPromptLine(groups: readonly EnemyRosterGroup[]): string {
  const present = groups.filter((group) => group.roster.length > 0);
  logTrace('promptText buildEnemyUnitsPromptLine', { groupCount: present.length });
  if (present.length === 0) {
    return 'Enemy units (currently observed): none. Enemy units may be out of view; actively scout to reacquire contact.';
  }
  return `Enemy units (currently observed): ${present.map((group) => `${group.name}: ${group.roster}`).join('; ')}`;
}

/**
 * Thin adapter from tool flags to the submit-only opening user message.

 * Purpose: Call sites that already hold `PromptToolFlags` should not reconstruct `OpeningMessageGates` by hand.
 * When to use: `requestOrdersFlow` after the system prompt and briefing are assembled.
 * Expected outcome: Delegates to `buildOpeningUserMessage`. Tactical mode never names memory or production tails.
 * Exceptions: None.
 */
export function getInitialUserMessage(
  flags: PromptToolFlags,
  hasPrecomputedBriefing = false,
  coordinateMode: 'strategic' | 'tactical' = 'strategic',
  roster: {
    readonly hasAirUnits?: boolean;
    readonly hasMissileUnits?: boolean;
    readonly hasBestOptionsTable?: boolean;
    readonly includeExitBattle?: boolean;
    readonly hasProductionAttention?: boolean;
    readonly hasCampaignOrders?: boolean;
    readonly hasOperationOptions?: boolean;
  } = {}
): string {
  logDebug('promptText getInitialUserMessage', {
    coordinateMode,
    hasPrecomputedBriefing,
    hasAirUnits: roster.hasAirUnits !== false,
    hasMissileUnits: roster.hasMissileUnits === true,
    hasBestOptionsTable: roster.hasBestOptionsTable ?? hasPrecomputedBriefing,
    includeExitBattle: roster.includeExitBattle === true,
    hasProductionAttention: roster.hasProductionAttention === true,
    hasCampaignOrders: roster.hasCampaignOrders === true,
    hasOperationOptions: roster.hasOperationOptions === true,
  });
  return buildOpeningUserMessage({
    coordinateMode,
    planningEnabled: flags.planningEnabled,
    ordersEnabled: flags.ordersEnabled && coordinateMode !== 'tactical',
    memoryEnabled: flags.memoryEnabled && coordinateMode !== 'tactical',
    productionEnabled: flags.productionEnabled && coordinateMode !== 'tactical',
    fallbackMovementEnabled: flags.fallbackMovementEnabled,
    hasBriefing: hasPrecomputedBriefing,
    hasAirUnits: roster.hasAirUnits !== false,
    hasMissileUnits: roster.hasMissileUnits === true,
    hasBestOptionsTable: roster.hasBestOptionsTable ?? hasPrecomputedBriefing,
    includeExitBattle: roster.includeExitBattle === true,
    hasProductionAttention: roster.hasProductionAttention === true,
    hasCampaignOrders: roster.hasCampaignOrders === true,
    hasOperationOptions: roster.hasOperationOptions === true,
  });
}
