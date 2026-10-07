/**
 * Unit tests for optional road/rail display-vector JSON parsing contracts.
 */

import * as assert from 'assert';
import { parseTerrainTacticalRoadRailVectorsJson } from './terrainRoadRailVectorsLoad';

/**
 * Defines the `testParseValidRows` function shape (function testParseValidRows(): void).

 * Purpose: Confirms valid rows are preserved with kind + point tuples for current schema.
 * When to use: Main-process unit suite.
 * Expected outcome: Rows with at least two finite `[lat, lng]` tuples are returned.
 * Exceptions: None.
 */
function testParseValidRows(): void {
  const rows = parseTerrainTacticalRoadRailVectorsJson(
    JSON.stringify({
      schema_version: '0.1.0',
      rows: [
        { kind: 'road', points: [[46.2, 6.1], [46.3, 6.2]] },
        { kind: 'rail', points: [[46.4, 6.3], [46.5, 6.4], [46.6, 6.5]] },
      ],
    })
  );
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0]!.kind, 'road');
  assert.strictEqual(rows[1]!.kind, 'rail');
  assert.deepStrictEqual(rows[0]!.points[0], [46.2, 6.1]);
}

/**
 * Defines the `testSkipsInvalidRows` function shape (function testSkipsInvalidRows(): void).

 * Purpose: Keeps parser tolerant by dropping malformed rows while preserving valid ones.
 * When to use: Main-process unit suite.
 * Expected outcome: Invalid rows are ignored instead of crashing parse flow.
 * Exceptions: None.
 */
function testSkipsInvalidRows(): void {
  const rows = parseTerrainTacticalRoadRailVectorsJson(
    JSON.stringify({
      rows: [
        { kind: 'road', points: [[46.2, 6.1]] },
        { kind: 'road', points: [[200, 6.1], [46.3, 6.2]] },
        { kind: 'river', points: [[46.2, 6.1], [46.3, 6.2]] },
        { kind: 'rail', points: [[46.2, 6.1], [46.3, 6.2]] },
      ],
    })
  );
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0]!.kind, 'rail');
}

/**
 * Defines the `testThrowsOnInvalidEnvelope` function shape (function testThrowsOnInvalidEnvelope(): void).

 * Purpose: Enforces essential envelope contracts for artifact integrity.
 * When to use: Main-process unit suite.
 * Expected outcome: Parser throws for unsupported schema or missing `rows` array.
 * Exceptions: None.
 */
function testThrowsOnInvalidEnvelope(): void {
  assert.throws(() => parseTerrainTacticalRoadRailVectorsJson(JSON.stringify({ schema_version: 'x', rows: [] })));
  assert.throws(() => parseTerrainTacticalRoadRailVectorsJson(JSON.stringify({ schema_version: '0.1.0' })));
}

/**
 * Defines the `main` function shape (function main(): void).

 * Purpose: Runs vector parser tests as a Node entrypoint matching repository conventions.
 * When to use: Invoked by `npm test` after `build:main`.
 * Expected outcome: Prints success marker when assertions pass.
 * Exceptions: Propagates assertion failures to process exit code.
 */
function main(): void {
  testParseValidRows();
  testSkipsInvalidRows();
  testThrowsOnInvalidEnvelope();
  console.log('terrainRoadRailVectorsLoad.test: ok');
}

main();
