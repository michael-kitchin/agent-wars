/**
 * Structured hex naming captions: the caption text plus offset spans for headings and country names.
 *
 * Purpose: Lets the renderer bold headings and add country flags without re-parsing caption strings.
 * When to use: Main process builds captions with `HexNamingCaptionBuilder`; renderer formats with `formatHexNamingCaptionHtml`.
 * Expected outcome: `text` is the plain caption; spans mark names by character offset.
 * Exceptions: None.
 */
import { countryFlagImgHtml } from './countryFlags';
import { escapeHtmlText } from './htmlTextFormatting';

/**
 * One marked name inside a caption's text.
 *
 * Purpose: Identifies a group heading or a country item, and whether it gets a country flag.
 * When to use: Read by `formatHexNamingCaptionHtml`; produced only through `HexNamingCaptionBuilder`.
 * Expected outcome: Spans never overlap and are in ascending order.
 * Exceptions: None.
 */
export interface HexNamingCaptionSpan {
  /**
   * Inclusive start offset of the name in `HexNamingCaption.text`.
   *
   * Contract: `0 <= start <= end <= text.length`.
   * When to use: Slicing the name out of the caption text.
   * Expected outcome: Points at the first character of the name.
   * Exceptions: None.
   */
  readonly start: number;
  /**
   * Exclusive end offset of the name; never includes a heading's trailing colon.
   *
   * Contract: For headings, `text[end]` is the `:` that ends the heading.
   * When to use: Slicing the name and locating the heading colon.
   * Expected outcome: Points just past the last character of the name.
   * Exceptions: None.
   */
  readonly end: number;
  /**
   * Whether the span is a group heading (rendered bold with its colon) or an inline item.
   *
   * Contract: `heading` or `item`.
   * When to use: Choosing bold vs plain rendering.
   * Expected outcome: Headings are bold; items are plain.
   * Exceptions: None.
   */
  readonly role: 'heading' | 'item';
  /**
   * True when the span names a country and should be prefixed with a flag.
   *
   * Contract: False for continents and for the `Unknown Country` fallback heading.
   * When to use: Deciding whether to emit a flag before the name.
   * Expected outcome: Country names get a flag; other names do not.
   * Exceptions: None.
   */
  readonly isCountry: boolean;
  /**
   * Uppercase ISO 3166-1 alpha-2 code for a country span, when known.
   *
   * Contract: `null` for non-country spans and for countries without a code.
   * When to use: Selecting the flag asset; `null` with `isCountry` yields the placeholder flag.
   * Expected outcome: Two uppercase letters or `null`.
   * Exceptions: None.
   */
  readonly countryCode: string | null;
}

/**
 * A hex naming caption as sent from the main process to the renderer.
 *
 * Purpose: Keeps the exact caption text and the positions of names that need styling.
 * When to use: Returned by the hex naming IPC call; cached in the renderer.
 * Expected outcome: `text` is what plain-text consumers show; `spans` drive HTML formatting.
 * Exceptions: None.
 */
export interface HexNamingCaption {
  /**
   * Plain caption text, for example `France: Normandy, Brittany`.
   *
   * Contract: Never has leading or trailing spaces.
   * When to use: Plain-text display, cache keys, and emptiness checks.
   * Expected outcome: Same text the caption had before spans existed.
   * Exceptions: None.
   */
  readonly text: string;
  /**
   * Heading and country-name spans in ascending order.
   *
   * Contract: Empty for water captions; shares `EMPTY_HEX_NAMING_CAPTION_SPANS` when empty.
   * When to use: HTML formatting.
   * Expected outcome: Non-overlapping spans within `text`.
   * Exceptions: None.
   */
  readonly spans: ReadonlyArray<HexNamingCaptionSpan>;
}

/**
 * Shared frozen empty span list.
 *
 * Purpose: Avoids allocating an empty array for each of the many captions without spans.
 * When to use: As `spans` for any caption without headings or country names.
 * Expected outcome: Always empty; frozen so no caller can mutate it.
 * Exceptions: None.
 */
export const EMPTY_HEX_NAMING_CAPTION_SPANS: ReadonlyArray<HexNamingCaptionSpan> = Object.freeze([]);

/**
 * Incrementally builds a caption's text and spans so offsets always match the text.
 *
 * Purpose: Keeps span bookkeeping in one place instead of in every caption producer.
 * When to use: Append text, headings, and country items in display order, then call `build` once.
 * Expected outcome: A caption whose spans point at exactly the appended names.
 * Exceptions: None.
 */
