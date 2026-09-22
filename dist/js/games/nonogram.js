import { pop, enterBoard } from '../core/motion.js';
// 数织 Nonogram：根据行列数字线索填出隐藏图案。
// 题目由种子确定性生成，并验证只有一个正确解。

import { makeSeededRandom, randomSeed, waitForNextFrame, selectOption, showToast } from "../core/utils.js";

const difficultyConfig = {
  easy: { label: "简单", density: 0.47, symmetry: true, hints: 3, description: "适合热身，赠送 3 格提示" },
  normal: { label: "普通", density: 0.5, symmetry: false, hints: 1, description: "稍有挑战，赠送 1 格提示" },
  hard: { label: "困难", density: 0.54, symmetry: false, hints: 0, description: "只给线索，不提供起始提示" }
};

const sizeDescriptions = {
  5: "5 × 5 · 快速一局",
  10: "10 × 10 · 经典尺寸",
  15: "15 × 15 · 沉浸挑战"
};

const state = {
  size: 5,
  difficulty: "easy",
  tool: "fill",
  solution: [],
  player: [],
  history: [],
  completed: false,
  generating: false,
  generationRequestId: 0,
  puzzleId: 0,
  puzzleSeed: 0,
  isPointerDown: false,
  dragValue: null,
  active: false
};

let ctx = null;
let els = {};
const cleanups = [];

// ---------------------------------------------------------------------------
// 题目生成与唯一解验证
// ---------------------------------------------------------------------------

function getClues(line) {
  const clues = [];
  let run = 0;
  line.forEach((cell) => {
    if (cell) run += 1;
    if (!cell && run) { clues.push(run); run = 0; }
  });
  if (run) clues.push(run);
  return clues.length ? clues : [0];
}

function generateLinePatterns(length, rawClues) {
  const clues = rawClues.length === 1 && rawClues[0] === 0 ? [] : rawClues;
  if (clues.length === 0) return [0];

  const patterns = [];
  const remainingLengths = clues.map((_, index) => {
    const blocks = clues.slice(index + 1).reduce((total, clue) => total + clue, 0);
    const separators = Math.max(clues.length - index - 1, 0);
    return blocks + separators;
  });

  function placeBlock(blockIndex, start, mask) {
    if (blockIndex === clues.length) {
      patterns.push(mask);
      return;
    }
    const blockLength = clues[blockIndex];
    const lastStart = length - blockLength - remainingLengths[blockIndex];
    for (let position = start; position <= lastStart; position += 1) {
      const blockMask = ((1 << blockLength) - 1) << position;
      placeBlock(blockIndex + 1, position + blockLength + 1, mask | blockMask);
    }
  }

  placeBlock(0, 0, 0);
  return patterns;
}

function patternMatchesLine(pattern, line) {
  return line.every((cell, index) => cell === -1 || cell === ((pattern >> index) & 1));
}

function propagatePuzzle(cells, rowCandidates, colCandidates) {
  const size = cells.length;
  const fullMask = (1 << size) - 1;
  let changed = true;

  const setCell = (row, col, value) => {
    if (cells[row][col] !== -1 && cells[row][col] !== value) return false;
    if (cells[row][col] === -1) {
      cells[row][col] = value;
      changed = true;
    }
    return true;
  };

  while (changed) {
    changed = false;

    for (let row = 0; row < size; row += 1) {
      rowCandidates[row] = rowCandidates[row].filter((pattern) => patternMatchesLine(pattern, cells[row]));
      if (rowCandidates[row].length === 0) return false;

      let alwaysFilled = fullMask;
      let sometimesFilled = 0;
      rowCandidates[row].forEach((pattern) => {
        alwaysFilled &= pattern;
        sometimesFilled |= pattern;
      });

      for (let col = 0; col < size; col += 1) {
        const bit = 1 << col;
        if ((alwaysFilled & bit) !== 0 && !setCell(row, col, 1)) return false;
        if ((sometimesFilled & bit) === 0 && !setCell(row, col, 0)) return false;
      }
    }

    for (let col = 0; col < size; col += 1) {
      const column = cells.map((row) => row[col]);
      colCandidates[col] = colCandidates[col].filter((pattern) => patternMatchesLine(pattern, column));
      if (colCandidates[col].length === 0) return false;

      let alwaysFilled = fullMask;
      let sometimesFilled = 0;
      colCandidates[col].forEach((pattern) => {
        alwaysFilled &= pattern;
        sometimesFilled |= pattern;
      });

      for (let row = 0; row < size; row += 1) {
        const bit = 1 << row;
        if ((alwaysFilled & bit) !== 0 && !setCell(row, col, 1)) return false;
        if ((sometimesFilled & bit) === 0 && !setCell(row, col, 0)) return false;
      }
    }
  }

  return true;
}

