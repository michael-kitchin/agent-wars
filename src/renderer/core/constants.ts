/** Map background (style guide: neutral, recedes). */
export const BACKGROUND_COLOR = '#e0dcd4';

export const UNIT_RADIUS = 18;
export const PLAYER_COLORS: Record<string, string> = {
  human: '#2e5a7b',
  opponent: '#7b4a2e',
};
export const UNIT_TYPE_LABELS: Record<string, string> = {
  infantry: 'I',
  armor: 'A',
  naval: 'N',
  air: 'S',
};

export const ORDER_LINE_COLOR = '#2e5a7b';
export const ORDER_LINE_WIDTH = 2.5;
export const ORDER_ARROW_SIZE = 10;
export const AI_ORDER_LINE_COLOR = '#7b4a2e';

export const TOOLTIP_OFFSET_PX = 12;
export const TERRAIN_TOOLTIP_DELAY_MS = 750;

export const WORLD_H3_RESOLUTION = 1;
export const DETAIL_H3_RESOLUTION = 4;
export const RES4_SHOW_THRESHOLD_VIEW_FRACTION = 0.8;
export const RES4_HIDE_THRESHOLD_VIEW_FRACTION = 0.7;
export const BUILD_ENTRY_ZOOM_STEPS_FROM_DEFAULT = 2;
export const MAIN_MAP_WHEEL_ZOOM_STEP = 0.5;
export const INITIAL_CAMERA_ZOOM_IN_LEVELS = 1;

/** Tool group id and label for the Tools tab. Fallback when getToolGroupList is unavailable; order matches main registry. */
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

export const UNIT_SELECT_GLYPH = '+';
export const UNIT_DESELECT_GLYPH = '-';

export const TOAST_DURATION_MS = 24_000;
export const READY_REQUEST_TIMEOUT_MS = 120_000;

export const UNIT_ICON_HIT_PAD_PX = 2;
export const BUILD_ENTRY_HIT_PAD_PX = 2;

export const STACK_OFFSET_X = 6;
export const STACK_OFFSET_Y = -3;
export const COUNT_BADGE_OFFSET = 16;
export const MULTI_PLAYER_FILL = '#b0b0b0';
export const MULTI_PLAYER_STROKE = '#000';

export const LIGHTNING_COLOR = '#f0d000';
export const CASUALTY_X_COLOR = '#c03030';
