import test from 'node:test';
import assert from 'node:assert/strict';

test('rejected animation keyframes never prevent the caller from finishing its update', async t => {
  const oldWindow = globalThis.window;
  globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }) };
  t.after(() => oldWindow === undefined ? delete globalThis.window : globalThis.window = oldWindow);
  const { animate, cancelMotion } = await import('../src/core/motion.js');
  const element = { animate() { throw new TypeError('Unsupported keyframes'); } };
  let updated = false;
  assert.doesNotThrow(() => {
    assert.equal(animate(element, [{ scale: '.8' }, { scale: '1' }]), null);
    updated = true;
  });
  assert.equal(updated, true);
  assert.doesNotThrow(() => cancelMotion());
});
