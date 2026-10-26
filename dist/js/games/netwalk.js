// 管道（Netwalk）：旋转格子，让所有接口两两对接并连成一张网。
// 题目由随机生成树得到：先保证有解，再随机旋转打乱。纯规则见 new-puzzle-logic.js。
import { pop, cancelMotion, enterBoard, animate, motionEnabled } from '../core/motion.js';
import { updateBoard } from '../core/board-view.js?v=20261026-2';
import { randomSeed, makeSeededRandom } from '../core/utils.js';
import { playSound } from '../core/sound.js';
import { rotateMask, generateNetwalk, checkNetwalk, NETWALK_DIRECTIONS } from './new-puzzle-logic.js';

export { rotateMask, generateNetwalk, checkNetwalk };

function cellSvg(mask, danglingMask) {
  const stubs = [
    { bit: 1, line: 'M5 5 V0.6' },
    { bit: 2, line: 'M5 5 H9.4' },
    { bit: 4, line: 'M5 5 V9.4' },
    { bit: 8, line: 'M5 5 H0.6' }
  ];
  // 悬空的管口画成红色虚线，一眼看出哪里没接上
  const paths = stubs
    .filter(({ bit }) => mask & bit)
    .map(({ bit, line }) => `<path d="${line}"${danglingMask & bit ? ' class="dangling"' : ''}/>`)
    .join('');
  return `<svg viewBox="0 0 10 10" aria-hidden="true">${paths}<circle cx="5" cy="5" r="1.15"/></svg>`;
}

const PRESETS = [5, 7];
const sizeCode = (n) => 500 + n;

let ctx, controller, n = PRESETS[1], puzzle, values, seed, won, moves, lastLinked;

// 连通性（从 0 号格出发的管网）与每格悬空的管口位掩码
function analyze() {
  const connected = new Set([0]);
  const queue = [0];
  while (queue.length) {
    const cell = queue.pop();
    const r = Math.floor(cell / n), c = cell % n;
    for (const { bit, dr, dc, opposite } of NETWALK_DIRECTIONS) {
      if (!(values[cell] & bit)) continue;
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
      const next = nr * n + nc;
      if ((values[next] & opposite) && !connected.has(next)) { connected.add(next); queue.push(next); }
    }
  }
  const dangling = values.map((mask, i) => {
    let maskOut = 0;
    const r = Math.floor(i / n), c = i % n;
    for (const { bit, dr, dc, opposite } of NETWALK_DIRECTIONS) {
      if (!(mask & bit)) continue;
      const nr = r + dr, nc = c + dc;
      const docked = nr >= 0 && nr < n && nc >= 0 && nc < n && Boolean(values[nr * n + nc] & opposite);
      if (!docked) maskOut |= bit;
    }
    return maskOut;
  });
  return { connected, dangling };
}

function render(animateCell = -1) {
  const grid = ctx.els.gameRoot.querySelector('.netwalk-grid');
  grid.style.setProperty('--n', n);
  grid.classList.toggle('won', won);
  const { connected, dangling } = analyze();
  updateBoard(grid, values.map((mask, i) => {
    const live = connected.has(i);
    const stateLabel = live ? '已接通' : '未接通';
    const danglingLabel = dangling[i] ? '，有悬空管口' : '';
    return `<button type="button" class="netwalk-cell${live ? ' connected' : ''}" data-cell="${i}" aria-label="第 ${Math.floor(i / n) + 1} 行第 ${i % n + 1} 列管道，${stateLabel}${danglingLabel}，点击顺时针旋转">${cellSvg(mask, dangling[i])}</button>`;
  }).join(''), { origin: animateCell, columns: n, spread: 'connected' });
  if (animateCell >= 0) animate(grid.children[animateCell].querySelector('svg'), [
    { transform: 'rotate(-90deg)' }, { transform: 'rotate(0deg)' }
  ], { duration: 190 });
  ctx.els.controlPanel.querySelector('#netwalkMoves').textContent = moves;
  const linked = ctx.els.controlPanel.querySelector('#netwalkLinked');
  if (linked) linked.textContent = `${connected.size} / ${n * n}`;
  return connected.size;
}

// 通关瞬间：亮光沿对角线流过整张管网
function playWinWave() {
  if (!motionEnabled()) return;
  const grid = ctx.els.gameRoot.querySelector('.netwalk-grid');
  [...grid.children].forEach((cell, i) => {
    const delay = (Math.floor(i / n) + (i % n)) * 28;
    animate(cell, [
      { boxShadow: 'inset 0 0 0 0 rgba(255,255,255,0)', filter: 'brightness(1)' },
      { boxShadow: 'inset 0 0 0 100px rgba(255,255,255,.5)', filter: 'brightness(1.15)', offset: 0.38 },
      { boxShadow: 'inset 0 0 0 0 rgba(255,255,255,0)', filter: 'brightness(1)' }
    ], { duration: 340, delay });
  });
}

