// 数独：9 × 9，每行、每列、每个 3 × 3 宫填入 1–9 且不重复。
// 题目由种子确定性生成：先填出完整解，再在保证唯一解的前提下对称挖空。

import { makeSeededRandom, randomSeed, waitForNextFrame, selectOption, showToast, shuffle } from "../core/utils.js";

const difficultyConfig = {
  easy: { label: "简单", givens: 40, description: "给出 40 个数字，轻松上手" },
  normal: { label: "普通", givens: 32, description: "给出 32 个数字，需要推理" },
  hard: { label: "困难", givens: 26, description: "只给 26 个数字，烧脑挑战" }
};

const GRID_SIZE = 9;

const state = {
  difficulty: "easy",
  solution: null,   // 完整答案 9x9
  givens: null,     // boolean 9x9，是否为题目给出
  player: null,     // 0 表示空格
  selected: null,   // [row, col]
  history: [],
  completed: false,
  generating: false,
  generationRequestId: 0,
  puzzleId: 0,
  puzzleSeed: 0,
  active: false
};

let ctx = null;
let els = {};
const cleanups = [];

// ---------------------------------------------------------------------------
// 题目生成
// ---------------------------------------------------------------------------

function emptyGrid() {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
}

function isValidPlacement(grid, row, col, value) {
  for (let index = 0; index < GRID_SIZE; index += 1) {
    if (grid[row][index] === value || grid[index][col] === value) return false;
  }
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = boxRow; r < boxRow + 3; r += 1) {
    for (let c = boxCol; c < boxCol + 3; c += 1) {
      if (grid[r][c] === value) return false;
    }
  }
  return true;
}

function findEmptyCell(grid) {
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      if (grid[row][col] === 0) return [row, col];
    }
  }
  return null;
}

function fillGrid(grid, random) {
  const empty = findEmptyCell(grid);
  if (!empty) return true;
  const [row, col] = empty;
  const numbers = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], random);
  for (const value of numbers) {
    if (!isValidPlacement(grid, row, col, value)) continue;
    grid[row][col] = value;
    if (fillGrid(grid, random)) return true;
    grid[row][col] = 0;
  }
  return false;
}

function countSolutions(grid, limit = 2) {
  let count = 0;

  function search() {
    if (count >= limit) return;
    const empty = findEmptyCell(grid);
    if (!empty) {
      count += 1;
      return;
    }
    const [row, col] = empty;
    for (let value = 1; value <= 9; value += 1) {
      if (!isValidPlacement(grid, row, col, value)) continue;
      grid[row][col] = value;
      search();
      grid[row][col] = 0;
      if (count >= limit) return;
    }
  }

  search();
  return count;
}

// 在保证唯一解的前提下，中心对称地挖空到目标提示数。
async function digHoles(solution, givensTarget, random, requestId) {
  const puzzle = solution.map((row) => [...row]);
  let remaining = GRID_SIZE * GRID_SIZE;

  // 中心对称的格子对，随机顺序处理。
  const pairs = [];
  const seen = new Set();
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      const key = row * GRID_SIZE + col;
      const mirrorKey = (GRID_SIZE - 1 - row) * GRID_SIZE + (GRID_SIZE - 1 - col);
      if (seen.has(key) || seen.has(mirrorKey)) continue;
      seen.add(key);
      seen.add(mirrorKey);
      pairs.push(key === mirrorKey ? [[row, col]] : [[row, col], [GRID_SIZE - 1 - row, GRID_SIZE - 1 - col]]);
    }
  }
  shuffle(pairs, random);

  let processed = 0;
  for (const pair of pairs) {
    if (remaining - pair.length < givensTarget) continue;
    if (requestId !== state.generationRequestId) return null;

    const backup = pair.map(([row, col]) => puzzle[row][col]);
    pair.forEach(([row, col]) => { puzzle[row][col] = 0; });

    if (countSolutions(puzzle.map((row) => [...row])) === 1) {
      remaining -= pair.length;
    } else {
      pair.forEach(([row, col], index) => { puzzle[row][col] = backup[index]; });
    }

    processed += 1;
    if (processed % 6 === 0) await waitForNextFrame();
  }

  return puzzle;
}

