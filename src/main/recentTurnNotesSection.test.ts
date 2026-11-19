/**

 * Tests for recent turn notes prompt section. Run with: node dist/main/recentTurnNotesSection.test.js

 */



import assert from 'node:assert/strict';

import fs from 'node:fs';

import os from 'node:os';

import path from 'node:path';
import { sideHomeNameKey } from '../shared/shortSideName';



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
  const { RECENT_TURN_LOSS_LEGEND } = await import('./briefing/recentTurnLossLines');

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

    assert.ok(out.includes('- Losses of other sides:\n  - by unknown side, Ranged attack: human-inf-1'));

    assert.ok(!out.includes('Ranged attack: I'), 'prompt losses must not use display names');

    assert.ok(!out.includes('- Your Losses:'), 'empty own-loss section suppressed on turn 2');
    assert.equal(out.split(RECENT_TURN_LOSS_LEGEND).length - 1, 1, 'the legend prints once when a block has a loss line');

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
    assert.equal(tactical.includes(RECENT_TURN_LOSS_LEGEND), false, 'no legend without a loss line');

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


/**
 * Builds stored loss JSON for one unit with an attribution.
 *
 * Purpose: The attribution tests write rows the way the capture step does.
 * When to use: `testAttributedLossLines` and `testOlderTurnsAreCapped`.
 * Expected outcome: A JSON string with one unit in the given cause bucket.
 * Exceptions: None.
 */
function lossJson(cause: string, id: string, owner: string, responsible: string[], killers: Array<{ unitId: string; unitType: string }> = []): string {
  return JSON.stringify({
    ranged: [], melee: [], returnFire: [], airStrike: [], missileStrike: [], other: [],
    [cause]: [{ unitType: 'infantry', displayName: id, unitId: id, attribution: { ownerId: owner, lossH3Index: null, responsibleOwnerIds: responsible, killerUnits: killers } }],
  });
}

/**
 * Verifies the section names the responsible side and the killer types for an attributed loss.
 *
 * Purpose: Guards the end-to-end path from stored JSON to prompt text.
 * When to use: After changing the section builder or the loss line formatter.
 * Expected outcome: A `by h1` line with the killer counts under `Your Losses`, and the other side's loss under its own header.
 * Exceptions: None.
 */
