import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimer } from '../dist/js/core/timer.js';

test('silent timer avoids periodic UI work but preserves elapsed time on stop', t => {
  let now = 1000, intervals = 0;
  t.mock.method(Date, 'now', () => now);
  const original = globalThis.window;
  globalThis.window = { setInterval: () => ++intervals, clearInterval() {} };
  t.after(() => original === undefined ? delete globalThis.window : globalThis.window = original);
  const ticks = [], timer = createTimer(value => ticks.push(value));
  timer.start({ silent: true }); now = 4500;
  assert.equal(intervals, 0);
  assert.equal(timer.elapsed(), 3);
  assert.deepEqual(ticks, []);
  timer.stop(); assert.deepEqual(ticks, [3]);
  timer.start(); assert.equal(intervals, 1);
  now = 6500; assert.equal(timer.elapsed(), 5);
  timer.reset(); assert.equal(timer.elapsed(), 0);
});
