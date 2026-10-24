/**
 * Copy-button labels and the first-opponent key fill for a new game.
 *
 * Purpose: The new-game screen decides those words and which row receives the remembered key
 * without reading the database.
 * When to use: While rendering a commander popover on the new-game screen, and after the rows are rebuilt.
 * Expected outcome: The first AI row can show a remembered key. Later rows copy the AI row just above them.
 * Exceptions: None.
 */

import type { NewGameCommanderInput } from './ipc/ordersTypes';
import { type NewGameSidesState, rowLabel } from './newGameSides';
import { AI_SEAT_KIND, type DoctrineChoice } from './seatRoster';

/**
 * One remembered AI commander, in AI-number order.
 *
 * Purpose: The next new game can fill the first opponent and copy the last match.
 * When to use: The stored snapshot and the copy button for the first AI row.
 * Expected outcome: Index 0 is AI number 1. `apiKey` is trimmed and may be empty.
 * Exceptions: None.
 */
export interface RememberedCommander {
  /**
   * Model id stored for that opponent, or null when it used standing orders.
   *
   * Contract: Null means no model. A string is the model id.
   * When to use: Copy from last game and the next match's first row.
   * Expected outcome: Copied onto the row as `modelId`.
   * Exceptions: None.
   */
  readonly modelId: string | null;
  /**
   * Reasoning effort stored for that opponent, or null for the model default.
   *
   * Contract: Null means the model default.
   * When to use: Copy from last game.
   * Expected outcome: Copied onto the row as `reasoningEffort`.
   * Exceptions: None.
   */
  readonly reasoningEffort: string | null;
  /**
   * Doctrine choice stored for that opponent.
   *
   * Contract: One of `DOCTRINE_CHOICES`.
   * When to use: Copy from last game.
   * Expected outcome: Copied onto the row as `doctrineChoice`.
   * Exceptions: None.
   */
  readonly doctrineChoice: DoctrineChoice;
  /**
   * OpenRouter key stored for that opponent.
   *
   * Contract: Trimmed. Empty means that opponent had no key.
   * When to use: Prefill of the first AI row, and copy from last game.
   * Expected outcome: Copied into a password field. It is not logged.
   * Exceptions: None.
   */
  readonly apiKey: string;
}

/**
 * The remembered snapshot the screen reads.
 *
 * Purpose: The new-game overlay fills the first key and decides whether copy-from-last-game is enabled.
 * When to use: The result of the commander-memory IPC.
 * Expected outcome: `hasPreviousMatch` is false until a match has been snapshotted. `prefillApiKey` is then the first entry's key.
 * Exceptions: None.
 */
export interface CommanderKeyMemoryView {
  /**
   * Whether a match snapshot is stored.
   *
   * Contract: False when no snapshot has been written. True for a stored array, including an empty one.
   * When to use: The first AI row's copy button.
   * Expected outcome: False keeps that button disabled.
   * Exceptions: None.
   */
  readonly hasPreviousMatch: boolean;
  /**
   * Key to put on the first AI row of a new game.
   *
   * Contract: The legacy key when no snapshot exists. The first snapshot entry's key when one does, which may be empty.
   * When to use: After the new-game rows are rebuilt.
   * Expected outcome: A string. It is not logged.
   * Exceptions: None.
   */
  readonly prefillApiKey: string;
  /**
   * Remembered commanders in AI-number order.
   *
   * Contract: Empty when no snapshot exists. Otherwise the stored array.
   * When to use: Copy from last game, which reads index 0.
   * Expected outcome: Index 0 is the first AI opponent.
   * Exceptions: None.
   */
  readonly previousMatch: readonly RememberedCommander[];
}

/**
 * Which row a copy button reads.
 *
 * Purpose: The screen copies either the remembered match or the previous AI row.
 * When to use: The result of `copyButtonState`.
 * Expected outcome: `previous-match` is only the first AI row. `previous-opponent` is every later AI row.
 * Exceptions: None.
 */
export type CommanderCopySource = 'previous-match' | 'previous-opponent';

