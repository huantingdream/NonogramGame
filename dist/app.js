const difficultyConfig = {
  easy: { label: "简单", density: 0.47, symmetry: true, hints: 3, mistakeLimit: 3, description: "适合热身，赠送 3 格提示" },
  normal: { label: "普通", density: 0.5, symmetry: false, hints: 1, mistakeLimit: 3, description: "稍有挑战，赠送 1 格提示" },
  hard: { label: "困难", density: 0.54, symmetry: false, hints: 0, mistakeLimit: 3, description: "只给线索，不提供起始提示" }
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
  mistakes: 0,
  startedAt: null,
  elapsed: 0,
  timerId: null,
  isPointerDown: false,
  dragValue: null,
  completed: false,
  puzzleId: 0
};

const grid = document.querySelector("#puzzleGrid");
const timerOutput = document.querySelector("#timer");
const mistakesOutput = document.querySelector("#mistakes");
const mistakeLimitOutput = document.querySelector("#mistakeLimit");
const boardTitle = document.querySelector("#boardTitle");
const puzzleNumber = document.querySelector("#puzzleNumber");
const difficultyDescription = document.querySelector("#difficultyDescription");
const sizeDescription = document.querySelector("#sizeDescription");
const toast = document.querySelector("#toast");
const howToModal = document.querySelector("#howToModal");
const victoryModal = document.querySelector("#victoryModal");

function makeSeededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function generateSolution(size, config) {
  const seed = Date.now() ^ Math.floor(Math.random() * 0xffffffff);
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

  return { solution, seed };
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
  const viewport = Math.min(window.innerWidth, 1200);
  let cellSize = state.size === 5 ? 47 : state.size === 10 ? 33 : 25;
  if (viewport < 620) cellSize = state.size === 5 ? 42 : state.size === 10 ? 27 : 21;
  const clueWidth = state.size === 5 ? 72 : state.size === 10 ? 100 : 118;
  const clueHeight = state.size === 5 ? 74 : state.size === 10 ? 100 : 116;
  return { cellSize, clueWidth, clueHeight };
}

function renderGrid() {
  const { rowClues, colClues } = getAllClues();
  const { cellSize, clueWidth, clueHeight } = getLayoutMetrics();
  grid.innerHTML = "";
  grid.style.setProperty("--cell-size", `${cellSize}px`);
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
  updateSolvedClues();
}

