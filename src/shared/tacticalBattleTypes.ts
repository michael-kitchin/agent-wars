/**
 * Shared contracts for milestone 2.1 tactical battle entry and in-session tactical units.
 * Kept renderer/main aligned via IPC payloads.
 */

import type { UnitOrigin } from './unitOriginTypes';
import type { WeatherState } from './weatherBonusTypes';

/**
 * Identifies which player owns a tactical sub-unit for rendering and rules parity.
 *
 * Contract: Restricts tactical ownership labels to the two strategic players in milestone 2.1.
 * When to use: On every tactical sub-unit snapshot and placement rule that branches on controller.
 * Expected outcome: Only `human` or `opponent` values appear in tactical payloads.
 * Exceptions: None.
 */
export type TacticalBattlePlayerId = 'human' | 'opponent';

/**
 * One tactical sub-unit placed on a res4 hex; ephemeral and not part of strategic unit caps.
 *
 * Contract: Describes a single drawable tactical pawn derived from one strategic parent unit.
 * When to use: Renderer draws these instead of strategic units while `TacticalBattleSnapshot` is active.
 * Expected outcome: Each entry has a unique `id`, valid res4 `h3Index`, and a known `unitType`.
 * Exceptions: None.
 */
export interface TacticalSubUnitSnapshot {
  /**
   * Stable identifier for this tactical sub-unit within the current battle session.
   *
   * Contract: Unique among `subUnits` for a single tactical snapshot; formatted as `${parentUnitId}-s${slot}` with no zero padding and no `battleId` prefix, because parent strategic ids are unique in the battle roster. Legacy `${parentUnitId}:${twoDigitSlot}` ids may still appear in older saves.
   * When to use: Keys for rendering, tactical order targeting, and LLM-facing unit references while the session is active.
   * Expected outcome: Strings are non-empty and stable for the lifetime of the snapshot.
   * Exceptions: None.
   */
  id: string;
  /**
   * Strategic unit id this sub-unit was split from.
   *
   * Contract: Matches a strategic `units[].id` that participated in the contested hex.
   * When to use: Diagnostics, skipped-parent messaging, and future tactical-to-strategic mapping.
   * Expected outcome: Always refers to an existing parent at tactical start time.
   * Exceptions: None.
   */
  parentUnitId: string;
  /**
   * Controller of this sub-unit in tactical combat.
   *
   * Contract: Same meaning as strategic unit `player` but narrowed to tactical players.
   * When to use: Tinting, stacking rules, and combat eligibility in tactical view.
   * Expected outcome: Either `human` or `opponent`.
   * Exceptions: None.
   */
  player: TacticalBattlePlayerId;
  /**
   * Strategic unit type carried into tactical placement rules.
   *
   * Contract: Same vocabulary as strategic `unitType` for the parent.
   * When to use: Passability checks and sub-unit count ratios.
   * Expected outcome: Known types map to positive tactical counts where supported.
   * Exceptions: None.
   */
  unitType: string;
  /**
   * Host res4 cell for this sub-unit.
   *
   * Contract: Resolution-4 H3 index contained in the enclosing res1 parent.
   * When to use: Canvas placement and Leaflet tactical bounds fitting.
   * Expected outcome: Index is a child of `enclosingRes1H3Index` for the battle.
   * Exceptions: None.
   */
  h3Index: string;
  /**
   * Human-readable label for tooltips and toasts.
   *
   * Contract: Non-empty display string safe for UI surfaces.
   * When to use: Skipped-parent warnings and future tactical inspector UI.
   * Expected outcome: Matches or derives from shared unit display naming.
   * Exceptions: None.
   */
  displayName: string;
  /**
   * When set, this land sub-unit is embarked on the given naval tactical sub-unit id (sealift parity).
   *
   * Contract: Only meaningful for infantry/armor rows; naval/air omit or leave unset.
   * When to use: Tactical embark projection and movement sync so cargo shares the carrier hex.
   * Expected outcome: Carrier id refers to an opponent or human naval sub-unit in the same battle snapshot.
   * Exceptions: None.
   */
  embarkedOnSubUnitId?: string | null;
  /**
   * Birth origin of the parent strategic unit, copied onto each sub-unit when the battle snapshot is created.
   *
   * Contract: Deeply equal to the parent's `origin`; absent when the parent had none or the battle predates this field.
   * When to use: Origin bonus checks (country and terrain) for this sub-unit's rolls and assessments.
   * Expected outcome: A sub-unit without it never qualifies for an origin bonus.
   * Exceptions: None.
   */
  origin?: UnitOrigin;
  /**
   * Acclimation tags copied from the parent strategic unit.
   *
   * Contract: Present when the match has the weather bonus on. Empty when the parent has no birth hex.
   * When to use: Tactical movement and dice for this sub-unit.
   * Expected outcome: The same tags as the parent.
   * Exceptions: None.
   */
  weatherTags?: WeatherState[];
}

