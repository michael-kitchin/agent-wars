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

    gameDb.upsertTurnStrategyNote('opponent', 'strategic', '', 1, { strategyText: '', messageText: null });

    gameDb.upsertTurnLossNote('opponent', 

      'strategic',

      '',

      2,

      '{"ranged":[],"melee":[],"returnFire":[],"airStrike":[],"other":[]}',

      '{"ranged":[{"unitType":"infantry","displayName":"I","unitId":"human-inf-1"}],"melee":[],"returnFire":[],"airStrike":[],"other":[]}'

    );

    gameDb.upsertTurnStrategyNote('opponent', 'strategic', '', 3, { strategyText: 'Counterattack', messageText: null });

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

    assert.ok(out.includes('Message: (none)'), 'losses-only turn shows (none) message');

    assert.ok(out.includes('Enemy Losses: Ranged attack: human-inf-1'));

    assert.ok(!out.includes('Ranged attack: I'), 'prompt losses must not use display names');

    assert.ok(!out.includes('Your Losses:'), 'empty own-loss line suppressed on turn 2');

    assert.ok(out.includes('Turn 3:'));

    assert.ok(out.includes('Strategy: Counterattack'));

    gameDb.upsertTurnStrategyNote('opponent', 'strategic', '', 4, { strategyText: null, messageText: 'You will not find safety in delay.' });

    const withMessageOnly = buildRecentTurnNotesSection({

      scope: 'strategic',

      battleId: '',

      currentTurnNumber: 5,

      heading: 'Recent Turn Notes',

    });

    assert.ok(withMessageOnly.includes('Turn 4:'));

    assert.ok(withMessageOnly.includes('Message: You will not find safety in delay.'));

    assert.ok(withMessageOnly.includes('Strategy: (none)'), 'message-only turn shows (none) strategy');

    gameDb.upsertTurnStrategyNote('opponent', 'tactical', 'tb-x', 1, { strategyText: 'Hold the line', messageText: null });

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

 * Verifies the three-entry window returns only the three most recent qualifying turns.

 *

 * Purpose: Guards `getRecentTurnNotes(..., limit=3)` integration from the section builder.

 * When to use: After changing recent-note query or filtering rules.

 * Expected outcome: Turns 2–4 appear when querying before turn 5; turn 1 omitted by window.

 * Exceptions: None.

 */

async function testThreeEntryWindow(): Promise<void> {

  const gameDb = await import('./gameDb');

  const { buildRecentTurnNotesSection } = await import('./briefing/recentTurnNotesSection');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-recent-notes-window-'));

  const dbPath = path.join(dir, 't.sqlite');

  try {

    gameDb.openGameDatabaseAtPathForTests(dbPath);

    for (let turn = 1; turn <= 4; turn += 1) {

      gameDb.upsertTurnStrategyNote('opponent', 'strategic', '', turn, { strategyText: `Plan ${turn}`, messageText: null });

    }

    const out = buildRecentTurnNotesSection({

      scope: 'strategic',

      battleId: '',

      currentTurnNumber: 5,

      heading: 'Recent Turn Notes',

    });

    assert.ok(out.includes('Turn 2:'));

    assert.ok(out.includes('Turn 3:'));

    assert.ok(out.includes('Turn 4:'));

    assert.ok(!out.includes('Turn 1:'), 'turn 1 falls outside three-entry window');

    assert.ok(!out.includes('Turn 5:'), 'current planning turn is excluded');

  } finally {

    gameDb.closeGameDatabaseForTests();

    fs.rmSync(dir, { recursive: true, force: true });

  }

}



async function run(): Promise<void> {

  await testRecentTurnNotesFormatting();

  await testThreeEntryWindow();

  console.log('recentTurnNotesSection.test.ts passed');

}



run().catch((err) => {

  console.error(err);

  process.exit(1);

});