function updateSolvedClues() {
  for (let row = 0; row < state.size; row += 1) {
    const solved = state.player[row].every((value, col) => (value === 1) === state.solution[row][col]);
    grid.querySelector(`[data-row-clue="${row}"]`)?.classList.toggle("solved", solved);
  }
  for (let col = 0; col < state.size; col += 1) {
    const solved = state.player.every((row, index) => (row[col] === 1) === state.solution[index][col]);
    grid.querySelector(`[data-col-clue="${col}"]`)?.classList.toggle("solved", solved);
  }
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

function setCell(row, col, requestedValue, { hinted = false } = {}) {
  if (state.completed) return;
  startTimer();
  const current = state.player[row][col];
  const next = current === requestedValue ? 0 : requestedValue;
  const cell = grid.querySelector(`[data-row="${row}"][data-col="${col}"]`);

  if (next === 1 && !state.solution[row][col]) {
    state.mistakes += 1;
    mistakesOutput.textContent = state.mistakes;
    cell.classList.remove("wrong");
    requestAnimationFrame(() => cell.classList.add("wrong"));
    window.setTimeout(() => cell.classList.remove("wrong"), 360);
    showToast("这里不是填色格，再看看数字线索");
    if (state.mistakes >= difficultyConfig[state.difficulty].mistakeLimit) showToast("别急，打叉能帮你排除空格");
    return;
  }

  state.player[row][col] = next;
  cell?.classList.toggle("hinted", hinted);
  renderPlayerState();
  checkVictory();
}

function applyTool(cell, valueOverride = null) {
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  const requestedValue = valueOverride ?? (state.tool === "fill" ? 1 : -1);
  setCell(row, col, requestedValue);
}

function checkVictory() {
  const won = state.solution.every((row, rowIndex) => row.every((filled, colIndex) => !filled || state.player[rowIndex][colIndex] === 1));
  if (!won) return;
  state.completed = true;
  window.clearInterval(state.timerId);
  updateTimer();
  document.querySelector("#victorySummary").textContent = `你用 ${timerOutput.textContent} 完成了这道 ${state.size} × ${state.size} 题目。`;
  window.setTimeout(() => victoryModal.showModal(), 260);
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

function newGame() {
  window.clearInterval(state.timerId);
  const config = difficultyConfig[state.difficulty];
  const generated = generateSolution(state.size, config);
  state.solution = generated.solution;
  state.player = Array.from({ length: state.size }, () => Array(state.size).fill(0));
  state.mistakes = 0;
  state.startedAt = null;
  state.elapsed = 0;
  state.timerId = null;
  state.completed = false;
  state.puzzleId = generated.seed % 10000;
  mistakesOutput.textContent = "0";
  mistakeLimitOutput.textContent = ` / ${config.mistakeLimit}`;
  timerOutput.textContent = "00:00";
  boardTitle.textContent = `${state.size} × ${state.size} · ${config.label}`;
  puzzleNumber.textContent = `PUZZLE #${state.puzzleId.toString().padStart(4, "0")}`;
  renderGrid();
  revealStartingHints(config.hints);
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
  if (!cell) return;
  event.preventDefault();
  state.isPointerDown = true;
  state.dragValue = event.button === 2 ? -1 : (state.tool === "fill" ? 1 : -1);
  applyTool(cell, state.dragValue);
});

grid.addEventListener("pointerover", (event) => {
  const cell = event.target.closest(".cell");
  if (!state.isPointerDown || !cell) return;
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  if (state.player[row][col] !== state.dragValue) applyTool(cell, state.dragValue);
});

window.addEventListener("pointerup", () => { state.isPointerDown = false; state.dragValue = null; });
grid.addEventListener("contextmenu", (event) => event.preventDefault());
grid.addEventListener("keydown", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  applyTool(cell);
});
window.addEventListener("resize", renderGrid);

document.querySelector("#newGameButton").addEventListener("click", newGame);
document.querySelector("#nextPuzzleButton").addEventListener("click", () => { victoryModal.close(); newGame(); });
document.querySelector("#clearButton").addEventListener("click", () => {
  state.player = Array.from({ length: state.size }, () => Array(state.size).fill(0));
  renderPlayerState();
  showToast("棋盘已清空");
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
    description: "读取当前 Nonogram 的尺寸、难度、计时、错误数和完成状态。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute() {
      return {
        size: state.size,
        difficulty: state.difficulty,
        elapsedSeconds: state.elapsed,
        mistakes: state.mistakes,
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
    execute(input) {
      if (![5, 10, 15].includes(input?.size) || !difficultyConfig[input?.difficulty]) {
        throw new Error("尺寸或难度无效");
      }
      state.size = input.size;
      state.difficulty = input.difficulty;
      document.querySelectorAll("#sizePicker button").forEach((button) => button.setAttribute("aria-checked", Number(button.dataset.size) === state.size ? "true" : "false"));
      document.querySelectorAll("#difficultyPicker button").forEach((button) => button.setAttribute("aria-checked", button.dataset.difficulty === state.difficulty ? "true" : "false"));
      sizeDescription.textContent = sizeDescriptions[state.size];
      difficultyDescription.textContent = difficultyConfig[state.difficulty].description;
      newGame();
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
      input.cells.forEach(({ row, column, mark }) => {
        if (mark === "clear") state.player[row - 1][column - 1] = 0;
        else setCell(row - 1, column - 1, mark === "fill" ? 1 : -1);
      });
      renderPlayerState();
      checkVictory();
      return { updated: input.cells.length, mistakes: state.mistakes, completed: state.completed };
    }
  });
}

registerWebMcpTools();
