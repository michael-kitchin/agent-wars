/**
 * Checks of the battle header for the UI smoke run: while a battle is open the top bar names the battle and its beat
 * in place of the match status, shows the force bar, and holds Exit Battle.
 *
 * Purpose: Keeps the battle header's checks apart from the frame, console, scenario, and map chrome checks.
 * When to use: Required by `ui-smoke-checks.cjs`, which runs these rows after the map chrome checks.
 * Expected outcome: Rows in the same shape as the frame checks: `{ name, scenes, needs, run(p, el) }`.
 * Exceptions: None.
 */
'use strict';

const { SCENES, BATTLE_SCENES, MATCH_SCENES, near } = require('./ui-smoke-scenes.cjs');

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
 * The force bar's width, in CSS pixels, at most window widths and below 1100 px.
 *
 * Purpose: The bar narrows in a narrow window so the header still fits.
 * When to use: The force bar width check.
 * Expected outcome: Matches `.battle-force-bar` in `static/frameChrome.css`.
 * Exceptions: None.
 */
const FORCE_BAR = Object.freeze({ width: 320, narrowWidth: 160, narrowBelow: 1100 });

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
    name: 'force-bar-counts',
    scenes: BATTLE_SCENES,
    needs: ['#battle-force-bar', '#battle-force-human-count', '#battle-force-opponent-count', '#battle-force-bar .battle-force-track', '#battle-force-human-fill'],
    run: (p, el) => {
      if (!el('#battle-force-bar').shown) return 'the force bar is not shown';
      const human = Number(el('#battle-force-human-count').text);
      const opponent = Number(el('#battle-force-opponent-count').text);
      if (!Number.isInteger(human) || !Number.isInteger(opponent)) {
        return `the counts read "${el('#battle-force-human-count').text}" and "${el('#battle-force-opponent-count').text}"`;
      }
      const share = human + opponent > 0 ? human / (human + opponent) : 0.5;
      const track = el('#battle-force-bar .battle-force-track');
      const fill = el('#battle-force-human-fill');
      return Math.abs(fill.w - share * track.w) <= 2
        ? null
        : `the teal part is ${Math.round(fill.w)} of ${Math.round(track.w)} px, expected ${Math.round(share * track.w)} for ${human} against ${opponent}`;
    },
  },
  {
    name: 'force-bar-width',
    scenes: BATTLE_SCENES,
    needs: ['#battle-force-bar', '#battle-force-bar .battle-force-caption'],
    run: (p, el) => {
      const narrow = p.viewport.w < FORCE_BAR.narrowBelow;
      const width = narrow ? FORCE_BAR.narrowWidth : FORCE_BAR.width;
      const bar = el('#battle-force-bar');
      if (!near(bar.w, width)) return `the force bar is ${Math.round(bar.w)} px wide in the ${p.viewport.w} px window, expected ${width}`;
      const captionShown = el('#battle-force-bar .battle-force-caption').shown;
      return captionShown === !narrow ? null : `the caption is ${captionShown ? 'shown' : 'hidden'} in the ${p.viewport.w} px window`;
    },
  },
  {
    name: 'exit-battle-in-header',
    scenes: BATTLE_SCENES,
    needs: ['#tactical-exit-btn', '#tactical-annihilation-overlay'],
    run: (p, el) => {
      const exit = el('#tactical-exit-btn');
      if (el('#tactical-annihilation-overlay').shown) return exit.shown ? 'Exit Battle shows beside the annihilation dialog' : null;
      if (!exit.shown || exit.disabled) return `Exit Battle is ${exit.shown ? 'disabled' : 'hidden'} while the player plans a beat`;
      return exit.ancestorIds.includes('app-topbar') ? null : 'Exit Battle is not in the top bar';
    },
  },
  {
    name: 'world-map-after-exit',
    scenes: [SCENES.battleExited],
    needs: ['#topbar-turn-phase', '#tactical-exit-btn'],
    run: (p, el) => {
      const turn = el('#topbar-turn-phase').text;
      if (!/^Turn \d+ · Planning$/.test(turn)) return `the top bar reads "${turn}", expected world-map planning`;
      return el('#tactical-exit-btn').shown ? 'Exit Battle still shows on the world map' : null;
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
