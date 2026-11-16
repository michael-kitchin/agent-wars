/**
 * The shape of the `losses_attributed` history event.
 *
 * Purpose: The match history keeps every loss with who was responsible for it, because a frame difference shows only that a unit is gone.
 * When to use: Writing the event, and any later reader that checks a payload before using it.
 * Expected outcome: Types, a constant, and one guard. This module does not read the database or log.
 * Exceptions: None.
 */

import type { PlayerLossSummary } from './lossSummary';

/**
 * Where an attributed-loss record was captured.
 *
 * Purpose: The three capture points write the same payload and differ only in their step.
 * When to use: `AttributedLossesRecord.source` and `isAttributedLossesRecord`.
 * Expected outcome: `strategicTurn`, `tacticalBeat`, `battleParents`.
 * Exceptions: None.
 */
export const LOSS_HISTORY_SOURCES = ['strategicTurn', 'tacticalBeat', 'battleParents'] as const;

/**
 * One capture point from `LOSS_HISTORY_SOURCES`.
 *
 * Contract: A member of that list.
 * When to use: Naming where a record came from.
 * Expected outcome: One of the three words.
 * Exceptions: None.
 */
export type LossHistorySource = (typeof LOSS_HISTORY_SOURCES)[number];

/**
 * Every owner's losses from one capture, with who was responsible.
 *
 * Contract: The step of the event carries the turn, the battle, and the beat, so this payload does not repeat them. It ignores fog of war.
 * When to use: The payload of a `losses_attributed` event.
 * Expected outcome: The capture source and, for each owner that lost a unit, six cause buckets of lost units with their attribution.
 * Exceptions: None.
 */
export interface AttributedLossesRecord {
  /**
   * Which capture wrote the record.
   *
   * Contract: A member of `LOSS_HISTORY_SOURCES`.
   * When to use: Telling a resolved turn from a beat or from a battle's destroyed parents.
   * Expected outcome: One of the three words.
   * Exceptions: None.
   */
  readonly source: LossHistorySource;
  /**
   * Losses by victim owner id.
   *
   * Contract: Holds every owner that lost a unit, the human seat and Neutral included. A battle parent is in its owner's `other` bucket.
   * When to use: Reading who lost what and who destroyed it.
   * Expected outcome: A map from owner id to the six cause buckets, as `attributeTurnLosses` returns them.
   * Exceptions: None.
   */
  readonly byOwner: Readonly<Record<string, PlayerLossSummary>>;
}

/**
 * Reports whether a decoded value looks like an attributed-loss record.
 *
 * Purpose: A reader must not trust a payload from a file or an older build.
 * When to use: Before reading the buckets of a recorded `losses_attributed` payload.
 * Expected outcome: True for an object whose `source` is a known source and whose `byOwner` is an object. The buckets are not checked. Parse each one with `parsePlayerLossSummaryJson` when they are needed.
 * Exceptions: None.
 */
export function isAttributedLossesRecord(value: unknown): value is AttributedLossesRecord {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as { readonly source?: unknown; readonly byOwner?: unknown };
  return (
    typeof candidate.source === 'string' &&
    (LOSS_HISTORY_SOURCES as readonly string[]).includes(candidate.source) &&
    candidate.byOwner !== null &&
    typeof candidate.byOwner === 'object' &&
    !Array.isArray(candidate.byOwner)
  );
}
