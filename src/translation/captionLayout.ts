export interface CaptionLayoutWord {
  text: string;
  start: number;
  ordinal: number;
  part: number;
  spaceBefore: boolean;
}

export interface CaptionLayoutLine {
  text: string;
  words: CaptionLayoutWord[];
}

type MeasureText = (value: string) => number;

function splitToFit(value: string, maximumWidth: number, measure: MeasureText): string[] {
  if (measure(value) <= maximumWidth) return [value];
  const parts: string[] = [];
  let part = '';
  for (const character of Array.from(value)) {
    if (part && measure(part + character) > maximumWidth) {
      parts.push(part);
      part = character;
    } else {
      part += character;
    }
  }
  if (part) parts.push(part);
  return parts;
}

/** Wrap a transcript using the rendered font metrics, then retain complete recent lines. */
export function recentCaptionLines(value: string, maximumWidth: number, measure: MeasureText, maximumLines = 2): CaptionLayoutLine[] {
  if (!(maximumWidth > 0) || maximumLines <= 0) return [];
  const matches = [...value.matchAll(/\S+/gu)];
  const lines: CaptionLayoutLine[] = [];
  let words: CaptionLayoutWord[] = [];
  let text = '';
  const commit = () => {
    if (!words.length) return;
    lines.push({ text, words });
    words = [];
    text = '';
  };

  matches.forEach((match, ordinal) => {
    const source = match[0];
    const parts = splitToFit(source, maximumWidth, measure);
    parts.forEach((part, partIndex) => {
      const spaceBefore = partIndex === 0 && ordinal > 0;
      let lineSpace = partIndex === 0 && words.length > 0;
      const candidate = `${text}${lineSpace ? ' ' : ''}${part}`;
      if (words.length && measure(candidate) > maximumWidth) {
        commit();
        lineSpace = false;
      }
      words.push({ text: part, start: match.index, ordinal, part: partIndex, spaceBefore });
      text = `${text}${lineSpace ? ' ' : ''}${part}`;
    });
  });
  commit();
  return lines.slice(-maximumLines);
}
