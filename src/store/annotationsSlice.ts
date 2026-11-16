import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type {
  Annotation,
  AnnotationOperation,
  PendingAnnotationDraft,
} from '../types/annotation.types';
import { getPresentationById } from '../project/presentations';
import {
  decodeAnnotationsFromStorage,
  decodePendingDraftFromStorage,
} from './annotationCodec';

export type { PendingAnnotationDraft } from '../types/annotation.types';

export const ANNOTATIONS_KEY = 'ok-vibe-slides-annotations';
export const MODE_KEY = 'ok-vibe-slides-annotations-mode';
export const PENDING_ANNOTATION_KEY = 'ok-vibe-slides-pending-annotation';

function loadAnnotations(): Annotation[] {
  try {
    const raw = localStorage.getItem(ANNOTATIONS_KEY);
    if (raw) return decodeAnnotationsFromStorage(JSON.parse(raw));
  } catch { /* fall through */ }
  return [];
}

function loadMode(): boolean {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    if (raw !== null) return raw === 'true';
  } catch { /* fall through */ }
  return true;
}

function getPendingSlideIdentity(draft: PendingAnnotationDraft): { slideId: string; slideIndex: number } {
  if (draft.target.type === 'element' || draft.target.type === 'canvas-text') {
    return draft.target.value.slideContext;
  }
  return draft.target.value;
}

function isOwnedPendingDraft(draft: PendingAnnotationDraft): boolean {
  const { slideId, slideIndex } = getPendingSlideIdentity(draft);
  const presentation = getPresentationById(draft.presentationId);
  return presentation?.slides[slideIndex]?.id === slideId;
}

function loadPending(): PendingAnnotationDraft | null {
  try {
    const raw = localStorage.getItem(PENDING_ANNOTATION_KEY);
    if (raw) {
      const draft = decodePendingDraftFromStorage(JSON.parse(raw));
      if (draft && isOwnedPendingDraft(draft)) return draft;
      localStorage.removeItem(PENDING_ANNOTATION_KEY);
    }
  } catch { /* fall through */ }
  return null;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

interface AnnotationsState {
  annotations: Annotation[];
  isMultiSelectMode: boolean;
  pendingDraft: PendingAnnotationDraft | null;
}

const initialState: AnnotationsState = {
  annotations: loadAnnotations(),
  isMultiSelectMode: loadMode(),
  pendingDraft: loadPending(),
};

const annotationsSlice = createSlice({
  name: 'annotations',
  initialState,
  reducers: {
    /** Replaces the list with one written by another tab. */
    replaceAnnotations(state, action: PayloadAction<Annotation[]>) {
      state.annotations = action.payload;
    },
    addAnnotation(state, action: PayloadAction<Annotation>) {
      state.annotations.push(action.payload);
    },
    removeAnnotation(state, action: PayloadAction<string>) {
      const idx = state.annotations.findIndex(a => a.id === action.payload);
      if (idx === -1) return;
      state.annotations.splice(idx, 1);
    },
    updateComment(state, action: PayloadAction<{ id: string; comment: string }>) {
      const a = state.annotations.find(a => a.id === action.payload.id);
      if (!a || a.comment === action.payload.comment) return;
      a.comment = action.payload.comment;
      delete a.copiedAt;
    },
    markAnnotationsCopied(state, action: PayloadAction<{ annotations: Annotation[]; copiedAt: number }>) {
      for (const snapshot of action.payload.annotations) {
        const current = state.annotations.find(item => item.id === snapshot.id && item.presentationId === snapshot.presentationId);
        // A clipboard promise may finish after the user edits or removes a note.
        if (current && JSON.stringify({ ...current, copiedAt: undefined }) === JSON.stringify({ ...snapshot, copiedAt: undefined })) {
          current.copiedAt = action.payload.copiedAt;
        }
      }
    },
    clearCopiedAnnotations(state, action: PayloadAction<string>) {
      state.annotations = state.annotations.filter(item => item.presentationId !== action.payload || item.copiedAt === undefined);
    },
    updateReplacementText(state, action: PayloadAction<{ id: string; replacementText: string }>) {
      const annotation = state.annotations.find(item => item.id === action.payload.id);
      if (!annotation || annotation.type !== 'speaker-note') return;
      if (annotation.replacementText === action.payload.replacementText) return;
      annotation.replacementText = action.payload.replacementText;
      delete annotation.copiedAt;
    },
    updateRequestMetadata(state, action: PayloadAction<{
      id: string;
      metadata: {
        operation?: AnnotationOperation;
        workGroup?: string;
        dependencies?: string;
        acceptanceCriteria?: string;
      };
    }>) {
      const annotation = state.annotations.find(item => item.id === action.payload.id);
      if (!annotation) return;
      const { metadata } = action.payload;
      const before = JSON.stringify(annotation);
      if ('operation' in metadata) annotation.operation = metadata.operation;
      if ('workGroup' in metadata) annotation.workGroup = metadata.workGroup?.trim() || undefined;
      if ('dependencies' in metadata) annotation.dependencies = metadata.dependencies?.trim() || undefined;
      if ('acceptanceCriteria' in metadata) annotation.acceptanceCriteria = metadata.acceptanceCriteria?.trim() || undefined;
      if (JSON.stringify(annotation) !== before) delete annotation.copiedAt;
    },
    clearAll(state, action: PayloadAction<string>) {
      state.annotations = state.annotations.filter(
        annotation => annotation.presentationId !== action.payload,
      );
    },
    toggleMultiSelect(state) {
      state.isMultiSelectMode = !state.isMultiSelectMode;
    },
    setPendingDraft(state, action: PayloadAction<PendingAnnotationDraft>) {
      state.pendingDraft = action.payload;
    },
    updatePendingComment(state, action: PayloadAction<string>) {
      if (state.pendingDraft) state.pendingDraft.comment = action.payload;
    },
    updatePendingReplacementText(state, action: PayloadAction<string>) {
      if (state.pendingDraft?.target.type === 'speaker-note') {
        state.pendingDraft.target.value.replacementText = action.payload;
      }
    },
    clearPending(state) {
      state.pendingDraft = null;
    },
  },
});

export const {
  replaceAnnotations,
  addAnnotation,
  removeAnnotation,
  updateComment,
  updateReplacementText,
  markAnnotationsCopied,
  clearCopiedAnnotations,
  updateRequestMetadata,
  clearAll,
  toggleMultiSelect,
  setPendingDraft,
  updatePendingComment,
  updatePendingReplacementText,
  clearPending,
} = annotationsSlice.actions;

export default annotationsSlice.reducer;
