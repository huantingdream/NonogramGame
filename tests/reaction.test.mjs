import test from 'node:test';
import assert from 'node:assert/strict';

// Exercise the actual game event handlers, with separate input, handler and frame
// clocks. This proves arithmetic/order behavior, not physical screen latency.
let moduleId = 0;
async function environment(t) {
  const state = { now: 100, focusCost: 0, nextId: 0, timers: new Map(), frames: new Map(), wins: [], observers: [] };
  class Element {
    constructor() { this.dataset = {}; this.listeners = {}; this.children = new Map(); this.writes = 0; }
    set textContent(value) { this.text = String(value); this.writes++; }
    get textContent() { return this.text; }
    set innerHTML(value) { this.html = value; this.writes++; }
    get innerHTML() { return this.html; }
    querySelector(selector) {
      if (!this.children.has(selector)) this.children.set(selector, new Element());
      return this.children.get(selector);
    }
    querySelectorAll() { return []; }
    setAttribute() {}
    focus() { state.now += state.focusCost; }
    addEventListener(type, listener, options = {}) {
      (this.listeners[type] ??= []).push({ listener, signal: options.signal });
    }
    dispatch(type, options = {}) {
      const event = { type, timeStamp: state.now, isPrimary: true, button: 0, detail: 1, preventDefault() {}, ...options };
      for (const { listener, signal } of this.listeners[type] ?? []) if (!signal?.aborted) listener(event);
    }
  }
  const doc = new Element(), win = new Element();
  doc.documentElement = new Element(); doc.hidden = false; doc.dialogOpen = false;
  doc.querySelector = selector => selector === 'dialog[open]' && doc.dialogOpen ? {} : null;
  win.matchMedia = () => ({ matches: true, addEventListener() {} });
  const saved = new Map();
  const globals = {
    window: win, document: doc,
    performance: { now: () => state.now, timeOrigin: 1700000000000 },
    localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; state.observers.push(this); }
      observe() {} disconnect() { this.disconnected = true; }
    },
    setTimeout: callback => { const id = ++state.nextId; state.timers.set(id, callback); return id; },
    clearTimeout: id => state.timers.delete(id),
    requestAnimationFrame: callback => { const id = ++state.nextId; state.frames.set(id, callback); return id; },
    cancelAnimationFrame: id => state.frames.delete(id),
  };
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key]);
  }
  const ctx = {
    els: { controlPanel: new Element(), gameRoot: new Element(), boardToolbar: new Element(), desktopTip: new Element() },
    timer: { start(options) { state.timerOptions = options; }, stop() {}, reset() {}, elapsed: () => 3 },
    closeVictory() {}, setTitle() {}, setPuzzleNumber() {}, setStatus() {}, reportWin: win => state.wins.push(win),
  };
  const { reaction } = await import(`../src/games/training.js?test=${++moduleId}`);
  reaction.mount(ctx);
  const surface = ctx.els.gameRoot.querySelector('.reaction-surface');
  const rounds = () => ctx.els.controlPanel.querySelector('#reactionRounds').textContent;
  const frame = now => {
    state.now = now;
    const callbacks = [...state.frames.values()]; state.frames.clear();
    for (const callback of callbacks) callback(now - 3); // rAF argument is NOT the cue's actual mutation time.
  };
  const cue = (at = 3000) => {
    for (const [id, callback] of [...state.timers]) { state.timers.delete(id); callback(); }
    frame(at);
  };
  const start = () => surface.dispatch('pointerdown');
  return { state, ctx, doc, win, surface, rounds, frame, cue, start, reaction, saved };
}

test('delayed input handling and focus work do not inflate a 200 ms response', async t => {
  const e = await environment(t);
  e.start(); e.cue(); e.frame(3016);
  e.state.now = 3400; e.state.focusCost = 40;
  e.surface.dispatch('pointerdown', { timeStamp: 3200 });
  assert.equal(e.surface.querySelector('strong').textContent, '200 ms');
  assert.equal(e.rounds(), '1 / 5');
  assert.deepEqual(e.state.timerOptions, { silent: true });
});

test('an input queued before green is still a false start when dispatched after green', async t => {
  const e = await environment(t);
  e.start(); e.cue(); e.frame(3016);
  e.state.now = 3200; e.surface.dispatch('keydown', { key: 'Enter', timeStamp: 2999 });
  assert.equal(e.surface.dataset.phase, 'early');
  assert.equal(e.rounds(), '0 / 5');
  assert.equal(e.state.frames.size, 0);
});

