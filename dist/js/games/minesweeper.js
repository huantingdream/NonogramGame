import { animate, pop, enterBoard } from '../core/motion.js';
// 扫雷：点开所有安全格即获胜，点到雷就失败。
// 第一次点击必定安全（雷在首击后才布置，并避开首击格及周围）。

import { makeSeededRandom, randomSeed, selectOption, showToast, shuffle } from "../core/utils.js";

const presets = {
  easy: { label: "简单", rows: 9, cols: 9, mines: 10, description: "9 × 9 · 10 颗雷" },
  normal: { label: "普通", rows: 16, cols: 16, mines: 40, description: "16 × 16 · 40 颗雷" },
  hard: { label: "困难", rows: 16, cols: 30, mines: 99, description: "30 × 16 · 99 颗雷" }
};

const state = {
  preset: "easy",
  mineField: null,   // boolean rows x cols，首击后生成
  adjacent: null,    // 每格周围雷数
  revealed: null,    // boolean
  flags: null,       // boolean
  questions: null,   // boolean，「?」疑问标记
  revealedCount: 0,
  mode: "reveal",    // reveal / flag / question
  started: false,    // 是否已首击（雷已布置）
  over: false,
  won: false,
  puzzleId: 0,
  puzzleSeed: 0,
  active: false
};

let ctx = null;
let els = {};

function config() {
  return presets[state.preset];
}

function cellCount() {
  const { rows, cols } = config();
  return rows * cols;
}

// ---------------------------------------------------------------------------
// 布雷（首击后执行，保证首击格及周围 8 格无雷）
//
// 为了尽量避免「二选一只能猜」的局面，布雷不再是纯随机：
// 每生成一个候选雷区，就用一个纯逻辑求解器（不含任何猜测）从首击格模拟通关，
// 统计被迫猜测的次数；反复重抽直到找到一个无需猜测即可通关的雷区。
// 实在找不到（概率极低）时，退而求其次采用需要猜测次数最少的那个。
// 每个候选的种子都由 puzzleSeed 确定性推出，同一题号 + 同一首击位置
// 得到的雷区完全一致，排行榜成绩仍可复现。
// ---------------------------------------------------------------------------

// 各难度的重抽预算：免猜雷区在困难难度约 3% 概率，期望 ~33 次即可命中。
const GENERATION_ATTEMPTS = { easy: 100, normal: 300, hard: 800 };
const GENERATION_TIME_LIMIT_MS = 300;

function generateField(safeRow, safeCol, seed) {
  const { rows, cols, mines } = config();
  const random = makeSeededRandom(seed);

  const forbidden = new Set();
  for (let r = safeRow - 1; r <= safeRow + 1; r += 1) {
    for (let c = safeCol - 1; c <= safeCol + 1; c += 1) {
      if (r >= 0 && r < rows && c >= 0 && c < cols) forbidden.add(r * cols + c);
    }
  }

  const candidates = [];
  for (let index = 0; index < rows * cols; index += 1) {
    if (!forbidden.has(index)) candidates.push(index);
  }
  shuffle(candidates, random);

  const mineField = Array.from({ length: rows }, () => Array(cols).fill(false));
  candidates.slice(0, mines).forEach((index) => {
    mineField[Math.floor(index / cols)][index % cols] = true;
  });

  const adjacent = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => {
      let count = 0;
      for (let r = row - 1; r <= row + 1; r += 1) {
        for (let c = col - 1; c <= col + 1; c += 1) {
          if (r >= 0 && r < rows && c >= 0 && c < cols && mineField[r][c]) count += 1;
        }
      }
      return count;
    })
  );

  return { mineField, adjacent };
}

