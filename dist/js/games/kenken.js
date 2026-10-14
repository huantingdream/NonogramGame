// 聪明格（KenKen）：填 1..N 使每行每列不重复，且每个粗线笼满足左上角的算式。
import { pop, enterBoard } from '../core/motion.js';
import { randomSeed, makeSeededRandom } from '../core/utils.js';
import { playSound } from '../core/sound.js';
import { generateLatin, generateKenken, checkKenken } from './new-puzzle-logic.js';

export { generateLatin, generateKenken, checkKenken };

const OP_SYMBOLS = { eq: '', add: '+', sub: '−', mul: '×', div: '÷' };
const PRESETS = [4, 6];
const sizeCode = (n) => 800 + n;

let ctx, controller, n = PRESETS[1], puzzle, grid, selected, seed, won;

function render(popCell = -1) {
  const board = ctx.els.gameRoot.querySelector('.kenken-grid');
  board.style.setProperty('--n', n);
  const cageOf = Array(n * n);
  puzzle.cages.forEach((cage, id) => cage.cells.forEach((cell) => { cageOf[cell] = id; }));
  const labelCell = new Map(puzzle.cages.map((cage) => [Math.min(...cage.cells), cage]));
  board.innerHTML = grid.map((value, i) => {
    const r = Math.floor(i / n), c = i % n;
    const borders = [
      r === 0 || cageOf[i - n] !== cageOf[i] ? 'cage-top' : '',
      c === n - 1 || cageOf[i + 1] !== cageOf[i] ? 'cage-right' : '',
      r === n - 1 || cageOf[i + n] !== cageOf[i] ? 'cage-bottom' : '',
      c === 0 || cageOf[i - 1] !== cageOf[i] ? 'cage-left' : ''
    ].filter(Boolean).join(' ');
    const cage = labelCell.get(i);
    const label = cage ? `<span class="cage-label">${cage.target}${OP_SYMBOLS[cage.op]}</span>` : '';
    const classes = ['kenken-cell', borders, i === selected ? 'selected' : ''].filter(Boolean).join(' ');
    return `<button type="button" class="${classes}" data-cell="${i}" aria-label="第 ${r + 1} 行第 ${c + 1} 列，${value ? `已填 ${value}` : '空格'}${cage ? `，笼子算式 ${cage.target}${OP_SYMBOLS[cage.op]}` : ''}">${label}<span class="kenken-value">${value || ''}</span></button>`;
  }).join('');
  if (popCell >= 0 && board.children[popCell]) pop(board.children[popCell]);
  ctx.els.controlPanel.querySelector('#kenkenFilled').textContent = `${grid.filter(Boolean).length} / ${n * n}`;
}

function fill(value) {
  if (won || selected == null) return;
  grid[selected] = value;
  playSound(value ? 'fill' : 'mark');
  ctx.timer.start();
  ctx.setStatus('active');
  render(selected);
  if (value && grid.every(Boolean) && checkKenken(n, puzzle.cages, grid)) {
    won = true;
    ctx.timer.stop();
    render();
    ctx.reportWin({
      summary: `你用 ${ctx.timerText()} 完成了 ${n} × ${n} 的聪明格。`,
      score: { size: sizeCode(n), difficulty: n === PRESETS[0] ? 'easy' : 'normal', elapsedSeconds: Math.max(1, ctx.timer.elapsed()), puzzleId: seed % 10000, puzzleSeed: seed }
    });
  }
}

function newGame() {
  ctx.closeVictory();
  seed = randomSeed();
  const random = makeSeededRandom(seed);
  puzzle = generateKenken(n, random);
  grid = Array(n * n).fill(0);
  selected = null;
  won = false;
  ctx.timer.reset();
  ctx.setStatus('idle');
  ctx.setTitle(`${n} × ${n} · 聪明格`);
  ctx.setPuzzleNumber(seed % 10000);
  render();
  enterBoard(ctx.els.gameRoot);
}

