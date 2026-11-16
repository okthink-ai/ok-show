import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation } from '../types/annotation.types';
import { formatAnnotations } from '../utils/annotationClipboard';
import CopySummaryCard from './CopySummaryCard';

afterEach(cleanup);

const base = {
  presentationId: 'demo',
  slideIndex: 1,
  slideTemplate: 'BulletSlide',
  slideTitle: 'Title',
  aspectRatio: '16:9' as const,
  normalizedPosition: { x: 0.5, y: 0.5 },
  timestamp: 1,
};

const text = (id: string, slideId: string, source: 'canvas' | 'outline' | 'practice', intent?: 'fix'): Annotation => ({
  ...base, id, slideId, comment: `Fix ${id}`, intent, type: 'text', text: 'Quoted', source,
  surroundingContext: { before: '', after: '' },
});

const annotations: Annotation[] = [
  text('a', 'intro', 'canvas', 'fix'),
  text('b', 'intro', 'canvas'),
  text('c', 'agenda', 'outline'),
  text('d', 'agenda', 'practice'),
  {
    ...base, id: 'e', slideId: 'team', comment: 'Move it', type: 'slide-order',
    placement: 'before', anchorSlideId: 'intro', anchorSlideTitle: 'Intro', anchorSlideIndex: 0,
  },
];

const renderCard = (onCopy = vi.fn(() => true), onClose = vi.fn(), list = annotations) => {
  render(<CopySummaryCard annotations={list} presentationId="demo" totalSlides={9} onCopy={onCopy} onClose={onClose} />);
  return { onCopy, onClose };
};

const row = (kind: string) => document.querySelector(`[data-kind="${kind}"]`) as HTMLElement | null;

describe('CopySummaryCard', () => {
  it('is a labelled modal dialog that takes focus', () => {
    renderCard();
    const dialog = screen.getByRole('dialog', { name: 'Copy review packet' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveFocus();
  });

  it('breaks the annotations down by every target type present', () => {
    renderCard();
    expect(screen.getByTestId('copy-summary-total')).toHaveTextContent('5');
    expect(screen.getByTestId('copy-summary-slides')).toHaveTextContent('3 / 9');
    expect(within(row('slide-text')!).getByText('2')).toBeInTheDocument();
    expect(within(row('outline-text')!).getByText('1')).toBeInTheDocument();
    expect(within(row('manuscript')!).getByText('1')).toBeInTheDocument();
    expect(within(row('slide-order')!).getByText('1')).toBeInTheDocument();
    expect(row('element')).toBeNull();
    expect(row('speaker-note')).toBeNull();
    expect(document.querySelector('[data-intent="fix"]')).toHaveTextContent('1');
    expect(document.querySelector('[data-intent="none"]')).toHaveTextContent('4');
  });

  it('previews the exact review packet and copies that text', async () => {
    const { onCopy } = renderCard();
    expect(screen.queryByLabelText('Packet preview')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show preview' }));
    const packet = formatAnnotations(annotations, 'demo');
    expect(screen.getByLabelText('Packet preview').textContent).toBe(packet);

    fireEvent.click(screen.getByRole('button', { name: 'Copy to clipboard' }));
    expect(onCopy).toHaveBeenCalledWith(packet);
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeDisabled();
  });

  it('closes itself shortly after a successful copy', async () => {
    const { onClose } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Copy to clipboard' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 2500 });
  });

  it('stays open and reports a failed copy', async () => {
    const { onClose } = renderCard(vi.fn(() => false));
    fireEvent.click(screen.getByRole('button', { name: 'Copy to clipboard' }));
    expect(await screen.findByText('Copy failed')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Copy to clipboard' })).toBeEnabled();
  });

  it('closes on Escape, Cancel, Close, and a backdrop click', () => {
    const { onClose } = renderCard();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(4);
  });

  it('keeps Tab inside the dialog', () => {
    renderCard();
    const buttons = within(screen.getByRole('dialog')).getAllByRole('button');
    const last = buttons[buttons.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(buttons[0]).toHaveFocus();
    fireEvent.keyDown(buttons[0], { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('returns focus to the opener when it closes', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const view = render(<CopySummaryCard annotations={annotations} presentationId="demo" onCopy={vi.fn()} onClose={vi.fn()} />);
    expect(opener).not.toHaveFocus();
    view.unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('cannot copy an empty list', () => {
    renderCard(vi.fn(() => true), vi.fn(), []);
    expect(screen.getByRole('button', { name: 'Copy to clipboard' })).toBeDisabled();
    expect(screen.getByText('No annotations yet')).toBeInTheDocument();
  });
});
