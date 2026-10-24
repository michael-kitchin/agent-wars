/**
 * Labels and descriptions for the doctrine choices a commander can be given.
 *
 * Purpose: The interface and any later summary use one wording for Aggressive, Balanced, Cautious, and Random.
 * When to use: A doctrine control or a roster row. Prompt blocks live in `doctrineText.ts`, not here.
 * Expected outcome: Balanced's description paraphrases the shared strategy block. Random names the draw and when it is revealed.
 * Exceptions: None. This module does not import the main-process logger.
 */

import type { DoctrineChoice } from './seatRoster';

/**
 * Display name of each doctrine choice.
 *
 * Purpose: The control shows a name, not the stored id.
 * When to use: A doctrine menu or a seat summary.
 * Expected outcome: `aggressive` is Aggressive. `random` is Random.
 * Exceptions: None.
 */
export const DOCTRINE_CHOICE_LABELS: Readonly<Record<DoctrineChoice, string>> = {
  aggressive: 'Aggressive',
  balanced: 'Balanced',
  cautious: 'Cautious',
  random: 'Random',
};

/**
 * One-line description of each doctrine choice.
 *
 * Purpose: The control explains the choice. Balanced paraphrases the shared strategy block, which is the only balanced prompt text.
 * When to use: Beside `DOCTRINE_CHOICE_LABELS`.
 * Expected outcome: The four sentences. Random says the draw is revealed when the game ends.
 * Exceptions: None.
 */
export const DOCTRINE_CHOICE_DESCRIPTIONS: Readonly<Record<DoctrineChoice, string>> = {
  aggressive: 'Attacks early, accepts losses, and strikes cities it does not plan to hold.',
  balanced: 'Uses speed and surprise, attacks weak points, and avoids the enemy\'s strengths.',
  cautious: 'Guards its home, fights only at an advantage, and grows its forces before attacking.',
  random: 'Draws Aggressive, Balanced, or Cautious when the game starts. The draw is revealed when the game ends.',
};
