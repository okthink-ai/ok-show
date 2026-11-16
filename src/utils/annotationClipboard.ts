import type {
  Annotation,
  AnnotationOperation,
  ElementAnnotation,
} from '../types/annotation.types';
import {
  describeAnnotationTarget,
  inferAnnotationOperation,
  type AnnotationSnapshot,
  type AnnotationTargetDescription,
} from './annotationTarget';
import { blockquote, fencedText, humanList, inlineCode } from './markdown';
import { deckSourceRoot } from '../project/paths';

export { inferAnnotationOperation } from './annotationTarget';

const PACKET_FORMAT_VERSION = 2;

const OPERATION_LABELS: Record<AnnotationOperation, string> = {
  'content-change': 'Edit content',
  'replace-text': 'Replace text',
  remove: 'Remove content',
  move: 'Move or reorder content',
  'adjust-layout': 'Adjust layout or styling',
  'insert-slide': 'Insert a slide',
  'app-behavior': 'Change application behavior',
  question: 'Answer or investigate a question',
};

interface IndexedAnnotation {
  annotation: Annotation;
  itemId: string;
  operation: AnnotationOperation;
  description: AnnotationTargetDescription;
}

interface AnnotationGroup {
  key: string;
  items: IndexedAnnotation[];
}

interface SharedSnapshot extends AnnotationSnapshot {
  itemIds: string[];
}

function slideDisplay(annotation: Annotation): string {
  const layout = annotation.aspectRatio === '9:16' ? 'mobile' : 'desktop';
  return `${annotation.slideTitle} · ${annotation.slideId} · captured as slide ${annotation.slideIndex + 1} · ${annotation.slideTemplate} · ${layout}`;
}

function sharedSnapshots(items: IndexedAnnotation[]): SharedSnapshot[] {
  const candidates = new Map<string, SharedSnapshot>();
  for (const item of items) {
    const { snapshot } = item.description;
    if (!snapshot) continue;
    const identity = `${snapshot.key}\u0000${snapshot.value}`;
    const existing = candidates.get(identity);
    if (existing) existing.itemIds.push(item.itemId);
    else candidates.set(identity, { ...snapshot, itemIds: [item.itemId] });
  }
  return [...candidates.values()].filter(snapshot => snapshot.itemIds.length > 1);
}

function isSharedSnapshot(item: IndexedAnnotation, shared: SharedSnapshot[]): boolean {
  const { snapshot } = item.description;
  return Boolean(snapshot && shared.some(entry => entry.key === snapshot.key && entry.value === snapshot.value));
}

function formatSelection(
  label: string,
  selected: string,
  rangeStart?: number,
  rangeEnd?: number,
): string[] {
  const range = rangeStart !== undefined && rangeEnd !== undefined
    ? ` · characters ${rangeStart}..${rangeEnd}`
    : '';
  return [`**${label}${range}:**`, '', fencedText(selected)];
}

function formatReplacement(replacement: string): string[] {
  return ['**Replace with:**', '', fencedText(replacement)];
}

function formatContext(before: string, after: string): string[] {
  if (!before && !after) return [];
  const lines = ['**Anchor context:**', ''];
  if (before) lines.push('- **Before:**', '', fencedText(before));
  if (after) lines.push('- **After:**', '', fencedText(after));
  return lines;
}

