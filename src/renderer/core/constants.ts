/**
 * Documents the module-scope binding `BACKGROUND_COLOR` (BACKGROUND_COLOR).

 * Purpose: Supports maintainability by documenting why `BACKGROUND_COLOR` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const BACKGROUND_COLOR = '#e0dcd4';

/**
 * Documents the module-scope binding `UNIT_RADIUS` (UNIT_RADIUS).

 * Purpose: Supports maintainability by documenting why `UNIT_RADIUS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const UNIT_RADIUS = 18;
/**
 * Documents the module-scope binding `PLAYER_COLORS` (PLAYER_COLORS: Record<string, string>).

 * Purpose: Supports maintainability by documenting why `PLAYER_COLORS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const PLAYER_COLORS: Record<string, string> = {
    /**
   * Documents the object literal property `human` (human: '#115e59').

   * Purpose: Supports maintainability by documenting why `human` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
human: '#115e59',
    /**
   * Documents the object literal property `opponent` (opponent: '#9d174d').

   * Purpose: Supports maintainability by documenting why `opponent` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
opponent: '#9d174d',
};
/**
 * Documents the module-scope binding `UNIT_TYPE_LABELS` (UNIT_TYPE_LABELS: Record<string, string>).

 * Purpose: Supports maintainability by documenting why `UNIT_TYPE_LABELS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const UNIT_TYPE_LABELS: Record<string, string> = {
    /**
   * Documents the object literal property `infantry` (infantry: 'I').

   * Purpose: Supports maintainability by documenting why `infantry` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
infantry: 'I',
    /**
   * Documents the object literal property `armor` (armor: 'A').

   * Purpose: Supports maintainability by documenting why `armor` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
armor: 'A',
    /**
   * Documents the object literal property `naval` (naval: 'N').

   * Purpose: Supports maintainability by documenting why `naval` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
naval: 'N',
    /**
   * Documents the object literal property `air` (air: 'S').

   * Purpose: Supports maintainability by documenting why `air` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
air: 'S',
};

/**
 * Documents the module-scope binding `ORDER_LINE_COLOR` (ORDER_LINE_COLOR).

 * Purpose: Supports maintainability by documenting why `ORDER_LINE_COLOR` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const ORDER_LINE_COLOR = PLAYER_COLORS.human;
/**
 * Documents the module-scope binding `ORDER_LINE_WIDTH` (ORDER_LINE_WIDTH).

 * Purpose: Supports maintainability by documenting why `ORDER_LINE_WIDTH` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const ORDER_LINE_WIDTH = 2.5;
/**
 * Documents the module-scope binding `ORDER_ARROW_SIZE` (ORDER_ARROW_SIZE).

 * Purpose: Supports maintainability by documenting why `ORDER_ARROW_SIZE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const ORDER_ARROW_SIZE = 10;
/**
 * Documents the module-scope binding `AI_ORDER_LINE_COLOR` (AI_ORDER_LINE_COLOR).

 * Purpose: Supports maintainability by documenting why `AI_ORDER_LINE_COLOR` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const AI_ORDER_LINE_COLOR = PLAYER_COLORS.opponent;

/**
 * Documents the module-scope binding `TOOLTIP_OFFSET_PX` (TOOLTIP_OFFSET_PX).

 * Purpose: Supports maintainability by documenting why `TOOLTIP_OFFSET_PX` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const TOOLTIP_OFFSET_PX = 12;
/**
 * Millisecond hover dwell before the terrain tooltip appears on the main map (res1 and tactical res4).
 *
 * Purpose: Shared delay for strategic hex inspection and tactical battle cells so neither mode feels snappier.
 * When to use: `mainMapInteractions` deferred `showTerrainTooltip` timer after the pointer settles.
 * Expected outcome: Same disclosure timing when zoomed to res4 in strategy or when a tactical session is active.
 * Exceptions: None.
 */
export const TERRAIN_TOOLTIP_DELAY_MS = 750;