async function generatePuzzle(requestId) {
  const seed = randomSeed();
  const random = makeSeededRandom(seed);
  const solution = emptyGrid();
  fillGrid(solution, random);
  const givensTarget = difficultyConfig[state.difficulty].givens;
  const puzzle = await digHoles(solution, givensTarget, random, requestId);
  if (!puzzle) return null;
  return { solution, puzzle, seed };
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

function renderGrid() {
  if (!state.active || !state.player) return;
  const grid = els.grid;
  grid.innerHTML = "";

  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "sudoku-cell";
      if ((col + 1) % 3 === 0 && col !== GRID_SIZE - 1) cell.classList.add("box-right");
      if ((row + 1) % 3 === 0 && row !== GRID_SIZE - 1) cell.classList.add("box-bottom");
      cell.dataset.row = row;
      cell.dataset.col = col;
      grid.appendChild(cell);
    }
  }

  renderPlayerState();
}

function renderPlayerState() {
  const selectedValue = state.selected ? state.player[state.selected[0]][state.selected[1]] : 0;

  els.grid.querySelectorAll(".sudoku-cell").forEach((cell) => {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    const value = state.player[row][col];
    const given = state.givens[row][col];
    const isSelected = state.selected && state.selected[0] === row && state.selected[1] === col;
    const sameValue = value !== 0 && selectedValue !== 0 && value === selectedValue;
    const related = state.selected
      && (state.selected[0] === row || state.selected[1] === col
        || (Math.floor(state.selected[0] / 3) === Math.floor(row / 3) && Math.floor(state.selected[1] / 3) === Math.floor(col / 3)));

    cell.classList.toggle("given", given);
    cell.classList.toggle("selected", Boolean(isSelected));
    cell.classList.toggle("related", Boolean(related) && !isSelected);
    cell.classList.toggle("same-value", Boolean(sameValue) && !isSelected);
    cell.textContent = value === 0 ? "" : String(value);
    cell.setAttribute("aria-label", `第 ${row + 1} 行，第 ${col + 1} 列，${value === 0 ? "空白" : `数字 ${value}${given ? "，题目给出" : ""}`}`);
  });

  els.undoButton.disabled = state.history.length === 0;
}

// ---------------------------------------------------------------------------
// 交互
// ---------------------------------------------------------------------------

function pushHistory() {
  state.history.push(state.player.map((row) => [...row]));
  if (state.history.length > 100) state.history.shift();
}

function undo() {
  const previous = state.history.pop();
  if (!previous) return;
  state.player = previous.map((row) => [...row]);
  state.completed = false;
  ctx.closeVictory();
  ctx.setStatus("active");
  renderPlayerState();
  showToast("已撤回上一步");
}

function enterValue(value) {
  if (state.completed || state.generating || !state.selected) return;
  const [row, col] = state.selected;
  if (state.givens[row][col]) {
    showToast("题目给出的数字不能修改");
    return;
  }
  if (state.player[row][col] === value) return;
  ctx.timer.start();
  pushHistory();
  state.player[row][col] = value;
  ctx.setStatus("active");
  renderPlayerState();
}

function selectCell(row, col) {
  state.selected = [row, col];
  renderPlayerState();
}

function moveSelection(deltaRow, deltaCol) {
  if (!state.selected) {
    selectCell(0, 0);
    return;
  }
  const row = (state.selected[0] + deltaRow + GRID_SIZE) % GRID_SIZE;
  const col = (state.selected[1] + deltaCol + GRID_SIZE) % GRID_SIZE;
  selectCell(row, col);
}

