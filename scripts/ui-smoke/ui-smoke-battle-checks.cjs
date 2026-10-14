/**
 * Checks of the battle header for the UI smoke run: while a battle is open the top bar names the battle and its beat
 * in place of the match status.
 *
 * Purpose: Keeps the battle header's checks apart from the frame, console, scenario, and map chrome checks.
 * When to use: Required by `ui-smoke-checks.cjs`, which runs these rows after the map chrome checks.
 * Expected outcome: Rows in the same shape as the frame checks: `{ name, scenes, needs, run(p, el) }`.
 * Exceptions: None.
 */
'use strict';

const { SCENES, BATTLE_SCENES, MATCH_SCENES } = require('./ui-smoke-scenes.cjs');

/**
 * The parts of the top bar that show the match status and hide in a battle.
 *
 * Purpose: One list for the two checks that show and hide them.
 * When to use: The battle header checks.
 * Expected outcome: The human side's name, the Production readout, and the date.
 * Exceptions: None.
 */
const MATCH_STATUS_PARTS = Object.freeze(['#topbar-human-side', '#topbar-stat-production', '#topbar-date']);

/**
 * The battle header's title: the battle's world hex code in parentheses.
 *
 * Purpose: The title names where the fight is, such as "Battle at (E8)".
 * When to use: The battle header check.
 * Expected outcome: Matches "Battle at (" and a two-character hex code and ")".
 * Exceptions: None.
 */
const BATTLE_TITLE = /^Battle at \([0-9A-Z]{2}\)$/;

/**
 * The battle header's status line while the player plans a beat: the beat, the phase, and the match date.
 *
 * Purpose: The status line reads like "Beat 2 · Tactical planning · April, Year 1", with the weather after it when the
 *   battle has weather.
 * When to use: The battle header check.
 * Expected outcome: Matches the beat and phase, then " · " and the start of a date.
 * Exceptions: None.
 */
const BATTLE_STATUS = /^Beat \d+ · Tactical planning · \S/;

/**
 * Scenes on the world map, where the top bar shows the match status.
 *
 * Purpose: The battle header must stay out of the way outside a battle.
 * When to use: The match status check.
 * Expected outcome: Every match scene that is not a battle scene.
 * Exceptions: None.
 */
const WORLD_MAP_SCENES = Object.freeze(MATCH_SCENES.filter((scene) => !BATTLE_SCENES.includes(scene)));

/**
 * The battle header checks, one row each.
 *
 * Purpose: One table that a reviewer can read top to bottom.
 * When to use: Add a row when a battle header rule needs a machine check.
 * Expected outcome: Each row is independent of the others.
 * Exceptions: None.
 */
const BATTLE_CHECKS = Object.freeze([
  {
    name: 'battle-header-shown',
    scenes: BATTLE_SCENES,
    needs: ['#battle-header-place', '#battle-header-title', '#battle-header-status', ...MATCH_STATUS_PARTS],
    run: (p, el) => {
      if (!el('#battle-header-place').shown) return 'the battle header is not shown';
      const title = el('#battle-header-title').text;
      if (!BATTLE_TITLE.test(title)) return `the title reads "${title}", expected one like "Battle at (E8)"`;
      const status = el('#battle-header-status').text;
      if (!BATTLE_STATUS.test(status)) return `the status line reads "${status}", expected one like "Beat 2 · Tactical planning · April, Year 1"`;
      const shown = MATCH_STATUS_PARTS.filter((selector) => el(selector).shown);
      return shown.length === 0 ? null : `the match status still shows in a battle: ${shown.join(', ')}`;
    },
  },
  {
    name: 'battle-header-hidden-on-world-map',
    scenes: WORLD_MAP_SCENES,
    needs: ['#battle-header-place', '#battle-header-center', ...MATCH_STATUS_PARTS],
    run: (p, el) => {
      const shown = ['#battle-header-place', '#battle-header-center'].filter((selector) => el(selector).shown);
      if (shown.length > 0) return `the battle header shows outside a battle: ${shown.join(', ')}`;
      const hidden = MATCH_STATUS_PARTS.filter((selector) => !el(selector).shown);
      return hidden.length === 0 ? null : `the match status is hidden outside a battle: ${hidden.join(', ')}`;
    },
  },
  {
    name: 'battle-header-small-window',
    scenes: [SCENES.battleSmallWindow],
    needs: ['#battle-header-title', '#battle-header-place', '#topbar-help-btn'],
    run: (p, el) => {
      const title = el('#battle-header-title');
      const place = el('#battle-header-place');
      if (title.x + title.w > place.x + place.w + 1) return `the title ${title.x + title.w} runs past its block ${place.x + place.w}`;
      const help = el('#topbar-help-btn');
      return help.shown && Math.abs(help.x + help.w - p.viewport.w) <= 1
        ? null
        : `Help is not at the right end of the header in the ${p.viewport.w} px window`;
    },
  },
]);

module.exports = { BATTLE_CHECKS };
