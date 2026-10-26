/**
 * Section headers and bullets for the map toast and the message dialog.
 *
 * Purpose: Loss sections, Updates, and Message or Strategy share one header style.
 * When to use: `showMapToast` and the selected message tab.
 * Expected outcome: `## ` lines are bold headers. Other lines are bullets. Loss victims and opponent names gain their marks.
 * Exceptions: None.
 */

import type { LossLineSegment } from '../../shared/lossToastUnitSegments';
import { splitLossCauseLineForUnitFlags } from '../../shared/lossToastUnitSegments';
import { lossSectionOwnerId } from '../../shared/turnLossSections';
import { sideNameMarksForLine, type SideNameMarkSeat } from '../../shared/turnReportLines';
import { createLossTypeToken, createSideNumberFlag } from '../chrome/toastInlineMarks';
import { createAbsentUnitOriginFlagImage, type LossFlagIdentity } from '../core/unitOriginFlags';

/** Left margin applied to sub-bullets under a `##` section header in `#map-toast`. */
export const MAP_TOAST_SECTION_BULLET_INDENT = '1.25em';

/**
 * Facts the toast body uses to paint flags and type icons.
 *
 * Purpose: The toast string stays plain text. These options say who lost each section and which origins to show.
 * When to use: `appendMapToastMessageBody`, from `showMapToast`.
 * Expected outcome: Omitted fields paint headers and bullets with no origin flags, type icons, or number flags.
 * Exceptions: None.
 */
export interface MapToastBodyOptions {
  /**
   * Birth origins keyed by the side that lost the unit, then by display name.
   *
   * Contract: Optional. A name is present only when that side's victims agree on the flag.
   * When to use: A turn-update toast.
   * Expected outcome: A named victim in that side's section is preceded by its flag. Another side's copy of the same name is separate.
   * Exceptions: None.
   */
  readonly unitOriginByDisplayName?: ReadonlyMap<string, ReadonlyMap<string, LossFlagIdentity>>;
  /**
   * Roster rows used to match a header or a hex sentence to a seat.
   *
   * Contract: Optional. Each row has a seat id, seat order, and home name.
   * When to use: A turn-update toast.
   * Expected outcome: Loss headers resolve an owner. Opponent names can take a number flag.
   * Exceptions: None.
   */
  readonly seats?: readonly SideNameMarkSeat[];
  /**
   * The seat `Your Losses` belongs to.
   *
   * Contract: Optional. Null or omitted means there is no viewer.
   * When to use: A turn-update toast.
   * Expected outcome: `Your Losses` uses this seat for origin flags and type icons. A null viewer paints that header with no owner.
   * Exceptions: None.
   */
  readonly viewerSeatId?: string | null;
}

/**
 * The side and roster a single bullet is painted under.
 *
 * Purpose: Origin flags and type icons belong to the header above the bullet. Hex sentences do not.
 * When to use: `appendMapToastBulletLine`.
 * Expected outcome: A null owner paints a group token as text and adds no origin flag.
 * Exceptions: None.
 */
interface MapToastBulletContext {
  /**
   * The side named by the current loss header.
   *
   * Contract: Null under Updates and before the first header.
   * When to use: Looking up an origin and deciding whether a group gets an icon.
   * Expected outcome: The owner id, or null.
   * Exceptions: None.
   */
  readonly ownerId: string | null;
  /**
   * Origins for every side in this toast.
   *
   * Contract: The same map as `MapToastBodyOptions.unitOriginByDisplayName`.
   * When to use: Named victims.
   * Expected outcome: Absent when the toast has no origins.
   * Exceptions: None.
   */
  readonly unitOriginByDisplayName: MapToastBodyOptions['unitOriginByDisplayName'];
  /**
   * Seats that can be named in this toast.
   *
   * Contract: May be empty.
   * When to use: A number flag on a hex sentence.
   * Expected outcome: The roster passed to the body, or an empty list.
   * Exceptions: None.
   */
  readonly seats: readonly SideNameMarkSeat[];
}

/**
 * Appends one bullet line, with loss marks or an opponent flag before each named opponent.
 *
 * Purpose: Implements the indented sub-bullet layout under a section header.
 * When to use: From `appendMapToastMessageBody` for a line that is not a header.
 * Expected outcome: A block row. A cause line splits into names and groups. A plain line places a number flag before each opponent name.
 * Exceptions: None.
 */
function appendMapToastBulletLine(
  target: HTMLElement,
  line: string,
  indent: boolean,
  context: MapToastBulletContext
): void {
  const bulleted = line.startsWith('\u2022') ? line : `\u2022 ${line}`;
  const span = document.createElement('span');
  span.style.display = 'block';
  if (indent) span.style.marginLeft = MAP_TOAST_SECTION_BULLET_INDENT;
  const ownerFlags = context.ownerId == null ? undefined : context.unitOriginByDisplayName?.get(context.ownerId);
  const segments = splitLossCauseLineForUnitFlags(bulleted, new Set(ownerFlags == null ? [] : ownerFlags.keys()));
  const onlyPlain = segments.length === 1 && segments[0]?.unitDisplayName == null && segments[0]?.group == null;
  if (onlyPlain) appendPlainBullet(span, line, bulleted, context.seats, context.ownerId);
  else {
    for (const segment of segments) appendCauseSegment(span, segment, context.ownerId, ownerFlags, context.seats);
  }
  target.appendChild(span);
}

