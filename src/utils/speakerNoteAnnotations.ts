import type { SpeakerNoteAnnotation } from '../types/annotation.types';

export interface ResolvedSpeakerNoteAnchor {
  resolved: boolean;
  noteIndex: number;
  start: number;
  end: number;
}

export interface TextReplacement {
  start: number;
  end: number;
  replacementText: string;
}

export function findSmallestTextReplacement(original: string, edited: string): TextReplacement | null {
  if (original === edited) return null;
  let start = 0;
  while (start < original.length && start < edited.length && original[start] === edited[start]) start += 1;
  let originalEnd = original.length;
  let editedEnd = edited.length;
  while (originalEnd > start && editedEnd > start && original[originalEnd - 1] === edited[editedEnd - 1]) {
    originalEnd -= 1;
    editedEnd -= 1;
  }
  return { start, end: originalEnd, replacementText: edited.slice(start, editedEnd) };
}

function contextScore(note: string, start: number, end: number, annotation: SpeakerNoteAnnotation): number {
  const before = annotation.surroundingContext.before;
  const after = annotation.surroundingContext.after;
  let score = 0;
  if (before && note.slice(Math.max(0, start - before.length), start) === before) score += 2;
  if (after && note.slice(end, end + after.length) === after) score += 2;
  if (start === annotation.rangeStart) score += 1;
  return score;
}

function rangeCandidates(note: string, annotation: SpeakerNoteAnnotation): Array<{ start: number; end: number; score: number }> {
  if (!annotation.quotedText) return [];
  const candidates: Array<{ start: number; end: number; score: number }> = [];
  let cursor = 0;
  while (cursor <= note.length) {
    const start = note.indexOf(annotation.quotedText, cursor);
    if (start === -1) break;
    const end = start + annotation.quotedText.length;
    candidates.push({ start, end, score: contextScore(note, start, end, annotation) });
    cursor = start + Math.max(1, annotation.quotedText.length);
  }
  return candidates;
}

export function resolveSpeakerNoteAnchor(
  annotation: SpeakerNoteAnnotation,
  notes: string[],
): ResolvedSpeakerNoteAnchor {
  const preferred = Number.isInteger(annotation.noteIndex) ? annotation.noteIndex : -1;
  const order = [preferred, ...notes.map((_, index) => index).filter((index) => index !== preferred)]
    .filter((index) => index >= 0 && index < notes.length);

  if (annotation.target === 'item') {
    const noteIndex = order.find((index) => notes[index] === annotation.noteSnapshot);
    return noteIndex === undefined
      ? { resolved: false, noteIndex: preferred, start: 0, end: 0 }
      : { resolved: true, noteIndex, start: 0, end: notes[noteIndex]?.length ?? 0 };
  }

  let best: ResolvedSpeakerNoteAnchor & { score: number; order: number } | null = null;
  for (const [orderIndex, noteIndex] of order.entries()) {
    for (const candidate of rangeCandidates(notes[noteIndex] ?? '', annotation)) {
      const next = { resolved: true, noteIndex, start: candidate.start, end: candidate.end, score: candidate.score, order: orderIndex };
      if (!best || next.score > best.score || (next.score === best.score && next.order < best.order)) best = next;
    }
  }

  return best
    ? { resolved: true, noteIndex: best.noteIndex, start: best.start, end: best.end }
    : { resolved: false, noteIndex: preferred, start: annotation.rangeStart ?? 0, end: annotation.rangeEnd ?? 0 };
}
