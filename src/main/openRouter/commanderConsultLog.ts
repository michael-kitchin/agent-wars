/**
 * Forwards one consult's activity-log lines to the match window.
 *
 * Purpose: A consult runs after the IPC call that started it has returned, so the line needs a sender remembered from that call.
 * When to use: The commander IPC handler remembers the sender. The consult runner emits each line with its seat.
 * Expected outcome: The renderer receives the line and the seat id. A missing sender drops the line.
 * Exceptions: None.
 */

import { logTrace } from '../logger';

/**
 * One activity-log line for a seat.
 *
 * Purpose: The renderer prefixes the short name only when the seat is known.
 * When to use: `emitCommanderConsultLog`.
 * Expected outcome: `seatId` is the seat whose consult produced the line.
 * Exceptions: None.
 */
export interface CommanderConsultLogLine {
  /**
   * The log text.
   *
   * Contract: Plain text, already worded for the player.
   * When to use: The activity log.
   * Expected outcome: One line.
   * Exceptions: None.
   */
  readonly line: string;
  /**
   * True when the line is an error.
   *
   * Contract: A boolean.
   * When to use: The error style.
   * Expected outcome: False for an ordinary progress line.
   * Exceptions: None.
   */
  readonly isError: boolean;
  /**
   * The seat the consult belongs to.
   *
   * Contract: An AI seat id.
   * When to use: The log filter and the short-name prefix.
   * Expected outcome: The seat that was consulted.
   * Exceptions: None.
   */
  readonly seatId: string;
}

/**
 * The window that should receive consult lines, or null before a commander IPC call.
 *
 * Purpose: The consult itself has no IPC event.
 * When to use: `setCommanderConsultLogSender` and `emitCommanderConsultLog`.
 * Expected outcome: The latest sender, or null.
 * Exceptions: None.
 */
let sender: ((payload: CommanderConsultLogLine) => void) | null = null;

/**
 * Remembers where consult lines go.
 *
 * Purpose: Start, stop, and read each have a window. The consult uses the latest one.
 * When to use: Those IPC handlers, before the consult can log.
 * Expected outcome: Later emits use this sender. Null clears it.
 * Exceptions: None.
 */
export function setCommanderConsultLogSender(next: ((payload: CommanderConsultLogLine) => void) | null): void {
  // About once a second while the pool is polled. Trace so a debug log is not filled by the poll.
  logTrace('commanderConsultLog setCommanderConsultLogSender', { listening: next !== null });
  sender = next;
}

/**
 * Sends one consult line when a window is listening.
 *
 * Purpose: The activity log can name the seat.
 * When to use: The `onLog` callback of a seat's consult.
 * Expected outcome: The sender is called with the seat id. Nothing is sent when no window has registered.
 * Exceptions: None.
 */
export function emitCommanderConsultLog(seatId: string, line: string, isError = false): void {
  logTrace('commanderConsultLog emitCommanderConsultLog', { seatId, isError });
  sender?.({ line, isError, seatId });
}
