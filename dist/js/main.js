// 外壳主控：游戏切换、计时与状态显示、共享弹窗接线。

import { createTimer } from "./core/timer.js";
import { formatElapsed, showToast } from "./core/utils.js";
import { initFirebase } from "./core/firebase.js";
import { initAccount } from "./core/account.js";
import { initVictory, showVictory } from "./core/victory.js";
import { initLeaderboard } from "./core/leaderboard.js";

import nonogram from "./games/nonogram.js";
import sudoku from "./games/sudoku.js";
import minesweeper from "./games/minesweeper.js";

const GAMES = [nonogram, sudoku, minesweeper];
const STORAGE_KEY = "gejian:lastGame";

const statusLabels = {
  idle: "未提交",
  generating: "生成中",
  active: "进行中",
  incorrect: "再检查",
  correct: "正确"
};

let currentGame = null;
let currentGameId = null;

// ---------------------------------------------------------------------------
// 计时与状态
// ---------------------------------------------------------------------------

const timerOutput = document.querySelector("#timer");
const timer = createTimer((seconds) => {
  timerOutput.textContent = formatElapsed(seconds);
});

const gameStatus = document.querySelector("#gameStatus");
function setStatus(tone, customLabel = null) {
  gameStatus.textContent = customLabel || statusLabels[tone] || tone;
  gameStatus.dataset.tone = tone;
}

// ---------------------------------------------------------------------------
// 游戏切换
// ---------------------------------------------------------------------------

function buildGameContext(game) {
  return {
    els: {
      controlPanel: document.querySelector("#controlPanel"),
      gameRoot: document.querySelector("#gameRoot"),
      boardToolbar: document.querySelector("#boardToolbar"),
      desktopTip: document.querySelector("#desktopTip")
    },
    timer,
    timerText: () => formatElapsed(timer.elapsed()),
    setStatus,
    setTitle(text) {
      document.querySelector("#boardTitle").textContent = text;
    },
    setPuzzleNumber(id) {
      document.querySelector("#puzzleNumber").textContent = `PUZZLE #${String(id).padStart(4, "0")}`;
    },
    toast: showToast,
    closeVictory() {
      const modal = document.querySelector("#victoryModal");
      if (modal.open) modal.close();
    },
    reportWin({ summary, score }) {
      setStatus("correct");
      showVictory({ summary, score: { ...score, game: game.id } });
    }
  };
}

function mountGame(gameId) {
  const game = GAMES.find((item) => item.id === gameId) || GAMES[0];
  if (currentGameId === game.id) return;

  if (currentGame) currentGame.unmount();
  timer.reset();
  setStatus("idle");

  currentGame = game;
  currentGameId = game.id;

  document.querySelectorAll("#gameSwitcher button").forEach((button) => {
    button.setAttribute("aria-selected", button.dataset.game === game.id ? "true" : "false");
  });
  document.querySelector("#brandSubtitle").textContent = game.subtitle;
  document.title = `格间 · ${game.name}`;
  document.querySelector("#howToTitle").textContent = game.howToTitle;
  document.querySelector("#howToContent").innerHTML = game.howTo;

  try {
    localStorage.setItem(STORAGE_KEY, game.id);
    history.replaceState(null, "", `#${game.id}`);
  } catch (_) {}

  game.mount(buildGameContext(game));
}

function initGameSwitcher() {
  const switcher = document.querySelector("#gameSwitcher");
  switcher.innerHTML = GAMES.map((game) => `
    <button type="button" role="tab" aria-selected="false" data-game="${game.id}">
      <span class="game-icon" aria-hidden="true">${game.icon || "▦"}</span>${game.name}
    </button>
  `).join("");
  switcher.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-game]");
    if (button) mountGame(button.dataset.game);
  });
}

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------

function initHowToModal() {
  const modal = document.querySelector("#howToModal");
  document.querySelector("#howToButton").addEventListener("click", () => modal.showModal());
  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => modal.close());
  });
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.close();
  });
}

initGameSwitcher();
initHowToModal();
initAccount();
initVictory({
  onNext: () => currentGame?.newGame()
});
initLeaderboard({
  games: GAMES,
  getActiveGame: () => currentGame
});

let initialGame = GAMES[0].id;
try {
  const fromHash = window.location.hash.replace("#", "");
  const saved = localStorage.getItem(STORAGE_KEY);
  if (GAMES.some((game) => game.id === fromHash)) initialGame = fromHash;
  else if (saved && GAMES.some((game) => game.id === saved)) initialGame = saved;
} catch (_) {}
mountGame(initialGame);

// Firebase 异步连接；失败时游戏照常可玩，仅登录与排行榜停用。
initFirebase().then((firebase) => {
  if (!firebase) showToast("登录与排行榜服务暂时不可用，游戏可正常进行");
});
