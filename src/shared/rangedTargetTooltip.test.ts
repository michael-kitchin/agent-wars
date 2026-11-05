/**
 * Tooltip body for a legal ranged target.
 *
 * Purpose: Opponent lines stay first, effects follow, and Kill, Hurt, and Loss appear together or not at all.
 * When to use: After changing `composeRangedTargetTooltipHtml` or `buildRangedTargetRosterHtml`.
 * Expected outcome: The section gap separates present blocks, and a `<` in a name is escaped.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RangedTargetRosterLine } from './rangedTargetRoster';
import { TOOLTIP_SECTION_GAP_HTML } from './tooltipSectionGap';
import { buildRangedTargetRosterHtml, composeRangedTargetTooltipHtml } from './rangedTargetTooltip';

const ODDS = '<strong>Kill:</strong> 40%, <strong>Hurt:</strong> 25%, <strong>Loss:</strong> 10%';

describe('composeRangedTargetTooltipHtml', () => {
  it('puts the roster, effects, and the odds line in that order', () => {
    const html = composeRangedTargetTooltipHtml({
      effectsHtml: 'EFFECTS',
      rosterHtml: 'ROSTER',
      killPercent: 40,
      hurtPercent: 25,
      lossPercent: 10,
    });
    assert.equal(html, `ROSTER${TOOLTIP_SECTION_GAP_HTML}EFFECTS${TOOLTIP_SECTION_GAP_HTML}${ODDS}`);
  });

  it('keeps the roster and the odds line when there is no effects line', () => {
    const html = composeRangedTargetTooltipHtml({
      effectsHtml: null,
      rosterHtml: 'ROSTER',
      killPercent: 40,
      hurtPercent: 25,
      lossPercent: 10,
    });
    assert.equal(html, `ROSTER${TOOLTIP_SECTION_GAP_HTML}${ODDS}`);
  });

  it('omits the odds line when any percent is null', () => {
    assert.equal(
      composeRangedTargetTooltipHtml({
        effectsHtml: null,
        rosterHtml: 'ROSTER',
        killPercent: null,
        hurtPercent: 25,
        lossPercent: 10,
      }),
      'ROSTER',
    );
    assert.equal(
      composeRangedTargetTooltipHtml({
        effectsHtml: null,
        rosterHtml: 'ROSTER',
        killPercent: 40,
        hurtPercent: 25,
        lossPercent: null,
      }),
      'ROSTER',
    );
    assert.equal(
      composeRangedTargetTooltipHtml({
        effectsHtml: null,
        rosterHtml: 'ROSTER',
        killPercent: 40,
        hurtPercent: null,
        lossPercent: 10,
      }),
      'ROSTER',
    );
  });

  it('leaves out an empty opponent list', () => {
    assert.equal(
      composeRangedTargetTooltipHtml({
        effectsHtml: 'EFFECTS',
        rosterHtml: '',
        killPercent: 40,
        hurtPercent: 25,
        lossPercent: 10,
      }),
      `EFFECTS${TOOLTIP_SECTION_GAP_HTML}${ODDS}`,
    );
  });

  it('keeps a zero percent on the odds line', () => {
    assert.equal(
      composeRangedTargetTooltipHtml({
        effectsHtml: null,
        rosterHtml: null,
        killPercent: 0,
        hurtPercent: 0,
        lossPercent: 0,
      }),
      '<strong>Kill:</strong> 0%, <strong>Hurt:</strong> 0%, <strong>Loss:</strong> 0%',
    );
  });

  it('returns null when every part is absent', () => {
    assert.equal(
      composeRangedTargetTooltipHtml({
        effectsHtml: null,
        rosterHtml: null,
        killPercent: null,
        hurtPercent: null,
        lossPercent: null,
      }),
      null,
    );
  });
});

describe('buildRangedTargetRosterHtml', () => {
  it('separates opponent lines the same way a hex tooltip separates its lines', () => {
    const lines: readonly RangedTargetRosterLine[] = [
      {
        seatId: 'opponent',
        nickname: 'One',
        tokens: [{ kind: 'unit', unitId: 'u1', displayName: 'I Infantry' }],
      },
      {
        seatId: 'opponent2',
        nickname: 'Two',
        tokens: [{ kind: 'unit', unitId: 'u2', displayName: 'II Armored' }],
      },
    ];
    const html = buildRangedTargetRosterHtml(lines, {
      sideFlagHtml: () => '',
      originFlagHtml: () => '',
      groupMarkHtml: () => '',
    });
    assert.equal(
      html,
      `<strong>One:</strong> I Infantry${TOOLTIP_SECTION_GAP_HTML}<strong>Two:</strong> II Armored`,
    );
  });

  it('escapes a nickname or unit name that contains <', () => {
    const lines: readonly RangedTargetRosterLine[] = [
      {
        seatId: 'opponent',
        nickname: 'A<B',
        tokens: [{ kind: 'unit', unitId: 'u1', displayName: 'C<D' }],
      },
    ];
    const html = buildRangedTargetRosterHtml(lines, {
      sideFlagHtml: () => '<span class="side-number-flag"></span>',
      originFlagHtml: () => '<img class="country-flag" alt="">',
      groupMarkHtml: () => '',
    });
    assert.ok(html);
    assert.equal(html.includes('A<B'), false);
    assert.equal(html.includes('C<D'), false);
    assert.ok(html.includes('<strong>A&lt;B:</strong>'));
    assert.ok(html.includes('C&lt;D'));
    assert.equal(html.includes('<strong>C&lt;D</strong>'), false);
    assert.ok(html.includes('<span class="side-number-flag"></span>'));
    assert.ok(html.includes('<img class="country-flag" alt="">'));
  });
});