async function testAttributedLossLines(): Promise<void> {
  const gameDb = await import('./gameDb');
  const { buildRecentTurnNotesSection } = await import('./briefing/recentTurnNotesSection');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-recent-notes-attr-'));
  try {
    gameDb.openGameDatabaseAtPathForTests(path.join(dir, 't.sqlite'));
    gameDb.upsertTurnLossNote(
      'opponent', 'strategic', '', 1,
      lossJson('ranged', 'a1-i1', 'opponent', ['human'], [{ unitId: 'h1-a1', unitType: 'armor' }]),
      lossJson('melee', 'h1-i9', 'human', ['opponent'])
    );
    const out = buildRecentTurnNotesSection({ scope: 'strategic', battleId: '', currentTurnNumber: 2, heading: 'Recent Turn Notes' });
    assert.ok(out.includes('- Your Losses:\n  - by h1, Ranged attack: a1-i1 (by 1 Armored)'));
    assert.ok(out.includes('- Losses of h1:\n  - by you, Melee attack: h1-i9'));
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Verifies an older turn is capped and the newest turn is not.
 *
 * Purpose: Guards the per-block cap of loss groups.
 * When to use: After changing the cap or how blocks are chosen for it.
 * Expected outcome: Turn 1 ends with a one-group count line. Turn 2 has no count line.
 * Exceptions: None.
 */
async function testOlderTurnsAreCapped(): Promise<void> {
  const gameDb = await import('./gameDb');
  const { buildRecentTurnNotesSection } = await import('./briefing/recentTurnNotesSection');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-recent-notes-cap-'));
  try {
    gameDb.openGameDatabaseAtPathForTests(path.join(dir, 't.sqlite'));
    const causes = ['ranged', 'melee', 'returnFire', 'airStrike', 'missileStrike', 'other'];
    const merged: Record<string, unknown[]> = { ranged: [], melee: [], returnFire: [], airStrike: [], missileStrike: [], other: [] };
    let counter = 0;
    const add = (cause: string, responsible: string[]): void => {
      counter += 1;
      const one = JSON.parse(lossJson(cause, `a2-i${counter}`, 'opponent2', responsible)) as Record<string, unknown[]>;
      merged[cause]!.push(...one[cause]!);
    };
    for (const cause of causes) {
      add(cause, ['human']);
      add(cause, ['opponent3']);
    }
    add('other', []);
    const empty = JSON.stringify({ ranged: [], melee: [], returnFire: [], airStrike: [], missileStrike: [], other: [] });
    gameDb.upsertTurnLossNote('opponent', 'strategic', '', 1, empty, JSON.stringify(merged));
    gameDb.upsertTurnLossNote('opponent', 'strategic', '', 2, empty, lossJson('ranged', 'a2-i99', 'opponent2', ['human']));
    const out = buildRecentTurnNotesSection({ scope: 'strategic', battleId: '', currentTurnNumber: 3, heading: 'Recent Turn Notes' });
    const turnOne = out.slice(out.indexOf('Turn 1:'), out.indexOf('Turn 2:'));
    const turnTwo = out.slice(out.indexOf('Turn 2:'));
    assert.ok(turnOne.trimEnd().endsWith('- 1 more loss group on this turn is not listed.'));
    assert.equal(turnTwo.includes('not listed'), false);
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}


/**
 * Verifies a stored hex that is not a cell does not fail the prompt.
 *
 * Purpose: A damaged loss row must still print, without a hex code.
 * When to use: After changing the hex resolver.
 * Expected outcome: The section includes the unit id and does not throw.
 * Exceptions: None.
 */
async function testBadLossHexDoesNotFailThePrompt(): Promise<void> {
  const gameDb = await import('./gameDb');
  const { buildRecentTurnNotesSection } = await import('./briefing/recentTurnNotesSection');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-recent-notes-bad-hex-'));
  try {
    gameDb.openGameDatabaseAtPathForTests(path.join(dir, 't.sqlite'));
    const own = JSON.stringify({
      ranged: [{
        unitType: 'infantry', displayName: 'a1-i1', unitId: 'a1-i1',
        attribution: { ownerId: 'opponent', lossH3Index: 'not-a-cell', responsibleOwnerIds: ['human'], killerUnits: [] },
      }],
      melee: [], returnFire: [], airStrike: [], missileStrike: [], other: [],
    });
    const empty = JSON.stringify({ ranged: [], melee: [], returnFire: [], airStrike: [], missileStrike: [], other: [] });
    gameDb.upsertTurnLossNote('opponent', 'strategic', '', 1, own, empty);
    const out = buildRecentTurnNotesSection({ scope: 'strategic', battleId: '', currentTurnNumber: 2, heading: 'Recent Turn Notes' });
    assert.ok(out.includes('- Your Losses:\n  - by h1, Ranged attack: a1-i1'), out);
    assert.equal(out.includes('not-a-cell'), false);
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Verifies a strategic block lists the turn's battle losses and the legend explains them.
 *
 * Purpose: Guards the merge of a battle's strategic row into its turn's block.
 * When to use: After changing how the section reads battle rows.
 * Expected outcome: One `Turn 1:` block holds the ranged line and the Battle line, and the legend ends with the Battle sentence. A turn with an empty own row still prints. A tactical section ignores the battle row.
 * Exceptions: None.
 */
async function testBattleLossesPrint(): Promise<void> {
  const gameDb = await import('./gameDb');
  const { buildRecentTurnNotesSection } = await import('./briefing/recentTurnNotesSection');
  const { BATTLE_LOSS_LEGEND_SENTENCE } = await import('./briefing/recentTurnLossLines');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-recent-notes-battle-'));
  try {
    gameDb.openGameDatabaseAtPathForTests(path.join(dir, 't.sqlite'));
    const empty = JSON.stringify({ ranged: [], melee: [], returnFire: [], airStrike: [], missileStrike: [], other: [] });
    gameDb.upsertTurnLossNote('opponent', 'strategic', '', 1, lossJson('ranged', 'a1-i1', 'opponent', ['human']), empty);
    gameDb.upsertTurnLossNote('opponent', 'strategic', '', 2, empty, empty);
    gameDb.upsertTurnLossNote('opponent', 'strategic', 'tb-1', 1, lossJson('other', 'a1-t1', 'opponent', ['opponent2']), empty);
    gameDb.upsertTurnLossNote('opponent', 'strategic', 'tb-2', 2, empty, lossJson('other', 'h1-t2', 'human', ['opponent']));
    const out = buildRecentTurnNotesSection({ scope: 'strategic', battleId: '', currentTurnNumber: 3, heading: 'Recent Turn Notes' });
    const turnOne = out.slice(out.indexOf('Turn 1:'), out.indexOf('Turn 2:'));
    assert.ok(turnOne.includes('  - by h1, Ranged attack: a1-i1'), out);
    assert.ok(turnOne.includes('  - by a2, Battle: a1-t1'), out);
    assert.ok(out.slice(out.indexOf('Turn 2:')).includes('- Losses of h1:\n  - by you, Battle: h1-t2'), out);
    assert.ok(out.includes(BATTLE_LOSS_LEGEND_SENTENCE), 'the legend carries the Battle sentence');
    gameDb.upsertTurnStrategyNote('opponent', 'tactical', 'tb-1', 1, { strategyText: 'Hold' });
    const tactical = buildRecentTurnNotesSection({ scope: 'tactical', battleId: 'tb-1', currentTurnNumber: 2, heading: 'Recent Turn Notes' });
    assert.equal(tactical.includes('Battle:'), false);
    assert.equal(tactical.includes(BATTLE_LOSS_LEGEND_SENTENCE), false);
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Verifies a loss line names the responsible side's home region after its code.
 *
 * Purpose: The commander can tell who attacked it from the loss line alone.
 * When to use: After changing the section builder or the loss line formatter.
 * Expected outcome: On a seated match, `by h1 (<home region of the human seat>)`, and the reading seat stays `you`.
 * Exceptions: None.
 */
async function testLossLineNamesHomeRegion(): Promise<void> {
  const gameDb = await import('./gameDb');
  const { withSeatedTempGameDb } = await import('./testSupport/withSeatedTempGameDb');
  const { buildRecentTurnNotesSection } = await import('./briefing/recentTurnNotesSection');
  const regions = gameDb.listScenarioHomeRegions()
    .map((name) => ({ name, hexes: gameDb.getScenarioHomeRegionHexes(name).length }))
    .filter((region) => region.hexes > 0)
    .sort((a, b) => b.hexes - a.hexes || a.name.localeCompare(b.name))
    .slice(0, 2)
    .map((region) => region.name);
  withSeatedTempGameDb('aw-recent-notes-home-', {
    gameMapId: 'global',
    seats: [{ kind: 'human', homeRegion: regions[0] }, { kind: 'ai', homeRegion: regions[1] }],
  }, () => {
    gameDb.upsertTurnLossNote(
      'opponent', 'strategic', '', 1,
      lossJson('ranged', 'a1-i1', 'opponent', ['human']),
      lossJson('melee', 'h1-i9', 'human', ['opponent'])
    );
    const humanHome = gameDb.getSeatRoster().find((seat) => seat.seatId === 'human')?.homeRegion ?? '';
    assert.ok(humanHome.length > 0);
    const out = buildRecentTurnNotesSection({ scope: 'strategic', battleId: '', currentTurnNumber: 2, heading: 'Recent Turn Notes' });
    assert.ok(out.includes(`  - by h1 (${sideHomeNameKey(humanHome)}), Ranged attack: a1-i1`), out);
    assert.ok(out.includes('- Losses of h1:\n  - by you, Melee attack: h1-i9'), out);
  });
}

async function run(): Promise<void> {

  await testRecentTurnNotesFormatting();

  await testTenEntryWindow();
  await testAttributedLossLines();
  await testOlderTurnsAreCapped();
  await testBadLossHexDoesNotFailThePrompt();
  await testBattleLossesPrint();
  await testLossLineNamesHomeRegion();

  console.log('recentTurnNotesSection.test.ts passed');

}



run().catch((err) => {

  console.error(err);

  process.exit(1);

});