function formatLayoutEvidence(annotation: ElementAnnotation, operation: AnnotationOperation): string[] {
  const { elementInfo } = annotation;
  const overflow = elementInfo.overflow;
  const hasOverflow = overflow.isOverflowingY || overflow.isOverflowingX;
  if (operation !== 'adjust-layout' && !hasOverflow) return [];

  const styles = elementInfo.serializedStyles;
  const relevantStyleNames = [
    'display', 'flexDirection', 'justifyContent', 'alignItems', 'gap', 'padding', 'margin',
    'width', 'height', 'minWidth', 'minHeight', 'fontSize', 'lineHeight', 'fontWeight',
  ];
  const relevantStyles = relevantStyleNames
    .filter(name => styles[name])
    .map(name => `${name}: ${styles[name]}`)
    .join('; ');
  const lines = ['#### Layout evidence', ''];
  if (elementInfo.canvasPosition) {
    const position = elementInfo.canvasPosition;
    lines.push(`- **Slide bounds:** x=${position.x}; y=${position.y}; width=${position.width}; height=${position.height}; rendered scale=${position.scale}`);
  }
  if (relevantStyles) lines.push(`- **Computed layout:** ${relevantStyles}`);
  if (elementInfo.parent) {
    const parent = elementInfo.parent;
    lines.push(`- **Parent layout:** <${parent.tagName} class=${JSON.stringify(parent.className)}>; display: ${parent.display}; flex-direction: ${parent.flexDirection}; justify-content: ${parent.justifyContent}; align-items: ${parent.alignItems}; gap: ${parent.gap}; size: ${parent.width} × ${parent.height}`);
  }
  if (overflow.isOverflowingY) lines.push(`- **Overflow Y:** scrollHeight ${overflow.scrollHeight} > clientHeight ${overflow.clientHeight}`);
  if (overflow.isOverflowingX) lines.push(`- **Overflow X:** scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth}`);
  if (elementInfo.diagnostics.length) lines.push(`- **Diagnostics:** ${elementInfo.diagnostics.join(' | ')}`);
  lines.push('');
  return lines;
}

function formatCaptureEvidence(annotation: Annotation, includeRevision: boolean): string[] {
  const lines = ['<details>', '<summary>Capture evidence</summary>', ''];
  if (annotation.capture) {
    lines.push(`- **Captured:** ${inlineCode(new Date(annotation.capture.capturedAt).toISOString())}`);
    if (includeRevision) lines.push(`- **Revision:** ${inlineCode(annotation.capture.revision)}`);
    lines.push(`- **Route:** ${inlineCode(annotation.capture.route)}`);
    lines.push(`- **Viewport:** ${annotation.capture.viewport.width} × ${annotation.capture.viewport.height}`);
  } else {
    lines.push('- **Capture metadata:** unavailable (legacy annotation)');
  }

  const selector = annotation.type === 'element'
    ? annotation.selector
    : annotation.type === 'text' ? annotation.surroundingContext.selector : undefined;
  if (selector) lines.push('', '**Fallback selector:**', '', fencedText(selector, 'css'));

  if (annotation.type === 'element' && !selector && annotation.elementInfo.hierarchy.length) {
    lines.push('', '**Element hierarchy:**', '', fencedText(annotation.elementInfo.hierarchy.join(' > ')));
  }
  if (annotation.type === 'element') {
    const elementDescription = `<${annotation.elementInfo.tagName} class=${JSON.stringify(annotation.elementInfo.className)}>`;
    lines.push('', `- **Element:** ${inlineCode(elementDescription)}`);
  }
  lines.push('', '</details>', '');
  return lines;
}

