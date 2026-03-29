/**
 * IPC-facing and snapshot types shared between main, preload, and tests.
 * Keep this module free of Node/Electron imports so it stays safe for any consumer.
 */

/** Sparse H3 lists for major airports/ports (scalerank ≤ 5) from terrain metadata; used for terrain-hover glyphs. */
export interface TerrainInfrastructureHintsSnapshot {
  res1MajorAirports: string[];
  res1MajorPorts: string[];
  res4MajorAirports: string[];
  res4MajorPorts: string[];
}

/** One-line naming headline for hover tooltips (city/state preference by resolution). */
export interface HexNamingTooltipLineRequest {
  h3Index: string;
  resolution: 1 | 4;
}

/** Res-4 terrain overlay row: base terrain kind plus optional urban variation state. */
export interface Res4TerrainOverrideRow {
  h3Index: string;
  terrainKind: string;
  isUrban: boolean;
}

/** Snapshot of game state sent to the renderer (camelCase for JSON). */
export interface GameStateSnapshot {
  /** `terrain`: passability `land` | `water` | `coastal`. `terrainKind`: pipeline label including `coastal`. */
  hexes: { h3Index: string; terrain: string; terrainKind: string }[];
  units: { id: string; player: string; unitType: string; h3Index: string }[];
  phase: string;
  turnNumber: number;
  pendingOrders: { unitId: string; toH3Index: string }[];
  gameOver?: boolean;
  winner?: string;
}

/** Human movement order in IPC payloads (internal resolution still uses H3 in the DB). */
export interface MovementOrder {
  unitId: string;
  toH3Index: string;
}

/** Ranged attack declaration for IPC (one target hex per unit per turn). */
export interface RangedAttackOrder {
  unitId: string;
  targetH3Index: string;
}

/** Payload for submitOrders: movement and optional ranged attacks. */
export interface SubmitOrdersPayload {
  movementOrders: MovementOrder[];
  rangedAttacks?: RangedAttackOrder[];
}

/**
 * Payload for game:submitOrders from the renderer. Either a structured object or a legacy array
 * of movement-only orders (treated as movementOrders).
 */
export type SubmitOrdersIpcPayload = SubmitOrdersPayload | MovementOrder[];

/** Optional arguments for game:ready (tool groups, event-driven mode, precomputed AI orders). */
export interface GameReadyIpcPayload {
  enabledToolGroups?: string[];
  useEventDrivenConsultation?: boolean;
  precomputedAiOrders?: MovementOrder[];
  precomputedAiRangedOrders?: RangedAttackOrder[];
  precomputedAiStrategy?: string;
}

/** API model row shown in the renderer model dropdown. */
export interface OpenRouterModel {
  id: string;
  name?: string;
}

/** Per-turn AI request response used by game:requestAiOrders. */
export type RequestAiOrdersResult =
  | {
      success: true;
      orders: MovementOrder[];
      rangedAttacks?: RangedAttackOrder[];
      strategy?: string;
      dropped?: number;
      dropReasons?: string[];
      toolInvocationCounts?: Record<string, number>;
      cost?: number;
      wallClockMs?: number;
      inputTokens?: number;
      outputTokens?: number;
    }
  | { success: false; error: string };

/** Minimal removed-unit payload used by resolution rendering. */
export interface RemovedUnitSnapshot {
  id: string;
  player: string;
  unitType: string;
  h3Index: string;
}

/** Shape returned by game:ready. */
export interface ReadyResult {
  success: boolean;
  reason?: string;
  aiSkipped?: boolean;
  aiSkipReason?: string;
  aiOrderCount?: number;
  aiRangedByType?: { armor?: number; naval?: number };
  aiDropped?: number;
  aiDropReasons?: string[];
  aiMovesLog?: string[];
  aiMoves?: { unitId: string; fromH3Index: string; toH3Index: string }[];
  humanMoves?: { unitId: string; fromH3Index: string; toH3Index: string }[];
  combatHexes?: string[];
  removedUnitIds?: string[];
  removedUnits?: RemovedUnitSnapshot[];
  casualtyHexes?: string[];
  rangedCombatHexes?: string[];
  rangedCasualtyHexes?: string[];
  rangedRemovedUnits?: RemovedUnitSnapshot[];
  meleeCombatHexes?: string[];
  meleeCasualtyHexes?: string[];
  meleeRemovedUnits?: RemovedUnitSnapshot[];
  kills?: { victimId: string; killerIds: string[] }[];
  killsByDirectFire?: { victimId: string; killerIds: string[] }[];
  killsByReturnFire?: { victimId: string; killerIds: string[] }[];
  aiStrategy?: string;
  toolInvocationCounts?: Record<string, number>;
  cost?: number;
  aiConsulted?: boolean;
}

/** Human standing-order row returned to renderer for movement order list and map overlays. */
export interface HumanStandingOrderSnapshot {
  unitId: string;
  status: string;
  destinationH3Index: string | null;
  turnsRemaining: number;
  nextMoveH3Index: string | null;
  routeSegments?: { turn: number; hexes: [number, number][] }[];
}

/** One turn-segment of a hover route preview, expressed in [lat, lng] points. */
export interface HumanOrderPreviewSegment {
  turn: number;
  hexes: [number, number][];
}

/** Result of previewing a human march order from selected unit to hovered hex. */
export interface HumanOrderPreviewResult {
  valid: boolean;
  showInvalidMarker: boolean;
  invalidReason?: string;
  arrowLatLng?: [number, number];
  segments: HumanOrderPreviewSegment[];
}

/** Preload-exposed renderer bridge contract. */
export interface GameApi {
  getGameState: () => Promise<GameStateSnapshot>;
  getRes4TerrainOverrides: () => Promise<Res4TerrainOverrideRow[]>;
  getTerrainInfrastructureHints: () => Promise<TerrainInfrastructureHintsSnapshot>;
  getHexNamingTooltipLine: (payload: HexNamingTooltipLineRequest) => Promise<string | null>;
  newGame: () => Promise<GameStateSnapshot>;
  submitOrders: (payload: SubmitOrdersIpcPayload) => Promise<{ success: boolean; reason?: string }>;
  ready: (payload?: GameReadyIpcPayload) => Promise<ReadyResult>;
  listHumanStandingOrders: () => Promise<HumanStandingOrderSnapshot[]>;
  previewHumanMarchOrder: (payload: { unitId: string; hoveredH3Index: string }) => Promise<HumanOrderPreviewResult>;
  assignHumanMarchOrder: (payload: { unitId: string; destinationH3Index: string }) => Promise<{ success: boolean; reason?: string }>;
  cancelHumanStandingOrder: (payload: { unitId: string }) => Promise<{ success: boolean; reason?: string }>;
  requestAiOrders: (payload?: { enabledToolGroups?: string[] }) => Promise<RequestAiOrdersResult>;
  cancelRequestAiOrders: () => Promise<void>;
  registerOpenRouterLogListener?: (callback: (payload: { line: string; isError?: boolean }) => void) => void;
  openRouter?: {
    getKey: () => Promise<{ hasKey: boolean }>;
    getSelectedModel: () => Promise<string>;
    setKey: (key: string) => Promise<void>;
    listModels: () => Promise<{ models?: OpenRouterModel[]; error?: string }>;
    setSelectedModel: (modelId: string) => Promise<void>;
    getToolGroupList: () => Promise<{ id: string; label: string }[]>;
  };
}
