// 数墙（Nurikabe）：涂出连成一片的「海」，让每座岛的大小恰好等于数字。
// 规则：海全部连通、没有 2×2 的海块、每座岛恰好含一个数字且大小等于数字。
import { pop, enterBoard } from '../core/motion.js';
import { randomSeed, makeSeededRandom } from '../core/utils.js';
import { playSound } from '../core/sound.js';
import { generateNurikabe, checkNurikabe } from './new-puzzle-logic.js';

export { generateNurikabe, checkNurikabe };

const PRESETS = [7, 10];
const sizeCode = (n) => 700 + n;
const STATE_LABELS = ['未定', '海', '岛'];

let ctx, controller, n = PRESETS[0], puzzle, state, seed, won;

// 规则体检：海的连通分量（最大的一片是「主海」）、2×2 海块、每片岛的大小与数字
function analyze() {
  const clueByCell = new Map(puzzle.clues.map((clue) => [clue.cell, clue.size]));
  const neighbors = (i) => {
    const r = Math.floor(i / n), c = i % n;
    return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
      .filter(([nr, nc]) => nr >= 0 && nr < n && nc >= 0 && nc < n)
      .map(([nr, nc]) => nr * n + nc);
  };
  const componentsOf = (target) => {
    const comp = new Map();
    let count = 0;
    state.forEach((value, i) => {
      if (value !== target || comp.has(i)) return;
      const id = count++;
      const queue = [i];
      comp.set(i, id);
      while (queue.length) {
        neighbors(queue.pop()).forEach((next) => {
          if (state[next] === target && !comp.has(next)) { comp.set(next, id); queue.push(next); }
        });
      }
    });
    return { comp, count };
  };

  // 海：最大连通片为主海，其余是游离的碎海
  const sea = componentsOf(1);
  const sizes = new Map();
  sea.comp.forEach((id) => sizes.set(id, (sizes.get(id) || 0) + 1));
  let mainSea = -1, mainSize = 0;
  sizes.forEach((size, id) => { if (size > mainSize) { mainSize = size; mainSea = id; } });
  const straySea = new Set();
  sea.comp.forEach((id, i) => { if (id !== mainSea) straySea.add(i); });

  // 2×2 全是海即违规，四格都圈出来
  const blocked = new Set();
  for (let r = 0; r < n - 1; r += 1) {
    for (let c = 0; c < n - 1; c += 1) {
      const cells = [r * n + c, r * n + c + 1, (r + 1) * n + c, (r + 1) * n + c + 1];
      if (cells.every((i) => state[i] === 1)) cells.forEach((i) => blocked.add(i));
    }
  }

  // 岛：恰含一个数字且大小相等 → 完成；数字超出一个或大小超标 → 超限
  const island = componentsOf(2);
  const islandState = new Map();
  const visited = new Map();
  island.comp.forEach((id, i) => {
    if (islandState.has(i)) return;
    if (visited.has(id)) { islandState.set(i, visited.get(id)); return; }
    const cells = [];
    island.comp.forEach((cid, ci) => { if (cid === id) cells.push(ci); });
    const clues = cells.filter((cell) => clueByCell.has(cell));
    const status = clues.length === 1 && cells.length === clueByCell.get(clues[0]) ? 'complete'
      : clues.length > 1 || (clues.length === 1 && cells.length > clueByCell.get(clues[0])) ? 'overfull' : '';
    visited.set(id, status);
    islandState.set(i, status);
  });

  return { straySea, blocked, islandState };
}

function render(popCell = -1) {
  const board = ctx.els.gameRoot.querySelector('.nurikabe-grid');
  board.style.setProperty('--n', n);
  const clueByCell = new Map(puzzle.clues.map((clue) => [clue.cell, clue.size]));
  const { straySea, blocked, islandState } = analyze();
  board.innerHTML = state.map((value, i) => {
    const r = Math.floor(i / n), c = i % n;
    const clue = clueByCell.get(i);
    const classes = ['nurikabe-cell', value === 1 ? 'sea' : value === 2 ? 'island' : ''];
    if (clue != null) classes.push('clue');
    if (straySea.has(i)) classes.push('stray');
    if (blocked.has(i)) classes.push('blocked');
    const islandStatus = islandState.get(i);
    if (islandStatus) classes.push(islandStatus);
    const warnings = [straySea.has(i) ? '海未连通' : '', blocked.has(i) ? '形成 2×2 海块' : '', islandStatus === 'complete' ? '岛屿已完成' : '', islandStatus === 'overfull' ? '岛屿超限' : ''].filter(Boolean).join('，');
    const label = clue != null ? `数字 ${clue}，岛` : STATE_LABELS[value];
    const content = clue != null ? clue : value === 2 ? '·' : '';
    return `<button type="button" class="${classes.join(' ')}" data-cell="${i}" aria-label="第 ${r + 1} 行第 ${c + 1} 列，${label}${warnings ? `，${warnings}` : ''}，点击切换">${content}</button>`;
  }).join('');
  if (popCell >= 0 && board.children[popCell]) pop(board.children[popCell]);
  ctx.els.controlPanel.querySelector('#nurikabeDecided').textContent = `${state.filter((v) => v !== 0).length} / ${n * n}`;
}