/**
 * Serializable tactical battle state returned to the renderer after a successful start.
 *
 * Contract: Complete tactical footprint for one contested res1 hex at a fixed strategic turn.
 * When to use: Stored in renderer shared state while tactical mode is active.
 * Expected outcome: `res4ChildH3Indexes` covers all cells that may receive tactical rendering.
 * Exceptions: None.
 */
export interface TacticalBattleSnapshot {
  /**
   * Session key for logs and deterministic placement seeds.
   *
   * Contract: Unique per tactical start attempt in practice.
   * When to use: Tie-breaking res4 ordering alongside placement algorithms.
   * Expected outcome: Non-empty string.
   * Exceptions: None.
   */
  battleId: string;
  /**
   * Strategic res1 hex enclosing this tactical battle.
   *
   * Contract: Must be the res1 cell that was contested when the battle started.
   * When to use: Terrain subsetting and re-entry prevention.
   * Expected outcome: Valid res1 H3 index present in strategic state.
   * Exceptions: None.
   */
  enclosingRes1H3Index: string;
  /**
   * All res4 descendants of the enclosing hex that participate in tactical rendering.
   *
   * Contract: Subset of `cellToChildren(enclosingRes1H3Index, 4)` order is not significant.
   * When to use: Leaflet `fitBounds` and res4 terrain drawing filters.
   * Expected outcome: Non-empty for a successfully started battle.
   * Exceptions: None.
   */
  res4ChildH3Indexes: string[];
  /**
   * Strategic turn number captured when tactical mode began.
   *
   * Contract: Matches `GameStateSnapshot.turnNumber` from planning at start time.
   * When to use: Renderer drops tactical overlay when the strategic turn advances without exit.
   * Expected outcome: Positive integer aligned with `turn_state.turn_number`.
   * Exceptions: None.
   */
  strategicTurnNumber: number;
  /**
   * Display weather of the enclosing res1 hex for this battle's month.
   *
   * Contract: Present when the match has the weather bonus on. Every beat of the battle uses this one value.
   * When to use: The turn line, tactical movement, and tactical dice.
   * Expected outcome: Mild, rain, snow, or heat.
   * Exceptions: None.
   */
  weather?: WeatherState;
  /**
   * Whether the match that opened this battle has the weather bonus on.
   *
   * Contract: Omitted when off. True when the strategic snapshot had the flag on.
   * When to use: Before applying tactical weather penalties.
   * Expected outcome: Matches the strategic match flag at battle start.
   * Exceptions: None.
   */
  weatherBonusEnabled?: boolean;
  /**
   * Tactical turn counter for future resolution milestones.
   *
   * Contract: Starts at 1 for milestone 2.1 entry slice; may increment later.
   * When to use: Future tactical AI prompts and phase gating.
   * Expected outcome: Positive integer.
   * Exceptions: None.
   */
  tacticalTurnNumber: number;
  /**
   * Strategic `terrain` column for the enclosing res1 hex when the battle was opened.
   *
   * Contract: Same vocabulary as strategic `hexes.terrain` (`land`, `water`, …).
   * When to use: Tactical movement §12.4 normalization when a res4 child has no override row.
   * Expected outcome: Present on newly built snapshots; optional on older persisted JSON (defaults to `land` in planners).
   * Exceptions: None.
   */
  strategicHexTerrain?: string;
  /**
   * Strategic `terrain_kind` for the enclosing res1 hex when the battle was opened.
   *
   * Contract: Typical values include `plains`, `forest`, `mountain`, … matching GIS pipeline output.
   * When to use: Fallback tactical terrain for res4 cells without per-cell override in `res4TerrainKindByH3`.
   * Expected outcome: Present on newly built snapshots; optional on older persisted JSON (defaults to `plains` in planners).
   * Exceptions: None.
   */
  strategicHexTerrainKind?: string;
  /**
   * Per-res4 effective `terrain_kind` inside the tactical footprint (override or parent fallback at snapshot build).
   *
   * Contract: Keys are a subset of `res4ChildH3Indexes`; omitted keys inherit `strategicHexTerrainKind` in movement code.
   * When to use: Renderer hover preview and main-process march planning without re-querying SQLite.
   * Expected outcome: Omitted or empty when absent (legacy saves); populated for new `computeTacticalBattleSnapshot` results.
   * Exceptions: None.
   */
  res4TerrainKindByH3?: Record<string, string>;
  /**
   * Per-res4 seaport facility flags inside the footprint (only rows where `res4_feature_overrides.is_seaport` is set at snapshot build).
   *
   * Contract: Keys are a subset of `res4ChildH3Indexes`; omitted keys mean the cell is not a seaport facility tile. Populated from the game DB, not from merged renderer/GIS convenience rows.
   * When to use: Tactical naval movement — ships may enter seaport cells from water, but not chain adjacent seaport→seaport steps.
   * Expected outcome: Omitted or empty on legacy saves; populated for new `computeTacticalBattleSnapshot` results.
   * Exceptions: None.
   */
  res4IsSeaportByH3?: Record<string, boolean>;
  /**
   * Birth country name per res4 cell inside the footprint, the same value used for unit births.
   *
   * Contract: Keys are a subset of `res4ChildH3Indexes` and list only cells that have a country. Set when the battle snapshot is created.
   * When to use: The country test of origin bonuses for a tactical cell.
   * Expected outcome: Omitted on legacy saves and when no footprint cell has a country; a missing cell has no country.
   * Exceptions: None.
   */
  res4CountryNameByH3?: Record<string, string>;
  /**
   * Per-res4 airport facility flags inside the footprint (only rows where `res4_feature_overrides.is_airport` is set at snapshot build).
   *
   * Contract: Keys are a subset of `res4ChildH3Indexes`; omitted keys mean the cell is not an airport facility tile. Populated from the game DB, not from merged renderer/GIS convenience rows.
   * When to use: Tactical operational-map A/a/B glyphs; air placement already reads the same override rows at snapshot build.
   * Expected outcome: Omitted or empty on legacy saves; populated for new `computeTacticalBattleSnapshot` results and refreshed after infrastructure strikes.
   * Exceptions: None.
   */
  res4IsAirportByH3?: Record<string, boolean>;
  /**
   * Per-res4 urban **infrastructure** cells (not rubble) inside the footprint at snapshot build / refresh.
   *
   * Contract: Keys are a subset of `res4ChildH3Indexes`; true means merged `getRes4TerrainOverridesForRendererFromGame` row has `isUrban` and not `isRubble`.
   * When to use: Tactical movement and ranged caps that treat urban tiles like dense terrain without inferring from `terrain_kind` alone.
   * Expected outcome: Omitted or empty on legacy saves; refreshed with terrain after tactical infrastructure strikes.
   * Exceptions: None.
   */
  res4IsUrbanByH3?: Record<string, boolean>;
  /**
   * Per-res4 rubble cells inside the footprint (infrastructure destroyed to rubble).
   *
   * Contract: Keys from merged override rows with `isRubble`; authoritative even when `res4TerrainKindByH3` still shows a base pipeline kind.
   * When to use: Same combat/movement modifiers as urban for armor/infantry budgets and ranged range cap.
   * Expected outcome: Omitted when no rubble child exists; may grow after urban air strikes refresh the snapshot.
   * Exceptions: None.
   */
  res4IsRubbleByH3?: Record<string, boolean>;
  /**
   * Per-res4 road side masks (pent/hex boolean arrays) inside the footprint, from terrain classification cache.
   *
   * Contract: Optional map keyed by res4 `h3Index` with boolean side arrays matching bundled road-rail geometry for that cell.
   * Purpose: Tactical land march may follow road edges at plains-equivalent cost and cross otherwise blocked terrain when rubble does not suppress the cell.
   * When to use: `buildTacticalTerrainKindResolverFromSnapshot` transport edges and ranged transport targeting.
   * Expected outcome: When present, keys are a subset of `res4ChildH3Indexes`; each array length matches bundled `terrain_res4_road_rail_sides.json` for that cell.
   * Exceptions: Omitted when cache is empty or cell has no road overlay row.
   */
  res4RoadSidesByH3?: Record<string, readonly boolean[]>;
  /**
   * Per-res4 rail side masks paired in length with `res4RoadSidesByH3` for the same cell keys.
   *
   * Contract: Optional map keyed like `res4RoadSidesByH3` with parallel rail-side boolean arrays per cell.
   * Purpose: Same gameplay contract as roads for tactical transport links.
   * When to use: Same as `res4RoadSidesByH3`.
   * Expected outcome: Parallel arrays per `h3Index`; omitted when absent.
   * Exceptions: None.
   */
  res4RailSidesByH3?: Record<string, readonly boolean[]>;
  /**
   * Per-parent tactical baseline counts captured when this battle snapshot was created.
   *
   * Contract: Keys are strategic parent unit ids present at tactical start; values are positive integers equal to how many sub-units were actually placed for that parent.
   * When to use: Tactical bailout threshold mapping back to strategic unit survival.
   * Expected outcome: Present on newly created snapshots; may be absent on legacy persisted snapshots.
   * Exceptions: None.
   */
  initialPlacedSubUnitCountByParentId?: Record<string, number>;
  /**
   * All tactical sub-units spawned for this battle.
   *
   * Contract: May be shorter than theoretical totals when parents are unplaceable.
   * When to use: Tactical `drawUnits` input.
   * Expected outcome: Every `h3Index` lies in `res4ChildH3Indexes` and passability holds.
   * Exceptions: None.
   */
  subUnits: TacticalSubUnitSnapshot[];
}