function formatCurrentEvidence(item: IndexedAnnotation, shared: SharedSnapshot[]): string[] {
  const { annotation, operation, description } = item;
  const lines: string[] = [];

  if (annotation.type === 'slide-order') {
    lines.push(
      '#### Requested relative position',
      '',
      `- **Move:** ${inlineCode(`${annotation.slideTitle} (${annotation.slideId})`)}`,
      `- **Position:** ${annotation.placement}`,
      `- **Anchor:** ${inlineCode(`${annotation.anchorSlideTitle} (${annotation.anchorSlideId})`)}`,
      `- **Captured order:** source slide ${annotation.slideIndex + 1}; anchor slide ${annotation.anchorSlideIndex + 1}`,
      '',
    );
    return lines;
  }

  if (annotation.type === 'element') {
    const rendered = annotation.renderedText;
    const dom = annotation.textContent;
    if (rendered) lines.push('#### Current rendered text', '', fencedText(rendered), '');
    if (dom && dom !== rendered) lines.push('#### DOM text anchor', '', fencedText(dom), '');
    lines.push(...formatLayoutEvidence(annotation, operation));
    return lines;
  }

  if (annotation.type === 'text') {
    const context = annotation.surroundingContext;
    if (context.fullText !== undefined && !isSharedSnapshot(item, shared)) {
      lines.push('#### Current source text', '', fencedText(context.fullText), '');
    }
    const wholeSnapshot = context.fullText === annotation.text;
    if (!wholeSnapshot) {
      lines.push(...formatSelection('Selected text', annotation.text, context.rangeStart, context.rangeEnd), '');
      lines.push(...formatContext(context.before, context.after), '');
    }
    if (annotation.replacementText !== undefined) lines.push(...formatReplacement(annotation.replacementText), '');
    return lines;
  }

  if (annotation.type === 'speaker-note') {
    if (!isSharedSnapshot(item, shared)) {
      lines.push('#### Current speaker note', '', fencedText(annotation.noteSnapshot), '');
    }
    const wholeNote = annotation.target === 'item'
      || (annotation.quotedText === annotation.noteSnapshot && annotation.rangeStart === 0);
    if (wholeNote) {
      lines.push(`**Selection:** entire note${annotation.rangeStart !== undefined && annotation.rangeEnd !== undefined ? ` · characters ${annotation.rangeStart}..${annotation.rangeEnd}` : ''}`, '');
    } else {
      lines.push(...formatSelection('Selected note text', annotation.quotedText, annotation.rangeStart, annotation.rangeEnd), '');
      lines.push(...formatContext(annotation.surroundingContext.before, annotation.surroundingContext.after), '');
    }
    if (annotation.replacementText !== undefined) lines.push(...formatReplacement(annotation.replacementText), '');
    return lines;
  }

  if (!isSharedSnapshot(item, shared)) {
    lines.push(`#### Current ${description.label.toLowerCase()}`, '', fencedText(annotation.promptSnapshot), '');
  }
  lines.push(...formatSelection('Selected prompt text', annotation.quotedText, annotation.rangeStart, annotation.rangeEnd), '');
  lines.push(...formatContext(annotation.surroundingContext.before, annotation.surroundingContext.after), '');
  return lines;
}

/** Labels a free-text field and quotes it, so its lines cannot become packet structure. */
function formatQuotedField(label: string, value: string): string[] {
  return [`**${label}:**`, '', blockquote(value), ''];
}

function formatItem(
  item: IndexedAnnotation,
  shared: SharedSnapshot[],
  includeCaptureRevision: boolean,
): string {
  const { annotation, itemId, operation, description } = item;
  const lines: string[] = [
    `### ${itemId} — ${OPERATION_LABELS[operation]} · ${description.label}`,
    '',
    blockquote(annotation.comment),
    '',
    `- **Target:** ${inlineCode(description.target)}`,
    `- **Slide:** ${inlineCode(slideDisplay(annotation))}`,
    `- **Annotation ID:** ${inlineCode(annotation.id)}`,
    `- **Operation:** ${OPERATION_LABELS[operation]}${annotation.operation ? '' : ' *(inferred)*'}`,
    `- **Source:** ${inlineCode(description.source)}`,
  ];
  if (operation === 'app-behavior') {
    lines.push('- **Scope:** The selected UI content is reproduction context; change the reusable application behavior described above.');
  }
  lines.push('');
  if (annotation.uiContext) lines.push(...formatQuotedField('Reported from', annotation.uiContext));
  if (annotation.dependencies) lines.push(...formatQuotedField('Depends on', annotation.dependencies));
  if (annotation.acceptanceCriteria) lines.push(...formatQuotedField('Done when', annotation.acceptanceCriteria));
  lines.push(...formatCurrentEvidence(item, shared), ...formatCaptureEvidence(annotation, includeCaptureRevision));
  return lines.join('\n').trimEnd();
}

