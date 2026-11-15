/**
 * The recording fixture and the line parser.
 *
 * Purpose: Format version 1 stays readable, and a newer layout or a broken line is refused with the line number.
 * When to use: `npm run build:main`, then `node dist/main/recorder/matchRecordingFile.test.js`.
 * Expected outcome: The fixture has one hex row and two records. Version 2 and a broken line throw.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { test } from 'node:test';
import { parseRecordingLines } from './matchRecordingFile';

test('the format fixture parses, and a newer file or a broken line does not', () => {
  const fixturePath = path.join(__dirname, '..', '..', '..', 'src', 'main', 'fixtures', 'recording-format-1.jsonl');
  const text = fs.readFileSync(fixturePath, 'utf8');
  const recording = parseRecordingLines(text);
  assert.equal(recording.header.matchId, 'fixture-match');
  assert.equal(recording.staticData.hexes.rows.length, 1);
  assert.equal(recording.records.length, 2);
  assert.equal(recording.records[1]?.kind, 'frame');
  const payload = recording.records[1]?.payload as { tables: { turn_state: { rows: unknown[] } } };
  assert.equal(payload.tables.turn_state.rows.length, 1);

  const newer = text.replace('"formatVersion":1', '"formatVersion":2');
  assert.throws(() => parseRecordingLines(newer), /newer Agent Wars/);
  const lines = text.split('\n').filter((line) => line.length > 0);
  assert.throws(() => parseRecordingLines(`${lines[0]}\n${lines[1]}\n{`), /Line 3 is not valid JSON/);
});
