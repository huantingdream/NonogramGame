import { randomSeed } from '../core/utils.js';
import { enterBoard, pop } from '../core/motion.js';
import { COLS, ROWS, SHAPES, createState, cells, ghost, level, move, rotate, softDrop, hardDrop, hold, advance } from './tetris-logic.js';

let ctx, controller, observer, raf, state, seed, grid, overlay, tiles;
let started, paused, reported, lastFrame, lastLocks;
const held = new Map();
const keyActions = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowDown: 'down', s: 'down',
  ArrowUp: 'rotate', w: 'rotate', x: 'rotate', z: 'reverse', ' ': 'drop', c: 'hold', Shift: 'hold', p: 'pause', Escape: 'pause' };
const repeatable = action => ['left', 'right', 'down'].includes(action);
const blocked = () => document.hidden || !!document.querySelector('dialog[open]');

function preview(type) {
  if (!type) return '<span class="tetris-empty">—</span>';
  return `<div class="tetris-preview" style="--piece-size:${SHAPES[type].length}" aria-label="${type} 形方块">${SHAPES[type].flat().map(value => `<i class="tetris-cell"${value ? ` data-piece="${type}"` : ''}></i>`).join('')}</div>`;
}
function render() {
  const view = state.board.flat().map(type => ({ type, kind: type ? 'locked' : '' }));
  if (!state.over) {
    for (const [x, y] of cells(ghost(state))) if (y >= 0) view[y * COLS + x] = { type: state.active.type, kind: 'ghost' };
    for (const [x, y] of cells(state.active)) if (y >= 0) view[y * COLS + x] = { type: state.active.type, kind: 'active' };
  }
  view.forEach(({ type, kind }, i) => {
    if (tiles[i].dataset.piece !== (type || '')) tiles[i].dataset.piece = type || '';
    if (tiles[i].dataset.kind !== kind) tiles[i].dataset.kind = kind;
  });
  for (const [id, value] of [['tetrisScore', state.score], ['tetrisLines', state.lines], ['tetrisLevel', level(state)]]) {
    const el = ctx.els.controlPanel.querySelector(`#${id}`);
    if (el.textContent !== String(value)) el.textContent = value;
  }
  const holdEl = ctx.els.gameRoot.querySelector('#tetrisHold');
  if (holdEl.dataset.type !== (state.hold || '')) { holdEl.dataset.type = state.hold || ''; holdEl.innerHTML = preview(state.hold); }
  holdEl.classList.toggle('used', state.holdUsed);
  const nextEl = ctx.els.gameRoot.querySelector('#tetrisNext'), next = state.next.slice(0, 3).join('');
  if (nextEl.dataset.types !== next) { nextEl.dataset.types = next; nextEl.innerHTML = state.next.slice(0, 3).map(preview).join(''); }
  const phase = state.over ? 'over' : !started ? 'ready' : paused ? 'paused' : 'playing';
  grid.dataset.phase = phase;
  overlay.hidden = phase === 'playing';
  overlay.querySelector('strong').textContent = state.over ? '本局结束' : started ? '已暂停' : '准备好了吗？';
  overlay.querySelector('p').textContent = state.over ? `本局得分 ${state.score}` : started ? '准备好后继续，方块会等你。' : '拼满一行，即可消除。';
  const start = overlay.querySelector('button');
  start.hidden = state.over; start.textContent = started ? '继续游戏' : '开始游戏';
  const pause = ctx.els.boardToolbar.querySelector('[data-tetris="pause"]');
  pause.textContent = paused ? '继续' : '暂停'; pause.disabled = !started || state.over;
  ctx.els.boardToolbar.querySelector('[data-tetris="hold"]').disabled = state.holdUsed || state.over;
  if (state.locks !== lastLocks) {
    lastLocks = state.locks;
    if (state.cleared.length) {
      pop(ctx.els.controlPanel.querySelector('#tetrisScore'));
      ctx.els.gameRoot.querySelector('#tetrisFeedback').textContent = `消除 ${state.cleared.length} 行！`;
    } else ctx.els.gameRoot.querySelector('#tetrisFeedback').textContent = '';
  }
  if (state.over && !reported) {
    reported = true; held.clear(); ctx.timer.stop();
    ctx.reportWin({ gameOver: true, summary: `本局得分 ${state.score} 分，消除 ${state.lines} 行，达到 ${level(state)} 级。用时 ${ctx.timerText()}。`,
      score: { size: 200, difficulty: 'normal', elapsedSeconds: Math.max(1, ctx.timer.elapsed()), puzzleId: seed % 10000, puzzleSeed: seed, points: state.score } });
  }
}
function pauseGame() {
  held.clear();
  if (!started || paused || state.over) return;
  paused = true; ctx.timer.stop(); ctx.setStatus('idle', '已暂停'); render();
}
function resume() {
  if (state.over || blocked()) return;
  started = true; paused = false; lastFrame = performance.now();
  ctx.timer.start(); ctx.setStatus('active'); render();
  grid.focus({ preventScroll: true });
}
function action(name) {
  if (blocked() || state.over) return;
  if (name === 'pause') { if (paused) resume(); else pauseGame(); return; }
  if (!started || paused) return;
  if (name === 'left') move(state, -1);
  if (name === 'right') move(state, 1);
  if (name === 'rotate') rotate(state);
  if (name === 'reverse') rotate(state, -1);
  if (name === 'down') softDrop(state);
  if (name === 'drop') hardDrop(state);
  if (name === 'hold') hold(state);
  render();
}
function frame(now) {
  const dt = Math.min(Math.max(0, now - lastFrame), 50); lastFrame = now;
  if (blocked()) pauseGame();
  if (started && !paused && !state.over) {
    for (const press of held.values()) {
      press.remaining -= dt;
      if (press.remaining <= 0) { action(press.action); press.remaining += press.action === 'down' ? 40 : 75; }
    }
    const y = state.active.y, locks = state.locks;
    advance(state, dt);
    if (state.active.y !== y || state.locks !== locks || state.over) render();
  }
  raf = requestAnimationFrame(frame);
}
function newGame() {
  ctx.closeVictory(); seed = randomSeed(); state = createState(seed);
  started = false; paused = false; reported = false; lastLocks = 0; held.clear();
  ctx.timer.reset(); ctx.setStatus('idle', '等待开始'); ctx.setTitle('10 × 20 · 俄罗斯方块'); ctx.setPuzzleNumber(seed % 10000);
  ctx.els.gameRoot.querySelector('#tetrisFeedback').textContent = '';
  render(); enterBoard(ctx.els.gameRoot);
}
export default {
  id: 'tetris', name: '俄罗斯方块', icon: '▟', subtitle: 'TETRIS', howToTitle: '旋转、下落，消除整行',
  howTo: '<p>点击<strong>开始游戏</strong>。← → / A D 移动，↑ / W / X 顺时针旋转，Z 逆时针旋转；↓ / S 加速下落，空格直接落到底部。手机可使用棋盘下方按钮，长按移动或下落可连续操作。</p><p>C / Shift 暂存方块，每个方块落定前只能暂存一次。虚线方块显示落点，右侧预览接下来的三块。每组七块包含全部七种形状。</p><p>填满一行就会消除，同时消除 1 / 2 / 3 / 4 行获得 100 / 300 / 500 / 800 × 当前等级的分数。每消除 10 行升一级，下落更快；手动下落每格 1 分，直接落下每格 2 分。</p><p>P / Esc 暂停，切换窗口或打开弹窗也会自动暂停，点击继续后恢复。新方块无法入场时结束，可上传高分榜。</p>',
  sizes: [{ value: 200, label: '10 × 20' }], difficulties: [{ value: 'normal', label: '经典' }],
  getScoreFilter: () => ({ size: 200, difficulty: 'normal' }), newGame,
  mount(context) {
    ctx = context; controller = new AbortController(); const options = { signal: controller.signal };
    ctx.els.controlPanel.innerHTML = `<div class="eyebrow"><span></span> FALLING BLOCKS</div><h1>让每一块，<br><em>恰好归位。</em></h1>
      <div class="tile-score"><span>本局得分</span><strong id="tetrisScore">0</strong></div>
      <div class="tetris-stats"><div><span>已消除</span><strong id="tetrisLines">0</strong><small>行</small></div><div><span>当前等级</span><strong id="tetrisLevel">1</strong><small>级</small></div></div>
      <button type="button" class="primary-button" id="tetrisNew">↻ 开始新一局</button>
      <div class="mini-guide"><span class="guide-icon">✦</span><p><strong>留出空间，从容落下。</strong><br>试着一次消除四行。</p></div>`;
    ctx.els.gameRoot.innerHTML = `<div class="tetris-stage"><div class="tetris-well"><div class="tetris-grid" tabindex="0" role="img" aria-label="俄罗斯方块，10 列 20 行棋盘">${Array.from({ length: COLS * ROWS }, () => '<i class="tetris-cell" aria-hidden="true"></i>').join('')}</div>
      <div class="tetris-overlay"><strong></strong><p></p><button type="button" class="primary-button" id="tetrisStart">开始游戏</button></div></div>
      <aside class="tetris-sidebar"><section><h3>暂存 <kbd>C</kbd></h3><div id="tetrisHold">${preview(null)}</div></section><section><h3>接下来</h3><div id="tetrisNext"></div></section><p id="tetrisFeedback" role="status"></p></aside></div>`;
    ctx.els.boardToolbar.innerHTML = `<div class="tetris-controls" aria-label="俄罗斯方块操作">${[['left','←','向左移动'],['rotate','↻','顺时针旋转'],['right','→','向右移动'],['down','↓','加速下落'],['drop','⤓ 落下','直接落下'],['hold','暂存','暂存方块'],['pause','暂停','暂停或继续']].map(([name, text, label]) => `<button type="button" class="secondary-button" data-tetris="${name}" aria-label="${label}">${text}</button>`).join('')}</div>`;
    ctx.els.desktopTip.textContent = '← → 移动 · ↑ 旋转 · ↓ 加速 · 空格落下 · C 暂存 · P 暂停';
    grid = ctx.els.gameRoot.querySelector('.tetris-grid'); tiles = [...grid.children];
    overlay = ctx.els.gameRoot.querySelector('.tetris-overlay');
    ctx.els.controlPanel.querySelector('#tetrisNew').addEventListener('click', newGame, options);
    overlay.querySelector('button').addEventListener('click', resume, options);
    ctx.els.boardToolbar.addEventListener('pointerdown', event => {
      const button = event.target.closest('[data-tetris]');
      if (!button || button.disabled || event.button !== 0 || !repeatable(button.dataset.tetris)) return;
      event.preventDefault(); button.setPointerCapture(event.pointerId);
      action(button.dataset.tetris);
      if (started && !paused && !state.over) held.set(`pointer:${event.pointerId}`, { action: button.dataset.tetris, remaining: 180 });
    }, options);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) ctx.els.boardToolbar.addEventListener(type, event => held.delete(`pointer:${event.pointerId}`), options);
    ctx.els.boardToolbar.addEventListener('click', event => {
      const button = event.target.closest('[data-tetris]');
      if (button && (!repeatable(button.dataset.tetris) || event.detail === 0)) action(button.dataset.tetris);
    }, options);
    document.addEventListener('keydown', event => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input, select, textarea, [contenteditable="true"]') || blocked()) return;
      const name = keyActions[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (!name || (event.key === ' ' && event.target.closest('button, a'))) return;
      event.preventDefault(); if (event.repeat) return;
      action(name);
      if (repeatable(name) && started && !paused && !state.over) held.set(event.code, { action: name, remaining: 180 });
    }, options);
    document.addEventListener('keyup', event => held.delete(event.code), options);
    window.addEventListener('blur', pauseGame, options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); }, options);
    observer = new MutationObserver(() => { if (blocked()) pauseGame(); });
    document.querySelectorAll('dialog').forEach(dialog => observer.observe(dialog, { attributes: true, attributeFilter: ['open'] }));
    newGame(); lastFrame = performance.now(); raf = requestAnimationFrame(frame);
  },
  unmount() {
    cancelAnimationFrame(raf); observer.disconnect(); controller.abort(); held.clear(); ctx.timer.stop(); ctx = null;
  }
};
