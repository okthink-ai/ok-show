import { readFile } from 'node:fs/promises';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { visit, SKIP } from 'unist-util-visit';
import type { Root } from 'hast';
import type { Plugin } from 'vite';
import { preparePracticeMarkdown } from '../src/practice/slideCues';
import { presentationIdFromManuscriptPath } from '../src/practice/manuscripts';

export function compilePracticeMarkdown(source: string, presentationId: string): string {
  // Stable markers become links here; their current slide numbers resolve in the reader.
  const prepared = preparePracticeMarkdown(source, presentationId, []);
  return String(unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeSanitize)
    .use(() => (tree: Root) => {
      // Remove the authoring-only section after parsing so manuscript line
      // numbers remain faithful to the manuscript for captured annotation passages.
      let hiddenSectionDepth: number | null = null;
      tree.children = tree.children.filter((node) => {
        if (node.type === 'element' && /^h[1-6]$/.test(node.tagName)) {
          const depth = Number(node.tagName[1]);
          if (hiddenSectionDepth !== null && depth <= hiddenSectionDepth) hiddenSectionDepth = null;
          const title = node.children.filter((child) => child.type === 'text').map((child) => child.value).join('').trim();
          if (title.toLowerCase() === 'context for agents') hiddenSectionDepth = depth;
        }
        return hiddenSectionDepth === null;
      });
      visit(tree, 'element', (node, index, parent) => {
        if (/^(p|h[1-6]|li|pre|tr)$/.test(node.tagName)) {
          node.properties['data-source-line'] = node.position?.start.line;
          node.properties['data-source-end-line'] = node.position?.end.line;
        }
        if (node.tagName === 'a') {
          node.properties.target = '_blank';
          node.properties.rel = ['noreferrer'];
          if (typeof node.properties.href === 'string') node.properties.href = node.properties.href.replace(/^(?![a-z]+:|\/|#)/i, '/');
        }
        if (node.tagName === 'table' && parent && index !== undefined) {
          parent.children[index] = { type: 'element', tagName: 'div', properties: { className: ['talk-practice__table'] }, children: [node] };
          // Keep visiting the table's rows once, without wrapping it again.
          visit(node, 'element', (child) => {
            if (child.tagName === 'tr') {
              child.properties['data-source-line'] = child.position?.start.line;
              child.properties['data-source-end-line'] = child.position?.end.line;
            }
          });
          return SKIP;
        }
      });
    }).use(rehypeStringify).processSync(prepared));
}

/** Compiles `<presentationsDir>/<id>/manuscript.md?practice` into reader HTML plus its source. */
export function practiceMarkdownPlugin({ presentationsDir }: { presentationsDir: string }): Plugin {
  return {
    name: 'ok-show:practice-markdown', enforce: 'pre',
    async load(id) {
      if (!id.endsWith('.md?practice')) return;
      const file = id.slice(0, -'?practice'.length);
      const presentationId = presentationIdFromManuscriptPath(file, presentationsDir);
      if (!presentationId) return;
      this.addWatchFile(file);
      const source = await readFile(file, 'utf8');
      return `export default ${JSON.stringify(compilePracticeMarkdown(source, presentationId))};\nexport const source = ${JSON.stringify(source)};`;
    },
  };
}
