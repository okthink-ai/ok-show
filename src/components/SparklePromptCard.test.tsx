import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SparklePromptCard from './SparklePromptCard';

afterEach(cleanup);

const slide = {
  id: 'vocabulary-pile-up',
  title: 'Too Many New Things',
  template: 'VocabularySlide',
  content: null,
};

const prompt = {
  style: 'Constructive Axonometric Ink Sketch',
  imagePrompt: 'Draw a confused developer surrounded by engineering terms.',
  motionPrompt: 'Let the developer look between the labels.',
};

describe('SparklePromptCard', () => {
  it('keeps the style, image prompt, and motion prompt together', () => {
    const { container } = render(
      <SparklePromptCard
        presentationId="demo"
        slide={slide}
        slideIndex={2}
        aspectRatio="16:9"
        prompt={prompt}
      />,
    );

    fireEvent.click(screen.getByText('Sparkle'));
    expect(screen.getByText(prompt.style)).toBeInTheDocument();
    expect(screen.getByText(prompt.imagePrompt)).toBeInTheDocument();
    expect(screen.getByText(prompt.motionPrompt)).toBeInTheDocument();
    expect(screen.queryByText('Style · image · motion')).not.toBeInTheDocument();
    expect(container.querySelector('.sparkle-prompt-card')).toHaveClass('sparkle-prompt-card--available');
  });

  it('grays out the card when the slide has no Sparkle image prompt', () => {
    const { container } = render(
      <SparklePromptCard
        presentationId="demo"
        slide={{ ...slide, id: 'about-me' }}
        slideIndex={1}
        aspectRatio="16:9"
        prompt={{
          style: 'Not selected — this slide currently uses HTML/CSS artwork.',
          imagePrompt: 'No image prompt has been authored for this slide.',
          motionPrompt: 'No motion prompt has been authored for this slide.',
        }}
      />,
    );

    expect(container.querySelector('.sparkle-prompt-card')).toHaveClass('sparkle-prompt-card--unavailable');
  });

  it('creates a stable draft from selected image-prompt text', () => {
    const onSetPendingDraft = vi.fn();
    render(
      <SparklePromptCard
        presentationId="demo"
        slide={slide}
        slideIndex={2}
        aspectRatio="16:9"
        prompt={prompt}
        onSetPendingDraft={onSetPendingDraft}
      />,
    );

    fireEvent.click(screen.getByText('Sparkle'));
    const imagePrompt = screen.getByText(prompt.imagePrompt);
    const textNode = imagePrompt.firstChild;
    if (!textNode) throw new Error('Expected an image prompt text node');
    const start = prompt.imagePrompt.indexOf('confused developer');
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, start + 'confused developer'.length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    fireEvent.mouseUp(imagePrompt);

    expect(onSetPendingDraft).toHaveBeenCalledWith(expect.objectContaining({
      presentationId: 'demo',
      target: {
        type: 'sparkle-prompt',
        value: expect.objectContaining({
          slideId: 'vocabulary-pile-up',
          field: 'imagePrompt',
          promptSnapshot: prompt.imagePrompt,
          quotedText: 'confused developer',
          rangeStart: start,
          rangeEnd: start + 'confused developer'.length,
        }),
      },
    }));
  });
});
