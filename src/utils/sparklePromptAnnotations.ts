import type { SparklePromptAnnotation } from '../types/annotation.types';

export interface ResolvedSparklePromptAnchor {
  resolved: boolean;
  start: number;
  end: number;
}

function contextScore(prompt: string, start: number, end: number, annotation: SparklePromptAnnotation): number {
  let score = 0;
  const { before, after } = annotation.surroundingContext;
  if (before && prompt.slice(Math.max(0, start - before.length), start) === before) score += 2;
  if (after && prompt.slice(end, end + after.length) === after) score += 2;
  if (start === annotation.rangeStart) score += 1;
  return score;
}

export function resolveSparklePromptAnchor(
  annotation: SparklePromptAnnotation,
  prompt: string,
): ResolvedSparklePromptAnchor {
  if (prompt === annotation.promptSnapshot
    && prompt.slice(annotation.rangeStart, annotation.rangeEnd) === annotation.quotedText) {
    return { resolved: true, start: annotation.rangeStart, end: annotation.rangeEnd };
  }

  let best: { start: number; end: number; score: number } | null = null;
  let cursor = 0;
  while (annotation.quotedText && cursor <= prompt.length) {
    const start = prompt.indexOf(annotation.quotedText, cursor);
    if (start === -1) break;
    const end = start + annotation.quotedText.length;
    const candidate = { start, end, score: contextScore(prompt, start, end, annotation) };
    if (!best || candidate.score > best.score) best = candidate;
    cursor = start + Math.max(1, annotation.quotedText.length);
  }

  return best
    ? { resolved: true, start: best.start, end: best.end }
    : { resolved: false, start: annotation.rangeStart, end: annotation.rangeEnd };
}