test('cue does not rewrite scores, and its next frame does not move the timing origin', async t => {
  const e = await environment(t);
  e.start();
  const history = e.ctx.els.boardToolbar.querySelector('.reaction-history');
  const writes = history.writes;
  e.cue(); assert.equal(history.writes, writes);
  e.state.now = 3010; e.surface.dispatch('keydown', { key: ' ', timeStamp: 3008 });
  assert.equal(e.rounds(), '0 / 5'); // Keep input time until the cue's stall check completes.
  e.frame(3016);
  assert.equal(e.surface.querySelector('strong').textContent, '8 ms');
  assert.equal(e.rounds(), '1 / 5');
});

test('a stalled cue frame invalidates the round, including input awaiting that check', async t => {
  const e = await environment(t);
  e.start(); e.cue();
  e.state.now = 3030; e.surface.dispatch('pointerdown');
  e.frame(3100);
  assert.equal(e.surface.dataset.phase, 'interrupted');
  assert.match(e.surface.querySelector('small').textContent, /卡顿/);
  assert.equal(e.rounds(), '0 / 5');
  assert.equal(e.state.wins.length, 0);
  e.start(); e.cue(6000); e.frame(6016);
  e.state.now = 6200; e.surface.dispatch('pointerdown');
  assert.equal(e.rounds(), '1 / 5');
});

test('invalid timestamp never becomes a fabricated score or a new best', async t => {
  const e = await environment(t);
  e.start(); e.cue(); e.frame(3016);
  e.state.now = 3200; e.surface.dispatch('pointerdown', { timeStamp: NaN });
  assert.equal(e.surface.dataset.phase, 'interrupted');
  assert.equal(e.rounds(), '0 / 5');
  assert.equal(e.saved.size, 0);
});

test('five rounds average the unrounded durations and persist/report only the final integer', async t => {
  const e = await environment(t);
  for (let i = 0; i < 5; i++) {
    const at = (i + 1) * 3000;
    e.start(); e.cue(at); e.frame(at + 16);
    e.state.now = at + 500;
    e.surface.dispatch('keydown', { key: 'Enter', timeStamp: at + (i === 0 ? 201.49 : 200.49) });
  }
  assert.equal(e.surface.dataset.phase, 'complete');
  assert.equal(e.rounds(), '5 / 5');
  assert.equal(e.surface.querySelector('strong').textContent, '201 ms');
  assert.equal(e.state.wins[0].score.averageMs, 201);
  assert.equal(e.saved.get('gejian:reaction:best-average-ms'), '201');
  assert.doesNotMatch(e.ctx.els.boardToolbar.querySelector('.reaction-history').innerHTML, /\.49/);
});

test('right click, non-primary pointer, key repeat and pointer click do not submit', async t => {
  const e = await environment(t);
  e.start(); e.cue(); e.frame(3016); e.state.now = 3200;
  e.surface.dispatch('pointerdown', { button: 2 });
  e.surface.dispatch('pointerdown', { isPrimary: false });
  e.surface.dispatch('keydown', { key: ' ', repeat: true });
  e.surface.dispatch('keydown', { key: 'x' });
  e.surface.dispatch('click', { detail: 1 });
  assert.equal(e.rounds(), '0 / 5');
  e.surface.dispatch('click', { detail: 0 }); // Assistive-technology activation stays available.
  assert.equal(e.rounds(), '1 / 5');
});

for (const reason of ['blur', 'hidden', 'dialog', 'reset', 'unmount']) {
  test(`${reason} cancels pending cue checks/inputs and releases temporary motion pause`, async t => {
    const e = await environment(t);
    e.start(); e.cue(); e.state.now = 3010; e.surface.dispatch('pointerdown');
    assert.equal(e.doc.documentElement.dataset.backgroundMotion, 'off');
    if (reason === 'blur') e.win.dispatch('blur');
    if (reason === 'hidden') { e.doc.hidden = true; e.doc.dispatch('visibilitychange'); }
    if (reason === 'dialog') { e.doc.dialogOpen = true; e.state.observers[0].callback(); }
    if (reason === 'reset') e.reaction.newGame();
    if (reason === 'unmount') e.reaction.unmount();
    e.frame(4000);
    assert.equal(e.rounds(), '0 / 5');
    assert.equal(e.state.frames.size, 0);
    assert.equal(e.state.timers.size, 0);
    assert.equal(e.state.wins.length, 0);
    assert.equal(e.doc.documentElement.dataset.backgroundMotion, 'on');
  });
}
