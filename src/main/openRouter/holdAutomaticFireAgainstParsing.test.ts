/**
 * What one reply value asks for the automatic-fire list.
 * Run with: node dist/main/openRouter/holdAutomaticFireAgainstParsing.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHoldAutomaticFireAgainstChoice } from './holdAutomaticFireAgainstParsing';

const NOT_A_LIST = 'holdAutomaticFireAgainst dropped: expected a list of side codes.';

/** One input and what the parser must return for it. */
type Row = {
  /**
   * The row's test name.
   *
   * Contract: Unique in the table.
   * When to use: Naming the case.
   * Expected outcome: Shown on failure.
   * Exceptions: None.
   */
  readonly name: string;
  /**
   * The reply value.
   *
   * Contract: Anything a model might send.
   * When to use: Input to the parser.
   * Expected outcome: Parsed as is.
   * Exceptions: None.
   */
  readonly raw: unknown;
  /**
   * What the parser returns for it.
   *
   * Contract: A choice or none, and drop reasons.
   * When to use: The assertion.
   * Expected outcome: Compared deeply.
   * Exceptions: None.
   */
  readonly expected: ReturnType<typeof parseHoldAutomaticFireAgainstChoice>;
};

const KEPT = { choice: undefined, dropReasons: [] };

const ROWS: readonly Row[] = [
  { name: 'a missing field keeps the list', raw: undefined, expected: KEPT },
  { name: 'null keeps the list', raw: null, expected: KEPT },
  { name: 'a string is not a list', raw: 'a2', expected: { choice: undefined, dropReasons: [NOT_A_LIST] } },
  { name: 'an empty array keeps the list', raw: [], expected: KEPT },
  { name: 'a number entry is refused', raw: ['a2', 3], expected: { choice: undefined, dropReasons: [NOT_A_LIST] } },
  { name: 'a blank entry is refused', raw: ['a2', '  '], expected: { choice: undefined, dropReasons: [NOT_A_LIST] } },
  { name: 'none clears', raw: ['none'], expected: { choice: { kind: 'clear' }, dropReasons: [] } },
  { name: 'none is trimmed and case-blind', raw: [' NONE '], expected: { choice: { kind: 'clear' }, dropReasons: [] } },
  { name: 'repeated none clears', raw: ['none', 'None'], expected: { choice: { kind: 'clear' }, dropReasons: [] } },
  {
    name: 'none with a side code is refused',
    raw: ['none', 'a2'],
    expected: { choice: undefined, dropReasons: ['holdAutomaticFireAgainst dropped: "none" cannot be combined with side codes.'] },
  },
  {
    name: 'codes replace the list, trimmed, lower-cased, and deduplicated in first-seen order',
    raw: [' A3 ', 'h1', 'a3', 'H1'],
    expected: { choice: { kind: 'replace', sideCodes: ['a3', 'h1'] }, dropReasons: [] },
  },
];

for (const row of ROWS) {
  test(row.name, () => {
    assert.deepEqual(parseHoldAutomaticFireAgainstChoice(row.raw), row.expected);
  });
}
