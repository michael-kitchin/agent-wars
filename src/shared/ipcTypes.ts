/**
 * IPC-facing and snapshot types shared between main, preload, and tests.
 * Keep this module free of Node/Electron imports so it stays safe for any consumer.
 */

/** One-line naming headline for hover tooltips (city/state preference by resolution). */
export interface HexNamingTooltipLineRequest {
  h3Index: string;
  resolution: 1 | 4;
}

/** Continent-list lookup for one res-1 hex used by unknown-battle fog announcements. */
export interface HexContinentNamesRequest {
  h3Index: string;
}

/** Res-4 terrain overlay row: base terrain kind plus optional urban variation state. */
export interface Res4TerrainOverrideRow {
  h3Index: string;
  terrainKind: string;
  isUrban: boolean;
  isAirport?: boolean;
  isSeaport?: boolean;
  isRubble?: boolean;
}

/** Snapshot of game state sent to the renderer (camelCase for JSON). */
export interface GameStateSnapshot {
  /** `terrain`: passability `land` | `water` | `coastal` | `wetlands`. `terrainKind`: pipeline label including `coastal`/`wetlands`. */
  hexes: { h3Index: string; terrain: string; terrainKind: string }[];
  units: { id: string; player: string; unitType: string; h3Index: string; displayOrder?: number }[];
  /** Side-specific visibility union from all alive friendly units. */
  visibleHexes?: string[];
  /** Hexes permanently known after friendly entry at least once. */
  exploredHexes?: string[];
  /** Explored but not currently visible. */
  staleHexes?: string[];
  /** Enemy intelligence entries from the viewer side's perspective. */
  enemyIntel?: {
    unitId: string;
    lastKnownH3Index: string;
    lastKnownLatLng: [number, number];
    intelState: 'current' | 'stale';
    lastSeenTurn: number;
    staleUntilTurn: number;
  }[];
  /** Perspective id used to build this snapshot (human/opponent). */
  playerPerspective?: string;
  /** True when fog restrictions apply to this snapshot; false means both sides have full map/unit visibility. */
  fogOfWarEnabled?: boolean;
  phase: string;
  turnNumber: number;
  pendingOrders: { unitId: string; toH3Index: string }[];
  /** Res-1 control rows for overlay rendering and production UI. */
  res1Control?: { h3Index: string; controllerPlayerId: string | null }[];
  /** Res-1 queue summary per hex for production overlays (queue totals + next-enqueued metadata). */
  res1BuildQueueTotals?: {
    h3Index: string;
    queuedUnits: number;
    nextUnitType: BuildUnitType | null;
    nextRemainingCount: number | null;
    storedPoints: number;
  }[];
  /** Res-1 infrastructure snapshot used by production and air-strike planning. */
  res1Infrastructure?: {
    h3Index: string;
    urbanHexCount: number;
    airportCount: number;
    seaportCount: number;
  }[];
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

/** Air strike target categories from milestone 1.5. */
export type AirStrikeTargetType = 'units' | 'urban' | 'airport' | 'seaport';

/** Air strike declaration for IPC (one target hex + target type per air unit per turn). */
export interface AirStrikeOrder {
  unitId: string;
  targetH3Index: string;
  targetType: AirStrikeTargetType;
}

/** One resolved air-strike sortie path used for renderer playback (outbound and optional return). */
export interface AirStrikeAnimationMove {
  unitId: string;
  player: string;
  unitType: string;
  fromH3Index: string;
  targetH3Index: string;
  returnsToBase: boolean;
}

/** Air ferry declaration for IPC (one destination airport hex per air unit per turn). */
export interface FerryOrder {
  unitId: string;
  destinationH3Index: string;
}

/** One resolved ferry relocation move used for renderer playback. */
export interface FerryAnimationMove {
  unitId: string;
  player: string;
  fromH3Index: string;
  toH3Index: string;
}

/** Payload for submitOrders: movement and optional ranged attacks. */
export interface SubmitOrdersPayload {
  movementOrders: MovementOrder[];
  rangedAttacks?: RangedAttackOrder[];
  airStrikes?: AirStrikeOrder[];
  ferryOrders?: FerryOrder[];
}

/** Optional arguments for game:newGame (currently fog-of-war toggle). */
export interface NewGameIpcPayload {
  fogOfWarEnabled?: boolean;
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
  precomputedAiAirStrikeOrders?: AirStrikeOrder[];
  precomputedAiFerryOrders?: FerryOrder[];
  precomputedAiStrategy?: string;
  /** When true, Ready may invoke the LLM (non–event-driven path or afterResolution). Omitted/false ⇒ no LLM on Ready. */
  aiPlanningRunEnabled?: boolean;
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
      airStrikes?: AirStrikeOrder[];
      ferryOrders?: FerryOrder[];
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
  displayOrder?: number;
}

/** Infrastructure destruction event emitted during air-strike resolution. */
export interface InfrastructureDestroyedEvent {
  h3Index: string;
  targetType: 'urban' | 'airport' | 'seaport';
  changedRubbleCount: number;
  destroyedAirUnitsCount: number;
}

/** Shape returned by game:ready. */
export interface ReadyResult {
  success: boolean;
  reason?: string;
  aiSkipped?: boolean;
  aiSkipReason?: string;
  aiOrderCount?: number;
  aiRangedByType?: { armor?: number; naval?: number; air?: number };
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
  airStrikeHexes?: string[];
  airStrikeCasualtyHexes?: string[];
  airStrikeRemovedUnits?: RemovedUnitSnapshot[];
  airStrikeMoves?: AirStrikeAnimationMove[];
  airStrikeAttemptCount?: number;
  airStrikeSuccessfulCount?: number;
  airStrikeFailedCount?: number;
  airStrikeAttackerLossCount?: number;
  baseInvalidAirLossCount?: number;
  infrastructureDestroyedEvents?: InfrastructureDestroyedEvent[];
  resolvedFerryMoves?: FerryAnimationMove[];
  meleeCombatHexes?: string[];
  meleeCasualtyHexes?: string[];
  meleeRemovedUnits?: RemovedUnitSnapshot[];
  unknownCombatHexes?: string[];
  unknownCasualtyHexes?: string[];
  unknownBattleAnnouncement?: string;
  kills?: { victimId: string; killerIds: string[] }[];
  killsByDirectFire?: { victimId: string; killerIds: string[] }[];
  killsByReturnFire?: { victimId: string; killerIds: string[] }[];
  /** Newly spawned production units this turn, aggregated by unit type. */
  deployedUnitsByType?: { armor?: number; infantry?: number; naval?: number; air?: number };
  /** Unit types that hit deployment cap for human during production spawn. */
  humanDeploymentCapReachedUnitTypes?: BuildUnitType[];
  /** Unit types that hit deployment cap for opponent during production spawn. */
  opponentDeploymentCapReachedUnitTypes?: BuildUnitType[];
  /** Count of human-controlled hexes lost to the opponent this turn. */
  humanHexesLostCount?: number;
  /** Hexes that should show lightning due to off-hex control loss events. */
  controlLossLightningHexes?: string[];
  aiStrategy?: string;
  toolInvocationCounts?: Record<string, number>;
  cost?: number;
  wallClockMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  opponentCombatParticipantUnitIds?: string[];
  removedOpponentUnitIds?: string[];
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

/** Per-unit hover preview for grouped multi-selection planning. */
export interface HumanOrderGroupPreviewUnitResult {
  unitId: string;
  preview: HumanOrderPreviewResult;
}

/** Result of previewing a grouped human march order for multiple selected units. */
export interface HumanOrderGroupPreviewResult {
  validForAll: boolean;
  showInvalidMarker: boolean;
  invalidReason?: string;
  /** Slowest per-turn movement budget (hex edges) among selected units; used for solid-segment cap. */
  slowestMovementRange: number;
  previews: HumanOrderGroupPreviewUnitResult[];
}

export type BuildUnitType = 'infantry' | 'armor' | 'naval' | 'air';

/** Shared production context for one res-1 hex used by queue validation/rendering. */
export interface Res1ProductionContextSnapshot {
  urbanHexCount: number;
  airportCount: number;
  seaportCount: number;
}

export interface HexBuildQueueEntrySnapshot {
  id: number;
  queueIndex: number;
  unitType: BuildUnitType;
  count: number;
}

export interface HexBuildQueueSnapshot {
  h3Index: string;
  controllerPlayerId: string | null;
  controlledByRequester: boolean;
  urbanHexCount: Res1ProductionContextSnapshot['urbanHexCount'];
  airportCount: Res1ProductionContextSnapshot['airportCount'];
  seaportCount: Res1ProductionContextSnapshot['seaportCount'];
  availableUnitTypes: BuildUnitType[];
  buildSectionVisible: boolean;
  noBuildReason: string | null;
  entries: HexBuildQueueEntrySnapshot[];
}

/** Preload-exposed renderer bridge contract. */
export interface GameApi {
  getGameState: () => Promise<GameStateSnapshot>;
  getRes4TerrainOverrides: () => Promise<Res4TerrainOverrideRow[]>;
  getHexNamingTooltipLine: (payload: HexNamingTooltipLineRequest) => Promise<string | null>;
  getHexContinentNames: (payload: HexContinentNamesRequest) => Promise<string[]>;
  newGame: (payload?: NewGameIpcPayload) => Promise<GameStateSnapshot>;
  submitOrders: (payload: SubmitOrdersIpcPayload) => Promise<{ success: boolean; reason?: string }>;
  ready: (payload?: GameReadyIpcPayload) => Promise<ReadyResult>;
  listHumanStandingOrders: () => Promise<HumanStandingOrderSnapshot[]>;
  previewHumanMarchOrder: (payload: { unitId: string; hoveredH3Index: string }) => Promise<HumanOrderPreviewResult>;
  previewHumanMarchOrders: (payload: { unitIds: string[]; hoveredH3Index: string }) => Promise<HumanOrderGroupPreviewResult>;
  assignHumanMarchOrder: (payload: { unitId: string; destinationH3Index: string }) => Promise<{ success: boolean; reason?: string }>;
  assignHumanMarchOrders: (payload: { unitIds: string[]; destinationH3Index: string }) => Promise<{ success: boolean; reason?: string }>;
  validateGroupRangedTarget: (payload: { unitIds: string[]; targetH3Index: string }) => Promise<{ success: boolean; reason?: string }>;
  validateGroupAirStrikeTarget: (payload: {
    unitIds: string[];
    targetH3Index: string;
    targetType: AirStrikeTargetType;
  }) => Promise<{ success: boolean; reason?: string }>;
  validateGroupFerryTarget: (payload: { unitIds: string[]; destinationH3Index: string }) => Promise<{ success: boolean; reason?: string }>;
  cancelHumanStandingOrder: (payload: { unitId: string }) => Promise<{ success: boolean; reason?: string }>;
  getHexBuildQueue: (payload: { h3Index: string }) => Promise<HexBuildQueueSnapshot | null>;
  addHexBuildQueueEntry: (payload: { h3Index: string }) => Promise<{ success: boolean; reason?: string; queue?: HexBuildQueueSnapshot }>;
  updateHexBuildQueueEntry: (payload: { h3Index: string; entryId: number; unitType: BuildUnitType; count: number }) => Promise<{
    success: boolean;
    reason?: string;
    queue?: HexBuildQueueSnapshot;
  }>;
  removeHexBuildQueueEntry: (payload: { h3Index: string; entryId: number }) => Promise<{
    success: boolean;
    reason?: string;
    queue?: HexBuildQueueSnapshot;
  }>;
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
