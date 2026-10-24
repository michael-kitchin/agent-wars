import type { NewGameCommanderInput, NewGameSeatInput } from './ipc/ordersTypes';
import { MAX_SEATS, MIN_SEATS, HUMAN_SEAT_ID } from './seatIds';

/**
 * One home the new-game screen can assign.
 *
 * Purpose: Regional rows use a side-group id. Global rows use a UN subregion name for both fields.
 * When to use: Every home list passed into this module.
 * Expected outcome: `key` is what the match stores. `label` is what the row shows.
 * Exceptions: None.
 */
export interface HomeOption {
  /**
   * Stored home id.
   *
   * Contract: A side-group id or a UN subregion name.
   * When to use: The value of a home select.
   * Expected outcome: Unique within one map's list.
   * Exceptions: None.
   */
  readonly key: string;
  /**
   * Name shown in the home select.
   *
   * Contract: The side-group display name, or the same string as `key` on the global map.
   * When to use: Option text.
   * Expected outcome: A non-empty label.
   * Exceptions: None.
   */
  readonly label: string;
}

/**
 * One side row on the new-game screen.
 *
 * Purpose: The screen edits this list, then sends it as `seats`.
 * When to use: `NewGameSidesState.rows`.
 * Expected outcome: The first row is human unless Observe is on.
 * Exceptions: None.
 */
export interface NewGameSideRow {
  /**
   * Whether a person or a commander plays the row.
   *
   * Contract: `HUMAN_SEAT_ID` or `'ai'`. Observe has no human row.
   * When to use: Labels and the start payload.
   * Expected outcome: At most one human row.
   * Exceptions: None.
   */
  readonly kind: 'human' | 'ai';
  /**
   * Home assigned to the row.
   *
   * Contract: A `HomeOption.key`, or null when none is free.
   * When to use: The home select's value.
   * Expected outcome: Null blocks Start.
   * Exceptions: None.
   */
  readonly homeKey: string | null;
  /**
   * Commander for an AI row.
   *
   * Contract: Null on the human row.
   * When to use: The summary button and the start payload.
   * Expected outcome: A model, an effort, and a doctrine, or null for the human.
   * Exceptions: None.
   */
  readonly commander: NewGameCommanderInput | null;
}

/**
 * The Sides section.
 *
 * Purpose: One object the screen renders and the start button reads.
 * When to use: After `initialSidesState`, and after each edit.
 * Expected outcome: `rows` stays between two and four when enough homes exist.
 * Exceptions: None.
 */
export interface NewGameSidesState {
  /**
   * Which tab the rows were built for.
   *
   * Contract: `'global'` or `'regional'`.
   * When to use: `buildSeatsPayload`.
   * Expected outcome: Global rows store `homeRegion`. Regional rows store `sideGroupId`.
   * Exceptions: None.
   */
  readonly mapKind: 'global' | 'regional';
  /**
   * Whether every row is an AI commander.
   *
   * Contract: True hides the human row.
   * When to use: Captions and row labels.
   * Expected outcome: The first row is AI while this is true.
   * Exceptions: None.
   */
  readonly observeOnly: boolean;
  /**
   * Side rows in seat order.
   *
   * Contract: Index 0 is seat 1.
   * When to use: Rendering and the start payload.
   * Expected outcome: Two to four rows when the map has that many homes.
   * Exceptions: None.
   */
  readonly rows: readonly NewGameSideRow[];
}

/**
 * One home as a single row's select should show it.
 *
 * Purpose: A home another row took is visible but not selectable.
 * When to use: Filling one row's select.
 * Expected outcome: `takenBy` is that row's label, or null when the home is free.
 * Exceptions: None.
 */
export interface HomeOptionForRow {
  /**
   * Stored home id.
   *
   * Contract: The same key as `HomeOption.key`.
   * When to use: The option value.
   * Expected outcome: Stable for the life of the list.
   * Exceptions: None.
   */
  readonly key: string;
  /**
   * Home name, without the taking row's name.
   *
   * Contract: The option text adds " · {takenBy}" when `disabled` is true.
   * When to use: The option label.
   * Expected outcome: The home's display name.
   * Exceptions: None.
   */
  readonly label: string;
  /**
   * Whether another row already has this home.
   *
   * Contract: The row's own home is not disabled.
   * When to use: The option's disabled flag.
   * Expected outcome: True when `takenBy` is set.
   * Exceptions: None.
   */
  readonly disabled: boolean;
  /**
   * Label of the row that took this home.
   *
   * Contract: Null when the home is free or it is this row's home.
   * When to use: The suffix after the home name.
   * Expected outcome: "You", "Opponent 1", or "Side 2".
   * Exceptions: None.
   */
  readonly takenBy: string | null;
}

/**
 * Builds the starting rows for a map.
 *
 * Purpose: A new tab or map starts from two distinct homes, or keeps the current count when asked.
 * When to use: When the overlay opens, and when the tab or regional map changes.
 * Expected outcome: Human plus AI rows, distinct homes from the front of `homes`, capped by the homes and by four.
 *   `rowCount` keeps a larger list when enough homes remain.
 * Exceptions: None. Fewer than two homes yields fewer than two rows.
 */