function rotate(cell) {
  if (won) return;
  values[cell] = rotateMask(values[cell], 1);
  moves += 1;
  ctx.timer.start();
  ctx.setStatus('active');
  playSound('rotate');
  const linked = render(cell);
  // 管网变大时给一个上扬的接通音 + 数字弹跳，负反馈不发声音（红色虚线已够明显）
  if (linked > lastLinked) {
    playSound('connect');
    pop(ctx.els.controlPanel.querySelector('#netwalkLinked'));
  }
  lastLinked = linked;
  if (checkNetwalk(n, values)) {
    won = true;
    ctx.timer.stop();
    render();
    playWinWave();
    ctx.reportWin({
      summary: `你用 ${ctx.timerText()} 接通了 ${n} × ${n} 的整张管网，共旋转 ${moves} 次。`,
      score: { size: sizeCode(n), difficulty: n === PRESETS[0] ? 'easy' : 'normal', elapsedSeconds: Math.max(1, ctx.timer.elapsed()), puzzleId: seed % 10000, puzzleSeed: seed }
    });
  }
}

function newGame() {
  cancelMotion(ctx.els.gameRoot);
  cancelMotion(ctx.els.controlPanel);
  ctx.closeVictory();
  seed = randomSeed();
  const random = makeSeededRandom(seed);
  puzzle = generateNetwalk(n, random);
  values = puzzle.scrambled;
  won = false;
  moves = 0;
  ctx.timer.reset();
  ctx.setStatus('idle');
  ctx.setTitle(`${n} × ${n} · 接通管网`);
  ctx.setPuzzleNumber(seed % 10000);
  lastLinked = render();
  enterBoard(ctx.els.gameRoot);
}

export default {
  id: 'netwalk', name: '管道', icon: '╋', subtitle: 'NETWALK',
  howToTitle: '旋转管道，接通全网',
  howTo: '<p>点击格子让管道<strong>顺时针旋转 90°</strong>，目标是让每个管口都与相邻格子的管口对接。</p><p><strong>蓝色</strong>管道表示已经连入主网；<strong>红色虚线</strong>管口是悬空的，需要找邻居对接；灰色管道还没入网。所有格子变蓝即通关，会自动判定，不需要手动检查。</p><p>尽量少旋转几次、尽快完成，排行榜按用时排序。</p>',
  sizes: PRESETS.map((v) => ({ value: sizeCode(v), label: `${v} × ${v}` })),
  difficulties: [{ value: 'easy', label: '入门' }, { value: 'normal', label: '进阶' }],
  getScoreFilter: () => ({ size: sizeCode(n), difficulty: n === PRESETS[0] ? 'easy' : 'normal' }),
  configure({ size } = {}) {
    if (!ctx || !size) return;
    const next = Number(size) - 500;
    if (!PRESETS.includes(next) || next === n) return;
    n = next;
    ctx.els.controlPanel.querySelectorAll('[data-size]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.size) === n)));
  },
  newGame,
  mount(context) {
    ctx = context;
    controller = new AbortController();
    const options = { signal: controller.signal };
    ctx.els.controlPanel.innerHTML = `<div class="eyebrow"><span></span> NETWORK PUZZLE</div><h1>旋转拼接，<br><em>接通整张管网。</em></h1><div class="field-group"><div class="field-label"><span>棋盘规格</span></div><div class="segmented" role="radiogroup" aria-label="棋盘规格">${PRESETS.map((v) => `<button type="button" role="radio" aria-checked="${n === v}" data-size="${v}">${v} × ${v}</button>`).join('')}</div></div><div class="tile-score"><span>已接通</span><strong id="netwalkLinked" aria-live="polite">0 / 0</strong></div><div class="tile-score"><span>旋转次数</span><strong id="netwalkMoves" aria-live="polite">0</strong></div><button type="button" class="primary-button" data-action="new">↻ 生成新题目</button><div class="mini-guide"><span class="guide-icon">✦</span><p><strong>蓝色是已接通的管网，红色虚线是悬空的管口。</strong><br>灰色管道还没入网，全部变蓝即胜利。</p></div>`;
    ctx.els.gameRoot.innerHTML = '<div class="netwalk-grid" role="group" aria-label="管道棋盘"></div>';
    ctx.els.boardToolbar.innerHTML = '<div class="board-actions"><button type="button" class="secondary-button" data-action="new">↻ 重新打乱</button></div>';
    ctx.els.desktopTip.textContent = '点击格子顺时针旋转 · 所有管口对接且全网连通即通关';
    ctx.els.controlPanel.addEventListener('click', (e) => {
      const size = e.target.closest('[data-size]');
      if (size) {
        n = Number(size.dataset.size);
        ctx.els.controlPanel.querySelectorAll('[data-size]').forEach((b) => b.setAttribute('aria-checked', String(b === size)));
        newGame();
      }
      if (e.target.closest('[data-action="new"]')) newGame();
    }, options);
    ctx.els.boardToolbar.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="new"]')) newGame();
    }, options);
    ctx.els.gameRoot.addEventListener('click', (e) => {
      const cell = e.target.closest('[data-cell]');
      if (cell) rotate(Number(cell.dataset.cell));
    }, options);
    newGame();
  },
  unmount() { controller.abort(); cancelMotion(ctx.els.gameRoot); cancelMotion(ctx.els.controlPanel); ctx = null; }
};

// 供浏览器回归测试使用（不影响游戏本身）。
export const __testing = {
  get values() { return values; },
  get solution() { return puzzle?.solution; },
  get won() { return won; }
};
