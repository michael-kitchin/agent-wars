/**
 * Injectable dependency surface for `requestOrdersFlow` (transport, prompts, tool catalog, validators).
 *
 * Purpose: Keeps the main flow file focused on orchestration while documenting the full contract in one importable module.
 * When to use: Type-only import from `requestOrdersFlow`; production wiring lives in `openRouter.ts`.
 * Expected outcome: Callers construct a single `deps` object satisfying every required callback.
 * Exceptions: None.
 */

import type { GameStateSnapshot } from '../../shared/ipcTypes';

/**
 * Dependency bundle passed into `requestOrdersFlow` for test doubles and production OpenRouter wiring.
 *
 * Purpose: Names every collaborator the flow needs so tests can stub without reaching into module internals.
 * When to use: As the first argument to `requestOrdersFlow(deps, state, modelId, options?)`.
 * Expected outcome: All members are invoked only as documented by each tool phase.
 * Exceptions: None.
 */
export interface RequestOrdersFlowDeps {
  /**
   * Loads the persisted OpenRouter API key string (may be empty when unset).
   *
   * Contract: Returns the raw key material without logging it.
   * When to use: Before the first outbound chat request in the flow.
   * Expected outcome: Non-throwing read of secure storage or test override.
   * Exceptions: None.
   */
  loadKey: () => string;
  /**
   * Resolves which tool families are enabled for the current request.
   *
   * Contract: Boolean flags are consistent with `enabledToolNames` filtering rules in `openRouter`.
   * When to use: Before building prompts and tool definitions each loop iteration.
   * Expected outcome: At least one movement-related path remains when orders are allowed.
   * Exceptions: None.
   */
  getToolFlags: (enabledToolNames: string[] | undefined) => {
    planningEnabled: boolean;
    assessmentEnabled: boolean;
    estimationEnabled: boolean;
    ordersEnabled: boolean;
    memoryEnabled: boolean;
    productionEnabled: boolean;
    fallbackMovementEnabled: boolean;
  };
  /**
   * Declares tool-name membership for each configured tool group.
   *
   * Contract: Stable ids used with `getGroupIdForToolName` for telemetry and tactical stripping.
   * When to use: Tool loop and precomputation filtering.
   * Expected outcome: Read-only for the duration of the request.
   * Exceptions: None.
   */
  toolGroupRegistry: { id: string; toolNames: readonly string[] }[];
  /**
   * Builds the system prompt for the enabled tool surface.
   *
   * Contract: Deterministic for identical inputs; never embeds secrets beyond the passed state.
   * When to use: Once per outer request before the tool loop begins.
   * Expected outcome: Non-empty markdown/text suitable for OpenRouter `system` role.
   * Exceptions: None.
   */
  buildSystemPromptForTools: (
    state: GameStateSnapshot,
    coordMap: {
      latLngByH3: Map<string, [number, number]>;
      format: (h3: string) => string;
      resolveToH3: (lat: number, lng: number) => string | undefined;
    },
    enabledToolNames?: string[],
    briefingOverride?: string
  ) => string;
  /**
   * Builds OpenAI-style tool definitions for the enabled tool names.
   *
   * Contract: JSON-schema-compatible objects for each function tool.
   * When to use: Alongside the system prompt for the initial chat payload.
   * Expected outcome: Array suitable for `tools` field on the chat request body.
   * Exceptions: None.
   */
  buildToolDefinitions: (enabledToolNames?: string[]) => Array<{
    type: 'function';
    function: { name: string; description: string; parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] } };
  }>;
  /**
   * Posts a chat completion request with timeout/retry policy.
   *
   * Contract: Returns structured success/failure without throwing on HTTP 4xx/5xx (errors in union).
   * When to use: Each assistant round including repair passes.
   * Expected outcome: `bodyText` is raw JSON string from the provider on success.
   * Exceptions: None from transport; network failures surface as `{ ok: false, error }`.
   */
  postOpenRouterChatWithTimeoutAndRetry: (payload: {
    key: string;
    body: Record<string, unknown>;
    signal?: AbortSignal;
    onLog?: (line: string, isError?: boolean) => void;
    requestLabel: string;
  }) => Promise<{ ok: true; status: number; headers: Record<string, string>; bodyText: string } | { ok: false; error: string }>;
  /**
   * Maps a tool name to its configured group id, if any.
   *
   * Contract: Undefined when the tool is unknown to the registry.
   * When to use: Telemetry aggregation and tactical-only tool stripping.
   * Expected outcome: Stable string ids matching `toolGroupRegistry[].id`.
   * Exceptions: None.
   */
  getGroupIdForToolName: (toolName: string) => string | undefined;
  /**
   * Validates a single AI movement order against the authoritative snapshot.
   *
   * Contract: Pure validation; does not mutate `state`.
   * When to use: After parsing movement orders from the model.
   * Expected outcome: `{ valid: true }` or `{ valid: false, reason }` with a short reason string.
   * Exceptions: None.
   */
  validateAiOrder: (order: { unitId: string; toH3Index: string }, state: GameStateSnapshot) => { valid: true } | { valid: false; reason: string };
  /**
   * Validates a single AI ranged attack order against the authoritative snapshot.
   *
   * Contract: Pure validation; does not mutate `state`.
   * When to use: After parsing ranged attack rows from the model.
   * Expected outcome: `{ valid: true }` or `{ valid: false, reason }`.
   * Exceptions: None.
   */
  validateAiRangedOrder: (
    order: { unitId: string; targetH3Index: string },
    state: GameStateSnapshot
  ) => { valid: true } | { valid: false; reason: string };
  /**
   * Formats a lat/lng pair for human-readable prompts and logs.
   *
   * Contract: Rounds consistently with map briefing conventions.
   * When to use: Error strings and tool traces referencing coordinates.
   * Expected outcome: Short stable string, not raw double precision noise.
   * Exceptions: None.
   */
  formatLatLng: (ll: [number, number]) => string;
}