export function initialSidesState(args: {
  readonly mapKind: 'global' | 'regional';
  readonly homes: readonly HomeOption[];
  readonly defaultCommander: NewGameCommanderInput;
  readonly rowCount?: number;
}): NewGameSidesState {
  const requested = args.rowCount ?? MIN_SEATS;
  const count = Math.min(MAX_SEATS, args.homes.length, Math.max(0, requested));
  const rows = args.homes.slice(0, count).map((home, index): NewGameSideRow => ({
    kind: index === 0 ? HUMAN_SEAT_ID : 'ai',
    homeKey: home.key,
    commander: index === 0 ? null : args.defaultCommander,
  }));
  return { mapKind: args.mapKind, observeOnly: false, rows };
}

/**
 * Turns Observe on or off without moving homes.
 *
 * Purpose: Observe replaces "You" with an AI side, and turning it off brings "You" back.
 * When to use: The Observe checkbox.
 * Expected outcome: The first row becomes AI with `defaultCommander` when it had none, or human with a null commander.
 *   Later rows stay as they are.
 * Exceptions: None.
 */
export function setObserveOnly(
  state: NewGameSidesState,
  on: boolean,
  defaultCommander: NewGameCommanderInput
): NewGameSidesState {
  if (state.rows.length === 0) return { ...state, observeOnly: on };
  const first = state.rows[0]!;
  const nextFirst: NewGameSideRow = on
    ? { ...first, kind: 'ai', commander: first.commander ?? defaultCommander }
    : { ...first, kind: HUMAN_SEAT_ID, commander: null };
  return { ...state, observeOnly: on, rows: [nextFirst, ...state.rows.slice(1)] };
}

/**
 * Adds an AI row on the first free home.
 *
 * Purpose: The add button grows the match by one side.
 * When to use: When `addRowBlockedReason` is null.
 * Expected outcome: The same state when no home is free or four sides are already listed. Otherwise one new AI row.
 * Exceptions: None.
 */
export function addSideRow(
  state: NewGameSidesState,
  homes: readonly HomeOption[],
  defaultCommander: NewGameCommanderInput
): NewGameSidesState {
  if (addRowBlockedReason(state, homes)) return state;
  const taken = new Set(state.rows.map((row) => row.homeKey));
  const free = homes.find((home) => !taken.has(home.key));
  if (!free) return state;
  const row: NewGameSideRow = { kind: 'ai', homeKey: free.key, commander: defaultCommander };
  return { ...state, rows: [...state.rows, row] };
}

/**
 * Drops one row.
 *
 * Purpose: A player can remove an extra side.
 * When to use: A row's remove button.
 * Expected outcome: The same state at two rows, or when `index` is outside the list. Otherwise that row is gone.
 * Exceptions: None.
 */
export function removeSideRow(state: NewGameSidesState, index: number): NewGameSidesState {
  if (state.rows.length <= MIN_SEATS) return state;
  if (index < 0 || index >= state.rows.length) return state;
  return { ...state, rows: state.rows.filter((_, rowIndex) => rowIndex !== index) };
}

/**
 * Sets one row's home when no other row has it.
 *
 * Purpose: Two sides cannot share a home.
 * When to use: A home select.
 * Expected outcome: The same state when the home is taken or the index is outside the list. Otherwise that row's home changes.
 * Exceptions: None.
 */
export function setRowHome(state: NewGameSidesState, index: number, homeKey: string): NewGameSidesState {
  if (index < 0 || index >= state.rows.length) return state;
  const taken = state.rows.some((row, rowIndex) => rowIndex !== index && row.homeKey === homeKey);
  if (taken) return state;
  const rows = state.rows.map((row, rowIndex) => (rowIndex === index ? { ...row, homeKey } : row));
  return { ...state, rows };
}

/**
 * Draws a free home for one row, including the home it already has.
 *
 * Purpose: The randomize button matches the old home buttons.
 * When to use: A row's randomize button.
 * Expected outcome: That row's home is one of the homes no other row holds. An empty free list leaves the row unchanged.
 * Exceptions: None.
 */
export function randomizeRowHome(
  state: NewGameSidesState,
  index: number,
  homes: readonly HomeOption[],
  random: () => number
): NewGameSidesState {
  if (index < 0 || index >= state.rows.length) return state;
  const current = state.rows[index]!.homeKey;
  const free = homes.filter((home) => home.key === current || !state.rows.some((row, rowIndex) => rowIndex !== index && row.homeKey === home.key));
  if (free.length === 0) return state;
  const picked = free[Math.min(free.length - 1, Math.floor(random() * free.length))]!;
  return setRowHome(state, index, picked.key);
}

/**
 * Sets one AI row's commander.
 *
 * Purpose: The commander popover edits one side.
 * When to use: After the player changes that row's model, effort, or doctrine.
 * Expected outcome: That AI row keeps the commander. A human row and a missing index stay as they were.
 * Exceptions: None.
 */
