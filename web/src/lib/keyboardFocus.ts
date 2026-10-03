// Keeps the field you tapped clearly visible, in the middle of the space left above the keyboard.
//
// When the on-screen keyboard opens, the page area shrinks (the Android shell uses adjustResize).
// We then (1) mark <html> with "kb-open" so the fixed bottom bars get out of the way and the page
// can scroll far enough to centre any field, and (2) scroll the focused field to the centre of the
// visible area - after the keyboard animation, and again whenever the visible height changes.

const NON_TEXT = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'hidden', 'range', 'color', 'image']);

export function isTextField(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (!el) return false;
  if (el instanceof HTMLInputElement) return !NON_TEXT.has(el.type);
  return el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

let baseline = 0; // the tallest visible height seen at this width = keyboard closed
let lastWidth = 0;
let timer: number | undefined;

const visibleHeight = (): number => window.visualViewport?.height ?? window.innerHeight;

/** Updates the kb-open flag; true when the keyboard looks open (visible area shrank a lot). */
function updateKeyboardFlag(): boolean {
  const w = window.innerWidth;
  const h = visibleHeight();
  if (w !== lastWidth) { lastWidth = w; baseline = h; } // rotated: start over
  baseline = Math.max(baseline, h);
  const open = baseline - h > 120;
  document.documentElement.classList.toggle('kb-open', open);
  return open;
}

export function centreField(el: Element | null): void {
  if (!isTextField(el)) return;
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
}

function centreActive(): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => centreField(document.activeElement), 80);
}

export function initKeyboardFocus(): void {
  if (typeof window === 'undefined') return;
  baseline = visibleHeight();
  lastWidth = window.innerWidth;

  document.addEventListener('focusin', (e) => {
    const target = e.target as Element | null;
    if (!isTextField(target)) return;
    // The keyboard takes a moment to slide up: centre now, and again once it has.
    for (const ms of [60, 260, 520]) window.setTimeout(() => { if (document.activeElement === target) centreField(target); }, ms);
  });

  const onResize = () => {
    updateKeyboardFlag();
    if (isTextField(document.activeElement)) centreActive();
  };
  window.visualViewport?.addEventListener('resize', onResize);
  window.addEventListener('resize', onResize);
  document.addEventListener('focusout', () => window.setTimeout(updateKeyboardFlag, 120));
}
