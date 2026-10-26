import { animate, cancelMotion } from './motion.js';

// Keep cell buttons (and keyboard focus) alive so CSS state transitions can run.
// Markup is generated only by the local puzzle renderers, never from user input.
export function updateBoard(board, markup, { origin = -1, columns = 1, spread = '' } = {}) {
  const template = document.createElement('template');
  template.innerHTML = markup;
  const nextCells = [...template.content.children];
  const cells = [...board.children];
  if (cells.length !== nextCells.length || cells.some((cell, i) => cell.tagName !== nextCells[i].tagName)) {
    cancelMotion(board);
    board.replaceChildren(template.content);
    return;
  }
  cells.forEach((cell, i) => {
    const next = nextCells[i];
    const newlyConnected = spread && !cell.classList.contains(spread) && next.classList.contains(spread);
    const newWarning = ['conflict', 'dup', 'blocked', 'overfull'].some((name) => !cell.classList.contains(name) && next.classList.contains(name));
    // A rapid reversal must also stop any delayed feedback for the old state.
    if (cell.className !== next.className) cancelMotion(cell);
    for (const attr of [...cell.attributes]) {
      if (!next.hasAttribute(attr.name)) cell.removeAttribute(attr.name);
    }
    for (const attr of next.attributes) {
      if (cell.getAttribute(attr.name) !== attr.value) cell.setAttribute(attr.name, attr.value);
    }
    if (cell.innerHTML !== next.innerHTML) {
      cancelMotion(cell);
      cell.innerHTML = next.innerHTML;
    }
    if (origin < 0) return;
    if (newWarning) {
      animate(cell, [{ translate: '0 0' }, { translate: '-2px 0' }, { translate: '2px 0' }, { translate: '0 0' }], { duration: 200 });
    } else if (newlyConnected) {
      const distance = Math.abs(Math.floor(i / columns) - Math.floor(origin / columns)) + Math.abs(i % columns - origin % columns);
      animate(cell, [
        { filter: 'brightness(1)', boxShadow: 'inset 0 0 0 0 transparent' },
        { filter: 'brightness(1.18)', boxShadow: 'inset 0 0 0 2px var(--puzzle-pulse)', offset: .4 },
        { filter: 'brightness(1)', boxShadow: 'inset 0 0 0 0 transparent' }
      ], { duration: 320, delay: Math.min(distance * 28, 220) });
    }
  });
}