export function setRowCommander(
  state: NewGameSidesState,
  index: number,
  commander: NewGameCommanderInput
): NewGameSidesState {
  if (index < 0 || index >= state.rows.length || state.rows[index]!.kind !== 'ai') return state;
  const rows = state.rows.map((row, rowIndex) => (rowIndex === index ? { ...row, commander } : row));
  return { ...state, rows };
}

/**
 * Copies one commander onto every AI row.
 *
 * Purpose: "Use for every opponent" should not invent a commander for You.
 * When to use: The apply-all button in the commander popover.
 * Expected outcome: Every AI row uses `commander`. A human row stays human with a null commander.
 * Exceptions: None.
 */
export function setEveryAiCommander(state: NewGameSidesState, commander: NewGameCommanderInput): NewGameSidesState {
  const rows = state.rows.map((row) => (row.kind === 'ai' ? { ...row, commander } : row));
  return { ...state, rows };
}

/**
 * The label of one row.
 *
 * Purpose: Selects, remove buttons, and taken-home suffixes share one name.
 * When to use: Rendering a row.
 * Expected outcome: "You", "Opponent 1", or, in Observe, "Side 1".
 * Exceptions: None. An index outside the list returns an empty string.
 */
export function rowLabel(state: NewGameSidesState, index: number): string {
  if (index < 0 || index >= state.rows.length) return '';
  if (state.observeOnly) return `Side ${index + 1}`;
  if (state.rows[index]!.kind === HUMAN_SEAT_ID) return 'You';
  const opponentNumber = state.rows.slice(0, index + 1).filter((row) => row.kind === 'ai').length;
  return `Opponent ${opponentNumber}`;
}

/**
 * Homes for one row's select.
 *
 * Purpose: A taken home stays in the list so the player can see who has it.
 * When to use: Each time a row is rendered.
 * Expected outcome: Other rows' homes are disabled and name the row that took them.
 * Exceptions: None.
 */
export function homeOptionsForRow(
  state: NewGameSidesState,
  index: number,
  homes: readonly HomeOption[]
): readonly HomeOptionForRow[] {
  return homes.map((home) => {
    const taker = state.rows.findIndex((row, rowIndex) => rowIndex !== index && row.homeKey === home.key);
    return {
      key: home.key,
      label: home.label,
      disabled: taker >= 0,
      takenBy: taker >= 0 ? rowLabel(state, taker) : null,
    };
  });
}

/**
 * The caption above the rows.
 *
 * Purpose: The player sees how many sides this map can hold.
 * When to use: Above the Observe checkbox.
 * Expected outcome: "{n} of {max} sides in play", or "{n} of {max} sides, all AI" while Observe is on.
 *   `max` is the smaller of four and the home list.
 * Exceptions: None.
 */
export function sidesCaption(state: NewGameSidesState, homes: readonly HomeOption[]): string {
  const max = Math.min(MAX_SEATS, homes.length);
  const noun = state.observeOnly ? `${state.rows.length} of ${max} sides, all AI` : `${state.rows.length} of ${max} sides in play`;
  return noun;
}

/**
 * Why the add button is disabled, or null when a row can be added.
 *
 * Purpose: The button's hint names the limit the player hit.
 * When to use: Before enabling the add button.
 * Expected outcome: "Up to 4 sides" at four rows. "No free side on this map" when every home is taken. Null otherwise.
 * Exceptions: None.
 */
export function addRowBlockedReason(state: NewGameSidesState, homes: readonly HomeOption[]): string | null {
  if (state.rows.length >= MAX_SEATS) return 'Up to 4 sides';
  const taken = new Set(state.rows.map((row) => row.homeKey));
  const free = homes.some((home) => !taken.has(home.key));
  if (!free) return 'No free side on this map';
  return null;
}

/**
 * Why Start should be refused, or null when the rows can start.
 *
 * Purpose: Start needs two sides and a distinct home for each.
 * When to use: The Start click, and to disable the button.
 * Expected outcome: A short reason for too few rows, a missing home, or a shared home. Null when the rows are ready.
 * Exceptions: None.
 */
export function startBlockedReason(state: NewGameSidesState | null): string | null {
  if (!state || state.rows.length < MIN_SEATS) return 'At least 2 sides';
  if (state.rows.some((row) => !row.homeKey)) return 'Each side needs a home';
  const keys = state.rows.map((row) => row.homeKey);
  if (new Set(keys).size !== keys.length) return 'Two sides share a home';
  return null;
}

/**
 * The `seats` array Start sends.
 *
 * Purpose: Row order is seat order.
 * When to use: The Start click, after `startBlockedReason` is null.
 * Expected outcome: Global rows set `homeRegion`. Regional rows set `sideGroupId`. AI rows include their commander.
 * Exceptions: None.
 */
export function buildSeatsPayload(state: NewGameSidesState): readonly NewGameSeatInput[] {
  return state.rows.map((row) => {
    const home = row.homeKey ?? undefined;
    const seat: NewGameSeatInput = state.mapKind === 'global'
      ? { kind: row.kind, homeRegion: home }
      : { kind: row.kind, sideGroupId: home };
    if (row.kind === 'ai' && row.commander) return { ...seat, commander: row.commander };
    return seat;
  });
}
