/**
 * The human nickname row.
 *
 * Purpose: A fresh database, a saved name, and a rejected name stay distinct.
 * When to use: After changing `getHumanNickname` or `setHumanNickname`.
 * Expected outcome: The default is Human, and a rejected value leaves no custom row.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dbGetOne } from './gameDb';
import { HUMAN_NICKNAME_CONFIG_KEY, HUMAN_NICKNAME_DEFAULT } from '../shared/sideNicknames';
import { withTempGameDb } from './testSupport/withTempGameDb';
import { getHumanNickname, setHumanNickname } from './humanNickname';

test('getHumanNickname reads Human until a custom name is stored', () => {
  withTempGameDb('aw-human-nickname-', () => {
    assert.equal(getHumanNickname(), HUMAN_NICKNAME_DEFAULT);
    setHumanNickname('Scout');
    assert.equal(getHumanNickname(), 'Scout');
    setHumanNickname('  you  ');
    assert.equal(getHumanNickname(), HUMAN_NICKNAME_DEFAULT);
    assert.equal(storedNickname(), undefined);
    setHumanNickname('ABCDEFGHIJKLMNOPQRST');
    assert.equal(getHumanNickname(), 'ABCDEFGHIJKLMNOP');
    setHumanNickname(HUMAN_NICKNAME_DEFAULT);
    assert.equal(getHumanNickname(), HUMAN_NICKNAME_DEFAULT);
    assert.equal(storedNickname(), undefined);
  });
});

/**
 * The raw `human_nickname` row.
 *
 * Purpose: A rejected save must not leave the previous custom name behind.
 * When to use: The cases in this file.
 * Expected outcome: The stored text, or undefined when the row is gone.
 * Exceptions: None.
 */
function storedNickname(): string | undefined {
  return dbGetOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [HUMAN_NICKNAME_CONFIG_KEY])?.value;
}
