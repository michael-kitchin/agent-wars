/**
 * Checks of replay over a finished match's results screen, for the UI smoke run.
 *
 * Purpose: Replay shows the results screen only on the last step, and the match chrome returns on earlier steps.
 * When to use: Required by `ui-smoke-checks.cjs`, which runs these rows after the new-game screen's rows.
 * Expected outcome: Rows in the same shape as the frame checks: `{ name, scenes, needs, run(p, el) }`.
 * Exceptions: None.
 */
'use strict';

const { SCENES } = require('./ui-smoke-scenes.cjs');

/**
 * Every check this file adds.
 *
 * Purpose: One table for the three scenes recorded around replay over a finished match.
 * When to use: Spread into `CHECKS` by `ui-smoke-checks.cjs`.
 * Expected outcome: The last step shows the replay panel and the results screen, read from its heading, since the smoke match ends with no standings. An earlier step shows the panel and the match chrome without the results screen. Leaving shows the results screen and no panel.
 * Exceptions: None.
 */
const REPLAY_RESULTS_CHECKS = Object.freeze([
  {
    name: 'replay-over-a-finished-match-opens-on-the-results-screen',
    scenes: [SCENES.gameOverReplayLast],
    needs: ['#replay-panel', '#game-over-overlay', '#game-over-message', '#sidebar'],
    run: (p, el) => {
      if (!el('#replay-panel').shown) return 'the replay panel is not shown on the last step';
      if (!el('#game-over-overlay').shown) return 'the results screen is not shown on the last step';
      if (!el('#game-over-message').shown) return 'the results heading is not shown on the last step';
      return el('#sidebar').shown ? 'the console is shown over the results screen' : null;
    },
  },
  {
    name: 'replay-sets-the-results-screen-aside-before-the-last-turn',
    scenes: [SCENES.gameOverReplayEarlier],
    needs: ['#replay-panel', '#game-over-overlay', '#sidebar', '#app-topbar .topbar-date-block'],
    run: (p, el) => {
      if (!el('#replay-panel').shown) return 'the replay panel is not shown on an earlier step';
      if (el('#game-over-overlay').shown) return 'the results screen is still shown on an earlier step';
      if (!el('#sidebar').shown) return 'the console is not shown on an earlier step';
      return el('#app-topbar .topbar-date-block').shown ? null : 'the top bar date is not shown on an earlier step';
    },
  },
  {
    name: 'leaving-replay-over-a-finished-match-shows-the-results-screen',
    scenes: [SCENES.gameOverReplayLeft],
    needs: ['#replay-panel', '#game-over-overlay', '#game-over-message'],
    run: (p, el) => {
      if (el('#replay-panel').shown) return 'the replay panel is still shown after leaving';
      if (!el('#game-over-overlay').shown) return 'the results screen is not shown after leaving';
      return el('#game-over-message').shown ? null : 'the results heading is not shown after leaving';
    },
  },
]);

module.exports = { REPLAY_RESULTS_CHECKS };