function countPuzzleSolutions(solution, limit = 2, nodeLimit = 8000) {
  const size = solution.length;
  const rowClues = solution.map(getClues);
  const colClues = Array.from({ length: size }, (_, col) => getClues(solution.map((row) => row[col])));
  const initialRows = rowClues.map((clues) => generateLinePatterns(size, clues));
  const initialCols = colClues.map((clues) => generateLinePatterns(size, clues));
  const initialCells = Array.from({ length: size }, () => Array(size).fill(-1));
  let visitedNodes = 0;

  function search(cells, rowCandidates, colCandidates) {
    visitedNodes += 1;
    // 代价过高的题目视为非唯一解，直接弃用。
    if (visitedNodes > nodeLimit) return limit;
    if (!propagatePuzzle(cells, rowCandidates, colCandidates)) return 0;

    let branchType = null;
    let branchIndex = -1;
    let branchPatterns = null;

    rowCandidates.forEach((patterns, index) => {
      if (patterns.length > 1 && (!branchPatterns || patterns.length < branchPatterns.length)) {
        branchType = "row";
        branchIndex = index;
        branchPatterns = patterns;
      }
    });
    colCandidates.forEach((patterns, index) => {
      if (patterns.length > 1 && (!branchPatterns || patterns.length < branchPatterns.length)) {
        branchType = "col";
        branchIndex = index;
        branchPatterns = patterns;
      }
    });

    if (!branchPatterns) return 1;

    let total = 0;
    for (const pattern of branchPatterns) {
      const nextCells = cells.map((row) => [...row]);
      const nextRows = rowCandidates.map((patterns) => [...patterns]);
      const nextCols = colCandidates.map((patterns) => [...patterns]);

      if (branchType === "row") {
        for (let col = 0; col < size; col += 1) nextCells[branchIndex][col] = (pattern >> col) & 1;
        nextRows[branchIndex] = [pattern];
      } else {
        for (let row = 0; row < size; row += 1) nextCells[row][branchIndex] = (pattern >> row) & 1;
        nextCols[branchIndex] = [pattern];
      }

      total += search(nextCells, nextRows, nextCols);
      if (total >= limit) return limit;
    }

    return total;
  }

  return search(initialCells, initialRows, initialCols);
}

function buildCandidateSolution(size, config, seed) {
  const random = makeSeededRandom(seed);
  const solution = Array.from({ length: size }, () => Array(size).fill(false));
  const center = (size - 1) / 2;

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const distance = Math.hypot(row - center, col - center) / Math.max(center, 1);
      const edgePenalty = distance > 1 ? 0.14 : 0;
      const value = random() < config.density - edgePenalty;
      solution[row][col] = value;
      if (config.symmetry) solution[row][size - 1 - col] = value;
    }
  }

  // 避免全空或全满的无聊行列。
  for (let index = 0; index < size; index += 1) {
    if (solution[index].every(Boolean)) solution[index][Math.floor(random() * size)] = false;
    if (solution[index].every((cell) => !cell)) solution[index][Math.floor(random() * size)] = true;
    const column = solution.map((row) => row[index]);
    if (column.every(Boolean)) solution[Math.floor(random() * size)][index] = false;
    if (column.every((cell) => !cell)) solution[Math.floor(random() * size)][index] = true;
  }

  return solution;
}

function buildGuaranteedUniqueFallback(size, seed) {
  const random = makeSeededRandom(seed);
  const solution = Array.from({ length: size }, () => Array(size).fill(false));
  let filledRows = 0;

  for (let row = 0; row < size; row += 1) {
    const filled = random() > 0.45;
    solution[row].fill(filled);
    if (filled) filledRows += 1;
  }

  if (filledRows === 0) solution[Math.floor(random() * size)].fill(true);
  if (filledRows === size) solution[Math.floor(random() * size)].fill(false);
  return solution;
}