/**
 * Wall-clock visibility for the transient “Blocked: …” and “Slower: …” order-preview tooltips that follow the pointer.
 *
 * Purpose: Shorter than map toasts so hints stay lightweight; set to **twice** the hex tooltip dwell delay so blocking
 * hints remain readable while the pointer settles without matching the full strategic terrain dwell.
 * When to use: `orderBlockHexTooltip` and `orderSlowerHexTooltip` auto-hide timers after each reveal / pointer refresh.
 * Expected outcome: Tooltip dismisses after this interval unless refreshed by a new hover evaluation.
 * Exceptions: None.
 */
export const ORDER_BLOCK_HEX_TOOLTIP_TTL_MS = 2 * TERRAIN_TOOLTIP_DELAY_MS;

/**
 * Documents the module-scope binding `WORLD_H3_RESOLUTION` (WORLD_H3_RESOLUTION).

 * Purpose: Supports maintainability by documenting why `WORLD_H3_RESOLUTION` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const WORLD_H3_RESOLUTION = 1;
/**
 * Documents the module-scope binding `DETAIL_H3_RESOLUTION` (DETAIL_H3_RESOLUTION).

 * Purpose: Supports maintainability by documenting why `DETAIL_H3_RESOLUTION` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const DETAIL_H3_RESOLUTION = 4;
/**
 * Documents the module-scope binding `RES4_SHOW_THRESHOLD_VIEW_FRACTION` (RES4_SHOW_THRESHOLD_VIEW_FRACTION).

 * Purpose: Supports maintainability by documenting why `RES4_SHOW_THRESHOLD_VIEW_FRACTION` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const RES4_SHOW_THRESHOLD_VIEW_FRACTION = 0.8;
/**
 * Documents the module-scope binding `RES4_HIDE_THRESHOLD_VIEW_FRACTION` (RES4_HIDE_THRESHOLD_VIEW_FRACTION).

 * Purpose: Supports maintainability by documenting why `RES4_HIDE_THRESHOLD_VIEW_FRACTION` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const RES4_HIDE_THRESHOLD_VIEW_FRACTION = 0.7;
/**
 * Documents the module-scope binding `BUILD_ENTRY_ZOOM_STEPS_FROM_DEFAULT` (BUILD_ENTRY_ZOOM_STEPS_FROM_DEFAULT).

 * Purpose: Supports maintainability by documenting why `BUILD_ENTRY_ZOOM_STEPS_FROM_DEFAULT` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const BUILD_ENTRY_ZOOM_STEPS_FROM_DEFAULT = 2;
/**
 * Documents the module-scope binding `MAIN_MAP_WHEEL_ZOOM_STEP` (MAIN_MAP_WHEEL_ZOOM_STEP).

 * Purpose: Supports maintainability by documenting why `MAIN_MAP_WHEEL_ZOOM_STEP` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const MAIN_MAP_WHEEL_ZOOM_STEP = 0.5;
/**
 * Documents the module-scope binding `INITIAL_CAMERA_ZOOM_IN_LEVELS` (INITIAL_CAMERA_ZOOM_IN_LEVELS).

 * Purpose: Supports maintainability by documenting why `INITIAL_CAMERA_ZOOM_IN_LEVELS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const INITIAL_CAMERA_ZOOM_IN_LEVELS = 1;

/**
 * Documents the module-scope binding `OPENROUTER_TOOL_GROUPS` (OPENROUTER_TOOL_GROUPS: { id: string; label: string }[]).

 * Purpose: Supports maintainability by documenting why `OPENROUTER_TOOL_GROUPS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const OPENROUTER_TOOL_GROUPS: { id: string; label: string }[] = [
  { id: 'precomputation', label: 'Precomputation' },
  { id: 'events', label: 'Events' },
  { id: 'planning', label: 'Planning' },
  { id: 'assessment', label: 'Assessment' },
  { id: 'estimation', label: 'Estimation' },
  { id: 'memory', label: 'Memory' },
  { id: 'orders', label: 'Orders' },
  { id: 'production', label: 'Production' },
];

/**
 * Documents the module-scope binding `UNIT_SELECT_GLYPH` (UNIT_SELECT_GLYPH).

 * Purpose: Supports maintainability by documenting why `UNIT_SELECT_GLYPH` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const UNIT_SELECT_GLYPH = '+';
/**
 * Documents the module-scope binding `UNIT_DESELECT_GLYPH` (UNIT_DESELECT_GLYPH).

 * Purpose: Supports maintainability by documenting why `UNIT_DESELECT_GLYPH` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const UNIT_DESELECT_GLYPH = '-';

/**
 * Documents the module-scope binding `TOAST_DURATION_MS` (TOAST_DURATION_MS).

 * Purpose: Supports maintainability by documenting why `TOAST_DURATION_MS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const TOAST_DURATION_MS = 24_000;
/**
 * Documents the module-scope binding `READY_REQUEST_TIMEOUT_MS` (READY_REQUEST_TIMEOUT_MS).

 * Purpose: Supports maintainability by documenting why `READY_REQUEST_TIMEOUT_MS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const READY_REQUEST_TIMEOUT_MS = 120_000;

/**
 * Poll interval while waiting for `S.backgroundRequestInFlight` to clear after a tactical advance turn.
 *
 * Purpose: Keeps the renderer responsive while milestone-2.1 tactical “resolution” waits on background `requestAiOrders`.
 * When to use: Only from `performTacticalAdvanceTurn` while tactical mode is active and Run may trigger AI.
 * Expected outcome: Small sleeps between checks until the in-flight flag clears or timeout elapses.
 * Exceptions: None.
 */
