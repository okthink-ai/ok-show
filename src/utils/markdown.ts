/**
 * Markdown helpers that keep arbitrary user text from becoming Markdown
 * structure. Each one wraps its value so that backticks, heading markers, and
 * fences inside the value stay literal.
 */

function longestBacktickRun(value: string): number {
  return Math.max(0, ...[...value.matchAll(/`+/g)].map(match => match[0].length));
}

/** Wraps a value in a code span whose fence is longer than any backtick run inside it. */
export function inlineCode(value: string): string {
  const fence = '`'.repeat(longestBacktickRun(value) + 1);
  // CommonMark strips one space from each side, so a value that starts or
  // ends with a backtick can be padded without changing what it shows.
  const padding = value.startsWith('`') || value.endsWith('`') ? ' ' : '';
  return `${fence}${padding}${value}${padding}${fence}`;
}

/** Wraps a value in a fenced code block whose fence is longer than any backtick run inside it. */
export function fencedText(value: string, language = 'text'): string {
  const fence = '`'.repeat(Math.max(3, longestBacktickRun(value) + 1));
  return `${fence}${language}\n${value}\n${fence}`;
}

/** Quotes every line of a value, so any structure it contains ends with the quote. */
export function blockquote(value: string): string {
  return value.split(/\r?\n/).map(line => line ? `> ${line}` : '>').join('\n');
}

/** Joins values as an English list: "a", "a and b", "a, b, and c". */
export function humanList(values: string[]): string {
  if (values.length <= 1) return values[0] ?? '';
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}
