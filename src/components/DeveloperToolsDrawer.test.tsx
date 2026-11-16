import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { store } from '../store/store';
import { SIDEBAR_TYPES } from '../store/uiSlice';
import type { SidebarType } from '../store/uiSlice';
import DeveloperToolsDrawer from './DeveloperToolsDrawer';
import type { DeveloperToolRegistry } from './DeveloperToolsDrawer';

const registry = {
  speakerNotes: panel('speakerNotes', 'Speaker notes'),
  practice: panel('practice', 'Practice'),
  presentations: panel('presentations', 'Presentations'),
  outline: panel('outline', 'Outline'),
  palette: panel('palette', 'Palette'),
  favicon: panel('favicon', 'Favicon preview'),
  slideInfo: panel('slideInfo', 'Slide info'),
  annotations: panel('annotations', 'Annotations'),
  styleTweaks: panel('styleTweaks', 'Style tweaks'),
} satisfies DeveloperToolRegistry;

function panel<Section extends SidebarType>(id: Section, label: string) {
  return {
    id,
    icon: 'test-icon',
    label,
    content: <p>{id} content</p>,
  };
}

function RegistryHarness() {
  const [activeSection, setActiveSection] = useState<SidebarType>('speakerNotes');
  return (
    <Provider store={store}>
      <DeveloperToolsDrawer
        activeSection={activeSection}
        registry={registry}
        isMobile={false}
        onSelectSection={setActiveSection}
      />
    </Provider>
  );
}

function dispatchPointer(target: Element | Node | Window | Document, type: string, pointerId: number, clientX = 0) {
  const event = new MouseEvent(type, { bubbles: true, clientX });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  fireEvent(target, event);
}

afterEach(() => {
  cleanup();
  document.body.classList.remove('is-resizing-developer-tools');
});

describe('developer-tool registry', () => {
  it('uses each registry entry for both its rail button and panel content', () => {
    render(<RegistryHarness />);

    for (const section of SIDEBAR_TYPES) {
      fireEvent.click(screen.getByRole('button', { name: registry[section].label }));
      expect(screen.getByText(`${section} content`)).toBeInTheDocument();
      expect(screen.getByText(`${section} content`).parentElement).toHaveAttribute('data-active-section', section);
    }
  });
});

describe('developer-tool drawer resize cleanup', () => {
  it('ends resize mode on pointer cancellation, blur, lost capture, and unmount', () => {
    const { unmount } = render(<RegistryHarness />);
    const handle = screen.getByRole('separator', { name: 'Resize developer tools' });
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.defineProperties(handle, {
      setPointerCapture: { value: setPointerCapture },
      hasPointerCapture: { value: () => true },
      releasePointerCapture: { value: releasePointerCapture },
    });

    dispatchPointer(handle, 'pointerdown', 11, 100);
    expect(document.body).toHaveClass('is-resizing-developer-tools');
    dispatchPointer(window, 'pointercancel', 11);
    expect(document.body).not.toHaveClass('is-resizing-developer-tools');

    dispatchPointer(handle, 'pointerdown', 12, 100);
    fireEvent(window, new Event('blur'));
    expect(document.body).not.toHaveClass('is-resizing-developer-tools');

    dispatchPointer(handle, 'pointerdown', 13, 100);
    dispatchPointer(handle, 'lostpointercapture', 13);
    expect(document.body).not.toHaveClass('is-resizing-developer-tools');

    dispatchPointer(handle, 'pointerdown', 14, 100);
    expect(document.body).toHaveClass('is-resizing-developer-tools');
    unmount();
    expect(document.body).not.toHaveClass('is-resizing-developer-tools');
    expect(setPointerCapture).toHaveBeenCalledTimes(4);
    expect(releasePointerCapture).toHaveBeenCalledTimes(4);
  });

  it('stops applying pointer movement after resize cleanup', () => {
    render(<RegistryHarness />);
    const handle = screen.getByRole('separator', { name: 'Resize developer tools' });
    Object.defineProperties(handle, {
      setPointerCapture: { value: vi.fn() },
      hasPointerCapture: { value: () => false },
    });

    dispatchPointer(handle, 'pointerdown', 21, 100);
    dispatchPointer(window, 'pointermove', 21, 160);
    expect(handle).toHaveAttribute('aria-valuenow', '520');

    dispatchPointer(window, 'pointerup', 21);
    dispatchPointer(window, 'pointermove', 21, 220);
    expect(handle).toHaveAttribute('aria-valuenow', '520');
  });
});