export const TACTICAL_ADVANCE_BACKGROUND_AI_POLL_MS = 50;

/**
 * Upper bound for waiting on background AI after advancing the tactical turn counter.
 *
 * Purpose: Slightly exceeds `BACKGROUND_AI_REQUEST_TIMEOUT_MS` in `openRouterRuntime` so the advance-turn waiter does not give up first.
 * When to use: Paired with `TACTICAL_ADVANCE_BACKGROUND_AI_POLL_MS` in tactical advance resolution.
 * Expected outcome: If AI still runs past this window, tactical planning re-enables anyway to avoid a soft-locked Exit control.
 * Exceptions: None.
 */
export const TACTICAL_ADVANCE_BACKGROUND_AI_TIMEOUT_MS = 80_000;

/**
 * Documents the module-scope binding `UNIT_ICON_HIT_PAD_PX` (UNIT_ICON_HIT_PAD_PX).

 * Purpose: Supports maintainability by documenting why `UNIT_ICON_HIT_PAD_PX` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const UNIT_ICON_HIT_PAD_PX = 2;
/**
 * Documents the module-scope binding `BUILD_ENTRY_HIT_PAD_PX` (BUILD_ENTRY_HIT_PAD_PX).

 * Purpose: Supports maintainability by documenting why `BUILD_ENTRY_HIT_PAD_PX` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const BUILD_ENTRY_HIT_PAD_PX = 2;

/**
 * Documents the module-scope binding `TACTICAL_ENTRY_HIT_PAD_PX` (TACTICAL_ENTRY_HIT_PAD_PX).

 * Purpose: Expands tactical-entry button hit targets on the map to match the magnifier affordance (kept ~2× the prior pad after the tactical button glyph was doubled in `static/index.html`).
 * When to use: Pointer hit-tests and hover cursors for `#tactical-entry-layer` buttons.
 * Expected outcome: Clicks register slightly outside the visible button bounds for usability.
 * Exceptions: None.
 */
export const TACTICAL_ENTRY_HIT_PAD_PX = 6;