function buildGroups(annotations: Annotation[]): AnnotationGroup[] {
  const groups = new Map<string, AnnotationGroup>();
  annotations.forEach((annotation, index) => {
    const operation = inferAnnotationOperation(annotation);
    const description = describeAnnotationTarget(annotation, operation);
    const item: IndexedAnnotation = {
      annotation,
      itemId: `A${index + 1}`,
      operation,
      description,
    };
    const group = groups.get(description.workGroup);
    if (group) group.items.push(item);
    else groups.set(description.workGroup, { key: description.workGroup, items: [item] });
  });
  return [...groups.values()];
}

function formatSharedSnapshots(shared: SharedSnapshot[]): string[] {
  if (!shared.length) return [];
  const lines = ['### Shared current source', ''];
  for (const snapshot of shared) {
    lines.push(
      `**${snapshot.label} — exact snapshot shared by ${humanList(snapshot.itemIds)}:**`,
      '',
      fencedText(snapshot.value),
      '',
    );
  }
  return lines;
}

function formatGroup(
  group: AnnotationGroup,
  groupNumber: number,
  includeCaptureRevision: boolean,
): string {
  const shared = sharedSnapshots(group.items);
  const slides = [...new Map(group.items.map(item => [
    item.annotation.slideId,
    `${item.annotation.slideTitle} (${item.annotation.slideId})`,
  ])).values()];
  const sources = [...new Set(group.items.map(item => item.description.source))];
  const lines = [
    `## ${groupNumber}. ${inlineCode(group.key)}`,
    '',
    `- **Annotations:** ${humanList(group.items.map(item => item.itemId))}`,
    `- **Slides:** ${humanList(slides)}`,
  ];
  if (sources.length === 1) lines.push(`- **Primary source:** ${inlineCode(sources[0])}`);
  lines.push('', ...formatSharedSnapshots(shared));
  for (const item of group.items) lines.push(formatItem(item, shared, includeCaptureRevision), '');
  return lines.join('\n').trimEnd();
}

export function formatAnnotations(annotations: Annotation[], presentationId: string): string {
  const revisions = [...new Set(annotations.map(annotation => annotation.capture?.revision).filter(Boolean))] as string[];
  const groups = buildGroups(annotations);
  const revisionLabel = revisions.length
    ? humanList(revisions.map(revision => inlineCode(revision)))
    : 'unknown (legacy annotations)';
  const header = [
    `# Annotation review — ${inlineCode(presentationId)}`,
    '',
    `- **Packet format:** v${PACKET_FORMAT_VERSION}`,
    `- **Captured revision${revisions.length === 1 ? '' : 's'}:** ${revisionLabel}`,
    `- **Deck source root:** ${inlineCode(deckSourceRoot(presentationId))}`,
    `- **Contents:** ${annotations.length} annotation${annotations.length === 1 ? '' : 's'} across ${groups.length} work group${groups.length === 1 ? '' : 's'}`,
    '',
    '## Agent coordination',
    '',
    '- Treat stable slide IDs, annotation IDs, semantic source targets, note indexes, prop paths, and Sparkle fields as authoritative. Slide numbers only describe capture-time order.',
    '- Treat every slide-order annotation as a simultaneous relative-order constraint over stable slide IDs. Do not apply moves sequentially by captured slide number; preserve unaffected slide order and report any conflicting or cyclic constraints.',
    '- Work group order follows the review packet. Honor explicit dependency notes before dependent work.',
    '- Exact source is shown in fenced blocks with its original line breaks. Fallback DOM diagnostics are supporting evidence, not the preferred source target.',
    '- For application-behavior items, treat selected UI content as reproduction context rather than content to rewrite.',
    '',
    '## Work plan',
    '',
    ...groups.map((group, index) => {
      const slides = [...new Set(group.items.map(item => item.annotation.slideId))];
      return `${index + 1}. ${inlineCode(group.key)} — ${humanList(group.items.map(item => item.itemId))} — ${humanList(slides.map(slide => inlineCode(slide)))}`;
    }),
    '',
    '---',
    '',
  ];

  const body = groups
    .map((group, index) => formatGroup(group, index + 1, revisions.length !== 1))
    .join('\n\n---\n\n');
  return `${header.join('\n')}\n${body}`;
}
