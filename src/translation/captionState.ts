const MAX_CAPTION_CHARACTERS = 280;

export function keepRecentCaption(value: string, maximum = MAX_CAPTION_CHARACTERS): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= maximum) return text;
  let tail;
  if (typeof Intl.Segmenter === 'function') {
    const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((segment) => segment.segment);
    const recent: string[] = [];
    let length = 0;
    for (let index = graphemes.length - 1; index >= 0; index -= 1) {
      if (length + graphemes[index].length > maximum) break;
      recent.unshift(graphemes[index]);
      length += graphemes[index].length;
    }
    tail = recent.join('');
  } else {
    tail = text.slice(-maximum);
  }
  const boundary = tail.search(/\s/u);
  return boundary >= 0 && boundary < maximum / 3 ? tail.slice(boundary + 1) : tail;
}

export function textDirection(language: string): 'ltr' | 'rtl' {
  return ['ar', 'fa', 'he', 'ur'].includes(language.split('-')[0]) ? 'rtl' : 'ltr';
}
