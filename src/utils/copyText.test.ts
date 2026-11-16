import { afterEach, expect, it, vi } from 'vitest';
import { copyText } from './copyText';

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

it('uses the Clipboard API without changing focus or adding fields', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  expect(await copyText('Annotation text')).toBe(true);
  expect(writeText).toHaveBeenCalledWith('Annotation text');
  expect(document.querySelector('textarea')).toBeNull();
});

it('copies inside the modal when the Clipboard API is unavailable, then restores focus', async () => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  const dialog = document.createElement('dialog');
  const button = document.createElement('button');
  dialog.append(button);
  document.body.append(dialog);
  dialog.setAttribute('open', '');
  button.focus();
  const command = vi.fn(() => {
    const field = document.activeElement as HTMLTextAreaElement;
    expect(field.parentElement).toBe(dialog);
    expect(field.value).toBe('Annotation text');
    expect(field.readOnly).toBe(true);
    expect(field.style.opacity).toBe('0');
    return true;
  });
  Object.defineProperty(document, 'execCommand', { configurable: true, value: command });
  expect(await copyText('Annotation text', dialog)).toBe(true);
  expect(command).toHaveBeenCalledWith('copy');
  expect(document.activeElement).toBe(button);
  expect(dialog.querySelector('textarea')).toBeNull();
});

it('reports failure honestly and removes the temporary field if both copy paths fail', async () => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
  Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => false) });
  expect(await copyText('Annotation text')).toBe(false);
  expect(document.querySelector('textarea')).toBeNull();
});