/**
 * Documents the module-scope binding `STACK_OFFSET_X` (STACK_OFFSET_X).

 * Purpose: Supports maintainability by documenting why `STACK_OFFSET_X` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const STACK_OFFSET_X = 6;
/**
 * Documents the module-scope binding `STACK_OFFSET_Y` (STACK_OFFSET_Y).

 * Purpose: Supports maintainability by documenting why `STACK_OFFSET_Y` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const STACK_OFFSET_Y = -3;
/**
 * Documents the module-scope binding `COUNT_BADGE_OFFSET` (COUNT_BADGE_OFFSET).

 * Purpose: Supports maintainability by documenting why `COUNT_BADGE_OFFSET` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const COUNT_BADGE_OFFSET = 16;
/**
 * Documents the module-scope binding `MULTI_PLAYER_FILL` (MULTI_PLAYER_FILL).

 * Purpose: Supports maintainability by documenting why `MULTI_PLAYER_FILL` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const MULTI_PLAYER_FILL = '#b0b0b0';
/**
 * Documents the module-scope binding `MULTI_PLAYER_STROKE` (MULTI_PLAYER_STROKE).

 * Purpose: Supports maintainability by documenting why `MULTI_PLAYER_STROKE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const MULTI_PLAYER_STROKE = '#000';

/**
 * Documents the module-scope binding `LIGHTNING_COLOR` (LIGHTNING_COLOR).

 * Purpose: Supports maintainability by documenting why `LIGHTNING_COLOR` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const LIGHTNING_COLOR = '#f0d000';
/**
 * Documents the module-scope binding `CASUALTY_X_COLOR` (CASUALTY_X_COLOR).

 * Purpose: Supports maintainability by documenting why `CASUALTY_X_COLOR` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const CASUALTY_X_COLOR = '#c03030';

/**
 * Stroke color for ranged-attack perimeter, planned, and planning-hover lines.
 *
 * Purpose: Distinguishes ranged targeting geometry from air-strike strokes at a glance.
 * When to use: Ranged branch of support-line drawing (`drawRangePerimeterOverlay`, `drawRangedAttackLines`, support hover).
 * Expected outcome: Burnt orange outline and connector lines for ranged planning.
 * Exceptions: None.
 */
export const RANGE_PERIMETER_RANGED_COLOR = '#a06020';

/**
 * Stroke color for air-strike perimeter, planned, and planning-hover lines.
 *
 * Purpose: Distinguishes air-strike targeting geometry from ranged strokes at a glance.
 * When to use: Air-strike branch of support-line drawing (`drawRangePerimeterOverlay`, `drawAirStrikeLines`, support hover).
 * Expected outcome: Violet outline and connector lines for air-strike planning.
 * Exceptions: None.
 */
export const RANGE_PERIMETER_AIR_STRIKE_COLOR = '#7a3db5';

/**
 * Multiplier applied to home-region outer ownership line width for the range perimeter stroke.
 *
 * Purpose: Scales support-line thickness relative to the outer home-region ownership border at the current zoom.
 * When to use: `getRangePerimeterSupportLineWidth`.
 * Expected outcome: `getHomeRegionOwnershipLineWidth(zoom) * RANGE_PERIMETER_WIDTH_MULTIPLIER` (1.5× home border).
 * Exceptions: None.
 */
export const RANGE_PERIMETER_WIDTH_MULTIPLIER = 1.5;

/**
 * Opacity for ranged/air-strike perimeter, planning hover, and planned support lines.
 *
 * Purpose: Keeps all support-attack overlay strokes at a consistent 75% opacity.
 * When to use: `drawRangePerimeterOverlay`, support hover in `drawHoverRoutePreview`, and `drawRangedAttackLines` / `drawAirStrikeLines`.
 * Expected outcome: `globalAlpha = 0.75` for perimeter, hover, and committed pending attack/strike connectors.
 * Exceptions: None.
 */
export const RANGE_PERIMETER_ALPHA = 0.75;

/**
 * Solid segment length as a fraction of perimeter line width (dash portion of 1:1 solid:gap).
 *
 * Purpose: Keeps dash scale proportional when zoom changes home-border-derived width.
 * When to use: `setLineDash` first element for range perimeter.
 * Expected outcome: Dash length equals line width when above minimum pixel floor.
 * Exceptions: None.
 */
export const RANGE_PERIMETER_DASH_SOLID_FRACTION = 1.0;

