/**
 * The callback events the prompt teaches, with their parameters.
 *
 * Purpose: The model is invited to subscribe with no list of valid events today, so subscriptions are guesses.
 * `territory_changed` is parser-tolerant but never fires, so it is excluded from what we teach.
 * When to use: The envelope callback clause, via `buildCallbackVocabularyClause`.
 * Expected outcome: Every taught event is in `CALLBACK_EVENT_VOCAB`; `territory_changed` is not taught.
 * Exceptions: None.
 */

import { logDebug, logTrace } from '../../logger';
import { CALLBACK_EVENT_VOCAB } from '../orderResponseParsing';
import type { PromptCoordinateMode } from './promptCoordinateMode';

/**
 * One event the prompt may invite the model to subscribe to.
 *
 * Purpose: Keeps the event name, the parameters the parser reads, and a one-line meaning together.
 * When to use: `TAUGHT_CALLBACK_EVENTS` and `buildCallbackVocabularyClause`.
 * Expected outcome: `event` is always a member of `CALLBACK_EVENT_VOCAB`.
 * Exceptions: None.
 */
export interface TaughtCallbackEvent {
  /**
   * Parser-accepted event name.
   *
   * Contract: Must be a member of `CALLBACK_EVENT_VOCAB`. Must not be `territory_changed`.
   * When to use: The event field of a subscription object.
   * Expected outcome: A snake_case name the evaluator can fire.
   * Exceptions: None.
   */
  readonly event: string;
  /**
   * Parameter names the parser reads for this event.
   *
   * Contract: Names the fields the compact and object forms both accept.
   * When to use: The vocabulary clause next to the event name.
   * Expected outcome: A short comma-separated list such as `unitId, severity`.
   * Exceptions: None.
   */
  readonly parameters: string;
  /**
   * Why the model would subscribe to this event.
   *
   * Contract: One clause, no engine-internal stash/restore language.
   * When to use: The vocabulary clause after the parameters.
   * Expected outcome: Enough meaning to choose the event without reading the evaluator.
   * Exceptions: None.
   */
  readonly meaning: string;
}

/**
 * Events the prompt teaches. Parser-accepted but unfired events are omitted.
 *
 * Purpose: A model that subscribes to `territory_changed` is never re-consulted; teaching it would be a trap.
 * When to use: `buildCallbackVocabularyClause` and the vocabulary membership tests.
 * Expected outcome: Frozen list, subset of `CALLBACK_EVENT_VOCAB`, never containing `territory_changed`.
 * Exceptions: None.
 */
export const TAUGHT_CALLBACK_EVENTS: readonly TaughtCallbackEvent[] = Object.freeze([
  {
    event: 'turns',
    parameters: 'n',
    meaning: 'fires after n turns have passed since the subscription',
  },
  {
    event: 'unit_engaged',
    parameters: 'unitId',
    meaning: 'fires when that unit takes part in combat',
  },
  {
    event: 'unit_destroyed',
    parameters: 'side or unitId',
    meaning: 'fires when an own or enemy unit, or a named unit, is destroyed',
  },
  {
    event: 'unit_arrived',
    parameters: 'unitId',
    meaning: 'fires when that unit\'s standing march arrives',
  },
  {
    event: 'threat_escalation',
    parameters: 'unitId, severity',
    meaning: 'fires when that unit\'s threat reaches the named severity',
  },
  {
    event: 'infrastructure_destroyed',
    parameters: 'targetType, hex',
    meaning: 'fires when urban, airport, or seaport infrastructure at that briefing hex is destroyed',
  },
]);

/**
 * Returns the envelope sentence that names every taught event and its parameters.
 *
 * Purpose: The callback clause must not invite guesses; this is the list.
 * When to use: Inside `buildCallbackContractClause`.
 * Expected outcome: Every taught event name and its parameter list; no `territory_changed`.
 * Exceptions: None.
 */
export function buildCallbackVocabularyClause(mode: PromptCoordinateMode): string {
  logDebug('promptSpec buildCallbackVocabularyClause', { mode, taughtCount: TAUGHT_CALLBACK_EVENTS.length });
  const items = TAUGHT_CALLBACK_EVENTS.map((row) => `${row.event} (${row.parameters}: ${row.meaning})`).join('; ');
  const address =
    mode === 'tactical'
      ? ' In battle, unit-scoped events use sub-unit ids, not strategic parent ids.'
      : '';
  return ` Legal events and their parameters: ${items}.${address}`;
}

/**
 * True when every taught event is parser-accepted.
 *
 * Purpose: Lets tests (and a debug log) confirm the prompt cannot teach a rejected name.
 * When to use: Not required at runtime; kept for the membership test's documentation.
 * Expected outcome: True for the frozen table.
 * Exceptions: None.
 */
export function taughtEventsAreParserAccepted(): boolean {
  logTrace('promptSpec taughtEventsAreParserAccepted', { taughtCount: TAUGHT_CALLBACK_EVENTS.length });
  return TAUGHT_CALLBACK_EVENTS.every((row) => CALLBACK_EVENT_VOCAB.has(row.event));
}