async function generateSolution(size, config, requestId) {
  const baseSeed = randomSeed();
  const maxAttempts = size === 5 ? 80 : size === 10 ? 50 : 35;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (requestId !== state.generationRequestId) return null;
    const seed = (baseSeed + Math.imul(attempt, 2654435761)) >>> 0;
    const solution = buildCandidateSolution(size, config, seed);
    if (countPuzzleSolutions(solution) === 1) return { solution, seed };
    if (size === 15 || attempt % 3 === 2) await waitForNextFrame();
  }

  if (requestId !== state.generationRequestId) return null;
  const fallbackSeed = (baseSeed + 2246822519) >>> 0;
  return { solution: buildGuaranteedUniqueFallback(size, fallbackSeed), seed: fallbackSeed };
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

function getAllClues() {
  const rowClues = state.solution.map(getClues);
  const colClues = Array.from({ length: state.size }, (_, col) => getClues(state.solution.map((row) => row[col])));
  return { rowClues, colClues };
}

function getLayoutMetrics() {
  const mobile = window.innerWidth <= 620;
  const preferredCellSize = state.size === 5 ? 47 : state.size === 10 ? 33 : 25;

  if (!mobile) {
    const clueWidth = state.size === 5 ? 72 : state.size === 10 ? 100 : 118;
    const clueHeight = state.size === 5 ? 74 : state.size === 10 ? 100 : 116;
    return { cellSize: preferredCellSize, clueWidth, clueHeight, clueFontSize: 13 };
  }

  const stageWidth = document.querySelector(".board-stage")?.clientWidth || Math.max(window.innerWidth - 52, 240);
  const clueWidth = state.size === 5 ? 56 : state.size === 10 ? 66 : 78;
  const availableForCells = Math.max(stageWidth - clueWidth - 6, state.size * 12);
  const cellSize = Math.min(preferredCellSize, Math.floor(availableForCells / state.size));
  const clueHeight = state.size === 5 ? 58 : state.size === 10 ? 78 : 108;
  return { cellSize, clueWidth, clueHeight, clueFontSize: 12 };
}

function renderGrid() {
  if (!state.active || state.solution.length !== state.size) return;
  const grid = els.grid;
  const { rowClues, colClues } = getAllClues();
  const { cellSize, clueWidth, clueHeight, clueFontSize } = getLayoutMetrics();
  grid.innerHTML = "";
  grid.style.setProperty("--cell-size", `${cellSize}px`);
  grid.style.setProperty("--clue-font-size", `${clueFontSize}px`);
  grid.style.gridTemplateColumns = `${clueWidth}px repeat(${state.size}, ${cellSize}px)`;
  grid.style.gridTemplateRows = `${clueHeight}px repeat(${state.size}, ${cellSize}px)`;

  const corner = document.createElement("div");
  corner.className = "corner";
  corner.innerHTML = `<span>${state.size}</span>`;
  grid.appendChild(corner);

  colClues.forEach((clues, col) => {
    const clue = document.createElement("div");
    clue.className = "col-clue";
    clue.dataset.colClue = col;
    clue.innerHTML = clues.map((value) => `<span>${value}</span>`).join("");
    grid.appendChild(clue);
  });

  rowClues.forEach((clues, row) => {
    const clue = document.createElement("div");
    clue.className = "row-clue";
    clue.dataset.rowClue = row;
    clue.innerHTML = clues.map((value) => `<span>${value}</span>`).join("");
    grid.appendChild(clue);

    for (let col = 0; col < state.size; col += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      if ((row + 1) % 5 === 0 && row !== state.size - 1) cell.classList.add("group-row");
      if ((col + 1) % 5 === 0 && col !== state.size - 1) cell.classList.add("group-col");
      cell.dataset.row = row;
      cell.dataset.col = col;
      cell.setAttribute("aria-label", `第 ${row + 1} 行，第 ${col + 1} 列，空白`);
      grid.appendChild(cell);
    }
  });

  renderPlayerState();
  enterBoard(grid);
}

function renderPlayerState() {
  els.grid.querySelectorAll(".cell").forEach((cell) => {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    const value = state.player[row][col];
    const previous = cell.dataset.value;
    cell.dataset.value = value;
    if (previous !== undefined && previous !== String(value)) pop(cell);
    cell.classList.toggle("filled", value === 1);
    cell.classList.toggle("crossed", value === -1);
    cell.textContent = value === -1 ? "×" : "";
    const label = value === 1 ? "已填色" : value === -1 ? "已标为空格" : "空白";
    cell.setAttribute("aria-label", `第 ${row + 1} 行，第 ${col + 1} 列，${label}`);
  });
  updateClueCompletion();
}

