/**
 * The recording fixture and the line parser.
 *
 * Purpose: Format version 1 stays readable, and a newer layout or a broken line is refused with the line number.
 * When to use: `npm run build:main`, then `node dist/main/recorder/matchRecordingFile.test.js`.
 * Expected outcome: The fixture has one hex row and two records. Version 2 and a broken line throw. Both stance fixtures, before and after trust and threat, parse.
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
  assert.equal(recording.header.playthroughId, '');
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

test('a stance event at format version 2 parses with its trust and threat', () => {
  const fixturePath = path.join(__dirname, '..', '..', '..', 'src', 'main', 'fixtures', 'recording-stance-scores.jsonl');
  const recording = parseRecordingLines(fs.readFileSync(fixturePath, 'utf8'));
  assert.equal(recording.records.length, 1);
  assert.equal(recording.records[0]?.recordType, 'stance_declared');
  assert.equal(recording.records[0]?.formatVersion, 2);
  const payload = recording.records[0]?.payload as { trust: number; threat: number };
  assert.deepEqual([payload.trust, payload.threat], [2, 3]);
});

test('a stance event at format version 1, written before trust and threat, still parses', () => {
  const fixturePath = path.join(__dirname, '..', '..', '..', 'src', 'main', 'fixtures', 'recording-stance-format-1.jsonl');
  const recording = parseRecordingLines(fs.readFileSync(fixturePath, 'utf8'));
  assert.equal(recording.records.length, 1);
  assert.equal(recording.records[0]?.recordType, 'stance_declared');
  assert.equal(recording.records[0]?.formatVersion, 1);
  const payload = recording.records[0]?.payload as Record<string, unknown>;
  assert.equal(payload.stance, 'wary');
  assert.equal('trust' in payload || 'threat' in payload, false);
});
