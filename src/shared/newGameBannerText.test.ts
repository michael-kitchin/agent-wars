import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { newGameBannerText } from './newGameBannerText';

describe('newGameBannerText', () => {
  it('names the selected tab and keeps startup distinct from New', () => {
    assert.equal(newGameBannerText('startup', 'global'), 'Start the global game when ready.');
    assert.equal(newGameBannerText('startup', 'regional'), 'Start the regional game when ready.');
    assert.equal(newGameBannerText('newGame', 'global'), 'Start a new global game when ready.');
    assert.equal(newGameBannerText('newGame', 'regional'), 'Start a new regional game when ready.');
  });
});
