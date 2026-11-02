/**
 * Heading outline checks for assembled commander prompts.
 *
 * Purpose: A prompt review needs headings that nest, and the tests need one way to read them.
 * When to use: After building a strategic or tactical system prompt.
 * Expected outcome: Heading lines outside fences, and a throw that names a pair that skips a level.
 * Exceptions: `assertHeadingsNest` throws when the first heading is not H1 or a heading is more than one level deeper than the previous one.
 */

/**
 * Heading lines outside fenced code.
 *
 * Purpose: Map legends and JSON examples can contain hash characters that are not headings.
 * When to use: Before a nesting or order assertion.
 * Expected outcome: Each ATX heading line, in order. A line of three backticks toggles the fence.
 * Exceptions: None.
 */
export function headingOutline(prompt: string): string[] {
  let fenced = false;
  const headings: string[] = [];
  for (const line of prompt.split('\n')) {
    if (line.startsWith('```')) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    if (/^#{1,6} /.test(line)) headings.push(line);
  }
  return headings;
}

/**
 * Requires the outline to start at H1 and never skip a level downward.
 *
 * Purpose: A reviewer should be able to read the prompt as a nested document.
 * When to use: On `headingOutline` of a full system prompt.
 * Expected outcome: Returns when every heading is at most one level deeper than the one before it.
 * Exceptions: Throws an error naming the offending heading, or the previous heading when a level is skipped.
 */
export function assertHeadingsNest(outline: readonly string[]): void {
  let previousLevel = 0;
  outline.forEach((line, index) => {
    const level = line.match(/^(#{1,6}) /)?.[1]?.length ?? 0;
    if (index === 0 && level !== 1) {
      throw new Error(`first heading is not H1: ${line}`);
    }
    if (index > 0 && level > previousLevel + 1) {
      throw new Error(`heading ${line} is more than one level deeper than ${outline[index - 1]}`);
    }
    previousLevel = level;
  });
}

/**
 * Section titles whose prose lines must stay short enough to review.
 *
 * Purpose: The line-length check applies only to the prose sections, not to tables, the map, or the roster.
 * When to use: `assertProseLinesWithinLimit`.
 * Expected outcome: A heading whose title is in this set starts a checked region. The next H1 outside the set ends it.
 * Exceptions: `Available Tools` and `Response Format` keep their H2 children inside the checked region.
 */
const PROSE_LINE_SECTIONS: ReadonlySet<string> = new Set([
  'Your Command',
  'Coordinates',
  'Combat and Movement Rules',
  'Strategic Context',
  'Battle Context',
  'Mercenaries',
  'Available Tools',
  'Response Format',
]);

/**
 * Requires prose lines in the named sections to stay within a character limit.
 *
 * Purpose: A paragraph that is one enormous line is hard to review even when the wording is right.
 * When to use: After assembling a strategic or tactical system prompt.
 * Expected outcome: Returns when every checked line is at most `limit` characters.
 * Exceptions: Throws naming the section and the length. Table rows, fenced lines, compact JSON lines, roster lines, and home-region hex lists are skipped.
 */
export function assertProseLinesWithinLimit(prompt: string, limit = 700): void {
  let fenced = false;
  let section: string | null = null;
  prompt.split('\n').forEach((line) => {
    if (line.startsWith('```')) {
      fenced = !fenced;
      return;
    }
    const heading = /^(#{1,6}) (.*)$/.exec(line);
    if (heading && !fenced) {
      const level = heading[1]?.length ?? 0;
      const title = heading[2] ?? '';
      if (level === 1) section = PROSE_LINE_SECTIONS.has(title) ? title : null;
      return;
    }
    if (!section || fenced) return;
    if (line.startsWith('|') || line.trimStart().startsWith('{')) return;
    if (line.includes('home region hexes are')) return;
    if (line.includes('(infantry)') || line.includes('(armor)') || line.startsWith('Enemy units')) return;
    if (line.length > limit) {
      throw new Error(`${section} line is ${line.length} characters: ${line.slice(0, 80)}`);
    }
  });
}