function submitPuzzle() {
  if (state.generating) {
    showToast("题目正在生成，请稍等一下");
    return false;
  }
  const complete = state.player.every((row) => row.every((value) => value !== 0));
  if (!complete) {
    ctx.setStatus("incorrect");
    showToast("还有空格没填，继续加油");
    return false;
  }
  const correct = state.player.every((row, rowIndex) => row.every((value, colIndex) => value === state.solution[rowIndex][colIndex]));
  if (!correct) {
    ctx.setStatus("incorrect");
    showToast("答案还不正确，检查一下重复的数字");
    return false;
  }
  state.completed = true;
  ctx.timer.stop();
  ctx.setStatus("correct");
  const config = difficultyConfig[state.difficulty];
  ctx.reportWin({
    summary: `你用 ${ctx.timerText()} 完成了这道 ${config.label} 难度数独。`,
    score: {
      size: GRID_SIZE,
      difficulty: state.difficulty,
      elapsedSeconds: Math.max(1, ctx.timer.elapsed()),
      puzzleId: state.puzzleId,
      puzzleSeed: state.puzzleSeed
    }
  });
  return true;
}

async function newGame() {
  const requestId = ++state.generationRequestId;
  state.generating = true;
  ctx.timer.reset();
  ctx.setTitle("9 × 9 · 正在生成…");
  ctx.setStatus("generating");
  els.newGameButton.setAttribute("aria-busy", "true");
  await waitForNextFrame();

  const generated = await generatePuzzle(requestId);
  if (!generated || requestId !== state.generationRequestId || !state.active) return false;

  state.solution = generated.solution;
  state.givens = generated.puzzle.map((row) => row.map((value) => value !== 0));
  state.player = generated.puzzle.map((row) => [...row]);
  state.selected = null;
  state.history = [];
  state.completed = false;
  state.generating = false;
  state.puzzleSeed = generated.seed >>> 0;
  state.puzzleId = Math.abs(generated.seed % 10000);
  ctx.setTitle(`9 × 9 · ${difficultyConfig[state.difficulty].label}`);
  ctx.setPuzzleNumber(state.puzzleId);
  renderGrid();
  ctx.setStatus("idle");
  els.newGameButton.removeAttribute("aria-busy");
  return true;
}

// ---------------------------------------------------------------------------
// 挂载 / 卸载
// ---------------------------------------------------------------------------

function mountControlPanel() {
  ctx.els.controlPanel.innerHTML = `
    <div class="eyebrow"><span></span> PUZZLE SETUP</div>
    <h1>九个数字，<br /><em>能难倒你吗？</em></h1>

    <div class="field-group">
      <div class="field-label"><span>难度</span><output id="sudokuDifficultyDescription">${difficultyConfig[state.difficulty].description}</output></div>
      <div class="segmented" id="sudokuDifficultyPicker" role="radiogroup" aria-label="选择难度">
        ${Object.entries(difficultyConfig).map(([value, config]) =>
          `<button type="button" role="radio" aria-checked="${value === state.difficulty}" data-difficulty="${value}">${config.label}</button>`
        ).join("")}
      </div>
    </div>

    <button class="primary-button" id="sudokuNewGameButton" type="button">
      <span class="button-icon" aria-hidden="true">↻</span>
      生成新题目
    </button>

    <div class="mini-guide">
      <span class="guide-icon" aria-hidden="true">✦</span>
      <p><strong>每行、每列、每个粗线宫都要凑齐 1–9。</strong><br />题目保证只有一个正确解。</p>
    </div>
  `;

  ctx.els.controlPanel.querySelector("#sudokuDifficultyPicker").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-difficulty]");
    if (!button) return;
    state.difficulty = button.dataset.difficulty;
    selectOption(event.currentTarget, button);
    ctx.els.controlPanel.querySelector("#sudokuDifficultyDescription").textContent = difficultyConfig[state.difficulty].description;
    newGame();
  });

  els.newGameButton = ctx.els.controlPanel.querySelector("#sudokuNewGameButton");
  els.newGameButton.addEventListener("click", () => { newGame(); });
}