/**
 * IPC result for starting a tactical battle from a contested res1 hex during strategic planning.
 *
 * Contract: Renderer interprets `success` plus optional `battle` and error `reason`.
 * When to use: Return payload from `game:startTacticalBattle` and `GameApi.startTacticalBattle`.
 * Expected outcome: On success, `battle` is defined; on failure, `reason` explains the rejection.
 * Exceptions: None.
 */
export interface StartTacticalBattleIpcResult {
  /**
   * True when a tactical session was created and a snapshot is returned.
   *
   * Contract: Mutually exclusive with returning a populated `battle` when false.
   * When to use: Branching renderer flows after `startTacticalBattle` IPC.
   * Expected outcome: Boolean reflects main-process validation and snapshot build outcome.
   * Exceptions: None.
   */
  success: boolean;
  /**
   * Human-readable failure explanation when `success` is false.
   *
   * Contract: English short phrase suitable for map toasts.
   * When to use: Display when tactical start is rejected.
   * Expected outcome: Defined whenever `success` is false for well-behaved handlers.
   * Exceptions: None.
   */
  reason?: string;
  /**
   * Tactical snapshot for renderer when `success` is true.
   *
   * Contract: Serializable tactical layout including sub-units and res4 footprint.
   * When to use: Assigned to renderer shared state to enter tactical map mode.
   * Expected outcome: Defined iff `success` is true and validation passed.
   * Exceptions: None.
   */
  battle?: TacticalBattleSnapshot;
  /**
   * Parent units that could not be given tactical sub-units (e.g. no passable res4 cell).
   *
   * Contract: Each entry matches a parent display name; may be empty or omitted when none skipped.
   * When to use: Renderer shows a single error-style toast listing skipped parents.
   * Expected outcome: Omitted or empty when every parent received tactical placement.
   * Exceptions: None.
   */
  skippedParentDisplayNames?: string[];
}

/**
 * IPC result for ending the active tactical battle and returning to strategic planning.
 *
 * Contract: Acknowledges main-process session teardown without embedding new game state; human voluntary exit may apply bailout threshold elimination to strategic parents first.
 * When to use: After `game:endTacticalBattle` when returning to strategic planning view.
 * Expected outcome: `success` true when a session was cleared or none was active per handler policy.
 * Exceptions: None.
 */
export interface EndTacticalBattleIpcResult {
  /**
   * True when the end handler completed without transport-level failure.
   *
   * Contract: Renderer should still refresh `getGameState` after a successful end.
   * When to use: Branching UI cleanup after tactical exit.
   * Expected outcome: Normally true for milestone 2.1 synchronous handler.
   * Exceptions: None.
   */
  success: boolean;
  /**
   * Optional failure reason when end cannot be applied.
   *
   * Contract: Present only on failure paths if extended later.
   * When to use: Diagnostics for future multi-step tactical teardown.
   * Expected outcome: Usually omitted in milestone 2.1.
   * Exceptions: None.
   */
  reason?: string;
}

