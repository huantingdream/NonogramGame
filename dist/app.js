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
  startedAt: null,
  elapsed: 0,
  timerId: null,
  isPointerDown: false,
  dragValue: null,
  history: [],
  submissionStatus: "idle",
  completed: false,
  puzzleId: 0,
  generating: false,
  generationRequestId: 0
};

const grid = document.querySelector("#puzzleGrid");
const timerOutput = document.querySelector("#timer");
const gameStatus = document.querySelector("#gameStatus");
const boardTitle = document.querySelector("#boardTitle");
const puzzleNumber = document.querySelector("#puzzleNumber");
const difficultyDescription = document.querySelector("#difficultyDescription");
const sizeDescription = document.querySelector("#sizeDescription");
const toast = document.querySelector("#toast");
const howToModal = document.querySelector("#howToModal");
const victoryModal = document.querySelector("#victoryModal");
const undoButton = document.querySelector("#undoButton");

function makeSeededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
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
    // Treat an expensive/unknown puzzle as non-unique so it is never shown.
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

  // Avoid dull all-empty/all-filled rows and columns while keeping the picture random.
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

function waitForNextFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(() => window.setTimeout(resolve, 0)));
}

async function generateSolution(size, config, requestId) {
  const baseSeed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  const maxAttempts = size === 5 ? 80 : size === 10 ? 50 : 35;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (requestId !== state.generationRequestId) return null;
    const seed = (baseSeed + Math.imul(attempt, 2654435761)) >>> 0;
    const solution = buildCandidateSolution(size, config, seed);
    if (countPuzzleSolutions(solution) === 1) return { solution, seed };
    // Let mobile browsers paint the selection before the next uniqueness check.
    if (size === 15 || attempt % 3 === 2) await waitForNextFrame();
  }

  if (requestId !== state.generationRequestId) return null;
  const fallbackSeed = (baseSeed + 2246822519) >>> 0;
  return { solution: buildGuaranteedUniqueFallback(size, fallbackSeed), seed: fallbackSeed };
}

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
}

function renderPlayerState() {
  grid.querySelectorAll(".cell").forEach((cell) => {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    const value = state.player[row][col];
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
    grid.querySelector(`[data-row-clue="${row}"]`)?.classList.toggle("solved", solved);
  }

  for (let col = 0; col < state.size; col += 1) {
    const playerColumn = state.player.map((row) => row[col]);
    const solved = lineMatchesClues(playerColumn, colClues[col]);
    grid.querySelector(`[data-col-clue="${col}"]`)?.classList.toggle("solved", solved);
  }
}

function setCluesCompleted(completed) {
  grid.querySelectorAll(".row-clue, .col-clue").forEach((clue) => clue.classList.toggle("solved", completed));
}

function updateGameStatus(status) {
  const labels = { idle: "未提交", generating: "生成中", active: "进行中", incorrect: "再检查", correct: "正确" };
  state.submissionStatus = status;
  gameStatus.textContent = labels[status];
  gameStatus.dataset.tone = status;
}

function startTimer() {
  if (state.startedAt || state.completed) return;
  state.startedAt = Date.now() - state.elapsed * 1000;
  state.timerId = window.setInterval(updateTimer, 1000);
}

function updateTimer() {
  if (state.startedAt) state.elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
  const minutes = Math.floor(state.elapsed / 60).toString().padStart(2, "0");
  const seconds = (state.elapsed % 60).toString().padStart(2, "0");
  timerOutput.textContent = `${minutes}:${seconds}`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

function updateUndoButton() {
  undoButton.disabled = state.history.length === 0;
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
  if (victoryModal.open) victoryModal.close();
  if (!state.completed && state.startedAt && !state.timerId) state.timerId = window.setInterval(updateTimer, 1000);
  setCluesCompleted(false);
  updateGameStatus("active");
  renderPlayerState();
  updateUndoButton();
  showToast("已撤回上一步");
}

function setCell(row, col, requestedValue, { hinted = false, recordHistory = true } = {}) {
  if (state.completed || state.generating) return;
  startTimer();
  const current = state.player[row][col];
  const next = current === requestedValue ? 0 : requestedValue;
  const cell = grid.querySelector(`[data-row="${row}"][data-col="${col}"]`);

  if (recordHistory) pushHistory();

  state.player[row][col] = next;
  cell?.classList.toggle("hinted", hinted);
  setCluesCompleted(false);
  updateGameStatus("active");
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
    updateGameStatus("incorrect");
    showToast("答案还不正确，再检查一下整张棋盘");
    return false;
  }
  state.completed = true;
  window.clearInterval(state.timerId);
  state.timerId = null;
  updateTimer();
  setCluesCompleted(true);
  updateGameStatus("correct");
  document.querySelector("#victorySummary").textContent = `你用 ${timerOutput.textContent} 完成了这道 ${state.size} × ${state.size} 题目。`;
  window.setTimeout(() => victoryModal.showModal(), 260);
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
    grid.querySelector(`[data-row="${row}"][data-col="${col}"]`)?.classList.add("hinted");
  }
  renderPlayerState();
}

