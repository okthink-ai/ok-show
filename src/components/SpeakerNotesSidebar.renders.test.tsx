import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import annotationsReducer, { setPendingDraft } from '../store/annotationsSlice';
import uiReducer from '../store/uiSlice';
import type { SlideData } from '../types/slide.types';
import SpeakerNotesSidebar from './SpeakerNotesSidebar';

// Stand-in for the memoized list: it re-renders only when a prop changes
// identity, so the count shows whether the sidebar passes stable props.
const previewRenders = vi.fn();
vi.mock('./SlideReorderList', async () => {
  const { memo } = await import('react');
  return { default: memo(() => { previewRenders(); return null; }) };
});

beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = () => undefined;
});
afterEach(cleanup);

const slides: SlideData[] = [
  { id: 'a', template: 'TitleSlide', title: 'A', content: null },
  { id: 'b', template: 'TitleSlide', title: 'B', content: null },
] as unknown as SlideData[];

describe('SpeakerNotesSidebar render stability', () => {
  it('does not re-render slide previews when the pending comment changes', () => {
    const store = configureStore({ reducer: { annotations: annotationsReducer, ui: uiReducer } });
    const noop = vi.fn();
    const props = {
      presentationId: 'demo', slides, notes: {}, sparklePrompts: {}, status: 'connected' as const, error: '',
      currentSlide: 0, aspectRatio: '16:9' as const, annotations: [],
      onSlideChange: noop, onSetPendingDraft: noop, onUpdatePendingComment: noop,
      onUpdatePendingReplacementText: noop, onCommitPendingDraft: noop, onCreateSpeakerNoteDeletion: noop,
      onCreateSlideOrderAnnotation: noop, onClearPendingDraft: noop, onUpdateComment: noop,
      onRemoveAnnotation: noop, onClose: noop,
    };
    const draft = (comment: string) => ({
      presentationId: 'demo', comment,
      target: { type: 'outline', value: { slideIndex: 0 } },
    }) as never;
    const ui = (pendingDraft: ReturnType<typeof draft> | null) => (
      <Provider store={store}><SpeakerNotesSidebar {...props} pendingDraft={pendingDraft} /></Provider>
    );
    const { rerender } = render(ui(null));
    fireEvent.click(screen.getByRole('tab', { name: 'Slides' }));
    const initial = previewRenders.mock.calls.length;
    expect(initial).toBeGreaterThanOrEqual(1);
    act(() => { store.dispatch(setPendingDraft(draft('h'))); });
    rerender(ui(draft('h')));
    rerender(ui(draft('hi')));
    expect(previewRenders.mock.calls.length).toBe(initial);
  });
});
