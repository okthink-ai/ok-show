/** Copy from a user gesture, including HTTP presenter pages without Clipboard API. */
export async function copyText(text: string, container: HTMLElement = document.body): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { /* Try the gesture-based copy command when permission is denied. */ }
  }
  const previousFocus = document.activeElement;
  const field = document.createElement('textarea');
  field.value = text;
  field.readOnly = true; // Do not summon the phone keyboard.
  field.tabIndex = -1;
  field.setAttribute('aria-hidden', 'true');
  Object.assign(field.style, { position: 'fixed', top: '0', left: '0', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' });
  // A modal makes the rest of the page inert, so its copy target must be inside it.
  container.append(field);
  try {
    field.focus({ preventScroll: true });
    field.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
    if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
  }
}