async function newGame() {
  const requestId = ++state.generationRequestId;
  const requestedSize = state.size;
  const requestedDifficulty = state.difficulty;
  const config = difficultyConfig[requestedDifficulty];
  window.clearInterval(state.timerId);
  state.timerId = null;
  state.generating = true;
  boardTitle.textContent = `${requestedSize} × ${requestedSize} · 正在生成…`;
  updateGameStatus("generating");
  document.querySelector("#newGameButton").setAttribute("aria-busy", "true");
  await waitForNextFrame();

  const generated = await generateSolution(requestedSize, config, requestId);
  if (!generated || requestId !== state.generationRequestId) return false;

  state.solution = generated.solution;
  state.player = Array.from({ length: requestedSize }, () => Array(requestedSize).fill(0));
  state.startedAt = null;
  state.elapsed = 0;
  state.history = [];
  state.submissionStatus = "idle";
  state.completed = false;
  state.generating = false;
  state.puzzleId = Math.abs(generated.seed % 10000);
  timerOutput.textContent = "00:00";
  boardTitle.textContent = `${requestedSize} × ${requestedSize} · ${config.label}`;
  puzzleNumber.textContent = `PUZZLE #${state.puzzleId.toString().padStart(4, "0")}`;
  renderGrid();
  revealStartingHints(config.hints);
  updateGameStatus("idle");
  updateUndoButton();
  document.querySelector("#newGameButton").removeAttribute("aria-busy");
  return true;
}

function selectOption(group, activeButton) {
  group.querySelectorAll("button").forEach((button) => button.setAttribute("aria-checked", button === activeButton ? "true" : "false"));
}

document.querySelector("#difficultyPicker").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-difficulty]");
  if (!button) return;
  state.difficulty = button.dataset.difficulty;
  selectOption(event.currentTarget, button);
  difficultyDescription.textContent = difficultyConfig[state.difficulty].description;
  newGame();
});

document.querySelector("#sizePicker").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-size]");
  if (!button) return;
  state.size = Number(button.dataset.size);
  selectOption(event.currentTarget, button);
  sizeDescription.textContent = sizeDescriptions[state.size];
  newGame();
});

document.querySelector(".tool-switch").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-tool]");
  if (!button) return;
  state.tool = button.dataset.tool;
  selectOption(event.currentTarget, button);
});

grid.addEventListener("pointerdown", (event) => {
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

function continuePointerDrag(cell) {
  if (!state.isPointerDown || !cell) return;
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  if (state.player[row][col] !== state.dragValue) applyTool(cell, state.dragValue, { recordHistory: false });
}

grid.addEventListener("pointerover", (event) => {
  continuePointerDrag(event.target.closest(".cell"));
});

grid.addEventListener("pointermove", (event) => {
  if (!state.isPointerDown) return;
  event.preventDefault();
  const target = document.elementFromPoint(event.clientX, event.clientY);
  continuePointerDrag(target?.closest(".cell"));
});

window.addEventListener("pointerup", () => { state.isPointerDown = false; state.dragValue = null; });
window.addEventListener("pointercancel", () => { state.isPointerDown = false; state.dragValue = null; });
window.addEventListener("blur", () => { state.isPointerDown = false; state.dragValue = null; });
grid.addEventListener("contextmenu", (event) => event.preventDefault());
grid.addEventListener("keydown", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  applyTool(cell);
});
window.addEventListener("resize", renderGrid);

document.querySelector("#newGameButton").addEventListener("click", () => { newGame(); });
document.querySelector("#nextPuzzleButton").addEventListener("click", () => { victoryModal.close(); newGame(); });
document.querySelector("#submitButton").addEventListener("click", submitPuzzle);
undoButton.addEventListener("click", undo);
document.querySelector("#clearButton").addEventListener("click", () => {
  if (!state.player.some((row) => row.some((cell) => cell !== 0))) return;
  pushHistory();
  state.player = Array.from({ length: state.size }, () => Array(state.size).fill(0));
  setCluesCompleted(false);
  updateGameStatus("active");
  renderPlayerState();
  showToast("棋盘已清空");
});

window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
    event.preventDefault();
    undo();
  }
});

document.querySelector("#howToButton").addEventListener("click", () => howToModal.showModal());
document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => howToModal.close()));
[howToModal, victoryModal].forEach((modal) => modal.addEventListener("click", (event) => {
  if (event.target === modal) modal.close();
}));

newGame();

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
    title: "读取游戏状态",
    description: "读取当前 Nonogram 的尺寸、难度、计时、提交状态和完成状态。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute() {
      return {
        size: state.size,
        difficulty: state.difficulty,
        elapsedSeconds: state.elapsed,
        submissionStatus: state.submissionStatus,
        completed: state.completed
      };
    }
  });

  register({
    name: "start_new_nonogram",
    title: "生成新题目",
    description: "按指定尺寸和难度生成并显示一局新的 Nonogram。",
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
      if (![5, 10, 15].includes(input?.size) || !difficultyConfig[input?.difficulty]) {
        throw new Error("尺寸或难度无效");
      }
      state.size = input.size;
      state.difficulty = input.difficulty;
      document.querySelectorAll("#sizePicker button").forEach((button) => button.setAttribute("aria-checked", Number(button.dataset.size) === state.size ? "true" : "false"));
      document.querySelectorAll("#difficultyPicker button").forEach((button) => button.setAttribute("aria-checked", button.dataset.difficulty === state.difficulty ? "true" : "false"));
      sizeDescription.textContent = sizeDescriptions[state.size];
      difficultyDescription.textContent = difficultyConfig[state.difficulty].description;
      await newGame();
      return { puzzleId: state.puzzleId, size: state.size, difficulty: state.difficulty };
    }
  });

  register({
    name: "mark_nonogram_cells",
    title: "标记棋盘格",
    description: "批量填色、打叉或清除当前棋盘上的指定方格。行列编号从 1 开始。",
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
      updateGameStatus("active");
      return { updated: input.cells.length, submissionStatus: state.submissionStatus };
    }
  });

  register({
    name: "submit_nonogram_answer",
    title: "提交答案",
    description: "提交并检查当前整张 Nonogram 棋盘，只返回整体正确或不正确。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute() {
      const correct = submitPuzzle();
      return { correct, submissionStatus: state.submissionStatus, completed: state.completed };
    }
  });
}

registerWebMcpTools();