function lineMatchesClues(playerLine, expectedClues) {
  const currentClues = getClues(playerLine.map((cell) => cell === 1));
  return currentClues.length === expectedClues.length
    && currentClues.every((value, index) => value === expectedClues[index]);
}

function updateClueCompletion() {
  if (state.solution.length !== state.size || state.player.length !== state.size) return;
  const { rowClues, colClues } = getAllClues();

  for (let row = 0; row < state.size; row += 1) {
    const solved = lineMatchesClues(state.player[row], rowClues[row]);
    els.grid.querySelector(`[data-row-clue="${row}"]`)?.classList.toggle("solved", solved);
  }

  for (let col = 0; col < state.size; col += 1) {
    const playerColumn = state.player.map((row) => row[col]);
    const solved = lineMatchesClues(playerColumn, colClues[col]);
    els.grid.querySelector(`[data-col-clue="${col}"]`)?.classList.toggle("solved", solved);
  }
}

function setCluesCompleted(completed) {
  els.grid.querySelectorAll(".row-clue, .col-clue").forEach((clue) => clue.classList.toggle("solved", completed));
}

// ---------------------------------------------------------------------------
// 交互
// ---------------------------------------------------------------------------

function updateUndoButton() {
  els.undoButton.disabled = state.history.length === 0;
}

function pushHistory() {
  state.history.push({
    player: state.player.map((row) => [...row]),
    completed: state.completed
  });
  if (state.history.length > 100) state.history.shift();
  updateUndoButton();
}

function undo() {
  const previous = state.history.pop();
  if (!previous) return;
  state.player = previous.player.map((row) => [...row]);
  state.completed = previous.completed;
  ctx.closeVictory();
  setCluesCompleted(false);
  ctx.setStatus("active");
  renderPlayerState();
  updateUndoButton();
  showToast("已撤回上一步");
}

function setCell(row, col, requestedValue, { hinted = false, recordHistory = true } = {}) {
  if (state.completed || state.generating) return;
  ctx.timer.start();
  const current = state.player[row][col];
  const next = current === requestedValue ? 0 : requestedValue;
  const cell = els.grid.querySelector(`[data-row="${row}"][data-col="${col}"]`);

  if (recordHistory) pushHistory();

  state.player[row][col] = next;
  cell?.classList.toggle("hinted", hinted);
  setCluesCompleted(false);
  ctx.setStatus("active");
  renderPlayerState();
}

function applyTool(cell, valueOverride = null, options = {}) {
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  const requestedValue = valueOverride ?? (state.tool === "fill" ? 1 : -1);
  setCell(row, col, requestedValue, options);
}

function submitPuzzle() {
  if (state.generating) {
    showToast("题目正在生成，请稍等一下");
    return false;
  }
  const won = state.solution.every((row, rowIndex) => row.every((filled, colIndex) => (state.player[rowIndex][colIndex] === 1) === filled));
  if (!won) {
    ctx.setStatus("incorrect");
    showToast("答案还不正确，再检查一下整张棋盘");
    return false;
  }
  state.completed = true;
  ctx.timer.stop();
  setCluesCompleted(true);
  ctx.setStatus("correct");
  ctx.reportWin({
    summary: `你用 ${ctx.timerText()} 完成了这道 ${state.size} × ${state.size} 数织。`,
    score: {
      size: state.size,
      difficulty: state.difficulty,
      elapsedSeconds: Math.max(1, ctx.timer.elapsed()),
      puzzleId: state.puzzleId,
      puzzleSeed: state.puzzleSeed
    }
  });
  return true;
}

function revealStartingHints(count) {
  if (!count) return;
  const filledCells = [];
  state.solution.forEach((row, rowIndex) => row.forEach((filled, colIndex) => {
    if (filled) filledCells.push([rowIndex, colIndex]);
  }));
  for (let index = 0; index < Math.min(count, filledCells.length); index += 1) {
    const pick = Math.floor(Math.random() * filledCells.length);
    const [row, col] = filledCells.splice(pick, 1)[0];
    state.player[row][col] = 1;
    els.grid.querySelector(`[data-row="${row}"][data-col="${col}"]`)?.classList.add("hinted");
  }
  renderPlayerState();
}