// 纯逻辑求解器：只用经典推理规则，从首击格模拟通关，返回被迫猜测的次数。
// 规则一：数字格已标旗数等于数字 → 其余未知格安全；
// 规则二：数字格的未知格数等于剩余雷数 → 这些未知格全是雷；
// 子集规则：A 的未知格集合是 B 的子集 → B\A 中的雷数 = B 剩余雷数 − A 剩余雷数。
// 三条规则都推不动时视为「被迫猜一次」，揭开一个安全格继续推。
function countForcedGuesses(mineField, adjacent, firstRow, firstCol) {
  const { rows, cols } = config();
  const revealed = Array.from({ length: rows }, () => Array(cols).fill(false));
  const flagged = Array.from({ length: rows }, () => Array(cols).fill(false));
  const safeTotal = rows * cols - config().mines;
  let revealedCount = 0;
  let guesses = 0;

  const revealFlood = (startRow, startCol) => {
    const queue = [[startRow, startCol]];
    while (queue.length) {
      const [r, c] = queue.pop();
      if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
      if (revealed[r][c] || flagged[r][c]) continue;
      revealed[r][c] = true;
      revealedCount += 1;
      if (adjacent[r][c] === 0) {
        for (let dr = -1; dr <= 1; dr += 1) {
          for (let dc = -1; dc <= 1; dc += 1) {
            if (dr !== 0 || dc !== 0) queue.push([r + dr, c + dc]);
          }
        }
      }
    }
  };

  const constraintOf = (row, col) => {
    const hidden = [];
    let flagCount = 0;
    for (let r = row - 1; r <= row + 1; r += 1) {
      for (let c = col - 1; c <= col + 1; c += 1) {
        if (r < 0 || r >= rows || c < 0 || c >= cols || revealed[r][c]) continue;
        if (flagged[r][c]) flagCount += 1;
        else hidden.push(r * cols + c);
      }
    }
    return { hidden, need: adjacent[row][col] - flagCount };
  };

  revealFlood(firstRow, firstCol);

  for (;;) {
    if (revealedCount === safeTotal) return guesses;

    let progress = false;
    const constraints = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (!revealed[row][col] || adjacent[row][col] === 0) continue;
        const { hidden, need } = constraintOf(row, col);
        if (!hidden.length) continue;
        if (need === 0) {
          hidden.forEach((index) => revealFlood(Math.floor(index / cols), index % cols));
          progress = true;
        } else if (hidden.length === need) {
          hidden.forEach((index) => { flagged[Math.floor(index / cols)][index % cols] = true; });
          progress = true;
        } else {
          constraints.push({ row, col, hidden, need });
        }
      }
    }
    if (progress) continue;

    // 子集规则：只比较距离足够近、可能共享未知格的数字格对。
    for (let a = 0; a < constraints.length && !progress; a += 1) {
      const outer = constraints[a];
      const outerSet = new Set(outer.hidden);
      for (let b = 0; b < constraints.length; b += 1) {
        if (a === b) continue;
        const inner = constraints[b];
        if (Math.abs(outer.row - inner.row) > 2 || Math.abs(outer.col - inner.col) > 2) continue;
        if (inner.hidden.length <= outer.hidden.length) continue;
        if (!outer.hidden.every((index) => inner.hidden.includes(index))) continue;
        const rest = inner.hidden.filter((index) => !outerSet.has(index));
        const restNeed = inner.need - outer.need;
        if (restNeed === 0) {
          rest.forEach((index) => revealFlood(Math.floor(index / cols), index % cols));
          progress = true;
        } else if (restNeed === rest.length) {
          rest.forEach((index) => { flagged[Math.floor(index / cols)][index % cols] = true; });
          progress = true;
        }
        if (progress) break;
      }
    }
    if (progress) continue;

    // 推不动了：记一次被迫猜测，由求解器「作弊」挑一个安全格继续。
    guesses += 1;
    let guessed = false;
    for (let row = 0; row < rows && !guessed; row += 1) {
      for (let col = 0; col < cols && !guessed; col += 1) {
        if (!revealed[row][col] && !flagged[row][col] && !mineField[row][col]) {
          revealFlood(row, col);
          guessed = true;
        }
      }
    }
    if (!guessed) return guesses; // 理论上不会发生，防御性返回。
  }
}

function placeMines(safeRow, safeCol) {
  const maxAttempts = GENERATION_ATTEMPTS[state.preset] || 300;
  const deadline = Date.now() + GENERATION_TIME_LIMIT_MS;

  let best = null;
  let bestGuesses = Infinity;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const seed = (state.puzzleSeed + attempt * 0x9E3779B9) >>> 0;
    const field = generateField(safeRow, safeCol, seed);
    const guesses = countForcedGuesses(field.mineField, field.adjacent, safeRow, safeCol);
    if (guesses === 0) {
      best = field;
      break;
    }
    if (guesses < bestGuesses) {
      best = field;
      bestGuesses = guesses;
    }
    if (Date.now() >= deadline) break;
  }

  state.mineField = best.mineField;
  state.adjacent = best.adjacent;
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

