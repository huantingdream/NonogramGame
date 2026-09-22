// Visual effects never own game state. Rapid edits replace earlier effects.
const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
const running = new Set();
const byElement = new WeakMap();
export const motionEnabled = () => !preference.matches;
export function animate(element, frames, options = {}) {
  if (!element) return null;
  byElement.get(element)?.cancel();
  if (!motionEnabled() || !element.animate) return null;
  const animation = element.animate(frames, {
    duration: 220, easing: 'cubic-bezier(.2,.75,.25,1)', ...options
  });
  byElement.set(element, animation);
  running.add(animation);
  const clean = () => {
    running.delete(animation);
    if (byElement.get(element) === animation) byElement.delete(element);
  };
  animation.finished.then(clean, clean);
  return animation;
}
export function pop(element, delay = 0) {
  return animate(element, [
    { scale: '.78', opacity: .45 },
    { scale: '1.06', opacity: 1, offset: .65 },
    { scale: '1', opacity: 1 }
  ], { duration: 230, delay, fill: 'backwards' });
}
export function enterBoard(element) {
  animate(element, [{ opacity: 0, translate: '0 8px' }, { opacity: 1, translate: '0 0' }], { duration: 280 });
}
export function cancelMotion(root) {
  for (const animation of running) {
    const element = animation.effect?.target;
    if (!root || element === root || root.contains(element)) animation.cancel();
  }
}
preference.addEventListener('change', () => { if (preference.matches) cancelMotion(); });
