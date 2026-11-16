import { act, cleanup, fireEvent, renderHook } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InspectorRefs } from './useInspectorOverlay';
import { useInspectorAnnotate } from './useInspectorAnnotate';

function renderInspector(onTextReplacement = vi.fn()) {
  const stateRef: MutableRefObject<InspectorRefs> = {
    current: {
      isInspecting: false,
      overlay: null,
      tooltip: null,
      ancestorDepth: 0,
      mousePosition: { x: 0, y: 0 },
      hoveredElement: null,
    },
  };
  const result = renderHook(() => useInspectorAnnotate({
    stateRef,
    onTextReplacement,
  }));
  return { ...result, onTextReplacement };
}

function createNestedTarget(): HTMLHeadingElement {
  const slide = document.createElement('section');
  slide.className = 'slide slide--active';
  const heading = document.createElement('h1');
  heading.innerHTML = '<span>Loop</span><br><span class="accent">Engineering</span>';
  slide.appendChild(heading);
  document.body.appendChild(slide);
  return heading;
}

function beginEditing(target: HTMLElement): HTMLTextAreaElement {
  fireEvent.doubleClick(target, { clientX: 120, clientY: 80 });
  const editor = document.querySelector<HTMLTextAreaElement>('.slide-text-editor');
  if (!editor) throw new Error('Expected slide text editor');
  return editor;
}

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe('useInspectorAnnotate direct text editing', () => {
  it('leaves nested markup untouched when Escape cancels editing', () => {
    const target = createNestedTarget();
    const originalMarkup = target.innerHTML;
    const { onTextReplacement } = renderInspector();
    const editor = beginEditing(target);

    fireEvent.input(editor, { target: { value: 'Changed text' } });
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(target.innerHTML).toBe(originalMarkup);
    expect(target).not.toHaveAttribute('contenteditable');
    expect(target.querySelector('br')).toBeInTheDocument();
    expect(target.querySelectorAll('span')).toHaveLength(2);
    expect(editor).not.toBeInTheDocument();
    expect(onTextReplacement).not.toHaveBeenCalled();
  });

  it('commits only the edited plain text while preserving the target markup', () => {
    const target = createNestedTarget();
    const originalMarkup = target.innerHTML;
    const onTextReplacement = vi.fn();
    renderInspector(onTextReplacement);
    const editor = beginEditing(target);

    fireEvent.input(editor, { target: { value: 'Loops, engineered' } });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(target.innerHTML).toBe(originalMarkup);
    expect(target).not.toHaveAttribute('contenteditable');
    expect(onTextReplacement).toHaveBeenCalledTimes(1);
    expect(onTextReplacement).toHaveBeenCalledWith(
      'Loop\nEngineering',
      'Loops, engineered',
      expect.objectContaining({ selector: expect.stringContaining('h1') }),
      { x: 120, y: 80 },
    );
  });

  it('removes the editor without changing markup when the hook unmounts', () => {
    const target = createNestedTarget();
    const originalMarkup = target.innerHTML;
    const { unmount, onTextReplacement } = renderInspector();
    const editor = beginEditing(target);

    act(() => unmount());

    expect(editor).not.toBeInTheDocument();
    expect(target.innerHTML).toBe(originalMarkup);
    expect(onTextReplacement).not.toHaveBeenCalled();
  });
});