function cycle(cell) {
  if (won) return;
  if (puzzle.clues.some((clue) => clue.cell === cell)) return; // 数字格固定为岛
  state[cell] = (state[cell] + 1) % 3;
  playSound(state[cell] === 1 ? 'fill' : 'mark');
  ctx.timer.start();
  ctx.setStatus('active');
  render(cell);
  if (checkNurikabe(puzzle, state)) {
    won = true;
    ctx.timer.stop();
    render();
    ctx.reportWin({
      summary: `你用 ${ctx.timerText()} 完成了 ${n} × ${n} 的数墙，海洋连成一片。`,
      score: { size: sizeCode(n), difficulty: n === PRESETS[0] ? 'easy' : 'normal', elapsedSeconds: Math.max(1, ctx.timer.elapsed()), puzzleId: seed % 10000, puzzleSeed: seed }
    });
  }
}

function newGame() {
  ctx.closeVictory();
  seed = randomSeed();
  const random = makeSeededRandom(seed);
  puzzle = generateNurikabe(n, random);
  if (!puzzle) puzzle = generateNurikabe(n, random); // 极低概率生成失败时重试
  state = Array(n * n).fill(0);
  puzzle.clues.forEach((clue) => { state[clue.cell] = 2; });
  won = false;
  ctx.timer.reset();
  ctx.setStatus('idle');
  ctx.setTitle(`${n} × ${n} · 涂海留岛`);
  ctx.setPuzzleNumber(seed % 10000);
  render();
  enterBoard(ctx.els.gameRoot);
}

export default {
  id: 'nurikabe', name: '数墙', icon: '▩', subtitle: 'NURIKABE',
  howToTitle: '涂出大海，留下小岛',
  howTo: '<p>点击格子在<strong>未定 → 海（深色）→ 岛（·）→ 未定</strong>之间切换，数字格固定属于岛。</p><p>规则：所有「海」必须<strong>连成一片</strong>；海的任何 2×2 区域不能全是海；每片岛必须<strong>恰好包含一个数字</strong>，且岛的格数等于该数字；不同的岛不能相邻。</p><p>每格都作出判断且全部满足规则时自动通关。</p>',
  sizes: PRESETS.map((v) => ({ value: sizeCode(v), label: `${v} × ${v}` })),
  difficulties: [{ value: 'easy', label: '入门' }, { value: 'normal', label: '进阶' }],
  getScoreFilter: () => ({ size: sizeCode(n), difficulty: n === PRESETS[0] ? 'easy' : 'normal' }),
  configure({ size } = {}) {
    if (!ctx || !size) return;
    const next = Number(size) - 700;
    if (!PRESETS.includes(next) || next === n) return;
    n = next;
    ctx.els.controlPanel.querySelectorAll('[data-size]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.size) === n)));
  },
  newGame,
  mount(context) {
    ctx = context;
    controller = new AbortController();
    const options = { signal: controller.signal };
    ctx.els.controlPanel.innerHTML = `<div class="eyebrow"><span></span> ISLAND PUZZLE</div><h1>海要相连，<br><em>岛各有其数。</em></h1><div class="field-group"><div class="field-label"><span>棋盘规格</span></div><div class="segmented" role="radiogroup" aria-label="棋盘规格">${PRESETS.map((v) => `<button type="button" role="radio" aria-checked="${n === v}" data-size="${v}">${v} × ${v}</button>`).join('')}</div></div><div class="tile-score"><span>已判断格数</span><strong id="nurikabeDecided" aria-live="polite">—</strong></div><button type="button" class="primary-button" data-action="new">↻ 生成新题目</button><div class="mini-guide"><span class="guide-icon">✦</span><p><strong>海连一片，无 2×2 海块。</strong><br>每片岛恰含一个数字，大小相等。</p></div>`;
    ctx.els.gameRoot.innerHTML = '<div class="nurikabe-grid" role="group" aria-label="数墙棋盘"></div>';
    ctx.els.boardToolbar.innerHTML = '<div class="board-actions"><button type="button" class="secondary-button" data-action="new">↻ 重新生成</button></div>';
    ctx.els.desktopTip.textContent = '点击格子切换：未定 → 海 → 岛 · 数字格固定为岛 · 全部判断正确即通关';
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
      if (cell) cycle(Number(cell.dataset.cell));
    }, options);
    newGame();
  },
  unmount() { controller.abort(); ctx = null; }
};