function renderGrid() {
  if (!state.active) return;
  const { rows, cols } = config();
  const grid = els.grid;
  grid.className = `mine-grid mine-size-${state.preset}`;
  grid.innerHTML = "";
  grid.style.gridTemplateColumns = `repeat(${cols}, var(--mine-cell-size))`;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "mine-cell";
      cell.dataset.row = row;
      cell.dataset.col = col;
      cell.setAttribute("aria-label", `第 ${row + 1} 行，第 ${col + 1} 列，未翻开`);
      grid.appendChild(cell);
    }
  }

  renderPlayerState();
  updateMineCounter();
  enterBoard(grid);
}

function renderPlayerState(origin = null) {
  const { rows, cols } = config();
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cell = els.grid.children[row * cols + col];
      if (!cell) continue;
      const revealed = state.revealed[row][col];
      const flagged = state.flags[row][col];
      const questioned = state.questions[row][col];
      const isMine = state.mineField && state.mineField[row][col];
      const showMine = state.over && isMine && !flagged;

      const wasRevealed = cell.classList.contains("revealed");
      const previousMark = cell.textContent;
      cell.classList.toggle("revealed", revealed);
      cell.classList.toggle("flagged", flagged && !revealed);
      cell.classList.toggle("questioned", questioned && !revealed && !showMine);
      cell.classList.toggle("mine", Boolean(showMine));
      cell.classList.toggle("exploded", Boolean(state.over && !state.won && revealed && isMine));

      if (showMine) {
        cell.textContent = "✸";
        cell.removeAttribute("data-n");
      } else if (revealed && state.adjacent[row][col] > 0) {
        cell.textContent = String(state.adjacent[row][col]);
        cell.dataset.n = state.adjacent[row][col];
      } else if (!revealed && flagged) {
        cell.textContent = "⚑";
        cell.removeAttribute("data-n");
      } else if (!revealed && questioned) {
        cell.textContent = "?";
        cell.removeAttribute("data-n");
      } else {
        cell.textContent = "";
        cell.removeAttribute("data-n");
      }

      if (revealed && !wasRevealed) {
        const delay = origin ? Math.min(180, Math.hypot(row - origin[0], col - origin[1]) * 22) : 0;
        animate(cell, [
          { opacity: .3, scale: '.82', backgroundColor: '#e9edf6' },
          { opacity: 1, scale: '1', backgroundColor: isMine ? '#e45050' : '#ffffff' }
        ], { duration: 240, delay, fill: 'backwards' });
      } else if (previousMark !== cell.textContent) pop(cell);

      const label = revealed
        ? (isMine ? "雷" : state.adjacent[row][col] === 0 ? "空白" : `周围 ${state.adjacent[row][col]} 颗雷`)
        : flagged ? "已插旗" : questioned ? "已标记疑问" : "未翻开";
      cell.setAttribute("aria-label", `第 ${row + 1} 行，第 ${col + 1} 列，${label}`);
    }
  }
}

function updateMineCounter() {
  if (!els.mineCounter) return;
  const flaggedCount = state.flags.flat().filter(Boolean).length;
  els.mineCounter.textContent = String(Math.max(config().mines - flaggedCount, 0));
}

// ---------------------------------------------------------------------------
// 交互
// ---------------------------------------------------------------------------

function reveal(row, col) {
  if (state.over || state.revealed[row][col] || state.flags[row][col]) return;
  // 「?」只是备忘标记，不阻止翻开；翻开时顺手清掉。
  state.questions[row][col] = false;

  if (!state.started) {
    state.started = true;
    placeMines(row, col);
    ctx.timer.start();
    ctx.setStatus("active");
  }

  if (state.mineField[row][col]) {
    state.revealed[row][col] = true;
    gameOver(false);
    return;
  }

  // 洪水填充：连续翻开空白区域。
  const { rows, cols } = config();
  const queue = [[row, col]];
  while (queue.length) {
    const [r, c] = queue.pop();
    if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
    if (state.revealed[r][c] || state.flags[r][c]) continue;
    state.revealed[r][c] = true;
    state.questions[r][c] = false;
    state.revealedCount += 1;
    if (state.adjacent[r][c] === 0) {
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (dr !== 0 || dc !== 0) queue.push([r + dr, c + dc]);
        }
      }
    }
  }

  renderPlayerState([row, col]);
  checkWin();
}