async function newGame() {
  const requestId = ++state.generationRequestId;
  const requestedSize = state.size;
  const requestedDifficulty = state.difficulty;
  const config = difficultyConfig[requestedDifficulty];
  state.generating = true;
  ctx.timer.reset();
  ctx.setTitle(`${requestedSize} × ${requestedSize} · 正在生成…`);
  ctx.setStatus("generating");
  els.newGameButton.setAttribute("aria-busy", "true");
  await waitForNextFrame();

  const generated = await generateSolution(requestedSize, config, requestId);
  if (!generated || requestId !== state.generationRequestId || !state.active) return false;

  state.solution = generated.solution;
  state.player = Array.from({ length: requestedSize }, () => Array(requestedSize).fill(0));
  state.history = [];
  state.completed = false;
  state.generating = false;
  state.puzzleSeed = generated.seed >>> 0;
  state.puzzleId = Math.abs(generated.seed % 10000);
  ctx.setTitle(`${requestedSize} × ${requestedSize} · ${config.label}`);
  ctx.setPuzzleNumber(state.puzzleId);
  renderGrid();
  revealStartingHints(config.hints);
  ctx.setStatus("idle");
  updateUndoButton();
  els.newGameButton.removeAttribute("aria-busy");
  return true;
}

function continuePointerDrag(cell) {
  if (!state.isPointerDown || !cell) return;
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  if (state.player[row][col] !== state.dragValue) applyTool(cell, state.dragValue, { recordHistory: false });
}

// ---------------------------------------------------------------------------
// 挂载 / 卸载
// ---------------------------------------------------------------------------

function mountControlPanel() {
  ctx.els.controlPanel.innerHTML = `
    <div class="eyebrow"><span></span> PUZZLE SETUP</div>
    <h1>今天，拼出<br /><em>什么图案？</em></h1>

    <div class="field-group">
      <div class="field-label"><span>难度</span><output id="nonogramDifficultyDescription">${difficultyConfig[state.difficulty].description}</output></div>
      <div class="segmented" id="nonogramDifficultyPicker" role="radiogroup" aria-label="选择难度">
        ${Object.entries(difficultyConfig).map(([value, config]) =>
          `<button type="button" role="radio" aria-checked="${value === state.difficulty}" data-difficulty="${value}">${config.label}</button>`
        ).join("")}
      </div>
    </div>

    <div class="field-group">
      <div class="field-label"><span>棋盘大小</span><output id="nonogramSizeDescription">${sizeDescriptions[state.size]}</output></div>
      <div class="segmented" id="nonogramSizePicker" role="radiogroup" aria-label="选择棋盘大小">
        ${[5, 10, 15].map((size) =>
          `<button type="button" role="radio" aria-checked="${size === state.size}" data-size="${size}">${size}×${size}</button>`
        ).join("")}
      </div>
    </div>

    <button class="primary-button" id="nonogramNewGameButton" type="button">
      <span class="button-icon" aria-hidden="true">↻</span>
      生成新题目
    </button>

    <div class="mini-guide">
      <span class="guide-icon" aria-hidden="true">✦</span>
      <p><strong>数字是连续方格的数量。</strong><br />每道随机题都会验证只有一个正确解。</p>
    </div>
  `;

  ctx.els.controlPanel.querySelector("#nonogramDifficultyPicker").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-difficulty]");
    if (!button) return;
    state.difficulty = button.dataset.difficulty;
    selectOption(event.currentTarget, button);
    ctx.els.controlPanel.querySelector("#nonogramDifficultyDescription").textContent = difficultyConfig[state.difficulty].description;
    newGame();
  });

  ctx.els.controlPanel.querySelector("#nonogramSizePicker").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-size]");
    if (!button) return;
    state.size = Number(button.dataset.size);
    selectOption(event.currentTarget, button);
    ctx.els.controlPanel.querySelector("#nonogramSizeDescription").textContent = sizeDescriptions[state.size];
    newGame();
  });

  els.newGameButton = ctx.els.controlPanel.querySelector("#nonogramNewGameButton");
  els.newGameButton.addEventListener("click", () => { newGame(); });
}

