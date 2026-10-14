// 管道（Netwalk）：旋转格子，让所有接口两两对接并连成一张网。
// 题目由随机生成树得到：先保证有解，再随机旋转打乱。纯规则见 new-puzzle-logic.js。
import { pop, enterBoard } from '../core/motion.js';
import { randomSeed, makeSeededRandom } from '../core/utils.js';
import { playSound } from '../core/sound.js';
import { rotateMask, generateNetwalk, checkNetwalk } from './new-puzzle-logic.js';

export { rotateMask, generateNetwalk, checkNetwalk };

function cellSvg(mask) {
  const stubs = [
    { bit: 1, line: 'M5 5 V0.6' },
    { bit: 2, line: 'M5 5 H9.4' },
    { bit: 4, line: 'M5 5 V9.4' },
    { bit: 8, line: 'M5 5 H0.6' }
  ];
  const paths = stubs.filter(({ bit }) => mask & bit).map(({ line }) => `<path d="${line}"/>`).join('');
  return `<svg viewBox="0 0 10 10" aria-hidden="true">${paths}<circle cx="5" cy="5" r="1.15"/></svg>`;
}

const PRESETS = [5, 7];
const sizeCode = (n) => 500 + n;

let ctx, controller, n = PRESETS[1], puzzle, values, seed, won, moves;

function render(animateCell = -1) {
  const grid = ctx.els.gameRoot.querySelector('.netwalk-grid');
  grid.style.setProperty('--n', n);
  grid.innerHTML = values.map((mask, i) =>
    `<button type="button" class="netwalk-cell" data-cell="${i}" aria-label="第 ${Math.floor(i / n) + 1} 行第 ${i % n + 1} 列管道，点击顺时针旋转">${cellSvg(mask)}</button>`
  ).join('');
  if (animateCell >= 0) pop(grid.children[animateCell]);
  ctx.els.controlPanel.querySelector('#netwalkMoves').textContent = moves;
}

function rotate(cell) {
  if (won) return;
  values[cell] = rotateMask(values[cell], 1);
  moves += 1;
  ctx.timer.start();
  ctx.setStatus('active');
  playSound('rotate');
  render(cell);
  if (checkNetwalk(n, values)) {
    won = true;
    ctx.timer.stop();
    ctx.reportWin({
      summary: `你用 ${ctx.timerText()} 接通了 ${n} × ${n} 的整张管网，共旋转 ${moves} 次。`,
      score: { size: sizeCode(n), difficulty: n === PRESETS[0] ? 'easy' : 'normal', elapsedSeconds: Math.max(1, ctx.timer.elapsed()), puzzleId: seed % 10000, puzzleSeed: seed }
    });
  }
}

function newGame() {
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
  render();
  enterBoard(ctx.els.gameRoot);
}

export default {
  id: 'netwalk', name: '管道', icon: '╋', subtitle: 'NETWALK',
  howToTitle: '旋转管道，接通全网',
  howTo: '<p>点击格子让管道<strong>顺时针旋转 90°</strong>，目标是让每个管口都与相邻格子的管口对接。</p><p>所有格子连成一张网、没有任何悬空的管口时即通关。完成的瞬间会自动判定，不需要手动检查。</p><p>尽量少旋转几次、尽快完成，排行榜按用时排序。</p>',
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
    ctx.els.controlPanel.innerHTML = `<div class="eyebrow"><span></span> NETWORK PUZZLE</div><h1>旋转拼接，<br><em>接通整张管网。</em></h1><div class="field-group"><div class="field-label"><span>棋盘规格</span></div><div class="segmented" role="radiogroup" aria-label="棋盘规格">${PRESETS.map((v) => `<button type="button" role="radio" aria-checked="${n === v}" data-size="${v}">${v} × ${v}</button>`).join('')}</div></div><div class="tile-score"><span>旋转次数</span><strong id="netwalkMoves" aria-live="polite">0</strong></div><button type="button" class="primary-button" data-action="new">↻ 生成新题目</button><div class="mini-guide"><span class="guide-icon">✦</span><p><strong>管口必须两两对接。</strong><br>没有悬空接口，全网连通即胜利。</p></div>`;
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
  unmount() { controller.abort(); ctx = null; }
};

// 供浏览器回归测试使用（不影响游戏本身）。
export const __testing = {
  get values() { return values; },
  get solution() { return puzzle?.solution; },
  get won() { return won; }
};