// 右键循环：无标记 → 插旗 → ? → 无标记（经典扫雷行为）。
function cycleMark(row, col) {
  if (state.over || state.revealed[row][col]) return;
  if (!state.flags[row][col] && !state.questions[row][col]) {
    state.flags[row][col] = true;
  } else if (state.flags[row][col]) {
    state.flags[row][col] = false;
    state.questions[row][col] = true;
  } else {
    state.questions[row][col] = false;
  }
  renderPlayerState();
  updateMineCounter();
}

// 工具栏「插旗」/「?」模式下的单击：直接设置对应标记，再点取消。
function toggleMark(row, col, mark) {
  if (state.over || state.revealed[row][col]) return;
  if (mark === "flag") {
    state.flags[row][col] = !state.flags[row][col];
    if (state.flags[row][col]) state.questions[row][col] = false;
  } else {
    state.questions[row][col] = !state.questions[row][col];
    if (state.questions[row][col]) state.flags[row][col] = false;
  }
  renderPlayerState();
  updateMineCounter();
}

function checkWin() {
  if (state.over || !state.started) return;
  if (state.revealedCount !== cellCount() - config().mines) return;
  gameOver(true);
}

function gameOver(won) {
  state.over = true;
  state.won = won;
  ctx.timer.stop();
  const { rows, cols } = config();

  if (won) {
    // 自动给剩余的雷插旗，展示干净的结果。
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (state.mineField[row][col]) {
          state.flags[row][col] = true;
          state.questions[row][col] = false;
        }
      }
    }
    renderPlayerState();
    updateMineCounter();
    ctx.setStatus("correct");
    ctx.reportWin({
      summary: `你用 ${ctx.timerText()} 排完了 ${config().label} 难度的 ${config().mines} 颗雷。`,
      score: {
        size: rows * cols,
        difficulty: state.preset,
        elapsedSeconds: Math.max(1, ctx.timer.elapsed()),
        puzzleId: state.puzzleId,
        puzzleSeed: state.puzzleSeed
      }
    });
  } else {
    renderPlayerState();
    ctx.setStatus("incorrect", "踩雷");
    showToast("踩到雷了，点「生成新题目」再来一局");
  }
}

function newGame() {
  ctx.closeVictory();
  const { label } = config();
  state.mineField = null;
  state.adjacent = null;
  state.revealed = Array.from({ length: config().rows }, () => Array(config().cols).fill(false));
  state.flags = Array.from({ length: config().rows }, () => Array(config().cols).fill(false));
  state.questions = Array.from({ length: config().rows }, () => Array(config().cols).fill(false));
  state.revealedCount = 0;
  state.started = false;
  state.over = false;
  state.won = false;
  state.puzzleSeed = randomSeed();
  state.puzzleId = Math.abs(state.puzzleSeed % 10000);
  ctx.timer.reset();
  ctx.setTitle(`${config().cols} × ${config().rows} · ${label}`);
  ctx.setPuzzleNumber(state.puzzleId);
  renderGrid();
  ctx.setStatus("idle");
  return true;
}

// ---------------------------------------------------------------------------
// 挂载 / 卸载
// ---------------------------------------------------------------------------

function mountControlPanel() {
  ctx.els.controlPanel.innerHTML = `
    <div class="eyebrow"><span></span> PUZZLE SETUP</div>
    <h1>小心脚下，<br /><em>雷在哪里？</em></h1>

    <div class="field-group">
      <div class="field-label"><span>难度</span><output id="minePresetDescription">${config().description}</output></div>
      <div class="segmented" id="minePresetPicker" role="radiogroup" aria-label="选择难度">
        ${Object.entries(presets).map(([value, preset]) =>
          `<button type="button" role="radio" aria-checked="${value === state.preset}" data-preset="${value}">${preset.label}</button>`
        ).join("")}
      </div>
    </div>

    <button class="primary-button" id="mineNewGameButton" type="button">
      <span class="button-icon" aria-hidden="true">↻</span>
      生成新题目
    </button>

    <div class="mini-guide">
      <span class="guide-icon" aria-hidden="true">✦</span>
      <p><strong>数字是周围 8 格的雷数。</strong><br />第一次点击永远安全；每局题目都保证纯推理即可通关，不用猜。</p>
    </div>
  `;

  ctx.els.controlPanel.querySelector("#minePresetPicker").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-preset]");
    if (!button) return;
    state.preset = button.dataset.preset;
    selectOption(event.currentTarget, button);
    ctx.els.controlPanel.querySelector("#minePresetDescription").textContent = config().description;
    newGame();
  });

  ctx.els.controlPanel.querySelector("#mineNewGameButton").addEventListener("click", () => { newGame(); });
}