function mountToolbar() {
  ctx.els.boardToolbar.innerHTML = `
    <div class="number-pad" role="group" aria-label="数字输入">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((value) =>
        `<button type="button" data-number="${value}">${value}</button>`
      ).join("")}
      <button type="button" class="erase-key" data-number="0" aria-label="擦除">⌫</button>
    </div>
    <div class="board-actions">
      <button class="undo-button" id="sudokuUndoButton" type="button" disabled aria-label="撤回上一步">
        <span aria-hidden="true">↶</span> 撤回
      </button>
      <button class="submit-button" id="sudokuSubmitButton" type="button">提交答案</button>
    </div>
  `;
  ctx.els.desktopTip.textContent = "点击格子后输入数字 · 方向键移动选择 · Delete 擦除 · ⌘/Ctrl + Z 撤回";

  ctx.els.boardToolbar.querySelector(".number-pad").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-number]");
    if (!button) return;
    enterValue(Number(button.dataset.number));
  });

  els.undoButton = ctx.els.boardToolbar.querySelector("#sudokuUndoButton");
  els.undoButton.addEventListener("click", undo);
  ctx.els.boardToolbar.querySelector("#sudokuSubmitButton").addEventListener("click", submitPuzzle);
}

function mountBoard() {
  ctx.els.gameRoot.innerHTML = `<div class="sudoku-grid" aria-label="数独棋盘"></div>`;
  els.grid = ctx.els.gameRoot.querySelector(".sudoku-grid");

  els.grid.addEventListener("click", (event) => {
    const cell = event.target.closest(".sudoku-cell");
    if (!cell || state.completed || state.generating) return;
    selectCell(Number(cell.dataset.row), Number(cell.dataset.col));
  });

  const onKeydown = (event) => {
    if (!state.active || state.completed || state.generating) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
      event.preventDefault();
      undo();
      return;
    }
    if (/^[1-9]$/.test(event.key)) {
      event.preventDefault();
      enterValue(Number(event.key));
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") {
      event.preventDefault();
      enterValue(0);
      return;
    }
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (moves[event.key]) {
      event.preventDefault();
      moveSelection(...moves[event.key]);
    }
  };
  window.addEventListener("keydown", onKeydown);
  cleanups.push(() => window.removeEventListener("keydown", onKeydown));
}

// ---------------------------------------------------------------------------
// 游戏定义
// ---------------------------------------------------------------------------

export default {
  id: "sudoku",
  name: "数独",
  subtitle: "SUDOKU",
  howToTitle: "每行每列，不重复",
  howTo: `
    <p>把 1–9 填进所有空格，让<strong>每一行、每一列、每个 3 × 3 粗线宫</strong>里的数字都不重复。</p>
    <p>点击一个空格，再用下方数字键盘（或电脑键盘）输入数字；按 ⌫ 或 Delete 可以擦掉自己填的数字，灰色题目数字不能修改。</p>
    <p>作答过程中不会提示对错。填完整张棋盘后点击“提交答案”一次检查。</p>
  `,
  sizes: [{ value: 9, label: "9 × 9" }],
  difficulties: [
    { value: "easy", label: "简单" },
    { value: "normal", label: "普通" },
    { value: "hard", label: "困难" }
  ],

  getScoreFilter() {
    return { size: GRID_SIZE, difficulty: state.difficulty };
  },

  newGame,

  mount(context) {
    ctx = context;
    state.active = true;
    mountControlPanel();
    mountToolbar();
    mountBoard();
    newGame();
  },

  unmount() {
    state.active = false;
    state.generationRequestId += 1;
    state.generating = false;
    state.selected = null;
    cleanups.splice(0).forEach((cleanup) => cleanup());
    els = {};
    ctx = null;
  }
};
