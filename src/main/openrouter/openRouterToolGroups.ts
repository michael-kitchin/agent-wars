import { logTrace } from '../logger';
import { TOOL1_NAMES } from '../tools/tool1Pathfinding';
import { TOOL2_NAMES } from '../tools/tool2Assessment';
import { TOOL3_NAMES } from '../tools/tool3CombatEstimation';
import { TOOL4_NAMES } from '../tools/tool4Memory';
import { TOOL5_NAMES } from '../tools/tool5StandingOrders';
import { TOOL6_NAMES } from '../tools/tool6Production';

/**
 * Tool group registry and derived capability flags for OpenRouter tool gating.
 */
/**
 * Documents the `ToolGroupEntry` interface as a named contract surface (export interface ToolGroupEntry).

 * Purpose: Supports maintainability by documenting why `ToolGroupEntry` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface ToolGroupEntry {
    /**
   * Specifies the contract for the `id` member (id: string;).

   * Contract: Describes stable behavior for callers of `id` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
id: string;
    /**
   * Specifies the contract for the `label` member (label: string;).

   * Contract: Describes stable behavior for callers of `label` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
label: string;
    /**
   * Specifies the contract for the `toolNames` member (toolNames: readonly string[];).

   * Contract: Describes stable behavior for callers of `toolNames` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
toolNames: readonly string[];
}

/**
 * Documents the module-scope binding `TOOL_GROUP_REGISTRY` (TOOL_GROUP_REGISTRY: ToolGroupEntry[]).

 * Purpose: Supports maintainability by documenting why `TOOL_GROUP_REGISTRY` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const TOOL_GROUP_REGISTRY: ToolGroupEntry[] = [
  { id: 'precomputation', label: 'Precomputation', toolNames: [] },
  { id: 'planning', label: 'Planning', toolNames: TOOL1_NAMES },
  { id: 'assessment', label: 'Assessment', toolNames: TOOL2_NAMES },
  { id: 'estimation', label: 'Estimation', toolNames: TOOL3_NAMES },
  { id: 'memory', label: 'Memory', toolNames: TOOL4_NAMES },
  { id: 'orders', label: 'Orders', toolNames: TOOL5_NAMES },
  { id: 'production', label: 'Production', toolNames: TOOL6_NAMES },
];

/**
 * Defines the `getToolGroupList` function shape (export function getToolGroupList(): { id: string; label: string }[] { logTrace('openRouter getToolGroupList'); return TOOL_GROUP_REGISTRY.map((g) => ({ id).

 * Purpose: Supports maintainability by documenting why `getToolGroupList` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getToolGroupList(): { id: string; label: string }[] {
  logTrace('openRouter getToolGroupList');
  return TOOL_GROUP_REGISTRY.map((g) => ({ id: g.id, label: g.label }));
}

/**
 * Defines the `getToolNamesForEnabledGroups` function shape (export function getToolNamesForEnabledGroups(enabledGroupIds: string[]): string[]).

 * Purpose: Supports maintainability by documenting why `getToolNamesForEnabledGroups` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getToolNamesForEnabledGroups(enabledGroupIds: string[]): string[] {
  logTrace('openRouter getToolNamesForEnabledGroups', { enabledGroupIds });
  const set = new Set<string>(enabledGroupIds);
  const names: string[] = [];
  for (const g of TOOL_GROUP_REGISTRY) {
    if (set.has(g.id)) names.push(...g.toolNames);
  }
  return names;
}

/**
 * Documents the module-scope binding `TOOL_NAME_TO_GROUP_ID` (TOOL_NAME_TO_GROUP_ID).

 * Purpose: Supports maintainability by documenting why `TOOL_NAME_TO_GROUP_ID` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const TOOL_NAME_TO_GROUP_ID = (() => {
  const m = new Map<string, string>();
  for (const g of TOOL_GROUP_REGISTRY) {
    for (const name of g.toolNames) m.set(name, g.id);
  }
  return m;
})();

/**
 * Defines the `getGroupIdForToolName` function shape (export function getGroupIdForToolName(toolName: string): string | undefined { logTrace('openRouter getGroupIdForToolName', { toolName }); return TOOL_NAME).

 * Purpose: Supports maintainability by documenting why `getGroupIdForToolName` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getGroupIdForToolName(toolName: string): string | undefined {
  logTrace('openRouter getGroupIdForToolName', { toolName });
  return TOOL_NAME_TO_GROUP_ID.get(toolName);
}

/**
 * Documents the `ToolFlags` interface as a named contract surface (export interface ToolFlags).

 * Purpose: Supports maintainability by documenting why `ToolFlags` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface ToolFlags {
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
   * Specifies the contract for the `ordersEnabled` member (ordersEnabled: boolean;).

   * Contract: Describes stable behavior for callers of `ordersEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
ordersEnabled: boolean;
    /**
   * Specifies the contract for the `memoryEnabled` member (memoryEnabled: boolean;).

   * Contract: Describes stable behavior for callers of `memoryEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
memoryEnabled: boolean;
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
 * Defines the `getToolFlags` function shape (export function getToolFlags(enabledToolNames: string[] | undefined): ToolFlags).

 * Purpose: Supports maintainability by documenting why `getToolFlags` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getToolFlags(enabledToolNames: string[] | undefined): ToolFlags {
  logTrace('openRouter getToolFlags', { hasList: enabledToolNames !== undefined, count: enabledToolNames?.length ?? 0 });
  const set =
    enabledToolNames === undefined
      ? new Set(TOOL_GROUP_REGISTRY.flatMap((g) => [...g.toolNames]))
      : new Set(enabledToolNames);
  const has = (names: readonly string[]) => names.some((n) => set.has(n));
  const planningEnabled = has(TOOL1_NAMES);
  const assessmentEnabled = has(TOOL2_NAMES);
  const estimationEnabled = has(TOOL3_NAMES);
  const ordersEnabled = has(TOOL5_NAMES);
  const memoryEnabled = has(TOOL4_NAMES);
  const productionEnabled = has(TOOL6_NAMES);
  return {
    planningEnabled,
    assessmentEnabled,
    estimationEnabled,
    ordersEnabled,
    memoryEnabled,
    productionEnabled,
    fallbackMovementEnabled: !planningEnabled && !ordersEnabled,
  };
}