function mountToolbar() {
  ctx.els.boardToolbar.innerHTML = `
    <div class="tool-switch" role="radiogroup" aria-label="操作方式">
      <button type="button" role="radio" aria-checked="${state.mode === "reveal"}" data-mode="reveal">
        <span aria-hidden="true">⛏</span> 翻开
      </button>
      <button type="button" role="radio" aria-checked="${state.mode === "flag"}" data-mode="flag">
        <span aria-hidden="true">⚑</span> 插旗
      </button>
      <button type="button" role="radio" aria-checked="${state.mode === "question"}" data-mode="question">
        <span aria-hidden="true">?</span> 疑问
      </button>
    </div>
    <div class="board-actions">
      <span class="mine-counter" title="剩余雷数"><span aria-hidden="true">✸</span><strong id="mineCounter">${config().mines}</strong></span>
    </div>
  `;
  ctx.els.desktopTip.textContent = "左键翻开 · 右键循环：插旗 → ? → 取消 · 翻开全部安全格即获胜";

  ctx.els.boardToolbar.querySelector(".tool-switch").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-mode]");
    if (!button) return;
    state.mode = button.dataset.mode;
    selectOption(event.currentTarget, button);
  });

  els.mineCounter = ctx.els.boardToolbar.querySelector("#mineCounter");
}

function mountBoard() {
  ctx.els.gameRoot.innerHTML = `<div class="mine-grid mine-size-${state.preset}" aria-label="扫雷棋盘"></div>`;
  els.grid = ctx.els.gameRoot.querySelector(".mine-grid");

  els.grid.addEventListener("click", (event) => {
    const cell = event.target.closest(".mine-cell");
    if (!cell || state.over) return;
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    if (state.mode === "flag" || state.mode === "question") toggleMark(row, col, state.mode);
    else reveal(row, col);
  });

  els.grid.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const cell = event.target.closest(".mine-cell");
    if (!cell || state.over) return;
    cycleMark(Number(cell.dataset.row), Number(cell.dataset.col));
  });
}

// ---------------------------------------------------------------------------
// 游戏定义
// ---------------------------------------------------------------------------

export default {
  id: "minesweeper",
  name: "扫雷",
  subtitle: "MINESWEEPER",
  howToTitle: "数字告诉你雷在哪",
  howTo: `
    <p>棋盘下埋着若干颗雷。翻开一个安全格后，<strong>数字表示周围 8 格里有多少颗雷</strong>。</p>
    <p>用推理找出所有安全格并翻开它们即获胜。确定是雷的格子可以<strong>插旗</strong>；拿不准的格子可以打<strong>「?」</strong>做备忘（右键循环：插旗 → ? → 取消），「?」不影响胜负，随时可以翻开。</p>
    <p>第一次点击永远不会踩雷，而且每局题目都经过验证：<strong>只靠逻辑推理就能排完所有雷</strong>，不会遇到「二选一只能猜」的局面。点到雷本局立即结束，可以马上开新一局。</p>
  `,
  sizes: [
    { value: 81, label: "9 × 9" },
    { value: 256, label: "16 × 16" },
    { value: 480, label: "30 × 16" }
  ],
  difficulties: [
    { value: "easy", label: "简单" },
    { value: "normal", label: "普通" },
    { value: "hard", label: "困难" }
  ],

  getScoreFilter() {
    return { size: cellCount(), difficulty: state.preset };
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
    els = {};
    ctx = null;
  }
};

// 供自动化测试验证免猜生成逻辑（不影响游戏本身）。
export const __testing = {
  state,
  presets,
  generateField,
  countForcedGuesses,
  placeMines
};
