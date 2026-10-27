// 点灯（Akari）：在白色格放灯，照亮整个棋盘。
// 灯会照亮同行同列直到黑格；任意两盏灯不能互相照亮；数字黑格周围必须恰好有对应数量的灯。
import { pop, cancelMotion, enterBoard } from '../core/motion.js';
import { updateBoard } from '../core/board-view.js';
import { randomSeed, makeSeededRandom } from '../core/utils.js';
import { playSound } from '../core/sound.js';
import { generateAkari, checkAkari, analyzeAkari } from './new-puzzle-logic.js';

export { generateAkari, checkAkari, analyzeAkari };

const PRESETS = [7, 10];
const sizeCode = (n) => 600 + n;

let ctx, controller, n = PRESETS[0], puzzle, lights, marks, seed, won, markMode;

function render(popCell = -1) {
  const board = ctx.els.gameRoot.querySelector('.akari-grid');
  board.style.setProperty('--n', n);
  const { lit, conflicts, clueSatisfied } = analyzeAkari(puzzle, lights);
  updateBoard(board, puzzle.cells.map((value, i) => {
    const r = Math.floor(i / n), c = i % n;
    const pos = `第 ${r + 1} 行第 ${c + 1} 列`;
    if (value !== null) {
      const clue = value === -1 ? '' : value;
      const state = clueSatisfied[i] === null ? '' : clueSatisfied[i] ? ' satisfied' : '';
      return `<span class="akari-cell black${state}" data-clue-cell="${i}" aria-label="${pos}，黑格${value >= 0 ? `，数字 ${value}` : ''}">${clue}</span>`;
    }
    const classes = ['akari-cell'];
    if (lit.has(i)) classes.push('lit');
    if (lights.has(i)) classes.push('light');
    if (conflicts.has(i)) classes.push('conflict');
    if (marks.has(i)) classes.push('marked');
    const content = lights.has(i) ? '<svg class="akari-bulb" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 15a6 6 0 1 1 8 0l-1 3H9z"/><path d="M9 21h6M12 1v2M2 10h2M20 10h2M4 3l2 2M18 5l2-2"/></svg>' : marks.has(i) ? '·' : '';
    const label = lights.has(i) ? '有灯' : marks.has(i) ? '已标记' : lit.has(i) ? '已被照亮' : '未被照亮';
    return `<button type="button" class="${classes.join(' ')}" data-cell="${i}" aria-label="${pos}，${label}" aria-pressed="${lights.has(i)}">${content}</button>`;
  }).join(''), { origin: popCell, columns: n, spread: 'lit' });
  if (popCell >= 0 && board.children[popCell] && !conflicts.has(popCell)) pop(board.children[popCell]);
  const remaining = puzzle.cells.filter((v, i) => v === null && !lit.has(i)).length;
  ctx.els.controlPanel.querySelector('#akariRemaining').textContent = remaining;
}