function mountToolbar() {
  ctx.els.boardToolbar.innerHTML = `
    <div class="tool-switch" role="radiogroup" aria-label="落子方式">
      <button type="button" role="radio" aria-checked="${state.tool === "fill"}" data-tool="fill">
        <span class="fill-swatch" aria-hidden="true"></span> 填色
      </button>
      <button type="button" role="radio" aria-checked="${state.tool === "cross"}" data-tool="cross">
        <span class="cross-swatch" aria-hidden="true">×</span> 标记空格
      </button>
    </div>
    <div class="board-actions">
      <button class="undo-button" id="nonogramUndoButton" type="button" disabled aria-label="撤回上一步">
        <span aria-hidden="true">↶</span> 撤回
      </button>
      <button class="text-button" id="nonogramClearButton" type="button">清空棋盘</button>
      <button class="submit-button" id="nonogramSubmitButton" type="button">提交答案</button>
    </div>
  `;
  ctx.els.desktopTip.textContent = "再次点击可取消 · 按住拖动可连续填／擦 · 右键标记或取消 × · ⌘/Ctrl + Z 撤回";

  ctx.els.boardToolbar.querySelector(".tool-switch").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-tool]");
    if (!button) return;
    state.tool = button.dataset.tool;
    selectOption(event.currentTarget, button);
  });

  els.undoButton = ctx.els.boardToolbar.querySelector("#nonogramUndoButton");
  els.undoButton.addEventListener("click", undo);
  ctx.els.boardToolbar.querySelector("#nonogramSubmitButton").addEventListener("click", submitPuzzle);
  ctx.els.boardToolbar.querySelector("#nonogramClearButton").addEventListener("click", () => {
    if (!state.player.some((row) => row.some((cell) => cell !== 0))) return;
    pushHistory();
    state.player = Array.from({ length: state.size }, () => Array(state.size).fill(0));
    setCluesCompleted(false);
    ctx.setStatus("active");
    renderPlayerState();
    showToast("棋盘已清空");
  });
}

function mountBoard() {
  ctx.els.gameRoot.innerHTML = `<div class="puzzle-grid" aria-label="Nonogram 棋盘"></div>`;
  els.grid = ctx.els.gameRoot.querySelector(".puzzle-grid");

  els.grid.addEventListener("pointerdown", (event) => {
    const cell = event.target.closest(".cell");
    if (!cell || state.completed || state.generating) return;
    event.preventDefault();
    state.isPointerDown = true;
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    const requestedValue = event.button === 2 ? -1 : (state.tool === "fill" ? 1 : -1);
    state.dragValue = state.player[row][col] === requestedValue ? 0 : requestedValue;
    pushHistory();
    applyTool(cell, state.dragValue, { recordHistory: false });
  });

  els.grid.addEventListener("pointerover", (event) => {
    continuePointerDrag(event.target.closest(".cell"));
  });

  els.grid.addEventListener("pointermove", (event) => {
    if (!state.isPointerDown) return;
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY);
    continuePointerDrag(target?.closest(".cell"));
  });

  const stopDrag = () => { state.isPointerDown = false; state.dragValue = null; };
  window.addEventListener("pointerup", stopDrag);
  window.addEventListener("pointercancel", stopDrag);
  window.addEventListener("blur", stopDrag);
  cleanups.push(() => {
    window.removeEventListener("pointerup", stopDrag);
    window.removeEventListener("pointercancel", stopDrag);
    window.removeEventListener("blur", stopDrag);
  });

  els.grid.addEventListener("contextmenu", (event) => event.preventDefault());
  els.grid.addEventListener("keydown", (event) => {
    const cell = event.target.closest(".cell");
    if (!cell || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    applyTool(cell);
  });

  const onResize = () => renderGrid();
  window.addEventListener("resize", onResize);
  cleanups.push(() => window.removeEventListener("resize", onResize));

  const onUndoShortcut = (event) => {
    if (document.querySelector("dialog[open]") || event.target.closest("input, textarea, select, [contenteditable]")) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
      event.preventDefault();
      undo();
    }
  };
  window.addEventListener("keydown", onUndoShortcut);
  cleanups.push(() => window.removeEventListener("keydown", onUndoShortcut));
}

// ---------------------------------------------------------------------------
// WebMCP 工具（页面 AI 助手可以读写当前数织）
// ---------------------------------------------------------------------------

function registerWebMcpTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;

  const register = (tool) => {
    try {
      Promise.resolve(context.registerTool(tool)).catch(() => {});
    } catch (_) {}
  };

  register({
    name: "read_nonogram_state",
    title: "读取数织状态",
    description: "读取当前数织的尺寸、难度、计时、提交状态和完成状态。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute() {
      if (!state.active) throw new Error("数织当前未在运行");
      return {
        size: state.size,
        difficulty: state.difficulty,
        submissionStatus: state.completed ? "correct" : "active",
        completed: state.completed
      };
    }
  });

  register({
    name: "start_new_nonogram",
    title: "生成新数织题目",
    description: "按指定尺寸和难度生成并显示一局新的数织。",
    inputSchema: {
      type: "object",
      properties: {
        size: { type: "integer", enum: [5, 10, 15] },
        difficulty: { type: "string", enum: ["easy", "normal", "hard"] }
      },
      required: ["size", "difficulty"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input) {
      if (!state.active) throw new Error("数织当前未在运行");
      if (![5, 10, 15].includes(input?.size) || !difficultyConfig[input?.difficulty]) {
        throw new Error("尺寸或难度无效");
      }
      state.size = input.size;
      state.difficulty = input.difficulty;
      await newGame();
      return { puzzleId: state.puzzleId, size: state.size, difficulty: state.difficulty };
    }
  });

  register({
    name: "mark_nonogram_cells",
    title: "标记数织棋盘格",
    description: "批量填色、打叉或清除当前数织棋盘上的指定方格。行列编号从 1 开始。",
    inputSchema: {
      type: "object",
      properties: {
        cells: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              row: { type: "integer", minimum: 1 },
              column: { type: "integer", minimum: 1 },
              mark: { type: "string", enum: ["fill", "cross", "clear"] }
            },
            required: ["row", "column", "mark"],
            additionalProperties: false
          }
        }
      },
      required: ["cells"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input) {
      if (!state.active) throw new Error("数织当前未在运行");
      if (!Array.isArray(input?.cells) || input.cells.length === 0) throw new Error("至少需要一个方格");
      input.cells.forEach(({ row, column, mark }) => {
        if (!Number.isInteger(row) || !Number.isInteger(column) || row < 1 || column < 1 || row > state.size || column > state.size || !["fill", "cross", "clear"].includes(mark)) {
          throw new Error("方格位置或标记类型无效");
        }
      });
      pushHistory();
      input.cells.forEach(({ row, column, mark }) => {
        if (mark === "clear") state.player[row - 1][column - 1] = 0;
        else setCell(row - 1, column - 1, mark === "fill" ? 1 : -1, { recordHistory: false });
      });
      renderPlayerState();
      setCluesCompleted(false);
      ctx.setStatus("active");
      return { updated: input.cells.length };
    }
  });

  register({
    name: "submit_nonogram_answer",
    title: "提交数织答案",
    description: "提交并检查当前整张数织棋盘，只返回整体正确或不正确。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute() {
      if (!state.active) throw new Error("数织当前未在运行");
      const correct = submitPuzzle();
      return { correct, completed: state.completed };
    }
  });
}

// ---------------------------------------------------------------------------
// 游戏定义
// ---------------------------------------------------------------------------

export default {
  id: "nonogram",
  name: "数织",
  subtitle: "NONOGRAM",
  howToTitle: "看数字，填方格",
  howTo: `
    <div class="example-row" aria-hidden="true">
      <strong>2 1</strong>
      <span class="demo-cell filled"></span><span class="demo-cell filled"></span><span class="demo-cell crossed">×</span><span class="demo-cell filled"></span><span class="demo-cell crossed">×</span>
    </div>
    <p>每个数字代表一组连续填色格。多组数字之间，至少隔一个空格。</p>
    <p>选择“填色”画出图案；确定某格为空时，用“×”标记。再次点击或按住拖动可连续取消，右键也能标记或取消“×”。</p>
    <p>作答过程中不会提示对错。完成后点击“提交答案”，一次检查整张棋盘。</p>
  `,
  sizes: [
    { value: 5, label: "5 × 5" },
    { value: 10, label: "10 × 10" },
    { value: 15, label: "15 × 15" }
  ],
  difficulties: [
    { value: "easy", label: "简单" },
    { value: "normal", label: "普通" },
    { value: "hard", label: "困难" }
  ],

  getScoreFilter() {
    return { size: state.size, difficulty: state.difficulty };
  },

  newGame,

  mount(context) {
    ctx = context;
    state.active = true;
    mountControlPanel();
    mountToolbar();
    mountBoard();
    registerWebMcpTools();
    newGame();
  },

  unmount() {
    state.active = false;
    state.generationRequestId += 1;
    state.generating = false;
    state.isPointerDown = false;
    cleanups.splice(0).forEach((cleanup) => cleanup());
    els = {};
    ctx = null;
  }
};
