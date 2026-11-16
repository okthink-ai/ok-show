/** Rendered ranges preserve inline markup and map back to the manuscript's source blocks. */
export function manuscriptSentences(content: HTMLElement): Range[] {
  const blocks = new Map<Element, Text[]>();
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || parent.closest('button, [data-practice-href], .practice-annotation-pins')) continue;
    const block = parent.closest('p,h1,h2,h3,h4,h5,h6,li,pre,td,th');
    if (!block) continue;
    const nodes = blocks.get(block) ?? [];
    nodes.push(node as Text);
    blocks.set(block, nodes);
  }
  const ranges: Range[] = [];
  const Segmenter = (Intl as typeof Intl & { Segmenter?: new (locale: string, options: { granularity: string }) => { segment: (text: string) => Iterable<{ index: number; segment: string }> } }).Segmenter;
  const segmenter = Segmenter ? new Segmenter('en', { granularity: 'sentence' }) : null;
  for (const [block, nodes] of blocks) {
    const text = nodes.map(node => node.data).join('');
    const unwrapped = text.replace(/[\r\n]/g, ' ');
    const segments = block.tagName === 'PRE' ? [{ index: 0, segment: text }]
      : segmenter ? Array.from(segmenter.segment(unwrapped))
      : Array.from(unwrapped.matchAll(/[^.!?]+[.!?]*(?:\s+|$)/g), match => ({ index: match.index, segment: match[0] }));
    const point = (offset: number): [Text, number] => {
      for (const node of nodes) {
        if (offset <= node.length) return [node, offset];
        offset -= node.length;
      }
      const last = nodes[nodes.length - 1];
      return [last, last.length];
    };
    for (const part of segments) {
      const trimmed = part.segment.trim();
      if (!trimmed) continue;
      const start = part.index + part.segment.indexOf(trimmed);
      const range = document.createRange();
      range.setStart(...point(start));
      range.setEnd(...point(start + trimmed.length));
      ranges.push(range);
    }
  }
  // Nested lists can interleave text owned by different blocks.
  return ranges.sort((a, b) => a.compareBoundaryPoints(Range.START_TO_START, b));
}

export function attachSentenceNavigation(viewport: HTMLElement, content: HTMLElement, annotate: () => void): () => void {
  const sentences = manuscriptSentences(content);
  let focus: number | null = null;
  let anchor = 0;
  let expectedScroll: number | null = null;
  const nearest = () => {
    const line = viewport.getBoundingClientRect().top + viewport.clientHeight / 2;
    let best = 0;
    let distance = Infinity;
    sentences.forEach((sentence, index) => {
      for (const rect of sentence.getClientRects()) {
        const candidate = Math.abs(rect.top + rect.height / 2 - line);
        if (rect.height && candidate < distance) { best = index; distance = candidate; }
      }
    });
    return best;
  };
  const select = () => {
    if (focus === null) return;
    const first = sentences[Math.min(anchor, focus)];
    const last = sentences[Math.max(anchor, focus)];
    const selection = window.getSelection();
    const range = first.cloneRange();
    range.setEnd(last.endContainer, last.endOffset);
    selection?.removeAllRanges();
    selection?.addRange(range);
    const rect = Array.from(sentences[focus].getClientRects()).find(rect => rect.height > 0);
    if (rect) {
      viewport.scrollTop += rect.top + rect.height / 2 - viewport.getBoundingClientRect().top - viewport.clientHeight / 2;
      expectedScroll = viewport.scrollTop;
    }
  };
  const reset = () => { focus = null; };
  const scroll = () => {
    if (expectedScroll !== null && Math.abs(viewport.scrollTop - expectedScroll) < 1) return;
    reset();
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing ||
      (event.target as HTMLElement).closest('input,textarea,button,a,select,[contenteditable="true"]')) return;
    const key = event.key.toLowerCase();
    if (!['j', 'k', 'x', 'escape'].includes(key) || !sentences.length) return;
    event.preventDefault();
    event.stopPropagation();
    if (key === 'escape') { reset(); window.getSelection()?.removeAllRanges(); return; }
    if (key === 'x') {
      const selection = window.getSelection();
      if (!selection?.toString().trim() || !content.contains(selection.anchorNode) || !content.contains(selection.focusNode)) {
        focus = nearest(); anchor = focus; select();
      }
      annotate();
      return;
    }
    if (focus === null) { focus = nearest(); anchor = focus; }
    focus = Math.max(0, Math.min(sentences.length - 1, focus + (key === 'j' ? 1 : -1)));
    if (!event.shiftKey) anchor = focus;
    select();
  };
  viewport.addEventListener('keydown', keydown);
  viewport.addEventListener('pointerdown', reset);
  viewport.addEventListener('scroll', scroll, { passive: true });
  return () => {
    viewport.removeEventListener('keydown', keydown);
    viewport.removeEventListener('pointerdown', reset);
    viewport.removeEventListener('scroll', scroll);
  };
}
