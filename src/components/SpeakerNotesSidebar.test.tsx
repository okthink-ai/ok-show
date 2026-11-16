import { useState } from 'react';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import annotationsReducer, {
  addAnnotation,
  clearPending,
  removeAnnotation,
  setPendingDraft as setStorePendingDraft,
  updatePendingReplacementText,
} from '../store/annotationsSlice';
import uiReducer from '../store/uiSlice';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Annotation, PendingAnnotationDraft } from '../types/annotation.types';
import SpeakerNotesSidebar from './SpeakerNotesSidebar';
import type { SlideOrderRequest } from './SpeakerNotesSidebar';

beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

afterEach(() => {
  cleanup();
});

function Harness({
  annotations = [],
  onCreateSpeakerNoteDeletion = () => undefined,
  onCreateSlideOrderAnnotation = () => undefined,
  onCommitPendingDraft = () => undefined,
}: {
  annotations?: Annotation[];
  onCommitPendingDraft?: (comment: string) => void;
  onCreateSpeakerNoteDeletion?: (draft: PendingAnnotationDraft) => void;
  onCreateSlideOrderAnnotation?: (request: SlideOrderRequest) => void;
}) {
  const [testStore] = useState(() => configureStore({ reducer: { annotations: annotationsReducer, ui: uiReducer } }));
  const [open, setOpen] = useState(true);
  const [pendingDraft, setPendingDraft] = useState<PendingAnnotationDraft | null>(null);

  return (
    <Provider store={testStore}>
      <button type="button" onClick={() => setOpen(true)}>Open notes</button>
      <button type="button" onClick={() => setPendingDraft({
        presentationId: 'demo',
        comment: 'Replace this bullet with the edited version.',
        target: {
          type: 'speaker-note',
          value: {
            slideIndex: 0,
            slideId: 'opening-title',
            slideTemplate: 'TitleSlide',
            slideTitle: 'Opening',
            aspectRatio: '16:9',
            normalizedPosition: { x: 0, y: 0 },
            target: 'item',
            noteIndex: 0,
            noteSnapshot: 'An important speaker note.',
            quotedText: 'An important speaker note.',
            surroundingContext: { before: '', after: '' },
            replacementText: 'An unfinished speaker note.',
          },
        },
      })}>Start note edit</button>
      <button type="button" onClick={() => setPendingDraft({
        presentationId: 'demo',
        comment: '',
        target: {
          type: 'speaker-note',
          value: {
            slideIndex: 0,
            slideId: 'opening-title',
            slideTemplate: 'TitleSlide',
            slideTitle: 'Opening',
            aspectRatio: '16:9',
            normalizedPosition: { x: 0, y: 0 },
            target: 'item',
            noteIndex: 0,
            noteSnapshot: 'An important speaker note.',
            quotedText: 'An important speaker note.',
            surroundingContext: { before: '', after: '' },
          },
        },
      })}>Start note annotation</button>
      {open && (
        <SpeakerNotesSidebar
          presentationId="demo"
          slides={[
            { id: 'opening-title', title: 'Opening', template: 'TitleSlide', content: <div>Opening slide</div> },
            { id: 'second-slide', title: 'Second', template: 'ContentSlide', content: <div>Second slide</div> },
          ]}
          notes={{ 'opening-title': ['An important speaker note.'], 'second-slide': ['Another note.'] }}
          sparklePrompts={{
            'opening-title': { style: 'Ink', imagePrompt: 'Draw the opening.', motionPrompt: 'Move the opening.' },
            'second-slide': { style: 'Ink', imagePrompt: 'Draw the second.', motionPrompt: 'Move the second.' },
          }}
          status="connected"
          error=""
          currentSlide={0}
          aspectRatio="16:9"
          annotations={annotations}
          pendingDraft={pendingDraft}
          onSlideChange={() => undefined}
          onSetPendingDraft={setPendingDraft}
          onUpdatePendingComment={(comment) => setPendingDraft((current) => current && { ...current, comment })}
          onUpdatePendingReplacementText={(replacementText) => setPendingDraft((current) => (
            current?.target.type === 'speaker-note'
              ? {
                  ...current,
                  target: {
                    ...current.target,
                    value: { ...current.target.value, replacementText },
                  },
                }
              : current
          ))}
          onCommitPendingDraft={onCommitPendingDraft}
          onCreateSpeakerNoteDeletion={onCreateSpeakerNoteDeletion}
          onCreateSlideOrderAnnotation={onCreateSlideOrderAnnotation}
          onClearPendingDraft={() => setPendingDraft(null)}
          onUpdateComment={() => undefined}
          onRemoveAnnotation={() => undefined}
          onClose={() => setOpen(false)}
        />
      )}
    </Provider>
  );
}