/**
 * Gap length as a fraction of perimeter line width (gap portion of 1:1 solid:gap).
 *
 * Purpose: Equal-length gaps and solid segments for the range perimeter stroke.
 * When to use: `setLineDash` second element for range perimeter.
 * Expected outcome: Gap length matches solid segment scaling (`lineWidth * this` above minimum).
 * Exceptions: None.
 */
export const RANGE_PERIMETER_DASH_GAP_FRACTION = 1.0;

/**
 * Minimum solid dash length in screen pixels for the range perimeter stroke.
 *
 * Purpose: Keeps dashes readable when line width matches the thin home border (1×).
 * When to use: `drawRangePerimeterOverlay` dash array sizing.
 * Expected outcome: `Math.max(this, lineWidth * RANGE_PERIMETER_DASH_SOLID_FRACTION)` for the solid segment.
 * Exceptions: None.
 */
export const RANGE_PERIMETER_DASH_MIN_SOLID_PX = 8;

/**
 * Minimum gap length in screen pixels between range perimeter dashes.
 *
 * Purpose: Ensures visible gaps at 1× home-border stroke width.
 * When to use: `drawRangePerimeterOverlay` dash array sizing.
 * Expected outcome: `Math.max(this, lineWidth * RANGE_PERIMETER_DASH_GAP_FRACTION)` for the gap segment.
 * Exceptions: None.
 */
export const RANGE_PERIMETER_DASH_MIN_GAP_PX = 8;

/**
 * Solid segment length as a fraction of line width for air-strike perimeter dashes (1:1 solid:gap — 50/50).
 *
 * Purpose: Keeps air-strike dash spacing consistent with planned and hover air-strike lines.
 * When to use: `drawRangePerimeterOverlay` when `airStrikeModeActive` is true.
 * Expected outcome: Solid segment length equals line width when above minimum pixel floor.
 * Exceptions: None.
 */
export const RANGE_PERIMETER_AIR_STRIKE_DASH_SOLID_FRACTION = 1.0;

/**
 * Gap length as a fraction of line width for air-strike perimeter dashes (1:1 solid:gap — 50/50).
 *
 * Purpose: Equal-length gaps and solid segments for air-strike planning strokes.
 * When to use: `drawRangePerimeterOverlay` when `airStrikeModeActive` is true.
 * Expected outcome: Gap length matches solid segment scaling (`lineWidth * this` above minimum).
 * Exceptions: None.
 */
export const RANGE_PERIMETER_AIR_STRIKE_DASH_GAP_FRACTION = 1.0;

/**
 * Minimum solid dash length in screen pixels for air-strike range perimeter (50/50 dash pattern).
 *
 * Purpose: Keeps dashes readable at perimeter line width.
 * When to use: Air-strike branch of `drawRangePerimeterOverlay` dash sizing.
 * Expected outcome: `Math.max(this, lineWidth * RANGE_PERIMETER_AIR_STRIKE_DASH_SOLID_FRACTION)`.
 * Exceptions: None.
 */
export const RANGE_PERIMETER_AIR_STRIKE_DASH_MIN_SOLID_PX = 8;

/**
 * Minimum gap length in screen pixels for air-strike range perimeter (50/50 dash pattern).
 *
 * Purpose: Ensures visible gaps at air-strike perimeter stroke width.
 * When to use: Air-strike branch of `drawRangePerimeterOverlay` dash sizing.
 * Expected outcome: `Math.max(this, lineWidth * RANGE_PERIMETER_AIR_STRIKE_DASH_GAP_FRACTION)`.
 * Exceptions: None.
 */
export const RANGE_PERIMETER_AIR_STRIKE_DASH_MIN_GAP_PX = 8;

/**
 * Flow speed for animated range perimeter dashes in screen pixels per second.
 *
 * Purpose: Drives `lineDashOffset` advance each animation frame (half of the original 24 px/s rate).
 * When to use: `drawRangePerimeterOverlay` dash phase calculation.
 * Expected outcome: Visible forward flow along the perimeter path at a moderate pace.
 * Exceptions: None.
 */
export const RANGE_PERIMETER_FLOW_PX_PER_SEC = 12;
