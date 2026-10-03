import { LOSS_CAUSE_LABELS } from './lossSummary';

/**
 * One run of text within a loss-toast bullet.
 *
 * Purpose: Lets the toast renderer put a flag before victim names while keeping all other text plain.
 * When to use: Output of `splitLossCauseLineForUnitFlags`.
 * Expected outcome: Concatenating every segment's `text` reproduces the original line.
 * Exceptions: None.
 */
export interface LossLineSegment {
  /**
   * The literal text of this segment.
   *
   * Contract: Plain text; never HTML.
   * When to use: Always rendered, in order.
   * Expected outcome: Part of the original line.
   * Exceptions: None.
   */
  readonly text: string;
  /**
   * The victim display name this segment shows, when it is one.
   *
   * Contract: Equals `text` for a recognized victim name; `null` for labels, separators, and unknown tokens.
   * When to use: To decide whether a flag goes before the segment.
   * Expected outcome: Non-null only for names in the caller's known set.
   * Exceptions: None.
   */
  readonly unitDisplayName: string | null;
}

/**
 * Separator between victim names on a loss cause line.
 *
 * Purpose: Matches the join used by the loss formatters.
 * When to use: Internal to the splitter.
 * Expected outcome: `, `.
 * Exceptions: None.
 */
const VICTIM_SEPARATOR = ', ';

/**
 * Leading bullet the map toast adds to each line.
 *
 * Purpose: Lets the splitter accept lines with or without the bullet.
 * When to use: Internal to the splitter.
 * Expected outcome: `• `.
 * Exceptions: None.
 */
const BULLET_PREFIX = '\u2022 ';

/**
 * Splits a loss-toast bullet such as `• Melee attack: 1st Infantry, I Armor` into plain and victim-name segments.
 *
 * Purpose: Finds which parts of a formatted loss line are unit names, so the renderer can add their flags.
 * When to use: For each map-toast bullet when unit origins for the toast's victims are available.
 * Expected outcome: For a `<cause label>: ...` line, the bullet and label are plain segments and each
 *   comma-separated token is its own segment, marked as a unit name only when it is in `knownDisplayNames`
 *   (grouped totals such as `3 Infantry` stay plain). Any other line is one plain segment. The segments'
 *   text always concatenates back to `line`.
 * Exceptions: None.
 */
export function splitLossCauseLineForUnitFlags(
  line: string,
  knownDisplayNames: ReadonlySet<string>
): ReadonlyArray<LossLineSegment> {
  const bullet = line.startsWith(BULLET_PREFIX) ? BULLET_PREFIX : '';
  const body = line.slice(bullet.length);
  const label = LOSS_CAUSE_LABELS.find((candidate) => body.startsWith(`${candidate}: `));
  if (!label) return [{ text: line, unitDisplayName: null }];
  const prefix = `${bullet}${label}: `;
  const tokens = body.slice(label.length + 2).split(VICTIM_SEPARATOR);
  const segments: LossLineSegment[] = [{ text: prefix, unitDisplayName: null }];
  tokens.forEach((token, index) => {
    if (index > 0) segments.push({ text: VICTIM_SEPARATOR, unitDisplayName: null });
    segments.push({ text: token, unitDisplayName: knownDisplayNames.has(token) ? token : null });
  });
  return segments;
}
