import test from 'node:test';
import assert from 'node:assert/strict';
import { randomSeed, setNextSeed } from '../dist/js/core/utils.js';

let serial = 0;
async function setup(t, onSelect) {
  const element = { addEventListener() {}, classList: { add() {}, remove() {} } };
  for (const [key, value] of Object.entries({
    window: { matchMedia: () => ({ matches: true, addEventListener() {} }), setTimeout: () => 0, clearTimeout() {} },
    document: { querySelector: () => element, querySelectorAll: () => [] },
    setTimeout: () => 0, clearTimeout() {}
  })) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => old ? Object.defineProperty(globalThis, key, old) : delete globalThis[key]);
  }
  const calls = [];
  const games = ['netwalk', 'kenken'].map(id => ({
    id, name: id,
    configure: config => calls.push({ id, config }),
    newGame: () => calls.push({ id, seed: randomSeed() })
  }));
  const daily = await import(`../dist/js/core/daily.js?test=${++serial}`);
  daily.initDaily({ games, onSelect });
  return { daily, calls };
}

test('daily waits for game mounting before configuring or consuming its seed', async t => {
  let finishMount;
  const { daily, calls } = await setup(t, () => new Promise(resolve => { finishMount = resolve; }));
  setNextSeed(123);
  const pending = daily.startDaily('netwalk');
  assert.deepEqual(calls, [], 'unmounted game must not be accessed');
  assert.equal(randomSeed(), 123, 'pending challenge must not leak its seed into the previous game');
  finishMount(true);
  await pending;
  assert.deepEqual(calls, [
    { id: 'netwalk', config: { size: 507, difficulty: 'normal' } },
    { id: 'netwalk', seed: daily.dailySeed(daily.todayKey(), 'netwalk', 507, 'normal') }
  ]);
});

test('superseded mounting does not restart a game after the player switched away', async t => {
  const { daily, calls } = await setup(t, async () => false);
  await daily.startDaily('netwalk');
  assert.deepEqual(calls, []);
});

test('overlapping daily requests only start the most recently requested challenge', async t => {
  const ready = {};
  const { daily, calls } = await setup(t, id => new Promise(resolve => { ready[id] = resolve; }));
  const first = daily.startDaily('netwalk');
  const second = daily.startDaily('kenken');
  ready.kenken(true);
  await second;
  ready.netwalk(true);
  await first;
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.id === 'kenken'));
});