/**
 * Writes a bullet that is not a loss cause line, inserting a flag before each opponent name.
 *
 * Purpose: A hex sentence can name several opponents. Deployment lines and the unknown-battle sentence name none.
 * When to use: When the splitter returns a single plain segment.
 * Expected outcome: The bullet text, with a number flag immediately before each matched short name, and that name still
 *   written after the flag. No flag when the line has no mark. `sectionOwnerId` is the loss header above this bullet,
 *   so a shared short name flags that side as the subject.
 * Exceptions: None.
 */
function appendPlainBullet(
  span: HTMLElement,
  rawLine: string,
  bulleted: string,
  seats: readonly SideNameMarkSeat[],
  sectionOwnerId: string | null
): void {
  const extra = rawLine.startsWith('\u2022 ') ? 0 : 2;
  const placed = sideNameMarksForLine(rawLine, seats, sectionOwnerId).flatMap((mark) => {
    const flag = createSideNumberFlag(mark.seatId, seats);
    return flag ? [{ start: mark.start + extra, flag }] : [];
  });
  if (placed.length === 0) {
    span.textContent = bulleted;
    return;
  }
  let cursor = 0;
  for (const mark of placed) {
    span.append(document.createTextNode(bulleted.slice(cursor, mark.start)), mark.flag);
    cursor = mark.start;
  }
  span.append(document.createTextNode(bulleted.slice(cursor)));
}

/**
 * Writes one piece of a loss cause line, with an origin flag or a type icon when that piece has one.
 *
 * Purpose: Named victims and collapsed groups are separate tokens.
 * When to use: Each segment of a cause line.
 * Expected outcome: A known name is preceded by its origin flag. A group under a known owner is preceded by one type icon. The token text follows.
 * Exceptions: None. A null owner leaves a group as text.
 */
function appendCauseSegment(
  span: HTMLElement,
  segment: LossLineSegment,
  ownerId: string | null,
  ownerFlags: ReadonlyMap<string, LossFlagIdentity> | undefined,
  seats: readonly SideNameMarkSeat[]
): void {
  if (segment.unitDisplayName && ownerFlags) {
    const flag = ownerFlags.get(segment.unitDisplayName);
    if (flag) span.appendChild(createAbsentUnitOriginFlagImage(flag, segment.unitDisplayName));
  }
  if (segment.group && ownerId != null) {
    span.appendChild(createLossTypeToken(segment.group.unitType, ownerId, seats));
  }
  span.appendChild(document.createTextNode(segment.text));
}

/**
 * Appends a bold block section title with a trailing colon.
 *
 * Purpose: Shared title styling for `#map-toast` and `#ai-strategy-toast`.
 * When to use: From `appendMapToastMessageBody` and the opponent message dialog.
 * Expected outcome: A `display:block` `<strong>` whose text ends with `:`. `leading`, when passed, is the first child and the title stays one text node after it.
 *   Message and Strategy omit `leading`.
 * Exceptions: None.
 */
export function appendMapToastSectionHeader(target: HTMLElement, title: string, leading?: Node): void {
  const strong = document.createElement('strong');
  strong.style.display = 'block';
  const label = title.endsWith(':') ? title : `${title}:`;
  if (leading) strong.append(leading, document.createTextNode(label));
  else strong.textContent = label;
  target.appendChild(strong);
}

/**
 * Appends consolidated map toast body lines to a DOM parent, rendering `##` lines as bold section headers.
 *
 * Purpose: Supports per-side loss sections and the Updates section in `#map-toast`.
 * When to use: From `showMapToast`.
 * Expected outcome: Section headers render with a trailing colon. A blank line comes before a header when the body already has lines.
 *   A loss header sets the owner used by the bullets under it. An opponent header or hex sentence can show a number flag.
 * Exceptions: None.
 */
export function appendMapToastMessageBody(target: HTMLElement, message: string, options?: MapToastBodyOptions): void {
  const lines = message
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const seats = options?.seats ?? [];
  const viewerSeatId = options?.viewerSeatId ?? null;
  let ownerId: string | null = null;
  let inSection = false;
  for (const line of lines) {
    if (line.startsWith('## ')) {
      inSection = true;
      if (target.childNodes.length > 0) target.appendChild(document.createElement('br'));
      const title = line.slice(3);
      ownerId = lossSectionOwnerId(title, viewerSeatId, seats);
      const mark = sideNameMarksForLine(title, seats)[0];
      const flag = mark ? createSideNumberFlag(mark.seatId, seats) : null;
      appendMapToastSectionHeader(target, title, flag != null && mark != null && mark.start === 0 ? flag : undefined);
      continue;
    }
    appendMapToastBulletLine(target, line, inSection, {
      ownerId,
      unitOriginByDisplayName: options?.unitOriginByDisplayName,
      seats,
    });
  }
}