/**
 * The copy control for one new-game row.
 *
 * Purpose: The popover shows this label and ignores clicks while `disabled` is true.
 * When to use: The result of `copyButtonState` for an AI row.
 * Expected outcome: A human row has no button. The first AI row names the last game. A later row names the row above it.
 * Exceptions: None.
 */
export interface CommanderCopyButtonState {
  /**
   * The button text.
   *
   * Contract: `No previous game`, `Copy from Last Game (...)`, or `Copy from ` plus a row label.
   * When to use: The button's text content.
   * Expected outcome: Observe uses Side names. A human game uses Opponent names.
   * Exceptions: None.
   */
  readonly label: string;
  /**
   * Whether the button ignores clicks.
   *
   * Contract: True only for the first AI row when no match has been remembered.
   * When to use: The button's disabled attribute.
   * Expected outcome: Later AI rows stay enabled.
   * Exceptions: None.
   */
  readonly disabled: boolean;
  /**
   * Where the copied commander comes from.
   *
   * Contract: `previous-match` or `previous-opponent`.
   * When to use: The click handler.
   * Expected outcome: The screen reads the remembered match or the previous AI row.
   * Exceptions: None.
   */
  readonly source: CommanderCopySource;
}

/**
 * Reads the trimmed key on a commander.
 *
 * Purpose: A missing commander and a missing key are the same as a blank key.
 * When to use: Prefill, copy, and the start payload.
 * Expected outcome: Leading and trailing spaces are removed. Null returns `''`.
 * Exceptions: None.
 */
export function commanderApiKey(commander: NewGameCommanderInput | null): string {
  return commander?.apiKey?.trim() ?? '';
}

/**
 * Puts a key on the first AI row only.
 *
 * Purpose: A new game starts with the remembered key on opponent 1, or side 1 while observing.
 * When to use: After the rows are rebuilt, and after Observe is toggled.
 * Expected outcome: That row's commander is a new object. Other rows keep their commander objects. A state with no AI row is returned unchanged.
 * Exceptions: None.
 */
export function prefillFirstAiApiKey(state: NewGameSidesState, apiKey: string): NewGameSidesState {
  const index = state.rows.findIndex((row) => row.kind === AI_SEAT_KIND);
  if (index < 0) return state;
  const row = state.rows[index]!;
  const commander = row.commander ?? { modelId: null, reasoningEffort: null, doctrineChoice: 'balanced' };
  const rows = state.rows.map((entry, rowIndex) =>
    rowIndex === index ? { ...entry, commander: { ...commander, apiKey: apiKey.trim() } } : entry
  );
  return { ...state, rows };
}

/**
 * Finds the AI row immediately before this one.
 *
 * Purpose: Opponent 3 copies opponent 2, and opponent 2 copies opponent 1.
 * When to use: The copy button for a later AI row.
 * Expected outcome: The earlier AI row's index, or null for the first AI row and for an index outside the list.
 * Exceptions: None.
 */
export function previousAiRowIndex(state: NewGameSidesState, index: number): number | null {
  if (index < 0 || index >= state.rows.length) return null;
  if (state.rows[index]?.kind !== AI_SEAT_KIND) return null;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (state.rows[cursor]?.kind === AI_SEAT_KIND) return cursor;
  }
  return null;
}

/**
 * Builds the copy button for one row.
 *
 * Purpose: The new-game popover pulls from the last game or the previous opponent.
 * When to use: While opening that row's commander popover.
 * Expected outcome: Null for a human row or a bad index. The first AI row is disabled with `No previous game` until a match has been remembered.
 * Exceptions: None.
 */
export function copyButtonState(
  state: NewGameSidesState,
  index: number,
  hasPreviousMatch: boolean
): CommanderCopyButtonState | null {
  if (index < 0 || index >= state.rows.length) return null;
  if (state.rows[index]?.kind !== AI_SEAT_KIND) return null;
  const previous = previousAiRowIndex(state, index);
  if (previous === null) {
    if (!hasPreviousMatch) return { label: 'No previous game', disabled: true, source: 'previous-match' };
    return { label: `Copy from Last Game (${rowLabel(state, index)})`, disabled: false, source: 'previous-match' };
  }
  return { label: `Copy from ${rowLabel(state, previous)}`, disabled: false, source: 'previous-opponent' };
}
