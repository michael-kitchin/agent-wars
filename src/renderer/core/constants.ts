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
   * Documents the object literal property `human` (human: '#2e5a7b').

   * Purpose: Supports maintainability by documenting why `human` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
human: '#2e5a7b',
    /**
   * Documents the object literal property `opponent` (opponent: '#7b4a2e').

   * Purpose: Supports maintainability by documenting why `opponent` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
opponent: '#7b4a2e',
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
export const ORDER_LINE_COLOR = '#2e5a7b';
/**
 * Documents the module-scope binding `ORDER_LINE_WIDTH` (ORDER_LINE_WIDTH).

 * Purpose: Supports maintainability by documenting why `ORDER_LINE_WIDTH` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const ORDER_LINE_WIDTH = 2.5;

/**
 * Stroke color for pending human ranged-attack overlay lines (matches `drawRangedAttackLines`).
 *
 * Purpose: Keeps hover targeting previews visually aligned with committed ranged order graphics.
 * When to use: `orderDrawing.drawRangedAttackLines` and `hoverPreview` ranged targeting hover.
 * Expected outcome: Same `#a06020` tone everywhere ranged pending geometry is drawn.
 * Exceptions: None.
 */
export const PENDING_RANGED_ORDER_LINE_COLOR = '#a06020';

/**
 * Stroke color for pending human air-strike overlay lines (matches `drawAirStrikeLines`).
 *
 * Purpose: Keeps hover targeting previews visually aligned with committed air-strike order graphics.
 * When to use: `orderDrawing.drawAirStrikeLines` and `hoverPreview` air targeting hover.
 * Expected outcome: Same `#7a3db5` tone everywhere air-strike pending geometry is drawn.
 * Exceptions: None.
 */
export const PENDING_AIR_STRIKE_ORDER_LINE_COLOR = '#7a3db5';
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
export const AI_ORDER_LINE_COLOR = '#7b4a2e';

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