export default {
  id: 'kenken', name: '聪明格', icon: '⊞', subtitle: 'KENKEN',
  howToTitle: '行列不重，笼中成算',
  howTo: `<p>在格子里填 1 到 N（N 为棋盘边长），让<strong>每行每列的数字都不重复</strong>。</p><p>粗线围成的「笼子」左上角有算式：笼内数字通过该运算必须得到目标数。例如 <strong>6×</strong> 表示笼内数字相乘等于 6，<strong>2÷</strong> 表示两数相除等于 2，单个数字表示该格就是它。</p><p>点击格子选中后，用下方数字键盘或电脑键盘输入；⌫ / Delete 清除。全部填对自动通关。</p>`,
  sizes: PRESETS.map((v) => ({ value: sizeCode(v), label: `${v} × ${v}` })),
  difficulties: [{ value: 'easy', label: '入门' }, { value: 'normal', label: '进阶' }],
  getScoreFilter: () => ({ size: sizeCode(n), difficulty: n === PRESETS[0] ? 'easy' : 'normal' }),
  configure({ size } = {}) {
    if (!ctx || !size) return;
    const next = Number(size) - 800;
    if (!PRESETS.includes(next) || next === n) return;
    n = next;
    ctx.els.controlPanel.querySelectorAll('[data-size]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.size) === n)));
  },
  newGame,
  mount(context) {
    ctx = context;
    controller = new AbortController();
    const options = { signal: controller.signal };
    ctx.els.controlPanel.innerHTML = `<div class="eyebrow"><span></span> MATH PUZZLE</div><h1>数字入笼，<br><em>行列井然有序。</em></h1><div class="field-group"><div class="field-label"><span>棋盘规格</span></div><div class="segmented" role="radiogroup" aria-label="棋盘规格">${PRESETS.map((v) => `<button type="button" role="radio" aria-checked="${n === v}" data-size="${v}">${v} × ${v}</button>`).join('')}</div></div><div class="tile-score"><span>已填格数</span><strong id="kenkenFilled" aria-live="polite">—</strong></div><button type="button" class="primary-button" data-action="new">↻ 生成新题目</button><div class="mini-guide"><span class="guide-icon">✦</span><p><strong>每行每列，1 到 N 不重复。</strong><br>笼内数字要满足左上角算式。</p></div>`;
    ctx.els.gameRoot.innerHTML = '<div class="kenken-grid" role="group" aria-label="聪明格棋盘"></div>';
    ctx.els.boardToolbar.innerHTML = `<div class="number-pad kenken-pad" aria-label="数字键盘">${Array.from({ length: n }, (_, i) => `<button type="button" data-value="${i + 1}">${i + 1}</button>`).join('')}<button type="button" data-value="0" aria-label="清除">⌫</button></div>`;
    ctx.els.desktopTip.textContent = '点击格子选中 · 数字键 1-9 填入 · ⌫ 清除 · 填满且全部满足即通关';
    ctx.els.controlPanel.addEventListener('click', (e) => {
      const size = e.target.closest('[data-size]');
      if (size) {
        n = Number(size.dataset.size);
        ctx.els.controlPanel.querySelectorAll('[data-size]').forEach((b) => b.setAttribute('aria-checked', String(b === size)));
        newGame();
        ctx.els.boardToolbar.innerHTML = `<div class="number-pad kenken-pad" aria-label="数字键盘">${Array.from({ length: n }, (_, i) => `<button type="button" data-value="${i + 1}">${i + 1}</button>`).join('')}<button type="button" data-value="0" aria-label="清除">⌫</button></div>`;
      }
      if (e.target.closest('[data-action="new"]')) newGame();
    }, options);
    ctx.els.boardToolbar.addEventListener('click', (e) => {
      const button = e.target.closest('[data-value]');
      if (button) fill(Number(button.dataset.value));
    }, options);
    ctx.els.gameRoot.addEventListener('click', (e) => {
      const cell = e.target.closest('[data-cell]');
      if (cell) { selected = Number(cell.dataset.cell); playSound('click'); render(); }
    }, options);
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input, select, textarea') || document.querySelector('dialog[open]')) return;
      if (/^[1-9]$/.test(e.key) && Number(e.key) <= n) { e.preventDefault(); fill(Number(e.key)); }
      else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); fill(0); }
    }, options);
    newGame();
  },
  unmount() { controller.abort(); ctx = null; }
};
