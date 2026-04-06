/**
 * Mutable renderer state shared across renderer modules. Mutate properties on `rendererSharedState`
 * (esbuild bundles named `export let` imports as immutable bindings).
 */

import type {
  GameStateSnapshot,
  HumanStandingOrderSnapshot,
  MovementOrder,
  RangedAttackOrder,
  AirStrikeOrder,
  EmbarkOrder,
  FerryOrder,
  AirStrikeTargetType,
  RemovedUnitSnapshot,
} from '../../shared/ipcTypes';
import { OPENROUTER_TOOL_GROUPS } from './constants';
import type { HoverRoutePreviewState, ResolutionMove, ResolutionPlaybackMove } from './types';

export type ResolutionMoveAnimationState = {
  moves: ResolutionMove[];
  airStrikeOutboundMoves?: ResolutionPlaybackMove[];
  airStrikeReturnMoves?: ResolutionPlaybackMove[];
  airStrikeCombatHexes?: string[];
  airStrikeCasualtyHexes?: string[];
  startTime: number;
  combatHexes?: string[];
  casualtyHexes?: string[];
  rangedCombatHexes?: string[];
  rangedCasualtyHexes?: string[];
  rangedRemovedUnits?: RemovedUnitSnapshot[];
  meleeCombatHexes?: string[];
  controlLossLightningHexes?: string[];
  meleeCasualtyHexes?: string[];
  meleeRemovedUnits?: RemovedUnitSnapshot[];
  unknownCombatHexes?: string[];
  unknownCasualtyHexes?: string[];
} | null;

export const rendererSharedState = {
  buildEntryButtonPointerInside: false,

  lastPointerClientX: 0,
  lastPointerClientY: 0,
  terrainTooltipDelayTimer: null as ReturnType<typeof setTimeout> | null,
  buildEntryDefaultMapZoom: null as number | null,
  lastBuildEntryLayerKey: null as string | null,

  res1DominantTerrainKindByH3: new Map<string, string>(),
  res1TerrainSummaryByH3: new Map<string, string>(),
  res1FeaturesSummaryByH3: new Map<string, string | null>(),
  res1FeatureCountsByH3: new Map<
    string,
    { airportCount: number; seaportCount: number; rubbleCount: number }
  >(),

  namingLineByLookupKey: new Map<string, string | null>(),
  terrainTooltipHtmlByContentKey: new Map<string, string>(),
  terrainTooltipRequestSeq: 0,

  terrainTooltipRestoreTimer: null as ReturnType<typeof setTimeout> | null,

  selectedHexIndex: null as string | null,
  hoveredHexH3: null as string | null,
  hoveredDetailHexH3: null as string | null,
  hideTerrainFillWhileHeld: false,
  selectedUnitIds: [] as string[],
  selectedUnitIdsAtMouseDown: [] as string[],
  ctrlKeyActive: false,
  pendingSelectTimeout: null as ReturnType<typeof setTimeout> | null,
  humanStandingOrders: [] as HumanStandingOrderSnapshot[],
  hoverRoutePreview: null as HoverRoutePreviewState | null,
  hoverPreviewRequestSeq: 0,
  pendingRangedAttacks: [] as RangedAttackOrder[],
  pendingAirStrikes: [] as AirStrikeOrder[],
  pendingFerryOrders: [] as FerryOrder[],
  hideCommittedOrderLinesAfterReady: false,
  rangedModeActive: false,
  airStrikeModeActive: false,
  airStrikeTargetType: 'units' as AirStrikeTargetType,
  stackCalloutModalActive: false,
  buildPopupHexH3: null as string | null,
  buildPopupRequestSeq: 0,
  gameState: null as GameStateSnapshot | null,
  unitDisplayNameById: new Map<string, string>(),
  res4TerrainOverridesByH3: new Map<
    string,
    { terrainKind: string; isUrban: boolean; isAirport: boolean; isSeaport: boolean; isRubble: boolean }
  >(),
  terrainInfraRes1Airport: new Set<string>(),
  terrainInfraRes1Seaport: new Set<string>(),
  terrainInfraRes4Airport: new Set<string>(),
  terrainInfraRes4Seaport: new Set<string>(),
  res4ChildrenByParent: new Map<string, string[]>(),
  res4Visible: false,

  resolutionMoveAnimation: null as ResolutionMoveAnimationState,
  resolutionMoveAnimationFrameId: null as number | null,
  initialCameraApplied: false,

  clientStaleEnemyIntelByUnitId: new Map<
    string,
    {
      unitId: string;
      lastKnownH3Index: string;
      lastSeenTurn: number;
      staleUntilTurn: number;
    }
  >(),
  lastRenderedVisibleEnemyByUnitId: new Map<string, { h3Index: string; lastSeenTurn: number }>(),
  lastObservedEnemyByUnitId: new Map<string, { h3Index: string; lastSeenTurn: number }>(),

  redrawRafId: null as number | null,

  canvasMetrics: null as { w: number; h: number; dpr: number } | null,

  openRouterToolGroups: [...OPENROUTER_TOOL_GROUPS] as { id: string; label: string }[],
  enabledToolGroups: new Set<string>(OPENROUTER_TOOL_GROUPS.map((g) => g.id)),
  toolInvocationCounts: Object.fromEntries(OPENROUTER_TOOL_GROUPS.map((g) => [g.id, 0])) as Record<
    string,
    number
  >,
  runButtonOn: false,
  useEventDrivenConsultation: true,
  eventDrivenInitialConsultationDone: false,
  precomputedAiOrders: null as MovementOrder[] | null,
  precomputedAiRangedOrders: null as { unitId: string; targetH3Index: string }[] | null,
  precomputedAiEmbarkOrders: null as EmbarkOrder[] | null,
  precomputedAiStrategy: null as string | null,
  precomputedToolInvocationCounts: null as Record<string, number> | null,
  backgroundRequestInFlight: false,
  readyRequestInFlight: false,
  readyBtnAiWaitStartTime: null as number | null,
  readyBtnAiWaitIntervalId: null as ReturnType<typeof setInterval> | null,
  openRouterGameCost: 0,
  toastHideTimer: null as ReturnType<typeof setTimeout> | null,
  aiStrategyToastHideTimer: null as ReturnType<typeof setTimeout> | null,
  lastAppliedMapInteractionCursor: '',
};
