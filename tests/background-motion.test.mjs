import test from 'node:test';
import assert from 'node:assert/strict';

function environment(saved = null) {
  const values = new Map();
  if (saved) values.set('gejian:background-motion', saved);
  const listeners = {};
  const attributes = {};
  const button = {
    title: '',
    addEventListener(type, listener) { listeners[type] = listener; },
    setAttribute(name, value) { attributes[name] = value; },
  };
  globalThis.localStorage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
  globalThis.document = {
    documentElement: { dataset: {} },
    querySelector(selector) { return selector === '#backgroundMotionButton' ? button : null; },
  };
  return { attributes, button, listeners, values };
}

async function loadModule(name) {
  return import(`../src/core/background-motion.js?test=${name}-${Date.now()}-${Math.random()}`);
}

test('reaction pauses background motion by default and restores it in other games', async () => {
  const env = environment();
  const motion = await loadModule('default');
  motion.initBackgroundMotion();
  motion.setBackgroundMotionContext('reaction');
  assert.equal(document.documentElement.dataset.backgroundMotion, 'off');
  assert.equal(env.attributes['aria-pressed'], 'false');
  assert.equal(env.button.title, '开启背景动效');

  motion.setBackgroundMotionContext('nonogram');
  assert.equal(document.documentElement.dataset.backgroundMotion, 'on');
  assert.equal(env.attributes['aria-pressed'], 'true');
});

test('manual preference persists and overrides the reaction default', async () => {
  const env = environment();
  const motion = await loadModule('manual');
  motion.initBackgroundMotion();
  motion.setBackgroundMotionContext('reaction');
  env.listeners.click();
  assert.equal(env.values.get('gejian:background-motion'), 'on');
  assert.equal(document.documentElement.dataset.backgroundMotion, 'on');

  motion.setBackgroundMotionContext('aim');
  env.listeners.click();
  assert.equal(env.values.get('gejian:background-motion'), 'off');
  assert.equal(document.documentElement.dataset.backgroundMotion, 'off');
});

test('measurement temporarily pauses motion without overwriting saved preferences', async () => {
  const env = environment('on');
  const motion = await loadModule('pause');
  motion.initBackgroundMotion(); motion.setBackgroundMotionContext('reaction');
  motion.pauseBackgroundMotion(true);
  assert.equal(document.documentElement.dataset.backgroundMotion, 'off');
  assert.equal(env.button.disabled, true);
  env.listeners.click();
  assert.equal(env.values.get('gejian:background-motion'), 'on');
  motion.pauseBackgroundMotion(false);
  assert.equal(document.documentElement.dataset.backgroundMotion, 'on');
  assert.equal(env.button.disabled, false);
  motion.setBackgroundMotionContext('aim');
  assert.equal(document.documentElement.dataset.backgroundMotion, 'on');
});
