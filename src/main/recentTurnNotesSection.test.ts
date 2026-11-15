/**

 * Tests for recent turn notes prompt section. Run with: node dist/main/recentTurnNotesSection.test.js

 */



import assert from 'node:assert/strict';

import fs from 'node:fs';

import os from 'node:os';

import path from 'node:path';



/**

 * Verifies formatting, (none) strategy, and suppression of empty turns.

 *

 * Purpose: Guards prompt section output contract.

 * When to use: After changing `recentTurnNotesSection.ts`.

 * Expected outcome: Turn labels, inline losses, empty turns omitted from section.

 * Exceptions: None.

 */

async function testRecentTurnNotesFormatting(): Promise<void> {

  const gameDb = await import('./gameDb');

  const { buildRecentTurnNotesSection } = await import('./briefing/recentTurnNotesSection');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-recent-notes-'));

  const dbPath = path.join(dir, 't.sqlite');

  try {

    gameDb.openGameDatabaseAtPathForTests(dbPath);

    gameDb.upsertTurnStrategyNote('opponent', 'strategic', '', 1, { strategyText: '' });

    gameDb.upsertTurnLossNote('opponent', 

      'strategic',

      '',

      2,

      '{"ranged":[],"melee":[],"returnFire":[],"airStrike":[],"other":[]}',

      '{"ranged":[{"unitType":"infantry","displayName":"I","unitId":"human-inf-1"}],"melee":[],"returnFire":[],"airStrike":[],"other":[]}'

    );

    gameDb.upsertTurnStrategyNote('opponent', 'strategic', '', 3, { strategyText: 'Counterattack' });

    const out = buildRecentTurnNotesSection({

      scope: 'strategic',

      battleId: '',

      currentTurnNumber: 4,

      heading: 'Recent Turn Notes',

    });

    assert.ok(out.includes('## Recent Turn Notes'));

    assert.ok(!out.includes('Turn 1:'), 'empty turn 1 suppressed');

    assert.ok(out.includes('Turn 2:'));

    assert.ok(out.includes('Strategy: (none)'), 'losses-only turn shows (none) strategy');

    assert.equal(out.includes('Message:'), false);

    assert.ok(out.includes('Enemy Losses: Ranged attack: human-inf-1'));

    assert.ok(!out.includes('Ranged attack: I'), 'prompt losses must not use display names');

    assert.ok(!out.includes('Your Losses:'), 'empty own-loss line suppressed on turn 2');

    assert.ok(out.includes('Turn 3:'));

    assert.ok(out.includes('Strategy: Counterattack'));

    gameDb.upsertTurnStrategyNote('opponent', 'strategic', '', 4, { strategyText: null });

    const withoutStrategy = buildRecentTurnNotesSection({

      scope: 'strategic',

      battleId: '',

      currentTurnNumber: 5,

      heading: 'Recent Turn Notes',

    });

    assert.equal(withoutStrategy.includes('Turn 4:'), false);

    gameDb.upsertTurnStrategyNote('opponent', 'tactical', 'tb-x', 1, { strategyText: 'Hold the line' });

    const tactical = buildRecentTurnNotesSection({

      scope: 'tactical',

      battleId: 'tb-x',

      currentTurnNumber: 2,

      heading: 'Recent Turn Notes',

    });

    assert.ok(tactical.includes('## Recent Turn Notes'));

    assert.ok(tactical.includes('Turn 1:'));

    assert.ok(!tactical.includes('Beat '), 'tactical notes use Turn labels');

    assert.ok(tactical.includes('Strategy: Hold the line'));

  } finally {

    gameDb.closeGameDatabaseForTests();

    fs.rmSync(dir, { recursive: true, force: true });

  }

}



/**

 * Verifies the ten-entry window returns only the ten most recent qualifying turns.

 *

 * Purpose: Guards the recent-notes limit integration from the section builder.

 * When to use: After changing recent-note query or filtering rules.

 * Expected outcome: Turns 2–11 appear when querying before turn 12; turn 1 omitted by window.

 * Exceptions: None.

 */

async function testTenEntryWindow(): Promise<void> {

  const gameDb = await import('./gameDb');

  const { buildRecentTurnNotesSection } = await import('./briefing/recentTurnNotesSection');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-recent-notes-window-'));

  const dbPath = path.join(dir, 't.sqlite');

  try {

    gameDb.openGameDatabaseAtPathForTests(dbPath);

    for (let turn = 1; turn <= 11; turn += 1) {

      gameDb.upsertTurnStrategyNote('opponent', 'strategic', '', turn, { strategyText: `Plan ${turn}` });

    }

    const out = buildRecentTurnNotesSection({

      scope: 'strategic',

      battleId: '',

      currentTurnNumber: 12,

      heading: 'Recent Turn Notes',

    });

    for (let turn = 2; turn <= 11; turn += 1) {

      assert.ok(out.includes(`Turn ${turn}:`), `turn ${turn} is inside the ten-entry window`);

    }

    assert.ok(!out.includes('Turn 1:'), 'turn 1 falls outside ten-entry window');

    assert.ok(!out.includes('Turn 12:'), 'current planning turn is excluded');

  } finally {

    gameDb.closeGameDatabaseForTests();

    fs.rmSync(dir, { recursive: true, force: true });

  }

}



async function run(): Promise<void> {

  await testRecentTurnNotesFormatting();

  await testTenEntryWindow();

  console.log('recentTurnNotesSection.test.ts passed');

}



run().catch((err) => {

  console.error(err);

  process.exit(1);

});


