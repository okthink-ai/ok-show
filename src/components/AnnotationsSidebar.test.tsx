import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TextAnnotation } from '../types/annotation.types';
import AnnotationsSidebar from './AnnotationsSidebar';

afterEach(cleanup);

const annotation: TextAnnotation = {
  id: 'annotation-1',
  presentationId: 'demo',
  slideId: 'about-me',
  slideIndex: 1,
  slideTemplate: 'AboutMeSlide',
  slideTitle: 'About Me',
  aspectRatio: '16:9',
  comment: 'Add a qualifications slide.',
  normalizedPosition: { x: 0.5, y: 0.5 },
  timestamp: 1,
  type: 'text',
  text: 'Qualifications',
  surroundingContext: { before: '', after: '' },
  source: 'canvas',
};

describe('AnnotationsSidebar agent context', () => {
  it('navigates by the slide stable ID after the deck has been reordered', () => {
    const onNavigateToSlide = vi.fn();
    render(
      <AnnotationsSidebar
        annotations={[annotation]}
        presentationId="demo"
        onRemove={vi.fn()}
        onUpdateComment={vi.fn()}
        onUpdateMetadata={vi.fn()}
        onClearAll={vi.fn()}
        onCopyAll={vi.fn()}
        onClose={vi.fn()}
        onNavigateToSlide={onNavigateToSlide}
        resolveSlideIndex={() => 8}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Slide 9 / AboutMeSlide' }));
    expect(onNavigateToSlide).toHaveBeenCalledWith(8);
  });

  it('lets reviewers add operation, grouping, dependency, and acceptance metadata', () => {
    const onUpdateMetadata = vi.fn();
    render(
      <AnnotationsSidebar
        annotations={[annotation]}
        presentationId="demo"
        onRemove={vi.fn()}
        onUpdateComment={vi.fn()}
        onUpdateMetadata={onUpdateMetadata}
        onClearAll={vi.fn()}
        onCopyAll={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Agent context'));
    fireEvent.change(screen.getByLabelText('Operation'), { target: { value: 'insert-slide' } });
    fireEvent.change(screen.getByLabelText('Work group'), { target: { value: 'about-me-slide' } });
    fireEvent.blur(screen.getByLabelText('Work group'));
    fireEvent.change(screen.getByLabelText('Depends on'), { target: { value: 'Research qualifications first.' } });
    fireEvent.blur(screen.getByLabelText('Depends on'));
    fireEvent.change(screen.getByLabelText('Done when'), { target: { value: 'Desktop and mobile both fit.' } });
    fireEvent.blur(screen.getByLabelText('Done when'));

    expect(onUpdateMetadata).toHaveBeenCalledWith('annotation-1', { operation: 'insert-slide' });
    expect(onUpdateMetadata).toHaveBeenCalledWith('annotation-1', { workGroup: 'about-me-slide' });
    expect(onUpdateMetadata).toHaveBeenCalledWith('annotation-1', { dependencies: 'Research qualifications first.' });
    expect(onUpdateMetadata).toHaveBeenCalledWith('annotation-1', { acceptanceCriteria: 'Desktop and mobile both fit.' });
  });
});

describe('AnnotationsSidebar Copy All', () => {
  it('asks for confirmation, then copies the previewed packet and reports it', async () => {
    const onCopyAll = vi.fn(() => true);
    render(
      <AnnotationsSidebar
        annotations={[annotation]}
        presentationId="demo"
        onRemove={vi.fn()}
        onUpdateComment={vi.fn()}
        onUpdateMetadata={vi.fn()}
        onClearAll={vi.fn()}
        onCopyAll={onCopyAll}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy All (1)' }));
    expect(onCopyAll).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy to clipboard' }));
    expect(onCopyAll).toHaveBeenCalledTimes(1);
    expect(onCopyAll).toHaveBeenCalledWith(expect.stringContaining('# Annotation review'));
    // The card confirms, and the sidebar button keeps its own copied status.
    expect(await screen.findAllByRole('button', { name: 'Copied' })).toHaveLength(2);
  });

  it('leaves nothing copied when the dialog is cancelled', () => {
    const onCopyAll = vi.fn();
    render(
      <AnnotationsSidebar
        annotations={[annotation]}
        presentationId="demo"
        onRemove={vi.fn()}
        onUpdateComment={vi.fn()}
        onUpdateMetadata={vi.fn()}
        onClearAll={vi.fn()}
        onCopyAll={onCopyAll}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy All (1)' }));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onCopyAll).not.toHaveBeenCalled();
  });
});
