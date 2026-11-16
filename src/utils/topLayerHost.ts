/**
 * Where inspector UI must be attached to be seen. A modal `<dialog>` sits in
 * the browser's top layer above every z-index, so while one is open the
 * overlay and comment popup go inside the topmost one instead of `<body>`.
 */
export function topLayerHost(): HTMLElement {
  const modals = Array.from(document.querySelectorAll('dialog[open]')).filter((dialog) => dialog.matches(':modal'));
  return (modals.at(-1) as HTMLElement | undefined) ?? document.body;
}
