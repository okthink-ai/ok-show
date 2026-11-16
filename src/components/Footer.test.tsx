import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PublicFooter from './PublicFooter';

afterEach(cleanup);

describe('public presentation footer', () => {
  it('shows consumption controls without exposing developer tools', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <PublicFooter
        currentSlide={0}
        totalSlides={26}
        isMobile={false}
        isFullscreen={false}
        onToggleFullscreen={vi.fn()}
      />,
    );

    expect(screen.getByText('1 / 26')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export to PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle fullscreen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Toggle developer tools' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Toggle mobile preview' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export to PDF' }));
    expect(open).toHaveBeenCalledWith('/export', '_blank');
  });
});