function toggle(cell, mark = false) {
  if (won || puzzle.cells[cell] !== null) return;
  if (mark) {
    if (lights.has(cell)) return;
    marks.has(cell) ? marks.delete(cell) : marks.add(cell);
    playSound('mark');
    render(cell);
    return;
  }
  if (lights.has(cell)) lights.delete(cell);
  else { lights.add(cell); marks.delete(cell); }
  playSound(lights.has(cell) ? 'fill' : 'mark');
  ctx.timer.start();
  ctx.setStatus('active');
  render(cell);
  const { lit, conflicts } = analyzeAkari(puzzle, lights);
  const allLit = puzzle.cells.every((v, i) => v !== null || lit.has(i));
  if (allLit && !conflicts.size && checkAkari(puzzle, lights)) {
    won = true;
    ctx.timer.stop();
    render();
    ctx.reportWin({
      summary: `你用 ${ctx.timerText()} 点亮了 ${n} × ${n} 的整个棋盘，共放置 ${lights.size} 盏灯。`,
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
  puzzle = generateAkari(n, random);
  lights = new Set();
  marks = new Set();
  won = false;
  markMode = false;
  ctx.els.boardToolbar.querySelectorAll('[data-mode]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === 'light')));
  ctx.timer.reset();
  ctx.setStatus('idle');
  ctx.setTitle(`${n} × ${n} · 点亮棋盘`);
  ctx.setPuzzleNumber(seed % 10000);
  render();
  enterBoard(ctx.els.gameRoot);
}

export default {
  id: 'akari', name: '点灯', icon: '💡', subtitle: 'AKARI',
  howToTitle: '放置灯光，照亮一切',
  howTo: '<p>点击白色格放置 / 移除<strong>灯</strong>。灯会照亮所在的整行整列，直到被黑格挡住。</p><p>规则有三条：任意两盏灯<strong>不能互相照亮</strong>；带数字的黑格，上下左右必须<strong>恰好</strong>有对应数量的灯；所有白色格都要被照亮。</p><p>右键或「标记」模式可以给格子打 · 做备忘。全部照亮且没有冲突时自动通关。</p>',
  sizes: PRESETS.map((v) => ({ value: sizeCode(v), label: `${v} × ${v}` })),
  difficulties: [{ value: 'easy', label: '入门' }, { value: 'normal', label: '进阶' }],
  getScoreFilter: () => ({ size: sizeCode(n), difficulty: n === PRESETS[0] ? 'easy' : 'normal' }),
  configure({ size } = {}) {
    if (!ctx || !size) return;
    const next = Number(size) - 600;
    if (!PRESETS.includes(next) || next === n) return;
    n = next;
    ctx.els.controlPanel.querySelectorAll('[data-size]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.size) === n)));
  },
  newGame,
  mount(context) {
    ctx = context;
    controller = new AbortController();
    const options = { signal: controller.signal };
    markMode = false;
    ctx.els.controlPanel.innerHTML = `<div class="eyebrow"><span></span> LIGHT PUZZLE</div><h1>以一灯之明，<br><em>照亮整张棋盘。</em></h1><div class="field-group"><div class="field-label"><span>棋盘规格</span></div><div class="segmented" role="radiogroup" aria-label="棋盘规格">${PRESETS.map((v) => `<button type="button" role="radio" aria-checked="${n === v}" data-size="${v}">${v} × ${v}</button>`).join('')}</div></div><div class="tile-score"><span>未照亮格数</span><strong id="akariRemaining" aria-live="polite">—</strong></div><button type="button" class="primary-button" data-action="new">↻ 生成新题目</button><div class="mini-guide"><span class="guide-icon">✦</span><p><strong>灯不照灯，格格皆明。</strong><br>数字黑格周围的灯数必须恰好。</p></div>`;
    ctx.els.gameRoot.innerHTML = '<div class="akari-grid" role="group" aria-label="点灯棋盘"></div>';
    ctx.els.boardToolbar.innerHTML = '<div class="tool-switch" aria-label="操作方式"><button type="button" data-mode="light" aria-pressed="true">💡 放灯</button><button type="button" data-mode="mark" aria-pressed="false">· 标记</button></div><div class="board-actions"><button type="button" class="secondary-button" data-action="new">↻ 重新生成</button></div>';
    ctx.els.desktopTip.textContent = '点击白格放灯 · 右键 / 标记模式打 · 备忘 · 全部照亮即通关';
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
      const mode = e.target.closest('[data-mode]');
      if (mode) {
        markMode = mode.dataset.mode === 'mark';
        ctx.els.boardToolbar.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b === mode)));
      }
      if (e.target.closest('[data-action="new"]')) newGame();
    }, options);
    ctx.els.gameRoot.addEventListener('click', (e) => {
      const cell = e.target.closest('[data-cell]');
      if (cell) toggle(Number(cell.dataset.cell), markMode);
    }, options);
    ctx.els.gameRoot.addEventListener('contextmenu', (e) => {
      const cell = e.target.closest('[data-cell]');
      if (cell) { e.preventDefault(); toggle(Number(cell.dataset.cell), true); }
    }, options);
    newGame();
  },
  unmount() { controller.abort(); cancelMotion(ctx.els.gameRoot); cancelMotion(ctx.els.controlPanel); ctx = null; }
};