export class HexNamingCaptionBuilder {
  /**
   * Caption text accumulated so far.
   *
   * Purpose: Source of the final `text` and of the next span's start offset.
   * When to use: Mutated only by the append methods.
   * Expected outcome: Grows monotonically.
   * Exceptions: None.
   */
  private text = '';

  /**
   * Spans recorded so far, in append order.
   *
   * Purpose: Collects heading and country spans while text is appended.
   * When to use: Mutated only by the append methods; copied by `build`.
   * Expected outcome: Ascending, non-overlapping spans.
   * Exceptions: None.
   */
  private readonly spans: HexNamingCaptionSpan[] = [];

  /**
   * Appends plain text with no span.
   *
   * Purpose: Separators, item lists, and any text that needs no styling.
   * When to use: Between and after headings and items.
   * Expected outcome: Returns this builder for chaining.
   * Exceptions: None.
   */
  appendText(value: string): this {
    this.text += value;
    return this;
  }

  /**
   * Appends a group heading followed by `': '`.
   *
   * Purpose: Records a bold heading span (optionally a country) right before its colon.
   * When to use: At the start of each group; append the group body afterwards.
   * Expected outcome: Text gains `name: `; the span covers `name` only.
   * Exceptions: None.
   */
  appendHeading(name: string, countryCode: string | null, isCountry: boolean): this {
    this.spans.push({ start: this.text.length, end: this.text.length + name.length, role: 'heading', isCountry, countryCode });
    this.text += `${name}: `;
    return this;
  }

  /**
   * Appends a country name as an inline item.
   *
   * Purpose: Marks a country in a list (for example under a continent heading) so it gets a flag.
   * When to use: For each country name in a country list; append separators with `appendText`.
   * Expected outcome: Text gains `name`; the span covers it.
   * Exceptions: None.
   */
  appendCountryItem(name: string, countryCode: string | null): this {
    this.spans.push({ start: this.text.length, end: this.text.length + name.length, role: 'item', isCountry: true, countryCode });
    this.text += name;
    return this;
  }

  /**
   * Produces the finished caption.
   *
   * Purpose: Snapshot of the accumulated text and spans.
   * When to use: Once, after all appends.
   * Expected outcome: Frozen spans, or the shared empty list when there are none.
   * Exceptions: None.
   */
  build(): HexNamingCaption {
    const spans = this.spans.length > 0 ? Object.freeze([...this.spans]) : EMPTY_HEX_NAMING_CAPTION_SPANS;
    return { text: this.text, spans };
  }
}

/**
 * Builds a key that is equal for two captions only when they are identical in every field.
 *
 * Purpose: Lets the terrain cache share one caption object among cells with identical captions.
 * When to use: When interning captions in a `Map`.
 * Expected outcome: Text plus every span field, joined with `\u0000`.
 * Exceptions: None.
 */
export function hexNamingCaptionInternKey(caption: HexNamingCaption): string {
  const spanKeys = caption.spans.map(
    (span) => `${span.start}\u0000${span.end}\u0000${span.role}\u0000${span.isCountry ? 1 : 0}\u0000${span.countryCode ?? ''}`
  );
  return [caption.text, ...spanKeys].join('\u0000');
}

/**
 * Formats a caption as HTML: bold headings, flags before country names, everything escaped.
 *
 * Purpose: Single renderer formatter for hover tooltips, the build popup, and the melee-intercept cell.
 * When to use: Wherever a naming caption is inserted with `innerHTML`.
 * Expected outcome: One linear pass; headings become `<strong>[flag]Name:</strong>`, country items `[flag]Name`.
 * Exceptions: None; a heading not followed by `:` is closed without consuming a character.
 */
export function formatHexNamingCaptionHtml(caption: HexNamingCaption): string {
  const { text } = caption;
  let html = '';
  let cursor = 0;
  for (const span of caption.spans) {
    html += escapeHtmlText(text.slice(cursor, span.start));
    const flag = span.isCountry ? countryFlagImgHtml(span.countryCode) : '';
    const name = escapeHtmlText(text.slice(span.start, span.end));
    if (span.role === 'heading') {
      const hasColon = text[span.end] === ':';
      html += `<strong>${flag}${name}${hasColon ? ':' : ''}</strong>`;
      cursor = hasColon ? span.end + 1 : span.end;
    } else {
      html += `${flag}${name}`;
      cursor = span.end;
    }
  }
  return html + escapeHtmlText(text.slice(cursor));
}