describe('speaker-note pending drafts', () => {
  it('switches to slide previews and creates a stable relative-order request', () => {
    const onCreateSlideOrderAnnotation = vi.fn();
    render(<Harness onCreateSlideOrderAnnotation={onCreateSlideOrderAnnotation} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Slides' }));
    expect(screen.getByRole('heading', { name: 'Slide previews' })).toBeInTheDocument();
    expect(document.querySelectorAll('.slide-review-preview')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Reorder slide 1: Opening' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Position for Opening' }), {
      target: { value: 'after' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add reorder annotation' }));

    expect(onCreateSlideOrderAnnotation).toHaveBeenCalledWith({
      slideIndex: 0,
      anchorSlideId: 'second-slide',
      placement: 'after',
    });

  });

  it('renders a deletion annotation as a struck-through bullet without an annotation card', () => {
    const deletion: Annotation = {
      id: 'delete-note',
      type: 'speaker-note',
      presentationId: 'demo',
      slideId: 'opening-title',
      slideIndex: 0,
      slideTemplate: 'TitleSlide',
      slideTitle: 'Opening',
      aspectRatio: '16:9',
      comment: 'Delete this speaker-note bullet.',
      operation: 'remove',
      normalizedPosition: { x: 0.5, y: 0.5 },
      timestamp: 1,
      target: 'item',
      noteIndex: 0,
      noteSnapshot: 'An important speaker note.',
      quotedText: 'An important speaker note.',
      surroundingContext: { before: '', after: '' },
    };
    render(<Harness annotations={[deletion]} />);

    const note = screen.getByText('An important speaker note.');
    expect(note.closest('li')).toHaveClass('speaker-notes-sidebar__note--deleted');
    expect(screen.queryByText('Whole bullet')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete this speaker-note bullet.')).not.toBeInTheDocument();
  });

  it('creates a whole-bullet remove annotation from the hover action', () => {
    const onCreateSpeakerNoteDeletion = vi.fn();
    render(<Harness onCreateSpeakerNoteDeletion={onCreateSpeakerNoteDeletion} />);

    fireEvent.click(screen.getByRole('button', { name: 'Annotate speaker note 1 on slide 1 for deletion' }));

    expect(onCreateSpeakerNoteDeletion).toHaveBeenCalledWith(expect.objectContaining({
      comment: 'Delete this speaker-note bullet.',
      target: {
        type: 'speaker-note',
        value: expect.objectContaining({
          target: 'item',
          noteIndex: 0,
          operation: 'remove',
          quotedText: 'An important speaker note.',
        }),
      },
    }));
  });

  it('restores an unfinished whole-note comment after the sidebar unmounts', async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Start note annotation' }));
    fireEvent.change(await screen.findByPlaceholderText('What should change?'), {
      target: { value: 'Keep this detailed review feedback.' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close speaker notes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open notes' }));

    expect(await screen.findByPlaceholderText('What should change?'))
      .toHaveValue('Keep this detailed review feedback.');
  });

  it('restores an unfinished replacement after the sidebar unmounts', async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Start note edit' }));
    const editor = await screen.findByRole('textbox', { name: 'Edit speaker note 1 on slide 1' });
    fireEvent.change(editor, { target: { value: 'A carefully revised speaker note.' } });

    fireEvent.click(screen.getByRole('button', { name: 'Close speaker notes' }));
    expect(screen.queryByRole('textbox', { name: 'Edit speaker note 1 on slide 1' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open notes' }));
    expect(await screen.findByRole('textbox', { name: 'Edit speaker note 1 on slide 1' }))
      .toHaveValue('A carefully revised speaker note.');
  });

  it('cancels an inline note edit on Escape without saving it', async () => {
    const onCommitPendingDraft = vi.fn();
    render(<Harness onCommitPendingDraft={onCommitPendingDraft} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start note edit' }));
    const editor = await screen.findByRole('textbox', { name: 'Edit speaker note 1 on slide 1' });
    fireEvent.change(editor, { target: { value: 'A half-finished rewrite.' } });
    fireEvent.keyDown(editor, { key: 'Escape' });
    fireEvent.blur(editor);

    expect(screen.queryByRole('textbox', { name: 'Edit speaker note 1 on slide 1' })).not.toBeInTheDocument();
    expect(screen.getByText('An important speaker note.')).toBeInTheDocument();
    expect(onCommitPendingDraft).not.toHaveBeenCalled();
  });
});

const NOTE = 'An important speaker note.';

function createStore() {
  return configureStore({ reducer: { annotations: annotationsReducer, ui: uiReducer } });
}

type TestStore = ReturnType<typeof createStore>;
type TestState = ReturnType<TestStore['getState']>;

function StoreBackedSidebar() {
  const dispatch = useDispatch<TestStore['dispatch']>();
  const annotations = useSelector((state: TestState) => state.annotations.annotations);
  const pendingDraft = useSelector((state: TestState) => state.annotations.pendingDraft);
  const commit = (comment: string) => {
    if (pendingDraft?.target.type !== 'speaker-note') return;
    const { value } = pendingDraft.target;
    dispatch(addAnnotation({
      ...value,
      id: `annotation-${annotations.length + 1}`,
      type: 'speaker-note',
      presentationId: pendingDraft.presentationId,
      comment,
      timestamp: Date.now(),
    }));
    dispatch(clearPending());
  };

  return (
    <SpeakerNotesSidebar
      presentationId="demo"
      slides={[{ id: 'opening-title', title: 'Opening', template: 'TitleSlide', content: <div>Opening slide</div> }]}
      notes={{ 'opening-title': [NOTE] }}
      sparklePrompts={{}}
      status="connected"
      error=""
      currentSlide={0}
      aspectRatio="16:9"
      annotations={annotations}
      pendingDraft={pendingDraft}
      onSlideChange={() => undefined}
      onSetPendingDraft={(draft) => dispatch(setStorePendingDraft(draft))}
      onUpdatePendingComment={() => undefined}
      onUpdatePendingReplacementText={(text) => dispatch(updatePendingReplacementText(text))}
      onCommitPendingDraft={commit}
      onCreateSpeakerNoteDeletion={() => undefined}
      onCreateSlideOrderAnnotation={() => undefined}
      onClearPendingDraft={() => dispatch(clearPending())}
      onUpdateComment={() => undefined}
      onRemoveAnnotation={(id) => dispatch(removeAnnotation(id))}
      onClose={() => undefined}
    />
  );
}

describe('speaker-note replacements', () => {
  function setup() {
    const testStore = createStore();
    // Start from a clean slate regardless of persisted browser state.
    testStore.dispatch(clearPending());
    for (const annotation of testStore.getState().annotations.annotations) {
      testStore.dispatch(removeAnnotation(annotation.id));
    }
    render(<Provider store={testStore}><StoreBackedSidebar /></Provider>);
    const replacements = () => testStore.getState().annotations.annotations.map((annotation) => (
      annotation.type === 'speaker-note' ? annotation.replacementText : undefined
    ));
    return { testStore, replacements };
  }

  function editBullet(shownText: string, nextText?: string) {
    fireEvent.doubleClick(screen.getByText(shownText));
    const editor = screen.getByRole('textbox', { name: 'Edit speaker note 1 on slide 1' });
    expect(editor).toHaveValue(shownText);
    if (nextText !== undefined) fireEvent.change(editor, { target: { value: nextText } });
    fireEvent.blur(editor);
  }

  it('updates one replacement annotation across repeated edits', () => {
    const { testStore, replacements } = setup();

    editBullet(NOTE, 'A');
    expect(replacements()).toEqual(['A']);

    // Reopening and leaving without a change keeps exactly one annotation.
    editBullet('A');
    expect(replacements()).toEqual(['A']);

    editBullet('A', 'B');
    expect(replacements()).toEqual(['B']);
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(testStore.getState().annotations.pendingDraft).toBeNull();
  });

  it('removes the replacement when the edit restores the original bullet', () => {
    const { replacements } = setup();

    editBullet(NOTE, 'A');
    editBullet('A', NOTE);

    expect(replacements()).toEqual([]);
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });

  it('cancels a re-edit on Escape and keeps the saved replacement', () => {
    const { replacements } = setup();

    editBullet(NOTE, 'A');
    fireEvent.doubleClick(screen.getByText('A'));
    const editor = screen.getByRole('textbox', { name: 'Edit speaker note 1 on slide 1' });
    fireEvent.change(editor, { target: { value: 'Abandoned' } });
    fireEvent.keyDown(editor, { key: 'Escape' });

    expect(replacements()).toEqual(['A']);
    expect(screen.getByText('A')).toBeInTheDocument();
  });
});
