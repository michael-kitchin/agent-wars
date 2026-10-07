/**
 * The tech-bonus sentence in the combat rules paragraph.
 *
 * Purpose: Keeps the new sentence out of the combat-rules module, which is already near the file-size limit.
 * When to use: `buildCombatRulesParagraph`, after the origin-bonus sentence.
 * Expected outcome: Null when tech is off, so a prompt with tech off stays unchanged. Low names attack only and says the tech bonus does not change defense. High names attack and defense.
 * Exceptions: None.
 */

import { logTrace } from '../../logger';
import { advancedTechMinUrbanCells } from '../../../shared/gameRules';
import { techBonusLevelOf } from '../../../shared/techBonusRules';
import type { OriginBonusSettings } from '../../../shared/originBonusTypes';

/**
 * Returns the tech-bonus sentence for this match, or null when the option is off.
 *
 * Purpose: The model needs the same amounts the dice use, including that casualty order ignores them.
 * When to use: Once per combat-rules paragraph.
 * Expected outcome: One sentence, or null.
 * Exceptions: None.
 */
export function buildTechBonusRule(settings: OriginBonusSettings): string | null {
  const level = techBonusLevelOf(settings);
  logTrace('promptSpec buildTechBonusRule', { level });
  if (level === 'off') return null;
  const birth = `An Advanced unit, born in a hex with at least ${advancedTechMinUrbanCells()} urban cells,`;
  if (level === 'high') {
    return `Tech bonus is on. ${birth} adds 2 to its attack and 2 to its defense. A Basic unit adds nothing. Casualty order still uses printed defense.`;
  }
  return `Tech bonus is on. ${birth} adds 2 to its attack. A Basic unit adds nothing. The tech bonus does not change defense. Casualty order still uses printed defense.`;
}
