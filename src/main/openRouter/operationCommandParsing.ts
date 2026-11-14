/**
 * Reads launch and cancel commands from a reply's `operations` array.
 *
 * Purpose: A bad command becomes a drop reason. It must not reject the rest of the reply.
 * When to use: While parsing a strategic orders envelope. A tactical reply does not call this.
 * Expected outcome: At most one launch, and every well-formed cancel, in the order they appeared.
 * Exceptions: None.
 */

import { logTrace } from '../logger';
import { OPERATION_OPTION_LETTERS } from '../operations/operationRules';

/**
 * One command the commander asked the engine to carry out.
 *
 * Purpose: The apply step branches on `action` without reading the raw reply again.
 * When to use: The `commands` list from `normalizeOperationCommands`.
 * Expected outcome: A launch names a letter. A cancel names an operation id.
 * Exceptions: None.
 */
export type OperationCommand =
  | { readonly action: 'launch'; readonly option: string }
  | { readonly action: 'cancel'; readonly id: string };

/**
 * The sentence for an entry that is neither a launch nor a cancel.
 *
 * Purpose: Every malformed entry reports the same shape, so the commander can correct it.
 * When to use: An entry whose action, letter, or id cannot be read.
 * Expected outcome: One drop reason.
 * Exceptions: None.
 */
const ENTRY_DROP_REASON =
  'operations entry dropped: expected {"action":"launch","option":"<letter>"} or {"action":"cancel","id":"<operation id>"}.';

/**
 * Reads the commands from one `operations` value.
 *
 * Purpose: The parser keeps the reply when the array is missing, empty, or partly wrong.
 * When to use: Once per strategic envelope, with `obj.operations`.
 * Expected outcome: No command and no reason when the value is absent or an empty array. A non-array is one reason and no command. A second launch is dropped. Letters are trimmed and uppercased.
 * Exceptions: None.
 */
export function normalizeOperationCommands(raw: unknown): {
  readonly commands: readonly OperationCommand[];
  readonly dropReasons: readonly string[];
} {
  const kind = raw === undefined ? 'absent' : Array.isArray(raw) ? 'array' : typeof raw;
  logTrace('operationCommandParsing normalizeOperationCommands', { kind, count: Array.isArray(raw) ? raw.length : 0 });
  if (raw === undefined || (Array.isArray(raw) && raw.length === 0)) return { commands: [], dropReasons: [] };
  if (!Array.isArray(raw)) return { commands: [], dropReasons: ['operations dropped: expected an array.'] };
  const commands: OperationCommand[] = [];
  const dropReasons: string[] = [];
  let launched = false;
  for (const entry of raw) {
    const command = readEntry(entry);
    if (command === null) {
      dropReasons.push(ENTRY_DROP_REASON);
      continue;
    }
    if (command.action === 'launch' && launched) {
      dropReasons.push('operations entry dropped: one launch per turn.');
      continue;
    }
    if (command.action === 'launch') launched = true;
    commands.push(command);
  }
  return { commands, dropReasons };
}

/**
 * Reads one array entry as a launch or a cancel.
 *
 * Purpose: The letter and the id are normalized here, so apply does not trim them again.
 * When to use: Each entry of an `operations` array.
 * Expected outcome: A command, or null when the entry is not one of the two shapes.
 * Exceptions: None.
 */
function readEntry(entry: unknown): OperationCommand | null {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const record = entry as Record<string, unknown>;
  if (record.action === 'launch') {
    const option = typeof record.option === 'string' ? record.option.trim().toUpperCase() : '';
    if (!(OPERATION_OPTION_LETTERS as readonly string[]).includes(option)) return null;
    return { action: 'launch', option };
  }
  if (record.action === 'cancel') {
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    if (id.length === 0) return null;
    return { action: 'cancel', id };
  }
  return null;
}
