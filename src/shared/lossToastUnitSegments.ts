import { LOSS_CAUSE_LABELS, type LostUnitType } from './lossSummary';

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
  /**
   * A collapsed type total, when this token is one.
   *
   * Contract: Present only for a whole token such as `4x Infantry` that is not a known unit name.
   *   Omitted on every other segment.
   * When to use: To paint one type icon before the token.
   * Expected outcome: The unit type and the count in the token.
   * Exceptions: None.
   */
  readonly group?: { readonly unitType: LostUnitType; readonly count: number };
}

/**
 * Labels a popup group token can use, in the same spelling `formatLossEntries` writes.
 *
 * Purpose: The splitter recognizes those tokens without parsing the rest of the line.
 * When to use: `victimSegment`.
 * Expected outcome: `4x Armored` maps to armor.
 * Exceptions: None.
 */
const GROUP_TYPE_BY_LABEL: Readonly<Record<string, LostUnitType>> = {
  Naval: 'naval',
  Air: 'air',
  Armored: 'armor',
  Infantry: 'infantry',
  Missile: 'missile',
};

/**
 * A collapsed group token.
 *
 * Purpose: Matches `4x Infantry` and not the older `3 Infantry` form.
 * When to use: `victimSegment`.
 * Expected outcome: The count and one of the four labels.
 * Exceptions: None.
 */
const GROUP_TOKEN = /^(\d+)x (Naval|Air|Armored|Infantry|Missile)$/;

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
 * When to use: For each map-toast bullet. Pass the current owner's known names, or an empty set when that owner has none.
 * Expected outcome: For a `<cause label>: ...` line, the bullet and label are plain segments and each
 *   comma-separated token is its own segment, marked as a unit name only when it is in `knownDisplayNames`
 *   (older totals such as `3 Infantry` stay plain). A token `4x Infantry` that is not a known name
 *   carries `group`, so a loss section can paint a type icon even when no origin flag exists.
 *   Any other line is one plain segment. The segments' text always concatenates back to `line`.
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
    segments.push(victimSegment(token, knownDisplayNames));
  });
  return segments;
}

/**
 * One victim token as a unit name, a collapsed group, or plain text.
 *
 * Purpose: A known display name wins even when it looks like `4x Infantry`.
 * When to use: Each comma-separated token of a cause line.
 * Expected outcome: A unit segment, a group segment, or a plain segment. `group` is omitted unless it is a group.
 * Exceptions: None.
 */
function victimSegment(token: string, knownDisplayNames: ReadonlySet<string>): LossLineSegment {
  if (knownDisplayNames.has(token)) return { text: token, unitDisplayName: token };
  const match = GROUP_TOKEN.exec(token);
  const unitType = match ? GROUP_TYPE_BY_LABEL[match[2] ?? ''] : undefined;
  if (match && unitType) {
    return { text: token, unitDisplayName: null, group: { unitType, count: Number(match[1]) } };
  }
  return { text: token, unitDisplayName: null };
}
